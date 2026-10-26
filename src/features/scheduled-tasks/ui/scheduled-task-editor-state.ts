import { useEffect, useRef, type RefObject } from "react"

import { scheduledDateKey } from "../model/calendar"
import type { ScheduledTaskInitial, ScheduledTaskFrequency, ScheduledTaskConditions } from "../model/scheduled-task"

export type ScheduledTaskEditorState = {
  triggerKind: "calendar" | "rss"
  feedUrl: string
  conditions: ScheduledTaskConditions
  expiryTimezone: string
  initialExpiryDate: string
  initialExpiryInstant: string | undefined
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
  defaultTime = "08:00",
): ScheduledTaskEditorState {
  const expiryTimezone = browserTimezone()
  const timezone = initialTask?.timezone || expiryTimezone
  const expiryDate = scheduledDateKey(initialTask?.expiresAt, initialTask?.triggerKind === "rss" ? expiryTimezone : timezone) ?? ""
  return {
    triggerKind: initialTask?.triggerKind ?? "calendar",
    feedUrl: initialTask?.feedUrl ?? "",
    conditions: initialTask?.conditions?.map(group => group.map(clause => ({ ...clause }))) ?? [],
    expiryTimezone, initialExpiryDate: expiryDate, initialExpiryInstant: initialTask?.expiresAt,
    title: initialTask?.title ?? "",
    frequency: initialTask?.frequency ?? "daily",
    weekdays: [...(initialTask?.weekdays ?? [])],
    monthDays: [...(initialTask?.monthDays ?? [])],
    localDate: initialTask?.localDate ?? "",
    time: initialTask?.time ?? defaultTime,
    timezone,
    expires: initialTask?.expiresAt !== undefined,
    expiryDate,
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
