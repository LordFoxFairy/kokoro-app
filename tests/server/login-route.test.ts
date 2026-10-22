import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))

import { GET } from "@/app/login/route"
import { readProductLoginIntent } from "@/lib/server/product-login-return"

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
    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).toMatch(/^next-auth\.csrf-token\.tx-[A-Za-z0-9_-]{22}=[A-Za-z0-9%|]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=300$/u)
    const html = await response.text()
    const intent = html.match(/name="loginIntent" value="([A-Za-z0-9_.-]+)"/u)![1]!
    expect(readProductLoginIntent(intent, ENV.KOKORO_WEB_AUTH_SECRET, ORIGIN)?.target).toBe(target)
    expect(html).toContain('method="post" action="/api/auth/signin/kokoro-iam"')
    expect(html).toMatch(/name="csrfToken" value="[a-f0-9]{64}"/u)
    expect(html).not.toContain(target)
  })

  it("allocates independent handoff proofs even when the browser already has another form", async () => {
    const first = await GET(browserRequest())
    const csrf = first.headers.getSetCookie()[0]!.split(";", 1)[0]!
    const request = () => new NextRequest(`${ORIGIN}/login`, { headers: { host: "web.example.test", "x-nonce": "a".repeat(48), cookie: csrf } })
    const [second, third] = await Promise.all([GET(request()), GET(request())])
    const names = [first, second, third].map(response => response.headers.getSetCookie()[0]!.split("=", 1)[0])
    expect(new Set(names).size).toBe(3)
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
    const [csrf] = response.headers.getSetCookie()
    expect(csrf).toMatch(/^next-auth\.csrf-token\.tx-/u)
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


it("returns a native login configuration failure to the inert product page, while API clients keep 503", async () => {
  vi.stubEnv("KOKORO_OIDC_CLIENT_ID", "")
  const browser = await GET(new NextRequest(`${ORIGIN}/login`, { headers: { host: "web.example.test",
    accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "x-nonce": "a".repeat(48) } }))
  expect(browser.status).toBe(303)
  expect(browser.headers.get("location")).toBe("/auth/sign-in/failed")
  expect(browser.headers.getSetCookie()).toEqual([])
  const api = await GET(browserRequest())
  expect(api.status).toBe(503)
  expect(api.headers.get("location")).toBeNull()
})


it("keeps two cold login forms independent when their responses arrive in reverse order", async () => {
  const responses = await Promise.all([GET(browserRequest("/login?return_to=%2Fapp")), GET(browserRequest("/login?return_to=%2Fapp%2Fskills"))])
  const tokens = await Promise.all(responses.map(async response => (await response.text()).match(/name="csrfToken" value="([a-f0-9]{64})"/u)![1]!))
  const proofCookies = responses.map((response, index) => response.headers.getSetCookie().find(cookie => decodeURIComponent(cookie.split(";", 1)[0]!).includes(tokens[index]!))!)
  expect(proofCookies.every(Boolean)).toBe(true)
  const names = proofCookies.map(cookie => cookie.slice(0, cookie.indexOf("=")))
  expect(new Set(names).size).toBe(2)
  const jar = new Map<string, string>()
  for (const response of [...responses].reverse()) for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0]!
    jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1))
  }
  expect(names.every((name, index) => decodeURIComponent(jar.get(name)!).startsWith(tokens[index]! + "|"))).toBe(true)
})
