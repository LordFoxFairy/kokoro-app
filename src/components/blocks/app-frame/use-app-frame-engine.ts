import { useEffect, useMemo, useSyncExternalStore } from "react"

import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import { type SessionEngine } from "@/engine/machine"
import { useSessionEngine } from "@/engine/use-session-engine"
import { browserEngine, retainBrowserEngine } from "@/ui/shell/page-clients"

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

  // Create and retain browser engines in the same committed effect. Render only
  // exposes this hook's committed lease when its mode/scope key still matches;
  // a suspended/aborted render therefore creates no cache, storage, hydrate, or
  // SSE resources, and a scope change cannot expose the previous engine.
  useEffect(() => {
    if (injectedEngine !== undefined) return
    const acquiredEngine = browserEngine({ preview, scope: sessionScope })
    if (acquiredEngine === null) return
    const release = retainBrowserEngine(acquiredEngine)
    const lease = Symbol("app-frame-browser-engine-lease")
    leaseStore.publish({ key: desiredBrowserEngineKey, engine: acquiredEngine, lease })
    return () => {
      release()
      leaseStore.clear(lease)
    }
  }, [desiredBrowserEngineKey, injectedEngine, leaseStore, preview, sessionScope])

  return {
    engine,
    sessionScope,
    machine,
    store,
    thread,
    pendingMode,
    staging,
    hydrating,
    connection,
    canSubmitMessage,
    activeId,
  }
}
