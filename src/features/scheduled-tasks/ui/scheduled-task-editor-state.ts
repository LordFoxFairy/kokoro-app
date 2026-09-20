import { useEffect, useRef, type RefObject } from "react"

import { scheduledDateKey } from "../model/calendar"
import type { ScheduledTaskInitial } from "../model/scheduled-task"

export type ScheduledTaskEditorState = {
  title: string
  frequency: "daily" | "weekly"
  time: string
  timezone: string
  expires: boolean
  expiryDate: string
  prompt: string
  autoApprove: boolean
  advancedOpen: boolean
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function initialScheduledTaskEditorState(initialTask: ScheduledTaskInitial | null, initialPrompt: string): ScheduledTaskEditorState {
  const timezone = initialTask?.timezone || browserTimezone()
  return {
    title: initialTask?.title ?? "",
    frequency: initialTask?.frequency === "weekly" ? "weekly" : "daily",
    time: initialTask?.time ?? "08:00",
    timezone,
    expires: initialTask?.expiresAt !== undefined,
    expiryDate: scheduledDateKey(initialTask?.expiresAt, timezone) ?? "",
    prompt: initialTask?.prompt ?? initialPrompt,
    autoApprove: initialTask?.autoApprove ?? false,
    advancedOpen: false,
  }
}

export function useMountedRef(): RefObject<boolean> {
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  return mounted
}
