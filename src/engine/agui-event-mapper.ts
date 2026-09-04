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
  sessionId: string
  runId: string
  toolCallId: string
  name: string
  segmentId: string
  argumentsText: string
  inputCompleted: boolean
}

type ToolCallLookup = {
  key: string
  tool: ToolCallState
  bootstrapped: boolean
}

const BOOTSTRAPPED_TOOL_NAME = "tool"

function toolKey(sessionId: string, runId: string, toolCallId: string): string {
  return JSON.stringify([sessionId, runId, toolCallId])
}

function toolInputStartChunk(tool: ToolCallState): KokoroUiMessageChunk {
  return {
    type: "tool-input-start",
    toolCallId: tool.toolCallId,
    toolName: tool.name,
    dynamic: true,
  }
}

function toolInputAvailableChunk(
  tool: ToolCallState,
  input: Record<string, unknown>,
): KokoroUiMessageChunk {
  return {
    type: "tool-input-available",
    toolCallId: tool.toolCallId,
    toolName: tool.name,
    input,
    dynamic: true,
  }
}

function toolInputErrorChunk(
  tool: ToolCallState,
  errorText: string,
): KokoroUiMessageChunk {
  return {
    type: "tool-input-error",
    toolCallId: tool.toolCallId,
    toolName: tool.name,
    input: {},
    errorText,
    dynamic: true,
  }
}

function toolArguments(tool: ToolCallState): Record<string, unknown> | null {
  return tool.argumentsText.length === 0 ? {} : jsonRecord(tool.argumentsText)
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

  #toolLookup(event: AgUiEvent, toolCallId: string): ToolCallLookup {
    const runId = requiredRunId(event)
    const sessionId = event.metadata.kokoro.session_id
    const key = toolKey(sessionId, runId, toolCallId)
    const existing = this.#toolCalls.get(key)
    if (existing !== undefined) {
      return { key, tool: existing, bootstrapped: false }
    }
    const tool: ToolCallState = {
      sessionId,
      runId,
      toolCallId,
      name: BOOTSTRAPPED_TOOL_NAME,
      segmentId: toolCallId,
      argumentsText: "",
      inputCompleted: false,
    }
    this.#toolCalls.set(key, tool)
    return { key, tool, bootstrapped: true }
  }

  #clearRun(sessionId: string, runId: string): ToolCallState[] {
    const cleared: ToolCallState[] = []
    for (const [key, tool] of this.#toolCalls) {
      if (tool.sessionId !== sessionId || tool.runId !== runId) {
        continue
      }
      this.#toolCalls.delete(key)
      cleared.push(tool)
    }
    return cleared
  }

  map(cursorInput: unknown, input: unknown): AgUiMappedFrame {
    const cursor = eventCursorSchema.parse(cursorInput)
    const event = parseAgUiEvent(input)
    const metadata = event.metadata.kokoro
    const messageMetadata = uiMetadata(cursor, metadata)

    switch (event.type) {
      case EventType.RUN_STARTED: {
        this.#clearRun(metadata.session_id, event.runId)
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
        this.#clearRun(metadata.session_id, event.runId)
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
        const runId = requiredRunId(event)
        const openTools = this.#clearRun(metadata.session_id, runId)
        if (event.code === "cancelled") {
          const projectionEvent = projectionEnvelope(cursor, event, "run.completed", {
            status: "cancelled",
            token_usage: null,
          })
          return {
            cursor,
            projectionEvent,
            uiMessageChunks: [
              { type: "finish-step" },
              { type: "finish", finishReason: "other", messageMetadata },
            ],
            terminal: true,
          }
        }
        const projectionEvent = projectionEnvelope(cursor, event, "run.failed", {
          code: event.code ?? "internal_error",
          error_kind: "agent_error",
          message: event.message,
        })
        return {
          cursor,
          projectionEvent,
          uiMessageChunks: [
            ...openTools.map((tool) => ({
              type: "tool-output-error" as const,
              toolCallId: tool.toolCallId,
              errorText: event.message,
              dynamic: true,
            })),
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
        const runId = requiredRunId(event)
        const sessionId = metadata.session_id
        const key = toolKey(sessionId, runId, event.toolCallId)
        const tool: ToolCallState = {
          sessionId,
          runId,
          toolCallId: event.toolCallId,
          name: event.toolCallName,
          segmentId: event.parentMessageId ?? event.toolCallId,
          argumentsText: "",
          inputCompleted: false,
        }
        this.#toolCalls.set(key, tool)
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "tool.invoked", {
            segment_id: tool.segmentId,
            tool_id: event.toolCallId,
            name: tool.name,
            args: {},
          }),
          uiMessageChunks: [toolInputStartChunk(tool)],
          terminal: false,
        }
      }
      case EventType.TOOL_CALL_ARGS: {
        const { tool, bootstrapped } = this.#toolLookup(event, event.toolCallId)
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
          uiMessageChunks: [
            ...(bootstrapped ? [toolInputStartChunk(tool)] : []),
            {
              type: "tool-input-delta",
              toolCallId: event.toolCallId,
              inputTextDelta: event.delta,
            },
          ],
          terminal: false,
        }
      }
      case EventType.TOOL_CALL_END: {
        const { tool, bootstrapped } = this.#toolLookup(event, event.toolCallId)
        const args = toolArguments(tool)
        if (args === null) {
          throw new Error(`TOOL_CALL_END contains invalid object arguments: ${event.toolCallId}`)
        }
        tool.inputCompleted = true
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "tool.invoked", {
            segment_id: tool.segmentId,
            tool_id: event.toolCallId,
            name: tool.name,
            args,
          }),
          uiMessageChunks: [
            ...(bootstrapped ? [toolInputStartChunk(tool)] : []),
            toolInputAvailableChunk(tool, args),
          ],
          terminal: false,
        }
      }
      case EventType.TOOL_CALL_RESULT: {
        const { key, tool, bootstrapped } = this.#toolLookup(event, event.toolCallId)
        const uiMessageChunks: KokoroUiMessageChunk[] = []
        if (!tool.inputCompleted) {
          const args = toolArguments(tool)
          uiMessageChunks.push(...(bootstrapped ? [toolInputStartChunk(tool)] : []))
          if (args === null) {
            uiMessageChunks.push(toolInputErrorChunk(tool, "Tool input was incomplete"))
          } else {
            uiMessageChunks.push(toolInputAvailableChunk(tool, args))
          }
          tool.inputCompleted = true
        }
        this.#toolCalls.delete(key)
        uiMessageChunks.push({
          type: "tool-output-available",
          toolCallId: event.toolCallId,
          output: event.content,
          dynamic: true,
        })
        return {
          cursor,
          projectionEvent: projectionEnvelope(cursor, event, "tool.returned", {
            segment_id: event.messageId,
            tool_id: event.toolCallId,
            name: tool.name,
            result: event.content,
            is_error: false,
          }),
          uiMessageChunks,
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
