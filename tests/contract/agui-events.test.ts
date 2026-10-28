import { describe, expect, it } from "vitest"

import { eventCursorSchema, parseAgUiEvent } from "@/contract/agui-events"

const AGENT_FAILURE_CODES = [
  "token_budget_exceeded",
  "recursion_limit_exceeded",
  "assembly_failed",
  "enqueue_failed",
  "dispatch_exhausted",
  "contract_incompatible",
  "internal_error",
  "model_unavailable",
  "dependency_unavailable",
  "model_access_denied",
  "model_settlement_pending",
] as const

const AGENT_FAILURE_TUPLES = [
  ...AGENT_FAILURE_CODES.map((code) => ({ source: "agent" as const, code, retryable: false })),
  { source: "agent" as const, code: "model_unavailable" as const, retryable: true },
  { source: "agent" as const, code: "dependency_unavailable" as const, retryable: true },
] as const

const metadata = {
  kokoro: { public_sequence: "1001",
    event_id: "agent-event-1",
    seq: 7,
    session_id: "session-1",
    run_id: "run-1",
    timestamp: "2026-09-02T12:00:00.000Z",
  },
}

describe("AG-UI wire contract", () => {
  describe("R135 safe execution process CUSTOM events", () => {
    it("accepts a full Todo replacement including an explicit empty list", () => {
      expect(parseAgUiEvent({
        type: "CUSTOM", timestamp: 1, name: "kokoro.todo.updated", value: { todos: [] }, metadata,
      })).toMatchObject({ name: "kokoro.todo.updated", value: { todos: [] } })
    })

    it("accepts whole-value Skill updates and rejects inherited failed-only fields", () => {
      const activity = {
        activity: "skill",
        activity_id: `act_${"a".repeat(64)}`,
        preflight_id: `spf_${"b".repeat(64)}`,
        source_refs: ["skill:alpha"],
        phase: "loading",
      }
      expect(parseAgUiEvent({
        type: "CUSTOM", timestamp: 1, name: "kokoro.activity.updated", value: activity, metadata,
      })).toMatchObject({ name: "kokoro.activity.updated", value: activity })
      expect(() => parseAgUiEvent({
        type: "CUSTOM", timestamp: 2, name: "kokoro.activity.updated",
        value: { ...activity, phase: "ready", error_code: "skill_load_failed" }, metadata,
      })).toThrow()
    })

    it("rejects old raw process aliases instead of accepting a second wire", () => {
      expect(() => parseAgUiEvent({
        type: "CUSTOM", timestamp: 1, name: "kokoro.subagent.started",
        value: { subagent_id: "private", name: "private" }, metadata,
      })).toThrow()
    })
  })

  it("validates the canonical frame without projecting wire DTOs into UI state", () => {
    expect(parseAgUiEvent({
      type: "TEXT_MESSAGE_CONTENT",
      timestamp: Date.parse("2026-09-02T12:00:00.000Z"),
      messageId: "message-1",
      delta: "hello",
      metadata,
    })).toMatchObject({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message-1",
      delta: "hello",
      metadata,
    })
  })

  it("accepts the BFF terminal success envelope without loosening unknown fields", () => {
    expect(parseAgUiEvent({
      type: "RUN_FINISHED",
      timestamp: Date.parse("2026-09-02T12:00:00.000Z"),
      threadId: "session-1",
      runId: "run-1",
      status: "completed",
      outcome: { type: "success" },
      metadata,
    })).toMatchObject({ type: "RUN_FINISHED", status: "completed", outcome: { type: "success" } })

    expect(() => parseAgUiEvent({
      type: "RUN_FINISHED",
      timestamp: Date.parse("2026-09-02T12:00:00.000Z"),
      threadId: "session-1",
      runId: "run-1",
      status: "completed",
      outcome: { type: "success" },
      unexpected: "not-an-owner-field",
      metadata,
    })).toThrow()
  })

  it("accepts BFF cancellation and tool result fields", () => {
    expect(parseAgUiEvent({
      type: "RUN_FINISHED",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      status: "cancelled",
      result: { status: "cancelled" },
      outcome: { type: "interrupt", interrupts: [{ id: "cancelled:1", reason: "cancelled" }] },
      metadata,
    }).type).toBe("RUN_FINISHED")
    expect(parseAgUiEvent({
      type: "TOOL_CALL_RESULT",
      timestamp: 1,
      messageId: "message-1",
      toolCallId: "tool-1",
      content: "failed",
      role: "tool",
      isError: true,
      metadata,
    }).type).toBe("TOOL_CALL_RESULT")
  })

  it("rejects a failureless generic RUN_ERROR instead of guessing an Agent failure", () => {
    expect(() => parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent run failed",
      code: "internal_error",
      metadata,
    })).toThrow()
  })

  it.each(AGENT_FAILURE_TUPLES)(
    "accepts the safe Agent RUN_ERROR tuple $code retryable=$retryable",
    (failure) => {
      expect(parseAgUiEvent({
        type: "RUN_ERROR",
        timestamp: 1,
        threadId: "session-1",
        runId: "run-1",
        message: "Agent run failed",
        code: failure.code,
        metadata: { kokoro: { ...metadata.kokoro, failure } },
      })).toMatchObject({
        type: "RUN_ERROR",
        code: failure.code,
        message: "Agent run failed",
        metadata: { kokoro: { public_sequence: "1001", failure } },
      })
    },
  )

  it.each([
    ["different thread identity", { threadId: "session-other" }],
    ["missing thread identity", { threadId: undefined }],
    ["different run identity", { runId: "run-other" }],
    ["missing run identity", { runId: undefined }],
    ["empty run identity", { runId: "" }],
    ["different top-level code", { code: "dependency_unavailable" }],
    ["missing top-level code", { code: undefined }],
    ["empty top-level code", { code: "" }],
    ["unsafe message", { message: "provider secret" }],
    ["top-level retryable", { retryable: false }],
  ] as const)("rejects an Agent RUN_ERROR with %s", (_label, override) => {
    expect(() => parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent run failed",
      code: "model_unavailable",
      metadata: {
        kokoro: { ...metadata.kokoro,
          failure: { source: "agent", code: "model_unavailable", retryable: true },
        },
      },
      ...override,
    })).toThrow()
  })

  it.each([
    { source: "agent", code: "internal_error", retryable: false, status: "failed" },
    { source: "agent", code: "unknown_failure", retryable: false },
    { source: "owner", code: "internal_error", retryable: false },
  ])("rejects an invalid Agent RUN_ERROR profile %#", (failure) => {
    expect(() => parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent run failed",
      code: failure.code,
      metadata: { kokoro: { ...metadata.kokoro, failure } },
    })).toThrow()
  })

  it.each(AGENT_FAILURE_CODES.filter(
    (code) => code !== "model_unavailable" && code !== "dependency_unavailable",
  ))("rejects retryable=true for the permanent Agent failure %s", (code) => {
    expect(() => parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent run failed",
      code,
      metadata: { kokoro: { ...metadata.kokoro, failure: { source: "agent", code, retryable: true } } },
    })).toThrow()
  })

  it.each(["RUN_STARTED", "RUN_FINISHED", "TEXT_MESSAGE_START"] as const)(
    "rejects failure metadata on non-error event %s",
    (type) => {
      const event = type === "RUN_STARTED"
        ? { type, threadId: "session-1", runId: "run-1" }
        : type === "RUN_FINISHED"
          ? { type, threadId: "session-1", runId: "run-1", status: "completed", outcome: { type: "success" } }
          : { type, messageId: "message-1", role: "assistant" }
      expect(() => parseAgUiEvent({
        ...event,
        timestamp: 1,
        metadata: {
          kokoro: { ...metadata.kokoro,
            failure: { source: "agent", code: "internal_error", retryable: false },
          },
        },
      })).toThrow()
    },
  )

  it("accepts the canonical BFF dispatch RUN_ERROR without narrowing its opaque code or decimal sequence", () => {
    const sourceSequence = "9007199254740993123456789"
    expect(parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent launch could not be confirmed",
      code: "new_opaque_launch_failure",
      metadata: {
        kokoro: { ...metadata.kokoro,
          seq: sourceSequence,
          source_owner: "kokoro-bff",
        },
      },
    })).toMatchObject({
      type: "RUN_ERROR",
      code: "new_opaque_launch_failure",
      metadata: { kokoro: { public_sequence: "1001", seq: sourceSequence, source_owner: "kokoro-bff" } },
    })
  })

  it.each([
    ["different thread identity", { threadId: "session-other" }],
    ["missing thread identity", { threadId: undefined }],
    ["different run identity", { runId: "run-other" }],
    ["missing run identity", { runId: undefined }],
    ["empty run identity", { runId: "" }],
    ["missing code", { code: undefined }],
    ["blank code", { code: "" }],
    ["whitespace-only code", { code: "   " }],
    ["whitespace-only run identity", { runId: "   " }],
    ["message mismatch", { message: "launch failed" }],
  ] as const)("rejects a BFF dispatch RUN_ERROR with %s", (_label, override) => {
    expect(() => parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent launch could not be confirmed",
      code: "agent_http_400",
      metadata: {
        kokoro: { ...metadata.kokoro,
          seq: "9007199254740993123456789",
          source_owner: "kokoro-bff",
        },
      },
      ...override,
    })).toThrow()
  })

  it.each([
    ["numeric sequence", { seq: 7, source_owner: "kokoro-bff" }],
    ["zero sequence", { seq: "0", source_owner: "kokoro-bff" }],
    ["leading-zero sequence", { seq: "01", source_owner: "kokoro-bff" }],
    ["wrong source owner", { seq: "7", source_owner: "kokoro-agent" }],
    ["forged Agent failure", {
      seq: "7",
      source_owner: "kokoro-bff",
      failure: { source: "agent", code: "internal_error", retryable: false },
    }],
  ] as const)("rejects a BFF dispatch RUN_ERROR with %s metadata", (_label, metadataOverride) => {
    expect(() => parseAgUiEvent({
      type: "RUN_ERROR",
      timestamp: 1,
      threadId: "session-1",
      runId: "run-1",
      message: "Agent launch could not be confirmed",
      code: "agent_http_400",
      metadata: { kokoro: { ...metadata.kokoro, ...metadataOverride } },
    })).toThrow()
  })

  it("rejects an AG-UI event without Kokoro replay metadata", () => {
    expect(() => parseAgUiEvent({
      type: "RUN_STARTED",
      threadId: "session-1",
      runId: "run-1",
    })).toThrow()
  })

  it.each([
    "agui_0123456789abcdef0123456789abcdef",
    "agui_ffffffffffffffffffffffffffffffff",
  ])("accepts the BFF opaque event cursor %s", (cursor) => {
    expect(eventCursorSchema.parse(cursor)).toBe(cursor)
  })

  it.each(["7", "agui_1", "agui_0123456789ABCDEF0123456789ABCDEF"])(
    "rejects a non-canonical resume cursor %s",
    (cursor) => {
      expect(() => eventCursorSchema.parse(cursor)).toThrow()
    },
  )
})


it("requires a public ledger coordinate independently of the Agent source seq", () => {
  const valid = { type: "TEXT_MESSAGE_CONTENT", timestamp: 1, messageId: "segment", delta: "visible", metadata: { kokoro: { ...metadata.kokoro, seq: 1, public_sequence: "9007199254740993" } } }
  expect(parseAgUiEvent(valid).metadata.kokoro).toMatchObject({ seq: 1, public_sequence: "9007199254740993" })
  for (const public_sequence of [undefined, 1, "0", "01", "1\n", "9223372036854775808"]) expect(() => parseAgUiEvent({ ...valid, metadata: { kokoro: { ...valid.metadata.kokoro, public_sequence } } })).toThrow()
})

// Public28 accepts only owner-published safe classification, never a guessed tool name.
for (const display_code of ["tool.execution", "tool.file.read", "tool.mcp.discover", "tool.mcp.describe", "tool.mcp.call", "tool.web.search", "tool.web.fetch", "tool.file.write", "tool.file.deliver"]) {
  for (const status of ["running", "completed", "failed"]) {
    it(`Public28 live activity preserves ${display_code}/${status}`, () => {
      const value = { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status, display_code }
      expect(parseAgUiEvent({ type: "CUSTOM", timestamp: 1, name: "kokoro.activity.updated", value, metadata })).toMatchObject({ value })
    })
  }
}
for (const patch of [{ display_code: "tool.file.unknown" }, { display_code: "subagent.execution" }, { activity: "subagent", display_code: "tool.web.search" }, { display_code: null }, { name: "web_search" }, { args: { query: "private" } }, { phase: "reading" }]) {
  it(`Public28 rejects unknown/cross-branch/raw activity ${JSON.stringify(patch)}`, () => {
    const value = { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "running", display_code: "tool.execution", ...patch }
    expect(() => parseAgUiEvent({ type: "CUSTOM", timestamp: 1, name: "kokoro.activity.updated", value, metadata })).toThrow()
  })
}

it("Public28.4 accepts only owner-safe optional tool targets and preserves valid Unicode scalar names", () => {
  const base = { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "running", display_code: "tool.file.read" }
  const parse = (value: unknown) => parseAgUiEvent({ type: "CUSTOM", timestamp: 1, name: "kokoro.activity.updated", value, metadata })
  for (const name of ["report.md", "é.md", "😀".repeat(120)]) {
    const value = { ...base, display_detail: { kind: "file", name } }
    expect(parse(value)).toMatchObject({ value })
  }
  const mcp = { ...base, display_code: "tool.mcp.call", display_detail: { kind: "mcp_tool", name: "vendor/tool:execute" } }
  expect(parse(mcp)).toMatchObject({ value: mcp })
  expect(parse(base)).toMatchObject({ value: base })
  for (const display_detail of [null, {}, { kind: "unknown", name: "name" }, { kind: "file", name: "file", extra: true }, ...["", ".", "..", "/path", "a/b", "a\\b", "C:name", "e\u0301", "bad\nname", "bad\u200dname", "\ud800", "😀".repeat(121)].map(name => ({ kind: "file", name }))]) {
    expect(() => parse({ ...base, display_detail })).toThrow()
  }
  for (const display_code of ["tool.execution", "tool.web.search", "tool.web.fetch", "tool.mcp.discover", "tool.mcp.describe"]) {
    expect(() => parse({ ...base, display_code, display_detail: { kind: "file", name: "file.md" } })).toThrow()
  }
  expect(() => parse({ ...base, display_detail: { kind: "mcp_tool", name: "tool/name" } })).toThrow()
  expect(() => parse({ ...mcp, activity: "subagent", display_code: "subagent.execution" })).toThrow()
})

it("preserves exact optional per-call intent in the original AG-UI activity, rejecting invalid text", () => {
  const activity = { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "running", display_code: "tool.mcp.call" }
  const event = (action_title: unknown) => ({ type: "CUSTOM", timestamp: 1, name: "kokoro.activity.updated", value: { ...activity, action_title }, metadata })
  for (const action_title of ["读取项目配置", "😀".repeat(64), "e\u0301", "<b>plain text</b>"]) expect(parseAgUiEvent(event(action_title))).toMatchObject({ value: { action_title } })
  for (const action_title of [null, "", " trailing ", "😀".repeat(64)+"x", "line\nnext", "hidden\u200b", "\ud800", "token: value", "https://example.test?a=1&token=private"]) expect(() => parseAgUiEvent(event(action_title))).toThrow()
  expect(parseAgUiEvent({ ...event("a"), value: activity })).toMatchObject({ value: activity })
})
