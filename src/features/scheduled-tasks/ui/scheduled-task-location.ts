"use client"

import { useMemo, useSyncExternalStore } from "react"

export const EDITOR_HASH = "#scheduled-tasks/new"
export const SCHEDULED_LOCATION_EVENT = "kokoro:scheduled-location"

export type ScheduledView = "calendar" | "list"
export type ScheduledLocationState = { view: ScheduledView; editorOpen: boolean }

const DEFAULT_SCHEDULED_LOCATION_SNAPSHOT = "calendar:closed"
const EDITOR_HISTORY_KEY = "scheduledTaskEditor"

function readScheduledView(): ScheduledView {
  if (typeof window === "undefined") return "calendar"
  return new URLSearchParams(window.location.search).get("tab") === "list" ? "list" : "calendar"
}

function readScheduledLocationSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_SCHEDULED_LOCATION_SNAPSHOT
  const editorState = window.location.hash === EDITOR_HASH ? "open" : "closed"
  return `${readScheduledView()}:${editorState}`
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
  return useMemo(() => ({
    view: snapshot.startsWith("list:") ? "list" : "calendar",
    editorOpen: snapshot.endsWith(":open"),
  }), [snapshot])
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
