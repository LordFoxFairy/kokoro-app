import type { ScheduledTaskFrequency } from "./scheduled-task"

export type ScheduledCalendarDay = {
  date: Date
  key: string
  currentMonth: boolean
  today: boolean
}

type ZonedDateTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const zonedFormatters = new Map<string, Intl.DateTimeFormat>()

export function padDatePart(value: number): string {
  return String(value).padStart(2, "0")
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = zonedFormatters.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  zonedFormatters.set(timeZone, formatter)
  return formatter
}

function zonedParts(instant: Date, timeZone: string): ZonedDateTime {
  const values = new Map(formatterFor(timeZone).formatToParts(instant).map((part) => [part.type, part.value]))
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  }
}

function dateKeyFromParts(parts: Pick<ZonedDateTime, "year" | "month" | "day">): string {
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`
}

function utcCalendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

function parseLocalDateTime(date: string, time: string): ZonedDateTime {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date)
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(time)
  if (!dateMatch || !timeMatch) throw new RangeError("Invalid local scheduled date/time")
  const parts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  }
  const normalized = utcCalendarDate(parts.year, parts.month, parts.day)
  if (normalized.getUTCFullYear() !== parts.year || normalized.getUTCMonth() + 1 !== parts.month || normalized.getUTCDate() !== parts.day) {
    throw new RangeError("Invalid local scheduled date")
  }
  return parts
}

function localEpoch(parts: ZonedDateTime): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
}

function compareLocal(left: ZonedDateTime, right: ZonedDateTime): number {
  return localEpoch(left) - localEpoch(right)
}

function offsetAt(instant: Date, timeZone: string): number {
  const minute = Math.floor(instant.getTime() / 60_000) * 60_000
  return localEpoch(zonedParts(new Date(minute), timeZone)) - minute
}

function possibleOffsets(epoch: number, timeZone: string): readonly number[] {
  const offsets = new Set<number>()
  for (let hours = -36; hours <= 36; hours += 6) {
    offsets.add(offsetAt(new Date(epoch + hours * 3_600_000), timeZone))
  }
  return [...offsets]
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const desired = parseLocalDateTime(date, time)
  const epoch = localEpoch(desired)
  const candidates = possibleOffsets(epoch, timeZone)
    .map((offset) => new Date(epoch - offset))
    .sort((left, right) => left.getTime() - right.getTime())
  const exact = candidates.find((candidate) => compareLocal(zonedParts(candidate, timeZone), desired) === 0)
  if (exact) return exact
  const afterGap = candidates
    .filter((candidate) => {
      const actual = zonedParts(candidate, timeZone)
      return dateKeyFromParts(actual) === date && compareLocal(actual, desired) > 0
    })
    .sort((left, right) => compareLocal(zonedParts(left, timeZone), zonedParts(right, timeZone)))[0]
  if (afterGap) return afterGap
  throw new RangeError("Local scheduled time cannot be represented in timezone")
}

export function expiryDateToUtcInstant(date: string, timeZone: string): string {
  return new Date(localDateTimeToUtc(date, "23:59", timeZone).getTime() + 59_999).toISOString()
}

export function scheduledDateKey(nextRun: string | undefined, displayTimeZone = "UTC"): string | null {
  if (!nextRun) return null
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(nextRun) ? `${nextRun}Z` : nextRun
  const instant = new Date(normalized)
  return Number.isNaN(instant.getTime()) ? null : dateKeyFromParts(zonedParts(instant, displayTimeZone))
}

export function startOfMonth(instant: Date, displayTimeZone = "UTC"): Date {
  const { year, month } = zonedParts(instant, displayTimeZone)
  return utcCalendarDate(year, month, 1)
}

function addCalendarDays(date: string, days: number): string {
  const parts = parseLocalDateTime(date, "00:00")
  const next = utcCalendarDate(parts.year, parts.month, parts.day + days)
  return dateKeyFromParts({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() })
}

export function nextPreviewRun(
  time: string,
  frequency: ScheduledTaskFrequency,
  timeZone = "UTC",
  now: Date = new Date(),
): string {
  const today = dateKeyFromParts(zonedParts(now, timeZone))
  const firstDate = frequency === "weekly" ? addCalendarDays(today, 7) : today
  let next = localDateTimeToUtc(firstDate, time, timeZone)
  if (frequency === "daily" && next <= now) next = localDateTimeToUtc(addCalendarDays(today, 1), time, timeZone)
  return next.toISOString()
}

export function buildCalendarDays(month: Date, displayTimeZone = "UTC", now: Date = new Date()): readonly ScheduledCalendarDay[] {
  const firstOfMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  const firstCell = new Date(firstOfMonth)
  firstCell.setUTCDate(firstCell.getUTCDate() - firstOfMonth.getUTCDay())
  const todayKey = dateKeyFromParts(zonedParts(now, displayTimeZone))
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell)
    date.setUTCDate(firstCell.getUTCDate() + index)
    const key = dateKeyFromParts({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })
    return {
      date,
      key,
      currentMonth: date.getUTCFullYear() === firstOfMonth.getUTCFullYear() && date.getUTCMonth() === firstOfMonth.getUTCMonth(),
      today: key === todayKey,
    }
  })
}
