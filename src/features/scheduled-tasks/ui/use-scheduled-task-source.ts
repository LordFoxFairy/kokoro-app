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
import type { ScheduledTaskCreationContext } from "./scheduled-task-location"

type ScheduledTaskSourceOptions = Readonly<{
  runtime: ScheduledTaskRuntime
  boundary: ProjectReadBoundary | undefined
  creationContext: ScheduledTaskCreationContext
}>

export function useScheduledTaskSource({ runtime, boundary, creationContext }: ScheduledTaskSourceOptions) {
  const admitted = (boundary?.admitted ?? true) && creationContext.kind !== "invalid"
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
  const [readOwner, setReadOwner] = useState<{ client: typeof client; generation: typeof generation } | null>(null)
  const requestSequence = useRef(0)
  const mounted = useRef(false)
  const current = useRef({ admitted, generation, client })
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useLayoutEffect(() => {
    current.current = { admitted, generation, client }
  }, [admitted, generation, client])

  const loadTasks = useCallback(async () => {
    if (!admitted || fixtureMode || controlledTasks !== undefined) return
    const hasReadAccess = () =>
      mounted.current &&
      current.current.admitted &&
      current.current.generation === generation &&
      current.current.client === client
    if (!hasReadAccess()) return
    const sequence = ++requestSequence.current
    const isCurrent = () =>
      hasReadAccess() && sequence === requestSequence.current
    await Promise.resolve()
    if (!isCurrent()) return
    setLoading(true)
    setLoadError(false)
    try {
      if (client === undefined || client === null)
        throw new Error("Scheduled task client is not configured")
      const next = await client.listScheduledTasks()
      if (isCurrent()) {
        setRemoteTasks([...next])
        setReadOwner({ client, generation })
      }
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

  const displayedTasks = useMemo(() => {
    const tasks = controlledTasks ?? (fixtureMode ? previewTasks : remoteTasks)
    if (creationContext.kind === "invalid") return []
    return creationContext.kind === "project"
      ? tasks.filter((task) => task.projectId === creationContext.projectId)
      : tasks
  }, [controlledTasks, creationContext, fixtureMode, previewTasks, remoteTasks])

  const readReady = admitted && !loading && !loadError && readOwner !== null && readOwner.client === client && readOwner.generation === generation
  return { displayedTasks, loading, loadError, loadTasks, readReady }
}
