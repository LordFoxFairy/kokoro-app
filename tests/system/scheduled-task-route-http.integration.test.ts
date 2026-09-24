import { createServer, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/product-session", () => ({
  currentProductSession: vi.fn(async () => ({
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
  })),
}))

import { GET } from "@/app/api/scheduled-tasks/[[...path]]/route"

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
  let publicError = false

  beforeAll(async () => {
    bff = await listen((request, response) => {
      receivedPath = request.url ?? ""
      receivedNamespace = request.headers["x-kokoro-namespace"]?.toString() ?? ""
      receivedUser = request.headers["x-kokoro-principal-id"]?.toString() ?? ""
      if (publicError) {
        response.writeHead(403, { "content-type": "application/json", "cache-control": "public,max-age=600" })
        response.end(JSON.stringify({ error: { code: "forbidden", message: "Denied" }, meta: { request_id: "fixture-request" } }))
        return
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          data: { tasks: [] },
          meta: { request_id: "fixture-request" },
        }),
      )
    })
    process.env.KOKORO_WEB_SESSION_SECRET = "integration-secret"
    process.env.KOKORO_WEB_AUTH_SECRET = "a".repeat(32)
    process.env.KOKORO_WEB_REDIS_URL = "redis://fixture.invalid/9"
    process.env.KOKORO_WEB_ORIGIN = "https://first.example"
    process.env.KOKORO_IAM_BASE_URL = "http://user.fixture"
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

  it("forwards the typed collection path and sealed identity without using browser host", async () => {
    const response = await GET(
      new Request("https://first.example/api/scheduled-tasks", {
        headers: { host: "first.example" },
      }),
      { params: Promise.resolve({ path: [] }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ tasks: [] })
    expect(receivedPath).toBe("/v1/scheduled-tasks")
    expect(receivedNamespace).toBe("")
    expect(receivedUser).toBe("")
  })

  it("does not cache a valid BFF error envelope even when upstream marks it public", async () => {
    publicError = true
    try {
      const response = await GET(
        new Request("https://first.example/api/scheduled-tasks", { headers: { host: "first.example" } }),
        { params: Promise.resolve({ path: [] }) },
      )
      expect(response.status).toBe(403)
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(await response.json()).toEqual({ error: "Denied", code: "forbidden" })
    } finally {
      publicError = false
    }
  })
})
