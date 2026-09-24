import { describe, expect, it } from "vitest"

import { AgUiEventMapper } from "@/engine/agui-event-mapper"

const CURSORS = {
  start: "agui_00000000000000000000000000000001",
  args: "agui_00000000000000000000000000000002",
  end: "agui_00000000000000000000000000000003",
  result: "agui_00000000000000000000000000000004",
  terminal: "agui_00000000000000000000000000000005",
} as const

function metadata(
  eventId: string,
  seq: number,
  runId: string | null = "run-1",
  sessionId = "session-1",
) {
  return {
    kokoro: {
      event_id: eventId,
      seq,
      session_id: sessionId,
      run_id: runId,
      timestamp: "2026-09-02T12:00:00.000Z",
    },
  }
}

describe("AgUiEventMapper", () => {
  it("maps canonical text frames to reducer projections and AI SDK UIMessage chunks", () => {
    const mapped = new AgUiEventMapper().map(CURSORS.start, {
      type: "TEXT_MESSAGE_CONTENT",
      timestamp: Date.parse("2026-09-02T12:00:00.000Z"),
      messageId: "message-1",
      delta: "hello",
      metadata: metadata("agent-event-1", 7),
    })

    expect(mapped.projectionEvent).toMatchObject({
      event_id: CURSORS.start,
      kind: "message.delta",
      payload: { segment_id: "message-1", delta: "hello" },
    })
    expect(mapped.uiMessageChunks).toEqual([
      { type: "text-delta", id: "message-1", delta: "hello" },
    ])
    expect(mapped.terminal).toBe(false)
  })

  it("retains tool identity and assembled arguments across the AG-UI lifecycle", () => {
    const mapper = new AgUiEventMapper()
    const start = mapper.map(CURSORS.start, {
      type: "TOOL_CALL_START",
      timestamp: 1,
      toolCallId: "tool-1",
      toolCallName: "search",
      parentMessageId: "message-1",
      metadata: metadata("agent-tool-1", 8),
    })
    const args = mapper.map(CURSORS.args, {
      type: "TOOL_CALL_ARGS",
      timestamp: 2,
      toolCallId: "tool-1",
      delta: '{"query":"AG-UI"}',
      metadata: metadata("agent-tool-1", 8),
    })
    const end = mapper.map(CURSORS.end, {
      type: "TOOL_CALL_END",
      timestamp: 3,
      toolCallId: "tool-1",
      metadata: metadata("agent-tool-2", 9),
    })
    const result = mapper.map(CURSORS.result, {
      type: "TOOL_CALL_RESULT",
      timestamp: 4,
      messageId: "message-1",
      toolCallId: "tool-1",
      role: "tool",
      content: "found",
      metadata: metadata("agent-tool-2", 9),
    })

    expect(start.projectionEvent).toMatchObject({
      kind: "tool.invoked",
      payload: { tool_id: "tool-1", name: "search", args: {} },
    })
    expect(args.projectionEvent).toMatchObject({
      kind: "tool.invoked",
      payload: { tool_id: "tool-1", name: "search", args: { query: "AG-UI" } },
    })
    expect(end.projectionEvent).toMatchObject({
      kind: "tool.invoked",
      payload: { tool_id: "tool-1", name: "search", args: { query: "AG-UI" } },
    })
    expect(end.uiMessageChunks).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "search",
        input: { query: "AG-UI" },
        dynamic: true,
      },
    ])
    expect(result.projectionEvent).toMatchObject({
      kind: "tool.returned",
      payload: { tool_id: "tool-1", name: "search", result: "found" },
    })
    expect(result.uiMessageChunks).toEqual([
      {
        type: "tool-output-available",
        toolCallId: "tool-1",
        output: "found",
        dynamic: true,
      },
    ])
  })

  it("maps terminal run frames to an AI SDK finish and an internal terminal event", () => {
    const mapped = new AgUiEventMapper().map(CURSORS.terminal, {
      type: "RUN_FINISHED",
      timestamp: 5,
      threadId: "session-1",
      runId: "run-1",
      metadata: metadata("agent-terminal", 10),
    })

    expect(mapped.terminal).toBe(true)
    expect(mapped.projectionEvent).toMatchObject({ kind: "run.completed", run_id: "run-1" })
    expect(mapped.uiMessageChunks).toEqual([
      { type: "finish-step" },
      { type: "finish", finishReason: "stop", messageMetadata: expect.objectContaining({ cursor: CURSORS.terminal }) },
    ])
  })

  it("preserves BFF cancelled RUN_FINISHED as a cancelled terminal", () => {
    const mapped = new AgUiEventMapper().map(CURSORS.terminal, {
      type: "RUN_FINISHED",
      timestamp: 5,
      threadId: "session-1",
      runId: "run-1",
      status: "cancelled",
      result: { status: "cancelled" },
      outcome: { type: "interrupt", interrupts: [{ id: "cancelled:1", reason: "cancelled" }] },
      metadata: metadata("agent-cancelled-finish", 10),
    })

    expect(mapped.projectionEvent).toMatchObject({ kind: "run.completed", payload: { status: "cancelled" } })
    expect(mapped.uiMessageChunks.at(-1)).toMatchObject({ type: "finish", finishReason: "other" })
  })

  it("preserves BFF tool isError in reducer and UI message output", () => {
    const mapped = new AgUiEventMapper().map(CURSORS.result, {
      type: "TOOL_CALL_RESULT",
      timestamp: 4,
      messageId: "message-error-result",
      toolCallId: "tool-error-result",
      role: "tool",
      content: "tool failed",
      isError: true,
      metadata: metadata("agent-tool-error", 4),
    })
    expect(mapped.projectionEvent).toMatchObject({ kind: "tool.returned", payload: { is_error: true } })
    expect(mapped.uiMessageChunks.at(-1)).toMatchObject({ type: "tool-output-error", errorText: "tool failed" })
  })

  it("bootstraps tool input when replay starts at an args, end, or result cursor", () => {
    const partialArgs = new AgUiEventMapper().map(CURSORS.args, {
      type: "TOOL_CALL_ARGS",
      timestamp: 2,
      toolCallId: "tool-replay-args",
      delta: '{"query":',
      metadata: metadata("agent-replay-args", 2),
    })
    expect(partialArgs.projectionEvent).toBeNull()
    expect(partialArgs.uiMessageChunks).toEqual([
      {
        type: "tool-input-start",
        toolCallId: "tool-replay-args",
        toolName: "tool",
        dynamic: true,
      },
      {
        type: "tool-input-delta",
        toolCallId: "tool-replay-args",
        inputTextDelta: '{"query":',
      },
    ])

    const end = new AgUiEventMapper().map(CURSORS.end, {
      type: "TOOL_CALL_END",
      timestamp: 3,
      toolCallId: "tool-replay-end",
      metadata: metadata("agent-replay-end", 3),
    })
    expect(end.projectionEvent).toMatchObject({
      kind: "tool.invoked",
      payload: { tool_id: "tool-replay-end", name: "tool", args: {} },
    })
    expect(end.uiMessageChunks).toEqual([
      {
        type: "tool-input-start",
        toolCallId: "tool-replay-end",
        toolName: "tool",
        dynamic: true,
      },
      {
        type: "tool-input-available",
        toolCallId: "tool-replay-end",
        toolName: "tool",
        input: {},
        dynamic: true,
      },
    ])

    const result = new AgUiEventMapper().map(CURSORS.result, {
      type: "TOOL_CALL_RESULT",
      timestamp: 4,
      messageId: "message-replay-result",
      toolCallId: "tool-replay-result",
      role: "tool",
      content: "replayed",
      metadata: metadata("agent-replay-result", 4),
    })
    expect(result.projectionEvent).toMatchObject({
      kind: "tool.returned",
      payload: { tool_id: "tool-replay-result", name: "tool", result: "replayed", is_error: false },
    })
    expect(result.uiMessageChunks).toEqual([
      {
        type: "tool-input-start",
        toolCallId: "tool-replay-result",
        toolName: "tool",
        dynamic: true,
      },
      {
        type: "tool-input-available",
        toolCallId: "tool-replay-result",
        toolName: "tool",
        input: {},
        dynamic: true,
      },
      {
        type: "tool-output-available",
        toolCallId: "tool-replay-result",
        output: "replayed",
        dynamic: true,
      },
    ])
  })

  it("scopes bootstrap state by session and run instead of reusing a stale tool id", () => {
    const mapper = new AgUiEventMapper()
    mapper.map(CURSORS.start, {
      type: "TOOL_CALL_START",
      timestamp: 1,
      toolCallId: "reused-tool",
      toolCallName: "old-tool",
      metadata: metadata("agent-old", 1, "run-old"),
    })

    const mapped = mapper.map(CURSORS.args, {
      type: "TOOL_CALL_ARGS",
      timestamp: 2,
      toolCallId: "reused-tool",
      delta: "{}",
      metadata: metadata("agent-new", 2, "run-new", "session-new"),
    })

    expect(mapped.projectionEvent).toMatchObject({
      session_id: "session-new",
      run_id: "run-new",
      payload: { tool_id: "reused-tool", name: "tool", args: {} },
    })
    expect(mapped.uiMessageChunks).toContainEqual({
      type: "tool-input-start",
      toolCallId: "reused-tool",
      toolName: "tool",
      dynamic: true,
    })
  })

  it("maps a canonical cancelled run error to run.completed with cancelled status", () => {
    const mapped = new AgUiEventMapper().map(CURSORS.terminal, {
      type: "RUN_ERROR",
      timestamp: 5,
      code: "cancelled",
      message: "Run cancelled",
      metadata: metadata("agent-cancelled", 10),
    })

    expect(mapped.terminal).toBe(true)
    expect(mapped.projectionEvent).toMatchObject({
      kind: "run.completed",
      payload: { status: "cancelled" },
    })
    expect(mapped.uiMessageChunks).toEqual([
      { type: "finish-step" },
      { type: "finish", finishReason: "other", messageMetadata: expect.objectContaining({ cursor: CURSORS.terminal }) },
    ])
  })

  it("marks open tool output as an error when the run terminates with an error", () => {
    const mapper = new AgUiEventMapper()
    mapper.map(CURSORS.start, {
      type: "TOOL_CALL_START",
      timestamp: 1,
      toolCallId: "tool-failed",
      toolCallName: "search",
      metadata: metadata("agent-tool-failed", 1),
    })

    const mapped = mapper.map(CURSORS.terminal, {
      type: "RUN_ERROR",
      timestamp: 5,
      code: "internal_error",
      message: "Tool execution failed",
      metadata: metadata("agent-error", 10),
    })

    expect(mapped.projectionEvent).toMatchObject({ kind: "run.failed" })
    expect(mapped.uiMessageChunks).toContainEqual({
      type: "tool-output-error",
      toolCallId: "tool-failed",
      errorText: "Tool execution failed",
      dynamic: true,
    })
    expect(mapped.uiMessageChunks).not.toContainEqual(expect.objectContaining({ type: "tool-output-available" }))
  })

  it("fails closed when a custom payload does not satisfy its local projection schema", () => {
    expect(() => new AgUiEventMapper().map(CURSORS.start, {
      type: "CUSTOM",
      timestamp: 1,
      name: "kokoro.todo.updated",
      value: { todos: [{ content: "missing status" }] },
      metadata: metadata("agent-custom", 11),
    })).toThrow()
  })
})
