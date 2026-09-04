// AG-UI adapter: validated wire frames become two independent local views:
// Vercel AI SDK UIMessage chunks and the reducer's internal projection events.

import { EventType } from "@ag-ui/core"
import type { UIMessage, UIMessageChunk } from "ai"

import {
  eventCursorSchema,
  parseAgUiEvent,
  type AgUiEvent,
  type EventCursor,
  type KokoroAgUiMetadata,
} from "@/contract/agui-events"
import {
  parseChatProjectionEvent,
  type ChatProjectionEvent,
  type ChatProjectionEventKind,
} from "@/core/chat-projection-event"

export type KokoroUiMessageMetadata = {
  cursor: EventCursor
  sourceEventId: string
  sourceSequence: number
  sessionId: string
  runId: string | null
  occurredAt: string
}

export type KokoroUiEventData = {
  kind: ChatProjectionEventKind
  payload: unknown
  metadata: KokoroUiMessageMetadata
}

export type KokoroUiDataTypes = {
  kokoro: KokoroUiEventData
}

export type KokoroUiMessage = UIMessage<KokoroUiMessageMetadata, KokoroUiDataTypes>
export type KokoroUiMessageChunk = UIMessageChunk<KokoroUiMessageMetadata, KokoroUiDataTypes>

export type AgUiMappedFrame = {
  cursor: EventCursor
  projectionEvent: ChatProjectionEvent | null
  uiMessageChunks: readonly KokoroUiMessageChunk[]
  terminal: boolean
}

type ToolCallState = {
  name: string
  segmentId: string
  argumentsText: string
}

function uiMetadata(cursor: EventCursor, metadata: KokoroAgUiMetadata): KokoroUiMessageMetadata {
  return {
    cursor,
    sourceEventId: metadata.event_id,
    sourceSequence: metadata.seq,
    sessionId: metadata.session_id,
    runId: metadata.run_id,
    occurredAt: metadata.timestamp,
  }
}

function requiredRunId(event: AgUiEvent): string {
  const runId = event.metadata.kokoro.run_id
  if (runId === null) {
    throw new Error(`${event.type} requires metadata.kokoro.run_id`)
  }
  return runId
}

function projectionEnvelope(
  cursor: EventCursor,
  event: AgUiEvent,
  kind: ChatProjectionEventKind,
  payload: unknown,
): ChatProjectionEvent {
  const metadata = event.metadata.kokoro
  return parseChatProjectionEvent({
    event_id: cursor,
    seq: metadata.seq,
    session_id: metadata.session_id,
    run_id: metadata.run_id ?? `session:${metadata.session_id}`,
    timestamp: metadata.timestamp,
    kind,
    payload,
  })
}

function jsonRecord(value: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : null
}

function customProjection(
  cursor: EventCursor,
  event: Extract<AgUiEvent, { type: EventType.CUSTOM }>,
): ChatProjectionEvent {
  switch (event.name) {
    case "kokoro.interaction.awaiting_approval":
      return projectionEnvelope(cursor, event, "tool.awaiting_approval", event.value)
    case "kokoro.delivery.created":
      return projectionEnvelope(cursor, event, "delivery.created", event.value)
    case "kokoro.subagent.started":
      return projectionEnvelope(cursor, event, "subagent.started", event.value)
    case "kokoro.subagent.finished":
      return projectionEnvelope(cursor, event, "subagent.finished", event.value)
    case "kokoro.session.created":
      return projectionEnvelope(cursor, event, "session.created", event.value)
    case "kokoro.todo.updated":
      return projectionEnvelope(cursor, event, "todo.updated", event.value)
    case "kokoro.message.user":
      return projectionEnvelope(cursor, event, "message.user", event.value)
    default:
      throw new Error(`Unsupported Kokoro AG-UI custom event: ${event.name}`)
  }
}

/** Stateful mapper for one logical AG-UI stream, including reconnects. */
export class AgUiEventMapper {
  readonly #toolCalls = new Map<string, ToolCallState>()

  map(cursorInput: unknown, input: unknown): AgUiMappedFrame {
    const cursor = eventCursorSchema.parse(cursorInput)
    const event = parseAgUiEvent(input)
    const metadata = event.metadata.kokoro
    const messageMetadata = uiMetadata(cursor, metadata)

    switch (event.type) {
      case EventType.RUN_STARTED: {
        const projectionEvent = projectionEnvelope(cursor, event, "run.created", {
          run_id: event.runId,
        })
        return {
          cursor,
          projectionEvent,
          uiMessageChunks: [
            { type: "start", messageId: event.runId, messageMetadata },
            { type: "start-step" },
          ],
          terminal: false,
        }
      }
      case EventType.RUN_FINISHED: {
        const usage = event.usage?.[0]
        const inputTokens = usage?.inputTokens
        const outputTokens = usage?.outputTokens
        const projectionEvent = projectionEnvelope(cursor, event, "run.completed", {
          status: "completed",
          token_usage:
            typeof inputTokens === "number" && typeof outputTokens === "number"
              ? { input_tokens: inputTokens, output_tokens: outputTokens }
              : null,
        })
        return {
          cursor,
          projectionEvent,
          uiMessageChunks: [
            { type: "finish-step" },
            { type: "finish", finishReason: "stop", messageMetadata },
          ],
          terminal: true,
        }
      }
      case EventType.RUN_ERROR: {
        requiredRunId(event)
        const projectionEvent = projectionEnvelope(cursor, event, "run.failed", {
          code: event.code ?? "internal_error",
          error_kind: "agent_error",
          message: event.message,
        })
        return {
          cursor,
          projectionEvent,
          uiMessageChunks: [
            { type: "error", errorText: event.message },
            { type: "finish", finishReason: "error", messageMetadata },
          ],
          terminal: true,
        }
      }
      case EventType.TEXT_MESSAGE_START:
        requiredRunId(event)
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "message.delta", {
            segment_id: event.messageId,
            delta: "",
          }),
          uiMessageChunks: [{ type: "text-start", id: event.messageId }],
          terminal: false,
        }
      case EventType.TEXT_MESSAGE_CONTENT:
        requiredRunId(event)
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "message.delta", {
            segment_id: event.messageId,
            delta: event.delta,
          }),
          uiMessageChunks: [{ type: "text-delta", id: event.messageId, delta: event.delta }],
          terminal: false,
        }
      case EventType.TEXT_MESSAGE_END:
        requiredRunId(event)
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "message.delta", {
            segment_id: event.messageId,
            delta: "",
          }),
          uiMessageChunks: [{ type: "text-end", id: event.messageId }],
          terminal: false,
        }
      case EventType.TOOL_CALL_START: {
        requiredRunId(event)
        const tool = {
          name: event.toolCallName,
          segmentId: event.parentMessageId ?? event.toolCallId,
          argumentsText: "",
        }
        this.#toolCalls.set(event.toolCallId, tool)
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "tool.invoked", {
            segment_id: tool.segmentId,
            tool_id: event.toolCallId,
            name: tool.name,
            args: {},
          }),
          uiMessageChunks: [{
            type: "tool-input-start",
            toolCallId: event.toolCallId,
            toolName: tool.name,
            dynamic: true,
          }],
          terminal: false,
        }
      }
      case EventType.TOOL_CALL_ARGS: {
        requiredRunId(event)
        const tool = this.#toolCalls.get(event.toolCallId)
        if (tool === undefined) {
          throw new Error(`TOOL_CALL_ARGS received before TOOL_CALL_START: ${event.toolCallId}`)
        }
        tool.argumentsText += event.delta
        const args = jsonRecord(tool.argumentsText)
        return {
          cursor,
          projectionEvent:
            args === null
              ? null
              : projectionEnvelope(cursor, event, "tool.invoked", {
                  segment_id: tool.segmentId,
                  tool_id: event.toolCallId,
                  name: tool.name,
                  args,
                }),
          uiMessageChunks: [{
            type: "tool-input-delta",
            toolCallId: event.toolCallId,
            inputTextDelta: event.delta,
          }],
          terminal: false,
        }
      }
      case EventType.TOOL_CALL_END: {
        requiredRunId(event)
        const tool = this.#toolCalls.get(event.toolCallId)
        if (tool === undefined) {
          throw new Error(`TOOL_CALL_END received before TOOL_CALL_START: ${event.toolCallId}`)
        }
        const args = jsonRecord(tool.argumentsText)
        if (args === null) {
          throw new Error(`TOOL_CALL_END contains invalid object arguments: ${event.toolCallId}`)
        }
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "tool.invoked", {
            segment_id: tool.segmentId,
            tool_id: event.toolCallId,
            name: tool.name,
            args,
          }),
          uiMessageChunks: [{
            type: "tool-input-available",
            toolCallId: event.toolCallId,
            toolName: tool.name,
            input: args,
            dynamic: true,
          }],
          terminal: false,
        }
      }
      case EventType.TOOL_CALL_RESULT: {
        requiredRunId(event)
        const tool = this.#toolCalls.get(event.toolCallId)
        if (tool === undefined) {
          throw new Error(`TOOL_CALL_RESULT received before TOOL_CALL_START: ${event.toolCallId}`)
        }
        this.#toolCalls.delete(event.toolCallId)
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "tool.returned", {
            segment_id: event.messageId,
            tool_id: event.toolCallId,
            name: tool.name,
            result: event.content,
            is_error: false,
          }),
          uiMessageChunks: [{
            type: "tool-output-available",
            toolCallId: event.toolCallId,
            output: event.content,
            dynamic: true,
          }],
          terminal: false,
        }
      }
      case EventType.CUSTOM: {
        const projectionEvent = customProjection(cursor, event)
        return {
          cursor,
          projectionEvent,
          uiMessageChunks: [{
            type: "data-kokoro",
            id: cursor,
            data: {
              kind: projectionEvent.kind,
              payload: projectionEvent.payload,
              metadata: messageMetadata,
            },
          }],
          terminal: false,
        }
      }
      default: {
        const exhaustive: never = event
        return exhaustive
      }
    }
  }
}
