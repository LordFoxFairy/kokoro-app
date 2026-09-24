import { afterEach, describe, expect, it, vi } from "vitest"

const { productBffConfig, admittedProductSession, requestWithDomain, sameOriginOk } = vi.hoisted(() => ({
  productBffConfig: vi.fn(),
  admittedProductSession: vi.fn(),
  requestWithDomain: vi.fn(),
  sameOriginOk: vi.fn(() => true),
}))

vi.mock("@/lib/server/auth", () => ({ sameOriginOk }))
vi.mock("@/lib/server/product-bff", () => ({
  productBffConfig,
  admittedProductSession,
  productBffHeaders: (config: { internalSecret?: string | null }, claims: { access: string }, requestId: string) => {
    const headers = new Headers({
      authorization: `Bearer ${claims.access}`,
      "x-kokoro-service": "web-bff",
      "x-kokoro-request-id": requestId,
    })
    if (config.internalSecret) headers.set("x-kokoro-internal-secret", config.internalSecret)
    return headers
  },
}))
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }))

import { GET } from "@/app/api/agents/[...path]/route"

describe("Agent connection setup BFF", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    productBffConfig.mockReset()
    admittedProductSession.mockReset()
    requestWithDomain.mockReset()
    sameOriginOk.mockReset()
    sameOriginOk.mockReturnValue(true)
  })

  it("forwards the authenticated setup request through the configured business BFF", async () => {
    productBffConfig.mockReturnValue({
      bffBaseUrl: "https://bff.internal/",
      domain: "dev.kokoro.localhost",
      internalSecret: "web-secret",
    })
    admittedProductSession.mockResolvedValue({
      access: "product-access",
      accessExpiresAt: Date.now() + 60_000,
    })
    requestWithDomain.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            platform: "telegram",
            status: "disconnected",
            qr_value: "https://agents.fixture.test/qr",
            continue_url: "https://agents.fixture.test/continue",
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        },
      ),
    )

    const response = await GET(
      new Request("https://app.example/api/agents/connections/setup?platform=telegram&ignored=drop", {
        headers: { "x-kokoro-request-id": "req_1" },
      }),
      { params: Promise.resolve({ path: ["connections", "setup"] }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ platform: "telegram" })
    const [target, domain, init] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(target).toBe("https://bff.internal/v1/agents/connections/setup?platform=telegram")
    expect(domain).toBe("dev.kokoro.localhost")
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe("Bearer product-access")
    expect(headers.get("x-kokoro-service")).toBe("web-bff")
    expect(headers.get("x-kokoro-internal-secret")).toBe("web-secret")
    expect(headers.get("x-kokoro-namespace")).toBeNull()
    expect(headers.get("x-kokoro-principal-id")).toBeNull()
    expect(headers.get("x-kokoro-request-id")).toBe("req_1")
  })

  it("rejects unsupported platforms and does not proxy them", async () => {
    productBffConfig.mockReturnValue({
      bffBaseUrl: "https://bff.internal",
      domain: "dev.kokoro.localhost",
    })

    const response = await GET(new Request("https://app.example/api/agents/connections/setup?platform=irc"), {
      params: Promise.resolve({ path: ["connections", "setup"] }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_agent_platform" })
    expect(requestWithDomain).not.toHaveBeenCalled()
    expect(admittedProductSession).not.toHaveBeenCalled()
  })

  it("returns a typed unavailable response when the agent service is not configured", async () => {
    productBffConfig.mockReturnValue({
      bffBaseUrl: null,
      domain: "dev.kokoro.localhost",
    })

    const response = await GET(new Request("https://app.example/api/agents/connections/setup?platform=telegram"), {
      params: Promise.resolve({ path: ["connections", "setup"] }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "agent_not_configured" })
  })
})
