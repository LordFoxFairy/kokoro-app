// PAY-2 BFF：/api/billing/plans（目录读面）+ /api/billing/checkout（收银台意图）。
// 断言：未登录 401、payment 未配置 503、site/team 从信封派生（浏览器无从伪造）、
// payment {data}+camelCase → web {plans}+snake_case、checkout 501 诚实态透传。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sealEnvelope } from "@/lib/server/session-envelope"

const ENV = {
  KOKORO_WEB_SESSION_SECRET: "test-session-secret",
  KOKORO_USER_BASE_URL: "http://user.test",
  KOKORO_SESSION_BASE_URL: "http://session.test",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_PAYMENT_BASE_URL: "http://payment.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

const originalMockWebhookSecret = process.env.KOKORO_PAYMENT_MOCK_WEBHOOK_SECRET

const nowSec = (): number => Math.floor(Date.now() / 1000)

function sessionCookie(): string {
  const sealed = sealEnvelope(
    { runtime_jwt: "rt.jwt.sig", access_exp: nowSec() + 3600, refresh_token: "rt-refresh", user_id: "u1", namespace: "team_1", exp: nowSec() + 3600 },
    [ENV.KOKORO_WEB_SESSION_SECRET],
  )
  return `kokoro_session=${sealed}`
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  delete process.env.KOKORO_BILLING_BASE_URL
  if (originalMockWebhookSecret === undefined) delete process.env.KOKORO_PAYMENT_MOCK_WEBHOOK_SECRET
  else process.env.KOKORO_PAYMENT_MOCK_WEBHOOK_SECRET = originalMockWebhookSecret
  for (const k of Object.keys(ENV)) delete process.env[k]
})

describe("GET /api/billing/plans", () => {
  it("Billing 配置优先于旧 payment，并注入 Billing user context", async () => {
    process.env.KOKORO_BILLING_BASE_URL = "http://billing.test"
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { plans: [] } }))
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")

    const res = await GET(new Request("http://localhost/api/billing/plans", { headers: { cookie: sessionCookie() } }))
    expect(res.status).toBe(200)
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe("http://billing.test/billing/plans")
    const headers = new Headers(init.headers)
    expect(headers.get("forwarded")).toBe("host=dev.kokoro.localhost")
    expect(headers.get("x-kokoro-subject")).toBeNull()
    expect(headers.get("authorization")).toBe("Bearer rt.jwt.sig")
    delete process.env.KOKORO_BILLING_BASE_URL
  })

  it("注入部署域名 + web-bff 凭据，camelCase{data} → snake_case{plans}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          plans: [
            { id: "p1", key: "studio", name: "Studio", currency: "USD", amountMinor: "4900", creditMicros: "1000000", billingInterval: "month" },
          ],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")

    const res = await GET(new Request("http://localhost/api/billing/plans", { headers: { cookie: sessionCookie() } }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> }
    expect(body.plans).toEqual([
      { id: "p1", key: "studio", name: "Studio", currency: "USD", amount_minor: "4900", credit_micros: "1000000", billing_interval: "month" },
    ])

    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe("http://payment.test/plans")
    const headers = new Headers(init.headers)
    expect(headers.get("x-kokoro-service")).toBe("web-bff")
    expect(headers.get("x-kokoro-internal-secret")).toBe("svc-secret")
    expect(headers.get("forwarded")).toBe("host=dev.kokoro.localhost")
  })

  it("未登录 → 401（不触达 payment）", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")
    const res = await GET(new Request("http://localhost/api/billing/plans"))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("payment 未配置 → 503（预览档诚实态）", async () => {
    delete process.env.KOKORO_PAYMENT_BASE_URL
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { GET } = await import("@/app/api/billing/plans/route")
    const res = await GET(new Request("http://localhost/api/billing/plans", { headers: { cookie: sessionCookie() } }))
    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/billing/checkout", () => {
  it("Billing 路径先解析 published offer revision，再创建 immutable quote checkout", async () => {
    process.env.KOKORO_BILLING_BASE_URL = "http://billing.test"
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { plans: [{ id: "revision-1", key: "pro", name: "Pro", currency: "USD", amountMinor: "1999", creditMicros: "1000000", billingInterval: "month" }] } }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { checkoutId: "checkout-1", status: "created", amountMinor: 1999, currency: "USD" } }))
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/checkout/route")
    const res = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { cookie: sessionCookie(), "content-type": "application/json", origin: "http://localhost", host: "localhost" },
      body: JSON.stringify({ plan_id: "revision-1", amountMinor: 1, siteId: "evil" }),
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ checkout_url: "/billing/pay/checkout-1" })
    const [target, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(target).toBe("http://billing.test/billing/checkout")
    expect(JSON.parse(init.body as string)).toMatchObject({ offerRevisionId: "revision-1", amountMinor: "1999", currency: "USD" })
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe("Bearer rt.jwt.sig")
    expect(headers.get("idempotency-key")).toMatch(/^web-checkout:u1:revision-1:/)
    delete process.env.KOKORO_BILLING_BASE_URL
  })

  it("team 从信封派生、部署域名从服务端配置注入（浏览器 body 只带 plan_id）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(501, { error: { code: "payment.checkout_unavailable" } }))
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/checkout/route")

    const res = await POST(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { cookie: sessionCookie(), "content-type": "application/json", origin: "http://localhost", host: "localhost" },
        // 浏览器试图夹带 teamId/siteId：一律被无视，身份只从信封派生。
        body: JSON.stringify({ plan_id: "p1", teamId: "team_evil", siteId: "site-evil" }),
      }),
    )
    // 诚实态：payment 501 原样透传（支付渠道未开通）。
    expect(res.status).toBe(501)

    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(target).toBe("http://payment.test/orders/checkout")
    const sent = JSON.parse(init.body as string) as { teamId: string; planId: string }
    expect(sent).toEqual({ teamId: "team_1", planId: "p1" })
    const headers = new Headers(init.headers)
    expect(headers.get("forwarded")).toBe("host=dev.kokoro.localhost")
    expect(headers.get("x-kokoro-service")).toBe("web-bff")
  })

  it("未登录 → 401（购买要求登录，不触达 payment）", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/checkout/route")
    const res = await POST(
      new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
        body: JSON.stringify({ plan_id: "p1" }),
      }),
    )
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/billing/mock-pay", () => {
  it("returns 503 in production even when payment configuration and mock secrets are present", async () => {
    vi.stubEnv("NODE_ENV", "production")
    process.env.KOKORO_PAYMENT_MOCK_WEBHOOK_SECRET = "mock-webhook-secret"
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { POST } = await import("@/app/api/billing/mock-pay/route")

    const res = await POST(new Request("http://localhost/api/billing/mock-pay", {
      method: "POST",
      headers: { cookie: sessionCookie(), "content-type": "application/json" },
      body: JSON.stringify({ order_id: "checkout-1" }),
    }))

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "mock_pay_unavailable" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
