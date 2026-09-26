// Billing Web adapter contract: browser requests stay same-origin and all
// business calls go through kokoro-bff.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"


const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

// A retired cookie must never be promoted into a Product Session.
function sessionCookie(): string {
  return "kokoro_session=retired-forged-envelope"
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  currentProductSession.mockReset()
  currentProductSession.mockResolvedValue({
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
  })
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value
})
afterEach(() => {
  vi.unstubAllGlobals()
  currentProductSession.mockReset()
  vi.unstubAllEnvs()
  for (const key of Object.keys(ENV)) delete process.env[key as keyof typeof ENV]
})

describe("GET /api/billing/plans", () => {
  it("routes the catalog through the business BFF with IAM-derived principal context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          plans: [
            {
              id: "p1",
              key: "starter",
              name: "Starter",
              currency: "USD",
              amount_minor: "900",
              credit_micros: "1000000",
              billing_interval: "once",
            },
          ],
        },
        meta: { request_id: "bff-request" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")

    const response = await GET(
      new Request("http://localhost/api/billing/plans", {
        headers: { cookie: sessionCookie() },
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      plans: [
        {
          id: "p1",
          key: "starter",
          name: "Starter",
          currency: "USD",
          amount_minor: "900",
          credit_micros: "1000000",
          billing_interval: "once",
        },
      ],
    })
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe("http://bff.test/v1/billing/plans")
    const headers = new Headers(init.headers)
    expect(headers.get("x-kokoro-namespace")).toBeNull()
    expect(headers.get("x-kokoro-principal-id")).toBeNull()
    expect(headers.get("forwarded")).toBe("host=dev.kokoro.localhost")
    expect(response.headers.get("x-request-id")).toBe("bff-request")
  })

  it("preserves the BFF status and projects its canonical error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        error: {
          code: "billing_rate_limited",
          message: "Too many billing requests",
        },
        meta: { request_id: "bff-plans-error" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")
    const response = await GET(
      new Request("http://localhost/api/billing/plans", {
        headers: { cookie: sessionCookie() },
      }),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get("x-request-id")).toBe("bff-plans-error")
    expect(await response.json()).toEqual({
      error: {
        code: "billing_rate_limited",
        message: "Too many billing requests",
      },
      meta: { request_id: "bff-plans-error" },
    })
  })

  it("returns an honest unavailable state when BFF is not configured", async () => {
    delete process.env.KOKORO_BFF_BASE_URL
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")
    const response = await GET(
      new Request("http://localhost/api/billing/plans", {
        headers: {
          cookie: sessionCookie(),
          "x-kokoro-request-id": "request-local",
        },
      }),
    )
    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("request-local")
    expect(await response.json()).toEqual({
      error: {
        code: "auth_not_configured",
        message: "auth_not_configured",
      },
      meta: { request_id: "request-local" },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requires a session before touching the BFF", async () => {
    currentProductSession.mockResolvedValueOnce(null)
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")
    const response = await GET(new Request("http://localhost/api/billing/plans"))
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/billing/checkout", () => {
  it("validates browser input and routes only the plan id to the BFF", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { checkout_url: "/billing/mock-checkout/plan_starter" },
        meta: { request_id: "bff-checkout" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/checkout/route")
    const response = await POST(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: {
          cookie: sessionCookie(),
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
          "idempotency-key": "checkout-1",
        },
        body: JSON.stringify({
          plan_id: "plan_starter",
          amountMinor: 1,
          teamId: "evil",
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      checkout_url: "/billing/mock-checkout/plan_starter",
    })
    expect(response.headers.get("x-request-id")).toBe("bff-checkout")
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe("http://bff.test/v1/billing/checkout")
    expect(JSON.parse(init.body as string)).toEqual({
      plan_id: "plan_starter",
    })
    expect(new Headers(init.headers).get("x-kokoro-principal-id")).toBeNull()
  })

  it("preserves canonical BFF conflicts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        error: {
          code: "checkout_conflict",
          message: "Checkout already exists",
        },
        meta: { request_id: "bff-checkout-error" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/checkout/route")
    const response = await POST(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: {
          cookie: sessionCookie(),
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({ plan_id: "plan_starter" }),
      }),
    )
    expect(response.status).toBe(409)
    expect(response.headers.get("x-request-id")).toBe("bff-checkout-error")
    expect(await response.json()).toEqual({
      error: { code: "checkout_conflict", message: "Checkout already exists" },
      meta: { request_id: "bff-checkout-error" },
    })
  })
})

describe("POST /api/billing/mock-pay", () => {
  it("keeps local mock confirmation out of production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/mock-pay/route")
    const response = await POST(
      new Request("http://localhost/api/billing/mock-pay", {
        method: "POST",
        headers: {
          cookie: sessionCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ order_id: "checkout-1" }),
      }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "mock_pay_unavailable" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
