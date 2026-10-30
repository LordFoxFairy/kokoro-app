import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/hub/[...path]/route"
import { requestWithDomain } from "@/lib/server/upstream-http"
const session = vi.hoisted(() => vi.fn())
vi.mock("@/lib/server/product-session", () => ({ currentProductSession: session }))
vi.mock("@/lib/server/upstream-http", async original => ({ ...(await original<typeof import("@/lib/server/upstream-http")>()), requestWithDomain: vi.fn() }))
const project = "project_00000000-0000-4000-8000-000000000001", installation = "installation-exact"
const prefix = `projects/${project}/skill-installations/${installation}`
const directory = { source_ref: "skill:revision-exact", revision: "17", files: [], selected_file: null }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-request-id": "project-exact-read" } })
const params = (suffix: string) => ({ params: Promise.resolve({ path: [...prefix.split("/"), suffix] }) })
beforeEach(() => {
  for (const [key, value] of Object.entries({ KOKORO_WEB_AUTH_SECRET: "a".repeat(32), KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9", KOKORO_WEB_ORIGIN: "http://localhost", KOKORO_DOMAIN: "dev.kokoro.localhost", KOKORO_BFF_BASE_URL: "http://bff.test", KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret" })) vi.stubEnv(key, value)
  session.mockReset(); session.mockResolvedValue({ access: "product-access", accessExpiresAt: Date.now() + 60_000 }); vi.mocked(requestWithDomain).mockReset()
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
it("dispatches Project exact content before the personal package catchall and preserves the Project target", async () => {
  vi.mocked(requestWithDomain).mockResolvedValue(reply({ data: directory }))
  const response = await GET(new Request(`http://localhost/api/hub/${prefix}/package`), params("package"))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ data: directory })
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(`http://bff.test/v1/${prefix}/package`)
})
it("Project download qualification is zero-body and uses only the official Project private operation", async () => {
  const data = { source_ref: "skill:revision-exact", revision: "17", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "exact.zip", expires_at: "2999-01-01T00:00:00Z" } }
  vi.mocked(requestWithDomain).mockResolvedValue(reply({ data }))
  const response = await POST(new Request(`http://localhost/api/hub/${prefix}/download`, { method: "POST", headers: { origin: "http://localhost" } }), params("download"))
  expect(response.status).toBe(200)
  expect(vi.mocked(requestWithDomain).mock.calls[0]?.[0]).toBe(`http://bff.test/browser/v1/${prefix}/download`)
})

it.each(["query", "duplicate", "key", "length", "encoding", "traversal"])("rejects Project content %s framing before owner I/O", async variant => {
  const query = variant === "query" ? "?other=1" : variant === "duplicate" ? "?file_path=A&file_path=A" : variant === "traversal" ? "?file_path=../secret" : ""
  const headers = variant === "key" ? { "idempotency-key": "forbidden" } : variant === "length" ? { "content-length": "0" } : variant === "encoding" ? { "transfer-encoding": "chunked" } : undefined
  const response = await GET(new Request(`http://localhost/api/hub/${prefix}/package${query}`, headers === undefined ? {} : { headers }), params("package"))
  expect(response.status).toBe(400); expect(requestWithDomain).not.toHaveBeenCalled()
})
it("rejects a nonempty Project download qualification without forwarding it as a command", async () => {
  const response = await POST(new Request(`http://localhost/api/hub/${prefix}/download`, { method: "POST", body: "unexpected", headers: { origin: "http://localhost" } }), params("download"))
  expect(response.status).toBe(400); expect(requestWithDomain).not.toHaveBeenCalled()
})
it.each(["extra", "foreign-path", "length", "redirect", "forged-error"])("fails closed on Project content %s wire rather than falling back", async variant => {
  const body = variant === "extra" ? { data: { ...directory, extra: true } } : variant === "foreign-path" ? { data: { ...directory, files: [{ path: "other.md", size_bytes: "1" }], selected_file: { path: "other.md", text: "x" } } } : variant === "forged-error" ? { error: { code: "skill_package_precondition_failed", message: "wrong retryability", retryable: true } } : { data: directory }
  const upstream = reply(body, variant === "redirect" ? 302 : variant === "forged-error" ? 412 : 200)
  if (variant === "length") upstream.headers.set("content-length", "1")
  vi.mocked(requestWithDomain).mockResolvedValue(upstream)
  const response = await GET(new Request(`http://localhost/api/hub/${prefix}/package${variant === "foreign-path" ? "?file_path=SKILL.md" : ""}`), params("package"))
  expect(response.status).toBe(502); expect(requestWithDomain).toHaveBeenCalledOnce()
})
it("preserves only the exact official Project package negative ACK while download does not invent412", async () => {
  const error = { error: { code: "skill_package_precondition_failed", message: "pin changed", retryable: false } }
  vi.mocked(requestWithDomain).mockResolvedValue(reply(error, 412))
  const response = await GET(new Request(`http://localhost/api/hub/${prefix}/package`), params("package"))
  expect(response.status).toBe(412); expect(await response.json()).toEqual(error)
  vi.mocked(requestWithDomain).mockResolvedValue(reply(error, 412))
  expect((await POST(new Request(`http://localhost/api/hub/${prefix}/download`, { method: "POST", headers: { origin: "http://localhost" } }), params("download"))).status).toBe(502)
})
it("keeps one absolute budget through owner body EOF and cancels an aborted read", async () => {
  vi.useFakeTimers()
  const cancelled = vi.fn()
  vi.mocked(requestWithDomain).mockResolvedValue(new Response(new ReadableStream({ cancel: cancelled }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "stalled-project" } }))
  const response = GET(new Request(`http://localhost/api/hub/${prefix}/package`), params("package"))
  await vi.advanceTimersByTimeAsync(10_001)
  expect((await response).status).toBe(504)
  expect(cancelled).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
})
it("an aborted caller never admits a Project owner read", async () => {
  const controller = new AbortController(); controller.abort()
  expect((await GET(new Request(`http://localhost/api/hub/${prefix}/package`, { signal: controller.signal }), params("package"))).status).toBe(503)
  expect(requestWithDomain).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled()
})
