import { createServer } from "node:http"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { upstream } = vi.hoisted(() => ({ upstream: vi.fn() }))
vi.mock("@/lib/server/upstream-http", () => ({ requestWithDomain: upstream }))
const active = { data: { authenticated: true, subject: "subject-1", tenant_id: "tenant-1", expires_at: "2030-01-01T00:00:00.000Z" } }
const request = (query = "") => new Request(`https://web.example/api/auth/session${query}`, {
  headers: { host: "web.example", cookie: "kokoro-issuer.session_token=session", "x-request-id": "test_request" },
})
async function get(query = "") {
  const { GET } = await import("@/app/api/auth/session/route")
  return GET(request(query))
}
beforeEach(() => {
  vi.stubEnv("KOKORO_BFF_BASE_URL", "https://bff.example")
  vi.stubEnv("KOKORO_DOMAIN", "web.example")
  vi.stubEnv("KOKORO_WEB_ORIGIN", "https://web.example")
  vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture-secret")
  upstream.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
describe("single generated browser auth status consumer", () => {
  it("reads the BFF status once and preserves the real strict safe envelope", async () => {
    upstream.mockResolvedValue(Response.json(active, { headers: { "cache-control": "no-store", "x-request-id": "test_request" } }))
    const response = await get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(active)
    expect(upstream).toHaveBeenCalledOnce()
    expect(upstream.mock.calls[0]?.[0]).toBe("https://bff.example/browser/v1/auth/session?refresh=true")
  })
  it("relays real transport Set-Cookie fields separately, never the token response header", async () => {
    const cookies = [
      "kokoro-issuer.session_token=next; Path=/; HttpOnly; Expires=Tue, 01 Jan 2030 00:00:00 GMT",
      "kokoro-issuer.session_data=; Path=/; HttpOnly; Max-Age=0",
    ]
    const received: string[] = []
    const server = createServer((request, response) => {
      received.push(request.url ?? "")
      response.writeHead(200, {
        "content-type": "application/json", "cache-control": "no-store", "x-request-id": "test_request",
        "set-cookie": cookies, "set-auth-jwt": "canary",
      })
      response.end(JSON.stringify(active))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
      vi.stubEnv("KOKORO_BFF_BASE_URL", `http://127.0.0.1:${address.port}`)
      const actual = await vi.importActual<typeof import("@/lib/server/upstream-http")>("@/lib/server/upstream-http")
      upstream.mockImplementation(actual.requestWithDomain)
      const response = await get()
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(active)
      expect(response.headers.getSetCookie()).toEqual(cookies)
      expect(response.headers.get("set-auth-jwt")).toBeNull()
      expect(received).toEqual(["/browser/v1/auth/session?refresh=true"])
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
  it.each([
    [200, { data: { authenticated: false } }],
    [403, { error: { code: "session_forbidden", message: "Current Product qualification is required", retryable: false } }],
    [429, { error: { code: "session_rate_limited", message: "Authentication service is rate limited", retryable: true } }],
    [503, { error: { code: "iam_admission_unavailable", message: "Authentication service is unavailable", retryable: true } }],
  ])("preserves status %s, not a synthesized login failure", async (status, body) => {
    upstream.mockResolvedValue(Response.json(body, { status, headers: { "cache-control": "no-store", "x-request-id": "test_request" } }))
    const response = await get()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })
  it.each([
    { ...active, token: "canary" },
    { data: { ...active.data, expires_at: "2030-02-30T00:00:00Z" } },
    { data: { ...active.data, expires_at: "2030-01-01T00:00:00+00:00" } },
    { data: { authenticated: false, subject: "stale" } },
  ])("rejects invalid or secret-bearing upstream status", async body => {
    upstream.mockResolvedValue(Response.json(body, { headers: { "cache-control": "no-store", "x-request-id": "test_request" } }))
    expect((await get()).status).toBe(503)
  })
})
it("uses refresh=false for a read-only RSC observation and never exposes its pending Set-Cookie writes", async () => {
  const { observeBrowserAuthSession, readBrowserAuthSession }=await import("@/lib/server/browser-auth-session")
  const { productBffConfig }=await import("@/lib/server/product-bff")
  const reply=()=>Response.json(active,{headers:{"cache-control":"no-store","x-request-id":"test_request","set-cookie":"kokoro-issuer.session_token=; Path=/; Max-Age=0; HttpOnly"}})
  upstream.mockImplementation(async()=>reply())
  const observed=await observeBrowserAuthSession(request(),productBffConfig()!,"test_request",false)
  expect(observed.headers.getSetCookie()).toEqual([])
  expect(await readBrowserAuthSession(request(),productBffConfig()!,"test_request")).toEqual(active.data)
  expect(upstream.mock.calls.every(([url])=>url==="https://bff.example/browser/v1/auth/session?refresh=false")).toBe(true)
})
it.each(["?refresh=0","?refresh=false&refresh=true","?refresh=false&tenant_id=forged","?disableRefresh=true"])("rejects an invalid query %s before transport",async query=>{
  expect((await get(query)).status).toBe(400);expect(upstream).not.toHaveBeenCalled()
})
it("rejects ambiguous cookie syntax as a request error, not an anonymous login or dependency failure",async()=>{
  const {GET}=await import("@/app/api/auth/session/route")
  const response=await GET(new Request("https://web.example/api/auth/session",{headers:{host:"web.example",cookie:"kokoro-issuer.session_token=a; kokoro-issuer.session_token=b"}}))
  expect(response.status).toBe(400);expect(upstream).not.toHaveBeenCalled()
})
