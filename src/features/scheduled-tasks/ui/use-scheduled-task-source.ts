"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ScheduledTaskClient, ScheduledTaskRecord } from "../model/scheduled-task"
import { usePreviewTasks } from "./preview-task-store"

type ScheduledTaskSourceOptions = {
  fixtureMode: boolean
  controlledTasks?: readonly ScheduledTaskRecord[]
  client?: ScheduledTaskClient
}

export function useScheduledTaskSource({ fixtureMode, controlledTasks, client }: ScheduledTaskSourceOptions) {
  const previewTasks = usePreviewTasks()
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
      if (client === undefined) throw new Error("Scheduled task client is not configured")
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
