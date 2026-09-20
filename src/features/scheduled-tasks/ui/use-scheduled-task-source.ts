"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ScheduledTaskRecord } from "../model/scheduled-task"
import { usePreviewTasks } from "./preview-task-store"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"

export function useScheduledTaskSource(runtime: ScheduledTaskRuntime) {
  const fixtureMode = runtime.mode === "preview"
  const controlledTasks = runtime.mode === "controlled" ? runtime.tasks : undefined
  const client = runtime.mode === "live" ? runtime.client : undefined
  const previewTasks = usePreviewTasks(fixtureMode)
  const [remoteTasks, setRemoteTasks] = useState<ScheduledTaskRecord[]>([])
  const [loading, setLoading] = useState(!fixtureMode && controlledTasks === undefined)
  const [loadError, setLoadError] = useState(false)
  const requestSequence = useRef(0)

  const loadTasks = useCallback(async () => {
    if (fixtureMode || controlledTasks !== undefined) return
    const sequence = ++requestSequence.current
    await Promise.resolve()
    if (sequence !== requestSequence.current) return
    setLoading(true)
    setLoadError(false)
    try {
      if (client === undefined || client === null) throw new Error("Scheduled task client is not configured")
      const next = await client.listScheduledTasks()
      if (sequence === requestSequence.current) setRemoteTasks([...next])
    } catch {
      if (sequence === requestSequence.current) setLoadError(true)
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [client, controlledTasks, fixtureMode])

  useEffect(() => {
    if (fixtureMode || controlledTasks !== undefined) {
      requestSequence.current += 1
      return
    }
    queueMicrotask(() => void loadTasks())
    return () => {
      requestSequence.current += 1
    }
  }, [controlledTasks, fixtureMode, loadTasks])

  const displayedTasks = useMemo(
    () => controlledTasks ?? (fixtureMode ? previewTasks : remoteTasks),
    [controlledTasks, fixtureMode, previewTasks, remoteTasks],
  )

  return { displayedTasks, loading, loadError, loadTasks }
}
