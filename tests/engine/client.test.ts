import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionClient } from "@/engine/client"

describe("R135 snapshot-first process page client", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the public7 required nullable snapshot process", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: { session_id: "ses_1", title: "Chat", owner_id: "user_1", created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-03T00:00:01Z" },
      files: [], deliveries: [], deliveries_has_more: false,
      event_watermark: "agui_00000000000000000000000000000011",
      execution_process: null,
    }), { status: 200, headers: { "content-type": "application/json" } })))
    await expect(createSessionClient({ baseUrl: "/api/session" }).fetchSnapshot("ses_1")).resolves.toMatchObject({
      execution_process: null,
    })
  })

  it("propagates an AbortSignal to the real snapshot request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    const client = createSessionClient({ baseUrl: "/api/session" })
    await (client.fetchSnapshot as unknown as (id: string, options: { signal: AbortSignal }) => Promise<unknown>)(
      "ses_abort", { signal: controller.signal },
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/sessions/ses_abort",
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it("R136 consumes the catchall's unwrapped public7 page with exact anchor, scope, cursor and signal", async () => {
    const page = {
      run_id: "run_a", todos: null, activities: [], next_cursor: null,
      event_watermark: "agui_00000000000000000000000000000011",
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), {
      status: 200, headers: { "content-type": "application/json" },
    }))
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    await expect(createSessionClient({ baseUrl: "/api/session" }).fetchRunProcessPage({
      sessionId: "ses_a", runId: "run_a", watermark: page.event_watermark,
      cursor: "agui_00000000000000000000000000000022", scope: { kind: "project", projectRef: "project a" },
      signal: controller.signal,
    })).resolves.toEqual(page)
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe("/api/session/sessions/ses_a/runs/run_a/process?watermark=agui_00000000000000000000000000000011&limit=100&cursor=agui_00000000000000000000000000000022&project_ref=project+a")
    expect(init.signal).toBe(controller.signal)
  })

  it("R136 rejects a re-wrapped success body and preserves a public7 error code", async () => {
    const page = { run_id: "run_a", todos: null, activities: [], next_cursor: null, event_watermark: "agui_00000000000000000000000000000011" }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: page, meta: { request_id: "req" } }), {
      status: 200, headers: { "content-type": "application/json" },
    })).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "process_projection_unavailable", message: "unavailable" }, meta: { request_id: "req" } }), {
      status: 503, headers: { "content-type": "application/json" },
    })))
    const client = createSessionClient({ baseUrl: "/api/session" })
    const args = { sessionId: "ses_a", runId: "run_a", watermark: page.event_watermark, scope: { kind: "direct" } as const }
    await expect(client.fetchRunProcessPage(args)).rejects.toThrow()
    await expect(client.fetchRunProcessPage(args)).rejects.toMatchObject({ code: "process_projection_unavailable" })
  })

})

describe("listSessions：owner required nullable cursor", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the formal HTTP 200 terminal page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: [], next_cursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    await expect(createSessionClient({ baseUrl: "/api/session" }).listSessions()).resolves.toEqual({
      sessions: [],
      next_cursor: null,
    })
  })

  it("preserves every published string cursor including an empty string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: [], next_cursor: "" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    await expect(createSessionClient({ baseUrl: "/api/session" }).listSessions()).resolves.toEqual({
      sessions: [],
      next_cursor: "",
    })
  })

  it.each([
    { sessions: [] },
    { sessions: [], next_cursor: undefined },
    { sessions: [], next_cursor: 1 },
    { sessions: [], next_cursor: null, has_more: false },
  ])("rejects non-owner page shape %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ))
    await expect(createSessionClient({ baseUrl: "/api/session" }).listSessions()).rejects.toThrow()
  })
})

describe("fetchSnapshot：会话不存在/已软删都优雅缺席（不 fail-loud）", () => {
  afterEach(() => vi.unstubAllGlobals())

  const clientFor = (status: number) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })))
    return createSessionClient({ baseUrl: "http://session.test/" })
  }

  it("404（从无此会话）→ null，空线程即真态", async () => {
    await expect(clientFor(404).fetchSnapshot("conv_x")).resolves.toBeNull()
  })

  it("410 Gone（软删会话）→ null，水合优雅缺席而非硬错屏", async () => {
    await expect(clientFor(410).fetchSnapshot("conv_x")).resolves.toBeNull()
  })

  it("其它非 ok（500）仍 fail-loud 抛错", async () => {
    await expect(clientFor(500).fetchSnapshot("conv_x")).rejects.toThrow()
  })
})

describe("fetchSnapshot：兼容 Session runtime 的 feature_key 增量元数据", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("接受服务端新增的 feature_key，不把可选能力元数据当成水合错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        session: {
          session_id: "ses_1",
          title: "Chat",
          owner_id: "user_1",
          created_at: "2026-07-02T00:00:00Z",
          updated_at: "2026-07-02T00:00:01Z",
          feature_key: "chat",
        },
        messages: [],
        files: [],
        deliveries: [],
        deliveries_has_more: false,
        event_watermark: null,
        execution_process: null,
      }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ))

    const snapshot = await createSessionClient({ baseUrl: "/api/session" }).fetchSnapshot("ses_1")
    expect(snapshot?.session.feature_key).toBe("chat")
  })
})

describe("listModels（MODEL-UX）：GET /models 过契约 Zod", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("解析候选列表（provider/name/is_default）+ 命中 /models 路径", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ provider: "anthropic", name: "claude-sonnet-4-6", is_default: true }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const list = await createSessionClient({ baseUrl: "/api/session" }).listModels()
    expect(list.models).toEqual([{ provider: "anthropic", name: "claude-sonnet-4-6", is_default: true }])
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/models")
  })

  it("非 ok 时 fail-loud 抛错（不静默降级）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    await expect(createSessionClient({ baseUrl: "/api/session" }).listModels()).rejects.toThrow()
  })
})

describe("renameSession（CONV-UX）：PATCH /sessions/{id}/title 过契约 Zod", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("PATCH 命中 /title 路径 + 送 {title} 体 + 解析 {ok:true}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const receipt = await createSessionClient({ baseUrl: "/api/session" }).renameSession("ses_1", "新标题")
    expect(receipt).toEqual({ ok: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions/ses_1/title")
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ title: "新标题" })
    expect(new Headers(init.headers).get("idempotency-key")).toMatch(/^session-mutation:/)
  })

  it("非 ok（422 超长 / 403 他人 / 404 软删）fail-loud 抛错（错误码回带）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: { code: "title_too_long", message: "Title is too long" },
          meta: { request_id: "request-title" },
        }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    )
    await expect(
      createSessionClient({ baseUrl: "/api/session" }).renameSession("ses_1", "x"),
    ).rejects.toThrow("Title is too long")
  })
})
