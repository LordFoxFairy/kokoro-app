// 会话清单服务端水合（SESS-LIST）：经 BFF 代理取 session GET /sessions（owner 隔离、
// updated_at desc、软删不出、复合游标分页）。localStorage 不再存清单——换浏览器见同一列表。
// refreshSignal 变化即重取首页（新会话落库/删除后由 shell 触发）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { SessionListItem } from "@/contract/http"
import type { SessionClient } from "@/engine/client"
import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"

type SessionListEntry = { id: string; title: string; updatedAt: string }

export type SessionListView = {
  entries: SessionListEntry[]
  loading: boolean
  loadingMore: boolean
  error: boolean
  hasMore: boolean
  settledFirstPage: { scopeKey: string; refreshSignal: number; requestGeneration: number; success: boolean } | null
  loadMore: () => void
}

function toEntry(item: SessionListItem): SessionListEntry {
  return { id: item.session_id, title: item.title, updatedAt: item.updated_at }
}

type Lister = Pick<SessionClient, "listSessions">
type SessionListPage = Awaited<ReturnType<Lister["listSessions"]>>

// Deduplicate only effect replay within one admitted hook lifecycle. A
// different mounted group or renewed admission must own a fresh request.
const firstPageInflight = new WeakMap<object, Map<unknown, Promise<SessionListPage>>>()

type ListState = {
  lifecycle: object | null
  identity: string
  scopeKey: string
  entries: SessionListEntry[]
  cursor: string | undefined
  loading: boolean
  loadingMore: boolean
  error: boolean
  settledFirstPage: SessionListView["settledFirstPage"]
}

const INITIAL: ListState = { lifecycle: null, identity: "", scopeKey: "direct", entries: [], cursor: undefined, loading: true, loadingMore: false, error: false, settledFirstPage: null }

function scopeKey(scope: SessionScope): string {
  return scope.kind === "direct" ? "direct" : `project:${scope.projectRef}`
}

function listFirstPage(client: Lister, key: unknown, scope: SessionScope): Promise<SessionListPage> {
  let byScope = firstPageInflight.get(client)
  if (byScope === undefined) {
    byScope = new Map()
    firstPageInflight.set(client, byScope)
  }
  const current = byScope.get(key)
  if (current !== undefined) return current

  const request = client.listSessions(undefined, scope)
  byScope.set(key, request)
  const clear = (): void => {
    if (byScope?.get(key) === request) byScope.delete(key)
  }
  void request.then(clear, clear)
  return request
}

export function useSessionList(
  client: Lister,
  refreshSignal: number,
  scope: SessionScope = DIRECT_SESSION_SCOPE,
  onFirstPageSettled?: (settled: NonNullable<SessionListView["settledFirstPage"]>) => void,
  readBoundary?: { identity: string; admitted: boolean },
): SessionListView {
  const admitted = readBoundary?.admitted ?? true
  const identity = readBoundary?.identity ?? ""
  const [state, setState] = useState<ListState>(INITIAL)
  const requestGenerationRef = useRef(0)
  const paginationFlightRef = useRef<{ generation: number } | null>(null)
  const currentScopeKey = scopeKey(scope)
  const lifecycle = useMemo(() => ({ admitted, client, scopeKey: currentScopeKey, identity }), [admitted, client, currentScopeKey, identity])
  // useMemo survives StrictMode effect replay, not real unmount/re-admission.
  const firstPageRequestKey = useMemo(() => ({ lifecycle, refreshSignal }), [lifecycle, refreshSignal])

  // 首页取数（不含同步 setState 供 effect 直接调用，对齐 login-gate idiom）。
  const fetchFirst = useCallback(async (requestGeneration: number): Promise<ListState> => {
    try {
      // The refresh signal is part of the in-flight identity. StrictMode mounts
      // with the same signal still deduplicate, while an explicit mutation
      // refresh can never reuse a request that started before its ACK.
      const page = await listFirstPage(client, firstPageRequestKey, scope)
      const settled = { scopeKey: currentScopeKey, refreshSignal, requestGeneration, success: true }
      return {
        lifecycle,
        identity,
        scopeKey: currentScopeKey,
        entries: page.sessions.map(toEntry),
        cursor: page.next_cursor === null ? undefined : page.next_cursor,
        loading: false,
        loadingMore: false,
        error: false,
        settledFirstPage: settled,
      }
    } catch {
      const settled = { scopeKey: currentScopeKey, refreshSignal, requestGeneration, success: false }
      return {
        lifecycle,
        identity,
        scopeKey: currentScopeKey,
        entries: [],
        cursor: undefined,
        loading: false,
        loadingMore: false,
        error: true,
        settledFirstPage: settled,
      }
    }
  }, [client, currentScopeKey, firstPageRequestKey, identity, lifecycle, refreshSignal, scope])

  useEffect(() => {
    const generation = ++requestGenerationRef.current
    let live = true
    if (!admitted) return () => { requestGenerationRef.current += 1 }
    void fetchFirst(generation).then((next) => {
      if (live && generation === requestGenerationRef.current) {
        onFirstPageSettled?.(next.settledFirstPage as NonNullable<SessionListView["settledFirstPage"]>)
        setState(next)
      }
    })
    return () => {
      live = false
      requestGenerationRef.current += 1
    }
  }, [admitted, currentScopeKey, fetchFirst, onFirstPageSettled, refreshSignal])

  const loadMore = useCallback(() => {
    if (!admitted || state.lifecycle !== lifecycle || state.identity !== identity || state.scopeKey !== currentScopeKey || state.cursor === undefined || state.loadingMore) return
    const generation = requestGenerationRef.current
    if (paginationFlightRef.current?.generation === generation) return
    const flight = { generation }
    paginationFlightRef.current = flight
    // Never dispatch I/O from a state updater: React may replay it. The
    // synchronous flight also fences repeated clicks before the next commit.
    setState((previous) => ({ ...previous, loadingMore: true }))
    void client.listSessions(state.cursor, scope).then((page) => {
      if (generation !== requestGenerationRef.current) return
      setState((current) => ({
        ...current,
        entries: [...current.entries, ...page.sessions.map(toEntry)],
        cursor: page.next_cursor === null ? undefined : page.next_cursor,
        loadingMore: false,
      }))
    }).catch(() => {
      if (generation !== requestGenerationRef.current) return
      setState((current) => ({ ...current, loadingMore: false }))
    }).finally(() => {
      if (paginationFlightRef.current === flight) paginationFlightRef.current = null
    })
  }, [admitted, client, currentScopeKey, identity, lifecycle, scope, state.cursor, state.identity, state.lifecycle, state.loadingMore, state.scopeKey])

  // Admission may be suspended while the Product session is rechecked. No
  // list request has failed in that state; keep private rows retired and wait.
  const visibleState = admitted && state.lifecycle === lifecycle && state.identity === identity && state.scopeKey === currentScopeKey ? state : INITIAL

  return {
    entries: visibleState.entries,
    loading: visibleState.loading,
    loadingMore: visibleState.loadingMore,
    error: visibleState.error,
    hasMore: visibleState.cursor !== undefined,
    settledFirstPage: visibleState.settledFirstPage,
    loadMore,
  }
}
