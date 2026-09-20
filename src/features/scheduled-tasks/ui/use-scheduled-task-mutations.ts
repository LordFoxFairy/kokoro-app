"use client"

import { useCallback, useRef, useState } from "react"

import type { ScheduledTaskRecord } from "../model/scheduled-task"
import type { ScheduledTaskRuntime } from "./scheduled-task-mode"
import {
  deleteScheduledTask,
  retryScheduledTask,
  updateScheduledTaskStatus,
} from "./scheduled-task-operations"
import type { ScheduledMutation } from "./scheduled-task-presentation"

export function useScheduledTaskMutations(runtime: ScheduledTaskRuntime, reload: () => Promise<void>) {
  const mutationInFlight = useRef(false)
  const [pendingMutation, setPendingMutation] = useState<ScheduledMutation | null>(null)
  const [mutationError, setMutationError] = useState<ScheduledMutation | null>(null)

  const runMutation = useCallback(async (operation: ScheduledMutation, work: () => Promise<void>): Promise<boolean> => {
    if (mutationInFlight.current) return false
    mutationInFlight.current = true
    setPendingMutation(operation)
    setMutationError(null)
    try {
      await work()
      return true
    } catch {
      setMutationError(operation)
      return false
    } finally {
      mutationInFlight.current = false
      setPendingMutation(null)
    }
  }, [])

  const setTaskEnabled = useCallback(async (task: ScheduledTaskRecord, enabled: boolean) => {
    const operation: ScheduledMutation = { taskId: task.id, operation: "update" }
    await runMutation(operation, () => updateScheduledTaskStatus(runtime, task, enabled, reload))
  }, [reload, runMutation, runtime])

  const retryTask = useCallback(async (task: ScheduledTaskRecord) => {
    const operation: ScheduledMutation = { taskId: task.id, operation: "retry" }
    await runMutation(operation, () => retryScheduledTask(runtime, task, reload))
  }, [reload, runMutation, runtime])

  const removeTask = useCallback(async (task: ScheduledTaskRecord): Promise<boolean> => {
    const operation: ScheduledMutation = { taskId: task.id, operation: "delete" }
    return runMutation(operation, () => deleteScheduledTask(runtime, task, reload))
  }, [reload, runMutation, runtime])

  return {
    pendingMutation,
    mutationError,
    mutationBusy: pendingMutation !== null,
    clearMutationError: () => setMutationError(null),
    setTaskEnabled,
    retryTask,
    removeTask,
  }
}
