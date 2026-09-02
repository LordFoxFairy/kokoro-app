// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

export const scheduledTaskRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().optional(),
  frequency: z.enum(["daily", "weekly"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).optional(),
  next_run_at: z.string().min(1).optional(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  auto_approve: z.boolean().optional(),
  enabled: z.boolean().optional(),
  status: z.enum(["active", "paused", "failed"]).optional(),
}).strict()
export type ScheduledTaskRecordResponse = z.infer<typeof scheduledTaskRecordSchema>

export const scheduledTaskListResponseSchema = z.object({ tasks: z.array(scheduledTaskRecordSchema) }).strict()
export type ScheduledTaskListResponse = z.infer<typeof scheduledTaskListResponseSchema>

export const scheduledTaskCreateRequestSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  frequency: z.enum(["daily", "weekly"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  auto_approve: z.boolean(),
}).strict()
export type ScheduledTaskCreateRequest = z.infer<typeof scheduledTaskCreateRequestSchema>

export const scheduledTaskPatchRequestSchema = scheduledTaskCreateRequestSchema.partial().extend({
  enabled: z.boolean().optional(),
  status: z.enum(["active", "paused", "failed"]).optional(),
}).strict()
export type ScheduledTaskPatchRequest = z.infer<typeof scheduledTaskPatchRequestSchema>

export const scheduledTaskMutationResponseSchema = z.object({ task: scheduledTaskRecordSchema }).strict()
export type ScheduledTaskMutationResponse = z.infer<typeof scheduledTaskMutationResponseSchema>

export const scheduledTaskDeleteResponseSchema = z.object({ ok: z.literal(true) }).strict()
export type ScheduledTaskDeleteResponse = z.infer<typeof scheduledTaskDeleteResponseSchema>

export const scheduledTaskErrorSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1).optional(),
}).strict()
export type ScheduledTaskError = z.infer<typeof scheduledTaskErrorSchema>
