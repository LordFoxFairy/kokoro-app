// Web ↔ BFF streaming wire contract. This module validates canonical AG-UI
// frames only; reducer/UI projection belongs to the engine adapter.

import { EventSchemas, EventType, RunFinishedOutcomeSchema } from "@ag-ui/core"
import { z } from "zod"

import { interactionStateSchema } from "./control"
import { agentFailureCodeSchema, agentFailureProfileSchema } from "./agent-failure"

export const eventCursorSchema = z.string().regex(/^agui_[0-9a-f]{32}$/u)
export type EventCursor = z.infer<typeof eventCursorSchema>

const nonblankString = z.string().min(1).refine((value) => value.trim().length > 0, "must not be blank")

export const kokoroAgUiMetadataSchema = z
  .object({
    event_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    session_id: z.string().min(1),
    run_id: z.string().min(1).nullable(),
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict()

const agentRunErrorMetadataSchema = kokoroAgUiMetadataSchema
  .extend({
    run_id: nonblankString,
    failure: agentFailureProfileSchema,
  })
  .strict()

const dispatchRunErrorMetadataSchema = z
  .object({
    event_id: z.string().min(1),
    seq: z.string().regex(/^[1-9][0-9]*$/u),
    source_owner: z.literal("kokoro-bff"),
    session_id: z.string().min(1),
    run_id: nonblankString,
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict()

const base = z
  .object({
    timestamp: z.number().int().nonnegative(),
    metadata: z.object({ kokoro: kokoroAgUiMetadataSchema }).strict(),
  })
  .strict()

const runStartedSchema = base.extend({
  type: z.literal(EventType.RUN_STARTED),
  threadId: z.string().min(1),
  runId: z.string().min(1),
})

const runFinishedSchema = base.extend({
  type: z.literal(EventType.RUN_FINISHED),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  // BFF's completed/cancelled projection carries an explicit status and
  // canonical AG-UI outcome. Keep both declared rather than accepting
  // arbitrary top-level fields from an untrusted stream.
  status: z.enum(["completed", "cancelled"]).optional(),
  result: z.unknown().optional(),
  outcome: RunFinishedOutcomeSchema.optional(),
  usage: z.array(z.record(z.unknown())).optional(),
})

const agentRunErrorSchema = z
  .object({
    type: z.literal(EventType.RUN_ERROR),
    timestamp: z.number().int().nonnegative(),
    threadId: z.string().min(1),
    runId: nonblankString,
    message: z.literal("Agent run failed"),
    code: agentFailureCodeSchema,
    metadata: z.object({ kokoro: agentRunErrorMetadataSchema }).strict(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.code !== event.metadata.kokoro.failure.code) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: "code must match metadata failure" })
    }
  })

const dispatchRunErrorSchema = z
  .object({
    type: z.literal(EventType.RUN_ERROR),
    timestamp: z.number().int().nonnegative(),
    threadId: z.string().min(1),
    runId: nonblankString,
    message: z.literal("Agent launch could not be confirmed"),
    code: nonblankString,
    metadata: z.object({ kokoro: dispatchRunErrorMetadataSchema }).strict(),
  })
  .strict()

const eventSchema = z.union([
  runStartedSchema,
  runFinishedSchema,
  agentRunErrorSchema,
  dispatchRunErrorSchema,
  base.extend({
    type: z.literal(EventType.TEXT_MESSAGE_START),
    messageId: z.string().min(1),
    role: z.literal("assistant"),
  }),
  base.extend({
    type: z.literal(EventType.TEXT_MESSAGE_CONTENT),
    messageId: z.string().min(1),
    delta: z.string(),
  }),
  base.extend({
    type: z.literal(EventType.TEXT_MESSAGE_END),
    messageId: z.string().min(1),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_START),
    toolCallId: z.string().min(1),
    toolCallName: z.string().min(1),
    parentMessageId: z.string().min(1).optional(),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_ARGS),
    toolCallId: z.string().min(1),
    delta: z.string(),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_END),
    toolCallId: z.string().min(1),
  }),
  base.extend({
    type: z.literal(EventType.TOOL_CALL_RESULT),
    messageId: z.string().min(1),
    toolCallId: z.string().min(1),
    content: z.string(),
    role: z.literal("tool").optional(),
    isError: z.boolean().optional(),
  }),
  z.object({
    type: z.literal(EventType.CUSTOM), name: z.literal("kokoro.run.queued"),
    value: z.object({ run_id: nonblankString, dispatch_sequence: z.string().regex(/^[1-9][0-9]*$/u) }).strict(),
    timestamp: z.number().int().nonnegative(), metadata: z.object({ kokoro: dispatchRunErrorMetadataSchema }).strict(),
  }).strict().superRefine((event, context) => {
    if (event.value.run_id !== event.metadata.kokoro.run_id || event.value.dispatch_sequence !== event.metadata.kokoro.seq) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Queued source identity mismatch" })
    }
  }),
  base.extend({ type: z.literal(EventType.CUSTOM), name: z.literal("kokoro.interaction.state"), value: interactionStateSchema }),
  base.extend({
    type: z.literal(EventType.CUSTOM),
    name: z.enum(["kokoro.delivery.created", "kokoro.subagent.started", "kokoro.subagent.finished", "kokoro.session.created", "kokoro.todo.updated", "kokoro.message.user"]),
    value: z.unknown(),
  }),
])

export const agUiEventSchema = eventSchema.superRefine((event, context) => {
  if (event.type !== EventType.RUN_STARTED && event.type !== EventType.RUN_FINISHED && event.type !== EventType.RUN_ERROR) {
    return
  }
  const metadata = event.metadata.kokoro
  if (event.threadId !== metadata.session_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["threadId"],
      message: "threadId must match metadata.kokoro.session_id",
    })
  }
  if (event.runId !== metadata.run_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["runId"],
      message: "runId must match metadata.kokoro.run_id",
    })
  }
})

export type AgUiEvent = z.infer<typeof agUiEventSchema>
export type KokoroAgUiMetadata = z.infer<typeof kokoroAgUiMetadataSchema>

export function parseAgUiEvent(input: unknown): AgUiEvent {
  // The upstream package checks the standard event lifecycle shape first;
  // the local schema then requires Kokoro's replay metadata and supported set.
  EventSchemas.parse(input)
  return agUiEventSchema.parse(input)
}
