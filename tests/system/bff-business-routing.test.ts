import { afterEach, describe, expect, it, vi } from "vitest"

const { authConfig, resolveSessionWithRefresh, sameOriginOk, requestWithDomain } = vi.hoisted(() => ({
  authConfig: vi.fn(),
  resolveSessionWithRefresh: vi.fn(),
  sameOriginOk: vi.fn(() => true),
  requestWithDomain: vi.fn(),
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

import { proxyScheduledTaskRequest } from "@/app/api/scheduled-tasks/[[...path]]/route"

describe("Web to business BFF route projection", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    authConfig.mockReset()
    resolveSessionWithRefresh.mockReset()
    sameOriginOk.mockReset().mockReturnValue(true)
    requestWithDomain.mockReset()
  })

  it("maps Scheduled to /v1 and unwraps the BFF envelope for the existing Web client", async () => {
    authConfig.mockReturnValue({
      bffBaseUrl: "http://bff.internal/",
      domain: "dev.kokoro.localhost",
      internalSecret: "web-secret",
    })
    resolveSessionWithRefresh.mockResolvedValue({
      envelope: { namespace: "ns_test", user_id: "user_test" },
      setCookie: null,
    })
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({
      data: { tasks: [] },
      meta: { request_id: "request-bff" },
    }), { status: 200, headers: { "content-type": "application/json" } }))

    const response = await proxyScheduledTaskRequest(
      new Request("https://app.example/api/scheduled-tasks"),
      { params: Promise.resolve({ path: [] }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tasks: [] })
    const [target, domain, init] = requestWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(target).toBe("http://bff.internal/v1/scheduled-tasks")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(init.headers).get("x-kokoro-namespace")).toBe("ns_test")
    expect(new Headers(init.headers).get("x-kokoro-principal-id")).toBe("user_test")
  })

  it("preserves the BFF error status and projects its canonical error to the flat Scheduled shape", async () => {
    authConfig.mockReturnValue({
      bffBaseUrl: "http://bff.internal",
      domain: "dev.kokoro.localhost",
      internalSecret: "web-secret",
    })
    resolveSessionWithRefresh.mockResolvedValue({
      envelope: { namespace: "ns_test", user_id: "user_test" },
      setCookie: null,
    })
    requestWithDomain.mockResolvedValue(new Response(JSON.stringify({
      error: { code: "scheduled_task_not_found", message: "Scheduled task was not found" },
      meta: { request_id: "request-bff-error" },
    }), { status: 404, headers: { "content-type": "application/json" } }))

    const response = await proxyScheduledTaskRequest(
      new Request("https://app.example/api/scheduled-tasks/scheduled_missing"),
      { params: Promise.resolve({ path: ["scheduled_missing"] }) },
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Scheduled task was not found", code: "scheduled_task_not_found" })
  })
})
