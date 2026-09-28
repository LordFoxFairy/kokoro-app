import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { issueIamInteractionCsrf } = vi.hoisted(() => ({ issueIamInteractionCsrf: vi.fn() }))

vi.mock("@/lib/server/iam-interaction-csrf", async (original) => ({
  ...(await original<typeof import("@/lib/server/iam-interaction-csrf")>()), issueIamInteractionCsrf,
}))

const ORIGIN = "https://web.example.test:4433"
const QUERY = "?sig=%2BAb"
const TOKEN = "a".repeat(43)
const ENV = {
  KOKORO_WEB_ORIGIN: ORIGIN,
  KOKORO_BFF_BASE_URL: "http://bff.example.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "web-bff-secret",
  KOKORO_WEB_REDIS_URL: "redis://127.0.0.1:6379",
}

function request(path: string, headers: HeadersInit = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers: { host: "web.example.test:4433", ...headers } })
}

describe("HTTPS issuer sign-in Proxy rewrite", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) process.env[key] = value
    issueIamInteractionCsrf.mockReset().mockResolvedValue({
      token: TOKEN,
      cookie: `kokoro_iam_csrf=${TOKEN}; Path=/auth/sign-in; HttpOnly; SameSite=Lax`,
    })
  })
  afterEach(() => { for (const key of Object.keys(ENV)) delete process.env[key] })

  it("keeps the TLS-terminated public origin and non-default port for the internal form rewrite", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(request(`/auth/sign-in${QUERY}`))

    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/auth/sign-in/form${QUERY}`)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(issueIamInteractionCsrf).toHaveBeenCalledWith(expect.objectContaining({
      webOrigin: ORIGIN, path: "/auth/sign-in", method: "POST", query: QUERY,
    }))
  })

  it("uses the verified public origin when Next normalizes request.url to its internal listener", async () => {
    const { proxy } = await import("@/proxy")
    const internal = new NextRequest(`https://127.0.0.1:5151/auth/sign-in${QUERY}`, {
      headers: { host: "web.example.test:4433" },
    })
    const response = await proxy(internal)

    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/auth/sign-in/form${QUERY}`)
  })

  it("rejects direct form requests even when a browser forges internal headers", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(request(`/auth/sign-in/form${QUERY}`, {
      "x-kokoro-sign-in-query": QUERY,
      "x-kokoro-sign-in-csrf": TOKEN,
      "x-kokoro-sign-in-proof": "b".repeat(43),
    }))

    expect(response.status).toBe(404)
    expect(issueIamInteractionCsrf).not.toHaveBeenCalled()
  })
})
