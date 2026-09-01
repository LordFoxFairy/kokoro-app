import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sealEnvelope } from "@/lib/server/session-envelope"
import { requestWithDomain } from "@/lib/server/upstream-http"

vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain: vi.fn() }))

const ENV = {
  KOKORO_WEB_SESSION_SECRET: "test-session-secret",
  KOKORO_USER_BASE_URL: "http://user.test",
  KOKORO_SESSION_BASE_URL: "http://session.test",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_GATEWAY_BASE_URL: "http://gateway.test",
  KOKORO_HUB_BASE_URL: "http://hub.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
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
  delete process.env.KOKORO_BFF_BASE_URL
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v
  vi.mocked(requestWithDomain).mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.KOKORO_BFF_BASE_URL
  for (const k of Object.keys(ENV)) delete process.env[k]
})

describe("/api/hub/[...path] proxy", () => {
  it("injects web-bff caller creds + envelope scope/user and prefixes /hub", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response('{"data":{"skills":[]}}', { status: 200, headers: { "content-type": "application/json" } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const res = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", { headers: { cookie: sessionCookie() } }),
      params(["self", "skills", "pool"]),
    )
    expect(res.status).toBe(200)

    const [target, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(target).toBe("http://hub.test/hub/self/skills/pool")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-service"]).toBe("web-bff")
    expect(init.headers["x-kokoro-internal-secret"]).toBe("svc-secret")
    expect(init.headers["x-kokoro-namespace"]).toBe("team_1")
    expect(init.headers["x-kokoro-user-id"]).toBe("u1")
  })

  it("translates the browser Hub namespace to the independent business BFF", async () => {
    process.env.KOKORO_BFF_BASE_URL = "http://bff.test"
    delete process.env.KOKORO_HUB_BASE_URL
    vi.mocked(requestWithDomain).mockResolvedValue(new Response('{"data":{"skills":[]}}', { status: 200, headers: { "content-type": "application/json" } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const response = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", { headers: { cookie: sessionCookie() } }),
      params(["self", "skills", "pool"]),
    )

    expect(response.status).toBe(200)
    const [target, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(target).toBe("http://bff.test/v1/skills/pool")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-service"]).toBe("web-bff")
  })

  it("fails closed when the direct Hub base is omitted, even if Gateway is configured", async () => {
    delete process.env.KOKORO_HUB_BASE_URL
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const response = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", { headers: { cookie: sessionCookie() } }),
      params(["self", "skills", "pool"]),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "hub_not_configured" })
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("never forwards a browser-supplied scope header (identity from envelope only)", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response('{"data":{"skills":[]}}', { status: 200, headers: { "content-type": "application/json" } }))
    const { GET } = await import("@/app/api/hub/[...path]/route")

    await GET(
      new Request("http://localhost/api/hub/self/skills/pool", {
        headers: { cookie: sessionCookie(), "x-kokoro-namespace": "team_evil" },
      }),
      params(["self", "skills", "pool"]),
    )
    const [, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, { headers: Record<string, string> }]
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-namespace"]).toBe("team_1")
    // The helper is mocked here; wire-level Forwarded injection is covered by
    // tests/server/upstream-http.test.ts rather than duplicated in the route.
    expect(init.headers.forwarded).toBeUndefined()
  })

  it("returns 401 when there is no envelope", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const res = await GET(new Request("http://localhost/api/hub/self/skills/pool"), params(["self", "skills", "pool"]))
    expect(res.status).toBe(401)
  })

  it("rejects a cross-origin mutation (POST) even with a valid envelope", async () => {
    vi.stubGlobal("fetch", vi.fn())
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const res = await POST(
      new Request("http://localhost/api/hub/self/skills/x/disable", {
        method: "POST",
        headers: { cookie: sessionCookie(), origin: "http://evil.test" },
      }),
      params(["self", "skills", "x", "disable"]),
    )
    expect(res.status).toBe(403)
  })

  it("returns 503 when hub base url is not configured (preview build)", async () => {
    delete process.env.KOKORO_HUB_BASE_URL
    delete process.env.KOKORO_GATEWAY_BASE_URL
    vi.stubGlobal("fetch", vi.fn())
    const { GET } = await import("@/app/api/hub/[...path]/route")
    const res = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", { headers: { cookie: sessionCookie() } }),
      params(["self", "skills", "pool"]),
    )
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe("hub_not_configured")
  })
})
