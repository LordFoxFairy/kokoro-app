import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchWithDomain } from "@/lib/server/upstream-http"

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  fetchWithDomain: vi.fn(),
}))

const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) })

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value
  currentProductSession.mockReset()
  currentProductSession.mockResolvedValue({ access: "product-access", accessExpiresAt: Date.now() + 60_000 })
  vi.mocked(fetchWithDomain).mockReset()
})

afterEach(() => {
  currentProductSession.mockReset()
  vi.unstubAllGlobals()
  for (const key of Object.keys(ENV)) delete process.env[key]
})

describe("/api/admin/[...path] product-session adapter", () => {
  it("forwards an admitted provider mutation to the BFF's formal MCP path", async () => {
    vi.mocked(fetchWithDomain).mockImplementation(async (_url, _domain, init) =>
      new Response(JSON.stringify({ data: { provider_key: "fixture" } }), {
        status: 201,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-request-id": new Headers(init?.headers).get("x-kokoro-request-id")!,
        },
      }),
    )
    const { POST } = await import("@/app/api/admin/[...path]/route")
    const response = await POST(
      new Request("http://localhost/api/admin/mcp/providers?limit=50", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
          "idempotency-key": "command-key",
          "x-kokoro-request-id": "admin-request-id",
        },
        body: "{}",
      }),
      params(["mcp", "providers"]),
    )

    expect(response.status).toBe(201)
    expect(response.headers.get("x-request-id")).toBe("admin-request-id")
    expect(await response.json()).toEqual({ data: { provider_key: "fixture" } })
    expect(fetchWithDomain).toHaveBeenCalledWith(
      "http://bff.test/v1/admin/mcp/providers?limit=50",
      "dev.kokoro.localhost",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    )
    const init = vi.mocked(fetchWithDomain).mock.calls[0]![2]!
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer product-access")
    expect(new Headers(init.headers).get("idempotency-key")).toBe("command-key")
  })

  it("keeps unsupported paths and missing product sessions out of the BFF", async () => {
    const { GET } = await import("@/app/api/admin/[...path]/route")
    const unknown = await GET(new Request("http://localhost/api/admin/admin/mcp/providers"), params(["admin", "mcp", "providers"]))
    expect(unknown.status).toBe(404)

    currentProductSession.mockResolvedValueOnce(null)
    const denied = await GET(new Request("http://localhost/api/admin/mcp/providers"), params(["mcp", "providers"]))
    expect(denied.status).toBe(401)
    expect(await denied.json()).toEqual({ error: {
      code: "session_authentication_required", message: expect.any(String), retryable: false,
    } })
    expect(fetchWithDomain).not.toHaveBeenCalled()
  })

  it("keeps local gateway failures in the complete error envelope without forwarding session failures", async () => {
    const { GET } = await import("@/app/api/admin/[...path]/route")
    currentProductSession.mockRejectedValueOnce(new Error("private auth implementation detail"))
    const response = await GET(new Request("http://localhost/api/admin/skills", {
      headers: { "x-kokoro-request-id": "gateway-failure-id" },
    }), params(["skills"]))
    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("gateway-failure-id")
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await response.json()).toEqual({ error: {
      code: "admin_gateway_unavailable", message: expect.any(String), retryable: true,
    } })
    expect(fetchWithDomain).not.toHaveBeenCalled()
  })
})
