import { createServer, type Server } from "node:http"

import { afterEach, describe, expect, it, vi } from "vitest"

import { IamRelayTransportError, requestIamRelay } from "@/lib/server/iam-relay-transport"
import { validIamInteractionNavigation, validInvitationLocation } from "@/lib/server/iam-relay-response"

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

describe("native IAM relay transport", () => {
  const servers: Server[] = []

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    await Promise.all(servers.splice(0).map(close))
  })

  it("preserves separate Set-Cookie fields and native response metadata", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(302, {
        location: "/auth/sign-in?interaction=one",
        "cache-control": "no-store",
        "set-cookie": ["kokoro-issuer.session_token=one; Path=/; HttpOnly; SameSite=Lax", "kokoro-issuer.session_data=two; Path=/; HttpOnly; SameSite=Lax"],
      })
      response.end("redirect")
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")

    const result = await requestIamRelay({
      url: `http://127.0.0.1:${address.port}/iam/get-session`,
      headers: new Headers({ accept: "text/html" }),
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      maxResponseBytes: 1024,
      maxHeaderBytes: 4096,
    })

    expect(result.status).toBe(302)
    expect(result.headers.get("location")).toBe("/auth/sign-in?interaction=one")
    expect(result.setCookies).toEqual([
      "kokoro-issuer.session_token=one; Path=/; HttpOnly; SameSite=Lax",
      "kokoro-issuer.session_data=two; Path=/; HttpOnly; SameSite=Lax",
    ])
    expect(new TextDecoder().decode(result.body)).toBe("redirect")
  })

  it("sends a bounded native POST body without following redirects", async () => {
    let received = ""
    const server = createServer((request, response) => {
      expect(request.method).toBe("POST")
      expect(request.headers["content-type"]).toBe("application/json")
      request.on("data", (chunk: Buffer) => {
        received += chunk.toString("utf8")
      })
      request.on("end", () => {
        response.writeHead(302, {
          location: "/auth/select-tenant?sig=opaque",
          "set-cookie": ["kokoro-issuer.session_token=one; Path=/; HttpOnly; SameSite=Lax", "kokoro-issuer.session_data=two; Path=/; HttpOnly; SameSite=Lax"],
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

  it.each(["client", "form"] as const)("normalizes the actual %s empty sign-out to the IAM JSON wire through the real transport", async kind => {
    const received: { method: string | undefined; url: string | undefined; cookie: string | undefined; origin: string | undefined; contentType: string | undefined; bytes: number; body: string }[] = []
    const deletion = "__Secure-kokoro-issuer.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"
    const server = createServer((request, response) => {
      let bytes = 0
      let body = ""
      request.on("data", (chunk: Buffer) => { bytes += chunk.byteLength; body += chunk.toString("utf8") })
      request.on("end", () => {
        const contentType = request.headers["content-type"]
        received.push({ method: request.method, url: request.url, cookie: request.headers.cookie, origin: request.headers.origin, contentType, bytes, body })
        // The locked IAM HTTP parser requires JSON media type and a parseable
        // object even though its sign-out schema accepts an optional body.
        const status = contentType !== "application/json" ? 415 : body !== "{}" || bytes !== 2 ? 400 : 200
        response.writeHead(status, { "content-type": "application/json", ...(status === 200 ? { "set-cookie": deletion } : {}) })
        response.end(JSON.stringify({ success: status === 200 }))
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not bind")
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("KOKORO_BFF_BASE_URL", `http://127.0.0.1:${address.port}`)
    vi.stubEnv("KOKORO_WEB_ORIGIN", "https://web.example.test")
    vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture-service-secret")
    const { POST } = await import("@/app/iam/[...path]/route")
    const response = await POST(new Request("https://web.example.test/iam/sign-out", {
      method: "POST",
      headers: {
        host: "web.example.test", origin: "https://web.example.test",
        cookie: "unrelated=private; __Secure-kokoro-issuer.session_token=issuer",
        ...(kind === "form" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(kind === "form" ? { body: "" } : {}),
    }), { params: Promise.resolve({ path: ["sign-out"] }) })
    expect({ status: response.status, upstreamRequests: received.length }).toEqual({ status: 200, upstreamRequests: 1 })
    expect(received).toEqual([{
      method: "POST", url: "/iam/sign-out", cookie: "__Secure-kokoro-issuer.session_token=issuer",
      origin: "https://web.example.test", contentType: "application/json", bytes: 2, body: "{}",
    }])
    expect(response.headers.getSetCookie()).toEqual([deletion])
    expect(await response.json()).toEqual({ success: true })
  })

  it.each([
    { rejected: "body", status: 400 },
    { rejected: "origin", status: 403 },
    { rejected: "cookie", status: 400 },
    { rejected: "cancelled", status: 503 },
  ])("does not normalize a $rejected sign-out request into an upstream action", async ({ rejected, status }) => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("KOKORO_BFF_BASE_URL", "http://127.0.0.1:9")
    vi.stubEnv("KOKORO_WEB_ORIGIN", "https://web.example.test")
    vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "fixture-service-secret")
    const fetcher = vi.fn().mockRejectedValue(new Error("unexpected upstream request"))
    vi.stubGlobal("fetch", fetcher)
    const controller = new AbortController()
    if (rejected === "cancelled") controller.abort()
    const { POST } = await import("@/app/iam/[...path]/route")
    const response = await POST(new Request("https://web.example.test/iam/sign-out", {
      method: "POST", signal: controller.signal,
      headers: {
        host: "web.example.test",
        origin: rejected === "origin" ? "https://other.example.test" : "https://web.example.test",
        cookie: rejected === "cookie" ? "__Secure-kokoro-issuer.session_token=one; __Secure-kokoro-issuer.session_token=two" : "__Secure-kokoro-issuer.session_token=issuer",
        "content-type": "application/json",
      },
      ...(rejected === "body" ? { body: "{}" } : {}),
    }), { params: Promise.resolve({ path: ["sign-out"] }) })
    expect(response.status).toBe(status)
    expect(fetcher).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([])
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

    await expect(
      requestIamRelay({
        url: "http://bff.test/iam/get-session",
        headers: new Headers(),
        signal: new AbortController().signal,
        timeoutMs: 1_000,
        maxResponseBytes: 4,
        maxHeaderBytes: 4096,
      }),
    ).rejects.toBeInstanceOf(IamRelayTransportError)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("propagates caller cancellation to the upstream request", async () => {
    let upstreamSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => {
          upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), { once: true })
        })
      }),
    )
    const caller = new AbortController()
    const pending = requestIamRelay({
      url: "http://bff.test/iam/get-session",
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
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined
        return new Promise<Response>((_resolve, reject) => {
          upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), { once: true })
        })
      }),
    )

    await expect(
      requestIamRelay({
        url: "http://bff.test/iam/get-session",
        headers: new Headers(),
        signal: new AbortController().signal,
        timeoutMs: 10,
        maxResponseBytes: 1024,
        maxHeaderBytes: 4096,
      }),
    ).rejects.toBeInstanceOf(IamRelayTransportError)
    expect(upstreamSignal?.aborted).toBe(true)
  })
})

describe("IAM interaction navigation allowlist", () => {
  const origin = "https://web.example.test"

  it.each(["https://web.example.test/auth/sign-in?sig=%2BAb", "https://web.example.test/auth/select-tenant?sig=%2BAb"])(
    "accepts an exact Web interaction URL %s",
    (url) => {
      expect(validIamInteractionNavigation(url, origin)).toBe(true)
    },
  )

  it.each([
    "/auth/select-tenant?sig=%2BAb",
    "https://evil.example/auth/select-tenant?sig=%2BAb",
    "https://web.example.test.evil.example/auth/select-tenant?sig=%2BAb",
    "https://web.example.test/auth/select-tenant",
    "https://web.example.test/auth/%73elect-tenant?sig=%2BAb",
    "https://web.example.test/auth/../auth/select-tenant?sig=%2BAb",
    "https://web.example.test/unknown?sig=%2BAb",
    "https://web.example.test/auth/select-tenant?sig=%2BAb#fragment",
    "javascript:alert(1)",
  ])("rejects an unsafe or unsupported continuation URL %s", (url) => {
    expect(validIamInteractionNavigation(url, origin)).toBe(false)
  })
})

describe("invitation verify-email Location", () => {
  const origin = "https://web.example.test"
  const id = "01234567-89ab-4cde-8f01-23456789abcd"

  it("accepts only the owner-ordered same-origin invitation query from verify-email", () => {
    expect(validInvitationLocation(`${origin}/iam/interactions/invitation?id=${id}`, origin, "/verify-email")).toBe(true)
    expect(validInvitationLocation(`${origin}/iam/interactions/invitation?id=${id}&error=INVALID_TOKEN`, origin, "/verify-email")).toBe(true)
    for (const value of [
      `${origin}/iam/interactions/invitation?id=${id}&error=OTHER`,
      `/iam/interactions/invitation?error=INVALID_TOKEN&id=${id}`,
      `/iam/interactions/invitation?id=${id}&id=${id}`,
      `/iam/interactions/invitation?id=%30${id.slice(1)}`,
      `https://evil.example.test/iam/interactions/invitation?id=${id}`,
      `/auth/invitation?id=${id}`,
    ])
      expect(validInvitationLocation(value, origin, "/verify-email"), value).toBe(false)
    expect(validInvitationLocation(`/iam/interactions/invitation?id=${id}`, origin, "/oauth2/authorize")).toBe(false)
  })
})
