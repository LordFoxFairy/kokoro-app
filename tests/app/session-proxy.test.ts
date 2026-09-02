import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sealEnvelope } from "@/lib/server/session-envelope"

const { requestWithDomain } = vi.hoisted(() => ({ requestWithDomain: vi.fn() }))

vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }))

const ENV = {
  KOKORO_WEB_SESSION_SECRET: "test-session-secret",
  KOKORO_IAM_BASE_URL: "http://user.test",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "web-bff-secret",
}

const nowSec = (): number => Math.floor(Date.now() / 1000)

function sessionCookie(): string {
  const sealed = sealEnvelope(
    { runtime_jwt: "rt.jwt.sig", access_exp: nowSec() + 3600, refresh_token: "rt-refresh", user_id: "u1", namespace: "team_1", exp: nowSec() + 3600 },
    [ENV.KOKORO_WEB_SESSION_SECRET],
  )
  return `kokoro_session=${sealed}`
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
  it("projects Chat through the BFF and unwraps the v1 response for the browser contract", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({ data: { sessions: [] }, meta: { request_id: "req_1" } }), { status: 200, headers: { "content-type": "application/json" } }))
    const { GET } = await import("@/app/api/session/[...path]/route")

    const res = await GET(
      new Request("http://localhost/api/session/sessions/ses_1?x=1", { headers: { cookie: sessionCookie() } }),
      params(["sessions", "ses_1"]),
    )
    expect(res.status).toBe(200)

    const [target, domain, init] = requestWithDomain.mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(target).toBe("http://bff.test/v1/sessions/ses_1?x=1")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(init.headers).get("x-kokoro-service")).toBe("web-bff")
    expect(new Headers(init.headers).get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(new Headers(init.headers).get("x-kokoro-namespace")).toBe("team_1")
    expect(new Headers(init.headers).get("x-kokoro-principal-id")).toBe("u1")
    expect(res.headers.get("x-request-id")).toBe("req_1")
    expect(await res.json()).toEqual({ sessions: [] })
  })

  it("fails closed when the BFF base is omitted", async () => {
    delete process.env.KOKORO_BFF_BASE_URL
    const { GET } = await import("@/app/api/session/[...path]/route")

    const response = await GET(
      new Request("http://localhost/api/session/sessions/ses_1/messages", { headers: { cookie: sessionCookie(), "x-kokoro-request-id": "request-local" } }),
      params(["sessions", "ses_1", "messages"]),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("request-local")
    expect(await response.json()).toEqual({
      error: { code: "bff_not_configured", message: "bff_not_configured" },
      meta: { request_id: "request-local" },
    })
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("streams an SSE response through unchanged (content-type + body)", async () => {
    const upstream = new Response("data: hello\n\n", { status: 200, headers: { "content-type": "text/event-stream" } })
    vi.stubGlobal("fetch", vi.fn())
    requestWithDomain.mockResolvedValue(upstream)
    const { GET } = await import("@/app/api/session/[...path]/route")

    const res = await GET(
      new Request("http://localhost/api/session/sessions/ses_1/events", {
        headers: { cookie: sessionCookie(), accept: "text/event-stream", "last-event-id": "42" },
      }),
      params(["sessions", "ses_1", "events"]),
    )
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    expect(await res.text()).toBe("data: hello\n\n")
  })

  it("forwards the SSE resume header (last-event-id) upstream", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    requestWithDomain.mockResolvedValue(new Response("", { status: 200, headers: { "content-type": "text/event-stream" } }))
    const { GET } = await import("@/app/api/session/[...path]/route")
    await GET(
      new Request("http://localhost/api/session/sessions/ses_1/events", {
        headers: { cookie: sessionCookie(), accept: "text/event-stream", "last-event-id": "42" },
      }),
      params(["sessions", "ses_1", "events"]),
    )
    const [, domain, init] = requestWithDomain.mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(init.headers).get("last-event-id")).toBe("42")
  })

  it("projects a BFF error envelope without leaking upstream internals", async () => {
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({
      error: { code: "run_not_active", message: "Run is not active" },
      meta: { request_id: "req_error" },
    }), { status: 409, headers: { "content-type": "application/json" } }))
    const { POST } = await import("@/app/api/session/[...path]/route")
    const response = await POST(
      new Request("http://localhost/api/session/sessions/ses_1/runs/run_1/control", {
        method: "POST",
        headers: { cookie: sessionCookie(), origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ kind: "run.cancel", decision_id: "decision_1" }),
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

  it("returns 401 when there is no envelope", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const { GET } = await import("@/app/api/session/[...path]/route")
    const res = await GET(new Request("http://localhost/api/session/sessions/ses_1"), params(["sessions", "ses_1"]))
    expect(res.status).toBe(401)
  })

  it("rejects a cross-origin mutation (POST) even with a valid envelope", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const { POST } = await import("@/app/api/session/[...path]/route")
    const res = await POST(
      new Request("http://localhost/api/session/sessions/ses_1/messages", {
        method: "POST",
        headers: { cookie: sessionCookie(), origin: "http://evil.test", "content-type": "application/json" },
        body: "{}",
      }),
      params(["sessions", "ses_1", "messages"]),
    )
    expect(res.status).toBe(403)
  })
})
