import { afterEach, describe, expect, it, vi } from "vitest"

const { authConfig, resolveSessionWithRefresh, requestWithDomain, sameOriginOk } = vi.hoisted(() => ({
  authConfig: vi.fn(),
  resolveSessionWithRefresh: vi.fn(),
  requestWithDomain: vi.fn(),
  sameOriginOk: vi.fn(() => true),
}))

vi.mock("@/lib/server/auth", () => ({
  authConfig,
  INTERNAL_SECRET_HEADER: "x-kokoro-internal-secret",
  resolveSessionWithRefresh,
  sameOriginOk,
  SERVICE_HEADER: "x-kokoro-service",
  SERVICE_VALUE: "web-bff",
}))
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain }))

import { GET } from "@/app/api/agents/[...path]/route"

describe("Agent connection setup BFF", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    authConfig.mockReset()
    resolveSessionWithRefresh.mockReset()
    requestWithDomain.mockReset()
    sameOriginOk.mockReset()
    sameOriginOk.mockReturnValue(true)
  })

  it("forwards the authenticated setup request through the configured agent service", async () => {
    authConfig.mockReturnValue({
      agentBaseUrl: "https://agent.internal/",
      domain: "dev.kokoro.localhost",
      internalSecret: "web-secret",
    })
    resolveSessionWithRefresh.mockResolvedValue({
      envelope: { runtime_jwt: "runtime-jwt", namespace: "ns_kokoro", user_id: "user_1" },
      setCookie: null,
    })
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({
      platform: "telegram",
      status: "disconnected",
      qr_value: "https://agents.fixture.test/qr",
      continue_url: "https://agents.fixture.test/continue",
      expires_at: "2099-01-01T00:00:00.000Z",
    }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }))

    const response = await GET(
      new Request("https://app.example/api/agents/connections/setup?platform=telegram&ignored=drop", {
        headers: { "x-kokoro-request-id": "req_1" },
      }),
      { params: Promise.resolve({ path: ["connections", "setup"] }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ platform: "telegram" })
    const [target, domain, init] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(target).toBe("https://agent.internal/connections/setup?platform=telegram")
    expect(domain).toBe("dev.kokoro.localhost")
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe("Bearer runtime-jwt")
    expect(headers.get("x-kokoro-service")).toBe("web-bff")
    expect(headers.get("x-kokoro-internal-secret")).toBe("web-secret")
    expect(headers.get("x-kokoro-namespace")).toBe("ns_kokoro")
    expect(headers.get("x-kokoro-user-id")).toBe("user_1")
    expect(headers.get("x-kokoro-request-id")).toBe("req_1")
  })

  it("rejects unsupported platforms and does not proxy them", async () => {
    authConfig.mockReturnValue({ agentBaseUrl: "https://agent.internal", domain: "dev.kokoro.localhost" })

    const response = await GET(
      new Request("https://app.example/api/agents/connections/setup?platform=irc"),
      { params: Promise.resolve({ path: ["connections", "setup"] }) },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid_agent_platform" })
    expect(requestWithDomain).not.toHaveBeenCalled()
    expect(resolveSessionWithRefresh).not.toHaveBeenCalled()
  })

  it("returns a typed unavailable response when the agent service is not configured", async () => {
    authConfig.mockReturnValue({ agentBaseUrl: null, domain: "dev.kokoro.localhost" })

    const response = await GET(
      new Request("https://app.example/api/agents/connections/setup?platform=telegram"),
      { params: Promise.resolve({ path: ["connections", "setup"] }) },
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "agent_not_configured" })
  })
})
