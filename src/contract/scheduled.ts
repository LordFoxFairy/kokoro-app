// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

import { zListScheduledTaskExecutionsResponse, zScheduledTaskExecution } from "@/generated/bff-scheduled-executions/zod.gen"

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
const taskRevisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const executionActorSchema = z.string().min(1).nullable()
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

export const scheduledTaskRecordSchema = z
  .object({
    id: z.string().min(1),
    revision: taskRevisionSchema.optional(),
    execution_actor_id: executionActorSchema.optional(),
    project_id: projectReferenceSchema.optional(),
    title: z.string().min(1),
    prompt: z.string(),
    frequency: z.enum(["daily", "weekly", "monthly", "once"]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: ianaTimezoneSchema,
    weekdays: weekdaysSchema.optional(),
    month_days: monthDaysSchema.optional(),
    local_date: localDateSchema.optional(),
    scheduling_state: schedulingStateSchema.optional(),
    next_run_at: utcInstantSchema.nullable(),
    expires_at: utcInstantSchema.optional(),
    auto_approve: z.boolean(),
    enabled: z.boolean(),
    status: z.enum(["active", "paused", "failed"]),
  })
  .strict()
export type ScheduledTaskRecordResponse = z.infer<typeof scheduledTaskRecordSchema>

// Current reads carry saved rule facts; immutable command receipts keep their original snapshot shape.
export const scheduledTaskDetailsSchema = scheduledTaskRecordSchema
  .extend({
    scheduling_state: schedulingStateSchema,
    revision: taskRevisionSchema,
    execution_actor_id: executionActorSchema,
  })
  .strict()
  .refine(completeCalendarRule, "Incomplete or conflicting calendar rule")
export type ScheduledTaskDetailsResponse = z.infer<typeof scheduledTaskDetailsSchema>
export const scheduledTaskDetailResponseSchema = z.object({ task: scheduledTaskDetailsSchema }).strict()
export const scheduledTaskListResponseSchema = z.object({ tasks: z.array(scheduledTaskDetailsSchema) }).strict()
export type ScheduledTaskListResponse = z.infer<typeof scheduledTaskListResponseSchema>

const scheduledTaskCreateFields = z
  .object({
    project_id: projectReferenceSchema.optional(),
    title: z.string().min(1),
    prompt: z.string().min(1),
    frequency: z.enum(["daily", "weekly", "monthly", "once"]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: ianaTimezoneSchema,
    weekdays: weekdaysSchema.optional(),
    month_days: monthDaysSchema.optional(),
    local_date: localDateSchema.optional(),
    expires_at: utcInstantSchema.optional(),
    auto_approve: z.boolean(),
  })
  .strict()
export const scheduledTaskCreateRequestSchema = scheduledTaskCreateFields.refine(
  completeCalendarRule,
  "Incomplete or conflicting calendar rule",
)
export type ScheduledTaskCreateRequest = z.infer<typeof scheduledTaskCreateRequestSchema>

export const scheduledTaskPatchRequestSchema = scheduledTaskCreateFields
  .omit({ project_id: true })
  .partial()
  .extend({
    expires_at: utcInstantSchema.nullable().optional(),
    enabled: z.boolean().optional(),
    status: z.enum(["active", "paused", "failed"]).optional(),
  })
  .strict()
  .refine((value) => {
    const changedRule = [
      value.frequency,
      value.time,
      value.timezone,
      value.weekdays,
      value.month_days,
      value.local_date,
    ].some((field) => field !== undefined)
    return (
      !changedRule ||
      (value.frequency !== undefined &&
        value.time !== undefined &&
        value.timezone !== undefined &&
        completeCalendarRule(value))
    )
  }, "Calendar changes require the complete selected rule")
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

// Wire fields and closed states come from the pinned owner operation; these checks protect browser links.
function hasValidExecutionReferences(value: z.infer<typeof zScheduledTaskExecution>): boolean {
  return (value.conversation_id === null) === (value.assistant_message_id === null)
    && [value.conversation_id, value.assistant_message_id].every(reference => reference === null || reference.length > 0)
    && (value.project_id === null || projectReferenceSchema.safeParse(value.project_id).success)
}
export const scheduledTaskExecutionSchema = zScheduledTaskExecution.refine(
  hasValidExecutionReferences,
  "A result link requires both valid Conversation and assistant Message references",
)
export type ScheduledTaskExecutionResponse = z.infer<typeof scheduledTaskExecutionSchema>
export const scheduledTaskExecutionListResponseSchema = zListScheduledTaskExecutionsResponse.shape.data.refine(
  value => value.executions.every(hasValidExecutionReferences) && value.next_cursor !== "",
  "Invalid execution references or empty cursor",
)

export const scheduledTaskListQuerySchema = z.object({ projectId: projectReferenceSchema.optional() }).strict()
export const scheduledTaskExecutionQuerySchema = scheduledTaskListQuerySchema.extend({
  taskId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict()
