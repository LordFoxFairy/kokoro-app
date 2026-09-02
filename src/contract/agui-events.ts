import { EventSchemas, EventType } from "@ag-ui/core"
import { z } from "zod"

import { parseSessionEvent, type SessionEvent } from "./session-events"

const kokoroMetadataSchema = z
  .object({
    event_id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    session_id: z.string().min(1),
    run_id: z.string().min(1).nullable(),
    timestamp: z.string().min(1),
  })
  .strict()

const base = z.object({
  timestamp: z.number().int().nonnegative().optional(),
  metadata: z.object({ kokoro: kokoroMetadataSchema }).strict(),
})

export const agUiEventSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal(EventType.RUN_STARTED), threadId: z.string().min(1), runId: z.string().min(1) }),
  base.extend({ type: z.literal(EventType.RUN_FINISHED), threadId: z.string().min(1), runId: z.string().min(1), usage: z.array(z.record(z.unknown())).optional() }),
  base.extend({ type: z.literal(EventType.RUN_ERROR), message: z.string().min(1), code: z.string().min(1).optional() }),
  base.extend({ type: z.literal(EventType.TEXT_MESSAGE_START), messageId: z.string().min(1), role: z.literal("assistant") }),
  base.extend({ type: z.literal(EventType.TEXT_MESSAGE_CONTENT), messageId: z.string().min(1), delta: z.string() }),
  base.extend({ type: z.literal(EventType.TEXT_MESSAGE_END), messageId: z.string().min(1) }),
  base.extend({ type: z.literal(EventType.TOOL_CALL_START), toolCallId: z.string().min(1), toolCallName: z.string().min(1), parentMessageId: z.string().min(1).optional() }),
  base.extend({ type: z.literal(EventType.TOOL_CALL_ARGS), toolCallId: z.string().min(1), delta: z.string() }),
  base.extend({ type: z.literal(EventType.TOOL_CALL_END), toolCallId: z.string().min(1) }),
  base.extend({ type: z.literal(EventType.TOOL_CALL_RESULT), messageId: z.string().min(1), toolCallId: z.string().min(1), content: z.string(), role: z.literal("tool").optional() }),
  base.extend({ type: z.literal(EventType.CUSTOM), name: z.string().min(1), value: z.unknown() }),
])

type AgUiEvent = z.infer<typeof agUiEventSchema>
type KokoroMetadata = z.infer<typeof kokoroMetadataSchema>

function metadataOf(event: AgUiEvent): KokoroMetadata {
  return event.metadata.kokoro
}

function envelope(event: AgUiEvent, kind: SessionEvent["kind"], payload: Record<string, unknown>): SessionEvent {
  const metadata = metadataOf(event)
  return parseSessionEvent({
    event_id: `${metadata.event_id}:${event.type}`,
    seq: metadata.seq,
    session_id: metadata.session_id,
    run_id: metadata.run_id ?? `run:unavailable:${metadata.session_id}`,
    timestamp: metadata.timestamp,
    kind,
    payload,
  })
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}
}

function toolName(event: AgUiEvent): string {
  return event.type === "TOOL_CALL_START" ? event.toolCallName : "tool"
}

/** Parse canonical AG-UI events and project them into the existing pure UI reducer contract. */
export function parseAgUiEvent(input: unknown): SessionEvent {
  // Validate the upstream AG-UI contract first. The product schema below adds
  // Kokoro replay metadata and narrows the events understood by the reducer.
  EventSchemas.parse(input)
  const event = agUiEventSchema.parse(input)
  switch (event.type) {
    case "RUN_STARTED":
      return envelope(event, "run.created", { run_id: event.runId })
    case "RUN_FINISHED": {
      const usage = event.usage?.[0]
      const inputTokens = usage?.inputTokens
      const outputTokens = usage?.outputTokens
      return envelope(event, "run.completed", {
        status: "completed",
        token_usage: typeof inputTokens === "number" && typeof outputTokens === "number"
          ? { input_tokens: inputTokens, output_tokens: outputTokens }
          : null,
      })
    }
    case "RUN_ERROR":
      return envelope(event, "run.failed", {
        code: event.code ?? "internal_error",
        error_kind: "agent_error",
        message: event.message,
      })
    case "TEXT_MESSAGE_START":
      return envelope(event, "message.delta", { segment_id: event.messageId, delta: "" })
    case "TEXT_MESSAGE_CONTENT":
      return envelope(event, "message.delta", { segment_id: event.messageId, delta: event.delta })
    case "TEXT_MESSAGE_END":
      // The reducer's completed event replaces content, so the end marker is
      // intentionally represented as an empty delta. Run terminal state is
      // the authoritative completion marker for the UI.
      return envelope(event, "message.delta", { segment_id: event.messageId, delta: "" })
    case "TOOL_CALL_START":
      return envelope(event, "tool.invoked", {
        segment_id: event.parentMessageId ?? event.toolCallId,
        tool_id: event.toolCallId,
        name: toolName(event),
        args: {},
      })
    case "TOOL_CALL_ARGS": {
      let args: Record<string, unknown> = {}
      try {
        args = recordValue(JSON.parse(event.delta))
      } catch {
        // Partial JSON arguments are expected while a tool call is streaming.
      }
      return envelope(event, "tool.invoked", {
        segment_id: event.toolCallId,
        tool_id: event.toolCallId,
        name: "tool",
        args,
      })
    }
    case "TOOL_CALL_END":
      return envelope(event, "tool.invoked", {
        segment_id: event.toolCallId,
        tool_id: event.toolCallId,
        name: "tool",
        args: {},
      })
    case "TOOL_CALL_RESULT":
      return envelope(event, "tool.returned", {
        segment_id: event.messageId,
        tool_id: event.toolCallId,
        name: "tool",
        result: event.content,
        is_error: false,
      })
    case "CUSTOM": {
      const value = recordValue(event.value)
      if (event.name === "kokoro.interaction.awaiting_approval") return envelope(event, "tool.awaiting_approval", value)
      if (event.name === "kokoro.delivery.created") return envelope(event, "delivery.created", value)
      if (event.name === "kokoro.subagent.started") return envelope(event, "subagent.started", value)
      if (event.name === "kokoro.subagent.finished") return envelope(event, "subagent.finished", value)
      if (event.name === "kokoro.session.created") return envelope(event, "session.created", value)
      if (event.name === "kokoro.todo.updated") return envelope(event, "todo.updated", value)
      if (event.name === "kokoro.message.user") return envelope(event, "message.user", value)
      throw new Error(`Unsupported Kokoro AG-UI custom event: ${event.name}`)
    }
  }
  throw new Error(`Unsupported AG-UI event: ${event.type}`)
}
