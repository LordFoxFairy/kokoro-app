import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionClient } from "@/engine/client"
import { createFakeClient } from "./fakes"

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
      "/api/session/sessions/ses_abort?scope=direct",
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

  it("解析Public21稳定业务key、显式provider、原模型显示名与精确引用", async () => {
    const candidate = {
      provider: "real-provider", name: "chat/fast", is_default: true, display_name: "vendor/model-fast",
      model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222",
      provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "vendor/model-fast",
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ models: [candidate], next_cursor: null }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const list = await createSessionClient({ baseUrl: "/api/session" }).listModels()
    expect(list).toEqual({ models: [candidate], next_cursor: null })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/models?feature_key=chat")
  })

  it("拒绝旧四字段、缺分页和额外连接数据，不把别名当身份", async () => {
    const candidate = {
      provider: "real-provider", name: "chat/fast", is_default: true, display_name: "Optional alias",
      model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222",
      provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "vendor/model-fast",
    }
    const missingDisplay = Object.fromEntries(Object.entries(candidate).filter(([field]) => field !== "display_name"))
    for (const body of [
      { models: [{ provider: "real-provider", name: "chat/fast", is_default: true, display_name: "Optional alias" }], next_cursor: null },
      { models: [candidate] },
      { models: [missingDisplay], next_cursor: null },
      { models: [{ ...candidate, feature_key: "image" }], next_cursor: null },
      { models: [{ ...candidate, provider_id: "not-a-uuid" }], next_cursor: null },
      { models: [{ ...candidate, display_name: "x".repeat(256) }], next_cursor: null },
      { models: [{ ...candidate, base_url: "https://private.invalid" }], next_cursor: null },
      { models: [candidate], next_cursor: null, secret_handle_ref: "private-reference" },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)))
      await expect(createSessionClient({ baseUrl: "/api/session" }).listModels()).rejects.toMatchObject({ reason: "parse" })
    }
    const pages = vi.fn().mockResolvedValueOnce(Response.json({ models: [candidate], next_cursor: "page/2+" }))
      .mockResolvedValueOnce(Response.json({ models: [{ ...candidate, name: "chat/second" }], next_cursor: null }))
    vi.stubGlobal("fetch", pages)
    expect(await createSessionClient({ baseUrl: "/api/session" }).listModels()).toEqual({ models: [candidate, { ...candidate, name: "chat/second" }], next_cursor: null })
    expect(pages.mock.calls[1]?.[0]).toBe("/api/session/models?feature_key=chat&cursor=page%2F2%2B")
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
type MoveInput = Readonly<{
  sessionId: string;
  targetProjectId: string | null;
  commandId: string;
  signal?: AbortSignal;
}>;
type MoveReceipt = Readonly<{ session_id: string; project_ref: string | null }>;
type MoveMethod = (input: MoveInput) => Promise<MoveReceipt>;

const MOVE_SESSION = "conv_11111111-1111-4111-8111-111111111111";
const MOVE_PROJECT = "project_22222222-2222-4222-8222-222222222222";

function requiredMoveMethod(
  client: ReturnType<typeof createSessionClient>,
): MoveMethod {
  const method = (client as unknown as { moveSession?: unknown }).moveSession;
  expect(typeof method).toBe("function");
  return (method as MoveMethod).bind(client);
}

async function moveFailure(
  operation: Promise<unknown>,
): Promise<Record<string, unknown>> {
  try {
    await operation;
    throw new Error("Move unexpectedly succeeded");
  } catch (error) {
    expect(error).toMatchObject({ name: "ConversationMoveError" });
    const details = (error as { details?: unknown }).details;
    expect(details).toBeTypeOf("object");
    return details as Record<string, unknown>;
  }
}

function moveResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      ...headers,
    },
  });
}

describe("R166 required Move SessionClient boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([MOVE_PROJECT, null, "project_33333333-3333-4333-8333-333333333333"])(
    "sends one exact same-origin command and accepts the strict flat ACK for target %#",
    async (targetProjectId) => {
      const fetchMock = vi.fn().mockResolvedValue(
        moveResponse(
          200,
          {
            session_id: MOVE_SESSION,
            project_ref: targetProjectId,
          },
          { "x-request-id": "req_move_success" },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session/" }),
      );
      const commandId = `move:intent-${targetProjectId ?? "direct"}!`;
      await expect(
        move({ sessionId: MOVE_SESSION, targetProjectId, commandId }),
      ).resolves.toEqual({
        session_id: MOVE_SESSION,
        project_ref: targetProjectId,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(path).toBe(`/api/session/sessions/${MOVE_SESSION}/move`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        target_project_id: targetProjectId,
      });
      expect(new Headers(init.headers)).toEqual(expect.objectContaining({}));
      expect(new Headers(init.headers).get("idempotency-key")).toBe(commandId);
      expect(new Headers(init.headers).has("authorization")).toBe(false);
    },
  );

  it.each([
    { sessionId: "session_alias", targetProjectId: null, commandId: "valid" },
    {
      sessionId: MOVE_SESSION.toUpperCase(),
      targetProjectId: null,
      commandId: "valid",
    },
    {
      sessionId: MOVE_SESSION,
      targetProjectId: "project-slug",
      commandId: "valid",
    },
    {
      sessionId: MOVE_SESSION,
      targetProjectId: undefined as unknown as null,
      commandId: "valid",
    },
    { sessionId: MOVE_SESSION, targetProjectId: MOVE_PROJECT, commandId: "" },
    {
      sessionId: MOVE_SESSION,
      targetProjectId: MOVE_PROJECT,
      commandId: " leading",
    },
    {
      sessionId: MOVE_SESSION,
      targetProjectId: MOVE_PROJECT,
      commandId: "trailing ",
    },
    {
      sessionId: MOVE_SESSION,
      targetProjectId: MOVE_PROJECT,
      commandId: "comma,key",
    },
    {
      sessionId: MOVE_SESSION,
      targetProjectId: MOVE_PROJECT,
      commandId: "x".repeat(129),
    },
  ])(
    "rejects invalid caller input as non-owner parse without fetch %#",
    async (input) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      const details = await moveFailure(move(input));
      expect(details).toEqual({ kind: "parse" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("preserves valid one-byte and 128-byte command identities without trimming or minting", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        moveResponse(
          200,
          {
            session_id: MOVE_SESSION,
            project_ref: null,
          },
          { "x-request-id": "req_key_boundary" },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    await move({
      sessionId: MOVE_SESSION,
      targetProjectId: null,
      commandId: "!",
    });
    await move({
      sessionId: MOVE_SESSION,
      targetProjectId: null,
      commandId: "x".repeat(128),
    });
    expect(
      fetchMock.mock.calls.map((call) =>
        new Headers((call[1] as RequestInit).headers).get("idempotency-key"),
      ),
    ).toEqual(["!", "x".repeat(128)]);
  });

  it.each([
    { data: { session_id: MOVE_SESSION, project_ref: MOVE_PROJECT } },
    { session_id: MOVE_SESSION, project_ref: MOVE_PROJECT, extra: true },
    {
      session_id: "conv_99999999-9999-4999-8999-999999999999",
      project_ref: MOVE_PROJECT,
    },
    { session_id: MOVE_SESSION, project_ref: null },
    { session_id: "session_alias", project_ref: MOVE_PROJECT },
  ])(
    "rejects a non-flat, extra, or identity-mismatched ACK as parse %#",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            moveResponse(200, body, { "x-request-id": "req_bad_ack" }),
          ),
      );
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      expect(
        await moveFailure(
          move({
            sessionId: MOVE_SESSION,
            targetProjectId: MOVE_PROJECT,
            commandId: "bad-ack",
          }),
        ),
      ).toEqual({ kind: "parse" });
    },
  );

  it.each([201, 202])(
    "rejects non-200 success status %i as adapter without a receipt",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          moveResponse(
            status,
            {
              session_id: MOVE_SESSION,
              project_ref: MOVE_PROJECT,
            },
            { "x-request-id": "req_wrong_status" },
          ),
        ),
      );
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      expect(
        await moveFailure(
          move({
            sessionId: MOVE_SESSION,
            targetProjectId: MOVE_PROJECT,
            commandId: `status-${status}`,
          }),
        ),
      ).toEqual({ kind: "adapter" });
    },
  );

  it.each([202, 503])(
    "classifies malformed non-200 JSON status %i as adapter rather than ACK parse",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() =>
          Promise.resolve(
            new Response("{", {
              status,
              headers: { "content-type": "application/json" },
            }),
          ),
        ),
      );
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      expect(
        await moveFailure(
          move({
            sessionId: MOVE_SESSION,
            targetProjectId: MOVE_PROJECT,
            commandId: `malformed-error-${status}`,
          }),
        ),
      ).toEqual({ kind: "adapter" });
    },
  );

  const ownerCases = [
    [400, "invalid_move_request"],
    [400, "idempotency_key_required"],
    [401, "session_authentication_required"],
    [401, "session_invalid"],
    [403, "service_auth_failed"],
    [403, "session_forbidden"],
    [403, "product_tenant_forbidden"],
    [404, "session_not_found"],
    [409, "idempotency_conflict"],
    [409, "idempotency_in_progress"],
    [429, "session_rate_limited"],
    [503, "business_store_unavailable"],
    [503, "iam_admission_unavailable"],
  ] as const;

  it.each(ownerCases)(
    "projects the published %i/%s owner failure without automatic retry",
    async (status, code) => {
      const fetchMock = vi.fn().mockResolvedValue(
        moveResponse(
          status,
          {
            error: {
              code,
              message: "closed owner failure",
              retryable: status === 429 || status === 503,
            },
          },
          {
            "x-request-id": `req ${code}`,
            ...(status === 429 ? { "retry-after": "7" } : {}),
          },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      expect(
        await moveFailure(
          move({
            sessionId: MOVE_SESSION,
            targetProjectId: MOVE_PROJECT,
            commandId: `owner-${code}`,
          }),
        ),
      ).toEqual({
        kind: "owner",
        status,
        code,
        retryable: status === 429 || status === 503,
        requestId: `req ${code}`,
        retryAfter: status === 429 ? "7" : null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      409,
      {
        error: {
          code: "session_not_found",
          message: "wrong graph",
          retryable: false,
        },
      },
      { "x-request-id": "req_bad" },
    ],
    [
      429,
      {
        error: {
          code: "session_rate_limited",
          message: "bad retry",
          retryable: true,
        },
      },
      { "x-request-id": "req_bad", "retry-after": "0" },
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "extra",
          retryable: true,
        },
        extra: true,
      },
      { "x-request-id": "req_bad" },
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "missing id",
          retryable: true,
        },
      },
      {},
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "empty id",
          retryable: true,
        },
      },
      { "x-request-id": "" },
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "long id",
          retryable: true,
        },
      },
      { "x-request-id": "x".repeat(129) },
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "bad retryable",
          retryable: "true",
        },
      },
      { "x-request-id": "req_bad" },
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "inner extra",
          retryable: true,
          extra: true,
        },
      },
      { "x-request-id": "req_bad" },
    ],
    [
      503,
      {
        error: {
          code: "business_store_unavailable",
          message: "wrong retry header",
          retryable: true,
        },
      },
      { "x-request-id": "req_bad", "retry-after": "7" },
    ],
    [
      400,
      {
        error: {
          code: "invalid_move_request",
          message: "local adapter response",
        },
      },
      { "x-request-id": "req_bad" },
    ],
    [
      502,
      {
        error: { code: "bff_bad_response", message: "adapter" },
        meta: { request_id: "req" },
      },
      {},
    ],
  ] as const)(
    "keeps invalid owner-shaped response %# in adapter taxonomy",
    async (status, body, headers) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(moveResponse(status, body, headers)),
      );
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      expect(
        await moveFailure(
          move({
            sessionId: MOVE_SESSION,
            targetProjectId: MOVE_PROJECT,
            commandId: `adapter-${status}`,
          }),
        ),
      ).toEqual({ kind: "adapter" });
    },
  );

  it("maps a pre-aborted caller to network with zero fetch", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    expect(
      await moveFailure(
        move({
          sessionId: MOVE_SESSION,
          targetProjectId: null,
          commandId: "preabort",
          signal: controller.signal,
        }),
      ),
    ).toEqual({ kind: "network" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps network rejection and malformed JSON to distinct non-owner kinds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        new Response("{", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "private, no-store",
            "x-request-id": "req_json",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    expect(
      await moveFailure(
        move({
          sessionId: MOVE_SESSION,
          targetProjectId: null,
          commandId: "network",
        }),
      ),
    ).toEqual({ kind: "network" });
    expect(
      await moveFailure(
        move({
          sessionId: MOVE_SESSION,
          targetProjectId: null,
          commandId: "json",
        }),
      ),
    ).toEqual({ kind: "parse" });
  });

  it("forwards an inflight caller abort, removes its listener, and ignores a late settlement", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          resolveFetch = resolve;
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    const pending = move({
      sessionId: MOVE_SESSION,
      targetProjectId: null,
      commandId: "inflight-abort",
      signal: controller.signal,
    });
    controller.abort();
    expect(await moveFailure(pending)).toEqual({ kind: "network" });
    resolveFetch?.(
      moveResponse(
        200,
        { session_id: MOVE_SESSION, project_ref: null },
        { "x-request-id": "req_late" },
      ),
    );
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const added = add.mock.calls.find(([type]) => type === "abort")?.[1];
    const removed = remove.mock.calls.find(([type]) => type === "abort")?.[1];
    expect(added).toBeDefined();
    expect(removed).toBe(added);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one 10 second budget across fetch and a slow body and releases timers/listeners", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let resolveJson: ((value: unknown) => void) | undefined;
    let internalSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            internalSignal = init?.signal ?? undefined;
            setTimeout(
              () =>
                resolve({
                  status: 200,
                  headers: new Headers({ "x-request-id": "req_slow" }),
                  json: () =>
                    new Promise((resolveBody) => {
                      resolveJson = resolveBody;
                    }),
                } as Response),
              7_000,
            );
          }),
      ),
    );
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    const pending = move({
      sessionId: MOVE_SESSION,
      targetProjectId: null,
      commandId: "slow-body",
      signal: controller.signal,
    });
    const observed = moveFailure(pending);
    let settled = false;
    void observed.finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(6_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await observed).toEqual({ kind: "network" });
    expect(internalSignal?.aborted).toBe(true);
    resolveJson?.({ session_id: MOVE_SESSION, project_ref: null });
    await vi.runAllTimersAsync();
    const added = add.mock.calls.find(([type]) => type === "abort")?.[1];
    const removed = remove.mock.calls.find(([type]) => type === "abort")?.[1];
    expect(added).toBeDefined();
    expect(removed).toBe(added);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a never-headers fetch without a caller signal on the original 10 second budget", async () => {
    vi.useFakeTimers();
    let internalSignal: AbortSignal | undefined;
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          internalSignal = init?.signal ?? undefined;
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    const observed = moveFailure(
      move({
        sessionId: MOVE_SESSION,
        targetProjectId: null,
        commandId: "never-headers",
      }),
    );
    let settled = false;
    void observed.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await observed).toEqual({ kind: "network" });
    expect(internalSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    resolveFetch?.(
      moveResponse(
        200,
        { session_id: MOVE_SESSION, project_ref: null },
        { "x-request-id": "req_late" },
      ),
    );
    await Promise.resolve();
    await expect(observed).resolves.toEqual({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("applies a final monotonic fence after a synchronous ACK validation crosses the deadline", async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    const now = vi
      .spyOn(performance, "now")
      .mockImplementation(() => monotonicNow);
    const ack = { session_id: MOVE_SESSION } as {
      session_id: string;
      project_ref: string | null;
    };
    Object.defineProperty(ack, "project_ref", {
      enumerable: true,
      get: () => {
        monotonicNow = 10_001;
        return MOVE_PROJECT;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "x-request-id": "req_final_fence",
        }),
        json: () => Promise.resolve(ack),
      }),
    );
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    const observed = moveFailure(
      move({
        sessionId: MOVE_SESSION,
        targetProjectId: MOVE_PROJECT,
        commandId: "final-fence",
      }),
    );
    expect(await observed).toEqual({ kind: "network" });
    expect(vi.getTimerCount()).toBe(0);
    now.mockRestore();
  });

  it("aborts while reading the body, balances the caller listener, and ignores the late body", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    let resolveJson: ((value: unknown) => void) | undefined;
    let internalSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        internalSignal = init?.signal ?? undefined;
        return Promise.resolve({
          status: 200,
          headers: new Headers({ "x-request-id": "req_body_abort" }),
          json: () =>
            new Promise((resolve) => {
              resolveJson = resolve;
            }),
        } as Response);
      }),
    );
    const move = requiredMoveMethod(
      createSessionClient({ baseUrl: "/api/session" }),
    );
    const observed = moveFailure(
      move({
        sessionId: MOVE_SESSION,
        targetProjectId: null,
        commandId: "body-abort",
        signal: controller.signal,
      }),
    );
    await Promise.resolve();
    controller.abort();
    expect(await observed).toEqual({ kind: "network" });
    expect(internalSignal?.aborted).toBe(true);
    resolveJson?.({ session_id: MOVE_SESSION, project_ref: null });
    await Promise.resolve();
    const added = add.mock.calls.find(([type]) => type === "abort")?.[1];
    const removed = remove.mock.calls.find(([type]) => type === "abort")?.[1];
    expect(removed).toBe(added);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "owner", "parse", "network"] as const)(
    "balances the exact caller abort listener and timer on the %s exit",
    async (exit) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const result =
        exit === "success"
          ? moveResponse(
              200,
              { session_id: MOVE_SESSION, project_ref: null },
              { "x-request-id": "req_cleanup" },
            )
          : exit === "owner"
            ? moveResponse(
                404,
                {
                  error: {
                    code: "session_not_found",
                    message: "missing",
                    retryable: false,
                  },
                },
                { "x-request-id": "req_cleanup" },
              )
            : exit === "parse"
              ? new Response("{", {
                  status: 200,
                  headers: { "x-request-id": "req_cleanup" },
                })
              : new TypeError("offline");
      vi.stubGlobal(
        "fetch",
        exit === "network"
          ? vi.fn().mockRejectedValue(result)
          : vi.fn().mockResolvedValue(result),
      );
      const move = requiredMoveMethod(
        createSessionClient({ baseUrl: "/api/session" }),
      );
      const operation = move({
        sessionId: MOVE_SESSION,
        targetProjectId: null,
        commandId: `cleanup-${exit}`,
        signal: controller.signal,
      });
      if (exit === "success")
        await expect(operation).resolves.toEqual({
          session_id: MOVE_SESSION,
          project_ref: null,
        });
      else
        expect((await moveFailure(operation)).kind).toBe(
          exit === "owner" ? "owner" : exit,
        );
      const added = add.mock.calls.find(([type]) => type === "abort")?.[1];
      const removed = remove.mock.calls.find(([type]) => type === "abort")?.[1];
      expect(added).toBeDefined();
      expect(removed).toBe(added);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("requires the engine fake to reject Move explicitly as unsupported without other calls", async () => {
    const client = createFakeClient();
    const beforeCalls = {
      create: client.createCalls.length,
      control: client.controlCalls.length,
      snapshot: client.snapshotCalls.length,
      process: client.processPageCalls.length,
      delete: client.deleteCalls.length,
      rename: client.renameCalls.length,
    };
    const method = (client as unknown as { moveSession?: unknown }).moveSession;
    expect(typeof method).toBe("function");
    const details = await moveFailure(
      (method as MoveMethod).call(client, {
        sessionId: MOVE_SESSION,
        targetProjectId: null,
        commandId: "fake-unsupported",
      }),
    );
    expect(details).toEqual({ kind: "unsupported" });
    expect({
      create: client.createCalls.length,
      control: client.controlCalls.length,
      snapshot: client.snapshotCalls.length,
      process: client.processPageCalls.length,
      delete: client.deleteCalls.length,
      rename: client.renameCalls.length,
    }).toEqual(beforeCalls);
  });
});


describe("complete chat catalog read budget", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
  it("rejects a repeated cursor instead of reporting a partial catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ models: [], next_cursor: "again" }))))
    await expect(createSessionClient({ baseUrl: "/api/session" }).listModels()).rejects.toMatchObject({ reason: "parse" })
  })
  it("bounds even a fetch that ignores abort and aborts its request", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal("fetch", fetchMock)
    const pending = createSessionClient({ baseUrl: "/api/session" }).listModels()
    const assertion = expect(pending).rejects.toMatchObject({ reason: "network" })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect((fetchMock.mock.calls as unknown[][])[0]?.[1]).toMatchObject({ signal: expect.objectContaining({ aborted: true }) })
  })
})

it("catalog cancellation covers a pending response body and prevents later pages", async () => {
  const controller = new AbortController()
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}), headers: new Headers({ "content-type": "application/json" }) })
  vi.stubGlobal("fetch", fetchMock)
  try {
    const pending = createSessionClient({ baseUrl: "/api/session" }).listModels({ signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ reason: "network" })
    await Promise.resolve()
    controller.abort()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
  } finally { vi.unstubAllGlobals() }
})

it("a later page from another business cannot turn a partial chat list into success", async () => {
  const candidate = { provider: "provider", name: "image", is_default: true, display_name: "Image",
    model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222",
    provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "image", request_model: "image" }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ models: [], next_cursor: "second" }))
    .mockResolvedValueOnce(Response.json({ models: [candidate], next_cursor: null })))
  try {
    await expect(createSessionClient({ baseUrl: "/api/session" }).listModels()).rejects.toMatchObject({ reason: "parse" })
  } finally { vi.unstubAllGlobals() }
})

describe("private Message parts HTTP read", () => {
  afterEach(() => vi.unstubAllGlobals())
  it("uses only the same-origin exact owner path/scope and bounded typed response", async () => {
    const page = { session_id: "s/?", message_id: "m/#", run_id: "r", format_version: 1, revision: "0", event_watermark: null, items: [], next_cursor: null }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetcher)
    const signal = new AbortController().signal
    await expect(createSessionClient({ baseUrl: "/api/session" }).fetchMessageParts({ sessionId: "s/?", messageId: "m/#", scope: { kind: "project", projectRef: "project x" }, cursor: "opaque/?", signal })).resolves.toEqual(page)
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/session/sessions/s%2F%3F/messages/m%2F%23/parts?limit=16&cursor=opaque%2F%3F&project_ref=project+x")
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", signal })
  })
  it("preserves HTTP status plus error code rather than equating any409 with revision change", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "message_parts_changed", message: "changed" }, meta: { request_id: "req" } }), { status: 409, headers: { "content-type": "application/json" } })))
    await expect(createSessionClient({ baseUrl: "/api/session" }).fetchMessageParts({ sessionId: "s", messageId: "m", scope: { kind: "direct" }, signal: new AbortController().signal })).rejects.toMatchObject({ reason: "http", status: 409, code: "message_parts_changed" })
  })
})

it.each([
  ["7", 7_000], ["0", 1_000], ["86400", 86_400_000],
  [null, 30_000], ["-1", 30_000], ["1.5", 30_000], ["999999999999999", 30_000],
])("model catalog retains bounded 429 retry timing (%s), without replaying GET", async (header, expected) => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: "session_rate_limited", message: "admission limited" } }, {
    status: 429, headers: header === null ? {} : { "retry-after": header },
  }))
  vi.stubGlobal("fetch", fetchMock)
  try {
    await expect(createSessionClient({ baseUrl: "/api/session" }).listModels()).rejects.toMatchObject({
      name: "ModelCatalogReadError", reason: "http", status: 429, code: "session_rate_limited", retryAfterMs: expected,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})

it.each([
  ["7", 7_000], ["0", 1_000], ["86400", 86_400_000],
  [null, 30_000], ["-1", 30_000], ["1.5", 30_000], ["999999999999999", 30_000],
])("session list retains bounded 429 timing (%s), without replaying in the client", async (header, expected) => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: "session_rate_limited", message: "limited" } }, {
    status: 429, headers: header === null ? {} : { "retry-after": header },
  }))
  vi.stubGlobal("fetch", fetchMock)
  try {
    await expect(createSessionClient({ baseUrl: "/api/session" }).listSessions()).rejects.toMatchObject({
      name: "SessionListReadError", reason: "http", status: 429, code: "session_rate_limited", retryAfterMs: expected,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  } finally { vi.unstubAllGlobals() }
})
