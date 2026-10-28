import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react"

import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import type { MessagePartsReadTarget } from "@/engine/engine-types"
import { conversationIdFromLocation } from "./app-frame-helpers"
import { type SessionEngine } from "@/engine/machine"
import { useSessionEngine } from "@/engine/use-session-engine"
import { browserConversationMoveCoordinator, browserEngine, retainBrowserEngine } from "@/ui/shell/page-clients"

export type AppFrameEngineOptions = {
  injectedEngine: SessionEngine | null | undefined
  preview: boolean
  projectRef: string | undefined
}

type CommittedBrowserEngine = {
  key: string
  engine: SessionEngine
  lease: symbol
}

function createBrowserEngineLeaseStore() {
  let snapshot: CommittedBrowserEngine | null = null
  const listeners = new Set<() => void>()
  const publish = (next: CommittedBrowserEngine | null): void => {
    if (snapshot === next) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    publish,
    clear: (lease: symbol) => {
      if (snapshot?.lease === lease) publish(null)
    },
  }
}

/** Owns the page-level engine instance and its scope transition lifecycle. */
export function useAppFrameEngine({
  injectedEngine,
  preview,
  projectRef,
}: AppFrameEngineOptions) {
  const sessionScope = useMemo<SessionScope>(
    () => projectRef ? { kind: "project", projectRef } : DIRECT_SESSION_SCOPE,
    [projectRef],
  )
  const desiredBrowserEngineKey = `${preview ? "preview" : "live"}:${sessionScopeKey(sessionScope)}`
  const leaseStore = useMemo(() => createBrowserEngineLeaseStore(), [])
  const committedBrowserEngine = useSyncExternalStore(
    leaseStore.subscribe,
    leaseStore.getSnapshot,
    () => null,
  )
  const engine = injectedEngine !== undefined
    ? injectedEngine
    : committedBrowserEngine?.key === desiredBrowserEngineKey ? committedBrowserEngine.engine : null
  const snapshot = useSessionEngine(engine)
  const { machine, store, thread, pendingMode, staging, hydrating, connection, canSubmitMessage } = snapshot
  const activeId = store?.activeId ?? null
  const readTargetFromLocation = useCallback((): MessagePartsReadTarget | null => {
    const scopePath = sessionScope.kind === "project" ? `/app/project/${encodeURIComponent(sessionScope.projectRef)}` : "/app"
    if (window.location.pathname.replace(/\/$/u, "") !== scopePath) return null
    const conversationId = conversationIdFromLocation()
    return conversationId === null ? null : { scope: sessionScope, conversationId }
  }, [sessionScope])
  const updateReadTarget = useCallback(() => {
    if (!engine) return
    if (!engine.setMessagePartsReadTarget) {
      if (injectedEngine === undefined) throw new Error("Canonical Message parts read boundary missing")
      return
    }
    engine.setMessagePartsReadTarget(readTargetFromLocation())
  }, [engine, injectedEngine, readTargetFromLocation])
  // A committed route render retires the old body reader before paint; metadata/run ownership stays mounted.
  useLayoutEffect(() => { updateReadTarget() })
  useLayoutEffect(() => {
    if (!engine) return
    window.addEventListener("popstate", updateReadTarget)
    window.addEventListener("hashchange", updateReadTarget)
    window.addEventListener("kokoro:surface-navigation", updateReadTarget)
    return () => {
      window.removeEventListener("popstate", updateReadTarget)
      window.removeEventListener("hashchange", updateReadTarget)
      window.removeEventListener("kokoro:surface-navigation", updateReadTarget)
      engine.setMessagePartsReadTarget?.(null)
    }
  }, [engine, updateReadTarget])

  // Create and retain browser engines in the same committed effect. Render only
  // exposes this hook's committed lease when its mode/scope key still matches;
  // a suspended/aborted render therefore creates no cache, storage, hydrate, or
  // SSE resources, and a scope change cannot expose the previous engine.
  useEffect(() => {
    if (injectedEngine !== undefined) return
    let active = true
    let held: { release: () => void; lease: symbol } | null = null
    const acquire = () => {
      if (!active || held !== null) return
      const acquiredEngine = browserEngine({ preview, scope: sessionScope, messagePartsReadTarget: readTargetFromLocation() })
      if (acquiredEngine === null) return
      const release = retainBrowserEngine(acquiredEngine)
      const lease = Symbol("app-frame-browser-engine-lease")
      held = { release, lease }
      leaseStore.publish({ key: desiredBrowserEngineKey, engine: acquiredEngine, lease })
    }
    // Notification is only a wake-up: the factory rechecks true admission.
    // Subscribe before the first attempt, never replace an already held lease.
    const unsubscribe = preview ? () => undefined : browserConversationMoveCoordinator().subscribe(acquire)
    acquire()
    return () => {
      active = false
      unsubscribe()
      if (held === null) return
      held.release()
      leaseStore.clear(held.lease)
    }
  }, [desiredBrowserEngineKey, injectedEngine, leaseStore, preview, sessionScope, readTargetFromLocation])

  return {
    engine,
    sessionScope,
    machine,
    store,
    thread,
    pendingMode,
    staging,
    hydrating,
    ...(snapshot.missingSessionId === undefined ? {} : { missingSessionId: snapshot.missingSessionId }),
    connection,
    canSubmitMessage,
    activeId,
  }
}
