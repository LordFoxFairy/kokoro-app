"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { HubClient } from "@/hub/client"
import type { CustomApiProfile } from "@/hub/custom-api.schema"
import { HubClientError } from "@/hub/client"
import type { SessionEngine } from "@/engine/machine"
import { SERVER_ENGINE_SNAPSHOT } from "@/engine/machine"
import { customApiVersionIsSelectable } from "@/engine/custom-api-selection"
import type { CustomApiSelection } from "@/engine/custom-api-selection"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"
import { AUTH_INDEX_SUBJECT_KEY, readBrowserAuthIndexSubject } from "./page-clients"
export type ComposerCustomApi = { id: string; name: string; stateVersion: string; selectable?: boolean; icon?: CustomApiProfile["icon"] }
export type CustomApiDraftSelection = { context: object; selectedProfiles: readonly CustomApiSelection[]; isCurrent: () => boolean; update: (change: (values: readonly CustomApiSelection[]) => readonly CustomApiSelection[]) => void }
const empty = Object.freeze([])
const noop = () => () => undefined
const server = () => SERVER_ENGINE_SNAPSHOT
function matchesSubject(enforce: boolean, subject: string | null) {
  try { return !enforce || subject !== null && readBrowserAuthIndexSubject() === subject } catch { return false }
}
/** One current-owner profile list. No credential/description read or per-profile GET. */
export function useComposerCustomApis({ engine, client, boundary, enforceSubjectMarker, localDraft }: {
  engine: SessionEngine | null; client: Pick<HubClient, "listCustomApis">; boundary: ProjectReadBoundary; enforceSubjectMarker: boolean; localDraft?: CustomApiDraftSelection
}) {
  const report401 = useProductReadRecheck()
  const snapshot = useSyncExternalStore(engine?.subscribe ?? noop, engine?.getSnapshot ?? server, server)
  const { admitted, subject, generation } = boundary
  const candidate = localDraft ? undefined : snapshot.customApiSelectionRestore
  const [restoreEpoch, setRestoreEpoch] = useState(candidate)
  if (candidate && candidate !== restoreEpoch) setRestoreEpoch(candidate)
  const context = localDraft?.context
  const owner = useMemo(() => ({ engine, client, admitted, subject, generation, enforceSubjectMarker }), [engine, client, admitted, subject, generation, enforceSubjectMarker])
  const scope = useMemo(() => ({ owner, context, restoreEpoch }), [owner, context, restoreEpoch])
  const [request, setRequest] = useState({ scope, revision: 0, cursor: undefined as string | undefined })
  const [catalog, setCatalog] = useState<{ scope: typeof scope; revision: number; items: ComposerCustomApi[]; status: "loading" | "ready" | "error"; nextCursor?: string; complete: boolean }>({ scope, revision: -1, items: [], status: "loading", complete: false })
  const loadedCursors = useRef(new Set<string>())
  const currentScope = useRef<typeof scope | null>(null)
  const [retiredOwner, setRetiredOwner] = useState<typeof owner | null>(null)
  const draftRef = useRef(localDraft)
  useLayoutEffect(() => { draftRef.current = localDraft })
  const allowed = admitted && subject !== null && engine !== null && retiredOwner !== owner && matchesSubject(enforceSubjectMarker, subject)
  const active = request.scope === scope ? request : { scope, revision: 0, cursor: undefined }
  const current = useCallback(() => currentScope.current === scope && engine !== null && admitted && subject !== null && matchesSubject(enforceSubjectMarker, subject) && retiredOwner !== owner && (draftRef.current?.isCurrent() ?? true), [scope, engine, admitted, subject, enforceSubjectMarker, retiredOwner, owner])
  const restoring = (restoreEpoch?.profiles.length ?? 0) > 0
  useLayoutEffect(() => { currentScope.current = scope; loadedCursors.current = new Set(); return () => { if (currentScope.current === scope) currentScope.current = null } }, [scope])
  const previous = useRef(owner)
  useLayoutEffect(() => {
    if (previous.current !== owner) previous.current.engine?.setSelectedCustomApiProfiles?.([])
    previous.current = owner
    const retire = () => { if (!matchesSubject(enforceSubjectMarker, subject)) { setRetiredOwner(owner); engine?.setSelectedCustomApiProfiles?.([]); setCatalog(old => ({ ...old, items: [], status: "error", complete: false })) } }
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === AUTH_INDEX_SUBJECT_KEY) retire() }
    retire(); window.addEventListener("storage", storage)
    return () => window.removeEventListener("storage", storage)
  }, [owner, engine, enforceSubjectMarker, subject])
  useEffect(() => {
    if (!allowed || !client.listCustomApis) return
    let live = true
    const controller = new AbortController()
    const stillCurrent = () => live && !controller.signal.aborted && current()
    const timer = setTimeout(() => { if (stillCurrent()) { setCatalog(old => ({ scope, revision: active.revision, items: old.scope === scope ? old.items : [], status: "error", complete: false })); controller.abort() } }, 10_000)
    void (async () => {
      const seen = new Set<string>(), ids = new Set<string>(), items: ComposerCustomApi[] = []
      let cursor = restoring ? undefined : active.cursor, nextCursor: string | undefined
      for (let pages = 0; pages < 50; pages++) {
        const page = await client.listCustomApis!({ limit: 50, ...(cursor === undefined ? {} : { cursor }) }, controller.signal)
        if (!stillCurrent()) return
        for (const profile of page.items) {
          if (ids.has(profile.profile_id)) throw Error("Duplicate Custom API profile")
          ids.add(profile.profile_id)
          items.push({ id: profile.profile_id, stateVersion: profile.state_version, selectable: customApiVersionIsSelectable(profile.state_version), name: profile.name, ...(profile.icon ? { icon: profile.icon } : {}) })
        }
        nextCursor = page.page.next_cursor ?? undefined
        if (nextCursor !== undefined && (nextCursor === cursor || seen.has(nextCursor) || (!restoring && active.cursor !== undefined && loadedCursors.current.has(nextCursor)))) throw Error("Repeated Custom API cursor")
        if (!restoring || nextCursor === undefined) break
        seen.add(nextCursor); cursor = nextCursor
        if (pages === 49) throw Error("Custom API page budget exceeded")
      }
      if (!stillCurrent()) return
      if (active.cursor === undefined || restoring) loadedCursors.current.clear()
      else loadedCursors.current.add(active.cursor)
      setCatalog(old => {
        const prior = active.cursor === undefined || restoring || old.scope !== scope ? [] : old.items
        if (items.some(item => prior.some(value => value.id === item.id))) return { scope, revision: active.revision, items: prior, status: "error", complete: false }
        return { scope, revision: active.revision, items: [...prior, ...items], status: "ready", complete: nextCursor === undefined, ...(nextCursor ? { nextCursor } : {}) }
      })
    })().catch((error: unknown) => {
      if (!stillCurrent()) return
      if (error instanceof HubClientError && error.reason === "http" && error.status === 401) report401?.({ subject, generation, signal: controller.signal })
      setCatalog(old => ({ scope, revision: active.revision, items: old.scope === scope ? old.items : [], status: "error", complete: false }))
    }).finally(() => clearTimeout(timer))
    return () => { live = false; controller.abort(); clearTimeout(timer) }
  }, [scope, active.revision, active.cursor, allowed, client, report401, current, restoring, generation, subject])
  const same = allowed && catalog.scope === scope
  const items = same ? catalog.items : empty
  const status: "disabled" | "ready" | "loading" | "error" = !allowed || !client.listCustomApis ? "disabled" : same && catalog.revision === active.revision ? catalog.status : "loading"
  useEffect(() => {
    if (!candidate || localDraft || snapshot.hydrating || !current()) return
    if (candidate.profiles.length === 0) { engine?.restoreCustomApiSelection?.(candidate, []); return }
    if (!same || catalog.status !== "ready" || !catalog.complete || catalog.revision !== active.revision) return
    engine?.restoreCustomApiSelection?.(candidate, candidate.profiles.filter(value => catalog.items.some(item => item.id === value.profileId && item.stateVersion === value.expectedStateVersion)))
  })
  return {
    items, status,
    selectedProfiles: allowed ? localDraft ? localDraft.isCurrent() ? localDraft.selectedProfiles : empty : snapshot.selectedCustomApiProfiles ?? empty : empty,
    nextCursor: same ? catalog.nextCursor : undefined,
    refresh: () => { if (current() && status !== "loading") setRequest(previous => ({ scope, revision: previous.scope === scope ? previous.revision + 1 : 1, cursor: undefined })) },
    loadMore: () => { if (current() && status !== "loading" && same && catalog.nextCursor) setRequest(previous => ({ scope, revision: previous.scope === scope ? previous.revision + 1 : 1, cursor: catalog.nextCursor })) },
    toggle: (id: string) => {
      if (!current()) return
      const change = (original: readonly CustomApiSelection[]) => original.some(value => value.profileId === id) ? original.filter(value => value.profileId !== id) : original.length < 32 && items.some(item => item.id === id && item.selectable !== false) ? [...original, { profileId: id, expectedStateVersion: items.find(item => item.id === id)!.stateVersion }] : original
      if (localDraft) localDraft.update(change)
      else engine?.setSelectedCustomApiProfiles?.(change(engine.getSnapshot().selectedCustomApiProfiles ?? empty))
    },
  }
}
