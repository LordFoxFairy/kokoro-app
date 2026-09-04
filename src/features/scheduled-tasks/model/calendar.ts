import type { ScheduledTaskFrequency } from "./scheduled-task"

export type ScheduledCalendarDay = {
  date: Date
  key: string
  currentMonth: boolean
  today: boolean
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
  const dateOnly = /^\d{4}-\d{2}-\d{2}/u.exec(nextRun)?.[0]
  if (dateOnly !== undefined) return dateOnly
  const parsed = new Date(nextRun)
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed)
}

export function nextPreviewRun(time: string, frequency: ScheduledTaskFrequency): string {
  const now = new Date()
  const next = new Date(now)
  const [hoursText, minutesText] = time.split(":")
  const hours = Number(hoursText ?? 8)
  const minutes = Number(minutesText ?? 0)
  next.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  if (frequency === "weekly" || next <= now) next.setDate(next.getDate() + (frequency === "weekly" ? 7 : 1))
  return next.toISOString()
}

export function buildCalendarDays(month: Date): readonly ScheduledCalendarDay[] {
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
