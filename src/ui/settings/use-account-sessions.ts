"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { AccountSession } from "@/lib/account-sessions.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { AccountSessionsError, listAccountSessions, revokeAccountSession } from "./account-sessions-client"

type View = { scope: string; current: AccountSession | null; others: AccountSession[]; cursor: string | null; phase: "loading" | "ready" | "error"; pending: boolean; reconciliationRequired: boolean; notice: "removed" | "unknown" | "rejected" | "conflict" | "notFound" | "forbidden" | null }
const empty: View = { scope: "", current: null, others: [], cursor: null, phase: "loading", pending: false, reconciliationRequired: false, notice: null }
/** Dialog-local identities retire every pending read/write; no persisted device list. */
export function useAccountSessions(open: boolean, preview: boolean, boundary?: ProjectReadBoundary) {
  const scope = open && !preview && boundary?.admitted && boundary.subject !== null ? JSON.stringify([boundary.subject, boundary.generation]) : ""
  const owner = useRef<{ scope: string; controller: AbortController; busy: boolean; cursors: Set<string>; reconciliationRequired: boolean } | null>(null)
  const committed = useRef(scope)
  const [view, setView] = useState<View>(empty)
  if (view.scope !== scope) setView({ ...empty, scope })
  useLayoutEffect(() => { committed.current = scope; if (owner.current?.scope !== scope) owner.current?.controller.abort() }, [scope])
  const active = (r: NonNullable<typeof owner.current>) => owner.current === r && committed.current === r.scope && !r.controller.signal.aborted
  async function load(r: NonNullable<typeof owner.current>, cursor?: string, notice: View["notice"] = null) {
    if (!active(r) || r.busy) return
    r.busy = true
    const loadingNotice = r.reconciliationRequired ? "unknown" : notice
    setView((v) => cursor ? { ...v, pending: true, notice: loadingNotice, reconciliationRequired: r.reconciliationRequired } : { ...empty, scope: r.scope, notice: loadingNotice, reconciliationRequired: r.reconciliationRequired })
    try {
      const page = await listAccountSessions(r.controller.signal, cursor)
      if (cursor && (view.current?.session_id !== page.data.current_session.session_id || page.data.sessions.some((item) => view.others.some((old) => old.session_id === item.session_id)))) throw new Error("Invalid page identity")
      if (cursor !== undefined && page.meta.next_cursor !== null && r.cursors.has(page.meta.next_cursor)) throw new Error("Repeated page cursor")
      if (cursor === undefined) r.cursors.clear()
      if (page.meta.next_cursor !== null) r.cursors.add(page.meta.next_cursor)
      if (!active(r)) return
      if (cursor === undefined) r.reconciliationRequired = false
      setView((v) => {
        if (cursor && (v.current?.session_id !== page.data.current_session.session_id || page.data.sessions.some((item) => v.others.some((old) => old.session_id === item.session_id)))) return { ...v, pending: false, phase: "error" }
        return { scope: r.scope, current: page.data.current_session, others: cursor ? [...v.others, ...page.data.sessions] : page.data.sessions, cursor: page.meta.next_cursor, phase: "ready", pending: false, reconciliationRequired: r.reconciliationRequired, notice: r.reconciliationRequired ? "unknown" : notice }
      })
    } catch { if (active(r)) setView((v) => ({ ...v, scope: r.scope, phase: "error", pending: false, reconciliationRequired: r.reconciliationRequired, notice: r.reconciliationRequired ? "unknown" : notice })) }
    finally { r.busy = false }
  }
  useEffect(() => {
    if (!scope) return
    const r = { scope, controller: new AbortController(), busy: false, cursors: new Set<string>(), reconciliationRequired: false }; owner.current = r
    void Promise.resolve().then(() => load(r))
    return () => r.controller.abort()
    // Only admitted identity and dialog lifetime own this operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  return {
    ...(view.scope === scope && scope ? view : empty), admitted: Boolean(scope),
    reload() { const r = owner.current; if (r) void load(r) },
    more() { const r = owner.current; if (r && view.cursor) void load(r, view.cursor) },
    async remove(id: string) {
      const r = owner.current
      if (!r || !active(r) || r.busy || r.reconciliationRequired || view.current?.session_id === id || !view.others.some((item) => item.session_id === id)) return
      r.busy = true; setView((v) => ({ ...v, pending: true, notice: null }))
      let notice: View["notice"] = "unknown"
      try { await revokeAccountSession(id, r.controller.signal); notice = "removed" }
      catch (error) {
        if (error instanceof AccountSessionsError && [400, 401, 403, 404, 409, 413, 429].includes(error.status)) {
          notice = error.status === 409 ? "conflict" : error.status === 404 ? "notFound" : [401, 403].includes(error.status) ? "forbidden" : "rejected"
        }
        // Unknown writes are never retried automatically.
      }
      finally { r.busy = false }
      if (!active(r)) return
      if (notice === "unknown") r.reconciliationRequired = true
      setView((v) => ({ ...v, pending: false, reconciliationRequired: r.reconciliationRequired, notice: r.reconciliationRequired ? "unknown" : notice }))
      if (notice === "removed") await load(r, undefined, notice)
    },
  }
}
