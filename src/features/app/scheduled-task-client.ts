import { ZodError } from "zod"

import {
  scheduledTaskCreateRequestSchema,
  scheduledTaskDeleteResponseSchema,
  scheduledTaskListResponseSchema,
  scheduledTaskMutationResponseSchema,
  scheduledTaskPath,
  scheduledTaskRetryPath,
  scheduledTaskErrorSchema,
  scheduledTaskPatchRequestSchema,
  scheduledTasksPath,
  type ScheduledTaskRecordResponse,
} from "@/contract/http"
import type { ScheduledTaskDraft } from "./scheduled-task-editor"

export type ScheduledTaskRecord = {
  id: string
  title: string
  prompt?: string
  frequency: "daily" | "weekly"
  time: string
  timezone?: string
  nextRun?: string
  expiresAt?: string
  autoApprove?: boolean
  enabled?: boolean
  status?: "active" | "paused" | "failed"
}

export type ScheduledTaskPatch = Partial<Pick<
  ScheduledTaskRecord,
  "title" | "prompt" | "frequency" | "time" | "timezone" | "expiresAt" | "autoApprove" | "enabled" | "status"
>>

export type ScheduledTaskClient = {
  listScheduledTasks: () => Promise<readonly ScheduledTaskRecord[]>
  createScheduledTask?: (draft: ScheduledTaskDraft) => Promise<ScheduledTaskRecord>
  updateScheduledTask?: (taskId: string, patch: ScheduledTaskPatch) => Promise<ScheduledTaskRecord>
  retryScheduledTask?: (taskId: string) => Promise<ScheduledTaskRecord>
  deleteScheduledTask?: (taskId: string) => Promise<{ ok: true }>
}

export type ScheduledTaskClientFailureReason = "network" | "http" | "parse"

export class ScheduledTaskClientError extends Error {
  readonly reason: ScheduledTaskClientFailureReason
  readonly status: number | null
  readonly code: string | null

  constructor(reason: ScheduledTaskClientFailureReason, message: string, status: number | null, code: string | null = null) {
    super(message)
    this.name = "ScheduledTaskClientError"
    this.reason = reason
    this.status = status
    this.code = code
  }
}

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toRecord(task: ScheduledTaskRecordResponse): ScheduledTaskRecord {
  return {
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    frequency: task.frequency,
    time: task.time,
    timezone: task.timezone,
    nextRun: task.next_run_at,
    expiresAt: task.expires_at,
    autoApprove: task.auto_approve,
    enabled: task.enabled,
    status: task.status,
  }
}

function parseRequest<T>(parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    const message = error instanceof ZodError ? error.message : describeUnknown(error)
    throw new ScheduledTaskClientError("parse", message, null)
  }
}

function createBody(draft: ScheduledTaskDraft) {
  return parseRequest(() => scheduledTaskCreateRequestSchema.parse({
    title: draft.title,
    prompt: draft.prompt,
    frequency: draft.frequency,
    time: draft.time,
    timezone: draft.timezone,
    expires_at: draft.expiresAt,
    auto_approve: draft.autoApprove,
  }))
}

function patchBody(patch: ScheduledTaskPatch) {
  return parseRequest(() => scheduledTaskPatchRequestSchema.parse({
    title: patch.title,
    prompt: patch.prompt,
    frequency: patch.frequency,
    time: patch.time,
    timezone: patch.timezone,
    expires_at: patch.expiresAt,
    auto_approve: patch.autoApprove,
    enabled: patch.enabled,
    status: patch.status,
  }))
}

function idempotencyKey(prefix: string, taskId?: string): string {
  const entropy = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${taskId ?? entropy}:${entropy}`
}

async function readHttpError(response: Response): Promise<ScheduledTaskClientError> {
  let message = `scheduled task request failed with status ${response.status}`
  let code: string | null = null
  try {
    const parsed = scheduledTaskErrorSchema.safeParse(await response.json())
    if (parsed.success) {
      message = parsed.data.error
      code = parsed.data.code ?? null
    }
  } catch {
    // Keep the stable status description when the error body is not JSON.
  }
  return new ScheduledTaskClientError("http", message, response.status, code)
}

async function request<T>(fetcher: typeof fetch, url: string, schema: { parse: (value: unknown) => T }, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetcher(url, { cache: "no-store", ...init })
  } catch (error) {
    throw new ScheduledTaskClientError("network", describeUnknown(error), null)
  }
  if (!response.ok) throw await readHttpError(response)
  try {
    return schema.parse(await response.json())
  } catch (error) {
    const message = error instanceof ZodError ? error.message : describeUnknown(error)
    throw new ScheduledTaskClientError("parse", message, response.status)
  }
}

export function createScheduledTaskClient(fetcher: typeof fetch = fetch): ScheduledTaskClient {
  return {
    listScheduledTasks: async () => {
      const response = await request(fetcher, scheduledTasksPath(), scheduledTaskListResponseSchema)
      return response.tasks.map(toRecord)
    },
    createScheduledTask: async (draft) => {
      const response = await request(fetcher, scheduledTasksPath(), scheduledTaskMutationResponseSchema, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey("scheduled-create") },
        body: JSON.stringify(createBody(draft)),
      })
      return toRecord(response.task)
    },
    updateScheduledTask: async (taskId, patch) => {
      const response = await request(fetcher, scheduledTaskPath(taskId), scheduledTaskMutationResponseSchema, {
        method: "PATCH",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey("scheduled-update", taskId) },
        body: JSON.stringify(patchBody(patch)),
      })
      return toRecord(response.task)
    },
    retryScheduledTask: async (taskId) => {
      const response = await request(fetcher, scheduledTaskRetryPath(taskId), scheduledTaskMutationResponseSchema, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey("scheduled-retry", taskId) },
      })
      return toRecord(response.task)
    },
    deleteScheduledTask: (taskId) => request(fetcher, scheduledTaskPath(taskId), scheduledTaskDeleteResponseSchema, {
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey("scheduled-delete", taskId) },
    }),
  }
}
