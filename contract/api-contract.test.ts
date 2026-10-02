import { afterEach, describe, expect, it, vi } from "vitest"

import {
  errorResponseSchema,
  messageCreateParamsSchema,
  messageCreateReceiptSchema,
  runControlBodySchema,
  runControlReceiptSchema,
  sessionListSchema,
  sessionSnapshotSchema,
} from "@/contract/http"
import { resumeDecisionSchema } from "@/contract/control"
import { AGENT_FAILURE_CODES as RUNTIME_AGENT_FAILURE_CODES } from "@/contract/agent-failure"
import { chatProjectionEventSchema } from "@/core/chat-projection-event"
import { createSessionClient } from "@/engine/client"

const eventEnvelope = {
  event_id: "evt_1",
  seq: 0,
  session_id: "session_1",
  run_id: "run_1",
  timestamp: "2026-08-31T12:00:00.000Z",
}

const EVENT_CURSOR = "agui_0000000000000000000000000000002a"
const NEXT_EVENT_CURSOR = "agui_0000000000000000000000000000002b"

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
] as const

const AGENT_FAILURE_TUPLES = [
  ...AGENT_FAILURE_CODES.map((code) => ({ source: "agent" as const, code, retryable: false })),
  { source: "agent" as const, code: "model_unavailable" as const, retryable: true },
  { source: "agent" as const, code: "dependency_unavailable" as const, retryable: true },
] as const

const eventFixtures: Array<[string, Record<string, unknown>]> = [
  ["session.created", { title: "New session", owner_id: "user_1" }],
  ["run.created", { run_id: "run_1" }],
  ["message.user", { message_id: "message_1", content: "hello" }],
  ["message.delta", { segment_id: "segment_1", delta: "hello" }],
  ["message.completed", { segment_id: "segment_1", content: "hello" }],
  ["thinking.delta", { segment_id: "segment_1", delta: "thinking" }],
  ["tool.invoked", { segment_id: "segment_1", tool_id: "tool_1", name: "search", args: {} }],
  ["tool.output.delta", { segment_id: "segment_1", tool_id: "tool_1", name: "search", delta: "result" }],
  ["interaction.state", {
    interaction_revision: 1, pause_revision: 1, pause_ref: "pause_1", phase: "waiting", action_result: null,
    groups: [{ group_id: "group_1", items: [{ item_id: "item_1", request_id: "request_1", kind: "tool_approval", allowed_decisions: ["approve"],
      display: { name: "search", description: "Approve search", editable: false, input_schema: {} } }] }],
  }],
  [
    "tool.returned",
    { segment_id: "segment_1", tool_id: "tool_1", name: "search", result: "ok", is_error: false },
  ],
  [
    "delivery.created",
    {
      artifact_id: "artifact_1", asset_id: "asset_1", artifact_kind: "document", tool_call_id: "tool_1",
      path: "deliveries/report.pdf", title: "Report", mime: "application/pdf", size: 12,
      content_hash: "a".repeat(64),
    },
  ],
  ["todo.updated", { todos: [{ content: "Ship contract", status: "in_progress" }] }],
  [
    "subagent.started",
    { segment_id: "segment_1", subagent_id: "subagent_1", name: "Research", description: "desc", subagent_type: "general", source: "built-in" },
  ],
  [
    "subagent.finished",
    { segment_id: "segment_1", subagent_id: "subagent_1", name: "Research", subagent_type: "general", source: "built-in" },
  ],
  ["subagent.thinking.delta", { segment_id: "segment_1", subagent_id: "subagent_1", delta: "thinking" }],
  ["subagent.text.delta", { segment_id: "segment_1", subagent_id: "subagent_1", text: "text" }],
  ["subagent.text.completed", { segment_id: "segment_1", subagent_id: "subagent_1", text: "text" }],
  [
    "subagent.tool.invoked",
    { segment_id: "segment_1", subagent_id: "subagent_1", tool_id: "tool_1", name: "search", args: {} },
  ],
  [
    "subagent.tool.returned",
    { segment_id: "segment_1", subagent_id: "subagent_1", tool_id: "tool_1", name: "search", result: "ok", is_error: false },
  ],
  ["run.completed", { status: "completed", token_usage: { input_tokens: 1, output_tokens: 2 } }],
  ["run.failed", { profile: { source: "agent", code: "internal_error", retryable: false } }],
]

const sessionSnapshot = {
  session: {
    session_id: "session_1",
    title: "Session",
    owner_id: "user_1",
    created_at: "2026-08-31T12:00:00.000Z",
    updated_at: "2026-08-31T12:00:00.000Z",
  },
  files: [],
  deliveries: [],
  deliveries_has_more: false,
  event_watermark: EVENT_CURSOR,
}

describe("checked-in HTTP request and response contracts", () => {
  it("accepts the canonical message request and rejects missing/unknown fields", () => {
    expect(messageCreateParamsSchema.parse({
      idempotency_key: "request_1",
      content: "hello",
      model: "model_1",
      agent: "general",
      thinking: true,
      selected_skill_source_refs: ["skill:skill_1"],
      mcp_servers: ["server_1"],
      project_ref: "project_1",
    })).toMatchObject({ idempotency_key: "request_1", content: "hello" })

    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", tenant_id: "tenant_1" }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", thinking: "medium" }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", pinned_skills: ["skill_1"] }).success).toBe(false)
    for (const invalid of ["skill:skill_1\n", "skill:skill_1\r", "skill:skill_1\u2028", " skill:skill_1", "skill:"]) {
      expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", selected_skill_source_refs: [invalid] }).success).toBe(false)
    }
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", selected_skill_source_refs: ["skill:a", "skill:a"] }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", selected_skill_source_refs: Array.from({ length: 17 }, (_, index) => `skill:s${index}`) }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "", content: "hello" }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "" }).success).toBe(false)
  })

  it("accepts each HITL decision shape while keeping control bodies strict", () => {
    const decisions = [
      { type: "approve", item_id: "tool_1" },
      { type: "edit", item_id: "tool_1", args: { query: "updated" } },
      { type: "reject", item_id: "tool_1", reason: "not needed" },
      { type: "respond", item_id: "tool_1", response: "answer" },
      { type: "submit", item_id: "request_1", value: { answer: "yes" } },
    ]

    for (const decision of decisions) {
      expect(resumeDecisionSchema.safeParse(decision).success).toBe(true)
      expect(runControlBodySchema.safeParse({ kind: "run.resume", expected_pause_revision: 1, pause_ref: "pause_1", decisions: [decision] }).success).toBe(true)
    }
    expect(runControlBodySchema.safeParse({ kind: "run.cancel" }).success).toBe(true)
    expect(runControlBodySchema.safeParse({ kind: "run.resume", expected_pause_revision: 1, pause_ref: "pause_1", decisions: [] }).success).toBe(false)
    expect(resumeDecisionSchema.safeParse({ type: "submit", item_id: "request_1", value: "yes" }).success).toBe(false)
    expect(runControlBodySchema.safeParse({ kind: "run.pause", session_id: "session_1" }).success).toBe(false)
    expect(runControlBodySchema.safeParse({ kind: "run.cancel", expected_pause_revision: 1, pause_ref: "pause_1", tenant_id: "tenant_1" }).success).toBe(false)
  })

  it("accepts flat session responses and rejects envelope or unknown-field drift", () => {
    expect(sessionSnapshotSchema.parse(sessionSnapshot).event_watermark).toBe(EVENT_CURSOR)
    expect(sessionListSchema.parse({ sessions: [], next_cursor: "CURSOR" }).next_cursor).toBe("CURSOR")
    expect(sessionListSchema.parse({ sessions: [], next_cursor: "" }).next_cursor).toBe("")
    expect(sessionListSchema.parse({ sessions: [], next_cursor: null }).next_cursor).toBeNull()
    expect(messageCreateReceiptSchema.parse({ run_id: "run_1", user_message_id: "message_1", assistant_message_id: "message_2" })).toBeTruthy()
    expect(runControlReceiptSchema.parse({
      run_id: "run_1",
      command_id: "command_1",
      request_digest: "sha256:abc",
      status: "succeeded",
      replayed: false,
    })).toMatchObject({ run_id: "run_1", command_id: "command_1", status: "succeeded" })

    expect(sessionSnapshotSchema.safeParse({ ...sessionSnapshot, data: {} }).success).toBe(false)
    expect(sessionListSchema.safeParse({ sessions: [] }).success).toBe(false)
    expect(sessionListSchema.safeParse({ sessions: [], next_cursor: undefined }).success).toBe(false)
    expect(sessionListSchema.safeParse({ sessions: [], next_cursor: 1 }).success).toBe(false)
    expect(sessionListSchema.safeParse({ sessions: [], next_cursor: null, has_more: false }).success).toBe(false)
  })

  it("keeps BFF error bodies flat and non-empty", () => {
    for (const error of ["auth_not_configured", "unauthenticated", "forbidden_origin", "session_unreachable", "hub_not_configured", "hub_unreachable"]) {
      expect(errorResponseSchema.parse({ error })).toEqual({ error })
    }
    expect(errorResponseSchema.safeParse({ error: "" }).success).toBe(false)
    expect(errorResponseSchema.safeParse({ error: "unauthenticated", requestId: "req_1" }).success).toBe(false)
  })

  it.each(AGENT_FAILURE_TUPLES)(
    "accepts the published safe Message failure tuple $code retryable=$retryable",
    (failure) => {
      expect(sessionSnapshotSchema.safeParse({
        ...sessionSnapshot,
        messages: [{
          message_id: "assistant_failed",
          role: "assistant",
          content: "partial answer",
          status: "failed",
          created_at: "2026-09-30T00:00:00.000Z",
          run_id: "run_failed",
          failure,
        }],
      }).success).toBe(true)
    },
  )

  it("keeps Message failure optional for a failed assistant with a run", () => {
    expect(sessionSnapshotSchema.safeParse({
      ...sessionSnapshot,
      messages: [{
        message_id: "assistant_failed_without_profile",
        role: "assistant",
        content: "",
        status: "failed",
        created_at: "2026-09-30T00:00:00.000Z",
        run_id: "run_failed",
      }],
    }).success).toBe(true)
  })

  it.each([
    ["user role", { role: "user" }],
    ["system role", { role: "system" }],
    ["pending status", { status: "pending" }],
    ["streaming status", { status: "streaming" }],
    ["completed status", { status: "completed" }],
    ["missing run", { run_id: undefined }],
    ["empty run", { run_id: "" }],
    ["blank run", { run_id: "   " }],
  ] as const)("rejects a Message failure with %s", (_label, override) => {
    expect(sessionSnapshotSchema.safeParse({
      ...sessionSnapshot,
      messages: [{
        message_id: "invalid_failure_message",
        role: "assistant",
        content: "",
        status: "failed",
        created_at: "2026-09-30T00:00:00.000Z",
        run_id: "run_failed",
        failure: AGENT_FAILURE_TUPLES[0],
        ...override,
      }],
    }).success).toBe(false)
  })

  it.each([
    { source: "agent", code: "model_unavailable", retryable: true, extra: "raw" },
    { source: "agent", code: "unknown_failure", retryable: false },
    { source: "owner", code: "internal_error", retryable: false },
    { source: "agent", code: "internal_error" },
    null,
  ])("rejects an invalid Message failure profile %#", (failure) => {
    expect(sessionSnapshotSchema.safeParse({
      ...sessionSnapshot,
      messages: [{
        message_id: "invalid_failure_profile",
        role: "assistant",
        content: "",
        status: "failed",
        created_at: "2026-09-30T00:00:00.000Z",
        run_id: "run_failed",
        failure,
      }],
    }).success).toBe(false)
  })

  it.each(AGENT_FAILURE_CODES.filter(
    (code) => code !== "model_unavailable" && code !== "dependency_unavailable",
  ))("rejects retryable=true for the permanent Message failure %s", (code) => {
    expect(sessionSnapshotSchema.safeParse({
      ...sessionSnapshot,
      messages: [{
        message_id: "invalid_retryable_failure",
        role: "assistant",
        content: "",
        status: "failed",
        created_at: "2026-09-30T00:00:00.000Z",
        run_id: "run_failed",
        failure: { source: "agent", code, retryable: true },
      }],
    }).success).toBe(false)
  })
})

describe("checked-in SSE event union", () => {
  it.each(eventFixtures)("accepts %s with its payload shape", (kind, payload) => {
    const parsed = chatProjectionEventSchema.parse({ ...eventEnvelope, kind, payload })
    expect(parsed.kind).toBe(kind)
  })

  it("rejects negative watermarks, unknown event fields, and unstable failure codes", () => {
    expect(chatProjectionEventSchema.safeParse({ ...eventEnvelope, seq: -1, kind: "run.completed", payload: { status: "completed" } }).success).toBe(false)
    expect(chatProjectionEventSchema.safeParse({ ...eventEnvelope, extra: true, kind: "run.completed", payload: { status: "completed" } }).success).toBe(false)
    expect(chatProjectionEventSchema.safeParse({ ...eventEnvelope, kind: "run.failed", payload: { profile: { source: "agent", code: "unknown_failure", retryable: false } } }).success).toBe(false)
    expect(RUNTIME_AGENT_FAILURE_CODES).toContain("contract_incompatible")
  })
})

describe("cursor pagination and same-origin client paths", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("URL-encodes session cursors without resurrecting a hash Artifact list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessions: [], next_cursor: "next" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createSessionClient({ baseUrl: "/api/session" })
    await expect(client.listSessions("cursor/2", { kind: "project", projectRef: "project/1" })).resolves.toMatchObject({ next_cursor: "next" })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions?cursor=cursor%2F2&project_ref=project%2F1")
  })

  it("keeps direct and project Chat on the same message/control contract with header-only message identity", async () => {
    const receipt = { run_id: "run_1", user_message_id: "message_1", assistant_message_id: "message_2" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [], next_cursor: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [], next_cursor: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: "run_1", command_id: "cancel_1", request_digest: "sha256:cancel", status: "succeeded", replayed: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: "run_2", command_id: "resume_1", request_digest: "sha256:resume", status: "succeeded", replayed: false }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const client = createSessionClient({ baseUrl: "/api/session" })
    await client.listSessions(undefined, { kind: "direct" })
    await client.listSessions(undefined, { kind: "project", projectRef: "project/1" })
    await client.createMessage("direct_session", { idempotency_key: "direct_1", content: "hello", selected_skill_source_refs: [] })
    await client.createMessage("project_session", {
      idempotency_key: "project_1",
      content: "project task",
      selected_skill_source_refs: [],
      project_ref: "project/1",
    })
    await client.sendControl("direct_session", "run_1", { kind: "run.cancel" }, "cancel_1")
    await client.sendControl("project_session", "run_2", {
      kind: "run.resume",
      expected_pause_revision: 1, pause_ref: "pause_1",
      decisions: [{ type: "submit", item_id: "tool_1", value: { answer: "yes" } }],
    }, "resume_1")

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions?scope=direct")
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/session/sessions?project_ref=project%2F1")
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/session/sessions/direct_session/messages")
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/session/sessions/project_session/messages")
    expect(fetchMock.mock.calls[4]?.[0]).toBe("/api/session/sessions/direct_session/runs/run_1/control")
    expect(fetchMock.mock.calls[5]?.[0]).toBe("/api/session/sessions/project_session/runs/run_2/control")
    expect(JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string)).toEqual({ content: "hello", selected_skill_source_refs: [] })
    expect(JSON.parse((fetchMock.mock.calls[3]?.[1] as RequestInit).body as string)).toEqual({ content: "project task", selected_skill_source_refs: [], project_ref: "project/1" })
    expect(new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).get("idempotency-key")).toBe("direct_1")
    expect(new Headers((fetchMock.mock.calls[3]?.[1] as RequestInit).headers).get("idempotency-key")).toBe("project_1")
    expect(JSON.parse((fetchMock.mock.calls[4]?.[1] as RequestInit).body as string)).toEqual({ kind: "run.cancel" })
    expect(new Headers((fetchMock.mock.calls[4]?.[1] as RequestInit).headers).get("idempotency-key")).toBe("cancel_1")
    expect(JSON.parse((fetchMock.mock.calls[5]?.[1] as RequestInit).body as string)).toEqual({
      kind: "run.resume",
      expected_pause_revision: 1, pause_ref: "pause_1",
      decisions: [{ type: "submit", item_id: "tool_1", value: { answer: "yes" } }],
    })
    expect(new Headers((fetchMock.mock.calls[5]?.[1] as RequestInit).headers).get("idempotency-key")).toBe("resume_1")
  })

  it("reuses the message key and unchanged canonical body when an unacknowledged intent is retried", async () => {
    const receipt = { run_id: "run_1", user_message_id: "message_1", assistant_message_id: "message_2" }
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const client = createSessionClient({ baseUrl: "/api/session" })
    const intent = { idempotency_key: "stable-intent", content: "retry me", model: "model_1", selected_skill_source_refs: [] }
    await expect(client.createMessage("session_1", intent)).rejects.toMatchObject({ reason: "network" })
    await expect(client.createMessage("session_1", intent)).resolves.toEqual(receipt)
    const sent = fetchMock.mock.calls.map(([, init]) => ({
      key: new Headers((init as RequestInit).headers).get("idempotency-key"),
      body: JSON.parse((init as RequestInit).body as string),
    }))
    expect(sent).toEqual([
      { key: "stable-intent", body: { content: "retry me", model: "model_1", selected_skill_source_refs: [] } },
      { key: "stable-intent", body: { content: "retry me", model: "model_1", selected_skill_source_refs: [] } },
    ])
  })

  it("rejects unknown identity fields and missing or empty message keys before fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const client = createSessionClient({ baseUrl: "/api/session" })
    const invalid = [
      { idempotency_key: "stable", content: "hello", tenant_id: "forged" },
      { idempotency_key: "", content: "hello" },
      { content: "hello" },
    ]
    for (const body of invalid) {
      await expect(client.createMessage("session_1", body as never)).rejects.toMatchObject({ reason: "parse" })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses the same resumable SSE wire for a project Chat session", async () => {
    const event = {
      type: "RUN_FINISHED",
      timestamp: Date.parse("2026-08-31T12:00:01.000Z"),
      threadId: "project_session",
      runId: "run_1",
      metadata: {
        kokoro: {
          event_id: "evt_43",
          seq: 43,
          session_id: "project_session",
          run_id: "run_1",
          timestamp: "2026-08-31T12:00:01.000Z",
        },
      },
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`id: ${NEXT_EVENT_CURSOR}\ndata: ${JSON.stringify(event)}\n\n`))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }))
    vi.stubGlobal("fetch", fetchMock)
    const onEvent = vi.fn()
    const onCursor = vi.fn()
    const onStreamError = vi.fn()
    const client = createSessionClient({ baseUrl: "/api/session" })
    const stream = client.openEvents({
      sessionId: "project_session",
      resumeCursor: EVENT_CURSOR,
      onCursor,
      onEvent,
      onStreamError,
    })

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions/project_session/events")
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get("accept")).toBe("text/event-stream")
    expect(headers.get("last-event-id")).toBe(EVENT_CURSOR)
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ seq: 43, kind: "run.completed" }))
    expect(onCursor).toHaveBeenCalledWith(NEXT_EVENT_CURSOR)
    expect(onStreamError).not.toHaveBeenCalled()
    stream.close()
  })
})


import {
  makePublic4Decisions as r66Decisions,
  makePublic4Interaction as r66Interaction,
  makePublic4Resume as r66Resume,
  makePublic4Snapshot as r66Snapshot,
} from "../tests/core/fixtures"

describe("R66 public4 wire/head and closed resume", () => {
  it("keeps a legal unchanged create/receipt control before testing the breaking fields", () => {
    expect(messageCreateParamsSchema.safeParse({
      content: "R66 control", idempotency_key: "r66_create",
      thinking: false, selected_skill_source_refs: [],
    }).success).toBe(true)
    expect(messageCreateReceiptSchema.safeParse({
      run_id: "run_1", user_message_id: "r66_user", assistant_message_id: "r66_assistant",
    }).success).toBe(true)
    expect(runControlReceiptSchema.safeParse({
      run_id: "run_1", command_id: "r66_control", request_digest: "sha256:r66",
      status: "succeeded", replayed: false,
    }).success).toBe(true)
  })

  it.each(["none", "queued", "active", "waiting", "resuming"] as const)(
    "accepts the owner %s snapshot without old top-level pending fields",
    (state) => {
      const raw = r66Snapshot({ state })
      const parsed = sessionSnapshotSchema.safeParse(raw)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return
      expect(parsed.data).toEqual(raw)
      expect(parsed.data).not.toHaveProperty("active_run")
      expect(parsed.data).not.toHaveProperty("pending_pauses")
    },
  )

  it("rejects the legacy snapshot even when it still satisfies the old consumer", () => {
    expect(sessionSnapshotSchema.safeParse({
      ...r66Snapshot({ state: "none" }),
      active_run: { run_id: "run_1", status: "running" }, pending_pauses: [],
    }).success).toBe(false)
  })

  it.each(r66Decisions())("accepts the closed owner $type item_id decision", (decision) => {
    expect(resumeDecisionSchema.safeParse(decision).success).toBe(true)
    expect(resumeDecisionSchema.safeParse({ ...decision, private_fence: "forbidden" }).success).toBe(false)
  })

  it("accepts exact pause locators and rejects locator omissions and old public identity", () => {
    const valid = r66Resume()
    expect(runControlBodySchema.safeParse(valid).success).toBe(true)
    for (const field of ["expected_pause_revision", "pause_ref"] as const) {
      const invalid: Record<string, unknown> = { ...valid }
      delete invalid[field]
      expect(runControlBodySchema.safeParse(invalid).success).toBe(false)
    }
    expect(runControlBodySchema.safeParse({ ...valid, session_id: "conv_9" }).success).toBe(false)
    expect(runControlBodySchema.safeParse({ ...valid, expected_pause_revision: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false)
    expect(runControlBodySchema.safeParse({ ...valid, pause_ref: "" }).success).toBe(false)
  })

  it("rejects decisions-only/tool_id/request_id rather than keeping public3 aliases", () => {
    expect(runControlBodySchema.safeParse({
      kind: "run.resume", session_id: "conv_9",
      decisions: [{ type: "approve", tool_id: "item_approve" }],
    }).success).toBe(false)
    expect(resumeDecisionSchema.safeParse({
      type: "submit", request_id: "item_submit", value: { text: "answer" },
    }).success).toBe(false)
  })

  it("checks complete cardinality, global uniqueness and display privacy after the legal control", () => {
    const legal = r66Snapshot()
    expect(sessionSnapshotSchema.safeParse(legal).success).toBe(true)
    const state = r66Interaction()
    const firstGroup = state.groups.at(0)
    const firstItem = firstGroup?.items.at(0)
    if (!firstGroup || !firstItem) throw new Error("R66 fixture requires two populated groups")
    const invalidStates = [
      { ...state, interaction_revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...state, pause_revision: 0, pause_ref: null },
      { ...state, groups: [] },
      { ...state, groups: [...state.groups, firstGroup] },
      { ...state, groups: [{ ...firstGroup, items: [firstItem, firstItem] }] },
      { ...state, groups: [{ ...firstGroup, items: [{ ...firstItem, args: { token: "private" } }] }] },
      { ...state, groups: [{ ...firstGroup, items: [{ ...firstItem,
        display: { ...firstItem.display, result_preview: "preview without provenance" },
      }] }] },
      { ...state, action_result: { command_id: "old", pause_revision: 3, kind: "accepted" } },
    ]
    for (const invalid of invalidStates) {
      expect(sessionSnapshotSchema.safeParse({
        ...legal, execution_head: { run_id: "run_1", state: "waiting", pending_pauses: [invalid] },
      }).success).toBe(false)
    }
    for (const head of [
      null,
      { run_id: "run_1", state: "active", pending_pauses: [state] },
      { run_id: "run_1", state: "waiting", pending_pauses: [] },
      { run_id: "run_1", state: "waiting", pending_pauses: [state, state] },
      { run_id: "run_1", state: "resuming", pending_pauses: [state] },
    ]) expect(sessionSnapshotSchema.safeParse({ ...legal, execution_head: head }).success).toBe(false)
  })

  it("preserves omitted versus explicit nullable display/validation without changing business null", () => {
    const state = r66Interaction()
    const group = state.groups.at(0)
    if (!group) throw new Error("R66 fixture requires a first group")
    const items = group.items.map((item, index) => index === 0 ? {
      ...item, validation: null,
      display: { ...item.display, result_preview: null, truncated: null, source: null },
    } : item)
    const raw = r66Snapshot({ interaction: { ...state, groups: [{ ...group, items }, ...state.groups.slice(1)] } })
    const parsed = sessionSnapshotSchema.safeParse(raw)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual(raw)
    expect(r66Resume().decisions.at(-1)?.value).toEqual({ text: "R66 input", optional: null })
  })
})

// R76 public5 owner create graph: independent tasks, optional exact Project ID.
import { createHash as r76Hash } from "node:crypto"
import { readFile as r76ReadFile } from "node:fs/promises"
import r76Yaml from "yaml"

async function r76PublicSpec() {
  const bytes = await r76ReadFile("src/generated/bff-public-openapi.yaml")
  const spec = r76Yaml.parse(bytes.toString("utf8")) as {
    info: { version: string }
    components: { schemas: Record<string, {
      type: string; required: string[]; additionalProperties: boolean
      properties: Record<string, { type: string; minLength?: number; pattern?: string }>
    }> }
    paths: Record<string, { post: {
      parameters: Array<{ $ref: string }>
      requestBody: { required: boolean; content: { "application/json": { schema: { $ref: string } } } }
      responses: Record<string, { $ref?: string }>
    } }>
  }
  return { bytes, spec }
}

describe("R76 public5 ScheduledTask owner creation graph", () => {
  it("consumes the exact published public5 canonical bytes", async () => {
    const { bytes, spec } = await r76PublicSpec()
    expect(r76Hash("sha256").update(bytes).digest("hex")).toBe("3ce25a31d326a358d6e1d3c8ee33b5e07dbc34da13ee0933b3b5edf31531918b")
    expect(spec.info.version).toBe("5.0.0")
  })

  it("has five required create fields and rejects enabled/status as creation properties", async () => {
    const create = (await r76PublicSpec()).spec.components.schemas.CreateScheduledTaskRequest!
    expect(create.type).toBe("object")
    expect(create.additionalProperties).toBe(false)
    expect(create.required).toEqual(["title", "prompt", "frequency", "time", "timezone"])
    expect(Object.keys(create.properties)).toEqual([
      "project_id", "title", "prompt", "frequency", "time", "timezone", "next_run_at", "expires_at", "auto_approve",
    ])
    expect(create.properties.enabled).toBeUndefined()
    expect(create.properties.status).toBeUndefined()
    expect(create.required).not.toContain("project_id")
    expect(create.required).not.toContain("auto_approve")
  })

  it("models exact nonempty optional project_id without a project_ref alias or trimming", async () => {
    const create = (await r76PublicSpec()).spec.components.schemas.CreateScheduledTaskRequest!
    const project = create.properties.project_id
    expect(project).toMatchObject({ type: "string", minLength: 1 })
    expect(create.properties.project_ref).toBeUndefined()
    if (!project?.pattern) throw new Error("owner project_id must publish its exact boundary pattern")
    const pattern = new RegExp(project.pattern, "u")
    for (const valid of ["project_1", "slug-1", "项目", "internal space", "x"]) expect(pattern.test(valid)).toBe(true)
    for (const invalid of ["", " ", "\t", " project_1", "project_1 ", "project_1\n", "\nproject_1"]) expect(pattern.test(invalid)).toBe(false)
  })

  it("keeps the existing create path and idempotency boundary with owner Project 404", async () => {
    const post = (await r76PublicSpec()).spec.paths["/v1/scheduled-tasks"]!.post
    expect(post.parameters).toEqual([{ $ref: "#/components/parameters/IdempotencyKey" }])
    expect(post.requestBody.required).toBe(true)
    expect(post.requestBody.content["application/json"].schema).toEqual({ $ref: "#/components/schemas/CreateScheduledTaskRequest" })
    expect(post.responses["404"]).toEqual({ $ref: "#/components/responses/NotFound" })
  })
})
