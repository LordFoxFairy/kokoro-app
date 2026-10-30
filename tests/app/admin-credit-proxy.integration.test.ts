import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
import { GET, POST, PUT } from "@/app/api/admin/[...path]/route"
const id = "11111111-1111-4111-8111-111111111111"
const body = JSON.stringify({
  funding_id: id,
  subject_id: "recipient-user",
  amount_credits: "1000",
  reason: "non-cash test",
  effective_at: "2026-10-22T00:00:00.000Z",
})
const context = (path = ["billing", "credit-grants"]) => ({ params: Promise.resolve({ path }) })
let server: Server, calls: IncomingMessage[], payloads: string[], peer: (req: IncomingMessage, res: ServerResponse) => void
function input(raw = body, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request("http://web.test/api/admin/billing/credit-grants", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(raw).length),
      "idempotency-key": "original-funding-key",
      "x-kokoro-request-id": "credit-bridge-1",
      ...headers,
    },
    body: raw,
    ...(signal ? { signal } : {}),
  })
}
function reply(req: IncomingMessage, res: ServerResponse, status = 201, raw?: string) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(req.headers["x-kokoro-request-id"]) })
  res.end(raw ?? JSON.stringify({ data: { account_id: id, grant_id: id, journal_id: id }, meta: { request_id: "credit-bridge-1" } }))
}
beforeEach(async () => {
  calls = []
  payloads = []
  currentProductSession.mockReset().mockResolvedValue({ access: "admitted-session-token", accessExpiresAt: Date.now() + 60000 })
  peer = reply
  server = createServer((req, res) => {
    calls.push(req)
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (v) => {
      body += v
    })
    req.on("end", () => {
      payloads.push(body)
      peer(req, res)
    })
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const addr = server.address()
  if (!addr || typeof addr === "string") throw new Error("peer not bound")
  for (const [k, v] of Object.entries({
    KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
    KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_DOMAIN: "configured.product.test",
    KOKORO_BFF_BASE_URL: `http://127.0.0.1:${addr.port}`,
    KOKORO_INTERNAL_SECRET_WEB_BFF: "synthetic-product-bff-secret",
  }))
    vi.stubEnv(k, v)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
})
it("forwards exact frozen funding bytes/key using Product identity and configured tenant authority", async () => {
  const result = await POST(
    input(body, { authorization: "Bearer forged", "x-kokoro-tenant-id": "forged", "x-kokoro-actor-id": "forged", forwarded: "host=forged.invalid" }),
    context(),
  )
  expect(result.status).toBe(201)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe("/v1/admin/billing/credit-grants")
  expect(payloads).toEqual([body])
  expect(calls[0]!.headers.authorization).toBe("Bearer admitted-session-token")
  expect(calls[0]!.headers.forwarded).toBe("host=configured.product.test")
  expect(calls[0]!.headers["idempotency-key"]).toBe("original-funding-key")
  expect(calls[0]!.headers["x-kokoro-tenant-id"]).toBeUndefined()
  expect(calls[0]!.headers["x-kokoro-actor-id"]).toBeUndefined()
  expect((await result.json()).data.journal_id).toBe(id)
})
it("admits only the current member GET, preserving opaque query rather than broad identity routes", async () => {
  peer = (req, res) => reply(req, res, 200, JSON.stringify({ data: [], meta: { request_id: "credit-members-1", next_cursor: null } }))
  const r = await GET(
    new Request("http://web.test/api/admin/identity/members?limit=50&cursor=opaque%2Fnext", { headers: { "x-kokoro-request-id": "credit-members-1" } }),
    context(["identity", "members"]),
  )
  expect(r.status).toBe(200)
  expect(calls[0]!.url).toBe("/v1/admin/identity/members?limit=50&cursor=opaque%2Fnext")
  expect(calls[0]!.headers["content-type"]).toBeUndefined()
  expect(calls[0]!.headers["idempotency-key"]).toBeUndefined()
  for (const path of [
    ["identity", "roles"],
    ["billing", "credit-accounts"],
    ["billing", "credit-grants", "extra"],
  ])
    expect((await GET(new Request("http://web.test/api/admin/other"), context(path))).status).toBe(404)
  expect((await PUT(new Request("http://web.test/api/admin/billing/credit-grants", { method: "PUT" }), context())).status).toBe(404)
  expect(calls).toHaveLength(1)
})
it("rejects malformed mutation framing/key/CAS/query before session or BFF IO", async () => {
  for (const headers of [
    { "idempotency-key": "short" },
    { "idempotency-key": "valid-key,combined-key" },
    { "content-length": "0" },
    { "content-length": "01" },
    { "content-type": "text/plain" },
    { "transfer-encoding": "chunked" },
    { "if-match": '"1"' },
    { "if-none-match": "*" },
  ])
    expect((await POST(input(body, headers), context())).status).toBe(400)
  const base = input()
  const withQuery = new Request("http://web.test/api/admin/billing/credit-grants?tenant_id=other", { method: "POST", headers: base.headers, body })
  expect((await POST(withQuery, context())).status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("does not treat a missing session or failed admission as a financial success", async () => {
  currentProductSession.mockResolvedValueOnce(null)
  expect((await POST(input(), context())).status).toBe(401)
  currentProductSession.mockRejectedValueOnce(new Error("private detail"))
  const r = await POST(input(), context())
  expect(r.status).toBe(503)
  expect(JSON.stringify(await r.json())).not.toContain("private detail")
  expect(calls).toHaveLength(0)
})
it("rejects member query and write framing before any session inspection", async () => {
  const contexts = context(["identity", "members"])
  for (const query of ["?tenant_id=other", "?limit=0", "?limit=101", "?limit=1&limit=2", "?cursor=", "?cursor=" + "x".repeat(2049)])
    expect((await GET(new Request(`http://web.test/api/admin/identity/members${query}`), contexts)).status).toBe(400)
  for (const name of ["content-length", "transfer-encoding", "content-type", "if-match", "if-none-match", "idempotency-key"])
    expect(
      (await GET(new Request("http://web.test/api/admin/identity/members", { headers: { [name]: name === "content-length" ? "0" : "arbitrary" } }), contexts))
        .status,
    ).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("never invents a replacement command after a lost owner response; an explicit replay keeps original bytes and key", async () => {
  peer = (req) => req.socket.destroy()
  expect((await POST(input(), context())).status).toBe(503)
  expect(calls).toHaveLength(1)
  peer = reply
  expect((await POST(input(), context())).status).toBe(201)
  expect(calls).toHaveLength(2)
  expect(payloads).toEqual([body, body])
  expect(calls.map((c) => c.headers["idempotency-key"])).toEqual(["original-funding-key", "original-funding-key"])
})
it("enforces the shared absolute deadline before dispatch even if session inspection ignores its signal", async () => {
  const real = Date.now(),
    clock = vi.spyOn(Date, "now").mockReturnValue(real)
  currentProductSession.mockImplementation(async () => {
    clock.mockReturnValue(real + 10001)
    return { access: "admitted-session-token", accessExpiresAt: real + 60000 }
  })
  expect((await POST(input(), context())).status).toBe(503)
  expect(calls).toHaveLength(0)
})
it("returns under the original budget while session admission is pending", async () => {
  vi.useFakeTimers()
  try {
    currentProductSession.mockImplementation(() => new Promise(() => undefined))
    const pending = POST(input(), context())
    await vi.advanceTimersByTimeAsync(10000)
    expect((await pending).status).toBe(503)
    expect(calls).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})
it("bounds a partial incoming financial command and never forwards it", async () => {
  vi.useFakeTimers()
  try {
    const request = new Request("http://web.test/api/admin/billing/credit-grants", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "2", "idempotency-key": "original-funding-key" },
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("{"))
        },
      }),
      duplex: "half",
    } as RequestInit)
    const pending = POST(request, context())
    await vi.advanceTimersByTimeAsync(10000)
    expect((await pending).status).toBe(503)
    expect(currentProductSession).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})
it("cancels a partially received funding acknowledgement before reporting success", async () => {
  let start!: () => void, closed!: () => void
  const ready = new Promise<void>((r) => (start = r)),
    done = new Promise<void>((r) => (closed = r))
  peer = (req, res) => {
    res.once("close", closed)
    res.writeHead(201, { "content-type": "application/json", "cache-control": "no-store", "x-request-id": String(req.headers["x-kokoro-request-id"]) })
    res.write('{"data":')
    start()
  }
  const c = new AbortController(),
    pending = POST(input(body, {}, c.signal), context())
  await ready
  c.abort()
  expect((await pending).status).toBe(503)
  await done
  expect(calls).toHaveLength(1)
})
it("rejects wrong correlation, unexpected media type, redirects and oversized acknowledgements without exposing private response bodies", async () => {
  for (const headers of [{ "x-request-id": "wrong" }, { "content-type": "text/html" }, { "content-length": String(1024 * 1024 + 1) }]) {
    peer = (req, res) => {
      res.writeHead(201, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-request-id": String(req.headers["x-kokoro-request-id"]),
        ...headers,
      })
      res.end("private invalid acknowledgement")
    }
    const result = await POST(input(), context())
    expect([502, 503]).toContain(result.status)
    expect(JSON.stringify(await result.json())).not.toContain("private invalid")
  }
  peer = (_req, res) => {
    res.writeHead(302, {
      location: "http://unrelated.invalid/private",
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": "credit-bridge-1",
    })
    res.end("{}")
  }
  expect((await POST(input(), context())).status).toBe(502)
  expect(calls).toHaveLength(4)
})
