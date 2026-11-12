import { createServer, type Server } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/account/profile/route"

type Scenario = { profileStatus?: number | "disconnect"; profileBody?: unknown; foreignOwnerRejected?: boolean }

// This is a named HTTP BFF peer, not an IAM integration or a Web principal store.
describe("account profile native-session boundary through the BFF", () => {
  let server: Server | undefined
  let scenario: Scenario
  let paths: string[]
  let headers: Record<string, string>[]

  beforeEach(async () => {
    scenario = {}
    paths = []
    headers = []
    server = createServer((request, response) => {
      paths.push(request.url ?? "")
      headers.push(Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)])))
      const requestId = String(request.headers["x-kokoro-request-id"] ?? "")
      if (request.url !== "/v1/account/profile") {
        response.writeHead(404)
        response.end()
        return
      }
      const admitted = request.headers.cookie === "kokoro-issuer.session_token=native"
      const status = !admitted ? 401 : scenario.foreignOwnerRejected ? 502 : scenario.profileStatus ?? 200
      if (status === "disconnect") {
        request.socket.destroy()
        return
      }
      const code = status === 401 ? "session_authentication_required" : status === 429 ? "account_profile_rate_limited" : status === 502 ? "account_profile_response_invalid" : "account_profile_unavailable"
      response.writeHead(status, {
        "content-type": "application/json", "cache-control": "no-store", "x-request-id": requestId,
        ...(status === 429 ? { "retry-after": "3" } : {}),
      })
      response.end(JSON.stringify(status !== 200
        ? { error: { code, message: "fixture private upstream details", retryable: status === 429 || status === 503 } }
        : scenario.profileBody ?? { data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } }))
    })
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject)
      server!.listen(0, "127.0.0.1", resolve)
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("fixture did not bind")
    for (const [key, value] of Object.entries({
      KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`,
      KOKORO_WEB_ORIGIN: "http://web.test",
      KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-secret",
      KOKORO_WEB_AUTH_SECRET: "set43-auth-secret-at-least-thirty-two-characters",
      KOKORO_WEB_REDIS_URL: "redis://unused.invalid/0",
      KOKORO_DOMAIN: "product.test",
      KOKORO_TENANT_ID: "tenant-one",
    })) vi.stubEnv(key, value)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    if (server) {
      const owned = server
      server = undefined
      owned.closeAllConnections()
      await new Promise<void>((resolve, reject) => owned.close((error) => (error ? reject(error) : resolve())))
      expect(owned.listening).toBe(false)
    }
  })

  it("delegates missing native credentials once to the BFF and returns its sanitized session denial", async () => {
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test" } }))
    expect(response.status).toBe(401)
    expect(paths).toEqual(["/v1/account/profile"])
    expect(headers[0]?.cookie).toBeUndefined()
    expect(await response.json()).toEqual({ error: { code: "session_invalid", message: "session_invalid", retryable: false } })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })

  it("makes one profile request with the native cookie and trusted transport, without me probes", async () => {
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native; unrelated=private", "x-kokoro-actor-id": "forged" } }))
    expect(response.status).toBe(200)
    expect(paths).toEqual(["/v1/account/profile"])
    expect(headers[0]?.cookie).toBe("kokoro-issuer.session_token=native")
    expect(headers[0]?.origin).toBe("http://web.test")
    expect(headers[0]?.forwarded).toBe("host=product.test")
    expect(headers[0]?.["x-kokoro-service"]).toBe("web-bff")
    expect(headers[0]?.["x-kokoro-internal-secret"]).toBe("fixture-secret")
    expect(headers[0]?.["x-kokoro-actor-id"]).toBeUndefined()
    expect(headers[0]?.authorization).toBeUndefined()
    expect(await response.json()).toEqual({ data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } })
  })

  it.each([429, 503, "disconnect"] as const)("preserves the profile operation's safe failure mapping for BFF %s", async status => {
    scenario.profileStatus = status
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native" } }))
    const code = status === 429 ? "account_profile_rate_limited" : "account_profile_unavailable"
    expect(paths).toEqual(["/v1/account/profile"])
    expect(response.status).toBe(status === 429 ? 429 : 503)
    expect(await response.json()).toEqual({ error: { code, message: code, retryable: true } })
    expect(response.headers.get("retry-after")).toBe(status === 429 ? "3" : null)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-request-id")).toBeTruthy()
  })

  it("does not turn a rejected native credential into an admitted profile", async () => {
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=revoked" } }))
    expect(paths).toEqual(["/v1/account/profile"])
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: { code: "session_invalid", message: "session_invalid", retryable: false } })
  })

  it("withholds a foreign owner projection rejected by the BFF's expectedSubject guard", async () => {
    // BFF src/http/routes/account-profile.ts binds expectedSubject to admitted userId.
    // Its real account-profile-client.test.ts rejects foreign owner subjects as 502;
    // this BFF peer publishes that failure, never an accepted Bob200 or a Web /me proof.
    scenario.foreignOwnerRejected = true
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native" } }))
    expect(paths).toEqual(["/v1/account/profile"])
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: { code: "account_profile_response_invalid", message: "account_profile_response_invalid", retryable: false } })
  })

  it("rejects malformed secret-bearing BFF wire without leaking the private payload", async () => {
    scenario.profileBody = { data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true, token: "private-secret-canary" } }
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native" } }))
    expect(paths).toEqual(["/v1/account/profile"])
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: { code: "account_profile_response_invalid", message: "account_profile_response_invalid", retryable: false } })
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-request-id")).toBeTruthy()
  })
})
