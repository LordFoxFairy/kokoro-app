import { createServer, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { POST } from "@/app/api/session/[...path]/route"
import { sealEnvelope } from "@/lib/server/session-envelope"

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

describe("Session BFF against a local session contract fixture", () => {
  const original = { ...process.env }
  let session: RunningServer
  let receivedDomain = ""
  let receivedHost = ""
  let receivedAuthorization = ""

  beforeAll(async () => {
    session = await listen((request, response) => {
      receivedHost = request.headers.host?.toString() ?? ""
      receivedDomain = request.headers.forwarded?.toString() ?? ""
      receivedAuthorization = request.headers.authorization?.toString() ?? ""
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      response.end("data: session-ok\n\n")
    })
    process.env.KOKORO_WEB_SESSION_SECRET = "integration-secret"
    process.env.KOKORO_USER_BASE_URL = "http://user.fixture"
    process.env.KOKORO_SESSION_BASE_URL = session.baseUrl
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => session.server.close((error) => error ? reject(error) : resolve()))
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key]
    }
    Object.assign(process.env, original)
  })

  it("forwards RFC 7239 authority and the sealed access token while keeping browser Host out of tenant selection", async () => {
    const now = Math.floor(Date.now() / 1000)
    const sealed = sealEnvelope({
      runtime_jwt: "runtime.jwt.signature",
      access_exp: now + 3600,
      refresh_token: "refresh-token",
      user_id: "user-a",
      namespace: "personal",
      exp: now + 3600,
    }, ["integration-secret"])

    const response = await POST(
      new Request("https://first.example/api/session/run", {
        method: "POST",
        headers: {
          host: "first.example",
          origin: "https://first.example",
          cookie: `kokoro_session=${sealed}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt: "hello" }),
      }),
      { params: Promise.resolve({ path: ["run"] }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(await response.text()).toContain("session-ok")
    expect(receivedDomain).toBe("host=dev.kokoro.localhost")
    expect(receivedHost).not.toBe("first.example")
    expect(receivedAuthorization).toBe("Bearer runtime.jwt.signature")
  })
})
