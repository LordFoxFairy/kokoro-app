import { useEffect, useMemo, useRef } from "react"

import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"
import { type SessionEngine } from "@/engine/machine"
import { useSessionEngine } from "@/engine/use-session-engine"
import { browserEngine, releaseBrowserEngine } from "@/ui/shell/page-clients"

export type AppFrameEngineOptions = {
  injectedEngine: SessionEngine | null | undefined
  preview: boolean
  projectRef: string | undefined
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
  const engine = injectedEngine !== undefined ? injectedEngine : browserEngine({ preview, scope: sessionScope })
  const snapshot = useSessionEngine(engine)
  const { machine, store, thread, pendingMode, staging, hydrating } = snapshot
  const activeId = store?.activeId ?? null

  // A project/direct route change replaces the scope-owned engine while this
  // AppFrame stays mounted. Close the old scope immediately so its SSE,
  // storage subscription, and reattach timers cannot accumulate behind the
  // current rail selection. Injected test engines remain caller-owned.
  const browserEngineRef = useRef<SessionEngine | null>(engine)
  const browserEngineMountedRef = useRef(false)
  useEffect(() => {
    if (injectedEngine !== undefined) return
    const previous = browserEngineRef.current
    if (previous !== engine) {
      releaseBrowserEngine(previous)
    }
    browserEngineMountedRef.current = true
    browserEngineRef.current = engine
    return () => {
      // React Strict Mode deliberately runs effect cleanup/setup once during
      // development. Defer unmount disposal by one macrotask so that probe
      // cleanup does not dispose the engine that the immediately-following
      // setup is about to reuse. A real unmount has no setup to cancel it.
      browserEngineMountedRef.current = false
      window.setTimeout(() => {
        if (browserEngineMountedRef.current || engine !== browserEngineRef.current) return
        releaseBrowserEngine(engine)
        browserEngineRef.current = null
      }, 0)
    }
  }, [engine, injectedEngine])

  return {
    engine,
    sessionScope,
    machine,
    store,
    thread,
    pendingMode,
    staging,
    hydrating,
    activeId,
  }
}
