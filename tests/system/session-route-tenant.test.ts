import { afterEach, describe, expect, it, vi } from "vitest"

const { authConfig, resolveSessionWithRefresh } = vi.hoisted(() => ({
  authConfig: vi.fn(),
  resolveSessionWithRefresh: vi.fn(),
}))
const { requestWithDomain } = vi.hoisted(() => ({ requestWithDomain: vi.fn() }))

vi.mock("@/lib/server/auth", () => ({
  authConfig,
  INTERNAL_SECRET_HEADER: "x-kokoro-internal-secret",
  resolveSessionWithRefresh,
  sameOriginOk: () => true,
  SERVICE_HEADER: "x-kokoro-service",
  SERVICE_VALUE: "web-bff",
}))
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }))

import { GET } from "@/app/api/session/[...path]/route"

describe("Session BFF deployment domain context", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.KOKORO_DOMAIN
    requestWithDomain.mockReset()
    authConfig.mockReset()
    resolveSessionWithRefresh.mockReset()
  })

  it("passes KOKORO_DOMAIN as an explicit transport argument, never request Host", async () => {
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    authConfig.mockReturnValue({ sessionBaseUrl: "https://session.internal", domain: "dev.kokoro.localhost", internalSecret: null })
    resolveSessionWithRefresh.mockResolvedValue({
      envelope: { runtime_jwt: "session-jwt" },
      setCookie: null,
    })
    requestWithDomain.mockResolvedValueOnce(new Response(JSON.stringify({ data: "ok" }), { status: 200 }))

    const response = await GET(
      new Request("https://app.example/api/session/sessions", { headers: { host: "spoofed.example" } }),
      { params: Promise.resolve({ path: ["sessions"] }) },
    )

    expect(response.status).toBe(200)
    const [sessionTarget, domain, sessionOptions] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(sessionTarget).toBe("https://session.internal/sessions")
    expect(domain).toBe("dev.kokoro.localhost")
    const sessionHeaders = new Headers(sessionOptions.headers)
    expect(sessionHeaders.get("authorization")).toBe("Bearer session-jwt")
    expect(sessionHeaders.get("x-kokoro-service")).toBe("web-bff")
    expect(sessionHeaders.get("host")).toBeNull()
    expect(sessionHeaders.get("x-kokoro-tenant-id")).toBeNull()
    expect(resolveSessionWithRefresh).toHaveBeenCalledWith(expect.any(Request), expect.anything())
  })
})
