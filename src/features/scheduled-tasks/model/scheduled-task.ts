export type ScheduledTaskFrequency = "daily" | "weekly" | "monthly" | "once"
export type ScheduledTaskStatus = "active" | "paused" | "failed"

export type ScheduledTaskRecord = {
  id: string
  projectId?: string
  title: string
  prompt?: string
  frequency: ScheduledTaskFrequency
  time: string
  timezone?: string
  nextRun?: string | null
  schedulingState?: "pending" | "active" | "paused" | "exhausted" | "failed"
  weekdays?: number[]
  monthDays?: number[]
  localDate?: string
  expiresAt?: string
  autoApprove?: boolean
  enabled?: boolean
  status?: ScheduledTaskStatus
}

export type ScheduledTaskDraft = {
  projectId?: string
  title: string
  prompt: string
  frequency: ScheduledTaskFrequency
  time: string
  timezone: string
  weekdays?: number[]
  monthDays?: number[]
  localDate?: string
  expiresAt?: string
  autoApprove: boolean
}

export type ScheduledTaskEditorValue = Omit<ScheduledTaskDraft, "expiresAt"> & {
  expiresAt: string | null | undefined
}

export type ScheduledTaskInitial = Partial<ScheduledTaskDraft> & {
  title: string
}

export type ScheduledTaskPatch = Partial<
  Pick<
    ScheduledTaskRecord,
    | "title"
    | "prompt"
    | "frequency"
    | "time"
    | "timezone"
    | "weekdays"
    | "monthDays"
    | "localDate"
    | "autoApprove"
    | "enabled"
    | "status"
  >
> & { expiresAt?: string | null }

export type ScheduledTaskClient = {
  listScheduledTasks: () => Promise<readonly ScheduledTaskRecord[]>
  createScheduledTask: (draft: ScheduledTaskDraft) => Promise<ScheduledTaskRecord>
  updateScheduledTask: (taskId: string, patch: ScheduledTaskPatch) => Promise<ScheduledTaskRecord>
  retryScheduledTask: (taskId: string) => Promise<ScheduledTaskRecord>
  deleteScheduledTask: (taskId: string) => Promise<{ ok: true }>
}

export function isScheduledTaskRecord(value: unknown): value is ScheduledTaskRecord {
  if (typeof value !== "object" || value === null) return false
  if (!("id" in value) || typeof value.id !== "string" || value.id.length === 0) return false
  if ("projectId" in value && value.projectId !== undefined && !isExactProjectReference(value.projectId)) return false
  if (!("title" in value) || typeof value.title !== "string" || value.title.length === 0) return false
  if (
    !("frequency" in value) ||
    typeof value.frequency !== "string" ||
    !["daily", "weekly", "monthly", "once"].includes(value.frequency)
  )
    return false
  if (!("time" in value) || typeof value.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value.time))
    return false
  if ("prompt" in value && value.prompt !== undefined && typeof value.prompt !== "string") return false
  if ("timezone" in value && value.timezone !== undefined && !isIanaTimezone(value.timezone)) return false
  if ("nextRun" in value && value.nextRun !== undefined && value.nextRun !== null && !isUtcInstant(value.nextRun))
    return false
  if (
    "schedulingState" in value &&
    value.schedulingState !== undefined &&
    !["pending", "active", "paused", "exhausted", "failed"].includes(String(value.schedulingState))
  )
    return false
  if ("recurrenceAnchorAt" in value) return false
  const selectors = ["weekdays", "monthDays", "localDate"] as const
  const ruleIndex = ["weekly", "monthly", "once"].indexOf(String(value.frequency))
  if (
    selectors.some(
      (field, index) => (field in value && Reflect.get(value, field) !== undefined) !== (index === ruleIndex),
    )
  )
    return false
  for (const [field, minimum, maximum] of [
    ["weekdays", 0, 6],
    ["monthDays", 1, 31],
  ] as const) {
    if (!(field in value)) continue
    const days = Reflect.get(value, field)
    if (
      !Array.isArray(days) ||
      !days.length ||
      days.length > maximum - minimum + 1 ||
      new Set(days).size !== days.length ||
      days.some((day) => !Number.isInteger(day) || day < minimum || day > maximum)
    )
      return false
  }
  if (
    "localDate" in value &&
    (typeof value.localDate !== "string" ||
      value.localDate.startsWith("0000-") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.localDate) ||
      !Number.isFinite(Date.parse(value.localDate)) ||
      new Date(value.localDate).toISOString().slice(0, 10) !== value.localDate)
  )
    return false
  if ("expiresAt" in value && value.expiresAt !== undefined && !isUtcInstant(value.expiresAt)) return false
  if ("autoApprove" in value && value.autoApprove !== undefined && typeof value.autoApprove !== "boolean") return false
  if ("enabled" in value && value.enabled !== undefined && typeof value.enabled !== "boolean") return false
  return !(
    "status" in value &&
    value.status !== undefined &&
    value.status !== "active" &&
    value.status !== "paused" &&
    value.status !== "failed"
  )
}

function isExactProjectReference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value
}

export function isUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

export function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function taskStatus(task: ScheduledTaskRecord): ScheduledTaskStatus {
  if (task.status) return task.status
  return task.enabled === false ? "paused" : "active"
}
