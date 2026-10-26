import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createServer, type IncomingHttpHeaders } from "node:http"
import { isArrayBuffer } from "node:util/types"

import * as sessionRoute from "@/app/api/session/[...path]/route"
import { requestWithDomain } from "@/lib/server/upstream-http"
import { NextRequest } from "next/server"
import { createBillingClient } from "@/billing/client"
import { proxy } from "@/proxy"

vi.mock("@/lib/server/upstream-http", async (original) => ({ ...await original<typeof import("@/lib/server/upstream-http")>(), requestWithDomain: vi.fn() }))
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
const path = "/api/session/billing/credit-account"
const summary = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "91234567890123456789", held_micros: "1234567" }
let claims: { id: string; generation: number; subject: string; access: string; accessExpiresAt: number; expiresAt: number }
const request = (body: BodyInit = "{}", target = path) => new Request(`http://web.test${target}`, { method: "PUT", body, headers: { host: "web.test", origin: "http://web.test", "content-type": "application/json" }, duplex: "half" } as RequestInit)
const call = (input = request(), params = Promise.resolve({ path: ["billing", "credit-account"] })) => sessionRoute[input.method === "GET" ? "GET" : "PUT"](input, { params })
function owner(raw: unknown = summary, status = 200, extra: HeadersInit = {}) {
  const id = new Headers(vi.mocked(requestWithDomain).mock.calls.at(-1)?.[2].headers).get("x-kokoro-request-id")!
  return Response.json(status === 200 ? { data: raw, meta: { request_id: id } } : { error: raw, meta: { request_id: id } }, { status, headers: { "cache-control": "no-store", "x-request-id": id, ...Object.fromEntries(new Headers(extra)) } })
}
beforeEach(() => {
  vi.resetAllMocks()
  for (const [key, value] of Object.entries({ KOKORO_BFF_BASE_URL: "http://bff.test", KOKORO_WEB_ORIGIN: "http://web.test", KOKORO_DOMAIN: "product.test", KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/0", KOKORO_WEB_AUTH_SECRET: "a".repeat(32) })) vi.stubEnv(key, value)
  claims = { id: "session", generation: 2, subject: "alice", access: "private-access", accessExpiresAt: Date.now() + 100_000, expiresAt: Date.now() + 200_000 }
  currentProductSession.mockResolvedValue(claims)
  vi.mocked(requestWithDomain).mockImplementation(async () => owner())
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe("I5 actual session catch-all initialization boundary", () => {
  it("makes one exact empty command, verifies both sessions, and serializes the actual nonzero snapshot with bounded final framing", async () => {
    const input = request(); input.headers.set("cookie", "private=browser"); input.headers.set("authorization", "forged")
    const response = await call(input)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual(summary)
    expect(response.headers.get("content-length")).toBe(String(new TextEncoder().encode(text).byteLength))
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(currentProductSession).toHaveBeenCalledTimes(2)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
    const [url, , init] = vi.mocked(requestWithDomain).mock.calls[0]!
    expect(url).toBe("http://bff.test/v1/billing/credit-account")
    expect(init.method).toBe("PUT"); expect(isArrayBuffer(init.body)).toBe(true)
    expect(init.body?.byteLength).toBe(2)
    expect(new TextDecoder().decode(init.body)).toBe("{}")
    expect(init.timeoutMs).toBeLessThanOrEqual(15_000)
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer private-access")
    for (const key of ["cookie", "idempotency-key"]) expect(new Headers(init.headers).has(key)).toBe(false)
  })
  it.each(["", "[]", "null", '{"extra":true}', '{"x":1,"x":2}', "\ufeff{}", " ".repeat(4095) + "{}"])('rejects invalid or oversized actual body %j before session/owner IO', async (body) => {
    expect((await call(request(body))).status).toBe(400)
    expect(currentProductSession).not.toHaveBeenCalled(); expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each([`${path}?a=1`, `${path}?`, `${path}/`, "/api/session/%62illing/credit-account", "/api/session/billing/%63redit-account"])("rejects raw structural alias %s without generic bypass", async (target) => {
    expect((await call(request("{}", target))).status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("returns 405/Allow PUT before admission for a read of the command resource", async () => {
    const response = await call(new Request(`http://web.test${path}`, { headers: { host: "web.test" } }))
    expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("PUT")
    expect(currentProductSession).not.toHaveBeenCalled()
  })
  it.each(["origin", "host", "idempotency-key", "content-encoding"])("rejects unsupported security input %s", async (key) => {
    const input = request(); input.headers.set(key, key === "content-encoding" ? "gzip" : "wrong")
    expect((await call(input)).status).toBe(key === "origin" || key === "host" ? 403 : 400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it.each(["id", "subject", "generation", "access", "accessExpiresAt", "expiresAt"] as const)("does not release an ACK after the session %s changes", async (key) => {
    currentProductSession.mockResolvedValueOnce(claims).mockResolvedValueOnce({ ...claims, [key]: typeof claims[key] === "number" ? Number(claims[key]) + 1 : `${claims[key]}changed` })
    expect((await call()).status).toBe(401)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
  })
  it("preserves only the fixed disabled code and retryable bit", async () => {
    vi.mocked(requestWithDomain).mockImplementation(async () => owner({ code: "billing_account_disabled", message: "private owner text", retryable: false }, 403))
    const response = await call()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: { code: "billing_account_disabled", message: "billing_account_disabled", retryable: false } })
    expect(response.headers.has("content-length")).toBe(true)
  })
  it.each(["set-cookie", "location", "content-encoding", "transfer-encoding"])("rejects owner %s without releasing data", async (header) => {
    vi.mocked(requestWithDomain).mockImplementation(async () => owner(summary, 200, { [header]: "unexpected" }))
    expect((await call()).status).toBe(502)
  })
  it("uses one 15 second budget for noncooperative params and never starts owner IO late", async () => {
    vi.useFakeTimers()
    let resolve!: (value: { path: string[] }) => void
    const pending = call(request(), new Promise((yes) => { resolve = yes }))
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await pending).status).toBe(504)
    resolve({ path: ["billing", "credit-account"] }); await vi.advanceTimersByTimeAsync(1)
    expect(currentProductSession).not.toHaveBeenCalled(); expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("consumes the actual route response with actual Proxy final headers in the real browser command", async () => {
    const final = await proxy(new NextRequest("http://web.test/api/session/billing/credit-account", { method: "PUT", headers: { host: "web.test" } }))
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const input = request(init?.body ?? "{}")
      const routed = await call(input)
      const headers = new Headers(routed.headers)
      headers.set("cache-control", final.headers.get("cache-control")!)
      return new Response(routed.body, { status: routed.status, headers })
    }))
    expect(await createBillingClient().initializeCreditAccount()).toEqual(summary)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
  })
  it.each(["first session", "owner EOF", "final session"])("does not extend the absolute budget for stalled %s", async (phase) => {
    vi.useFakeTimers()
    const pendingForever = new Promise<never>(() => {})
    if (phase === "first session") currentProductSession.mockReturnValueOnce(pendingForever)
    if (phase === "final session") currentProductSession.mockResolvedValueOnce(claims).mockReturnValueOnce(pendingForever)
    if (phase === "owner EOF") vi.mocked(requestWithDomain).mockImplementation(async () => {
      const valid = owner()
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{}")) } }), { headers: valid.headers })
    })
    const pending = call()
    await vi.advanceTimersByTimeAsync(15_000)
    const response = await pending
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ error: { code: "request_timeout" } })
    expect(requestWithDomain).toHaveBeenCalledTimes(phase === "first session" ? 0 : 1)
  })
  it("retires an aborted noncooperative owner fetch and cancels its late body without another session read", async () => {
    let resolve!: (response: Response) => void
    vi.mocked(requestWithDomain).mockReturnValueOnce(new Promise(yes => { resolve = yes }))
    const controller = new AbortController(), initial = request()
    const pending = call(new Request(initial, { signal: controller.signal }))
    await vi.waitFor(() => expect(requestWithDomain).toHaveBeenCalledTimes(1))
    controller.abort()
    expect((await pending).status).toBe(499)
    const cancel = vi.fn()
    resolve(new Response(new ReadableStream({ cancel }), { headers: owner().headers }))
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    expect(currentProductSession).toHaveBeenCalledTimes(1)
  })
  it.each(["GET", "POST", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const)("returns 405/Allow PUT for the actual exported %s method without session or owner IO", async method => {
    expect(sessionRoute).toHaveProperty(method)
    if (!(method in sessionRoute)) return
    const response = await sessionRoute[method](new Request(`http://web.test${path}`, { method }), { params: Promise.resolve({ path: ["billing", "credit-account"] }) })
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("PUT")
    expect(currentProductSession).not.toHaveBeenCalled()
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("preserves the framework's ordinary resource OPTIONS response without authentication or forwarding", async () => {
    expect(sessionRoute).toHaveProperty("OPTIONS")
    if (!("OPTIONS" in sessionRoute)) return
    const response = await sessionRoute.OPTIONS(new Request("http://web.test/api/session/billing/summary", { method: "OPTIONS" }), { params: Promise.resolve({ path: ["billing", "summary"] }) })
    expect(response.status).toBe(204)
    expect(response.headers.get("allow")).toBe("DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT")
    expect(await response.text()).toBe("")
    expect(currentProductSession).not.toHaveBeenCalled()
    expect(requestWithDomain).not.toHaveBeenCalled()
  })
  it("sends one real upstream PUT with exactly two framed bytes and no browser credentials or idempotency key", async () => {
    const seen: { method: string | undefined; url: string | undefined; headers: IncomingHttpHeaders; body: string; complete: boolean }[] = []
    const peer = createServer((input, output) => {
      const parts: Buffer[] = []
      input.on("data", part => parts.push(Buffer.from(part)))
      input.on("end", () => {
        seen.push({ method: input.method, url: input.url, headers: input.headers, body: Buffer.concat(parts).toString("utf8"), complete: input.complete })
        const id = input.headers["x-kokoro-request-id"]
        const body = JSON.stringify({ data: summary, meta: { request_id: id } })
        output.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "content-length": Buffer.byteLength(body), "x-request-id": String(id) })
        output.end(body)
      })
    })
    await new Promise<void>(resolve => peer.listen(0, "127.0.0.1", resolve))
    try {
      const address = peer.address()
      if (address === null || typeof address === "string") throw new Error("peer_address_unavailable")
      vi.stubEnv("KOKORO_BFF_BASE_URL", `http://127.0.0.1:${address.port}`)
      const actual = await vi.importActual<typeof import("@/lib/server/upstream-http")>("@/lib/server/upstream-http")
      vi.mocked(requestWithDomain).mockImplementation(actual.requestWithDomain)
      const input = request()
      input.headers.set("cookie", "browser-private=value")
      input.headers.set("authorization", "Bearer browser-forged")
      const response = await call(input)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(summary)
      expect(seen).toHaveLength(1)
      expect(seen[0]).toMatchObject({ method: "PUT", url: "/v1/billing/credit-account", body: "{}", complete: true })
      expect(seen[0]?.headers["content-length"]).toBe("2")
      expect(seen[0]?.headers["transfer-encoding"]).toBeUndefined()
      expect(seen[0]?.headers.authorization).toBe("Bearer private-access")
      expect(seen[0]?.headers.cookie).toBeUndefined()
      expect(seen[0]?.headers["idempotency-key"]).toBeUndefined()
      expect(requestWithDomain).toHaveBeenCalledTimes(1)
      expect(currentProductSession).toHaveBeenCalledTimes(2)
    } finally {
      peer.closeAllConnections()
      await new Promise<void>((resolve, reject) => peer.close(error => error ? reject(error) : resolve()))
    }
  })
})
