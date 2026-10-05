import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { contentSecurityPolicy } from "@/lib/server/security-headers"

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

  it("restarts an expired signed sign-in navigation before issuing a new form proof", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(request("/auth/sign-in?exp=1&sig=%2BAb"))

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(issueIamInteractionCsrf).not.toHaveBeenCalled()
  })
})


describe("signed sign-in expiration boundary", () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ["?exp=0&sig=%2BAb", true],
    ["?exp=999&sig=%2BAb", true],
    ["?exp=1000&sig=%2BAb", true],
    ["?exp=1001&sig=%2BAb", false],
    ["?sig=%2BAb", false],
    ["?exp=1&exp=2000&sig=%2BAb", false],
    ["?exp=01&sig=%2BAb", false],
    ["?exp=-1&sig=%2BAb", false],
    ["?exp=invalid&sig=%2BAb", false],
  ])("checks canonical expiry without changing signed bytes (%s)", async (query, expired) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_999)
    const { isIamSignInExpired, rawIamSignInQuery } = await import("@/lib/server/iam-sign-in-target")
    expect(isIamSignInExpired(query)).toBe(expired)
    expect(rawIamSignInQuery(`${ORIGIN}/auth/sign-in${query}`)).toBe(query)
  })
})

describe("development local upload CSP boundary", () => {
  const webOrigin = "http://127.0.0.1:3311"
  const uploadOrigin = "http://127.0.0.1:39190"
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("KOKORO_WEB_ORIGIN", webOrigin)
    vi.stubEnv("KOKORO_WEB_LOCAL_UPLOAD_ORIGIN", uploadOrigin)
  })
  afterEach(() => vi.unstubAllEnvs())

  it("sets the exact source on both the document and forwarded request CSP without changing other directives", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(new NextRequest(`${webOrigin}/app/skills`, { headers: { host: "127.0.0.1:3311" } }))
    const policy = response.headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/u.exec(policy)![1]!
    expect(policy).toBe(contentSecurityPolicy(nonce, true).replace("connect-src 'self' https: wss:", `connect-src 'self' https: wss: ${uploadOrigin}`))
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy)
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("vary")).toBe("Cookie")
  })

  it("uses the configured Host when Next normalizes the listener URL to localhost", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(new NextRequest("http://localhost:3311/app/skills", {
      headers: { host: "127.0.0.1:3311", origin: webOrigin },
    }))
    expect(response.headers.get("content-security-policy")).toContain(`connect-src 'self' https: wss: ${uploadOrigin};`)
  })

  it("keeps the source blocked when Origin conflicts with the configured Host", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(new NextRequest("http://localhost:3311/app/skills", {
      headers: { host: "127.0.0.1:3311", origin: "http://evil.test:3311" },
    }))
    const policy = response.headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/u.exec(policy)![1]!
    expect(policy).toBe(contentSecurityPolicy(nonce, true))
  })

  it.each(["production", "test", ""])("preserves the original CSP outside explicit development (%s)", async (mode) => {
    vi.stubEnv("NODE_ENV", mode)
    const { proxy } = await import("@/proxy")
    const response = await proxy(new NextRequest(`${webOrigin}/app/skills`, { headers: { host: "127.0.0.1:3311" } }))
    const policy = response.headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/u.exec(policy)![1]!
    expect(policy).toBe(contentSecurityPolicy(nonce))
  })

  it("ignores browser-supplied upload policy values when trusted configuration is absent", async () => {
    vi.stubEnv("KOKORO_WEB_LOCAL_UPLOAD_ORIGIN", undefined)
    const { proxy } = await import("@/proxy")
    const response = await proxy(new NextRequest(`${webOrigin}/app/skills`, { headers: {
      "x-kokoro-web-local-upload-origin": uploadOrigin, "origin": uploadOrigin,
      "content-security-policy": `connect-src http: ${uploadOrigin}`,
    } }))
    const policy = response.headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/u.exec(policy)![1]!
    expect(policy).toBe(contentSecurityPolicy(nonce, true))
  })

  it("does not use Origin or forwarded headers to turn a different Host into the configured page", async () => {
    const { proxy } = await import("@/proxy")
    const response = await proxy(new NextRequest("http://evil.test:3311/app/skills", { headers: {
      "host": "evil.test:3311", "origin": webOrigin,
      "x-forwarded-host": "127.0.0.1:3311", "x-forwarded-proto": "http",
    } }))
    const policy = response.headers.get("content-security-policy")!
    const nonce = /'nonce-([^']+)'/u.exec(policy)![1]!
    expect(policy).toBe(contentSecurityPolicy(nonce, true))
  })
})
