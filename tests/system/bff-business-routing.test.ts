import { afterEach, describe, expect, it, vi } from "vitest"

const { productBffConfig, admittedProductSession, sameOriginOk, requestWithDomain } = vi.hoisted(() => ({
  productBffConfig: vi.fn(),
  admittedProductSession: vi.fn(),
  sameOriginOk: vi.fn(() => true),
  requestWithDomain: vi.fn(),
}))

vi.mock("@/lib/server/same-origin", () => ({ sameOriginOk }))
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

import { proxyScheduledTaskRequest } from "@/app/api/scheduled-tasks/[[...path]]/route"

describe("Web to business BFF route projection", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    productBffConfig.mockReset()
    admittedProductSession.mockReset()
    sameOriginOk.mockReset().mockReturnValue(true)
    requestWithDomain.mockReset()
  })

  it("maps Scheduled to /v1 and unwraps the BFF envelope for the existing Web client", async () => {
    productBffConfig.mockReturnValue({
      bffBaseUrl: "http://bff.internal/",
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
          data: { tasks: [] },
          meta: { request_id: "request-bff" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    const response = await proxyScheduledTaskRequest(new Request("https://app.example/api/scheduled-tasks"), {
      params: Promise.resolve({ path: [] }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tasks: [] })
    const [target, domain, init] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(target).toBe("http://bff.internal/v1/scheduled-tasks")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(init.headers).get("x-kokoro-namespace")).toBeNull()
    expect(new Headers(init.headers).get("x-kokoro-principal-id")).toBeNull()
  })

  it("preserves the BFF error status and projects its canonical error to the flat Scheduled shape", async () => {
    productBffConfig.mockReturnValue({
      bffBaseUrl: "http://bff.internal",
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
          error: {
            code: "scheduled_task_not_found",
            message: "Scheduled task was not found",
          },
          meta: { request_id: "request-bff-error" },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    )

    const response = await proxyScheduledTaskRequest(
      new Request("https://app.example/api/scheduled-tasks/scheduled_missing"),
      { params: Promise.resolve({ path: ["scheduled_missing"] }) },
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: "Scheduled task was not found",
      code: "scheduled_task_not_found",
    })
  })
})
