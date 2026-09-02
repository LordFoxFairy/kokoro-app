import { afterEach, describe, expect, it, vi } from "vitest"

import {
  artifactListSchema,
  errorResponseSchema,
  messageCreateParamsSchema,
  messageCreateReceiptSchema,
  runControlBodySchema,
  runControlReceiptSchema,
  sessionListSchema,
  sessionSnapshotSchema,
} from "@/contract/http"
import { resumeDecisionSchema } from "@/contract/control"
import { RUN_FAILURE_CODES, sessionEventSchema } from "@/contract/session-events"
import { createSessionClient } from "@/engine/client"

const eventEnvelope = {
  event_id: "evt_1",
  seq: 0,
  session_id: "session_1",
  run_id: "run_1",
  timestamp: "2026-08-31T12:00:00.000Z",
}

const eventFixtures: Array<[string, Record<string, unknown>]> = [
  ["session.created", { title: "New session", owner_id: "user_1" }],
  ["run.created", { run_id: "run_1" }],
  ["message.user", { message_id: "message_1", content: "hello" }],
  ["message.delta", { segment_id: "segment_1", delta: "hello" }],
  ["message.completed", { segment_id: "segment_1", content: "hello" }],
  ["thinking.delta", { segment_id: "segment_1", delta: "thinking" }],
  ["tool.invoked", { segment_id: "segment_1", tool_id: "tool_1", name: "search", args: {} }],
  ["tool.output.delta", { segment_id: "segment_1", tool_id: "tool_1", name: "search", delta: "result" }],
  [
    "tool.awaiting_approval",
    {
      segment_id: "segment_1",
      tool_id: "tool_1",
      name: "search",
      args: {},
      description: "Approve search",
      allowed_decisions: ["approve"],
      kind: "tool_approval",
      editable: false,
      pending_tool_ids: ["tool_1"],
    },
  ],
  [
    "tool.returned",
    { segment_id: "segment_1", tool_id: "tool_1", name: "search", result: "ok", is_error: false },
  ],
  [
    "delivery.created",
    { path: "deliveries/report.pdf", title: "Report", mime: "application/pdf", size: 12, content_hash: "hash_1" },
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
  ["run.failed", { code: "internal_error", error_kind: "Error", message: "run failed" }],
]

const sessionSnapshot = {
  session: {
    session_id: "session_1",
    title: "Session",
    owner_id: "user_1",
    created_at: "2026-08-31T12:00:00.000Z",
    updated_at: "2026-08-31T12:00:00.000Z",
  },
  pending_pauses: [],
  files: [],
  deliveries: [],
  event_watermark: 0,
}

describe("checked-in HTTP request and response contracts", () => {
  it("accepts the canonical message request and rejects missing/unknown fields", () => {
    expect(messageCreateParamsSchema.parse({
      idempotency_key: "request_1",
      content: "hello",
      model: "model_1",
      agent: "general",
      thinking: true,
      pinned_skills: ["skill_1"],
      mcp_servers: ["server_1"],
      project_ref: "project_1",
    })).toMatchObject({ idempotency_key: "request_1", content: "hello" })

    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", tenant_id: "tenant_1" }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "hello", thinking: "medium" }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "", content: "hello" }).success).toBe(false)
    expect(messageCreateParamsSchema.safeParse({ idempotency_key: "request_1", content: "" }).success).toBe(false)
  })

  it("accepts each HITL decision shape while keeping control bodies strict", () => {
    const decisions = [
      { type: "approve", tool_id: "tool_1" },
      { type: "edit", tool_id: "tool_1", args: { query: "updated" } },
      { type: "reject", tool_id: "tool_1", reason: "not needed" },
      { type: "respond", tool_id: "tool_1", response: "answer" },
      { type: "submit", request_id: "request_1", value: { answer: "yes" } },
    ]

    for (const decision of decisions) {
      expect(resumeDecisionSchema.safeParse(decision).success).toBe(true)
      expect(runControlBodySchema.safeParse({ kind: "run.resume", session_id: "session_1", decisions: [decision] }).success).toBe(true)
    }
    expect(runControlBodySchema.safeParse({ kind: "run.cancel", session_id: "session_1" }).success).toBe(true)
    expect(runControlBodySchema.safeParse({ kind: "run.resume", session_id: "session_1", decisions: [] }).success).toBe(false)
    expect(resumeDecisionSchema.safeParse({ type: "submit", request_id: "request_1", value: "yes" }).success).toBe(false)
    expect(runControlBodySchema.safeParse({ kind: "run.pause", session_id: "session_1" }).success).toBe(false)
    expect(runControlBodySchema.safeParse({ kind: "run.cancel", session_id: "session_1", tenant_id: "tenant_1" }).success).toBe(false)
  })

  it("accepts flat session/artifact responses and rejects envelope or unknown-field drift", () => {
    expect(sessionSnapshotSchema.parse(sessionSnapshot).event_watermark).toBe(0)
    expect(sessionListSchema.parse({ sessions: [], next_cursor: "CURSOR" }).next_cursor).toBe("CURSOR")
    expect(artifactListSchema.parse({ artifacts: [], next_cursor: "CURSOR" }).next_cursor).toBe("CURSOR")
    expect(messageCreateReceiptSchema.parse({ run_id: "run_1", user_message_id: "message_1", assistant_message_id: "message_2" })).toBeTruthy()
    expect(runControlReceiptSchema.parse({
      run_id: "run_1",
      command_id: "command_1",
      request_digest: "sha256:abc",
      status: "succeeded",
      replayed: false,
    })).toMatchObject({ run_id: "run_1", command_id: "command_1", status: "succeeded" })

    expect(sessionSnapshotSchema.safeParse({ ...sessionSnapshot, data: {} }).success).toBe(false)
    expect(sessionListSchema.safeParse({ sessions: [], next_cursor: null }).success).toBe(false)
    expect(artifactListSchema.safeParse({ artifacts: [], extra: true }).success).toBe(false)
  })

  it("keeps BFF error bodies flat and non-empty", () => {
    for (const error of ["auth_not_configured", "unauthenticated", "forbidden_origin", "session_unreachable", "hub_not_configured", "hub_unreachable"]) {
      expect(errorResponseSchema.parse({ error })).toEqual({ error })
    }
    expect(errorResponseSchema.safeParse({ error: "" }).success).toBe(false)
    expect(errorResponseSchema.safeParse({ error: "unauthenticated", requestId: "req_1" }).success).toBe(false)
  })
})

describe("checked-in SSE event union", () => {
  it.each(eventFixtures)("accepts %s with its payload shape", (kind, payload) => {
    const parsed = sessionEventSchema.parse({ ...eventEnvelope, kind, payload })
    expect(parsed.kind).toBe(kind)
  })

  it("rejects negative watermarks, unknown event fields, and unstable failure codes", () => {
    expect(sessionEventSchema.safeParse({ ...eventEnvelope, seq: -1, kind: "run.completed", payload: { status: "completed" } }).success).toBe(false)
    expect(sessionEventSchema.safeParse({ ...eventEnvelope, extra: true, kind: "run.completed", payload: { status: "completed" } }).success).toBe(false)
    expect(sessionEventSchema.safeParse({ ...eventEnvelope, kind: "run.failed", payload: { code: "unknown_failure", error_kind: "Error", message: "failed" } }).success).toBe(false)
    expect(RUN_FAILURE_CODES).toContain("contract_incompatible")
  })
})

describe("cursor pagination and same-origin client paths", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("URL-encodes session and artifact cursors without changing their flat response contracts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [], next_cursor: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ artifacts: [], next_cursor: "next" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const client = createSessionClient({ baseUrl: "/api/session" })
    await expect(client.listSessions("cursor/2", { kind: "project", projectRef: "project/1" })).resolves.toMatchObject({ next_cursor: "next" })
    await expect(client.listArtifacts("artifact cursor")).resolves.toMatchObject({ next_cursor: "next" })

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions?cursor=cursor%2F2&project_ref=project%2F1")
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/session/artifacts?cursor=artifact%20cursor")
  })

  it("keeps direct and project Chat on the same flat message/control contract", async () => {
    const receipt = { run_id: "run_1", user_message_id: "message_1", assistant_message_id: "message_2" }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: "run_1", command_id: "cancel_1", request_digest: "sha256:cancel", status: "succeeded", replayed: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: "run_2", command_id: "resume_1", request_digest: "sha256:resume", status: "succeeded", replayed: false }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const client = createSessionClient({ baseUrl: "/api/session" })
    await client.listSessions(undefined, { kind: "direct" })
    await client.listSessions(undefined, { kind: "project", projectRef: "project/1" })
    await client.createMessage("direct_session", { idempotency_key: "direct_1", content: "hello" })
    await client.createMessage("project_session", {
      idempotency_key: "project_1",
      content: "project task",
      project_ref: "project/1",
    })
    await client.sendControl("direct_session", "run_1", { kind: "run.cancel", session_id: "direct_session" }, "cancel_1")
    await client.sendControl("project_session", "run_2", {
      kind: "run.resume",
      session_id: "project_session",
      decisions: [{ type: "submit", request_id: "tool_1", value: { answer: "yes" } }],
    }, "resume_1")

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions?scope=direct")
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/session/sessions?project_ref=project%2F1")
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/session/sessions/direct_session/messages")
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/session/sessions/project_session/messages")
    expect(fetchMock.mock.calls[4]?.[0]).toBe("/api/session/sessions/direct_session/runs/run_1/control")
    expect(fetchMock.mock.calls[5]?.[0]).toBe("/api/session/sessions/project_session/runs/run_2/control")
    expect(JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string)).not.toHaveProperty("project_ref")
    expect(JSON.parse((fetchMock.mock.calls[3]?.[1] as RequestInit).body as string)).toMatchObject({ project_ref: "project/1" })
    expect(JSON.parse((fetchMock.mock.calls[4]?.[1] as RequestInit).body as string)).toEqual({ kind: "run.cancel", session_id: "direct_session" })
    expect(new Headers((fetchMock.mock.calls[4]?.[1] as RequestInit).headers).get("idempotency-key")).toBe("cancel_1")
    expect(JSON.parse((fetchMock.mock.calls[5]?.[1] as RequestInit).body as string)).toEqual({
      kind: "run.resume",
      session_id: "project_session",
      decisions: [{ type: "submit", request_id: "tool_1", value: { answer: "yes" } }],
    })
    expect(new Headers((fetchMock.mock.calls[5]?.[1] as RequestInit).headers).get("idempotency-key")).toBe("resume_1")
  })

  it("uses the same resumable SSE wire for a project Chat session", async () => {
    const event = { ...eventEnvelope, seq: 43, kind: "run.completed", payload: { status: "completed" } }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const onEvent = vi.fn()
    const onStreamError = vi.fn()
    const client = createSessionClient({ baseUrl: "/api/session" })
    const stream = client.openEvents({
      sessionId: "project_session",
      lastEventId: 42,
      onEvent,
      onStreamError,
    })

    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions/project_session/events")
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
    expect(headers.get("accept")).toBe("text/event-stream")
    expect(headers.get("last-event-id")).toBe("42")
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ seq: 43, kind: "run.completed" }))
    expect(onStreamError).not.toHaveBeenCalled()
    stream.close()
  })
})
