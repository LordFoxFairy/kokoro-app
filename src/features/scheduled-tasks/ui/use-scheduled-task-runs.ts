"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import type { ScheduledTaskRunPage, ScheduledTaskRunsReader } from "../model/scheduled-task-run"

type RunsState = Readonly<{ scope: object; phase: "idle" | "loading" | "ready" | "error"; page: ScheduledTaskRunPage | null }>

/** A page belongs to one mounted read scope; cancelled promises can never revive it. */
export function useScheduledTaskRuns(reader: ScheduledTaskRunsReader | undefined, enabled: boolean, taskId: string | undefined) {
  const scope = useMemo(() => ({ reader, enabled, taskId }), [reader, enabled, taskId])
  const [state, setState] = useState<RunsState>({ scope, phase: "idle", page: null })
  const active = useRef<object | null>(null)
  const pending = useRef<AbortController | null>(null)
  const sequence = useRef(0)

  useLayoutEffect(() => {
    active.current = scope
    return () => {
      active.current = null
      sequence.current += 1
      pending.current?.abort()
      pending.current = null
    }
  }, [scope])

  const read = useCallback(async (cursor?: string) => {
    if (!enabled || !reader || active.current !== scope || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const request = ++sequence.current
    const isCurrent = () => active.current === scope && sequence.current === request && !controller.signal.aborted
    setState({ scope, phase: "loading", page: null })
    try {
      const page = await reader({ limit: 20, ...(taskId === undefined ? {} : { taskId }), ...(cursor === undefined ? {} : { cursor }) }, controller.signal)
      if (isCurrent()) setState({ scope, phase: "ready", page })
    } catch {
      if (isCurrent()) setState({ scope, phase: "error", page: null })
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }, [enabled, reader, scope, taskId])

  useEffect(() => { queueMicrotask(() => void read()) }, [read])
  const visible = state.scope === scope ? state : { scope, phase: "idle" as const, page: null }
  return { ...visible, refresh: () => void read(), next: () => { if (visible.page?.nextCursor) void read(visible.page.nextCursor) } }
}
