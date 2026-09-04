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
  "title" | "prompt" | "frequency" | "time" | "timezone" | "expiresAt" | "autoApprove" | "enabled" | "status"
>>

export type ScheduledTaskClient = {
  listScheduledTasks: () => Promise<readonly ScheduledTaskRecord[]>
  createScheduledTask: (draft: ScheduledTaskDraft) => Promise<ScheduledTaskRecord>
  updateScheduledTask: (taskId: string, patch: ScheduledTaskPatch) => Promise<ScheduledTaskRecord>
  retryScheduledTask: (taskId: string) => Promise<ScheduledTaskRecord>
  deleteScheduledTask: (taskId: string) => Promise<{ ok: true }>
}

export function isScheduledTaskRecord(value: unknown): value is ScheduledTaskRecord {
  if (typeof value !== "object" || value === null) return false
  if (!("id" in value) || typeof value.id !== "string") return false
  if (!("title" in value) || typeof value.title !== "string") return false
  if (!("frequency" in value) || (value.frequency !== "daily" && value.frequency !== "weekly")) return false
  return "time" in value && typeof value.time === "string"
}

export function taskStatus(task: ScheduledTaskRecord): ScheduledTaskStatus {
  if (task.status) return task.status
  return task.enabled === false ? "paused" : "active"
}
