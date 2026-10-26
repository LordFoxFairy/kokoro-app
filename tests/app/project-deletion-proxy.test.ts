import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DELETE, GET, POST } from "@/app/api/hub/[...path]/route"
import { requestWithDomain } from "@/lib/server/upstream-http"

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/upstream-http")>(),
  requestWithDomain: vi.fn(),
}))
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))

const id = "project_12345678-1234-1234-1234-123456789abc"
const otherId = "project_abcdef12-1234-1234-1234-123456789abc"
const key = "project-delete:one-intent"
const base = `/api/hub/projects/${id}`
const accepted = { data: { project_id: id, logical_release_state: "pending", physical_cleanup_state: "pending" } }
type Claims = Readonly<{ id: string; generation: number; subject: string; access: string; accessExpiresAt: number; expiresAt: number }>
let claims: Claims

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}
function request(method = "DELETE", path = base, body?: BodyInit, signal?: AbortSignal) {
  return new Request(`http://web.test${path}`, {
    method, headers: { host: "web.test", ...(method === "GET" ? {} : { origin: "http://web.test", "idempotency-key": key }) },
    ...(body === undefined ? {} : { body, duplex: "half" }), ...(signal === undefined ? {} : { signal }),
  } as RequestInit)
}
function call(input: Request, path = ["projects", id], pending?: Promise<{ path: string[] }>) {
  const handler = input.method === "GET" ? GET : input.method === "POST" ? POST : DELETE
  return handler(input, { params: pending ?? Promise.resolve({ path }) })
}
function owner(raw: unknown = accepted, status = 202, headers?: HeadersInit) {
  const options = vi.mocked(requestWithDomain).mock.calls.at(-1)?.[2]
  const outgoing = new Headers(options?.headers)
  return Response.json(raw, { status, headers: {
    "cache-control": "no-store", "x-request-id": outgoing.get("x-kokoro-request-id") ?? "missing-outgoing-request-id",
    ...(status === 202 ? { location: `/v1/projects/${id}/deletion` } : {}), ...Object.fromEntries(new Headers(headers)),
  } })
}
function error(code: string, retryable = false) { return { error: { code, message: code, retryable } } }
function assertPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/u)
  expect(response.headers.has("x-request-id")).toBe(true)
  expect(response.headers.get("x-request-id") ?? "").toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
  expect(response.headers.has("set-cookie")).toBe(false)
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const [name, value] of Object.entries({
    KOKORO_BFF_BASE_URL: "http://bff.test", KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/0", KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
    KOKORO_DOMAIN: "product.test", KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-internal-secret",
  })) vi.stubEnv(name, value)
  claims = { id: "opaque-session", generation: 3, subject: "alice", access: "server-only-access", accessExpiresAt: Date.now() + 600_000, expiresAt: Date.now() + 900_000 }
  currentProductSession.mockResolvedValue(claims)
  vi.mocked(requestWithDomain).mockImplementation(async (_url, _domain, options) => owner(accepted, options.method === "DELETE" ? 202 : 200))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe("F1 actual Hub project deletion semantics (not missing-module RED)", () => {
  it("forwards exactly one bodyless DELETE and preserves matching 202 Location/request-id after two complete session reads", async () => {
    const input = request()
    input.headers.set("authorization", "Bearer browser-forged")
    input.headers.set("cookie", "session=browser-private")
    input.headers.set("x-kokoro-user-id", "forged")
    const response = await call(input)
    expect(response.status).toBe(202)
    assertPrivate(response)
    expect(response.headers.get("location")).toBe(`/v1/projects/${id}/deletion`)
    expect(await response.json()).toEqual(accepted)
    expect(currentProductSession).toHaveBeenCalledTimes(2)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
    const [url, domain, options] = vi.mocked(requestWithDomain).mock.calls[0]!
    expect(url).toBe(`http://bff.test/v1/projects/${id}`)
    expect(domain).toBe("product.test")
    expect(options.method).toBe("DELETE")
    expect(options.body).toBeUndefined()
    expect(options.strictResponseLength).not.toBe(true)
    expect(options.timeoutMs).toBeGreaterThan(0)
    expect(options.timeoutMs).toBeLessThanOrEqual(10_000)
    const headers = new Headers(options.headers)
    expect(headers.get("idempotency-key")).toBe(key)
    expect(headers.get("authorization")).toBe("Bearer server-only-access")
    expect(headers.get("cookie")).toBeNull()
    expect(headers.get("x-kokoro-user-id")).toBeNull()
    expect(response.headers.get("x-request-id")).toBe(headers.get("x-kokoro-request-id"))
  })

  it.each(["pending", "blocked", "released"])("reads current logical %s with physical cleanup still pending, no key or Location and no required Content-Length", async (state) => {
    const raw = { data: { ...accepted.data, logical_release_state: state } }
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(raw, 200))
    const response = await call(request("GET", `${base}/deletion`), ["projects", id, "deletion"])
    expect(response.status).toBe(200)
    assertPrivate(response)
    expect(response.headers.has("location")).toBe(false)
    expect(await response.json()).toEqual(raw)
    expect(currentProductSession).toHaveBeenCalledTimes(2)
    const [url, , options] = vi.mocked(requestWithDomain).mock.calls[0]!
    expect(url).toBe(`http://bff.test/v1/projects/${id}/deletion`)
    expect(options.body).toBeUndefined()
    expect(new Headers(options.headers).has("idempotency-key")).toBe(false)
    expect(options.strictResponseLength).not.toBe(true)
  })

  it.each([
    [`/api/hub/self/projects/${id}`, ["self", "projects", id]],
    [`/api/hub/projects/%70${id.slice(1)}`, ["projects", id]],
    ["/api/hub/projects/my-project", ["projects", "my-project"]],
    [`${base}/`, ["projects", id]], [`${base}?`, ["projects", id]],
    [`${base}?force=true`, ["projects", id]], [`${base}`, ["projects", otherId]],
  ] as const)("rejects raw/decoded candidate %s instead of falling through generic forwarding", async (path, segments) => {
    expect((await call(request("DELETE", path), [...segments])).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each([
    [`/api/hub/self/projects/${id}/deletion`, ["self", "projects", id, "deletion"]],
    [`${base}/%64eletion`, ["projects", id, "deletion"]],
    [`${base}/deletion/`, ["projects", id, "deletion"]],
    [`${base}/deletion?`, ["projects", id, "deletion"]],
  ] as const)("strictly rejects status-read candidate %s", async (path, segments) => {
    expect((await call(request("GET", path), [...segments])).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("rejects a wrong operation/method combination without touching owner", async () => {
    expect((await call(request("POST", `${base}/deletion`), ["projects", id, "deletion"])).status).toBe(405)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each(["", "bad,key", "two keys", "x".repeat(129), "é"])("refuses invalid key %j before owner IO", async (value) => {
    const input = request()
    input.headers.set("idempotency-key", value)
    expect((await call(input)).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("rejects absent/merged keys and any GET key", async () => {
    const missing = request(); missing.headers.delete("idempotency-key")
    expect((await call(missing)).status).toBe(400)
    const duplicate = request(); duplicate.headers.append("idempotency-key", "second")
    expect((await call(duplicate)).status).toBe(400)
    const read = request("GET", `${base}/deletion`); read.headers.set("idempotency-key", key)
    expect((await call(read, ["projects", id, "deletion"])).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each([" ", "{}", "\u0000"])("consumes actual DELETE bytes through EOF and rejects %j", async (body) => {
    expect((await call(request("DELETE", base, body))).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each([
    { "content-encoding": "gzip" }, { "transfer-encoding": "gzip, chunked" },
    { "transfer-encoding": "chunked", "content-length": "0" }, { "content-length": "1" },
  ])("rejects unsupported input framing %j", async (framing) => {
    const input = request(); for (const [name, value] of Object.entries(framing)) input.headers.set(name, value!)
    expect((await call(input)).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each(["missing", "null", "http://evil.test", "https://web.test"])("requires exact DELETE Origin (%s)", async (origin) => {
    const input = request(); if (origin === "missing") input.headers.delete("origin"); else input.headers.set("origin", origin)
    expect((await call(input)).status).toBe(403)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  const invalidReceipts = [
    { ...accepted, meta: { request_id: "not-allowed" } },
    { data: { ...accepted.data, project_id: otherId } },
    { data: { ...accepted.data, logical_release_state: "released" } },
    { data: { ...accepted.data, physical_cleanup_state: "released" } },
    { data: { ...accepted.data, extra: true } },
  ]
  it.each(invalidReceipts)("rejects invalid 202 receipt %#", async (raw) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(raw))
    expect((await call(request())).status).toBe(502)
  })
  it.each([
    { location: `/v1/projects/${otherId}/deletion` }, { location: "https://evil.test/status" },
    { "x-request-id": "wrong-owner-echo" }, { "cache-control": "private, no-store" },
    { "cache-control": "private, no-store, max-age=0" },
    { "set-cookie": "must-not-leak=1" }, { "content-type": "text/plain" },
  ])("rejects invalid owner headers %j", async (headers) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(accepted, 202, headers))
    expect((await call(request())).status).toBe(502)
  })
  it("requires Location on 202 and forbids it on GET 200", async () => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => { const r = owner(); r.headers.delete("location"); return r })
    expect((await call(request())).status).toBe(502)
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(accepted, 200, { location: `/v1/projects/${id}/deletion` }))
    expect((await call(request("GET", `${base}/deletion`), ["projects", id, "deletion"])).status).toBe(502)
  })
  it.each(["\uFEFF" + JSON.stringify(accepted), `{"data":${JSON.stringify(accepted.data)},"data":${JSON.stringify(accepted.data)}}`, "{broken"])("rejects raw JSON evidence %#", async (body) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => new Response(body, { status: 202, headers: owner().headers }))
    expect((await call(request())).status).toBe(502)
  })
  it("uses fatal UTF-8 and bounded raw bytes before returning a receipt", async () => {
    for (const body of [new Uint8Array([0xff]), new TextEncoder().encode(" ".repeat(1_048_577))]) {
      vi.mocked(requestWithDomain).mockImplementationOnce(async () => new Response(body, { status: 202, headers: owner().headers }))
      expect((await call(request())).status).toBe(502)
    }
  })
  it.each([
    ["DELETE", 409, "idempotency_in_progress", true], ["DELETE", 409, "idempotency_conflict", false],
    ["GET", 404, "project_not_found", false], ["GET", 503, "business_store_unavailable", true],
  ] as const)("preserves allowed %s %i %s only after final session validation", async (method, status, code, retryable) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(error(code, retryable), status))
    const response = await call(request(method, method === "GET" ? `${base}/deletion` : base), method === "GET" ? ["projects", id, "deletion"] : ["projects", id])
    expect(response.status).toBe(status)
    assertPrivate(response)
    expect(await response.json()).toEqual(error(code, retryable))
    expect(currentProductSession).toHaveBeenCalledTimes(2)
  })
  it.each([
    ["GET", 409, "idempotency_in_progress", true], ["GET", 400, "idempotency_key_required", false],
    ["GET", 400, "invalid_idempotency_key", false], ["DELETE", 409, "idempotency_in_progress", false],
    ["DELETE", 409, "idempotency_conflict", true], ["GET", 404, "project_not_found", true],
    ["DELETE", 200, "project_not_found", false],
  ] as const)("rejects closed error/status/retry tuple %s %i %s %s", async (method, status, code, retryable) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(error(code, retryable), status))
    expect((await call(request(method, method === "GET" ? `${base}/deletion` : base), method === "GET" ? ["projects", id, "deletion"] : ["projects", id])).status).toBe(502)
  })
  it.each([undefined, "1", "86400"])("accepts optional bounded 429 Retry-After %s", async (retry) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(error("session_rate_limited", true), 429, retry === undefined ? {} : { "retry-after": retry }))
    const response = await call(request())
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe(retry ?? null)
    expect(currentProductSession).toHaveBeenCalledTimes(2)
  })
  it.each(["0", "86401", "1, 2", "1.0"])("rejects invalid Retry-After %s", async (retry) => {
    vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(error("session_rate_limited", true), 429, { "retry-after": retry }))
    expect((await call(request())).status).toBe(502)
  })

  it.each(["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"] as const)("retires both accepted and allowed-error responses after session %s changes", async (field) => {
    for (const rejected of [false, true]) {
      currentProductSession.mockReset().mockResolvedValueOnce(claims).mockResolvedValueOnce({ ...claims, [field]: typeof claims[field] === "number" ? claims[field] + 1 : `${claims[field]}-changed` })
      vi.mocked(requestWithDomain).mockImplementationOnce(async () => rejected ? owner(error("project_not_found"), 404) : owner())
      expect((await call(request())).status).toBe(401)
    }
  })
  it.each(["accessExpiresAt", "expiresAt"] as const)("refuses expired initial %s before owner IO", async (field) => {
    currentProductSession.mockResolvedValue({ ...claims, [field]: Date.now() - 1 })
    expect((await call(request())).status).toBe(401)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("budgets unresolved params from entry, then retires late params without owner IO", async () => {
    vi.useFakeTimers()
    const params = deferred<{ path: string[] }>()
    let response: Response | undefined
    const operation = call(request(), ["projects", id], params.promise).then((value) => { response = value; return value })
    try {
      await vi.advanceTimersByTimeAsync(10_001)
      expect(response?.status).toBe(504)
    } finally { params.resolve({ path: ["projects", id] }); await operation }
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("waits for actual DELETE EOF and does not let an uncooperative cancel extend its total deadline", async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const body = new ReadableStream<Uint8Array>({ cancel })
    let response: Response | undefined
    const operation = call(request("DELETE", base, body)).then((value) => { response = value; return value })
    await vi.advanceTimersByTimeAsync(10_001)
    expect(response?.status).toBe(504)
    await operation
    expect(cancel).toHaveBeenCalled()
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("uses one 10s budget across params, admission, owner headers and complete owner EOF", async () => {
    vi.useFakeTimers()
    const params = deferred<{ path: string[] }>(), session = deferred<Claims>(), responseHeaders = deferred<Response>()
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    currentProductSession.mockReturnValueOnce(session.promise).mockResolvedValue(claims)
    vi.mocked(requestWithDomain).mockReturnValueOnce(responseHeaders.promise)
    let response: Response | undefined
    const operation = call(request(), ["projects", id], params.promise).then((value) => { response = value; return value })
    try {
      await vi.advanceTimersByTimeAsync(3000); params.resolve({ path: ["projects", id] })
      await vi.advanceTimersByTimeAsync(3000); session.resolve(claims)
      await vi.advanceTimersByTimeAsync(3000)
      responseHeaders.resolve(new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; controller.enqueue(new TextEncoder().encode(JSON.stringify(accepted))) }, cancel }), { status: 202, headers: owner().headers }))
      await vi.advanceTimersByTimeAsync(1001)
      expect(response?.status).toBe(504)
      expect(cancel).toHaveBeenCalled()
    } finally { try { stream?.close() } catch {} await operation }
  })
  it("bounds a hanging final session check even after a valid full owner body", async () => {
    vi.useFakeTimers()
    const final = deferred<Claims>()
    currentProductSession.mockResolvedValueOnce(claims).mockReturnValueOnce(final.promise)
    let response: Response | undefined
    const operation = call(request()).then((value) => { response = value; return value })
    try { await vi.advanceTimersByTimeAsync(10_001); expect(response?.status).toBe(504) }
    finally { final.resolve(claims); await operation }
  })
  it("aborts promptly and cancels a late upstream stream without a late final session read", async () => {
    vi.useFakeTimers()
    const late = deferred<Response>(), started = deferred<void>(), controller = new AbortController()
    vi.mocked(requestWithDomain).mockImplementationOnce(() => { started.resolve(); return late.promise })
    let response: Response | undefined
    const operation = call(request("DELETE", base, undefined, controller.signal)).then((value) => { response = value; return value })
    await started.promise; controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    try { expect(response?.status).toBe(499) }
    finally { late.resolve(new Response(new ReadableStream({ cancel }), { status: 202, headers: owner().headers })); await operation }
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalled()
    expect(currentProductSession).toHaveBeenCalledTimes(1)
  })
})
