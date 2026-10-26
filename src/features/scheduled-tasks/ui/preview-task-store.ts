"use client"

import { useMemo, useSyncExternalStore } from "react"

import { nextPreviewRun } from "../model/calendar"
import {
  isScheduledTaskRecord,
  type ScheduledTaskDraft,
  type ScheduledTaskEditorValue,
  type ScheduledTaskRecord,
  type ScheduledTaskStatus,
} from "../model/scheduled-task"

const PREVIEW_TASKS_KEY = "kokoro.preview.scheduled-tasks"
const PREVIEW_TASKS_EVENT = "kokoro:scheduled-preview-tasks"
const PREVIEW_TASKS_LOCK = "kokoro.preview.scheduled-tasks.lock"
const EMPTY_SNAPSHOT = "[]"

let fallbackMutationQueue: Promise<void> | undefined

export class PreviewTaskStorageError extends Error {
  constructor(operation: "write" | "remove") {
    super(`Scheduled preview storage ${operation} failed`)
    this.name = "PreviewTaskStorageError"
  }
}

function parsePreviewTasks(serialized: string): ScheduledTaskRecord[] {
  try {
    const value: unknown = JSON.parse(serialized)
    return Array.isArray(value) ? value.filter(isScheduledTaskRecord) : []
  } catch {
    return []
  }
}

export function readPreviewTasks(): ScheduledTaskRecord[] {
  if (typeof window === "undefined") return []
  try {
    return parsePreviewTasks(window.localStorage.getItem(PREVIEW_TASKS_KEY) ?? "null")
  } catch {
    return []
  }
}

function readPreviewTasksSnapshot(): string {
  return typeof window === "undefined" ? EMPTY_SNAPSHOT : JSON.stringify(readPreviewTasks())
}

function subscribePreviewTasks(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PREVIEW_TASKS_KEY) onStoreChange()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(PREVIEW_TASKS_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(PREVIEW_TASKS_EVENT, onStoreChange)
  }
}

function subscribeDisabled(): () => void {
  return () => undefined
}

export function usePreviewTasks(enabled: boolean): ScheduledTaskRecord[] {
  const snapshot = useSyncExternalStore(
    enabled ? subscribePreviewTasks : subscribeDisabled,
    enabled ? readPreviewTasksSnapshot : () => EMPTY_SNAPSHOT,
    () => EMPTY_SNAPSHOT,
  )
  return useMemo(() => parsePreviewTasks(snapshot), [snapshot])
}

function persistPreviewTasks(tasks: readonly ScheduledTaskRecord[]): void {
  if (typeof window === "undefined") return
  try {
    if (tasks.length === 0) window.localStorage.removeItem(PREVIEW_TASKS_KEY)
    else window.localStorage.setItem(PREVIEW_TASKS_KEY, JSON.stringify(tasks))
  } catch {
    throw new PreviewTaskStorageError(tasks.length === 0 ? "remove" : "write")
  }
  window.dispatchEvent(new Event(PREVIEW_TASKS_EVENT))
}

function withPreviewTaskLock<T>(operation: () => Promise<T> | T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    const locked = navigator.locks.request<Promise<T>>(PREVIEW_TASKS_LOCK, () => Promise.resolve(operation()))
    return locked.then(async (result) => await result)
  }
  let result: Promise<T>
  if (fallbackMutationQueue === undefined) {
    try {
      result = Promise.resolve(operation())
    } catch (error) {
      result = Promise.reject(error)
    }
  } else {
    result = fallbackMutationQueue.then(operation, operation)
  }
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  fallbackMutationQueue = tail
  void tail.finally(() => {
    if (fallbackMutationQueue === tail) fallbackMutationQueue = undefined
  })
  return result
}

function previewTaskId(tasks: readonly ScheduledTaskRecord[]): string {
  let id: string
  do {
    const entropy =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    id = `scheduled_preview_${entropy}`
  } while (tasks.some((task) => task.id === id))
  return id
}

function previewDefinition(draft: ScheduledTaskEditorValue | ScheduledTaskDraft): Omit<Extract<ScheduledTaskRecord, { triggerKind: "calendar" }>, "id"> | Omit<Extract<ScheduledTaskRecord, { triggerKind: "rss" }>, "id"> {
  const common = { title: draft.title, prompt: draft.prompt, autoApprove: draft.autoApprove,
    ...(typeof draft.expiresAt === "string" ? { expiresAt: draft.expiresAt } : {}) }
  if (draft.triggerKind === "rss") return { ...common, triggerKind: "rss", feedUrl: draft.feedUrl, conditions: draft.conditions.map(group => group.map(clause => ({ ...clause }))), nextRun: null }
  const nextRun = nextPreviewRun(draft.time, draft.frequency, draft.timezone, new Date(), draft)
  return { ...common, triggerKind: "calendar", frequency: draft.frequency, time: draft.time, timezone: draft.timezone,
    ...(draft.frequency === "weekly" ? { weekdays: draft.weekdays } : {}),
    ...(draft.frequency === "monthly" ? { monthDays: draft.monthDays } : {}),
    ...(draft.frequency === "once" ? { localDate: draft.localDate } : {}), nextRun, schedulingState: nextRun === null ? "exhausted" : "active" }
}

export function insertPreviewTask(draft: ScheduledTaskDraft): Promise<void> {
  return withPreviewTaskLock(() => {
    const current = readPreviewTasks()
    const nextTask = { ...previewDefinition(draft), id: previewTaskId(current), enabled: true,
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }) }
    if (!isScheduledTaskRecord(nextTask)) throw new Error("Invalid preview task")
    persistPreviewTasks([nextTask, ...current])
  })
}

export function replacePreviewTask(taskId: string, draft: ScheduledTaskEditorValue): Promise<void> {
  return withPreviewTaskLock(() => {
    const next = readPreviewTasks().map(task => {
      if (task.id !== taskId) return task
      const updated = { ...previewDefinition(draft), id: task.id,
        ...(task.projectId === undefined ? {} : { projectId: task.projectId }),
        ...(task.enabled === undefined ? {} : { enabled: task.enabled }), ...(task.status === undefined ? {} : { status: task.status }) }
      if (!isScheduledTaskRecord(updated)) throw new Error("Invalid preview task")
      return updated
    })
    persistPreviewTasks(next)
  })
}

export function setPreviewTaskStatus(
  taskId: string,
  status: Extract<ScheduledTaskStatus, "active" | "paused">,
): Promise<void> {
  return withPreviewTaskLock(() => {
    const next = readPreviewTasks().map((task): ScheduledTaskRecord =>
      task.id === taskId
        ? {
            ...task,
            enabled: status === "active",
            status,
            schedulingState: task.frequency === "once" && task.nextRun === null ? "exhausted" : status,
          }
        : task,
    )
    persistPreviewTasks(next)
  })
}

export function removePreviewTask(taskId: string): Promise<void> {
  return withPreviewTaskLock(() => {
    const next = readPreviewTasks().filter((task) => task.id !== taskId)
    persistPreviewTasks(next)
  })
}
