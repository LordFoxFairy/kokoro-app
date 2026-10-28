import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { GET } from "@/app/api/skill-downloads/[handle]/route"
import { requestWithDomain } from "@/lib/server/upstream-http"
const session = vi.hoisted(() => vi.fn())
vi.mock("@/lib/server/product-session", () => ({ currentProductSession: session }))
vi.mock("@/lib/server/upstream-http", async original => ({ ...(await original<typeof import("@/lib/server/upstream-http")>()), requestWithDomain: vi.fn() }))
const handle = "a".repeat(43), url = `http://localhost/api/skill-downloads/${handle}`
const params = { params: Promise.resolve({ handle }) }
const headers = { "content-type": "application/zip", "content-length": "3", "content-disposition": "attachment; filename=\"skill.zip\"; filename*=UTF-8''real.skill", "cache-control": "no-store", "x-request-id": "request-download", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" }
function binary(body: BodyInit | ReadableStream<Uint8Array> = new Uint8Array([1, 2, 3]), changes: Record<string, string> = {}) { return new Response(body, { headers: { ...headers, ...changes } }) }
beforeEach(() => {
  for (const [key, value] of Object.entries({ KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9", KOKORO_WEB_ORIGIN: "http://localhost", KOKORO_DOMAIN: "dev.kokoro.localhost", KOKORO_BFF_BASE_URL: "http://bff.test", KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret" })) vi.stubEnv(key, value)
  session.mockReset(); session.mockResolvedValue({ access: "product-access", accessExpiresAt: Date.now() + 60_000 }); vi.mocked(requestWithDomain).mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
it("streams the original bytes without changing filename or caching a ZIP", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(binary())
  const response = await GET(new Request(url), params)
  expect(response.status).toBe(200); expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  expect(response.headers.get("content-disposition")).toBe(headers["content-disposition"])
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(`http://bff.test/skill-downloads/${handle}`)
})
it("rejects upstream redirects instead of sending the browser to another origin", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://other.example/package" } }))
  expect((await GET(new Request(url), params)).status).toBe(502)
})
it.each(["query", "key", "length", "encoding"])("rejects noncanonical byte request %s before upstream IO", async variant => {
  vi.mocked(requestWithDomain).mockResolvedValue(binary())
  const extra: Record<string, string> = variant === "key" ? { "idempotency-key": "forbidden" } : variant === "length" ? { "content-length": "0" } : variant === "encoding" ? { "transfer-encoding": "chunked" } : {}
  expect((await GET(new Request(`${url}${variant === "query" ? "?extra=1" : ""}`, { headers: extra }), params)).status).toBe(400)
  expect(requestWithDomain).not.toHaveBeenCalled()
})
it("rejects missing attachment metadata and cancels the upstream body", async () => {
  const cancelled = vi.fn(), response = binary(new ReadableStream({ cancel: cancelled })); response.headers.delete("content-disposition")
  vi.mocked(requestWithDomain).mockResolvedValue(response)
  expect((await GET(new Request(url), params)).status).toBe(502); expect(cancelled).toHaveBeenCalledOnce()
})
it("ends stalled fetch within the total budget and cleans a late body", async () => {
  vi.useFakeTimers(); let finish!: (response: Response) => void; const cancelled = vi.fn()
  vi.mocked(requestWithDomain).mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  const result = GET(new Request(url), params)
  await vi.advanceTimersByTimeAsync(10_001)
  expect((await Promise.race([result, Promise.resolve(new Response(null, { status: 599 }))])).status).toBe(504)
  finish(binary(new ReadableStream({ cancel: cancelled }))); await Promise.resolve(); await Promise.resolve()
  expect(cancelled).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
})
it("keeps the deadline active during an unclosed binary stream", async () => {
  vi.useFakeTimers(); const cancelled = vi.fn()
  vi.mocked(requestWithDomain).mockResolvedValue(binary(new ReadableStream({ cancel: cancelled })))
  const response = await GET(new Request(url), params), read = response.body!.getReader().read().catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(10_001)
  expect(await Promise.race([read, Promise.resolve("still pending")])).toBeInstanceOf(Error)
  expect(cancelled).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
})
it("closes a stream that exceeds its declared length", async () => {
  const cancelled = vi.fn()
  vi.mocked(requestWithDomain).mockResolvedValue(binary(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])) }, cancel: cancelled }), { "content-length": "2" }))
  const response = await GET(new Request(url), params)
  await expect(response.body!.getReader().read()).rejects.toThrow(); expect(cancelled).toHaveBeenCalledOnce()
})
it("cancels binary IO on caller cancellation without waiting for the deadline", async () => {
  const cancelled = vi.fn(), caller = new AbortController()
  vi.mocked(requestWithDomain).mockResolvedValue(binary(new ReadableStream({ cancel: cancelled })))
  const response = await GET(new Request(url, { signal: caller.signal }), params)
  const read = response.body!.getReader().read().catch((error: unknown) => error)
  caller.abort(new Error("Caller closed"))
  expect(await read).toBeInstanceOf(Error); expect(cancelled).toHaveBeenCalledOnce()
})
it("rejects incomplete bytes instead of ending a valid ZIP download", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(binary(new Uint8Array([1, 2])))
  const response = await GET(new Request(url), params)
  await expect(response.arrayBuffer()).rejects.toThrow("Incomplete")
})
it("forwards an expired qualification as JSON without an attachment", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(JSON.stringify({ error: { code: "Gone", message: "Expired" } }), { status: 410, headers: { "content-type": "application/json; charset=utf-8", "content-length": String(new TextEncoder().encode(JSON.stringify({ error: { code: "Gone", message: "Expired" } })).length), "cache-control": "no-store", "x-request-id": "owner" } }))
  const response = await GET(new Request(url), params)
  expect(response.status).toBe(410); expect(response.headers.has("content-disposition")).toBe(false)
  expect(await response.json()).toEqual({ error: { code: "Gone", message: "Expired" } })
})
it("rejects a ZIP exceeding the owner spool ceiling before streaming bytes", async () => {
  const cancelled = vi.fn()
  vi.mocked(requestWithDomain).mockResolvedValue(binary(new ReadableStream({ cancel: cancelled }), { "content-length": String(1024 * 1024 * 1024 + 1) }))
  expect((await GET(new Request(url), params)).status).toBe(502); expect(cancelled).toHaveBeenCalledOnce()
})
it("rejects a mismatched error status/code instead of forwarding an arbitrary JSON payload", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(JSON.stringify({ error: { code: "skill_deadline_exceeded", message: "Wrong status", retryable: true } }), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner" } }))
  expect((await GET(new Request(url), params)).status).toBe(502)
})

it.each(["bare-extra", "retryability", "attachment-error"])("rejects byte-operation %s instead of borrowing metadata authorization", async variant => {
  const value = variant === "retryability" ? { error: { code: "iam_admission_unavailable", message: "denied", retryable: false } } : { error: { code: "Gone", message: "expired", ...(variant === "bare-extra" ? { retryable: false } : {}) } }
  const body = JSON.stringify(value)
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(body, { status: variant === "retryability" ? 503 : 410, headers: { "content-type": "application/json; charset=utf-8", "content-length": String(new TextEncoder().encode(body).length), "cache-control": "no-store", "x-request-id": "byte-negative", ...(variant === "attachment-error" ? { "content-disposition": "attachment" } : {}) } }))
  expect((await GET(new Request(url), params)).status).toBe(502)
})
it("does not invent byte412 from the Project package precondition contract", async () => {
  const body = JSON.stringify({ error: { code: "skill_package_precondition_failed", message: "pin changed", retryable: false } })
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(body, { status: 412, headers: { "content-type": "application/json; charset=utf-8", "content-length": String(body.length), "cache-control": "no-store", "x-request-id": "not-a-byte-status" } }))
  expect((await GET(new Request(url), params)).status).toBe(502)
})

it.each(["security-header", "utf8-filename", "max-size"])("validates the formal byte success %s independently of metadata", async variant => {
  const upstream = binary()
  if (variant === "security-header") upstream.headers.delete("x-content-type-options")
  if (variant === "utf8-filename") upstream.headers.set("content-disposition", `attachment; filename="skill.zip"; filename*=UTF-8''${encodeURIComponent("é".repeat(128))}`)
  if (variant === "max-size") upstream.headers.set("content-length", "33554433")
  vi.mocked(requestWithDomain).mockResolvedValue(upstream)
  expect((await GET(new Request(url), params)).status).toBe(502)
})
it("preserves a qualified current-admission Retry-After only through the independent byte error schema", async () => {
  const body = JSON.stringify({ error: { code: "session_rate_limited", message: "wait" } })
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(body, { status: 429, headers: { "content-type": "application/json; charset=utf-8", "content-length": String(body.length), "cache-control": "no-store", "x-request-id": "byte-rate", "retry-after": "60" } }))
  const result = await GET(new Request(url), params)
  expect(result.status).toBe(429); expect(result.headers.get("retry-after")).toBe("60")
})
it("does not turn an automatic HEAD alias into the declared GET byte operation", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(binary())
  expect((await GET(new Request(url, { method: "HEAD" }), params)).status).toBe(405)
  expect(requestWithDomain).not.toHaveBeenCalled()
})
