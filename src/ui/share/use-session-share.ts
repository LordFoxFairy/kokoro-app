"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { SessionClientError, type SessionClient } from "@/engine/client"
import { sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import type { SessionShareMetadata } from "@/lib/shared-tasks.schema"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import { useProductReadRecheck } from "@/ui/auth/product-read-recheck-context"

type Share = SessionShareMetadata["share"]
export type SessionShareClient = Pick<SessionClient, "readShare" | "createShare" | "revokeShare">
type View = { open: boolean; status: "unknown" | "reading" | "ready" | "error"; share: Share; command: "create" | "revoke" | null; commandError: boolean; reading: boolean; pendingCommand: "create" | "revoke" | null }
const empty: View = { open: false, status: "unknown", share: null, command: null, commandError: false, reading: false, pendingCommand: null }
type Operation = { controller: AbortController; timer: ReturnType<typeof setTimeout>; deadline: number }
type Intent = { kind: "create" | "revoke"; key: string };
type Owner = { identity: object; retired: boolean; generation: number; admitted: boolean; value: View; operation: Operation | null; intent: Intent | null }

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
  const tenant = boundary?.tenant
  const [verifiedOwner, setVerifiedOwner] = useState<{ subject: string | null; tenant: string | undefined } | null>(
    () => available ? { subject, tenant } : null,
  )
  if (available && (verifiedOwner === null || verifiedOwner.subject !== subject || verifiedOwner.tenant !== tenant)) {
    setVerifiedOwner({ subject, tenant })
  }
  // Unavailable admission can omit tenant without changing the last verified actor.
  // Retain only that owner's uncertain intent, never its locator or read/write admission.
  const identityTenant = !available && tenant === undefined && verifiedOwner?.subject === subject ? verifiedOwner.tenant : tenant
  const identity = useMemo(() => ({ client, sessionId, scopeKey, subject, tenant: identityTenant, preview }), [client, sessionId, scopeKey, subject, identityTenant, preview])
  const readIdentity = useMemo(() => ({ identity, generation, available }), [identity, generation, available])
  const owner = useRef<Owner | null>(null)
  const [state, setState] = useState<{ identity: object; readIdentity: object; value: View }>({ identity, readIdentity, value: empty })
  const current = (x: Owner) => owner.current === x && !x.retired && x.identity === identity && available && x.admitted && x.generation === generation
  const publish = (x: Owner, value: View) => {
    if (!current(x)) return
    value = { ...value, pendingCommand: x.intent?.kind ?? null }
    x.value = value
    setState({ identity: x.identity, readIdentity, value })
  }
  const stop = (x: Owner) => {
    const operation = x.operation
    x.operation = null
    if (operation) { clearTimeout(operation.timer); operation.controller.abort() }
  }
  useLayoutEffect(() => {
    const x: Owner = { identity, retired: false, generation: 0, admitted: false, value: empty, operation: null, intent: null }
    owner.current = x
    return () => { x.retired = true; stop(x); if (owner.current === x) owner.current = null }
  }, [identity])
  // Read admission can retire without discarding this actor's uncertain original command.
  useLayoutEffect(() => {
    const x = owner.current
    if (!x || x.identity !== identity) return
    stop(x); x.generation = generation; x.admitted = available; x.value = empty
  }, [identity, generation, available])
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
  const command = async (kind: "create" | "revoke", expectedShareId?: string, retry = false) => {
    const x = owner.current
    if (!x || !current(x) || !x.value.open || (retry ? x.intent === null : x.intent !== null || x.value.status !== "ready" ||
      (kind === "create" ? x.value.share !== null : x.value.share === null || x.value.share.share_id !== expectedShareId))) return false
    const operation = begin(x)
    if (!operation) return false
    const intent = x.intent ?? { kind, key: `session-mutation:${crypto.randomUUID()}` }
    x.intent = intent
    publish(x, { ...x.value, command: intent.kind, commandError: false, reading: false })
    let failed = false
    try {
      try {
        await within(operation, intent.kind === "create"
          ? client.createShare(sessionId, operation.controller.signal, scope, intent.key)
          : client.revokeShare(sessionId, operation.controller.signal, scope, intent.key))
        if (!current(x) || x.operation !== operation) return false
        x.intent = null
      } catch { failed = true }
      if (!live(x, operation)) return false
      const confirmed = await readInto(x, operation, failed)
      return confirmed && !failed && intent.kind === "revoke" && x.value.share === null
    } finally { finish(x, operation) }
  }
  useEffect(() => {
    const reread = () => { if (document.visibilityState === "visible") void reload() }
    window.addEventListener("focus", reread)
    document.addEventListener("visibilitychange", reread)
    return () => { window.removeEventListener("focus", reread); document.removeEventListener("visibilitychange", reread) }
  })
  const value = state.identity === identity && state.readIdentity === readIdentity && available ? state.value : empty
  return {
    ...value, available, scopeToken: readIdentity, setOpen, reload,
    create: () => command("create"), revoke: (shareId: string) => command("revoke", shareId),
    retryCommand: () => { const intent = owner.current?.intent; return intent ? command(intent.kind, undefined, true) : Promise.resolve(false) },
    isCurrent: (token: object, shareId?: string) => {
      const x = owner.current
      return !!x && current(x) && token === readIdentity && x.value.open &&
        (shareId === undefined || x.value.status === "ready" && x.value.share?.share_id === shareId)
    },
  }
}
