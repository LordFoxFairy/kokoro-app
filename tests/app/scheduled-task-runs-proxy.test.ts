import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/scheduled-task-runs/route"
import { requestWithDomain } from "@/lib/server/upstream-http"
const { session, rp } = vi.hoisted(() => ({ session: vi.fn(), rp: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession: session }))
vi.mock("@/lib/server/oidc-provider", () => ({ oidcRpConfig: rp }))
vi.mock("@/lib/server/upstream-http", async original => ({ ...await original<typeof import("@/lib/server/upstream-http")>(), requestWithDomain: vi.fn() }))
const item = { trigger_kind: "calendar" as const, task_id: "task-A", title: "真实运行", project_ref: "project-A", run_id: "run-A", scheduled_for: "2026-10-21T23:30:00.123456789Z", state: "completed", terminal_event_at: "2026-10-21T23:32:00.456Z" }
let claims: { id: string; subject: string; generation: number; access: string; accessExpiresAt: number; expiresAt: number }
function owner(body: BodyInit = JSON.stringify({ data: { items: [item], next_cursor: null } }), headers?: HeadersInit, status = 200) {
 const outgoing = new Headers(vi.mocked(requestWithDomain).mock.calls.at(-1)?.[2].headers)
 return new Response(body, { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": outgoing.get("x-kokoro-request-id") ?? "request-A", ...Object.fromEntries(new Headers(headers)) } })
}
async function call(path = "/api/scheduled-task-runs?limit=20", options?: RequestInit) {
 const request = new Request(`http://web.test${path}`, { headers: { host: "web.test" }, ...options })
 return (options?.method === "POST" ? POST : GET)(request)
}
beforeEach(() => {
 vi.resetAllMocks()
 for (const [key, value] of Object.entries({ KOKORO_BFF_BASE_URL: "http://bff.test", KOKORO_WEB_ORIGIN: "http://web.test", KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/0", KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_DOMAIN: "product.test", KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-secret" })) vi.stubEnv(key, value)
 rp.mockReturnValue({ tenantId: "tenant-A" })
 claims = { id: "session-A", subject: "owner-A", generation: 1, access: "server-token", accessExpiresAt: Date.now() + 600_000, expiresAt: Date.now() + 900_000 }
 session.mockResolvedValue(claims)
 vi.mocked(requestWithDomain).mockImplementation(async () => owner())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it("I4 route forwards the dedicated GET and preserves the closed run envelope after final admission", async () => {
 const response = await call()
 expect(response.status).toBe(200)
 expect(await response.json()).toEqual({ data: { items: [item], next_cursor: null } })
 expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
 expect(session).toHaveBeenCalledTimes(2)
 expect(requestWithDomain).toHaveBeenCalledTimes(1)
 const [url, domain, init] = vi.mocked(requestWithDomain).mock.calls[0]!
 expect(url).toBe("http://bff.test/v1/scheduled-task-runs?limit=20")
 expect(domain).toBe("product.test")
 expect(init).toMatchObject({ method: "GET", signal: expect.any(AbortSignal), maxResponseBytes: 1_048_576 })
 expect(init.timeoutMs).toBeLessThanOrEqual(10_000)
 expect(new Headers(init.headers).get("authorization")).toBe("Bearer server-token")
 expect(new Headers(init.headers).has("cookie")).toBe(false)
})
it("I4 route rejects POST before admission or owner IO", async () => { expect((await call(undefined, { method: "POST" })).status).toBe(405); expect(session).not.toHaveBeenCalled(); expect(requestWithDomain).not.toHaveBeenCalled() })
it("I4 route rejects cross-origin GET before owner IO", async () => { expect((await call(undefined, { headers: { host: "web.test", origin: "https://evil.test" } })).status).toBe(403); expect(requestWithDomain).not.toHaveBeenCalled() })
it.each(["?limit=01", "?limit=0", "?limit=101", "?limit=20&limit=20", "?task_id=", "?cursor=", "?tenant_id=t", "?task_id=%FF", "?limit", "?", "/", "?unknown=1"])("I4 route strictly rejects raw query/path %s", async suffix => { expect((await call(`/api/scheduled-task-runs${suffix}`)).status).toBe(400); expect(requestWithDomain).not.toHaveBeenCalled() })
it.each(["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"] as const)("I4 strict final %s change discards the page", async field => {
 session.mockResolvedValueOnce({ ...claims }).mockResolvedValueOnce({ ...claims, [field]: typeof claims[field] === "number" ? Number(claims[field]) + 1 : "different" })
 expect((await call()).status).toBe(401)
})
it("I4 strict missing RP tenant configuration fails closed before owner IO", async () => { rp.mockReturnValue(null); expect((await call()).status).toBe(503); expect(requestWithDomain).not.toHaveBeenCalled() })
it.each(["cache-control", "content-type", "x-request-id", "set-cookie", "location", "content-encoding", "transfer-encoding"])("I4 strict unsafe owner header %s is rejected", async key => {
 vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(undefined, { [key]: "bad" }))
 expect((await call()).status).toBe(502)
})
it.each(["{\"data\":{\"items\":[],\"next_cursor\":null},\"data\":{\"items\":[],\"next_cursor\":null}}", "\ufeff{}", "{}", JSON.stringify({ data: { items: [{ ...item, summary: "not allowed" }], next_cursor: null } }), JSON.stringify({ data: { items: [{ ...item, state: "running" }], next_cursor: null } })])("I4 strict invalid raw page is rejected %j", async raw => {
 vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(raw)); expect((await call()).status).toBe(502)
})
it("I4 strict request body EOF is actually read and nonempty input is rejected", async () => {
 const request = new Request("http://web.test/api/scheduled-task-runs", { headers: { host: "web.test" } })
 Object.defineProperty(request, "body", { value: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close() } }) })
 expect((await GET(request)).status).toBe(400)
 expect(session).not.toHaveBeenCalled()
})
it.each(["request-body", "initial-session", "upstream", "response-body", "final-session"])("I4 strict ten-second total budget bounds noncooperative %s", async phase => {
 vi.useFakeTimers()
 const never = new Promise<never>(() => undefined), cancel = vi.fn(() => never)
 if (phase === "initial-session") session.mockReturnValueOnce(never)
 if (phase === "upstream") vi.mocked(requestWithDomain).mockReturnValueOnce(never)
 if (phase === "response-body") vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify({ data: { items: [], next_cursor: null } }))) }, cancel })))
 if (phase === "final-session") session.mockResolvedValueOnce(claims).mockReturnValueOnce(never)
 const request = new Request("http://web.test/api/scheduled-task-runs", { headers: { host: "web.test" } })
 if (phase === "request-body") Object.defineProperty(request, "body", { value: new ReadableStream({ pull() { return never }, cancel }) })
 const pending = GET(request)
 await vi.advanceTimersByTimeAsync(10_001)
 expect((await pending).status).toBe(504)
 if (phase === "request-body" || phase === "response-body") expect(cancel).toHaveBeenCalledTimes(1)
})
it("I4 strict abort owns a noncooperative fetch and late response cleanup", async () => {
 let resolve!: (response: Response) => void
 vi.mocked(requestWithDomain).mockReturnValueOnce(new Promise(accept => { resolve = accept }))
 const controller = new AbortController(), pending = call(undefined, { signal: controller.signal })
 await vi.waitFor(() => expect(requestWithDomain).toHaveBeenCalledTimes(1)); controller.abort()
 expect((await pending).status).toBe(499)
 const cancelled = vi.fn(), late = owner(new ReadableStream({ cancel: cancelled })); resolve(late)
 await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1))
 expect(session).toHaveBeenCalledTimes(1)
})

it("I4 actual NextRequest internal hostname uses the canonical protocol and Host boundary", async () => {
 const { NextRequest } = await import("next/server")
 const response = await GET(new NextRequest("http://localhost:3314/api/scheduled-task-runs?limit=20", { headers: { host: "web.test", origin: "http://web.test" } }))
 expect(response.status).toBe(200)
 expect(response.headers.has("transfer-encoding")).toBe(false)
 const bytes = new Uint8Array(await response.arrayBuffer())
 expect(response.headers.get("content-length")).toBe(String(bytes.byteLength))
 expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({ data: { items: [item], next_cursor: null } })
})
it.each(["host", "protocol"])("I4 canonical %s mismatch remains forbidden", async mismatch => {
 const response = await GET(new Request(`${mismatch === "protocol" ? "https" : "http"}://internal.test/api/scheduled-task-runs`, { headers: { host: mismatch === "host" ? "evil.test" : "web.test" } }))
 expect(response.status).toBe(403)
 expect(session).not.toHaveBeenCalled()
 expect(requestWithDomain).not.toHaveBeenCalled()
 expect(response.headers.get("content-length")).toBe(String((await response.arrayBuffer()).byteLength))
})
it("I4 rejected method advertises GET and exact local response framing", async () => {
 const response = await call(undefined, { method: "POST" })
 expect(response.status).toBe(405)
 expect(response.headers.get("allow")).toBe("GET")
 expect(response.headers.get("content-length")).toBe(String((await response.arrayBuffer()).byteLength))
})
it("I4 accepted owner errors also have exact final framing", async () => {
 vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(JSON.stringify({ error: { code: "scheduled_task_not_found", message: "private owner detail", retryable: false } }), undefined, 404))
 const response = await call()
 expect(response.status).toBe(404)
 const bytes = await response.arrayBuffer()
 expect(response.headers.get("content-length")).toBe(String(bytes.byteLength))
 expect(new TextDecoder().decode(bytes)).not.toContain("private owner detail")
})

it("I6 route keeps RSS discovery metadata and never invents a scheduled occurrence", async () => {
 const rss = { ...item, trigger_kind: "rss", scheduled_for: null, observed_at: "2026-10-23T02:03:04.123456Z" }
 vi.mocked(requestWithDomain).mockImplementationOnce(async () => owner(JSON.stringify({ data: { items: [rss], next_cursor: null } })))
 const response = await call()
 expect(response.status).toBe(200)
 expect(await response.json()).toEqual({ data: { items: [rss], next_cursor: null } })
 expect(session).toHaveBeenCalledTimes(2)
 expect(requestWithDomain).toHaveBeenCalledTimes(1)
})
