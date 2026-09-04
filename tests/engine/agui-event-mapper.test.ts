import { describe, expect, it } from "vitest"

import { AgUiEventMapper } from "@/engine/agui-event-mapper"

const CURSORS = {
  start: "agui_00000000000000000000000000000001",
  args: "agui_00000000000000000000000000000002",
  end: "agui_00000000000000000000000000000003",
  result: "agui_00000000000000000000000000000004",
  terminal: "agui_00000000000000000000000000000005",
} as const

function metadata(eventId: string, seq: number, runId: string | null = "run-1") {
  return {
    kokoro: {
      event_id: eventId,
      seq,
      session_id: "session-1",
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
