import { describe, expect, it } from "vitest"

import { AgUiEventMapper } from "@/engine/agui-event-mapper"
import { BFF_AGENT_FAILURE_TUPLES } from "@/generated/bff-agent-failure"

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
  it("R135 maps safe activity as process state without emitting UIMessage text", () => {
    const activity = {
      activity: "tool",
      activity_id: `act_${"a".repeat(64)}`,
      segment_id: `seg_${"b".repeat(64)}`,
      status: "running",
      display_code: "tool.execution",
    }
    const mapped = new AgUiEventMapper().map(CURSORS.start, {
      type: "CUSTOM", timestamp: 1, name: "kokoro.activity.updated", value: activity,
      metadata: metadata("r135-activity", 1),
    })
    expect(mapped.projectionEvent).toMatchObject({ kind: "activity.updated", payload: activity })
    expect(mapped.uiMessageChunks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: expect.stringMatching(/text|reasoning|tool/u) }),
    ]))
  })

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

    expect(start.projectionEvent).toBeNull()
    expect(args.projectionEvent).toBeNull()
    expect(end.projectionEvent).toBeNull()
    expect(end.uiMessageChunks).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "search",
        input: { query: "AG-UI" },
        dynamic: true,
      },
    ])
    expect(result.projectionEvent).toBeNull()
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
    expect(mapped.projectionEvent).toBeNull()
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
    expect(end.projectionEvent).toBeNull()
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
    expect(result.projectionEvent).toBeNull()
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

    expect(mapped.projectionEvent).toBeNull()
    expect(mapped.uiMessageChunks).toContainEqual({
      type: "tool-input-start",
      toolCallId: "reused-tool",
      toolName: "tool",
      dynamic: true,
    })
  })

  it("rejects the unpublished cancelled RUN_ERROR fallback", () => {
    expect(() => new AgUiEventMapper().map(CURSORS.terminal, {
      type: "RUN_ERROR",
      timestamp: 5,
      threadId: "session-1",
      runId: "run-1",
      code: "cancelled",
      message: "Run cancelled",
      metadata: metadata("agent-cancelled", 10),
    })).toThrow()
  })

  it.each(BFF_AGENT_FAILURE_TUPLES)(
    "maps the safe Agent $code retryable=$retryable profile without raw diagnostics",
    (failure) => {
      const mapped = new AgUiEventMapper().map(CURSORS.terminal, {
        type: "RUN_ERROR", timestamp: 5, threadId: "session-1", runId: "run-1",
        code: failure.code, message: "Agent run failed",
        metadata: { kokoro: { ...metadata("agent-error", 10).kokoro, failure } },
      })
      expect(mapped.terminal).toBe(true)
      expect(mapped.projectionEvent).toMatchObject({ kind: "run.failed", payload: { profile: failure } })
      expect(mapped.projectionEvent).not.toHaveProperty("payload.message")
      expect(mapped.projectionEvent).not.toHaveProperty("payload.error_kind")
      expect(mapped.uiMessageChunks).not.toContainEqual(expect.objectContaining({ errorText: "Agent run failed" }))
    },
  )

  it("keeps a BFF dispatch source sequence as an exact string outside Agent ordering", () => {
    const sourceSequence = "9007199254740993123456789"
    const mapper = new AgUiEventMapper()
    mapper.map(CURSORS.start, {
      type: "TOOL_CALL_START", timestamp: 1, toolCallId: "dispatch-tool", toolCallName: "search",
      metadata: metadata("agent-tool-before-dispatch", 9),
    })
    const mapped = mapper.map(CURSORS.terminal, {
      type: "RUN_ERROR", timestamp: 5, threadId: "session-1", runId: "run-1",
      code: "new_opaque_launch_failure", message: "Agent launch could not be confirmed",
      metadata: { kokoro: {
        event_id: "dispatch-error", seq: sourceSequence, source_owner: "kokoro-bff",
        session_id: "session-1", run_id: "run-1", timestamp: "2026-09-02T12:00:00.000Z",
      } },
    })
    expect(mapped.terminal).toBe(true)
    expect(mapped.projectionEvent).toMatchObject({ kind: "run.dispatch_failed", sourceSequence, run_id: "run-1" })
    expect(mapped.projectionEvent).not.toHaveProperty("seq")
    expect(mapped.projectionEvent).not.toHaveProperty("payload.profile")
    expect(mapped.uiMessageChunks).not.toContainEqual(
      expect.objectContaining({ errorText: "Agent launch could not be confirmed" }),
    )
    expect(mapped.uiMessageChunks).toContainEqual(expect.objectContaining({
      type: "tool-output-error", toolCallId: "dispatch-tool", dynamic: true,
    }))
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
      threadId: "session-1",
      runId: "run-1",
      code: "internal_error",
      message: "Agent run failed",
      metadata: { kokoro: {
        ...metadata("agent-error", 10).kokoro,
        failure: { source: "agent", code: "internal_error", retryable: false },
      } },
    })

    expect(mapped.projectionEvent).toMatchObject({
      kind: "run.failed",
      payload: { profile: { source: "agent", code: "internal_error", retryable: false } },
    })
    expect(mapped.uiMessageChunks).toContainEqual(
      expect.objectContaining({ type: "tool-output-error", toolCallId: "tool-failed", dynamic: true }),
    )
    expect(mapped.uiMessageChunks).not.toContainEqual(expect.objectContaining({ errorText: "Agent run failed" }))
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


it.each(["START", "END"] as const)("retains TEXT_MESSAGE_%s internally without changing AI SDK chunks", (boundary) => {
  const mapped = new AgUiEventMapper().map(CURSORS.start, {
    type: `TEXT_MESSAGE_${boundary}`, timestamp: 1, messageId: "wire",
    ...(boundary === "START" ? { role: "assistant" } : {}),
    metadata: metadata("boundary", 1),
  })
  expect(mapped.projectionEvent).toMatchObject({
    kind: "message.delta", payload: { segment_id: "wire", delta: "", text_boundary: boundary.toLowerCase() },
  })
  expect(mapped.uiMessageChunks).toEqual([{ type: boundary === "START" ? "text-start" : "text-end", id: "wire" }])
})


import { applyChatProjectionEvents as r66Fold } from "@/core/reducer"
import { createSessionStreamState as r66EmptyState } from "@/core/state"
import {
  makePublic4Frame as r66Frame, makePublic4Interaction as r66Interaction,
  makePublic4QueuedFrame as r66Queued, makePublic4StateFrame as r66StateFrame,
} from "../core/fixtures"

describe("R66 public4 queued/START/full-state mapper", () => {
  it("keeps the BFF queued sequence exact and outside numeric Agent ordering", () => {
    const mapper = new AgUiEventMapper()
    const start = mapper.map(CURSORS.start, r66Frame({
      type: "RUN_STARTED", threadId: "conv_9", runId: "run_1",
    }, 7))
    expect(start.projectionEvent).toMatchObject({ kind: "run.created", seq: 7 })
    const sequence = "9007199254740993123456789"
    const queued = mapper.map(CURSORS.args, r66Queued(sequence, "run_2"))
    expect(queued.terminal).toBe(false)
    expect(queued.projectionEvent).toMatchObject({
      kind: "run.queued", sourceSequence: sequence,
      payload: { run_id: "run_2", dispatch_sequence: sequence },
    })
    expect(queued.projectionEvent).not.toHaveProperty("seq")
    expect(queued.uiMessageChunks).toContainEqual(expect.objectContaining({ type: "data-kokoro" }))
    const events = [start.projectionEvent, queued.projectionEvent].filter(
      (event): event is NonNullable<typeof event> => event !== null,
    )
    expect(r66Fold(r66EmptyState(), events).lastSeq).toBe(7)
  })

  it("emits the complete owner collection, retaining optional presence and UIMessage parts", () => {
    const state = r66Interaction()
    const mapped = new AgUiEventMapper().map(CURSORS.start, r66StateFrame(state))
    expect(mapped.projectionEvent).toMatchObject({ kind: "interaction.state", payload: state })
    expect(mapped.uiMessageChunks).toContainEqual(expect.objectContaining({
      type: "data-kokoro", data: expect.objectContaining({ payload: state }),
    }))
    expect(mapped.terminal).toBe(false)
    expect(JSON.stringify(mapped)).not.toContain("pending_tool_ids")
    expect(JSON.stringify(mapped)).not.toContain("private_fence")
  })

  it("rejects a same-revision presence change and does not confuse interaction terminal with Run terminal", () => {
    const state = r66Interaction()
    const mapper = new AgUiEventMapper()
    const accepted = mapper.map(CURSORS.start, r66StateFrame(state))
    expect(accepted.terminal).toBe(false)
    const group = state.groups.at(0)
    if (!group) throw new Error("R66 fixture requires a group")
    const changed = { ...state, groups: [{ ...group,
      items: group.items.map((item) => ({ ...item, validation: null })),
    }, ...state.groups.slice(1)] }
    expect(() => mapper.map(CURSORS.args, r66StateFrame(changed, 22))).toThrow()
    const terminal = mapper.map(CURSORS.terminal, r66StateFrame(r66Interaction({
      interaction_revision: 5, phase: "terminal", groups: [],
    }), 23))
    expect(terminal.terminal).toBe(false)
  })
})
