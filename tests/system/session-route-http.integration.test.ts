import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/product-session", () => ({
  currentProductSession: vi.fn(async () => ({
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
  })),
}))

import { POST } from "@/app/api/session/[...path]/route"

type RunningServer = { server: Server; baseUrl: string }

async function listen(handler: RequestListener): Promise<RunningServer> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

describe("Chat BFF against a local BFF contract fixture", () => {
  const original = { ...process.env }
  let bff: RunningServer
  let receivedDomain = ""
  let receivedHost = ""
  let receivedAuthorization = ""
  let receivedHeaders: IncomingHttpHeaders = {}
  let receivedBody = ""

  beforeAll(async () => {
    bff = await listen((request, response) => {
      receivedHeaders = request.headers
      receivedHost = request.headers.host?.toString() ?? ""
      receivedDomain = request.headers.forwarded?.toString() ?? ""
      receivedAuthorization = request.headers.authorization?.toString() ?? ""
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString("utf8")
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        })
        response.end("data: chat-ok\n\n")
      })
    })
    process.env.KOKORO_WEB_AUTH_SECRET = "a".repeat(32)
    process.env.KOKORO_WEB_REDIS_URL = "redis://fixture.invalid/9"
    process.env.KOKORO_WEB_ORIGIN = "https://first.example"
    process.env.KOKORO_BFF_BASE_URL = bff.baseUrl
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => bff.server.close((error) => (error ? reject(error) : resolve())))
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key]
    }
    Object.assign(process.env, original)
  })

  it("forwards RFC 7239 authority and the sealed access token while keeping browser Host out of tenant selection", async () => {
    const response = await POST(
      new Request("https://first.example/api/session/run", {
        method: "POST",
        headers: {
          host: "first.example",
          origin: "https://first.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt: "hello" }),
      }),
      { params: Promise.resolve({ path: ["run"] }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(await response.text()).toContain("chat-ok")
    expect(receivedDomain).toBe("host=dev.kokoro.localhost")
    expect(receivedHost).not.toBe("first.example")
    expect(receivedAuthorization).toBe("Bearer product-access")
  })

  it("sends canonical MessageCreateRequest bytes with header-only idempotency and trusted identity", async () => {
    const response = await POST(new Request("https://first.example/api/session/sessions/ses_1/messages", {
      method: "POST",
      headers: {
        host: "first.example", origin: "https://first.example", "content-type": "application/json",
        "idempotency-key": "stable-message-1", authorization: "Bearer forged",
        "x-kokoro-tenant-id": "forged-tenant", "x-kokoro-principal-id": "forged-user",
        "x-kokoro-service": "forged-service",
      },
      body: JSON.stringify({ content: "hello", model: "model_1" }),
    }), { params: Promise.resolve({ path: ["sessions", "ses_1", "messages"] }) })

    expect(response.status).toBe(200)
    expect(receivedBody).toBe('{"content":"hello","model":"model_1"}')
    expect(receivedHeaders["idempotency-key"]).toBe("stable-message-1")
    expect(receivedAuthorization).toBe("Bearer product-access")
    expect(receivedHeaders["x-kokoro-service"]).toBe("web-bff")
    expect(receivedHeaders["x-kokoro-tenant-id"]).toBeUndefined()
    expect(receivedHeaders["x-kokoro-principal-id"]).toBeUndefined()
    expect(response.headers.get("cache-control")).toBe("private, no-store")
  })
})
