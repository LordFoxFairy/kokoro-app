import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
import { GET, POST } from "@/app/api/admin/[...path]/route"

const id = "11111111-1111-4111-8111-111111111111"
const segments = ["model-providers", id, "upstream-models"]
const context = (path = segments) => ({ params: Promise.resolve({ path }) })
const path = `/v1/admin/${segments.join("/")}`
let server: Server
let calls: IncomingMessage[]
let peer: (request: IncomingMessage, response: ServerResponse) => void
function input(headers: Record<string, string> = {}, query = "", signal?: AbortSignal) {
  return new Request(`http://web.test/api/admin/${segments.join("/")}${query}`, {
    ...(signal === undefined ? {} : { signal }), headers: { "x-kokoro-request-id": "discovery-bridge-1", ...headers },
  })
}
beforeEach(async () => {
  calls = []
  currentProductSession.mockReset().mockResolvedValue({ access: "server-session-access", accessExpiresAt: Date.now() + 60_000 })
  peer = (request, response) => {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(request.headers["x-kokoro-request-id"]) })
    response.end(JSON.stringify({ data: { provider_id: id, items: [{ id: "actual-upstream-model" }] }, meta: { request_id: "discovery-bridge-1" } }))
  }
  server = createServer((request, response) => { calls.push(request); peer(request, response) })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("test peer did not bind")
  for (const [key, value] of Object.entries({ KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9", KOKORO_WEB_ORIGIN: "http://web.test", KOKORO_DOMAIN: "configured.product.test", KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`, KOKORO_INTERNAL_SECRET_WEB_BFF: "configured-bridge-secret" })) vi.stubEnv(key, value)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})
it("forwards only the exact model discovery GET using configured domain and admitted session", async () => {
  const response = await GET(input({ authorization: "Bearer forged", "x-kokoro-tenant-id": "forged", "x-kokoro-actor-id": "forged", forwarded: "host=forged.test" }), context())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(response.headers.get("x-request-id")).toBe("discovery-bridge-1")
  expect(await response.json()).toEqual({ data: { provider_id: id, items: [{ id: "actual-upstream-model" }] }, meta: { request_id: "discovery-bridge-1" } })
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe(path)
  expect(calls[0]!.headers.authorization).toBe("Bearer server-session-access")
  expect(calls[0]!.headers.forwarded).toBe("host=configured.product.test")
  for (const name of ["x-kokoro-tenant-id", "x-kokoro-actor-id", "content-type", "content-length", "transfer-encoding"]) expect(calls[0]!.headers[name]).toBeUndefined()
})
it.each(["content-length", "transfer-encoding", "content-type", "if-match", "if-none-match", "idempotency-key"])("rejects %s before session or BFF I/O", async name => {
  const response = await GET(input({ [name]: name === "content-length" ? "0" : "arbitrary" }), context())
  expect(response.status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("rejects any query and keeps unknown paths or methods outside the bridge", async () => {
  expect((await GET(input({}, "?limit=1"), context())).status).toBe(400)
  for (const parts of [["model-providers", "not-uuid", "upstream-models"], [...segments, "extra"], ["model-definitions", id, "upstream-models"]]) expect((await GET(input(), context(parts))).status).toBe(404)
  expect((await POST(new Request("http://web.test/api/admin/ignored", { method: "POST" }), context())).status).toBe(404)
  expect(calls).toHaveLength(0)
})
it("rejects absent sessions without trusting browser identity headers", async () => {
  currentProductSession.mockResolvedValue(null)
  expect((await GET(input({ "x-kokoro-platform-admin": "true" }), context())).status).toBe(401)
  expect(calls).toHaveLength(0)
})
it("preserves the BFF's original error and request ID without retry", async () => {
  peer = (request, response) => {
    response.writeHead(403, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(request.headers["x-kokoro-request-id"]) })
    response.end(JSON.stringify({ error: { code: "admin_model_routing_forbidden", message: "Forbidden", retryable: false }, meta: { request_id: "discovery-bridge-1" } }))
  }
  const response = await GET(input(), context())
  expect(response.status).toBe(403)
  expect((await response.json()).error.code).toBe("admin_model_routing_forbidden")
  expect(calls).toHaveLength(1)
})
it("rejects responses above 1 MiB before exposing a successful response", async () => {
  peer = (request, response) => {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(request.headers["x-kokoro-request-id"]), "content-length": 1024 * 1024 + 1 })
    response.end(" ".repeat(1024 * 1024 + 1))
  }
  const response = await GET(input(), context())
  expect(response.status).toBe(503)
  expect(JSON.stringify(await response.json())).not.toContain("Upstream")
})
it("propagates caller cancellation to the real BFF socket", async () => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  let closed!: () => void
  const close = new Promise<void>(resolve => { closed = resolve })
  peer = (_request, response) => { response.once("close", closed); started() }
  const controller = new AbortController()
  const pending = GET(input({}, "", controller.signal), context())
  await ready
  controller.abort()
  expect((await pending).status).toBe(503)
  await close
  expect(calls).toHaveLength(1)
})
it("does not issue a late BFF request after the shared session budget expires", async () => {
  const realNow = Date.now()
  const clock = vi.spyOn(Date, "now").mockReturnValue(realNow)
  currentProductSession.mockImplementation(async () => { clock.mockReturnValue(realNow + 10_001); return { access: "server-session-access", accessExpiresAt: realNow + 60_000 } })
  const response = await GET(input(), context())
  expect(response.status).toBe(503)
  expect(calls).toHaveLength(0)
})
it("returns within the same ten-second budget even while session inspection is pending", async () => {
  vi.useFakeTimers()
  try {
    currentProductSession.mockImplementation(() => new Promise(() => undefined))
    const pending = GET(input(), context())
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await pending).status).toBe(503)
    expect(calls).toHaveLength(0)
  } finally { vi.useRealTimers() }
})
it("cancels a partially received response without exposing a successful body", async () => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  let closed!: () => void
  const close = new Promise<void>(resolve => { closed = resolve })
  peer = (request, response) => {
    response.once("close", closed)
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(request.headers["x-kokoro-request-id"]) })
    response.write('{"data":')
    started()
  }
  const controller = new AbortController()
  const pending = GET(input({}, "", controller.signal), context())
  await ready
  controller.abort()
  expect((await pending).status).toBe(503)
  await close
})
