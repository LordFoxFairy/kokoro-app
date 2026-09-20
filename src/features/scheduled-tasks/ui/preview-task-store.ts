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
  const tail = result.then(() => undefined, () => undefined)
  fallbackMutationQueue = tail
  void tail.finally(() => {
    if (fallbackMutationQueue === tail) fallbackMutationQueue = undefined
  })
  return result
}

function previewTaskId(tasks: readonly ScheduledTaskRecord[]): string {
  let id: string
  do {
    const entropy = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    id = `scheduled_preview_${entropy}`
  } while (tasks.some((task) => task.id === id))
  return id
}

export function insertPreviewTask(draft: ScheduledTaskDraft): Promise<void> {
  return withPreviewTaskLock(() => {
    const current = readPreviewTasks()
    const nextTask: ScheduledTaskRecord = {
      id: previewTaskId(current),
      title: draft.title,
      prompt: draft.prompt,
      frequency: draft.frequency,
      time: draft.time,
      timezone: draft.timezone,
      nextRun: nextPreviewRun(draft.time, draft.frequency, draft.timezone),
      autoApprove: draft.autoApprove,
      enabled: true,
      ...(draft.expiresAt === undefined ? {} : { expiresAt: draft.expiresAt }),
    }
    persistPreviewTasks([nextTask, ...current])
  })
}

export function replacePreviewTask(taskId: string, draft: ScheduledTaskEditorValue): Promise<void> {
  return withPreviewTaskLock(() => {
    const next = readPreviewTasks().map((task) => {
      if (task.id !== taskId) return task
      const updated: ScheduledTaskRecord = {
        ...task,
        title: draft.title,
        prompt: draft.prompt,
        frequency: draft.frequency,
        time: draft.time,
        timezone: draft.timezone,
        nextRun: nextPreviewRun(draft.time, draft.frequency, draft.timezone),
        autoApprove: draft.autoApprove,
      }
      if (typeof draft.expiresAt === "string") updated.expiresAt = draft.expiresAt
      else delete updated.expiresAt
      return updated
    })
    persistPreviewTasks(next)
  })
}

export function setPreviewTaskStatus(taskId: string, status: Extract<ScheduledTaskStatus, "active" | "paused">): Promise<void> {
  return withPreviewTaskLock(() => {
    const next = readPreviewTasks().map((task) => task.id === taskId
      ? { ...task, enabled: status === "active", status }
      : task)
    persistPreviewTasks(next)
  })
}

export function removePreviewTask(taskId: string): Promise<void> {
  return withPreviewTaskLock(() => {
    const next = readPreviewTasks().filter((task) => task.id !== taskId)
    persistPreviewTasks(next)
  })
}
