import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admission: vi.fn(),
  config: vi.fn(),
  upstream: vi.fn(),
}));
vi.mock("@/lib/server/product-bff", async (original) => ({
  ...(await original<typeof import("@/lib/server/product-bff")>()),
  admittedProductSession: mocks.admission,
  productBffConfig: mocks.config,
}));
vi.mock("@/lib/server/upstream-http", async (original) => ({
  ...(await original<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain: mocks.upstream,
}));
import { GET, PUT, DELETE, POST } from "@/app/api/hub/[...path]/route";
const id = "a1234567-1234-4123-8123-123456789012";
const fields = { name: "规则", when_to_use: "写作", content: "正文" };
const item = {
  ...fields,
  knowledge_id: id,
  revision: 1,
  created_at: "2026-10-18T12:00:00.000Z",
  updated_at: "2026-10-18T12:00:00.000Z",
};
const headers = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-request-id": "owner-1",
};
const owner = (data: unknown, status = 200, more = {}) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { ...headers, ...more },
  });
function invoke(
  path: string,
  method = "GET",
  body?: string,
  extra: HeadersInit = {},
  signal?: AbortSignal,
) {
  const r = new Request(`https://app.example/api/hub/${path}`, {
    method,
    headers: {
      origin: "https://app.example",
      "content-type": "application/json",
      ...extra,
    },
    ...(body === undefined ? {} : { body }),
    ...(signal ? { signal } : {}),
  });
  const handler = { GET, PUT, DELETE, POST }[method as "GET"]!;
  return handler(r, {
    params: Promise.resolve({
      path: new URL(r.url).pathname.split("/").slice(3),
    }),
  });
}
beforeEach(() => {
  mocks.config.mockReturnValue({
    bffBaseUrl: "https://bff.internal",
    domain: "trusted.kokoro.test",
    internalSecret: "fixture-server-secret",
    session: { webOrigin: "https://app.example" },
  });
  mocks.admission.mockResolvedValue({
    access: "fixture-session-access",
    accessExpiresAt: Date.now() + 60000,
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("knowledge same-origin boundary", () => {
  it("preserves DELETE CAS body, no-store and trusted headers only", async () => {
    mocks.upstream.mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store", "x-request-id": "owner-1" },
      }),
    );
    const r = await invoke(
      `preferences/knowledge/${id}`,
      "DELETE",
      '{"expected_revision":1}',
      {
        authorization: "Bearer forged",
        cookie: "private=browser",
        "x-kokoro-namespace": "forged",
      },
    );
    expect(r.status).toBe(204);
    expect(await r.text()).toBe("");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const [url, domain, options] = mocks.upstream.mock.calls[0]!;
    expect(url).toBe(`https://bff.internal/v1/preferences/knowledge/${id}`);
    expect(domain).toBe("trusted.kokoro.test");
    expect(new TextDecoder().decode(options.body)).toBe(
      '{"expected_revision":1}',
    );
    const forwarded = new Headers(options.headers);
    expect(forwarded.get("authorization")).toBe(
      "Bearer fixture-session-access",
    );
    for (const name of [
      "cookie",
      "x-kokoro-namespace",
      "idempotency-key",
      "origin",
    ])
      expect(forwarded.has(name)).toBe(false);
  });
  it("validates creation ACK and rewrites only canonical Location to same origin", async () => {
    mocks.upstream.mockResolvedValue(
      owner(item, 201, { location: `/v1/preferences/knowledge/${id}` }),
    );
    const r = await invoke(
      `preferences/knowledge/${id}`,
      "PUT",
      JSON.stringify({ expected_revision: 0, ...fields }),
    );
    expect(r.status).toBe(201);
    expect(r.headers.get("location")).toBe(
      `/api/hub/preferences/knowledge/${id}`,
    );
    expect(await r.json()).toEqual({ data: item });
    mocks.upstream.mockResolvedValue(
      owner({ ...item, revision: 2 }, 201, {
        location: `/v1/preferences/knowledge/${id}`,
      }),
    );
    expect(
      (
        await invoke(
          `preferences/knowledge/${id}`,
          "PUT",
          JSON.stringify({ expected_revision: 0, ...fields }),
        )
      ).status,
    ).toBe(502);
  });
  it.each([
    ["preferences/knowledge?tenant=forged", "GET", undefined, {}],
    ["preferences/knowledge?query=a&query=b", "GET", undefined, {}],
    ["preferences/knowledge-usage?query=a", "GET", undefined, {}],
    ["preferences/knowledge", "POST", "{}", {}],
    [
      `preferences/knowledge/${id}`,
      "PUT",
      '{"expected_revision":0,"expected_revision":1,"name":"a","when_to_use":"b","content":"c"}',
      {},
    ],
    [
      `preferences/knowledge/${id}`,
      "PUT",
      '{"expected_revision":0,"name":"a","when_to_use":"b","content":"c","tenant_id":"forged"}',
      {},
    ],
    [`preferences/knowledge/${id}`, "DELETE", '{"expected_revision":0}', {}],
    [
      `preferences/knowledge/${id}`,
      "PUT",
      "{}",
      { origin: "https://evil.example" },
    ],
    [
      "preferences/knowledge",
      "GET",
      undefined,
      { "idempotency-key": "unused" },
    ],
    ["self/preferences/knowledge", "GET", undefined, {}],
  ])(
    "rejects malformed or retired request %# before forwarding",
    async (path, method, body, extra) => {
      const r = await invoke(path, method, body, extra);
      expect([400, 403, 404, 405]).toContain(r.status);
      expect(mocks.upstream).not.toHaveBeenCalled();
    },
  );
  it("rejects duplicate response keys before laundering them into a successful ACK", async () => {
    const raw = JSON.stringify({ data: item }).replace(
      '"name":"规则"',
      '"name":"wrong","name":"规则"',
    );
    mocks.upstream.mockResolvedValue(
      new Response(raw, {
        status: 201,
        headers: { ...headers, location: `/v1/preferences/knowledge/${id}` },
      }),
    );
    expect(
      (
        await invoke(
          `preferences/knowledge/${id}`,
          "PUT",
          JSON.stringify({ expected_revision: 0, ...fields }),
        )
      ).status,
    ).toBe(502);
  });
  it("reads current lists and usage as independent facts", async () => {
    mocks.upstream
      .mockResolvedValueOnce(owner({ items: [item], max_items: 100 }))
      .mockResolvedValueOnce(owner({ enabled: false, revision: 0 }));
    expect((await invoke("preferences/knowledge?query=%25")).status).toBe(200);
    expect((await invoke("preferences/knowledge-usage")).status).toBe(200);
    expect(mocks.upstream.mock.calls.map((c) => c[0])).toEqual([
      "https://bff.internal/v1/preferences/knowledge?query=%25",
      "https://bff.internal/v1/preferences/knowledge-usage",
    ]);
  });
  it("keeps unknown write non-retryable and rejects wrong error/response metadata", async () => {
    const e = {
      error: {
        code: "knowledge_save_unknown",
        message: "Not confirmed",
        retryable: false,
      },
    };
    mocks.upstream.mockResolvedValue(
      new Response(JSON.stringify(e), { status: 503, headers }),
    );
    expect(
      await (
        await invoke(
          `preferences/knowledge/${id}`,
          "DELETE",
          '{"expected_revision":1}',
        )
      ).json(),
    ).toEqual(e);
    expect(mocks.upstream).toHaveBeenCalledTimes(1);
    mocks.upstream.mockResolvedValue(
      new Response(JSON.stringify(e), { status: 409, headers }),
    );
    expect(
      (
        await invoke(
          `preferences/knowledge/${id}`,
          "DELETE",
          '{"expected_revision":1}',
        )
      ).status,
    ).toBe(502);
    mocks.upstream.mockResolvedValue(
      owner({ items: [], max_items: 100 }, 200, { "cache-control": "public" }),
    );
    expect((await invoke("preferences/knowledge")).status).toBe(502);
  });
  it("bounds raw writes and rejects an oversized collection response", async () => {
    expect(
      (await invoke(`preferences/knowledge/${id}`, "PUT", " ".repeat(65537)))
        .status,
    ).toBe(413);
    expect(mocks.upstream).not.toHaveBeenCalled();
    mocks.upstream.mockResolvedValue(
      new Response("x".repeat(2 * 1024 * 1024 + 1), { headers }),
    );
    expect((await invoke("preferences/knowledge")).status).toBe(502);
  });
  it("enforces the total budget during admission and cancels a stalled owner body", async () => {
    vi.useFakeTimers();
    mocks.admission.mockReturnValueOnce(new Promise(() => undefined));
    const pending = invoke("preferences/knowledge");
    await vi.advanceTimersByTimeAsync(10001);
    expect((await pending).status).toBe(504);
    expect(mocks.upstream).not.toHaveBeenCalled();
    vi.useRealTimers();
    const cancel = vi.fn();
    mocks.upstream.mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { headers }),
    );
    const controller = new AbortController();
    const body = invoke(
      "preferences/knowledge",
      "GET",
      undefined,
      {},
      controller.signal,
    );
    await vi.waitFor(() => expect(mocks.upstream).toHaveBeenCalledOnce());
    controller.abort();
    expect((await body).status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("denies anonymous admission and cancels before or during delayed admission without forwarding", async () => {
    mocks.admission.mockResolvedValueOnce(null);
    expect((await invoke("preferences/knowledge")).status).toBe(401);
    const c = new AbortController();
    c.abort();
    await invoke("preferences/knowledge", "GET", undefined, {}, c.signal);
    expect(mocks.upstream).not.toHaveBeenCalled();
    let resolve!: (value: unknown) => void;
    mocks.admission.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const late = new AbortController();
    const result = invoke(
      "preferences/knowledge",
      "GET",
      undefined,
      {},
      late.signal,
    );
    await vi.waitFor(() => expect(mocks.admission).toHaveBeenCalledTimes(2));
    late.abort();
    await result;
    resolve({ access: "late" });
    await Promise.resolve();
    expect(mocks.upstream).not.toHaveBeenCalled();
  });
});
