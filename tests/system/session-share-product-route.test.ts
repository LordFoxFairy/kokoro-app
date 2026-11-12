import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requestWithDomain: vi.fn(),
}));

vi.mock("@/lib/server/upstream-http", () => ({
  requestWithDomain: mocks.requestWithDomain,
}));
import { DELETE, POST } from "@/app/api/session/[...path]/route";
const context = {
  params: Promise.resolve({ path: ["sessions", "opaque/old", "share"] }),
};

const request = (
  method = "DELETE",
  body?: string,
  headers: Record<string, string> = {},
  query = "",
) =>
  new Request(
    "http://localhost/api/session/sessions/opaque%2Fold/share" + query,
    {
      method,
      headers: {cookie: "kokoro-issuer.session_token=fixture",
        host: "web.test",
        origin: "http://web.test",
        "idempotency-key": "session-mutation:fixture",
        ...headers,
      },
      ...(body === undefined ? {} : { body }),
    },
  );
beforeEach(() => {
  vi.resetAllMocks();
  for (const [k, v] of Object.entries({
    KOKORO_BFF_BASE_URL: "http://bff.test",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_WEB_REDIS_URL: "redis://fixture/0",
    KOKORO_WEB_AUTH_SECRET: "at-least-thirty-two-characters-secret",
    KOKORO_DOMAIN: "product.test",
  }))
    vi.stubEnv(k, v);


  mocks.requestWithDomain.mockImplementation(async (_u, _d, o) =>
    Response.json(
      {
        data: { share_id: "shr_actual" },
        meta: { request_id: o.headers.get("x-kokoro-request-id") },
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": o.headers.get("x-kokoro-request-id"),
        },
      },
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("unwraps exact formal DELETE share ACK after final identity fence and preserves opaque ID/query", async () => {
  const response = await DELETE(
    request("DELETE", undefined, {}, "?scope=&project_ref=legacy"),
    context,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ share_id: "shr_actual" });

  expect(mocks.requestWithDomain.mock.calls[0]?.[0]).toBe(
    "http://bff.test/v1/sessions/opaque%2Fold/share?scope=&project_ref=legacy",
  );
});
it("accepts a real EOF-only DELETE stream", async () => {
  const req = new Request(request(), {
    body: new ReadableStream({
      start(c) {
        c.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  expect((await DELETE(req, context)).status).toBe(200);
});
it("preserves createShare POST {} and formal flat receipt", async () =>
  expect((await POST(request("POST", "{}"), context)).status).toBe(200));
it.each(["x", "{}"])(
  "rejects nonempty DELETE bytes %j before admission",
  async (body) => {
    expect((await DELETE(request("DELETE", body), context)).status).toBe(400);

    expect(mocks.requestWithDomain).not.toHaveBeenCalled();
  },
);
it.each([
  { data: { ok: true }, meta: { request_id: "bound" } },
  { data: { share_id: "x", unknown: true }, meta: { request_id: "bound" } },
])("rejects malformed ACK %j", async (raw) => {
  mocks.requestWithDomain.mockImplementation(async (_u, _d, o) =>
    Response.json(
      { ...raw, meta: { request_id: o.headers.get("x-kokoro-request-id") } },
      {
        headers: {
          "cache-control": "no-store",
          "x-request-id": o.headers.get("x-kokoro-request-id"),
        },
      },
    ),
  );
  expect((await DELETE(request(), context)).status).toBe(502);
});
it("rejects duplicate raw ACK keys before JSON projection", async () => {
  mocks.requestWithDomain.mockImplementation(
    async (_u, _d, o) =>
      new Response(
        '{"data":{"share_id":"a","share_id":"b"},"meta":{"request_id":' +
          JSON.stringify(o.headers.get("x-kokoro-request-id")) +
          "}}",
        {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": o.headers.get("x-kokoro-request-id"),
          },
        },
      ),
  );
  expect((await DELETE(request(), context)).status).toBe(502);
});

it("races hung params inside the entry budget without admission or late owner dispatch", async () => {
  vi.useFakeTimers();
  const pending = DELETE(request(), { params: new Promise(() => {}) });
  await vi.advanceTimersByTimeAsync(10001);
  expect((await pending).status).toBe(503);

});
it("rejects malformed POST UTF8 before owner admission", async () => {
  const req = new Request(
    "http://localhost/api/session/sessions/opaque%2Fold/share",
    {
      method: "POST",
      headers: {cookie: "kokoro-issuer.session_token=fixture",
        host: "web.test",
        origin: "http://web.test",
        "idempotency-key": "fixture",
      },
      body: Uint8Array.from([0xff]),
    },
  );
  expect((await POST(req, context)).status).toBe(400);

});
it("rejects a slow endless response at the same absolute deadline and cancels its reader", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  mocks.requestWithDomain.mockImplementation(
    async (_u, _d, o) =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("{"));
          },
          cancel,
        }),
        {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-request-id": o.headers.get("x-kokoro-request-id"),
          },
        },
      ),
  );
  const pending = DELETE(request(), context);
  await vi.advanceTimersByTimeAsync(10001);
  expect((await pending).status).toBe(503);
  expect(cancel).toHaveBeenCalledOnce();
});
