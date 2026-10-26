import type { ScheduledTaskRunsReader } from "./scheduled-task-run"

export type ScheduledTaskFrequency = "daily" | "weekly" | "monthly" | "once"
export type ScheduledTaskStatus = "active" | "paused" | "failed"

export type ScheduledRssCondition = {
  field: "title" | "summary" | "content" | "author" | "category" | "link" | "domain"
  operator: "contains" | "not_contains" | "equals" | "not_equals" | "starts_with" | "not_starts_with" | "ends_with" | "not_ends_with" | "is_empty" | "is_not_empty"
  value?: string | undefined
}
export type ScheduledTaskConditions = ScheduledRssCondition[][]
type CalendarTrigger = {
  triggerKind: "calendar"; frequency: ScheduledTaskFrequency; time: string; timezone?: string
  weekdays?: number[]; monthDays?: number[]; localDate?: string; feedUrl?: never; conditions?: never
}
type RssTrigger = {
  triggerKind: "rss"; feedUrl: string; conditions: ScheduledTaskConditions
  frequency?: never; time?: never; timezone?: never; weekdays?: never; monthDays?: never; localDate?: never
}
type TaskCommon = {
  id: string; projectId?: string; title: string; prompt?: string; nextRun?: string | null
  schedulingState?: "pending" | "active" | "paused" | "exhausted" | "failed"
  expiresAt?: string; autoApprove?: boolean; enabled?: boolean; status?: ScheduledTaskStatus
}
export type ScheduledTaskRecord = TaskCommon & (CalendarTrigger | (RssTrigger & {
  feedState?: "initializing" | "active" | "backoff" | "limit_reached"
  lastCheckedAt?: string | null; nextCheckAt?: string | null; errorCode?: string | null
}))
type DraftCommon = { projectId?: string; title: string; prompt: string; expiresAt?: string; autoApprove: boolean }
export type ScheduledTaskDraft = DraftCommon & ((CalendarTrigger & { timezone: string }) | RssTrigger)
export type ScheduledTaskEditorValue = (Omit<DraftCommon, "expiresAt"> & { expiresAt: string | null | undefined }) & ((CalendarTrigger & { timezone: string }) | RssTrigger)
export type ScheduledTaskInitial = { title: string; triggerKind: "calendar" | "rss" } & Partial<ScheduledTaskDraft>
export type ScheduledTaskPatch = Partial<Omit<DraftCommon, "projectId" | "expiresAt"> & {
  triggerKind: "calendar" | "rss"; frequency: ScheduledTaskFrequency; time: string; timezone: string
  weekdays: number[]; monthDays: number[]; localDate: string; feedUrl: string; conditions: ScheduledTaskConditions
  enabled: boolean; status: ScheduledTaskStatus
}> & { expiresAt?: string | null }

/** Clone nested filter intent before dispatch or recovery; callers never share mutable clause objects. */
export function cloneScheduledTaskDraft<T extends ScheduledTaskDraft | ScheduledTaskEditorValue>(draft: T): T {
  return { ...draft, ...(draft.triggerKind === "rss" ? { conditions: draft.conditions.map(group => group.map(clause => ({ ...clause }))) }
    : { ...(draft.weekdays ? { weekdays: [...draft.weekdays] } : {}), ...(draft.monthDays ? { monthDays: [...draft.monthDays] } : {}) }) }
}

export type ScheduledTaskClient = {
  listScheduledTaskRuns?: ScheduledTaskRunsReader
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
  if (!("triggerKind" in value)) return false
  if (value.triggerKind === "rss") {
    if (!validRssRecord(value)) return false
  } else if (value.triggerKind !== "calendar" || !validCalendarRecord(value)) return false
  if ("schedulingState" in value && value.schedulingState !== undefined &&
    (typeof value.schedulingState !== "string" || !["pending", "active", "paused", "exhausted", "failed"].includes(value.schedulingState))) return false
  if ("prompt" in value && value.prompt !== undefined && typeof value.prompt !== "string") return false
  if ("expiresAt" in value && value.expiresAt !== undefined && !isUtcInstant(value.expiresAt)) return false
  if ("autoApprove" in value && value.autoApprove !== undefined && typeof value.autoApprove !== "boolean") return false
  if ("enabled" in value && value.enabled !== undefined && typeof value.enabled !== "boolean") return false
  return !("status" in value && value.status !== undefined &&
    (typeof value.status !== "string" || !["active", "paused", "failed"].includes(value.status)))
}

function validRssRecord(value: object): boolean {
  if (["frequency", "time", "timezone", "weekdays", "monthDays", "localDate"].some(key => Reflect.get(value, key) !== undefined)) return false
  if (!validPublicFeedUrl(Reflect.get(value, "feedUrl")) || !validPreviewConditions(Reflect.get(value, "conditions"))) return false
  if (Reflect.get(value, "nextRun") !== null) return false
  const feedState = Reflect.get(value, "feedState")
  if (feedState !== undefined && (typeof feedState !== "string" || !["initializing", "active", "backoff", "limit_reached"].includes(feedState))) return false
  for (const key of ["lastCheckedAt", "nextCheckAt"]) {
    const instant: unknown = Reflect.get(value, key)
    if (instant !== undefined && instant !== null &&
      (!isUtcInstant(instant) || new Date(instant).toISOString().slice(0, 19) !== instant.slice(0, 19))) return false
  }
  const errorCode = Reflect.get(value, "errorCode")
  return errorCode === undefined || errorCode === null || typeof errorCode === "string" && [
    "rss_feed_url_invalid", "rss_feed_address_forbidden", "rss_feed_dns_unavailable", "rss_feed_dns_busy",
    "rss_feed_unavailable", "rss_feed_timeout", "rss_feed_cancelled", "rss_feed_response_invalid",
    "rss_feed_too_large", "feed_invalid", "queue_full", "launch_too_large", "limit_reached",
  ].includes(errorCode)
}

function validPublicFeedUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || new TextEncoder().encode(value).length > 2048 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false
  try {
    const url = new URL(value)
    const authority = value.match(/^https:\/\/([^/?#]*)/iu)?.[1]
    if (!authority || authority.includes("@") || url.protocol !== "https:" || url.port && url.port !== "443" || value.includes("#")) return false
    const host = url.hostname.toLowerCase()
    return host.length <= 253 && !host.endsWith(".") && host.split(".").length >= 2
      && host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
      && /^[a-z]{2,63}$/u.test(host.split(".").at(-1) ?? "")
      && !["localhost", "local", "internal", "test", "invalid", "example", "onion", "home", "lan", "arpa"].some(suffix => host === suffix || host.endsWith(`.${suffix}`))
  } catch {
    return false
  }
}

function validCalendarRecord(value: object): boolean {
  if (["feedUrl", "conditions", "feedState", "lastCheckedAt", "nextCheckAt", "errorCode"].some(key => Reflect.get(value, key) !== undefined)) return false
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

// Preview has no feed reader. Validate its stored definition shape, never manufacture current poll facts.
function validPreviewConditions(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 8) return false
  const fields = ["title", "summary", "content", "author", "category", "link", "domain"]
  const operators = ["contains", "not_contains", "equals", "not_equals", "starts_with", "not_starts_with", "ends_with", "not_ends_with", "is_empty", "is_not_empty"]
  return value.every(group => Array.isArray(group) && group.length > 0 && group.length <= 16 && group.every((clause: unknown) => {
    if (typeof clause !== "object" || clause === null || Object.keys(clause).some(key => !["field", "operator", "value"].includes(key))) return false
    if (!("field" in clause) || typeof clause.field !== "string" || !fields.includes(clause.field) ||
      !("operator" in clause) || typeof clause.operator !== "string" || !operators.includes(clause.operator)) return false
    if (clause.operator === "is_empty" || clause.operator === "is_not_empty") return !("value" in clause)
    return "value" in clause && typeof clause.value === "string" && clause.value.length > 0 && new TextEncoder().encode(clause.value).length <= 1024
  }))
}
