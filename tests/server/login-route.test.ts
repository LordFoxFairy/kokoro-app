import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { authGet, authPost } = vi.hoisted(() => ({ authGet: vi.fn(), authPost: vi.fn() }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ GET: authGet, POST: authPost }))
vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))
const { setCookie, getCookie } = vi.hoisted(() => ({ setCookie: vi.fn(), getCookie: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie, get: getCookie }) }))

import { GET } from "@/app/login/route"

const ORIGIN = "https://web.example.test"
const ENV = {
  NODE_ENV: "test",
  KOKORO_BFF_BASE_URL: "https://bff.example.test",
  KOKORO_WEB_ORIGIN: ORIGIN,
  KOKORO_DOMAIN: "web.example.test",
  KOKORO_TENANT_ID: "tenant-one",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "service-secret",
  KOKORO_OIDC_CLIENT_ID: "product-web",
  KOKORO_OIDC_CLIENT_SECRET: "client-secret",
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  NEXTAUTH_URL: `${ORIGIN}/api/auth`,
} satisfies NodeJS.ProcessEnv

function browserRequest(path = "/login"): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { host: "web.example.test" } })
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
  authGet.mockResolvedValue(new Response(JSON.stringify({ csrfToken: "a".repeat(64) }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": `next-auth.csrf-token=token%7Cdigest; Path=/; HttpOnly; SameSite=Lax` },
  }))
  authPost.mockResolvedValue(new Response(null, {
    status: 302,
    headers: {
      location: `${ORIGIN}/iam/oauth2/authorize?client_id=product-web`,
      "set-cookie": "next-auth.state=state; Path=/; HttpOnly; SameSite=Lax",
    },
  }))
})

afterEach(() => vi.unstubAllEnvs())

describe("GET /login", () => {
  it.each([
    "/app/project/project_00000000-0000-4000-8000-000000000301?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app?conversation=conv_00000000-0000-4000-8000-000000000302",
  ])("preserves a valid product pathname plus conversation query through internal auth context: %s", async (target) => {
    const response = await GET(browserRequest(`/login?${new URLSearchParams({ return_to: target })}`))
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/iam/oauth2/authorize?client_id=product-web`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(authGet).toHaveBeenCalledOnce()
    expect(authPost).toHaveBeenCalledOnce()
    const [request, context] = authPost.mock.calls[0] as [NextRequest, { params: Promise<{ nextauth: string[] }>; productReturnTarget?: string }]
    expect(context.productReturnTarget).toBe(target)
    expect(await context.params).toEqual({ nextauth: ["signin", "kokoro-iam"] })
    expect(request.nextUrl.search).toBe("")
    expect(await request.text()).toBe(new URLSearchParams({ csrfToken: "a".repeat(64) }).toString())
    expect(request.headers.has("return_to")).toBe(false)
    expect(request.headers.has("x-product-return-target")).toBe(false)
  })

  it.each([
    "/login?return_to=https%3A%2F%2Fevil.example%2Fapp",
    "/login?return_to=%2F%2Fevil.example%2Fapp",
    "/login?return_to=%2Fapp&return_to=%2Fapp%2Fskills",
    "/login?return_to=%2Fapp&extra=1",
    "/login?return_to=%2Fapp%3Fconversation%3Dnot-canonical",
    "/login?return_to=%2Fapp%2Flibrary%3Fq%3D%FF",
    "/login?return_to=%2Fapp%2Flibrary%3Fq%3D%",
  ])("rejects invalid or ambiguous navigation intent before CSRF/signin: %s", async (path) => {
    const response = await GET(browserRequest(path))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get("location")).toBeNull()
    expect(authGet).not.toHaveBeenCalled()
    expect(authPost).not.toHaveBeenCalled()
  })

  it("starts Product OIDC on the server and redirects straight to IAM", async () => {
    const response = await GET(new NextRequest("http://127.0.0.1:43123/login", {
      headers: { host: "web.example.test" },
    }))
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toMatch(/^https:\/\/web\.example\.test\/iam\/oauth2\/authorize\?/u)
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(authGet).toHaveBeenCalledOnce()
    expect(authPost).toHaveBeenCalledOnce()
    expect(authPost.mock.calls[0]?.[1].productReturnTarget).toBe("/app")
    expect(setCookie).toHaveBeenCalledWith("next-auth.csrf-token", "token|digest", expect.objectContaining({ httpOnly: true }))
    const signInRequest = authPost.mock.calls[0]?.[0] as NextRequest
    expect(signInRequest.headers.get("origin")).toBe(ORIGIN)
    expect(signInRequest.headers.get("cookie")).toBe("next-auth.csrf-token=token%7Cdigest")
    expect(new URLSearchParams(await signInRequest.text()).get("csrfToken")).toBe("a".repeat(64))
  })

  it("never renders the removed handoff or retry page when RP is absent", async () => {
    vi.stubEnv("KOKORO_OIDC_CLIENT_ID", "")
    const response = await GET(browserRequest())
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("")
    expect(response.headers.get("content-type")).toBeNull()
    expect(authGet).not.toHaveBeenCalled()
  })

  it("does not navigate to a fallback document after an RP start failure", async () => {
    authPost.mockResolvedValue(new Response(null, { status: 303, headers: { location: "/auth/retry" } }))
    const response = await GET(browserRequest())
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
    expect(await response.text()).toBe("")
  })
})
