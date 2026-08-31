import { createServer, type Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { fetchWithDomain, requestWithDomain } from "@/lib/server/upstream-http"

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

describe("server upstream transport", () => {
  const servers: Server[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close))
  })

  it("overrides caller forwarding headers with the server deployment authority", async () => {
    let receivedForwarded = ""
    let receivedLegacyForwarding = ""
    const server = createServer((request, response) => {
      receivedForwarded = request.headers.forwarded?.toString() ?? ""
      receivedLegacyForwarding = [
        request.headers["x-forwarded-host"],
        request.headers["x-forwarded-proto"],
        request.headers["x-forwarded-for"],
      ].filter(Boolean).join(",")
      response.writeHead(200, { "content-type": "application/json" })
      response.end("{}")
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")

    const response = await fetchWithDomain(`http://127.0.0.1:${address.port}/probe`, "dev.kokoro.localhost", {
      headers: {
        forwarded: "host=attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "198.51.100.10",
        "x-domain": "attacker.example",
        "x-kokoro-tenant-id": "attacker-tenant",
        "x-kokoro-site-id": "attacker-site",
        "x-request-id": "request-1",
      },
    })

    expect(response.status).toBe(200)
    expect(receivedForwarded).toBe("host=dev.kokoro.localhost")
    expect(receivedLegacyForwarding).toBe("")
  })

  it("drops custom domain and legacy tenant headers before the upstream hop", async () => {
    let receivedDomain: string | undefined
    let receivedTenant: string | undefined
    let receivedSite: string | undefined
    const server = createServer((request, response) => {
      receivedDomain = request.headers["x-domain"]?.toString()
      receivedTenant = request.headers["x-kokoro-tenant-id"]?.toString()
      receivedSite = request.headers["x-kokoro-site-id"]?.toString()
      response.writeHead(204)
      response.end()
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")

    const response = await fetchWithDomain(`http://127.0.0.1:${address.port}/probe`, "dev.kokoro.localhost", {
      headers: {
        "x-domain": "attacker.example",
        "x-kokoro-tenant-id": "attacker-tenant",
        "x-kokoro-site-id": "attacker-site",
      },
    })

    expect(response.status).toBe(204)
    expect(receivedDomain).toBeUndefined()
    expect(receivedTenant).toBeUndefined()
    expect(receivedSite).toBeUndefined()
  })

  it("preserves a streaming response and injects RFC 7239 Forwarded", async () => {
    let receivedForwarded = ""
    const server = createServer((request, response) => {
      receivedForwarded = request.headers.forwarded?.toString() ?? ""
      response.writeHead(200, { "content-type": "text/event-stream" })
      response.write("data: one\n\n")
      setTimeout(() => response.end("data: two\n\n"), 1)
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")

    const response = await requestWithDomain(`http://127.0.0.1:${address.port}/events`, "dev.kokoro.localhost", {
      method: "GET",
      headers: { accept: "text/event-stream" },
    })

    expect(response.status).toBe(200)
    expect(receivedForwarded).toBe("host=dev.kokoro.localhost")
    expect(await response.text()).toContain("data: two")
  })
})
