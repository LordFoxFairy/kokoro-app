import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/login/route"

const ORIGIN = "https://web.example.test"
const ENV = {
  NODE_ENV: "test",
  KOKORO_BFF_BASE_URL: "https://bff.example.test",
  KOKORO_WEB_ORIGIN: ORIGIN,
  KOKORO_INTERNAL_SECRET_WEB_BFF: "service-secret",
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
} satisfies NodeJS.ProcessEnv

function browserRequest(path = "/login", headers: HeadersInit = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { host: "web.example.test", ...headers } })
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
  ])("redirects a valid target to the browser-native IAM form: %s", async (target) => {
    const response = await GET(browserRequest(`/login?${new URLSearchParams({ return_to: target })}`))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/sign-in?native=1&return_to=${encodeURIComponent(target)}`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await response.text()).toBe("")
  })

  it("uses the default app target without rendering or setting a handoff cookie", async () => {
    const response = await GET(browserRequest())
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/auth/sign-in?native=1&return_to=%2Fapp`)
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it.each([
    "/login?return_to=https%3A%2F%2Fevil.example%2Fapp",
    "/login?return_to=%2F%2Fevil.example%2Fapp",
    "/login?return_to=%2Fapp&return_to=%2Fapp%2Fskills",
    "/login?return_to=%2Fapp&extra=1",
    "/login?return_to=%2Fapp%3Fconversation%3Dnot-canonical",
    "/login?return_to=%2Fapp%2Flibrary%3Fq%3D%FF",
    "/login?return_to=%2Fapp%2Flibrary%3Fq%3D%",
  ])("rejects invalid or ambiguous navigation intent: %s", async (path) => {
    const response = await GET(browserRequest(path))
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it("returns a browser recovery navigation when native login configuration is missing", async () => {
    vi.stubEnv("KOKORO_BFF_BASE_URL", "")
    const browser = await GET(browserRequest("/login", {
      accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "x-nonce": "a".repeat(48),
    }))
    expect(browser.status).toBe(303)
    expect(browser.headers.get("location")).toBe("/auth/sign-in/failed")
    expect(browser.headers.getSetCookie()).toEqual([])
    const api = await GET(browserRequest())
    expect(api.status).toBe(503)
    expect(api.headers.get("location")).toBeNull()
  })

  it("rejects a non-canonical host before issuing a native start", async () => {
    const response = await GET(new NextRequest(`${ORIGIN}/login`, { headers: { host: "evil.example.test" } }))
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
  })
})
