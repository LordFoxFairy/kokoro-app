"use client"

import { useMemo, useSyncExternalStore } from "react"

export const EDITOR_HASH = "#scheduled-tasks/new"
export const SCHEDULED_LOCATION_EVENT = "kokoro:scheduled-location"

export type ScheduledView = "calendar" | "list"
export type ScheduledTaskCreationContext =
  | { kind: "personal" }
  | { kind: "project"; projectId: string }
  | { kind: "invalid" }
export type ScheduledLocationState = {
  view: ScheduledView
  editorOpen: boolean
  creationContext: ScheduledTaskCreationContext
}

const DEFAULT_SCHEDULED_LOCATION_SNAPSHOT = JSON.stringify(["calendar", false, "personal", null])
const EDITOR_HISTORY_KEY = "scheduledTaskEditor"

function readScheduledView(): ScheduledView {
  if (typeof window === "undefined") return "calendar"
  return new URLSearchParams(window.location.search).get("tab") === "list" ? "list" : "calendar"
}

function readScheduledLocationSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_SCHEDULED_LOCATION_SNAPSHOT
  const creationContext = readScheduledTaskCreationContext()
  return JSON.stringify([
    readScheduledView(),
    window.location.hash === EDITOR_HASH,
    creationContext.kind,
    creationContext.kind === "project" ? creationContext.projectId : null,
  ])
}

function readScheduledTaskCreationContext(): ScheduledTaskCreationContext {
  const references: string[] = []
  for (const parameter of window.location.search.slice(1).split("&")) {
    if (parameter.length === 0) continue
    const separator = parameter.indexOf("=")
    const encodedName = separator === -1 ? parameter : parameter.slice(0, separator)
    const name = decodeSearchComponent(encodedName)
    if (name !== "project_id") continue
    const projectId = decodeSearchComponent(separator === -1 ? "" : parameter.slice(separator + 1))
    if (projectId === null) return { kind: "invalid" }
    references.push(projectId)
  }
  if (references.length === 0) return { kind: "personal" }
  const projectId = references[0]
  if (references.length !== 1 || projectId === undefined || projectId.length === 0 || projectId.trim() !== projectId) {
    return { kind: "invalid" }
  }
  return { kind: "project", projectId }
}

function decodeSearchComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/gu, " "))
  } catch {
    return null
  }
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
  return useMemo(() => {
    const [view, editorOpen, kind, projectId] = JSON.parse(snapshot) as [ScheduledView, boolean, ScheduledTaskCreationContext["kind"], string | null]
    const creationContext: ScheduledTaskCreationContext = kind === "project" && projectId !== null
      ? { kind, projectId }
      : kind === "invalid"
        ? { kind }
        : { kind: "personal" }
    return { view, editorOpen, creationContext }
  }, [snapshot])
}

export function scheduledTaskCreationContextKey(context: ScheduledTaskCreationContext): string {
  return JSON.stringify([context.kind, context.kind === "project" ? context.projectId : null])
}

export function scheduledTaskEditorInstanceKey(
  context: ScheduledTaskCreationContext,
  editingTaskId: string | null,
): string {
  return JSON.stringify([context.kind, context.kind === "project" ? context.projectId : null, editingTaskId ?? "new"])
}

export function writeScheduledView(view: ScheduledView): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("tab", view)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
}

function isHistoryRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function locationWithoutHash(): string {
  return `${window.location.pathname}${window.location.search}`
}

export function openScheduledEditor(): void {
  if (typeof window === "undefined") return
  if (window.location.hash !== EDITOR_HASH) {
    const currentState: unknown = window.history.state
    const nextState = isHistoryRecord(currentState)
      ? { ...currentState, [EDITOR_HISTORY_KEY]: true }
      : { [EDITOR_HISTORY_KEY]: true }
    window.history.pushState(nextState, "", `${locationWithoutHash()}${EDITOR_HASH}`)
  }
  window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
}

export function closeScheduledEditor(): void {
  if (typeof window === "undefined" || window.location.hash !== EDITOR_HASH) return
  const currentState: unknown = window.history.state
  const openedBySurface = isHistoryRecord(currentState) && currentState[EDITOR_HISTORY_KEY] === true
  const preservedState = openedBySurface
    ? Object.fromEntries(Object.entries(currentState).filter(([key]) => key !== EDITOR_HISTORY_KEY))
    : currentState
  window.history.replaceState(preservedState, "", locationWithoutHash())
  window.dispatchEvent(new Event(SCHEDULED_LOCATION_EVENT))
  if (openedBySurface) window.history.back()
}
