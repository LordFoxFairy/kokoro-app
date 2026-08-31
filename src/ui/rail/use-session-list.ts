// 会话清单服务端水合（SESS-LIST）：经 BFF 代理取 session GET /sessions（owner 隔离、
// updated_at desc、软删不出、复合游标分页）。localStorage 不再存清单——换浏览器见同一列表。
// refreshSignal 变化即重取首页（新会话落库/删除后由 shell 触发）。

import { useCallback, useEffect, useRef, useState } from "react"

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
  loadMore: () => void
}

function toEntry(item: SessionListItem): SessionListEntry {
  return { id: item.session_id, title: item.title, updatedAt: item.updated_at }
}

type Lister = Pick<SessionClient, "listSessions">

type ListState = {
  scopeKey: string
  entries: SessionListEntry[]
  cursor: string | undefined
  loading: boolean
  loadingMore: boolean
  error: boolean
}

const INITIAL: ListState = { scopeKey: "direct", entries: [], cursor: undefined, loading: true, loadingMore: false, error: false }

function scopeKey(scope: SessionScope): string {
  return scope.kind === "direct" ? "direct" : `project:${scope.projectRef}`
}

export function useSessionList(client: Lister, refreshSignal: number, scope: SessionScope = DIRECT_SESSION_SCOPE): SessionListView {
  const [state, setState] = useState<ListState>(INITIAL)
  const requestGenerationRef = useRef(0)
  const currentScopeKey = scopeKey(scope)

  // 首页取数（不含同步 setState 供 effect 直接调用，对齐 login-gate idiom）。
  const fetchFirst = useCallback(async (): Promise<ListState> => {
    try {
      const page = await client.listSessions(undefined, scope)
      return {
        scopeKey: currentScopeKey,
        entries: page.sessions.map(toEntry),
        cursor: page.next_cursor,
        loading: false,
        loadingMore: false,
        error: false,
      }
    } catch {
      return { scopeKey: currentScopeKey, entries: [], cursor: undefined, loading: false, loadingMore: false, error: true }
    }
  }, [client, currentScopeKey, scope])

  useEffect(() => {
    const generation = ++requestGenerationRef.current
    let live = true
    void fetchFirst().then((next) => {
      if (live && generation === requestGenerationRef.current) setState(next)
    })
    return () => {
      live = false
    }
  }, [currentScopeKey, fetchFirst, refreshSignal])

  const loadMore = useCallback(() => {
    const generation = requestGenerationRef.current
    const requestScopeKey = currentScopeKey
    setState((prev) => {
      if (prev.cursor === undefined || prev.loadingMore) {
        return prev
      }
      const cursor = prev.cursor
      void client
        .listSessions(cursor, scope)
        .then((page) => {
          if (generation !== requestGenerationRef.current) return
          setState((cur) => ({
            ...cur,
            scopeKey: requestScopeKey,
            entries: [...cur.entries, ...page.sessions.map(toEntry)],
            cursor: page.next_cursor,
            loadingMore: false,
          }))
        })
        .catch(() => {
          if (generation !== requestGenerationRef.current) return
          setState((cur) => ({ ...cur, scopeKey: requestScopeKey, loadingMore: false }))
        })
      return { ...prev, loadingMore: true }
    })
  }, [client, currentScopeKey, scope])

  const visibleState = state.scopeKey === currentScopeKey ? state : INITIAL

  return {
    entries: visibleState.entries,
    loading: visibleState.loading,
    loadingMore: visibleState.loadingMore,
    error: visibleState.error,
    hasMore: visibleState.cursor !== undefined,
    loadMore,
  }
}
