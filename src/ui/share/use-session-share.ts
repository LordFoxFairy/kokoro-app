"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { SessionClientError, type SessionClient } from "@/engine/client"
import { sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import type { SessionShareMetadata } from "@/generated/bff-session-share-metadata"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"

type Share = SessionShareMetadata["share"]
export type SessionShareClient = Pick<SessionClient, "readShare" | "createShare" | "revokeShare">
type View = { open: boolean; status: "unknown" | "reading" | "ready" | "error"; share: Share; command: "create" | "revoke" | null; commandError: boolean; reading: boolean }
const empty: View = { open: false, status: "unknown", share: null, command: null, commandError: false, reading: false }
type Operation = { controller: AbortController; timer: ReturnType<typeof setTimeout>; deadline: number }
type Owner = { identity: object; retired: boolean; value: View; operation: Operation | null }

function within<T>(operation: Operation, pending: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const signal = operation.controller.signal
    const clear = () => signal.removeEventListener("abort", abort)
    const abort = () => { clear(); reject(Error("Share operation retired")) }
    signal.addEventListener("abort", abort, { once: true })
    pending.then(value => { clear(); resolve(value) }, error => { clear(); reject(error) })
    if (signal.aborted) abort()
  })
}

/** Metadata is only a read projection. Neither a mutation ACK nor a cached link is current authority. */
export function useSessionShare({ client, sessionId, scope, boundary, preview }: {
  client: SessionShareClient; sessionId: string; scope: SessionScope; boundary?: ProjectReadBoundary; preview: boolean
}) {
  const recheck = useProductReadRecheck()
  const subject = boundary?.subject ?? null, generation = boundary?.generation ?? 0
  const available = !preview && boundary?.admitted === true && subject !== null && subject.length > 0
  const scopeKey = sessionScopeKey(scope)
  const identity = useMemo(() => ({ client, sessionId, scopeKey, subject, generation, available, preview }), [client, sessionId, scopeKey, subject, generation, available, preview])
  const owner = useRef<Owner | null>(null)
  const [state, setState] = useState<{ identity: object; value: View }>({ identity, value: empty })
  const current = (x: Owner) => owner.current === x && !x.retired && x.identity === identity && available
  const publish = (x: Owner, value: View) => {
    if (!current(x)) return
    x.value = value
    setState({ identity: x.identity, value })
  }
  const stop = (x: Owner) => {
    const operation = x.operation
    x.operation = null
    if (operation) { clearTimeout(operation.timer); operation.controller.abort() }
  }
  useLayoutEffect(() => {
    const x: Owner = { identity, retired: false, value: empty, operation: null }
    owner.current = x
    return () => { x.retired = true; stop(x); if (owner.current === x) owner.current = null }
  }, [identity])
  const begin = (x: Owner) => {
    if (!current(x) || x.operation !== null) return null
    const controller = new AbortController()
    const operation = { controller, deadline: performance.now() + 10_000, timer: setTimeout(() => controller.abort(), 10_000) }
    x.operation = operation
    return operation
  }
  const live = (x: Owner, operation: Operation) => current(x) && x.operation === operation && !operation.controller.signal.aborted && performance.now() < operation.deadline
  const readInto = async (x: Owner, operation: Operation, commandError = false) => {
    publish(x, { ...x.value, status: x.value.status === "error" ? "error" : "reading", share: null, commandError, reading: true })
    try {
      const result = await within(operation, client.readShare(sessionId, { scope, signal: operation.controller.signal }))
      if (!live(x, operation)) return false
      publish(x, { ...x.value, status: "ready", share: result.share, command: null, commandError, reading: false })
      return true
    } catch (error) {
      if (live(x, operation) && error instanceof SessionClientError && error.status === 401 && recheck) {
        try { await within(operation, Promise.resolve(recheck({ subject, generation, signal: operation.controller.signal }))) } catch { /* Read errors never grant admission. */ }
      }
      if (current(x) && x.operation === operation) publish(x, { ...x.value, status: "error", share: null, command: null, commandError, reading: false })
      return false
    }
  }
  const finish = (x: Owner, operation: Operation) => {
    clearTimeout(operation.timer)
    if (current(x) && x.operation === operation && (operation.controller.signal.aborted || performance.now() >= operation.deadline)) publish(x, { ...x.value, status: "error", share: null, command: null, reading: false })
    if (x.operation === operation) x.operation = null
    operation.controller.abort()
  }
  const reload = async () => {
    const x = owner.current
    if (!x || !x.value.open) return
    const operation = begin(x)
    if (!operation) return
    try { await readInto(x, operation) } finally { finish(x, operation) }
  }
  const setOpen = (open: boolean) => {
    const x = owner.current
    if (!x || !current(x)) return
    if (!open) {
      stop(x)
      publish(x, { ...empty, open: false })
    } else if (!x.value.open) {
      publish(x, { ...empty, open: true })
      void reload()
    }
  }
  const command = async (kind: "create" | "revoke", expectedShareId?: string) => {
    const x = owner.current
    if (!x || !current(x) || !x.value.open || x.value.status !== "ready" ||
      (kind === "create" ? x.value.share !== null : x.value.share === null || x.value.share.share_id !== expectedShareId)) return false
    const operation = begin(x)
    if (!operation) return false
    publish(x, { ...x.value, command: kind, commandError: false, reading: false })
    let failed = false
    try {
      try {
        await within(operation, kind === "create" ? client.createShare(sessionId, operation.controller.signal, scope) : client.revokeShare(sessionId, operation.controller.signal, scope))
      } catch { failed = true }
      if (!live(x, operation)) return false
      const confirmed = await readInto(x, operation, failed)
      return confirmed && !failed && kind === "revoke" && x.value.share === null
    } finally { finish(x, operation) }
  }
  useEffect(() => {
    const reread = () => { if (document.visibilityState === "visible") void reload() }
    window.addEventListener("focus", reread)
    document.addEventListener("visibilitychange", reread)
    return () => { window.removeEventListener("focus", reread); document.removeEventListener("visibilitychange", reread) }
  })
  const value = state.identity === identity && available ? state.value : empty
  return {
    ...value, available, scopeToken: identity, setOpen, reload,
    create: () => command("create"), revoke: (shareId: string) => command("revoke", shareId),
    isCurrent: (token: object, shareId?: string) => {
      const x = owner.current
      return !!x && current(x) && token === identity && x.value.open &&
        (shareId === undefined || x.value.status === "ready" && x.value.share?.share_id === shareId)
    },
  }
}
