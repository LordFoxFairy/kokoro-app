import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http"
import { beforeEach, afterEach, it, expect, vi } from "vitest"
const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))
import { GET, POST, PUT } from "@/app/api/session/[...path]/route"
let server: Server, calls: IncomingMessage[], bodies: string[], peer: (req: IncomingMessage, res: ServerResponse) => void
const feedback = { session_id: "session", message_id: "answer", feedback: null }
const reply = (req: IncomingMessage, res: ServerResponse) => {
  const data = req.url?.endsWith("regenerate")
    ? { run_id: "new", user_message_id: "original-user", assistant_message_id: "new-answer", regenerated_from_message_id: "answer" }
    : feedback
  const body = JSON.stringify({ data })
  res.writeHead(req.url?.endsWith("regenerate") ? 202 : 200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-request-id": String(req.headers["x-kokoro-request-id"]),
  })
  res.end(body)
}
beforeEach(async () => {
  calls = []
  bodies = []
  peer = reply
  currentProductSession.mockReset().mockResolvedValue({
    id: "session-cookie",
    generation: 1,
    subject: "subject",
    access: "private-fixture-access",
    accessExpiresAt: Date.now() + 60000,
    expiresAt: Date.now() + 60000,
  })
  server = createServer((req, res) => {
    calls.push(req)
    let body = ""
    req.on("data", (value) => (body += value))
    req.on("end", () => {
      bodies.push(body)
      peer(req, res)
    })
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const address = server.address()
  if (!address || typeof address === "string") throw Error()
  for (const [k, v] of Object.entries({
    KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
    KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_DOMAIN: "web.test",
    KOKORO_BFF_BASE_URL: `http://127.0.0.1:${address.port}`,
  }))
    vi.stubEnv(k, v)
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
  vi.unstubAllEnvs()
})
const request = (method = "GET", suffix = "feedback", body?: string) =>
  new Request(`http://web.test/api/session/sessions/session/messages/answer/${suffix}`, {
    method,
    headers: {
      host: "web.test",
      ...(method !== "GET" ? { origin: "http://web.test", "content-type": "application/json" } : {}),
      ...(suffix === "regenerate" ? { "idempotency-key": "same-key" } : {}),
    },
    ...(body === undefined ? {} : { body }),
  })
const run = (req: Request, suffix = "feedback") =>
  (req.method === "POST" ? POST : req.method === "PUT" ? PUT : GET)(req, {
    params: Promise.resolve({ path: ["sessions", "session", "messages", "answer", suffix] }),
  })

it("projects only exact four read/write operations through current Product Session and preserves one original regeneration key", async () => {
  const read = await run(request())
  expect(read.status).toBe(200)
  expect(await read.json()).toEqual(feedback)
  const regen = await run(request("POST", "regenerate", "{}"), "regenerate")
  expect(regen.status).toBe(202)
  expect((await regen.json()).regenerated_from_message_id).toBe("answer")
  expect(calls).toHaveLength(2)
  expect(calls[1]?.headers["idempotency-key"]).toBe("same-key")
  expect(bodies[1]).toBe("{}")
  expect(calls[0]?.headers.authorization).toBe("Bearer private-fixture-access")
})
it("rejects query/identity/unknown fields before BFF and rejects truncated or wrong-bound responses without retry", async () => {
  expect((await run(request("PUT", "feedback", '{"feedback":"up","actor":"other"}'))).status).toBe(400)
  expect(calls).toHaveLength(0)
  peer = (req, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": "200",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
    })
    res.end('{"data":{}')
    res.socket?.end()
  }
  expect((await run(request())).status).toBe(502)
  expect(calls).toHaveLength(1)
})

it("a late actor change after a real ACK remains unconfirmed instead of exposing old target facts", async () => {
  const original = currentProductSession.getMockImplementation()!
  currentProductSession.mockImplementation(async () => {
    const claims = await original()
    return calls.length ? { ...claims, subject: "other" } : claims
  })
  const result = await run(request("POST", "regenerate", "{}"), "regenerate")
  expect(result.status).toBe(401)
  expect((await result.json()).data).toBeUndefined()
  expect(calls).toHaveLength(1)
})
