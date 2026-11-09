"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

import type { ScheduledExecutionPage } from "../model/scheduled-task"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"

export function useScheduledExecutions(runtime: ScheduledTaskRuntime, active: boolean,
  boundary?: ProjectReadBoundary, projectId?: string, validFilter = true) {
  const client = runtime.mode === "live" ? runtime.client : null
  const admitted = boundary?.admitted ?? true
  const generation = boundary?.generation
  const scope = useMemo(() => ({ client, admitted, generation, projectId, validFilter, active }),
    [client, admitted, generation, projectId, validFilter, active])
  const [result, setResult] = useState<{ scope: typeof scope; page: ScheduledExecutionPage; error: boolean } | null>(null)
  const [pending, setPending] = useState<typeof scope | null>(null)
  const current = useRef(scope)
  const request = useRef<AbortController | null>(null)
  useLayoutEffect(() => {
    current.current = scope
    return () => { request.current?.abort(); request.current = null }
  }, [scope])
  const page = result?.scope === scope ? result.page : null
  const load = useCallback(async (cursor?: string) => {
    if (!active || !admitted || !validFilter || !client || request.current) return
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const isCurrent = () => current.current === scope && request.current === controller
    setPending(scope)
    try {
      const next = await client.listScheduledExecutions({ ...(projectId === undefined ? {} : { projectId }),
        ...(cursor === undefined ? {} : { cursor }), signal: controller.signal })
      if (!isCurrent() || controller.signal.aborted) return
      setResult(previous => {
        const prior = cursor !== undefined && previous?.scope === scope ? previous.page.executions : []
        const rows = new Map(prior.map(item => [item.id, item]))
        for (const item of next.executions) rows.set(item.id, item)
        return { scope, page: { executions: [...rows.values()], nextCursor: next.nextCursor }, error: false }
      })
    } catch {
      if (isCurrent()) setResult(previous => ({ scope, error: true,
        page: previous?.scope === scope ? previous.page : { executions: [], nextCursor: null } }))
    } finally {
      clearTimeout(timeout)
      if (isCurrent()) { setPending(null); request.current = null }
    }
  }, [active, admitted, client, projectId, scope, validFilter])
  useEffect(() => {
    if (active && admitted && validFilter && client) queueMicrotask(() => { if (current.current === scope) void load() })
  }, [active, admitted, client, load, scope, validFilter])
  return { page, loading: pending === scope || (active && page === null && !!client && admitted && validFilter),
    error: result?.scope === scope && result.error, available: !!client && admitted && validFilter,
    refresh: () => load(), loadMore: () => page?.nextCursor ? load(page.nextCursor) : Promise.resolve() }
}
