import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http"
import { beforeEach, afterEach, it, expect, vi } from "vitest"


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
    headers: {cookie: "kokoro-issuer.session_token=fixture",
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

it("projects only exact four read/write operations through current native admission and preserves one original regeneration key", async () => {
  const read = await run(request())
  expect(read.status).toBe(200)
  expect(await read.json()).toEqual(feedback)
  const regen = await run(request("POST", "regenerate", "{}"), "regenerate")
  expect(regen.status).toBe(202)
  expect((await regen.json()).regenerated_from_message_id).toBe("answer")
  expect(calls).toHaveLength(2)
  expect(calls[1]?.headers["idempotency-key"]).toBe("same-key")
  expect(bodies[1]).toBe("{}")
  expect(calls[0]?.headers.cookie).toBe("kokoro-issuer.session_token=fixture")
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


it("returns only the complete private bytes of an exact workspace version and rejects Range before contacting BFF", async () => {
  const version = "wsv_" + "a".repeat(64)
  const path = ["sessions", "session", "runs", "run", "workspace-outputs", version, "content"]
  const body = Buffer.from('{"text":"原内容"}')
  const get = (headers?: HeadersInit) => GET(new Request(`http://web.test/api/session/${path.join("/")}`, headers === undefined ? undefined : { headers }), {
    params: Promise.resolve({ path }),
  })
  peer = (req, res) => {
    res.writeHead(200, {
      "content-type": "application/json; charset=UTF-8",
      "content-length": body.length,
      "content-disposition": "attachment; filename=report.json",
      "cache-control": "no-store",
      "x-request-id": String(req.headers["x-kokoro-request-id"]),
    })
    res.end(body)
  }
  expect((await get({ Range: "bytes=0-1" })).status).toBe(400)
  expect(calls).toHaveLength(0)
  const result = await get()
  expect(result.status).toBe(200)
  expect(Buffer.from(await result.arrayBuffer())).toEqual(body)
  expect(result.headers.get("cache-control")).toBe("private, no-store")
  expect(result.headers.get("x-content-type-options")).toBe("nosniff")
  expect(calls.map(call => call.url)).toEqual([`/v1/${path.join("/")}`])
})
