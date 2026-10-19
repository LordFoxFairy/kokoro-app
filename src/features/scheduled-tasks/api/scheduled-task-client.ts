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
  type ScheduledTaskDetailsResponse,
} from "@/contract/http"
import type {
  ScheduledTaskClient,
  ScheduledTaskDraft,
  ScheduledTaskPatch,
  ScheduledTaskRecord,
} from "../model/scheduled-task"

export type ScheduledTaskClientFailureReason = "network" | "http" | "parse"

export class ScheduledTaskClientError extends Error {
  readonly reason: ScheduledTaskClientFailureReason
  readonly status: number | null
  readonly code: string | null

  constructor(
    reason: ScheduledTaskClientFailureReason,
    message: string,
    status: number | null,
    code: string | null = null,
  ) {
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
  const record: ScheduledTaskRecord = {
    id: task.id,
    title: task.title,
    frequency: task.frequency,
    time: task.time,
    nextRun: task.next_run_at,
  }
  if (task.project_id !== undefined) record.projectId = task.project_id
  if (task.prompt !== undefined) record.prompt = task.prompt
  if (task.timezone !== undefined) record.timezone = task.timezone
  if (task.expires_at !== undefined) record.expiresAt = task.expires_at
  if (task.auto_approve !== undefined) record.autoApprove = task.auto_approve
  if (task.enabled !== undefined) record.enabled = task.enabled
  if (task.status !== undefined) record.status = task.status
  if (task.weekdays !== undefined) record.weekdays = [...task.weekdays]
  if (task.month_days !== undefined) record.monthDays = [...task.month_days]
  if (task.local_date !== undefined) record.localDate = task.local_date
  return record
}

function toDetails(task: ScheduledTaskDetailsResponse): ScheduledTaskRecord {
  return { ...toRecord(task), schedulingState: task.scheduling_state }
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
  return parseRequest(() =>
    scheduledTaskCreateRequestSchema.parse({
      ...(draft.projectId === undefined ? {} : { project_id: draft.projectId }),
      title: draft.title,
      prompt: draft.prompt,
      frequency: draft.frequency,
      time: draft.time,
      timezone: draft.timezone,
      ...(draft.weekdays === undefined ? {} : { weekdays: draft.weekdays }),
      ...(draft.monthDays === undefined ? {} : { month_days: draft.monthDays }),
      ...(draft.localDate === undefined ? {} : { local_date: draft.localDate }),
      auto_approve: draft.autoApprove,
      ...(draft.expiresAt === undefined ? {} : { expires_at: draft.expiresAt }),
    }),
  )
}

function patchBody(patch: ScheduledTaskPatch) {
  return parseRequest(() =>
    scheduledTaskPatchRequestSchema.parse({
      title: patch.title,
      prompt: patch.prompt,
      frequency: patch.frequency,
      time: patch.time,
      timezone: patch.timezone,
      weekdays: patch.weekdays,
      month_days: patch.monthDays,
      local_date: patch.localDate,
      expires_at: patch.expiresAt,
      auto_approve: patch.autoApprove,
      enabled: patch.enabled,
      status: patch.status,
    }),
  )
}

function createIdempotencyKey(prefix: string, taskId?: string): string {
  const entropy =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${taskId ?? entropy}:${entropy}`
}

export function isUnknownScheduledTaskResult(error: unknown): boolean {
  return (
    error instanceof ScheduledTaskClientError &&
    (error.reason === "network" ||
      (error.reason === "parse" && error.status !== null) ||
      (error.status !== null && (error.status >= 500 || error.status === 408 || error.status === 425)) ||
      error.code === "idempotency_in_progress")
  )
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

async function request<T>(
  fetcher: typeof fetch,
  url: string,
  schema: { parse: (value: unknown) => T },
  init?: RequestInit,
  admission?: () => number | null,
): Promise<T> {
  const generation = admission?.()
  const assertCurrent = () => {
    if (admission && (generation === null || admission() !== generation)) {
      throw new ScheduledTaskClientError("network", "Scheduled task admission changed; result is unconfirmed", null)
    }
  }
  assertCurrent()
  let response: Response
  try {
    response = await fetcher(url, { cache: "no-store", ...init })
  } catch (error) {
    throw new ScheduledTaskClientError("network", describeUnknown(error), null)
  }
  assertCurrent()
  if (!response.ok) {
    const error = await readHttpError(response)
    assertCurrent()
    throw error
  }
  try {
    const raw = await response.json()
    assertCurrent()
    return schema.parse(raw)
  } catch (error) {
    if (error instanceof ScheduledTaskClientError) throw error
    const message = error instanceof ZodError ? error.message : describeUnknown(error)
    throw new ScheduledTaskClientError("parse", message, response.status)
  }
}

type MutationRequest<T> = {
  operation: "create" | "update" | "retry" | "delete"
  taskId?: string
  body?: unknown
  url: string
  method: "POST" | "PATCH" | "DELETE"
  schema: { parse: (value: unknown) => T }
  accepts?: (value: T) => boolean
}

type CommandIdentity = {
  key: string
  unknown: boolean
  pending?: Promise<unknown>
}

async function requestMutation<T>(
  fetcher: typeof fetch,
  identities: Map<string, CommandIdentity>,
  mutation: MutationRequest<T>,
  admission?: () => number | null,
): Promise<T> {
  const serializedBody = mutation.body === undefined ? "" : JSON.stringify(mutation.body)
  const fingerprint = `${mutation.operation}:${mutation.taskId ?? "new"}:${serializedBody}`
  const identity: CommandIdentity = identities.get(fingerprint) ?? {
    key: createIdempotencyKey(`scheduled-${mutation.operation}`, mutation.taskId),
    unknown: false,
  }
  if (identity.pending) return mutation.schema.parse(await identity.pending)
  identities.set(fingerprint, identity)
  const headers: Record<string, string> = { "Idempotency-Key": identity.key }
  if (mutation.body !== undefined) headers["content-type"] = "application/json"
  identity.pending = (async () => {
    try {
      const response = await request(
        fetcher,
        mutation.url,
        mutation.schema,
        {
          method: mutation.method,
          headers,
          ...(mutation.body === undefined ? {} : { body: serializedBody }),
        },
        admission,
      )
      if (mutation.accepts && !mutation.accepts(response)) {
        throw new ScheduledTaskClientError("parse", "Scheduled task receipt does not match its target", 200)
      }
      identities.delete(fingerprint)
      return response
    } catch (error) {
      if (isUnknownScheduledTaskResult(error)) identity.unknown = true
      if (!identity.unknown) identities.delete(fingerprint)
      throw error
    } finally {
      delete identity.pending
    }
  })()
  return mutation.schema.parse(await identity.pending)
}

// Browser-only frozen intents live with the actor-scoped transport, not a
// modal. A new actor receives a new client and cannot discover old drafts.
const pendingCreates = new WeakMap<ScheduledTaskClient, Map<string, ScheduledTaskDraft>>()
const contextKey = (projectId?: string) => JSON.stringify([projectId ?? null])
export function pendingScheduledTaskCreate(
  client: ScheduledTaskClient,
  projectId?: string,
): ScheduledTaskDraft | undefined {
  const draft = pendingCreates.get(client)?.get(contextKey(projectId))
  return draft ? cloneDraft(draft) : undefined
}

function cloneDraft(draft: ScheduledTaskDraft): ScheduledTaskDraft {
  return {
    ...draft,
    ...(draft.weekdays === undefined ? {} : { weekdays: [...draft.weekdays] }),
    ...(draft.monthDays === undefined ? {} : { monthDays: [...draft.monthDays] }),
  }
}

async function createTask(
  fetcher: typeof fetch,
  commandIdentities: Map<string, CommandIdentity>,
  creates: Map<string, ScheduledTaskDraft>,
  admission: (() => number | null) | undefined,
  input: ScheduledTaskDraft,
): Promise<ScheduledTaskRecord> {
  const draft = cloneDraft(input)
  const body = createBody(draft)
  const context = contextKey(draft.projectId)
  const pending = creates.get(context)
  if (pending && JSON.stringify(createBody(pending)) !== JSON.stringify(body)) {
    throw new ScheduledTaskClientError("network", "Recover the original scheduled create before replacing it", null)
  }
  creates.set(context, draft)
  try {
    const response = await requestMutation(
      fetcher,
      commandIdentities,
      {
        operation: "create",
        url: scheduledTasksPath(),
        method: "POST",
        schema: scheduledTaskMutationResponseSchema,
        // The request may name a slug; the BFF returns its canonical ID.
        accepts: (response) => (response.task.project_id !== undefined) === (draft.projectId !== undefined),
        body,
      },
      admission,
    )
    creates.delete(context)
    return toRecord(response.task)
  } catch (error) {
    if (!pending && !isUnknownScheduledTaskResult(error)) creates.delete(context)
    throw error
  }
}

export function createScheduledTaskClient(
  fetcher: typeof fetch = fetch,
  admission?: () => number | null,
): ScheduledTaskClient {
  const commandIdentities = new Map<string, CommandIdentity>()
  const creates = new Map<string, ScheduledTaskDraft>()
  const client: ScheduledTaskClient = {
    listScheduledTasks: async () => {
      const response = await request(
        fetcher,
        scheduledTasksPath(),
        scheduledTaskListResponseSchema,
        undefined,
        admission,
      )
      return response.tasks.map(toDetails)
    },
    createScheduledTask: (input) => createTask(fetcher, commandIdentities, creates, admission, input),
    updateScheduledTask: async (taskId, patch) => {
      const response = await requestMutation(
        fetcher,
        commandIdentities,
        {
          operation: "update",
          taskId,
          accepts: (response) => response.task.id === taskId,
          url: scheduledTaskPath(taskId),
          method: "PATCH",
          schema: scheduledTaskMutationResponseSchema,
          body: patchBody(patch),
        },
        admission,
      )
      return toRecord(response.task)
    },
    retryScheduledTask: async (taskId) => {
      const response = await requestMutation(
        fetcher,
        commandIdentities,
        {
          operation: "retry",
          taskId,
          accepts: (response) => response.task.id === taskId,
          url: scheduledTaskRetryPath(taskId),
          method: "POST",
          schema: scheduledTaskMutationResponseSchema,
        },
        admission,
      )
      return toRecord(response.task)
    },
    deleteScheduledTask: (taskId) =>
      requestMutation(
        fetcher,
        commandIdentities,
        {
          operation: "delete",
          taskId,
          url: scheduledTaskPath(taskId),
          method: "DELETE",
          schema: scheduledTaskDeleteResponseSchema,
        },
        admission,
      ),
  }
  pendingCreates.set(client, creates)
  return client
}
