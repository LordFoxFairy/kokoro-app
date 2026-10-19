import { useEffect, useRef, type RefObject } from "react"

import { scheduledDateKey } from "../model/calendar"
import type { ScheduledTaskInitial, ScheduledTaskFrequency } from "../model/scheduled-task"

export type ScheduledTaskEditorState = {
  title: string
  frequency: ScheduledTaskFrequency
  weekdays: number[]
  monthDays: number[]
  localDate: string
  time: string
  timezone: string
  expires: boolean
  expiryDate: string
  prompt: string
  autoApprove: boolean
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function initialScheduledTaskEditorState(
  initialTask: ScheduledTaskInitial | null,
  initialPrompt: string,
): ScheduledTaskEditorState {
  const timezone = initialTask?.timezone || browserTimezone()
  return {
    title: initialTask?.title ?? "",
    frequency: initialTask?.frequency ?? "daily",
    weekdays: [...(initialTask?.weekdays ?? [])],
    monthDays: [...(initialTask?.monthDays ?? [])],
    localDate: initialTask?.localDate ?? "",
    time: initialTask?.time ?? "08:00",
    timezone,
    expires: initialTask?.expiresAt !== undefined,
    expiryDate: scheduledDateKey(initialTask?.expiresAt, timezone) ?? "",
    prompt: initialTask?.prompt ?? initialPrompt,
    autoApprove: initialTask?.autoApprove ?? false,
  }
}

export function useMountedRef(): RefObject<boolean> {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}
