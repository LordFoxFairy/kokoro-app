"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

import type { ScheduledTaskRecord } from "../model/scheduled-task"
import { usePreviewTasks } from "./preview-task-store"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"

export function useScheduledTaskSource(
  runtime: ScheduledTaskRuntime,
  boundary?: ProjectReadBoundary,
) {
  const admitted = boundary?.admitted ?? true
  const generation = boundary?.generation
  const fixtureMode = runtime.mode === "preview"
  const controlledTasks =
    runtime.mode === "controlled" ? runtime.tasks : undefined
  const client = runtime.mode === "live" ? runtime.client : undefined
  const previewTasks = usePreviewTasks(fixtureMode)
  const [remoteTasks, setRemoteTasks] = useState<ScheduledTaskRecord[]>([])
  const [loading, setLoading] = useState(
    !fixtureMode && controlledTasks === undefined,
  )
  const [loadError, setLoadError] = useState(false)
  const requestSequence = useRef(0)
  const current = useRef({ admitted, generation })
  useLayoutEffect(() => {
    current.current = { admitted, generation }
  }, [admitted, generation])

  const loadTasks = useCallback(async () => {
    if (!admitted || fixtureMode || controlledTasks !== undefined) return
    const sequence = ++requestSequence.current
    const isCurrent = () =>
      sequence === requestSequence.current &&
      current.current.admitted &&
      current.current.generation === generation
    await Promise.resolve()
    if (!isCurrent()) return
    setLoading(true)
    setLoadError(false)
    try {
      if (client === undefined || client === null)
        throw new Error("Scheduled task client is not configured")
      const next = await client.listScheduledTasks()
      if (isCurrent()) setRemoteTasks([...next])
    } catch {
      if (isCurrent()) setLoadError(true)
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [admitted, client, controlledTasks, fixtureMode, generation])

  useEffect(() => {
    if (!admitted || fixtureMode || controlledTasks !== undefined) {
      requestSequence.current += 1
      return
    }
    queueMicrotask(() => void loadTasks())
    return () => {
      requestSequence.current += 1
    }
  }, [admitted, controlledTasks, fixtureMode, loadTasks])

  const displayedTasks = useMemo(
    () => controlledTasks ?? (fixtureMode ? previewTasks : remoteTasks),
    [controlledTasks, fixtureMode, previewTasks, remoteTasks],
  )

  return { displayedTasks, loading, loadError, loadTasks }
}
