import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { requestWithDomain } from "@/lib/server/upstream-http"

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  requestWithDomain: vi.fn(),
}))

const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

// A retired cookie must never be promoted into a Product Session.
function sessionCookie(): string {
  return "kokoro_session=retired-forged-envelope"
}

function params(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) }
}

beforeEach(() => {
  currentProductSession.mockReset()
  currentProductSession.mockResolvedValue({
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
  })
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v
  vi.mocked(requestWithDomain).mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  currentProductSession.mockReset()
  for (const k of Object.keys(ENV)) delete process.env[k]
})

describe("/api/hub/[...path] proxy", () => {
  it("allows the owner upload deadline only for Project resources and personal Library files", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(new Response('{"error":{"code":"resource_scan_pending"}}', {
      status: 503,
      headers: { "content-type": "application/json" },
    }))
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const body = new FormData()
    body.append("files", new File(["content"], "notes.txt", { type: "text/plain" }))
    await POST(new Request("http://localhost/api/hub/projects/project-1/resources", {
      method: "POST",
      headers: { origin: "http://localhost", "idempotency-key": "project-resource:key-1" },
      body,
    }), params(["projects", "project-1", "resources"]))
    const [, , upload] = vi.mocked(requestWithDomain).mock.calls[0] as [string, string, { timeoutMs?: number; maxRequestBytes?: number; headers: Record<string, string> }]
    expect(upload.timeoutMs).toBe(50_000)
    expect(upload.maxRequestBytes).toBe(1024 * 1024)
    expect(new Headers(upload.headers).get("idempotency-key")).toBe("project-resource:key-1")

    await POST(new Request("http://localhost/api/hub/library/files", {
      method: "POST",
      headers: { origin: "http://localhost", "idempotency-key": "personal-file:key-1" },
      body,
    }), params(["library", "files"]))
    const [personalTarget, , personalUpload] = vi.mocked(requestWithDomain).mock.calls[1] as [string, string, { timeoutMs?: number; maxRequestBytes?: number; headers: Record<string, string> }]
    expect(personalTarget).toBe("http://bff.test/v1/library/files")
    expect(personalUpload.timeoutMs).toBe(50_000)
    expect(personalUpload.maxRequestBytes).toBe(1024 * 1024)
    expect(new Headers(personalUpload.headers).get("idempotency-key")).toBe("personal-file:key-1")

    await POST(new Request("http://localhost/api/hub/projects/project-1", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: "{}",
    }), params(["projects", "project-1"]))
    const [, , ordinary] = vi.mocked(requestWithDomain).mock.calls[2] as [string, string, { timeoutMs?: number }]
    expect(ordinary.timeoutMs).toBeUndefined()
  })
  it("rejects an oversized project resource body before forwarding it", async () => {
    const { POST } = await import("@/app/api/hub/[...path]/route")
    const response = await POST(new Request("http://localhost/api/hub/projects/project-1/resources", {
      method: "POST", headers: { origin: "http://localhost", "idempotency-key": "project-resource:huge", "content-type": "multipart/form-data; boundary=fixture" },
      body: new Uint8Array(1024 * 1024 + 1),
    }), params(["projects", "project-1", "resources"]))
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: "request_body_too_large" })
    expect(requestWithDomain).not.toHaveBeenCalled()

    const personalResponse = await POST(new Request("http://localhost/api/hub/library/files", {
      method: "POST", headers: { origin: "http://localhost", "idempotency-key": "personal-file:huge", "content-type": "multipart/form-data; boundary=fixture" },
      body: new Uint8Array(1024 * 1024 + 1),
    }), params(["library", "files"]))
    expect(personalResponse.status).toBe(413)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("injects web-bff caller creds + envelope scope/user and projects to the BFF", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"data":{"skills":[]}}', {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600",
        },
      }),
    )
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const res = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", {
        headers: { cookie: sessionCookie() },
      }),
      params(["self", "skills", "pool"]),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")

    const [target, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(target).toBe("http://bff.test/v1/skills/pool")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-service"]).toBe("web-bff")
    expect(init.headers["x-kokoro-internal-secret"]).toBe("svc-secret")
    expect(init.headers["x-kokoro-namespace"]).toBeUndefined()
    expect(init.headers["x-kokoro-principal-id"]).toBeUndefined()
  })

  it("fails closed when the business BFF base is omitted", async () => {
    delete process.env.KOKORO_BFF_BASE_URL
    const { GET } = await import("@/app/api/hub/[...path]/route")

    const response = await GET(
      new Request("http://localhost/api/hub/self/skills/pool", {
        headers: { cookie: sessionCookie() },
      }),
      params(["self", "skills", "pool"]),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "auth_not_configured" })
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("never forwards a browser-supplied scope header (identity from envelope only)", async () => {
    vi.mocked(requestWithDomain).mockResolvedValue(
      new Response('{"data":{"skills":[]}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    const { GET } = await import("@/app/api/hub/[...path]/route")

    await GET(
      new Request("http://localhost/api/hub/self/skills/pool", {
        headers: { cookie: sessionCookie(), "x-kokoro-namespace": "team_evil" },
      }),
      params(["self", "skills", "pool"]),
    )
    const [, domain, init] = vi.mocked(requestWithDomain).mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(domain).toBe("dev.kokoro.localhost")
    expect(init.headers["x-kokoro-namespace"]).toBeUndefined()
    // The helper is mocked here; wire-level Forwarded injection is covered by
    // tests/server/upstream-http.test.ts rather than duplicated in the route.
    expect(init.headers.forwarded).toBeUndefined()
  })

  it("returns 401 when there is no envelope", async () => {
    currentProductSession.mockResolvedValueOnce(null)
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
})
