import { createServer, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { GET } from "@/app/api/system/runtime-manifest/route"
import { requestWithDomain } from "@/lib/server/upstream-http"

type RunningServer = { server: Server; baseUrl: string }

async function listen(handler: RequestListener): Promise<RunningServer> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) })
  response.end(payload)
}

describe("Runtime Manifest BFF against local HTTP contract fixtures", () => {
  const originalBffBaseUrl = process.env.KOKORO_BFF_BASE_URL
  const originalDomain = process.env.KOKORO_DOMAIN
  let bff: RunningServer
  let receivedDomain = ""
  let receivedHost = ""

  beforeAll(async () => {
    bff = await listen((request, response) => {
      receivedDomain = request.headers.forwarded?.toString() ?? ""
      receivedHost = request.headers.host?.toString() ?? ""
      json(response, 200, {
        data: {
          tenant_id: "backend-resolved-tenant",
          product_id: "kokoro",
          locale: "en-US",
          navigation: [{ key: "chat", label: "Chat", href: "/app", featureFlag: "chat" }],
          locale_namespaces: ["common"],
          theme: { primary: "#123456", brandName: "Kokoro" },
          feature_flags: [{ key: "chat", enabled: true }],
          references: [],
          config_version: "1",
          release_id: null,
          digest: "integration-digest",
        },
        meta: { request_id: "runtime-integration" },
      })
    })
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    process.env.KOKORO_BFF_BASE_URL = bff.baseUrl
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => bff.server.close((error) => error ? reject(error) : resolve()))
    if (originalBffBaseUrl === undefined) delete process.env.KOKORO_BFF_BASE_URL
    else process.env.KOKORO_BFF_BASE_URL = originalBffBaseUrl
    if (originalDomain === undefined) delete process.env.KOKORO_DOMAIN
    else process.env.KOKORO_DOMAIN = originalDomain
  })

  it("uses configured RFC 7239 authority and never forwards the browser Host as tenant context", async () => {
    const response = await GET(new Request("https://first.example/api/system/runtime-manifest?product_id=kokoro", {
      headers: { host: "first.example", "x-kokoro-request-id": "integration-request" },
    }))
    const body = await response.json() as { data?: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(receivedDomain).toBe("host=dev.kokoro.localhost")
    expect(receivedHost).not.toBe("first.example")
    expect(body.data?.tenantId).toBeUndefined()
    expect(body.data?.productId).toBe("kokoro")
    expect(response.headers.get("x-request-id")).toBe("runtime-integration")
  })

  it("keeps the transport streaming-capable without forwarding a caller-supplied Host", async () => {
    let streamDomain = ""
    let streamHost = ""
    const probe = await listen((request, response) => {
      streamDomain = request.headers.forwarded?.toString() ?? ""
      streamHost = request.headers.host?.toString() ?? ""
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.write("data: first\n\n")
      setTimeout(() => response.end("data: second\n\n"), 1)
    })
    try {
      const response = await requestWithDomain(probe.baseUrl, "dev.kokoro.localhost", {
        method: "GET",
        headers: { host: "streaming.first.example", accept: "text/event-stream" },
      })
      expect(response.status).toBe(200)
      expect(streamDomain).toBe("host=dev.kokoro.localhost")
      expect(streamHost).not.toBe("streaming.first.example")
      expect(await response.text()).toContain("data: second")
    } finally {
      await new Promise<void>((resolve, reject) => probe.server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it("keeps the same product manifest when the browser URL host changes", async () => {
    const first = await GET(new Request("https://first.example/api/system/runtime-manifest?product_id=kokoro"))
    const second = await GET(new Request("https://second.example/api/system/runtime-manifest?product_id=kokoro"))

    const firstBody = await first.json() as { data?: { theme?: { primary?: string; brandName?: string } } }
    const secondBody = await second.json() as { data?: { theme?: { primary?: string; brandName?: string } } }
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(firstBody.data?.theme).toEqual({ primary: "#123456", brandName: "Kokoro" })
    expect(secondBody.data?.theme).toEqual({ primary: "#123456", brandName: "Kokoro" })
  })

  it("fails closed when the business BFF base is absent", async () => {
    const explicitBffBaseUrl = process.env.KOKORO_BFF_BASE_URL
    delete process.env.KOKORO_BFF_BASE_URL

    try {
      const response = await GET(new Request("https://first.example/api/system/runtime-manifest?product_id=kokoro"))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: { code: "system_runtime_unavailable", message: "system_runtime_unavailable" },
        meta: { request_id: expect.any(String) },
      })
    } finally {
      if (explicitBffBaseUrl === undefined) delete process.env.KOKORO_BFF_BASE_URL
      else process.env.KOKORO_BFF_BASE_URL = explicitBffBaseUrl
    }
  })
})
