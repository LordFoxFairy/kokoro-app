"use client"

import { useMemo, useSyncExternalStore } from "react"

import { nextPreviewRun } from "../model/calendar"
import {
  isScheduledTaskRecord,
  type ScheduledTaskDraft,
  type ScheduledTaskRecord,
  type ScheduledTaskStatus,
} from "../model/scheduled-task"

const PREVIEW_TASKS_KEY = "kokoro.preview.scheduled-tasks"
const PREVIEW_TASKS_EVENT = "kokoro:scheduled-preview-tasks"

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
  return parsePreviewTasks(window.localStorage.getItem(PREVIEW_TASKS_KEY) ?? "null")
}

function readPreviewTasksSnapshot(): string {
  return typeof window === "undefined" ? "[]" : JSON.stringify(readPreviewTasks())
}

function subscribePreviewTasks(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(PREVIEW_TASKS_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(PREVIEW_TASKS_EVENT, onStoreChange)
  }
}

export function usePreviewTasks(): ScheduledTaskRecord[] {
  const snapshot = useSyncExternalStore(subscribePreviewTasks, readPreviewTasksSnapshot, () => "[]")
  return useMemo(() => parsePreviewTasks(snapshot), [snapshot])
}

export function writePreviewTasks(tasks: readonly ScheduledTaskRecord[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PREVIEW_TASKS_KEY, JSON.stringify(tasks))
  window.dispatchEvent(new Event(PREVIEW_TASKS_EVENT))
}

export function insertPreviewTask(taskId: string, draft: ScheduledTaskDraft): void {
  const nextTask: ScheduledTaskRecord = {
    id: taskId,
    title: draft.title,
    prompt: draft.prompt,
    frequency: draft.frequency,
    time: draft.time,
    timezone: draft.timezone,
    nextRun: nextPreviewRun(draft.time, draft.frequency),
    autoApprove: draft.autoApprove,
    enabled: true,
    ...(draft.expiresAt === undefined ? {} : { expiresAt: draft.expiresAt }),
  }
  writePreviewTasks([nextTask, ...readPreviewTasks()])
}

export function replacePreviewTask(taskId: string, draft: ScheduledTaskDraft): void {
  writePreviewTasks(readPreviewTasks().map((task) => {
    if (task.id !== taskId) return task
    const updated: ScheduledTaskRecord = {
      ...task,
      title: draft.title,
      prompt: draft.prompt,
      frequency: draft.frequency,
      time: draft.time,
      timezone: draft.timezone,
      nextRun: nextPreviewRun(draft.time, draft.frequency),
      autoApprove: draft.autoApprove,
    }
    if (draft.expiresAt === undefined) delete updated.expiresAt
    else updated.expiresAt = draft.expiresAt
    return updated
  }))
}

export function setPreviewTaskStatus(taskId: string, status: Extract<ScheduledTaskStatus, "active" | "paused">): void {
  writePreviewTasks(readPreviewTasks().map((task) => task.id === taskId
    ? { ...task, enabled: status === "active", status }
    : task))
}

export function removePreviewTask(taskId: string): void {
  writePreviewTasks(readPreviewTasks().filter((task) => task.id !== taskId))
}
