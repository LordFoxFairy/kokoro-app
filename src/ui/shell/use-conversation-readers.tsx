"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import { useConversationList, type ConversationListController } from "./use-conversation-list"

type ReaderOptions = Parameters<typeof useConversationList>[0]
type Publication = { owner: symbol; controller: ConversationListController }

/** References only. The keyed hook host remains the sole owner of list state. */
function createReaderRegistry(identity: string, admitted: boolean) {
  let snapshot: ReadonlyMap<string, Publication> = new Map()
  const listeners = new Set<() => void>()
  const publish = (next: ReadonlyMap<string, Publication>) => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    identity, admitted,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    register(key: string, owner: symbol, controller: ConversationListController) {
      const previous = snapshot.get(key)
      if (previous?.owner === owner && previous.controller === controller) return
      const next = new Map(snapshot)
      next.set(key, { owner, controller })
      publish(next)
    },
    retire(key: string, owner: symbol) {
      if (snapshot.get(key)?.owner !== owner) return
      const next = new Map(snapshot)
      next.delete(key)
      publish(next)
    },
  }
}

function ConversationReader({ registry, scope, ...options }: ReaderOptions & {
  registry: ReturnType<typeof createReaderRegistry>
  scope: SessionScope
}) {
  const controller = useConversationList({ ...options, scope })
  const owner = useRef(Symbol("conversation-reader"))
  const key = sessionScopeKey(scope)
  useLayoutEffect(() => {
    registry.register(key, owner.current, controller)
  }, [controller, key, registry])
  useLayoutEffect(() => {
    const token = owner.current
    return () => { registry.retire(key, token) }
  }, [key, registry])
  return null
}

/** One reader per visited scope for this shell, never a cross-user data cache. */
export function useConversationReaders(options: Omit<ReaderOptions, "scope" | "scopeRevision" | "readBoundary"> & {
  scope: SessionScope
  scopeVersions: ReadonlyMap<string, number>
  readBoundary: { identity: string; admitted: boolean }
}) {
  const { scope: activeScope, scopeVersions, readBoundary, ...shared } = options
  const { identity, admitted } = readBoundary
  // A changed admission boundary cannot expose even one frame of old facts.
  const registry = useMemo(() => createReaderRegistry(identity, admitted), [identity, admitted])
  const snapshot = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  const [visited, setVisited] = useState(() => ({ identity, scopes: [DIRECT_SESSION_SCOPE] }))
  const activeKey = sessionScopeKey(activeScope)
  let scopes = visited.identity === identity ? visited.scopes : [DIRECT_SESSION_SCOPE]
  if (!scopes.some((scope) => sessionScopeKey(scope) === activeKey)) scopes = [...scopes, activeScope]
  if (visited.identity !== identity || scopes !== visited.scopes) setVisited({ identity, scopes })

  const ensureScope = useCallback((scope: SessionScope) => {
    if (!admitted) return
    setVisited((previous) => {
      const scopes = previous.identity === identity ? previous.scopes : [DIRECT_SESSION_SCOPE]
      if (scopes.some((entry) => sessionScopeKey(entry) === sessionScopeKey(scope))) return previous
      return { identity, scopes: [...scopes, scope] }
    })
  }, [admitted, identity])
  const read = useCallback((scope: SessionScope) => snapshot.get(sessionScopeKey(scope))?.controller, [snapshot])

  return {
    read,
    ensureScope,
    hosts: scopes.map((scope) => {
      const key = sessionScopeKey(scope)
      const current = key === activeKey
      return <ConversationReader key={JSON.stringify([registry.identity, registry.admitted, key])} {...shared} registry={registry} scope={scope}
        engine={current ? shared.engine : null}
        activeId={current ? shared.activeId : null}
        isStreaming={current && shared.isStreaming}
        observeRunStatus={current && shared.observeRunStatus !== false}
        readBoundary={readBoundary} scopeRevision={scopeVersions.get(key) ?? 0}
      />
    }),
  }
}
