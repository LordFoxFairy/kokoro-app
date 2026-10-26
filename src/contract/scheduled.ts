// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

const utcInstantSchema = z.string().datetime({ offset: false })
const ianaTimezoneSchema = z.string().min(1).refine(isIanaTimezone, "Invalid IANA timezone")
const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((value) => new Set(value).size === value.length)
const monthDaysSchema = z
  .array(z.number().int().min(1).max(31))
  .min(1)
  .max(31)
  .refine((value) => new Set(value).size === value.length)
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !value.startsWith("0000-") && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })
const schedulingStateSchema = z.enum(["pending", "active", "paused", "exhausted", "failed"])
type CalendarRule = {
  frequency?: string | undefined
  weekdays?: number[] | undefined
  month_days?: number[] | undefined
  local_date?: string | undefined
}
function completeCalendarRule(value: CalendarRule): boolean {
  const fields = [value.weekdays !== undefined, value.month_days !== undefined, value.local_date !== undefined]
  if (value.frequency === "daily") return fields.every((field) => !field)
  const index = ["weekly", "monthly", "once"].indexOf(value.frequency ?? "")
  return index >= 0 && fields.every((field, position) => field === (position === index))
}
const projectReferenceSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, "Project reference must not contain leading or trailing whitespace")

export const scheduledRssFields = ["title", "summary", "content", "author", "category", "link", "domain"] as const
export const scheduledRssOperators = ["contains", "not_contains", "equals", "not_equals", "starts_with", "not_starts_with", "ends_with", "not_ends_with", "is_empty", "is_not_empty"] as const
export const scheduledRssConditionSchema = z.object({
  field: z.enum(scheduledRssFields), operator: z.enum(scheduledRssOperators),
  value: z.string().min(1).refine(value => new TextEncoder().encode(value).length <= 1024).optional(),
}).strict().refine(value => ["is_empty", "is_not_empty"].includes(value.operator) ? value.value === undefined : value.value !== undefined)
export const scheduledRssConditionsSchema = z.array(z.array(scheduledRssConditionSchema).min(1).max(16)).max(8)
export type ScheduledRssCondition = z.infer<typeof scheduledRssConditionSchema>
export const scheduledRssFeedUrlSchema = z.string().refine(value => {
  if (!value || new TextEncoder().encode(value).length > 2048 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false
  try {
    const url = new URL(value)
    const authority = value.match(/^https:\/\/([^/?#]*)/iu)?.[1]
    if (!authority || authority.includes("@") || url.protocol !== "https:" || url.port && url.port !== "443" || value.includes("#")) return false
    const host = url.hostname.toLowerCase()
    return host.length <= 253 && !host.endsWith(".") && host.split(".").length >= 2
      && host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
      && /^[a-z]{2,63}$/u.test(host.split(".").at(-1) ?? "")
      && !["localhost", "local", "internal", "test", "invalid", "example", "onion", "home", "lan", "arpa"].some(suffix => host === suffix || host.endsWith(`.${suffix}`))
  } catch { return false }
}, "Invalid public HTTPS feed URL")
const calendarFields = {
  trigger_kind: z.literal("calendar"), frequency: z.enum(["daily", "weekly", "monthly", "once"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: ianaTimezoneSchema,
  weekdays: weekdaysSchema.optional(), month_days: monthDaysSchema.optional(), local_date: localDateSchema.optional(),
}
const rssFields = { trigger_kind: z.literal("rss"), feed_url: scheduledRssFeedUrlSchema, conditions: scheduledRssConditionsSchema }
const { trigger_kind: calendarKind, ...calendarDefinition } = calendarFields
const { trigger_kind: rssKind, ...rssDefinition } = rssFields
const recordCommon = {
  id: z.string().min(1), project_id: projectReferenceSchema.optional(), title: z.string().min(1), prompt: z.string(),
  expires_at: utcInstantSchema.optional(), auto_approve: z.boolean(), enabled: z.boolean(), status: z.enum(["active", "paused", "failed"]),
}
const calendarRecord = z.object({ ...recordCommon, ...calendarFields, next_run_at: utcInstantSchema.nullable() }).strict().refine(completeCalendarRule)
const rssRecord = z.object({ ...recordCommon, ...rssFields, next_run_at: z.null() }).strict()
export const scheduledTaskRecordSchema = z.union([calendarRecord, rssRecord])
export type ScheduledTaskRecordResponse = z.infer<typeof scheduledTaskRecordSchema>
const rssErrorSchema = z.enum(["rss_feed_url_invalid", "rss_feed_address_forbidden", "rss_feed_dns_unavailable", "rss_feed_dns_busy", "rss_feed_unavailable", "rss_feed_timeout", "rss_feed_cancelled", "rss_feed_response_invalid", "rss_feed_too_large", "feed_invalid", "queue_full", "launch_too_large", "limit_reached"]).nullable()
// Current facts belong only to authoritative reads, never immutable command receipts.
export const scheduledTaskDetailsSchema = z.union([
  z.object({ ...recordCommon, ...calendarFields, next_run_at: utcInstantSchema.nullable(), scheduling_state: schedulingStateSchema }).strict().refine(completeCalendarRule),
  z.object({ ...recordCommon, ...rssFields, next_run_at: z.null(), scheduling_state: schedulingStateSchema,
    feed_state: z.enum(["initializing", "active", "backoff", "limit_reached"]), last_checked_at: utcInstantSchema.nullable(),
    next_check_at: utcInstantSchema.nullable(), error_code: rssErrorSchema }).strict(),
])
export type ScheduledTaskDetailsResponse = z.infer<typeof scheduledTaskDetailsSchema>
export const scheduledTaskDetailResponseSchema = z.object({ task: scheduledTaskDetailsSchema }).strict()
export const scheduledTaskListResponseSchema = z.object({ tasks: z.array(scheduledTaskDetailsSchema) }).strict()
export type ScheduledTaskListResponse = z.infer<typeof scheduledTaskListResponseSchema>
const createCommon = { project_id: projectReferenceSchema.optional(), title: z.string().min(1), prompt: z.string().min(1) }
const createTail = { expires_at: utcInstantSchema.optional(), auto_approve: z.boolean() }
export const scheduledTaskCreateRequestSchema = z.union([
  z.object({ trigger_kind: calendarKind, ...createCommon, ...calendarDefinition, ...createTail }).strict().refine(completeCalendarRule),
  z.object({ trigger_kind: rssKind, ...createCommon, ...rssDefinition, ...createTail }).strict(),
])
export type ScheduledTaskCreateRequest = z.infer<typeof scheduledTaskCreateRequestSchema>
const patchCommon = { title: z.string().min(1).optional(), prompt: z.string().min(1).optional(), expires_at: utcInstantSchema.nullable().optional(), auto_approve: z.boolean().optional(), enabled: z.boolean().optional(), status: z.enum(["active", "paused", "failed"]).optional() }
export const scheduledTaskPatchRequestSchema = z.union([
  z.object(patchCommon).strict(),
  z.object({ ...patchCommon, ...calendarFields }).strict().refine(completeCalendarRule),
  z.object({ ...patchCommon, ...rssFields }).strict(),
])
export type ScheduledTaskPatchRequest = z.infer<typeof scheduledTaskPatchRequestSchema>

export const scheduledTaskMutationResponseSchema = z.object({ task: scheduledTaskRecordSchema }).strict()
export type ScheduledTaskMutationResponse = z.infer<typeof scheduledTaskMutationResponseSchema>

export const scheduledTaskDeleteResponseSchema = z.object({ ok: z.literal(true) }).strict()
export type ScheduledTaskDeleteResponse = z.infer<typeof scheduledTaskDeleteResponseSchema>

export const scheduledTaskErrorSchema = z
  .object({
    error: z.string().min(1),
    code: z.string().min(1).optional(),
  })
  .strict()
export type ScheduledTaskError = z.infer<typeof scheduledTaskErrorSchema>
