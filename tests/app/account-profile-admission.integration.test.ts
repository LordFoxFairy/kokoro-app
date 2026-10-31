import { createServer, type Server } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))
import { GET } from "@/app/api/account/profile/route"

type Scenario = { admissionStatus?: number; profileStatus?: number; profileBody?: unknown }

describe("account profile native-session admission through the BFF", () => {
  let server: Server | undefined
  let scenario: Scenario
  let paths: string[]
  let headers: Record<string, string>[]

  beforeEach(async () => {
    scenario = {}
    paths = []
    headers = []
    currentProductSession.mockReset().mockResolvedValue({
      id: "legacy-session",
      generation: 1,
      subject: "alice",
      access: "legacy-access",
      accessExpiresAt: Date.now() + 60_000,
      expiresAt: Date.now() + 120_000,
    })
    server = createServer((request, response) => {
      paths.push(request.url ?? "")
      headers.push(Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)])))
      const requestId = String(request.headers["x-kokoro-request-id"] ?? "")
      if (request.url === "/v1/me") {
        const status = scenario.admissionStatus ?? 200
        response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": requestId })
        response.end(status === 200 ? JSON.stringify({ data: { user_id: "alice", tenant_id: "tenant-one", platform_admin: false }, meta: { request_id: requestId } }) : JSON.stringify({ error: { code: "session_invalid", message: "invalid" } }))
        return
      }
      if (request.url === "/v1/account/profile") {
        const status = scenario.profileStatus ?? 200
        response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": requestId })
        response.end(JSON.stringify(scenario.profileBody ?? { data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } }))
        return
      }
      response.writeHead(404)
      response.end()
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
    }
  })

  it("uses legacy Product Session as the transitional admission when no native cookie is present", async () => {
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test" } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } })
    expect(paths).toEqual(["/v1/account/profile"])
    expect(headers[0]?.authorization).toBe("Bearer legacy-access")
  })

  it("admits native cookie through /v1/me and forwards the same cookie to the profile owner", async () => {
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native" } }))
    expect(response.status).toBe(200)
    expect(paths).toEqual(["/v1/me", "/v1/account/profile", "/v1/me"])
    expect(headers[0]?.cookie).toBe("kokoro-issuer.session_token=native")
    expect(headers[1]?.cookie).toBe("kokoro-issuer.session_token=native")
    expect(headers[1]?.origin).toBe("http://web.test")
    expect(headers[1]?.authorization).toBeUndefined()
  })

  it("turns native admission rejection into a session error without profile I/O", async () => {
    scenario.admissionStatus = 401
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native" } }))
    expect(response.status).toBe(401)
    expect(paths).toEqual(["/v1/me"])
  })

  it("rejects a foreign owner projection after native admission", async () => {
    scenario.profileBody = { data: { subject: "bob", name: "Alice", email: "alice@example.test", email_verified: true } }
    const response = await GET(new Request("http://web.test/api/account/profile", { headers: { host: "web.test", cookie: "kokoro-issuer.session_token=native" } }))
    expect(response.status).toBe(502)
    expect(paths).toEqual(["/v1/me", "/v1/account/profile"])
  })
})
