import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))

import { GET } from "@/app/login/route"
import { productLoginReturnTarget } from "@/lib/server/product-login-return"

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
  return new NextRequest(`${ORIGIN}${path}`, { headers: { host: "web.example.test", "x-nonce": "a".repeat(48) } })
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
})

afterEach(() => vi.unstubAllEnvs())

describe("GET /login", () => {
  it.each([
    "/app/project/project_00000000-0000-4000-8000-000000000301?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app#/account/settings/mcp",
  ])("issues a fixed browser-native OIDC start for a valid target: %s", async (target) => {
    const response = await GET(browserRequest(`/login?${new URLSearchParams({ return_to: target })}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("content-security-policy")).toMatch(/^default-src 'none'; script-src 'nonce-[A-Za-z0-9_-]{48}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'$/u)
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(response.headers.getSetCookie()[0]).toMatch(/^next-auth\.csrf-token=[A-Za-z0-9%|]+; Path=\/; HttpOnly; SameSite=Lax$/u)
    expect(response.headers.getSetCookie()[1]).toMatch(/^kokoro_product_login_return=[A-Za-z0-9%._~-]+\.[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Lax$/u)
    expect(productLoginReturnTarget(response.headers.getSetCookie()[1]!.split(";", 1)[0]!, ENV.KOKORO_WEB_AUTH_SECRET)).toBe(target)
    const html = await response.text()
    expect(html).toContain('method="post" action="/api/auth/signin/kokoro-iam"')
    expect(html).toMatch(/name="csrfToken" value="[a-f0-9]{64}"/u)
    expect(html).not.toContain(target)
  })

  it("reuses the verified browser CSRF cookie across overlapping login starts", async () => {
    const first = await GET(browserRequest())
    const csrf = first.headers.getSetCookie()[0]!.split(";", 1)[0]!
    const request = () => new NextRequest(`${ORIGIN}/login`, {
      headers: { host: "web.example.test", "x-nonce": "a".repeat(48), cookie: csrf },
    })
    const [second, third] = await Promise.all([GET(request()), GET(request())])
    const token = (await first.text()).match(/name="csrfToken" value="([a-f0-9]{64})"/u)![1]!
    expect(await second.text()).toContain(`name="csrfToken" value="${token}"`)
    expect(await third.text()).toContain(`name="csrfToken" value="${token}"`)
  })

  it.each(["tampered", "duplicate", "malformed"])("replaces an invalid %s CSRF cookie rather than trusting it", async (kind) => {
    const first = await GET(browserRequest())
    const csrf = first.headers.getSetCookie()[0]!.split(";", 1)[0]!
    const token = (await first.text()).match(/name="csrfToken" value="([a-f0-9]{64})"/u)![1]!
    const cookie = kind === "duplicate" ? `${csrf}; ${csrf}` : kind === "malformed" ? "next-auth.csrf-token=%ZZ" : csrf.slice(0, -1) + (csrf.endsWith("a") ? "b" : "a")
    const response = await GET(new NextRequest(`${ORIGIN}/login`, {
      headers: { host: "web.example.test", "x-nonce": "a".repeat(48), cookie },
    }))
    expect(await response.text()).not.toContain(`name="csrfToken" value="${token}"`)
  })

  it.each([
    "/login?return_to=https%3A%2F%2Fevil.example%2Fapp",
    "/login?return_to=%2F%2Fevil.example%2Fapp",
    "/login?return_to=%2Fapp&return_to=%2Fapp%2Fskills",
    "/login?return_to=%2Fapp&extra=1",
    "/login?return_to=%2Fapp%3Fconversation%3Dnot-canonical",
    "/login?return_to=%2Fapp%2Flibrary%3Fq%3D%FF",
    "/login?return_to=%2Fapp%2Flibrary%3Fq%3D%",
  ])("rejects invalid or ambiguous navigation intent before issuing a browser start: %s", async (path) => {
    const response = await GET(browserRequest(path))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it("starts the default product target with a real browser POST rather than a nested Route Handler call", async () => {
    const response = await GET(new NextRequest("http://127.0.0.1:43123/login", {
      headers: { host: "web.example.test", "x-nonce": "a".repeat(48) },
    }))
    expect(response.status).toBe(200)
    const [csrf, target] = response.headers.getSetCookie()
    expect(csrf).toMatch(/^next-auth\.csrf-token=/u)
    expect(target).toMatch(/^kokoro_product_login_return=/u)
    expect(await response.text()).toContain('id="kokoro-login-start"')
  })

  it("never renders a retry document when the RP is absent", async () => {
    vi.stubEnv("KOKORO_OIDC_CLIENT_ID", "")
    const response = await GET(browserRequest())
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("")
    expect(response.headers.get("content-type")).toBeNull()
  })
})
