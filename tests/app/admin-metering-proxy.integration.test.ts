import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
const { currentProductSession } = vi.hoisted(() => ({
  currentProductSession: vi.fn(),
}))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
import { GET, POST, PUT } from "@/app/api/admin/[...path]/route"
const prefix = "http://web.test/api/admin/billing/metering/"
const context = (name: string) => ({
  params: Promise.resolve({ path: ["billing", "metering", name] }),
})
const id = "11111111-1111-4111-8111-111111111111"
const configuration = {
  effective_from: "2026-10-22T00:00:00.000Z",
  source_ref: "QA isolated test",
  verified_at: "2026-10-22T00:00:00.000Z",
  currency_code: "USD",
  multiplier: { numerator: "7", denominator: "5" },
  credit_micros_per_minor: { numerator: "1000000", denominator: "1" },
  max_attempt_credits: "10",
}
const command = JSON.stringify({
  publication_id: id,
  reason: "original",
  configuration,
})
const rateConfiguration = {
  effective_from: configuration.effective_from,
  source_ref: configuration.source_ref,
  verified_at: configuration.verified_at,
  rates: [
    {
      model_revision: {
        id: "22222222-2222-4222-8222-222222222222",
        content_digest: "b".repeat(64),
      },
      provider_ref: "provider",
      environment: "test",
      pricing_account_ref: "account",
      model_ref: "model",
      model_version: "1",
      bucket: "input_total",
      unit: "token",
      applicability: { kind: "all" },
      currency_code: "USD",
      minor_per_unit: { numerator: "1", denominator: "1000" },
    },
  ],
}
let server: Server, calls: IncomingMessage[], payloads: string[], peer: (req: IncomingMessage, res: ServerResponse) => void
function input(name = "policy-revisions", raw = command, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request(prefix + name, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(raw).length),
      "idempotency-key": "original-metering-key",
      "x-kokoro-request-id": "metering-bridge-1",
      ...headers,
    },
    body: raw,
    ...(signal ? { signal } : {}),
  })
}
function reply(req: IncomingMessage, res: ServerResponse, status = req.method === "GET" ? 200 : 201, raw?: string) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-request-id": String(req.headers["x-kokoro-request-id"]),
  })
  res.end(
    raw ??
      JSON.stringify({
        data:
          req.method === "GET"
            ? { rate_revision: null, policy_revision: null }
            : {
                kind: req.url?.endsWith("rate-revisions") ? "rate" : "policy",
                revision: "1",
                content_digest: "a".repeat(64),
                published_at: configuration.effective_from,
                effective_from: configuration.effective_from,
              },
        meta: { request_id: "metering-bridge-1" },
      }),
  )
}
beforeEach(async () => {
  calls = []
  payloads = []
  currentProductSession.mockReset().mockResolvedValue({
    access: "admitted-product-token",
    accessExpiresAt: Date.now() + 60000,
  })
  peer = reply
  server = createServer((req, res) => {
    calls.push(req)
    let raw = ""
    req.setEncoding("utf8")
    req.on("data", (v) => {
      raw += v
    })
    req.on("end", () => {
      payloads.push(raw)
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
it("reads honest nullable pricing through only the formal Product route", async () => {
  const result = await GET(
    new Request(prefix + "pricing", {
      headers: { "x-kokoro-request-id": "metering-bridge-1" },
    }),
    context("pricing"),
  )
  expect(result.status).toBe(200)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe("/v1/admin/billing/metering/pricing")
  expect(calls[0]!.headers["content-type"]).toBeUndefined()
  expect((await result.json()).data).toEqual({
    rate_revision: null,
    policy_revision: null,
  })
})
it.each(["rate-revisions", "policy-revisions"])("preserves exact %s command and trusted Product context", async (name) => {
  const raw =
    name === "rate-revisions"
      ? JSON.stringify({
          publication_id: id,
          reason: "original",
          configuration: rateConfiguration,
        })
      : command
  const result = await POST(
    input(name, raw, {
      authorization: "Bearer forged",
      "x-kokoro-tenant-id": "forged",
      "x-kokoro-actor-id": "forged",
      forwarded: "host=forged.invalid",
    }),
    context(name),
  )
  expect(result.status).toBe(201)
  expect(payloads).toEqual([raw])
  expect(calls[0]!.url).toBe("/v1/admin/billing/metering/" + name)
  expect(calls[0]!.headers.authorization).toBe("Bearer admitted-product-token")
  expect(calls[0]!.headers.forwarded).toBe("host=configured.product.test")
  expect(calls[0]!.headers["idempotency-key"]).toBe("original-metering-key")
  expect(calls[0]!.headers["x-kokoro-tenant-id"]).toBeUndefined()
  expect(calls[0]!.headers["x-kokoro-actor-id"]).toBeUndefined()
})
it("forwards a legitimate 64-row Unicode configuration larger than the former generic cap", async () => {
  const row = {
    provider_ref: "👍".repeat(255),
    environment: "test",
    pricing_account_ref: "account",
    model_ref: "model",
    model_version: "1",
    bucket: "input_total",
    unit: "token",
    applicability: { kind: "all" },
    currency_code: "USD",
    minor_per_unit: { numerator: "1", denominator: "1000" },
  }
  const raw = JSON.stringify({
    publication_id: id,
    reason: "👍".repeat(500),
    configuration: {
      effective_from: configuration.effective_from,
      source_ref: "QA",
      verified_at: configuration.verified_at,
      rates: Array.from({ length: 64 }, (_, n) => ({
        ...row,
        model_revision: {
          id: `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`,
          content_digest: "b".repeat(64),
        },
        model_ref: "model" + n,
      })),
    },
  })
  expect(new TextEncoder().encode(raw).length).toBeGreaterThan(65_536)
  expect((await POST(input("rate-revisions", raw), context("rate-revisions"))).status).toBe(201)
  expect(payloads).toEqual([raw])
})
it("permits exactly 1MiB of command bytes but rejects overflow without touching session", async () => {
  const padded = command + " ".repeat(1_048_576 - new TextEncoder().encode(command).length)
  expect((await POST(input("policy-revisions", padded), context("policy-revisions"))).status).toBe(201)
  expect(payloads).toEqual([padded])
  currentProductSession.mockClear()
  expect((await POST(input("policy-revisions", padded + " "), context("policy-revisions"))).status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(1)
})
it("keeps the original funding cap while the metering command grows", async () => {
  const raw = " ".repeat(16_385),
    req = input("policy-revisions", raw)
  const result = await POST(
    new Request("http://web.test/api/admin/billing/credit-grants", {
      method: "POST",
      headers: req.headers,
      body: raw,
    }),
    {
      params: Promise.resolve({ path: ["billing", "credit-grants"] }),
    },
  )
  expect(result.status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("rejects read query, framing, encoding and command headers before Product inspection", async () => {
  for (const suffix of ["?tenant_id=other", "?limit=1", "?unknown="])
    expect((await GET(new Request(prefix + "pricing" + suffix), context("pricing"))).status).toBe(400)
  for (const name of ["content-length", "transfer-encoding", "content-type", "content-encoding", "if-match", "if-none-match", "idempotency-key"])
    expect(
      (
        await GET(
          new Request(prefix + "pricing", {
            headers: { [name]: name === "content-length" ? "0" : "arbitrary" },
          }),
          context("pricing"),
        )
      ).status,
    ).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("rejects malformed publication framing, key and query without owner I/O", async () => {
  for (const headers of [
    { "idempotency-key": "short" },
    { "idempotency-key": "valid-key,combined-key" },
    { "content-type": "text/plain" },
    { "content-length": "01" },
    { "content-length": "0" },
    { "content-encoding": "gzip" },
    { "transfer-encoding": "chunked" },
    { "if-match": '"1"' },
    { "if-none-match": "*" },
  ])
    expect((await POST(input("policy-revisions", command, headers), context("policy-revisions"))).status).toBe(400)
  const req = input()
  expect(
    (
      await POST(
        new Request(prefix + "policy-revisions?tenant=other", {
          method: "POST",
          headers: req.headers,
          body: command,
        }),
        context("policy-revisions"),
      )
    ).status,
  ).toBe(400)
  req.headers.delete("content-length")
  expect((await POST(req, context("policy-revisions"))).status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("exposes no metering prefix proxy or alternate methods", async () => {
  for (const name of ["history", "pricing/extra", "rate-revisions/extra", "unknown"])
    expect((await GET(new Request(prefix + name), context(name))).status).toBe(404)
  expect((await GET(new Request(prefix + "policy-revisions"), context("policy-revisions"))).status).toBe(404)
  expect((await POST(input("pricing"), context("pricing"))).status).toBe(404)
  expect((await PUT(new Request(prefix + "pricing", { method: "PUT" }), context("pricing"))).status).toBe(404)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("rejects encoded aliases rather than creating a second management route", async () => {
  expect((await GET(new Request(prefix.replace("metering", "%6detering") + "pricing"), context("pricing"))).status).toBe(400)
  expect(currentProductSession).not.toHaveBeenCalled()
  expect(calls).toHaveLength(0)
})
it("does not dispatch without the current Product session or disclose private admission failures", async () => {
  currentProductSession.mockResolvedValueOnce(null)
  expect((await POST(input(), context("policy-revisions"))).status).toBe(401)
  currentProductSession.mockRejectedValueOnce(new Error("private detail"))
  const result = await POST(input(), context("policy-revisions"))
  expect(result.status).toBe(503)
  expect(JSON.stringify(await result.json())).not.toContain("private detail")
  expect(calls).toHaveLength(0)
})
it("recovers only explicit original bytes and key after a lost response", async () => {
  peer = (req) => req.socket.destroy()
  expect((await POST(input(), context("policy-revisions"))).status).toBe(503)
  expect(calls).toHaveLength(1)
  peer = reply
  expect((await POST(input(), context("policy-revisions"))).status).toBe(201)
  expect(payloads).toEqual([command, command])
  expect(calls.map((req) => req.headers["idempotency-key"])).toEqual(["original-metering-key", "original-metering-key"])
})
it.each([400, 403, 409, 503])("preserves owner %s without rewriting or retrying a command", async (status) => {
  const raw = JSON.stringify({
    error: { code: "metering_error", message: "not confirmed" },
  })
  peer = (req, res) => reply(req, res, status, raw)
  const result = await POST(input(), context("policy-revisions"))
  expect(result.status).toBe(status)
  expect(await result.text()).toBe(raw)
  expect(calls).toHaveLength(1)
})
it("keeps the original budget when session inspection ignores cancellation", async () => {
  const now = Date.now(),
    clock = vi.spyOn(Date, "now").mockReturnValue(now)
  currentProductSession.mockImplementation(async () => {
    clock.mockReturnValue(now + 10001)
    return { access: "admitted-product-token", accessExpiresAt: now + 60000 }
  })
  expect((await POST(input(), context("policy-revisions"))).status).toBe(503)
  expect(calls).toHaveLength(0)
})
it("settles a still-pending admission at the absolute budget with zero BFF requests", async () => {
  vi.useFakeTimers()
  try {
    currentProductSession.mockImplementation(() => new Promise(() => undefined))
    const result = POST(input(), context("policy-revisions"))
    await vi.advanceTimersByTimeAsync(10000)
    expect((await result).status).toBe(503)
    expect(calls).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})
it("bounds a partial incoming publication before session admission", async () => {
  vi.useFakeTimers()
  try {
    const req = new Request(prefix + "policy-revisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2",
        "idempotency-key": "original-metering-key",
      },
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("{"))
        },
      }),
      duplex: "half",
    } as RequestInit)
    const result = POST(req, context("policy-revisions"))
    await vi.advanceTimersByTimeAsync(10000)
    expect((await result).status).toBe(503)
    expect(currentProductSession).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  } finally {
    vi.useRealTimers()
  }
})
it("cancels a partial ACK without returning a false publication", async () => {
  let start!: () => void, closed!: () => void
  const ready = new Promise<void>((r) => {
      start = r
    }),
    done = new Promise<void>((r) => {
      closed = r
    })
  peer = (req, res) => {
    res.once("close", closed)
    res.writeHead(201, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
    })
    res.write('{"data":')
    start()
  }
  const abort = new AbortController(),
    pending = POST(input("policy-revisions", command, {}, abort.signal), context("policy-revisions"))
  await ready
  abort.abort()
  expect((await pending).status).toBe(503)
  await done
  expect(calls).toHaveLength(1)
})
it("passes a complete large latest snapshot without copying Set-Cookie or Location", async () => {
  const raw = JSON.stringify({
    data: {
      rate_revision: { configuration: "x".repeat(100000) },
      policy_revision: null,
    },
  })
  peer = (req, res) => {
    res.setHeader("set-cookie", "private=value")
    res.setHeader("location", "https://private.invalid")
    reply(req, res, 200, raw)
  }
  const result = await GET(
    new Request(prefix + "pricing", {
      headers: { "x-kokoro-request-id": "metering-bridge-1" },
    }),
    context("pricing"),
  )
  expect(result.status).toBe(200)
  expect(await result.text()).toBe(raw)
  expect(result.headers.has("set-cookie")).toBe(false)
  expect(result.headers.has("location")).toBe(false)
})
it.each(["id", "media", "cache", "redirect", "overflow"])("rejects invalid owner metadata or %s without auto retry", async (kind) => {
  peer = (req, res) => {
    res.writeHead(kind === "redirect" ? 302 : 201, {
      "content-type": kind === "media" ? "text/html" : "application/json",
      "cache-control": kind === "cache" ? "public" : "no-store",
      "x-request-id": kind === "id" ? "wrong" : String(req.headers["x-kokoro-request-id"]),
    })
    res.end(kind === "overflow" ? "x".repeat(1_048_577) : "{}")
  }
  const result = await POST(input(), context("policy-revisions"))
  expect(result.status).toBe(kind === "overflow" ? 503 : 502)
  expect(calls).toHaveLength(1)
})
