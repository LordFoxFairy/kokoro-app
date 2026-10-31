import { afterEach, beforeEach, expect, it, vi } from "vitest"
const { currentProductSession, requestWithDomain } = vi.hoisted(() => ({ currentProductSession: vi.fn(), requestWithDomain: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))
vi.mock("@/lib/server/upstream-http", async (original) => ({ ...(await original<typeof import("@/lib/server/upstream-http")>()), requestWithDomain }))
import { GET } from "@/app/api/account/profile/route"

const session = () => ({
  id: "fixture-session",
  generation: 2,
  subject: "alice",
  access: "fixture-server-access",
  accessExpiresAt: Date.now() + 60_000,
  expiresAt: Date.now() + 120_000,
})
const request = (suffix = "", headers: Record<string, string> = {}, signal?: AbortSignal) =>
  new Request(`http://web.test/api/account/profile${suffix}`, {
    headers: { host: "web.test", authorization: "Bearer browser-forged", ...headers },
    ...(signal ? { signal } : {}),
  })
const owner = (value: unknown = { data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } }, status = 200, extra: Record<string, string> = {}) =>
  Response.json(value, { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "request-id", ...extra } })

beforeEach(() => {
  vi.resetAllMocks()
  for (const [key, value] of Object.entries({
    KOKORO_BFF_BASE_URL: "http://bff.test",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-relay-secret",
    KOKORO_WEB_AUTH_SECRET: "fixture-auth-secret-at-least-32-chars",
    KOKORO_WEB_REDIS_URL: "redis://fixture.test/0",
    KOKORO_DOMAIN: "product.test",
  })) vi.stubEnv(key, value)
  const stableSession = session()
  currentProductSession.mockImplementation(async () => stableSession)
  requestWithDomain.mockImplementation(async (_target: string, _domain: string, options: RequestInit & { headers: Headers }) => owner(undefined, 200, { "x-request-id": options.headers.get("x-kokoro-request-id") ?? "" }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

it("reads the IAM-owned profile through BFF and revalidates the same Product session", async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true } })
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(currentProductSession).toHaveBeenCalledTimes(2)
  const [target, domain, options] = requestWithDomain.mock.calls[0]!
  expect(target).toBe("http://bff.test/v1/account/profile")
  expect(domain).toBe("product.test")
  expect(options.method).toBe("GET")
  expect(options.headers.get("authorization")).toBe("Bearer fixture-server-access")
  expect(options.headers.get("x-kokoro-service")).toBe("web-bff")
  expect(options.headers.get("x-kokoro-internal-secret")).toBe("fixture-relay-secret")
})

it.each(["?subject=forged", "?"]) ("rejects query %s before session I/O", async (suffix) => {
  expect((await GET(request(suffix))).status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
})

it.each([{ host: "evil.test" }, { origin: "http://evil.test" }, { "content-length": "1" }, { "transfer-encoding": "chunked" }])(
  "rejects non-canonical or body framing metadata %j",
  async (headers) => {
    expect([400, 403]).toContain((await GET(request("", headers))).status)
    expect(currentProductSession).not.toHaveBeenCalled()
  },
)

it("maps missing, expired and unavailable sessions without owner I/O", async () => {
  currentProductSession.mockResolvedValueOnce(null)
  expect((await GET(request())).status).toBe(401)
  currentProductSession.mockResolvedValueOnce({ ...session(), accessExpiresAt: Date.now() - 1 })
  expect((await GET(request())).status).toBe(401)
  currentProductSession.mockRejectedValueOnce(new Error("private store details"))
  const unavailable = await GET(request())
  expect(unavailable.status).toBe(503)
  expect(await unavailable.text()).not.toContain("private store")
  expect(requestWithDomain).not.toHaveBeenCalled()
})

it.each([401, 403, 429, 500, 502]) ("maps owner status %s without leaking the body", async (status) => {
  requestWithDomain.mockImplementationOnce(async (_target: string, _domain: string, options: RequestInit & { headers: Headers }) =>
    owner({ error: { code: "owner_private", message: "secret" } }, status, { "x-request-id": options.headers.get("x-kokoro-request-id") ?? "", ...(status === 429 ? { "retry-after": "12" } : {}) }),
  )
  const response = await GET(request())
  expect(response.status).toBe(status === 401 ? 401 : status === 403 ? 403 : status === 429 ? 429 : 502)
  expect(await response.text()).not.toContain("owner_private")
})

it.each([
  { data: { subject: "other", name: "Alice", email: "alice@example.test", email_verified: true } },
  { data: { subject: "alice", name: "Alice", email: null, email_verified: true } },
  { data: { subject: "alice", name: "Alice", email: "alice@example.test", email_verified: true, secret: "leak" } },
  [],
  null,
]) ("rejects a non-canonical owner projection %j", async (value) => {
  requestWithDomain.mockImplementationOnce(async (_target: string, _domain: string, options: RequestInit & { headers: Headers }) => owner(value, 200, { "x-request-id": options.headers.get("x-kokoro-request-id") ?? "" }))
  expect((await GET(request())).status).toBe(502)
})

it.each([null, "changed-id", "changed-generation", "changed-subject", "expired"])("revalidates session before returning: %s", async (kind) => {
  currentProductSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(
    kind === null ? null : { ...session(), ...(kind === "changed-id" ? { id: "other" } : kind === "changed-generation" ? { generation: 3 } : kind === "changed-subject" ? { subject: "bob" } : { accessExpiresAt: Date.now() - 1 }) },
  )
  expect((await GET(request())).status).toBe(401)
})

it("uses one deadline for a hanging owner call", async () => {
  vi.useFakeTimers()
  requestWithDomain.mockReturnValueOnce(new Promise(() => {}))
  const pending = GET(request())
  await vi.advanceTimersByTimeAsync(10_001)
  expect((await pending).status).toBe(503)
})
