import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const { session, upstream } = vi.hoisted(() => ({ session: vi.fn(), upstream: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession: session }))
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain: upstream }))
import { accountSessions } from "@/lib/server/account-sessions"
import * as listRoute from "@/app/api/account/sessions/route"
import * as revokeRoute from "@/app/api/account/sessions/[sessionId]/route"
const sid = { session_id: "current", created_at: "2026-10-14T00:00:00.000Z", expires_at: "2026-10-15T00:00:00.000Z" }
const claims = { id: "opaque", generation: 3, subject: "alice", access: "private-access", accessExpiresAt: Date.now() + 100000, expiresAt: Date.now() + 200000 }
const request = (path = "/api/account/sessions", init: RequestInit = {}) => new Request(`https://internal.test${path}`, { ...init, headers: { host: "web.test", ...init.headers } })
const reply = (options: { status?: number; transform?: (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => unknown; headers?: Record<string, string> } = {}) => {
  upstream.mockImplementation(async (_: string, _domain: string, init: { headers: Headers }) => {
    const id = init.headers.get("x-kokoro-request-id")!
    const raw = { data: { current_session: sid, sessions: [{ ...sid, session_id: "other" }] }, meta: { request_id: id, next_cursor: null } }
    return Response.json(options.transform?.(raw) ?? raw, { status: options.status ?? 200, headers: { "x-request-id": id, "cache-control": "no-store", ...options.headers } })
  })
}
beforeEach(() => {
  vi.stubEnv("KOKORO_BFF_BASE_URL", "https://bff.test"); vi.stubEnv("KOKORO_DOMAIN", "web.test"); vi.stubEnv("KOKORO_WEB_REDIS_URL", "redis://fixture"); vi.stubEnv("KOKORO_WEB_ORIGIN", "https://web.test"); vi.stubEnv("KOKORO_WEB_AUTH_SECRET", "a".repeat(32)); vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture-secret")
  session.mockReset().mockResolvedValue(claims); upstream.mockReset(); reply()
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
describe("account session same-origin adapter", () => {
  it("reads a bound owner page with one Bearer and repeats the final session check", async () => {
    const response = await listRoute.GET(request("/api/account/sessions?limit=10&cursor=opaque"))
    expect(response.status).toBe(200); expect(session).toHaveBeenCalledTimes(2)
    const [, domain, init] = upstream.mock.calls[0]!
    expect(domain).toBe("web.test"); expect(init.headers.get("authorization")).toBe("Bearer private-access")
    expect(init.headers.get("cookie")).toBeNull(); expect(upstream.mock.calls[0]![0]).toBe("https://bff.test/v1/account/sessions?limit=10&cursor=opaque")
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect((await response.json()).meta.request_id).toBe(response.headers.get("x-request-id"))
  })
  it.each(["?limit=0", "?limit=101", "?limit=01", "?limit=1&limit=2", "?subject=alice", "?cursor="])("rejects %s without owner I/O", async (query) => {
    expect((await accountSessions(request("/api/account/sessions" + query))).status).toBe(400); expect(upstream).not.toHaveBeenCalled()
  })
  it.each([{ host: "evil.test" }, { origin: "https://evil.test" }, { host: "web.test:443" }])("checks canonical authority %j", async (headers) => {
    expect((await accountSessions(request(undefined, { headers }))).status).toBe(403); expect(upstream).not.toHaveBeenCalled()
  })
  it("requires canonical DELETE Origin and never forwards a body or receipt", async () => {
    expect((await accountSessions(request("/api/account/sessions/other", { method: "DELETE" }), "other")).status).toBe(403)
    expect((await accountSessions(request("/api/account/sessions/other", { method: "DELETE", headers: { origin: "https://web.test", "idempotency-key": "x" } }), "other")).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })
  it("binds a DELETE ACK, rejects wrong ACK and writes only once", async () => {
    reply({ transform: (raw) => ({ data: { session_id: "other", revoked: true }, meta: { request_id: raw.meta.request_id } }) })
    const r = request("/api/account/sessions/other", { method: "DELETE", headers: { origin: "https://web.test" } })
    expect((await revokeRoute.DELETE(r, { params: Promise.resolve({ sessionId: "other" }) })).status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(1)
    reply({ transform: (raw) => ({ data: { session_id: "wrong", revoked: true }, meta: { request_id: raw.meta.request_id } }) })
    expect((await accountSessions(r, "other")).status).toBe(502)
  })
  it.each([undefined, "0"])("accepts an EOF-only DELETE stream with content-length %s", async (length) => {
    reply({ transform: (raw) => ({ data: { session_id: "other", revoked: true }, meta: { request_id: raw.meta.request_id } }) })
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.close() } })
    const init: RequestInit & { duplex: "half" } = { method: "DELETE", body, duplex: "half", headers: { origin: "https://web.test", ...(length === undefined ? {} : { "content-length": length }) } }
    const response = await revokeRoute.DELETE(request("/api/account/sessions/other", init), { params: Promise.resolve({ sessionId: "other" }) })
    expect(response.status).toBe(200); expect(upstream).toHaveBeenCalledOnce()
    expect(upstream.mock.calls[0]![2].body).toBeUndefined(); expect(body.locked).toBe(false)
  })
  it("rejects actual DELETE bytes even when content-length claims zero", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close() } })
    const init: RequestInit & { duplex: "half" } = { method: "DELETE", body, duplex: "half", headers: { origin: "https://web.test", "content-length": "0" } }
    expect((await accountSessions(request("/api/account/sessions/other", init), "other")).status).toBe(400)
    expect(session).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled(); expect(body.locked).toBe(false)
  })
  it("bounds a hanging incoming DELETE stream and releases its reader before any owner I/O", async () => {
    vi.useFakeTimers(); const cancel = vi.fn(() => new Promise<void>(() => {}))
    const body = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel })
    const init: RequestInit & { duplex: "half" } = { method: "DELETE", body, duplex: "half", headers: { origin: "https://web.test" } }
    const result = accountSessions(request("/api/account/sessions/other", init), "other")
    await vi.advanceTimersByTimeAsync(10000); expect((await result).status).toBe(503)
    expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false); expect(session).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled()
  })
  it.each(["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"])("rejects final changed %s even under the same session", async (field) => {
    session.mockResolvedValueOnce(claims).mockResolvedValueOnce({ ...claims, [field]: typeof claims[field as keyof typeof claims] === "number" ? 9 : "changed" })
    expect((await accountSessions(request())).status).toBe(401)
  })
  it("rejects anonymous/expired sessions and storage failure without owner access", async () => {
    session.mockResolvedValueOnce(null); expect((await accountSessions(request())).status).toBe(401)
    session.mockResolvedValueOnce({ ...claims, expiresAt: 1 }); expect((await accountSessions(request())).status).toBe(401)
    session.mockRejectedValueOnce(new Error("private storage URL")); const response = await accountSessions(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private storage")
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each([
    (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => ({ ...raw, token: "secret" }),
    (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => ({ ...raw, data: { ...raw.data, current_session: { ...sid, token: "secret" } } }),
    (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => ({ ...raw, data: { ...raw.data, sessions: [sid] } }),
    (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => ({ ...raw, data: { ...raw.data, sessions: [raw.data.sessions[0], raw.data.sessions[0]] } }),
    (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => ({ ...raw, meta: { ...raw.meta, request_id: "wrong" } }),
    (raw: { data: { current_session: typeof sid; sessions: (typeof sid)[] }; meta: { request_id: string; next_cursor: null } }) => ({ ...raw, data: { ...raw.data, current_session: { ...sid, created_at: "2026-10-14T00:00:00Z" } } }),
  ])("rejects malformed raw wire before any stripping", async (transform) => {
    reply({ transform }); expect((await accountSessions(request())).status).toBe(502)
  })
  it.each([409, 404, 403, 429])("preserves admitted closed owner error %s but strips its private message", async (status) => {
    const code = { 409: "account_session_conflict", 404: "account_session_not_found", 403: "session_forbidden", 429: "account_session_rate_limited" }[status]!
    reply({ status, transform: (raw) => ({ error: { code, message: "private-owner-detail" }, meta: { request_id: raw.meta.request_id } }) })
    const r = await accountSessions(request()); expect(r.status).toBe(status); expect(await r.text()).not.toContain("private-owner-detail")
  })
  it("has one absolute 10s deadline covering a noncooperating initial and final identity read", async () => {
    vi.useFakeTimers(); session.mockReturnValueOnce(new Promise(() => {}))
    let result = accountSessions(request()); await vi.advanceTimersByTimeAsync(10000); expect((await result).status).toBe(503)
    session.mockResolvedValueOnce(claims).mockReturnValueOnce(new Promise(() => {}))
    result = accountSessions(request()); await vi.advanceTimersByTimeAsync(10000); expect((await result).status).toBe(503)
  })
  it("bounded route params cannot bypass the same absolute deadline", async () => {
    vi.useFakeTimers(); const result = revokeRoute.DELETE(request("/api/account/sessions/other", { method: "DELETE", headers: { origin: "https://web.test" } }), { params: new Promise(() => {}) })
    await vi.advanceTimersByTimeAsync(10000); expect((await result).status).toBe(503); expect(upstream).not.toHaveBeenCalled()
  })
  it("cancels a hanging body even when reader.cancel never settles", async () => {
    vi.useFakeTimers(); let body!: ReadableStream<Uint8Array>; const cancel = vi.fn(() => new Promise<void>(() => {}))
    upstream.mockImplementation(async (_: string, _d: string, init: { headers: Headers }) => { body = new ReadableStream({ pull: () => new Promise(() => {}), cancel }); return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": init.headers.get("x-kokoro-request-id")! } }) })
    const result = accountSessions(request()); await vi.advanceTimersByTimeAsync(10000); expect((await result).status).toBe(503); expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false)
  })
  it("explicit route methods are 405 with Allow and no owner I/O", async () => {
    expect(listRoute.POST().headers.get("allow")).toBe("GET"); expect(revokeRoute.GET().status).toBe(405); expect(upstream).not.toHaveBeenCalled()
  })
  it.each([
    { "x-request-id": "wrong" }, { "cache-control": "private" }, { "content-type": "text/plain" },
    { location: "https://evil.test" }, { "set-cookie": "secret-cookie" }, { "retry-after": "86401" },
  ])("rejects unbound or unsafe headers %j", async (headers) => {
    reply({ headers }); expect((await accountSessions(request())).status).toBe(502)
  })
  it("rejects status/code mismatches and total response bytes", async () => {
    reply({ status: 403, transform: (raw) => ({ error: { code: "account_session_conflict", message: "safe" }, meta: { request_id: raw.meta.request_id } }) })
    expect((await accountSessions(request())).status).toBe(502)
    reply({ transform: (raw) => ({ ...raw, overflow: "x".repeat(1_048_576) }) })
    expect((await accountSessions(request())).status).toBe(502)
  })
  it("aborts noncooperating owner fetch, cancels its late body and never retries DELETE", async () => {
    vi.useFakeTimers(); let resolve!: (r: Response) => void
    upstream.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r }))
    const result = accountSessions(request("/api/account/sessions/other", { method: "DELETE", headers: { origin: "https://web.test" } }), "other")
    await vi.advanceTimersByTimeAsync(10000); expect((await result).status).toBe(503)
    expect(upstream).toHaveBeenCalledOnce(); expect(upstream.mock.calls[0]![2].signal.aborted).toBe(true)
    const cancel = vi.fn(); resolve(new Response(new ReadableStream({ cancel })))
    await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalled()
  })
  it("caller abort bounds a noncooperating identity read", async () => {
    session.mockReturnValueOnce(new Promise(() => {})); const control = new AbortController()
    const result = accountSessions(request(undefined, { signal: control.signal })); control.abort()
    expect((await result).status).toBe(503); expect(upstream).not.toHaveBeenCalled()
  })

})
