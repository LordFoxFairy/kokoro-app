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

describe("Chat BFF deployment domain context", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.KOKORO_DOMAIN
    requestWithDomain.mockReset()
    authConfig.mockReset()
    resolveSessionWithRefresh.mockReset()
  })

  it("passes KOKORO_DOMAIN as an explicit transport argument, never request Host", async () => {
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    authConfig.mockReturnValue({ bffBaseUrl: "https://bff.internal", domain: "dev.kokoro.localhost", internalSecret: null })
    resolveSessionWithRefresh.mockResolvedValue({
      envelope: { runtime_jwt: "session-jwt" },
      setCookie: null,
    })
    requestWithDomain.mockResolvedValueOnce(new Response(JSON.stringify({ data: "ok", meta: { request_id: "request-bff" } }), { status: 200 }))

    const response = await GET(
      new Request("https://app.example/api/session/sessions", { headers: { host: "spoofed.example" } }),
      { params: Promise.resolve({ path: ["sessions"] }) },
    )

    expect(response.status).toBe(200)
    const [bffTarget, domain, bffOptions] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(bffTarget).toBe("https://bff.internal/v1/sessions")
    expect(domain).toBe("dev.kokoro.localhost")
    const bffHeaders = new Headers(bffOptions.headers)
    expect(bffHeaders.get("authorization")).toBe("Bearer session-jwt")
    expect(bffHeaders.get("x-kokoro-service")).toBe("web-bff")
    expect(bffHeaders.get("host")).toBeNull()
    expect(bffHeaders.get("x-kokoro-tenant-id")).toBeNull()
    expect(resolveSessionWithRefresh).toHaveBeenCalledWith(expect.any(Request), expect.anything())
  })
})
