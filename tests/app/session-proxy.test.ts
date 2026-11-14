import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"


const { requestWithDomain } = vi.hoisted(() => ({
  requestWithDomain: vi.fn(),
}))

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain,
}))




const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "web-bff-secret",
}

// A retired cookie must never be promoted into native admission.
function sessionCookie(): string {
  return "kokoro-issuer.session_token=fixture"
}

function params(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) }
}

beforeEach(() => {


  for (const [k, v] of Object.entries(ENV)) process.env[k] = v
})
afterEach(() => {
  vi.unstubAllGlobals()

  requestWithDomain.mockReset()
  for (const k of Object.keys(ENV)) delete process.env[k]
})

describe("/api/session/[...path] proxy", () => {
  it("forwards the canonical message body and Idempotency-Key without promoting legacy body fields or browser identity", async () => {
    requestWithDomain.mockResolvedValue(new Response(
      JSON.stringify({ data: { run_id: "run_1", user_message_id: "message_1", assistant_message_id: "message_2" }, meta: { request_id: "req_1" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ))
    const { POST } = await import("@/app/api/session/[...path]/route")
    const response = await POST(new Request("http://localhost/api/session/sessions/ses_1/messages", {
      method: "POST",
      headers: {
        cookie: sessionCookie(), origin: "http://localhost", "content-type": "application/json",
        "idempotency-key": "message_1", authorization: "Bearer browser-forgery",
        "x-kokoro-tenant-id": "other-tenant", "x-kokoro-principal-id": "other-user",
        "x-kokoro-service": "browser-forgery", "x-kokoro-internal-secret": "browser-forgery",
      },
      body: JSON.stringify({ content: "hello" }),
    }), params(["sessions", "ses_1", "messages"]))

    expect(response.status).toBe(200)
    const [, , init] = requestWithDomain.mock.calls[0] as [string, string, { headers: Record<string, string>; body: ArrayBuffer; signal: AbortSignal }]
    const headers = new Headers(init.headers)
    expect(JSON.parse(new TextDecoder().decode(init.body))).toEqual({ content: "hello" })
    expect(headers.get("idempotency-key")).toBe("message_1")
    expect(headers.get("authorization")).toBeNull()
    expect(headers.get("x-kokoro-service")).toBe("web-bff")
    expect(headers.get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(headers.get("x-kokoro-tenant-id")).toBeNull()
    expect(headers.get("x-kokoro-principal-id")).toBeNull()
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("does not promote the retired body idempotency_key when the header is absent", async () => {
    requestWithDomain.mockResolvedValue(new Response("", { status: 400, headers: { "content-type": "text/plain" } }))
    const { POST } = await import("@/app/api/session/[...path]/route")
    await POST(new Request("http://localhost/api/session/sessions/ses_1/messages", {
      method: "POST",
      headers: { cookie: sessionCookie(), origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ idempotency_key: "retired", content: "hello" }),
    }), params(["sessions", "ses_1", "messages"]))
    const [, , init] = requestWithDomain.mock.calls[0] as [string, string, { headers: Record<string, string>; body: ArrayBuffer }]
    expect(new Headers(init.headers).get("idempotency-key")).toBeNull()
    expect(JSON.parse(new TextDecoder().decode(init.body))).toEqual({ idempotency_key: "retired", content: "hello" })
  })

  it("projects Chat through the BFF and unwraps the v1 response for the browser contract", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    requestWithDomain.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { sessions: [], next_cursor: null },
          meta: { request_id: "req_1" },
        }),
        { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
      ),
    )
    const { GET } = await import("@/app/api/session/[...path]/route")

    const res = await GET(
      new Request("http://localhost/api/session/sessions/ses_1?x=1", {
        headers: { cookie: sessionCookie() },
      }),
      params(["sessions", "ses_1"]),
    )
    expect(res.status).toBe(200)

    const [target, domain, init] = requestWithDomain.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(target).toBe("http://bff.test/v1/sessions/ses_1?x=1")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(init.headers).get("x-kokoro-service")).toBe("web-bff")
    expect(new Headers(init.headers).get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(new Headers(init.headers).get("x-kokoro-namespace")).toBeNull()
    expect(new Headers(init.headers).get("x-kokoro-principal-id")).toBeNull()
    expect(res.headers.get("x-request-id")).toBe("req_1")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(await res.json()).toEqual({ sessions: [], next_cursor: null })
  })

  it("fails closed when the BFF base is omitted", async () => {
    delete process.env.KOKORO_BFF_BASE_URL
    const { GET } = await import("@/app/api/session/[...path]/route")

    const response = await GET(
      new Request("http://localhost/api/session/sessions/ses_1/messages", {
        headers: {
          cookie: sessionCookie(),
          "x-kokoro-request-id": "request-local",
        },
      }),
      params(["sessions", "ses_1", "messages"]),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("request-local")
    expect(await response.json()).toEqual({
      error: { code: "auth_not_configured", message: "auth_not_configured" },
      meta: { request_id: "request-local" },
    })
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("streams an SSE response through unchanged (content-type + body)", async () => {
    const upstream = new Response("data: hello\n\n", {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "public, max-age=3600",
      },
    })
    vi.stubGlobal("fetch", vi.fn())
    requestWithDomain.mockResolvedValue(upstream)
    const { GET } = await import("@/app/api/session/[...path]/route")

    const res = await GET(
      new Request("http://localhost/api/session/sessions/ses_1/events", {
        headers: {
          cookie: sessionCookie(),
          accept: "text/event-stream",
          "last-event-id": "42",
        },
      }),
      params(["sessions", "ses_1", "events"]),
    )
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(await res.text()).toBe("data: hello\n\n")
  })

  it("forwards the SSE resume header (last-event-id) upstream", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    requestWithDomain.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    )
    const { GET } = await import("@/app/api/session/[...path]/route")
    await GET(
      new Request("http://localhost/api/session/sessions/ses_1/events", {
        headers: {
          cookie: sessionCookie(),
          accept: "text/event-stream",
          "last-event-id": "42",
        },
      }),
      params(["sessions", "ses_1", "events"]),
    )
    const [, domain, init] = requestWithDomain.mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(init.headers).get("last-event-id")).toBe("42")
    expect(init).toMatchObject({ streamIdleTimeoutMs: 60_000 })
  })

  it("projects a BFF error envelope without leaking upstream internals", async () => {
    requestWithDomain.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "run_not_active", message: "Run is not active" },
          meta: { request_id: "req_error" },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    )
    const { POST } = await import("@/app/api/session/[...path]/route")
    const response = await POST(
      new Request("http://localhost/api/session/sessions/ses_1/runs/run_1/control", {
        method: "POST",
        headers: {
          cookie: sessionCookie(),
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "run.cancel", session_id: "ses_1" }),
      }),
      params(["sessions", "ses_1", "runs", "run_1", "control"]),
    )
    expect(response.status).toBe(409)
    expect(response.headers.get("x-request-id")).toBe("req_error")
    expect(await response.json()).toEqual({
      error: { code: "run_not_active", message: "Run is not active" },
      meta: { request_id: "req_error" },
    })
  })

  it("preserves BFF401 without a Web session preflight", async () => {
    requestWithDomain.mockResolvedValueOnce(Response.json({error:{code:"unauthenticated"}},{status:401}))

    vi.stubGlobal("fetch", vi.fn())
    const { GET } = await import("@/app/api/session/[...path]/route")
    const res = await GET(new Request("http://localhost/api/session/sessions/ses_1", {headers: {cookie: "kokoro-issuer.session_token=fixture"}}), params(["sessions", "ses_1"]))
    expect(res.status).toBe(401)
  })

  it("rejects a cross-origin mutation (POST) even with a valid envelope", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const { POST } = await import("@/app/api/session/[...path]/route")
    const res = await POST(
      new Request("http://localhost/api/session/sessions/ses_1/messages", {
        method: "POST",
        headers: {
          cookie: sessionCookie(),
          origin: "http://evil.test",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      params(["sessions", "ses_1", "messages"]),
    )
    expect(res.status).toBe(403)
  })
})

describe("exact private message parts GET adapter", () => {
  const path = ["sessions", "s", "messages", "m", "parts"]
  const page = { session_id: "s", message_id: "m", run_id: "r", format_version: 1, revision: "0", event_watermark: null, items: [], next_cursor: null }
  it("forwards admitted credentials, explicit scope and no-store with the exact byte/time budget", async () => {
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({ data: page, meta: { request_id: "parts-request" } }), { headers: { "content-type": "application/json" } }))
    const { GET } = await import("@/app/api/session/[...path]/route")
    const response = await GET(new Request("http://localhost/api/session/sessions/s/messages/m/parts?project_ref=project&limit=16&cursor=opaque", { headers: {cookie: "kokoro-issuer.session_token=fixture",  authorization: "Bearer forged" } }), params(path))
    expect(response.status).toBe(200); expect(await response.json()).toEqual(page)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const [target, , options] = requestWithDomain.mock.calls[0] as [string, string, { timeoutMs: number; maxResponseBytes: number; strictResponseLength: boolean; headers: HeadersInit }]
    expect(target).toBe("http://bff.test/v1/sessions/s/messages/m/parts?project_ref=project&limit=16&cursor=opaque")
    expect(options).toMatchObject({ timeoutMs: 10_000, maxResponseBytes: 1_048_576, strictResponseLength: true })
    expect(new Headers(options.headers).get("authorization")).toBeNull()
  })
  it.each(["scope=direct&project_ref=p", "limit=33", "cursor=", "limit=1&limit=2", "other=x"])("rejects malformed query %s without forwarding", async (query) => {
    const { GET } = await import("@/app/api/session/[...path]/route")
    const response = await GET(new Request(`http://localhost/api/session/sessions/s/messages/m/parts?${query}`, {headers: {cookie: "kokoro-issuer.session_token=fixture"}}), params(path))
    expect(response.status).toBe(400); expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("does not admit command headers or treat a malformed200 as a successful empty message", async () => {
    const { GET } = await import("@/app/api/session/[...path]/route")
    expect((await GET(new Request("http://localhost/api/session/sessions/s/messages/m/parts", { headers: {cookie: "kokoro-issuer.session_token=fixture",  "idempotency-key": "command" } }), params(path))).status).toBe(400)
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({ data: { ...page, revision: "01" }, meta: { request_id: "req" } }), { headers: { "content-type": "application/json" } }))
    expect((await GET(new Request("http://localhost/api/session/sessions/s/messages/m/parts", {headers: {cookie: "kokoro-issuer.session_token=fixture"}}), params(path))).status).toBe(502)
  })
})

it.each([null, { share_id: "published-id", created_at: "2026-11-12T00:00:00Z", expires_at: null }])("Share metadata GET returns the exact %j projection through native admission with no receipt/key/write", async share => {
  requestWithDomain.mockImplementation(async (_url, _domain, init) => {
    const id = new Headers(init.headers).get("x-kokoro-request-id")!
    return new Response(JSON.stringify({ data: { share }, meta: { request_id: id } }), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": id } })
  })
  const { GET } = await import("@/app/api/session/[...path]/route")
  const response = await GET(new Request("http://localhost/api/session/sessions/session/share?scope=direct", {
    headers: { host: "localhost", cookie: sessionCookie(), authorization: "Bearer browser", "x-kokoro-principal-id": "forged" },
  }), params(["sessions", "session", "share"]))
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ share }); expect(requestWithDomain).toHaveBeenCalledOnce()
  const [url, , init] = requestWithDomain.mock.calls[0]!
  expect(url).toBe("http://bff.test/v1/sessions/session/share?scope=direct"); expect(init.method).toBe("GET"); expect(init.body).toBeUndefined()
  const outgoing = new Headers(init.headers); expect(outgoing.has("idempotency-key")).toBe(false); expect(outgoing.has("authorization")).toBe(false); expect(outgoing.has("x-kokoro-principal-id")).toBe(false)
  expect(outgoing.get("cookie")).toBe(sessionCookie()); expect(outgoing.get("origin")).toBe("http://localhost")
})
it("Share metadata rejects cross-site or command-shaped GETs locally, and invalid owner reads are errors rather than unpublished", async () => {
  const { GET } = await import("@/app/api/session/[...path]/route")
  const target = "http://localhost/api/session/sessions/session/share"
  for (const extra of [{ origin: "https://other.test" }, { "sec-fetch-site": "cross-site" }, { "idempotency-key": "write-key" }, { "content-type": "application/json" }]) {
    const response = await GET(new Request(target, { headers: { host: "localhost", cookie: sessionCookie(), ...extra } }), params(["sessions", "session", "share"]))
    expect([400, 403]).toContain(response.status)
  }
  expect(requestWithDomain).not.toHaveBeenCalled()
  requestWithDomain.mockImplementation(async (_url, _domain, init) => {
    const id = new Headers(init.headers).get("x-kokoro-request-id")!
    return new Response(JSON.stringify({ data: { share: null, secret: "unexpected" }, meta: { request_id: id } }), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": id } })
  })
  const response = await GET(new Request(target, { headers: { host: "localhost", cookie: sessionCookie() } }), params(["sessions", "session", "share"]))
  expect(response.status).toBe(502); expect(await response.json()).toHaveProperty("error.code", "session_share_response_invalid"); expect(requestWithDomain).toHaveBeenCalledOnce()
})
