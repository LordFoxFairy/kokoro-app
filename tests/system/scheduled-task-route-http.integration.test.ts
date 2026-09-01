import { createServer, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { GET } from "@/app/api/scheduled-tasks/[[...path]]/route"
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

describe("Scheduled BFF against a local business BFF contract fixture", () => {
  const original = { ...process.env }
  let bff: RunningServer
  let receivedPath = ""
  let receivedNamespace = ""
  let receivedUser = ""

  beforeAll(async () => {
    bff = await listen((request, response) => {
      receivedPath = request.url ?? ""
      receivedNamespace = request.headers["x-kokoro-namespace"]?.toString() ?? ""
      receivedUser = request.headers["x-kokoro-principal-id"]?.toString() ?? ""
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ data: { tasks: [] }, meta: { request_id: "fixture-request" } }))
    })
    process.env.KOKORO_WEB_SESSION_SECRET = "integration-secret"
    process.env.KOKORO_IAM_BASE_URL = "http://user.fixture"
    process.env.KOKORO_BFF_BASE_URL = bff.baseUrl
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => bff.server.close((error) => error ? reject(error) : resolve()))
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete process.env[key]
    }
    Object.assign(process.env, original)
  })

  it("forwards the typed collection path and sealed identity without using browser host", async () => {
    const now = Math.floor(Date.now() / 1000)
    const sealed = sealEnvelope({
      runtime_jwt: "runtime.jwt.signature",
      access_exp: now + 3600,
      refresh_token: "refresh-token",
      user_id: "user-a",
      namespace: "personal",
      exp: now + 3600,
    }, ["integration-secret"])

    const response = await GET(
      new Request("https://first.example/api/scheduled-tasks", {
        headers: { host: "first.example", cookie: `kokoro_session=${sealed}` },
      }),
      { params: Promise.resolve({ path: [] }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tasks: [] })
    expect(receivedPath).toBe("/v1/scheduled-tasks")
    expect(receivedNamespace).toBe("personal")
    expect(receivedUser).toBe("user-a")
  })
})
