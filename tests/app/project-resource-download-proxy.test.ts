import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/hub/[...path]/route"
import { requestWithDomain } from "@/lib/server/upstream-http"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"
import { downloadProjectResource } from "@/features/app/project-resource-download"

vi.mock("@/lib/server/upstream-http", async (original) => ({ ...await original<typeof import("@/lib/server/upstream-http")>(), requestWithDomain: vi.fn() }))
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
const base = "/api/hub/projects/project-a/resources/asset-1/content"
let claims: { id: string; generation: number; subject: string; access: string; accessExpiresAt: number; expiresAt: number }
function owner(body: BodyInit = "abc", headers?: HeadersInit, status = 200) {
  const outgoing = new Headers(vi.mocked(requestWithDomain).mock.calls.at(-1)?.[2].headers)
  return new Response(body, { status, headers: {
    "content-type": "text/plain", "content-length": "3", "content-disposition": "attachment; filename=\"private.txt\"; filename*=UTF-8''private.txt",
    "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
    "x-request-id": outgoing.get("x-kokoro-request-id") ?? "req-test", ...Object.fromEntries(new Headers(headers)),
  } })
}
function call(path = base, method = "GET", pending = Promise.resolve({ path: ["projects", "project-a", "resources", "asset-1", "content"] }), signal?: AbortSignal) {
  const request = new Request(`http://web.test${path}`, { method, headers: { host: "web.test" }, ...(signal ? { signal } : {}) })
  return (method === "GET" ? GET : POST)(request, { params: pending })
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const [key, value] of Object.entries({ KOKORO_BFF_BASE_URL: "http://bff.test", KOKORO_WEB_ORIGIN: "http://web.test", KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/0", KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_DOMAIN: "product.test", KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-secret" })) vi.stubEnv(key, value)
  claims = { id: "opaque-session", generation: 1, subject: "alice", access: "server-access", accessExpiresAt: Date.now() + 600_000, expiresAt: Date.now() + 900_000 }
  currentProductSession.mockResolvedValue(claims)
  vi.mocked(requestWithDomain).mockImplementation(async () => owner())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it("I3 actual Hub sends exact project binary GET after admission and validates session again after EOF", async () => {
  const response = await call()
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("abc")
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("content-disposition")).toContain("attachment;")
  expect(currentProductSession).toHaveBeenCalledTimes(2)
  expect(requestWithDomain).toHaveBeenCalledTimes(1)
  const [url, , init] = vi.mocked(requestWithDomain).mock.calls[0]!
  expect(url).toBe("http://bff.test/v1/projects/project-a/resources/asset-1/content")
  expect(init).toMatchObject({ method: "GET", maxResponseBytes: 1_048_576 })
  expect(init.timeoutMs).toBeGreaterThan(20_000)
  expect(init.timeoutMs).toBeLessThanOrEqual(30_000)
  expect(new Headers(init.headers).get("authorization")).toBe("Bearer server-access")
  expect(new Headers(init.headers).has("cookie")).toBe(false)
})
it.each(["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"] as const)("I3 final %s change discards already-read bytes", async (field) => {
  currentProductSession.mockImplementationOnce(async () => ({ ...claims })).mockImplementationOnce(async () => ({ ...claims, [field]: typeof claims[field] === "number" ? Number(claims[field]) + 1 : "changed" }))
  const response = await call()
  expect(response.status).toBe(401)
  expect(await response.text()).not.toBe("abc")
})
it.each([`${base}?`, `${base}?x=1`, `${base}/`, base.replace("projects", "%70rojects"), base.replace("content", "%63ontent"), base.replace("/projects/", "/self/projects/")])("I3 rejects raw structural alias %s before owner IO", async (path) => {
  expect((await call(path)).status).toBe(400)
  expect(requestWithDomain).not.toHaveBeenCalled()
})
it("I3 wrong method is 405 and never reaches owner", async () => {
  expect((await call(base, "POST")).status).toBe(405)
  expect(requestWithDomain).not.toHaveBeenCalled()
})
it.each([
  ["content-length", "2"], ["content-length", "4"], ["content-length", "1048577"], ["content-type", "text/plain; charset=utf-8"],
  ["content-disposition", "inline"], ["cache-control", "private, no-store"], ["set-cookie", "leak=1"], ["location", "https://wrong.test"],
  ["content-encoding", "gzip"], ["x-request-id", "wrong"],
])("I3 rejects unsafe/mismatched owner %s=%s", async (key, value) => {
  vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner("abc", { [key]: value }))
  expect((await call()).status).toBe(502)
})
it("I3 requires actual EOF even when declared bytes have already arrived and cancellation never waits on cancel", async () => {
  vi.useFakeTimers()
  const cancel = vi.fn(() => new Promise<void>(() => undefined))
  vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("abc")) }, cancel })))
  const pending = call()
  await vi.advanceTimersByTimeAsync(30_001)
  expect((await pending).status).toBe(504)
  expect(cancel).toHaveBeenCalledTimes(1)
})
it.each(["params", "session", "upstream"])("I3 total deadline retires noncooperative %s without later IO", async (phase) => {
  vi.useFakeTimers()
  const never = new Promise<never>(() => undefined)
  if (phase === "session") currentProductSession.mockReturnValueOnce(never)
  if (phase === "upstream") vi.mocked(requestWithDomain).mockReturnValueOnce(never)
  const pending = call(base, "GET", phase === "params" ? never : undefined)
  await vi.advanceTimersByTimeAsync(30_001)
  expect((await pending).status).toBe(504)
  if (phase !== "upstream") expect(requestWithDomain).not.toHaveBeenCalled()
})
it("I3 aborts a noncooperative upstream immediately", async () => {
  vi.mocked(requestWithDomain).mockReturnValueOnce(new Promise(() => undefined))
  const controller = new AbortController(), pending = call(base, "GET", undefined, controller.signal)
  await vi.waitFor(() => expect(requestWithDomain).toHaveBeenCalledTimes(1))
  controller.abort()
  expect((await pending).status).toBe(499)
})

it("I3 actual GET request EOF is bounded and nonempty body is refused before admission", async () => {
  const input = new Request(`http://web.test${base}`, { headers: { host: "web.test" } })
  Object.defineProperty(input, "body", { value: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close() } }) })
  expect((await GET(input, { params: Promise.resolve({ path: ["projects", "project-a", "resources", "asset-1", "content"] }) })).status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(requestWithDomain).not.toHaveBeenCalled()
})
it("I3 hanging request EOF consumes the same absolute budget without admission", async () => {
  vi.useFakeTimers()
  const input = new Request(`http://web.test${base}`, { headers: { host: "web.test" } })
  Object.defineProperty(input, "body", { value: new ReadableStream() })
  const pending = GET(input, { params: Promise.resolve({ path: ["projects", "project-a", "resources", "asset-1", "content"] }) })
  await vi.advanceTimersByTimeAsync(30_001)
  expect((await pending).status).toBe(504)
  expect(currentProductSession).not.toHaveBeenCalled()
})
it("I3 final session lookup is included in the same budget after verified owner EOF", async () => {
  vi.useFakeTimers()
  currentProductSession.mockResolvedValueOnce(claims).mockReturnValueOnce(new Promise(() => undefined))
  const pending = call()
  await vi.advanceTimersByTimeAsync(30_001)
  expect((await pending).status).toBe(504)
  expect(currentProductSession).toHaveBeenCalledTimes(2)
})
it("I3 late params cannot restart IO after the deadline", async () => {
  vi.useFakeTimers()
  let resolve!: (value: { path: string[] }) => void
  const pending = call(base, "GET", new Promise(yes => { resolve = yes }))
  await vi.advanceTimersByTimeAsync(30_001)
  expect((await pending).status).toBe(504)
  resolve({ path: ["projects", "project-a", "resources", "asset-1", "content"] })
  await vi.advanceTimersByTimeAsync(1)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(requestWithDomain).not.toHaveBeenCalled()
})
it.each([400, 401, 403, 404, 429, 502, 503])("I3 strict owner error %i stays a failure with its safe code and no attachment", async status => {
  vi.mocked(requestWithDomain).mockImplementationOnce(async () => {
    const id = new Headers(vi.mocked(requestWithDomain).mock.calls.at(-1)?.[2].headers).get("x-kokoro-request-id")!
    return Response.json({ error: { code: "owner_error", message: "private upstream text" }, meta: { request_id: id } }, { status, headers: {
      "cache-control": "no-store", "x-request-id": id, "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...(status === 429 ? { "retry-after": "2" } : {}),
    } })
  })
  const result = await call()
  expect(result.status).toBe(status)
  expect(await result.json()).toMatchObject({ error: { code: "owner_error", message: "owner_error" } })
  expect(result.headers.has("content-disposition")).toBe(false)
  expect(result.headers.get("retry-after")).toBe(status === 429 ? "2" : null)
})
it("I3 redirect response never becomes bytes or a navigation target", async () => {
  vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner("", { location: "https://object.test/private" }, 302))
  const result = await call()
  expect(result.status).toBe(502)
  expect(result.headers.has("location")).toBe(false)
})
it("I3 actual Hub bytes through actual final Proxy headers are accepted by the browser SHA consumer", async () => {
  const result = await call()
  const final = await proxy(new NextRequest(`http://web.test${base}`))
  for (const name of ["cache-control", "referrer-policy", "x-content-type-options"]) result.headers.set(name, final.headers.get(name)!)
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(result))
  expect((await downloadProjectResource({ projectRef: "project-a", assetId: "asset-1", filename: "private.txt", mimeType: "text/plain", sizeBytes: "3",
    contentSha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" }, new AbortController().signal)).size).toBe(3)
  expect(currentProductSession).toHaveBeenCalledTimes(2)
})
