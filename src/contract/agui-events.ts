// Web ↔ BFF streaming wire contract. This module validates canonical AG-UI
// frames only; reducer/UI projection belongs to the engine adapter.

import { EventSchemas, EventType } from "@ag-ui/core"
import { z } from "zod"

export const eventCursorSchema = z.string().regex(/^agui_[0-9a-f]{32}$/u)
export type EventCursor = z.infer<typeof eventCursorSchema>

export const kokoroAgUiMetadataSchema = z
  .object({
    event_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    session_id: z.string().min(1),
    run_id: z.string().min(1).nullable(),
    timestamp: z.string().datetime({ offset: true }),
  })
  .strict()

const base = z
  .object({
    timestamp: z.number().int().nonnegative(),
    metadata: z.object({ kokoro: kokoroAgUiMetadataSchema }).strict(),
  })
  .strict()

const eventSchema = z.discriminatedUnion("type", [
  base.extend({
    type: z.literal(EventType.RUN_STARTED),
    threadId: z.string().min(1),
    runId: z.string().min(1),
  }),
  base.extend({
    type: z.literal(EventType.RUN_FINISHED),
    threadId: z.string().min(1),
    runId: z.string().min(1),
    usage: z.array(z.record(z.unknown())).optional(),
  }),
  base.extend({
    type: z.literal(EventType.RUN_ERROR),
    message: z.string().min(1),
    code: z.string().min(1).optional(),
  }),
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
  }),
  base.extend({
    type: z.literal(EventType.CUSTOM),
    name: z.string().min(1),
    value: z.unknown(),
  }),
])

export const agUiEventSchema = eventSchema.superRefine((event, context) => {
  if (event.type !== EventType.RUN_STARTED && event.type !== EventType.RUN_FINISHED) {
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
