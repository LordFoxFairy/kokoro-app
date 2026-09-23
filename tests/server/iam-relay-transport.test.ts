import { createServer, type Server } from "node:http"

import { afterEach, describe, expect, it, vi } from "vitest"

import { IamRelayTransportError, requestIamRelay } from "@/lib/server/iam-relay-transport"
import { validIamInteractionNavigation } from "@/lib/server/iam-relay-response"

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

describe("native IAM relay transport", () => {
  const servers: Server[] = []

  afterEach(async () => {
    vi.unstubAllGlobals()
    await Promise.all(servers.splice(0).map(close))
  })

  it("preserves separate Set-Cookie fields and native response metadata", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(302, {
        location: "/auth/sign-in?interaction=one",
        "cache-control": "no-store",
        "set-cookie": [
          "kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax",
          "kokoro-issuer.session_data=two; Path=/iam; HttpOnly; SameSite=Lax",
        ],
      })
      response.end("redirect")
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")

    const result = await requestIamRelay({
      url: `http://127.0.0.1:${address.port}/iam/oauth2/authorize`,
      headers: new Headers({ accept: "text/html" }),
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      maxResponseBytes: 1024,
      maxHeaderBytes: 4096,
    })

    expect(result.status).toBe(302)
    expect(result.headers.get("location")).toBe("/auth/sign-in?interaction=one")
    expect(result.setCookies).toEqual([
      "kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax",
      "kokoro-issuer.session_data=two; Path=/iam; HttpOnly; SameSite=Lax",
    ])
    expect(new TextDecoder().decode(result.body)).toBe("redirect")
  })

  it("sends a bounded native POST body without following redirects", async () => {
    let received = ""
    const server = createServer((request, response) => {
      expect(request.method).toBe("POST")
      expect(request.headers["content-type"]).toBe("application/json")
      request.on("data", (chunk: Buffer) => { received += chunk.toString("utf8") })
      request.on("end", () => {
        response.writeHead(302, {
          location: "/auth/select-tenant?sig=opaque",
          "set-cookie": [
            "kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax",
            "kokoro-issuer.session_data=two; Path=/iam; HttpOnly; SameSite=Lax",
          ],
        })
        response.end()
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
    const result = await requestIamRelay({
      url: `http://127.0.0.1:${address.port}/iam/sign-in/email`,
      method: "POST",
      body: new TextEncoder().encode('{"email":"a@example.test","password":"secret"}'),
      headers: new Headers({ "content-type": "application/json" }),
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      maxRequestBytes: 65_536,
      maxResponseBytes: 1024,
      maxHeaderBytes: 4096,
    })
    expect(received).toBe('{"email":"a@example.test","password":"secret"}')
    expect(result.status).toBe(302)
    expect(result.headers.get("location")).toBe("/auth/select-tenant?sig=opaque")
    expect(result.setCookies).toHaveLength(2)
  })

  it("cancels an oversized upstream body before rejecting", async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"))
      },
      cancel,
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

    await expect(requestIamRelay({
      url: "http://bff.test/iam/jwks",
      headers: new Headers(),
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      maxResponseBytes: 4,
      maxHeaderBytes: 4096,
    })).rejects.toBeInstanceOf(IamRelayTransportError)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("propagates caller cancellation to the upstream request", async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), { once: true })
      })
    }))
    const caller = new AbortController()
    const pending = requestIamRelay({
      url: "http://bff.test/iam/jwks",
      headers: new Headers(),
      signal: caller.signal,
      timeoutMs: 1_000,
      maxResponseBytes: 1024,
      maxHeaderBytes: 4096,
    })

    caller.abort(new Error("browser disconnected"))

    await expect(pending).rejects.toBeInstanceOf(IamRelayTransportError)
    expect(upstreamSignal?.aborted).toBe(true)
  })

  it("aborts an upstream that exceeds the relay deadline", async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), { once: true })
      })
    }))

    await expect(requestIamRelay({
      url: "http://bff.test/iam/jwks",
      headers: new Headers(),
      signal: new AbortController().signal,
      timeoutMs: 10,
      maxResponseBytes: 1024,
      maxHeaderBytes: 4096,
    })).rejects.toBeInstanceOf(IamRelayTransportError)
    expect(upstreamSignal?.aborted).toBe(true)
  })
})

describe("IAM interaction navigation allowlist", () => {
  const origin = "https://web.example.test"

  it.each([
    "https://web.example.test/auth/sign-in?sig=%2BAb",
    "https://web.example.test/auth/select-tenant?sig=%2BAb",
    "https://web.example.test/auth/consent?sig=%2BAb",
  ])("accepts an exact Web interaction URL %s", (url) => {
    expect(validIamInteractionNavigation(url, origin)).toBe(true)
  })

  it.each([
    "/auth/select-tenant?sig=%2BAb",
    "https://evil.example/auth/select-tenant?sig=%2BAb",
    "https://web.example.test.evil.example/auth/select-tenant?sig=%2BAb",
    "https://web.example.test/auth/select-tenant",
    "https://web.example.test/auth/%73elect-tenant?sig=%2BAb",
    "https://web.example.test/auth/../auth/consent?sig=%2BAb",
    "https://web.example.test/unknown?sig=%2BAb",
    "https://web.example.test/auth/select-tenant?sig=%2BAb#fragment",
    "javascript:alert(1)",
  ])("rejects an unsafe or unsupported continuation URL %s", (url) => {
    expect(validIamInteractionNavigation(url, origin)).toBe(false)
  })
})
