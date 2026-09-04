export type ScheduledTaskFrequency = "daily" | "weekly"
export type ScheduledTaskStatus = "active" | "paused" | "failed"

export type ScheduledTaskRecord = {
  id: string
  title: string
  prompt?: string
  frequency: ScheduledTaskFrequency
  time: string
  timezone?: string
  nextRun?: string
  expiresAt?: string
  autoApprove?: boolean
  enabled?: boolean
  status?: ScheduledTaskStatus
}

export type ScheduledTaskDraft = {
  title: string
  prompt: string
  frequency: ScheduledTaskFrequency
  time: string
  timezone: string
  expiresAt?: string
  autoApprove: boolean
}

export type ScheduledTaskInitial = Partial<ScheduledTaskDraft> & {
  title: string
}

export type ScheduledTaskPatch = Partial<Pick<
  ScheduledTaskRecord,
  "title" | "prompt" | "frequency" | "time" | "timezone" | "autoApprove" | "enabled" | "status"
>> & { expiresAt?: string | null }

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
  if (!("title" in value) || typeof value.title !== "string" || value.title.length === 0) return false
  if (!("frequency" in value) || (value.frequency !== "daily" && value.frequency !== "weekly")) return false
  if (!("time" in value) || typeof value.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value.time)) return false
  if ("prompt" in value && value.prompt !== undefined && typeof value.prompt !== "string") return false
  if ("timezone" in value && value.timezone !== undefined && !isIanaTimezone(value.timezone)) return false
  if ("nextRun" in value && value.nextRun !== undefined && !isUtcInstant(value.nextRun)) return false
  if ("expiresAt" in value && value.expiresAt !== undefined && !isUtcInstant(value.expiresAt)) return false
  if ("autoApprove" in value && value.autoApprove !== undefined && typeof value.autoApprove !== "boolean") return false
  if ("enabled" in value && value.enabled !== undefined && typeof value.enabled !== "boolean") return false
  return !("status" in value && value.status !== undefined && value.status !== "active" && value.status !== "paused" && value.status !== "failed")
}

function isUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

function isIanaTimezone(value: unknown): value is string {
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
