"use client"

import { useMemo, useState } from "react"

import { scheduledDateKey, startOfMonth } from "../model/calendar"
import type { ScheduledTaskRecord } from "../model/scheduled-task"

export function useScheduledTaskCalendar(tasks: readonly ScheduledTaskRecord[], displayTimezone: string) {
  const [selection, setSelection] = useState(() => ({
    displayTimezone,
    month: startOfMonth(new Date(), displayTimezone),
  }))
  const calendarMonth = selection.displayTimezone === displayTimezone
    ? selection.month
    : startOfMonth(new Date(), displayTimezone)
  const calendarTasks = useMemo(() => {
    const grouped = new Map<string, ScheduledTaskRecord[]>()
    for (const task of tasks) {
      const key = scheduledDateKey(task.nextRun, displayTimezone)
      if (!key) continue
      const tasksForDay = grouped.get(key) ?? []
      tasksForDay.push(task)
      grouped.set(key, tasksForDay)
    }
    return grouped
  }, [displayTimezone, tasks])

  function shiftCalendarMonth(offset: number) {
    const next = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + offset, 1))
    setSelection({ displayTimezone, month: next })
  }

  function resetCalendarMonth() {
    setSelection({ displayTimezone, month: startOfMonth(new Date(), displayTimezone) })
  }

  return { calendarMonth, calendarTasks, shiftCalendarMonth, resetCalendarMonth }
}
