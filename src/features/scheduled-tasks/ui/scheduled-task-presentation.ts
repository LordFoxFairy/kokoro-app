import { ListChecks, Route, ScanSearch } from "lucide-react"

import type { ScheduledTaskStatus } from "../model/scheduled-task"

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

export type ScheduledMutation = {
  taskId: string
  operation: "update" | "retry" | "delete"
}

export function statusMessageKey(status: ScheduledTaskStatus): "scheduled.active" | "scheduled.paused" | "scheduled.failed" {
  return status === "active" ? "scheduled.active" : status === "paused" ? "scheduled.paused" : "scheduled.failed"
}

export function mutationMessageKey(operation: ScheduledMutation["operation"]): "scheduled.updating" | "scheduled.deleting" {
  return operation === "delete" ? "scheduled.deleting" : "scheduled.updating"
}

export function formatScheduledInstant(value: string, locale: string, displayTimezone: string): string {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: displayTimezone,
  }).format(instant)
}
