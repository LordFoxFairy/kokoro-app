import { createServer, type RequestListener, type Server } from "node:http"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { userRequestMagicLink, type AuthConfig } from "@/lib/server/auth"

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

describe("User auth BFF HTTP contract", () => {
  let user: RunningServer
  let receivedDomain = ""
  let receivedBody = ""

  beforeAll(async () => {
    user = await listen((request, response) => {
      receivedDomain = request.headers.forwarded?.toString() ?? ""
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString("utf8")
        const payload = JSON.stringify({ data: { email: "person@example.com", expires_at: "2099-01-01T00:00:00.000Z" } })
        response.writeHead(200, { "content-type": "application/json" })
        response.end(payload)
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => user.server.close((error) => error ? reject(error) : resolve()))
  })

  it("forwards the configured deployment domain without a browser tenant binding", async () => {
    const config: AuthConfig = {
      sessionSecrets: ["secret"],
      iamBaseUrl: user.baseUrl,
      domain: "dev.kokoro.localhost",
      internalSecret: "web-secret",
      mockWebhookSecret: null,
      secureCookies: true,
      revealDevLink: false,
    }
    const result = await userRequestMagicLink(
      config,
      "person@example.com",
      "nonce-hash",
    )

    expect(result).toEqual({ kind: "ok", linkToken: null })
    expect(receivedDomain).toBe("host=dev.kokoro.localhost")
    expect(JSON.parse(receivedBody)).toEqual({ email: "person@example.com", nonce_hash: "nonce-hash" })
  })
})
