"use client"

import { useMemo, useSyncExternalStore } from "react"

import { isScheduledTaskRecord, type ScheduledTaskRecord } from "../model/scheduled-task"

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
