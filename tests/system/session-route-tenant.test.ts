import { afterEach, describe, expect, it, vi } from "vitest"

const { productBffConfig, admittedNativeSession } = vi.hoisted(() => ({
  productBffConfig: vi.fn(),
  admittedNativeSession: vi.fn(),
}))
const { requestWithDomain } = vi.hoisted(() => ({
  requestWithDomain: vi.fn(),
}))

vi.mock("@/lib/server/same-origin", () => ({ sameOriginOk: () => true }))
vi.mock("@/lib/server/product-bff", () => ({
  productBffConfig,
  admittedNativeSession,
  nativeSessionBffHeaders: () => ({ state: "missing" }),
  productBffHeaders: (config: { internalSecret?: string | null }, claims: { nativeCookie?: string }, requestId: string) => {
    const headers = new Headers({
      cookie: claims.nativeCookie ?? "",
      "x-kokoro-service": "web-bff",
      "x-kokoro-request-id": requestId,
    })
    if (config.internalSecret) headers.set("x-kokoro-internal-secret", config.internalSecret)
    return headers
  },
}))
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }))

import { GET } from "@/app/api/session/[...path]/route"

describe("Chat BFF deployment domain context", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.KOKORO_DOMAIN
    requestWithDomain.mockReset()
    productBffConfig.mockReset()
    admittedNativeSession.mockReset()
  })

  it("passes KOKORO_DOMAIN as an explicit transport argument, never request Host", async () => {
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    productBffConfig.mockReturnValue({
      bffBaseUrl: "https://bff.internal",
      domain: "dev.kokoro.localhost",
      internalSecret: null,
    })
    admittedNativeSession.mockResolvedValue({
      access: "product-access",
      accessExpiresAt: Date.now() + 60_000,
      nativeCookie: "kokoro-issuer.session_token=fixture",
    })
    requestWithDomain.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "ok", meta: { request_id: "request-bff" } }), { status: 200 }),
    )

    const response = await GET(
      new Request("https://app.example/api/session/sessions", {
        headers: { host: "spoofed.example" },
      }),
      { params: Promise.resolve({ path: ["sessions"] }) },
    )

    expect(response.status).toBe(200)
    const [bffTarget, domain, bffOptions] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(bffTarget).toBe("https://bff.internal/v1/sessions")
    expect(domain).toBe("dev.kokoro.localhost")
    const bffHeaders = new Headers(bffOptions.headers)
    expect(bffHeaders.get("cookie")).toBe("kokoro-issuer.session_token=fixture")
    expect(bffHeaders.get("x-kokoro-service")).toBe("web-bff")
    expect(bffHeaders.get("host")).toBeNull()
    expect(bffHeaders.get("x-kokoro-tenant-id")).toBeNull()
    expect(admittedNativeSession).toHaveBeenCalledWith(expect.any(Request), expect.anything())
  })
})
