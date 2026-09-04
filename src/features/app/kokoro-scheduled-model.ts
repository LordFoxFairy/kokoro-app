"use client"

import { useMemo, useSyncExternalStore } from "react"
import { ListChecks, Route, ScanSearch } from "lucide-react"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"

import type { ScheduledTaskDraft } from "./scheduled-task-editor"
import type { ScheduledTaskClient, ScheduledTaskPatch, ScheduledTaskRecord } from "./scheduled-task-client"

export type { ScheduledTaskClient, ScheduledTaskPatch, ScheduledTaskRecord } from "./scheduled-task-client"


export const SUGGESTIONS = [
  { key: "scheduled.monitor", icon: ScanSearch },
  { key: "scheduled.dailyDigest", icon: ListChecks },
  { key: "scheduled.pipeline", icon: Route },
] as const

export const WEEKDAY_KEYS = [
  "scheduled.sunday",
  "scheduled.monday",
  "scheduled.tuesday",
  "scheduled.wednesday",
  "scheduled.thursday",
  "scheduled.friday",
  "scheduled.saturday",
] as const

export type KokoroScheduledSurfaceProps = Pick<EmptyStateProps, "brandName"> & {
  preview?: boolean
  /**
   * The existing Hub/HTTP adapter is injected here once its canonical
   * scheduled-task methods are available. This surface deliberately does not
   * create a second fetch client or guess a BFF route.
   */
  client?: ScheduledTaskClient
  /** AppFrame injection name; `client` remains as a local/test compatibility seam. */
  scheduledTaskClient?: ScheduledTaskClient
  onSave?: (task: ScheduledTaskDraft) => Promise<void> | void
  tasks?: readonly ScheduledTaskRecord[]
  onUpdateTask?: (taskId: string, patch: ScheduledTaskPatch) => Promise<void> | void
  onRetryTask?: (taskId: string) => Promise<void> | void
  onDeleteTask?: (taskId: string) => Promise<void> | void
}

export function statusMessageKey(status: "active" | "paused" | "failed"): "scheduled.active" | "scheduled.paused" | "scheduled.failed" {
  return status === "active" ? "scheduled.active" : status === "paused" ? "scheduled.paused" : "scheduled.failed"
}

export const EDITOR_HASH = "#scheduled-tasks/new"
const PREVIEW_TASKS_KEY = "kokoro.preview.scheduled-tasks"
const PREVIEW_TASKS_EVENT = "kokoro:scheduled-preview-tasks"
export type ScheduledView = "calendar" | "list"
export type ScheduledLocationState = { view: ScheduledView; editorOpen: boolean }
const DEFAULT_SCHEDULED_LOCATION_STATE: ScheduledLocationState = { view: "calendar", editorOpen: false }
const DEFAULT_SCHEDULED_LOCATION_SNAPSHOT = JSON.stringify(DEFAULT_SCHEDULED_LOCATION_STATE)
export const SCHEDULED_LOCATION_EVENT = "kokoro:scheduled-location"

function readScheduledView(): ScheduledView {
  if (typeof window === "undefined") return "calendar"
  return new URLSearchParams(window.location.search).get("tab") === "list" ? "list" : "calendar"
}

function readScheduledLocationState(): ScheduledLocationState {
  if (typeof window === "undefined") return DEFAULT_SCHEDULED_LOCATION_STATE
  return {
    view: readScheduledView(),
    editorOpen: window.location.hash === EDITOR_HASH,
  }
}

function readScheduledLocationSnapshot(): string {
  return typeof window === "undefined"
    ? DEFAULT_SCHEDULED_LOCATION_SNAPSHOT
    : JSON.stringify(readScheduledLocationState())
}

function subscribeScheduledLocation(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const events = ["hashchange", "popstate", "kokoro:surface-navigation", SCHEDULED_LOCATION_EVENT] as const
  for (const event of events) window.addEventListener(event, onStoreChange)
  return () => {
    for (const event of events) window.removeEventListener(event, onStoreChange)
  }
}

export function useScheduledLocation(): ScheduledLocationState {
  const snapshot = useSyncExternalStore(
    subscribeScheduledLocation,
    readScheduledLocationSnapshot,
    () => DEFAULT_SCHEDULED_LOCATION_SNAPSHOT,
  )
  return useMemo(() => JSON.parse(snapshot) as ScheduledLocationState, [snapshot])
}

export function writeScheduledView(view: ScheduledView): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("tab", view)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
}

export function taskStatus(task: ScheduledTaskRecord): "active" | "paused" | "failed" {
  if (task.status) return task.status
  return task.enabled === false ? "paused" : "active"
}

export function readPreviewTasks(): ScheduledTaskRecord[] {
  if (typeof window === "undefined") return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PREVIEW_TASKS_KEY) ?? "null")
    if (!Array.isArray(value)) return []
    return value.filter((candidate): candidate is ScheduledTaskRecord => {
      if (!candidate || typeof candidate !== "object") return false
      const task = candidate as Partial<ScheduledTaskRecord>
      return typeof task.id === "string"
        && typeof task.title === "string"
        && (task.frequency === "daily" || task.frequency === "weekly")
        && typeof task.time === "string"
    })
  } catch {
    return []
  }
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
  return useMemo(() => JSON.parse(snapshot) as ScheduledTaskRecord[], [snapshot])
}

export function writePreviewTasks(tasks: readonly ScheduledTaskRecord[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PREVIEW_TASKS_KEY, JSON.stringify(tasks))
  window.dispatchEvent(new Event(PREVIEW_TASKS_EVENT))
}

export function missingScheduledClientError(): Error {
  return new Error("Scheduled task client is not configured")
}

export function padDatePart(value: number): string {
  return String(value).padStart(2, "0")
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function scheduledDateKey(nextRun: string | undefined): string | null {
  if (!nextRun) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(nextRun)
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`
  const parsed = new Date(nextRun)
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed)
}

export function nextPreviewRun(time: string, frequency: ScheduledTaskDraft["frequency"]): string {
  const now = new Date()
  const next = new Date(now)
  const [hours = 8, minutes = 0] = time.split(":").map(Number)
  next.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  if (frequency === "weekly" || next <= now) next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 1))
  return next.toISOString()
}

export type ScheduledMutation = {
  taskId: string
  operation: "update" | "retry" | "delete"
}

export function mutationMessageKey(operation: ScheduledMutation["operation"]): "scheduled.updating" | "scheduled.deleting" {
  return operation === "delete" ? "scheduled.deleting" : "scheduled.updating"
}

export function buildCalendarDays(month: Date): readonly { date: Date; key: string; currentMonth: boolean; today: boolean }[] {
  const firstOfMonth = startOfMonth(month)
  const firstCell = new Date(firstOfMonth)
  firstCell.setDate(firstCell.getDate() - firstOfMonth.getDay())
  const todayKey = dateKey(new Date())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell)
    date.setDate(firstCell.getDate() + index)
    return {
      date,
      key: dateKey(date),
      currentMonth: date.getFullYear() === firstOfMonth.getFullYear() && date.getMonth() === firstOfMonth.getMonth(),
      today: dateKey(date) === todayKey,
    }
  })
}
