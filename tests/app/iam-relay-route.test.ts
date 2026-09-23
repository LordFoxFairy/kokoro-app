import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { requestIamRelay } = vi.hoisted(() => ({ requestIamRelay: vi.fn() }))

vi.mock("@/lib/server/iam-relay-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/iam-relay-transport")>()),
  requestIamRelay,
}))

const ENV = {
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "web-bff-secret",
  KOKORO_WEB_ORIGIN: "https://web.example.test",
}

function params(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) }
}

function browserRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("host")) headers.set("host", new URL(url).host)
  return new Request(url, { ...init, headers })
}

function upstream(input: {
  status?: number
  headers?: HeadersInit
  setCookies?: string[]
  body?: string
} = {}) {
  return {
    status: input.status ?? 200,
    headers: new Headers(input.headers),
    setCookies: input.setCookies ?? [],
    body: new TextEncoder().encode(input.body ?? "ok"),
  }
}

describe("/iam/[...path] read-only relay", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(ENV)) process.env[name] = value
    requestIamRelay.mockReset()
  })

  afterEach(() => {
    for (const name of Object.keys(ENV)) delete process.env[name]
  })

  it("relays an allowed GET only to BFF with rebuilt service identity and issuer cookies", async () => {
    requestIamRelay.mockResolvedValue(upstream({ headers: { "content-type": "application/json", "x-request-id": "upstream-1" }, body: "{}" }))
    const { GET } = await import("@/app/iam/[...path]/route")

    const response = await GET(browserRequest("https://web.example.test/iam/get-session?state=one", {
      headers: {
        accept: "application/json",
        cookie: "kokoro_session=product; authjs.session-token=rp; kokoro-issuer.session_token=issuer",
        origin: "https://web.example.test",
        "x-kokoro-service": "attacker",
        "x-kokoro-internal-secret": "attacker-secret",
        "x-request-id": "browser-request",
      },
    }), params(["get-session"]))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("{}")
    expect(requestIamRelay).toHaveBeenCalledOnce()
    const call = requestIamRelay.mock.calls[0]?.[0] as { url: string; headers: Headers }
    expect(call.url).toBe("http://bff.test/iam/get-session?state=one")
    expect(call.headers.get("accept")).toBe("application/json")
    expect(call.headers.get("cookie")).toBe("kokoro-issuer.session_token=issuer")
    expect(call.headers.get("origin")).toBe("https://web.example.test")
    expect(call.headers.get("x-kokoro-service")).toBe("web-bff")
    expect(call.headers.get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(call.headers.get("x-request-id")).toBe("browser-request")
    expect(call.headers.has("authorization")).toBe(false)
  })

  it("preserves a valid native redirect and each Set-Cookie field", async () => {
    requestIamRelay.mockResolvedValue(upstream({
      status: 302,
      headers: {
        location: "/auth/sign-in?interaction=one",
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-request-id": "issuer-request",
      },
      setCookies: [
        "kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax",
        "kokoro-issuer.session_data=two; Path=/iam; HttpOnly; SameSite=Lax",
      ],
      body: "redirect",
    }))
    const { GET } = await import("@/app/iam/[...path]/route")

    const response = await GET(
      browserRequest("https://web.example.test/iam/oauth2/authorize?client_id=web"),
      params(["oauth2", "authorize"]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/auth/sign-in?interaction=one")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-request-id")).toBe("issuer-request")
    expect(response.headers.getSetCookie()).toEqual([
      "kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax",
      "kokoro-issuer.session_data=two; Path=/iam; HttpOnly; SameSite=Lax",
    ])
    expect(await response.text()).toBe("redirect")
  })

  it.each([
    ["GET", "https://web.example.test/iam/oauth2/userinfo", ["oauth2", "userinfo"]],
    ["GET", "https://web.example.test/iam/oauth2/end-session", ["oauth2", "end-session"]],
    ["GET", "https://web.example.test/iam/unknown", ["unknown"]],
    ["GET", "https://web.example.test/iam/%6awks", ["jwks"]],
  ])("rejects %s %s before opening BFF", async (method, url, path) => {
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest(url, { method }), params(path))

    expect(response.status).toBe(404)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it("rejects every non-GET browser method before opening BFF", async () => {
    const route = await import("@/app/iam/[...path]/route")
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
      const handler = route[method]
      expect(handler, `${method} handler`).toBeTypeOf("function")
      const response = handler(browserRequest("https://web.example.test/iam/oauth2/authorize", { method }))
      expect(response.status, method).toBe(405)
      expect(response.headers.get("allow"), method).toBe("GET")
    }
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it.each([
    { headers: { authorization: "Bearer browser-token" }, status: 403 },
    { headers: { origin: "https://evil.example" }, status: 403 },
    { headers: { "transfer-encoding": "chunked" }, status: 400 },
    { headers: { cookie: "kokoro-issuer.session_token=one; kokoro-issuer.session_token=two" }, status: 400 },
    { headers: { "x-large": "a".repeat(17_000) }, status: 413 },
  ])("fails closed for unsafe browser input", async ({ headers, status }) => {
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(
      browserRequest("https://web.example.test/iam/jwks", { headers }),
      params(["jwks"]),
    )

    expect(response.status).toBe(status)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it("rejects an attacker-controlled request origin even when Origin is absent", async () => {
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(
      browserRequest("https://evil.example/iam/jwks"),
      params(["jwks"]),
    )

    expect(response.status).toBe(403)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it.each([
    upstream({ status: 302, headers: { location: "https://evil.example/callback" } }),
    upstream({ status: 302, headers: { location: "/%2e%2e/auth/sign-in?interaction=one" } }),
    upstream({ status: 302, headers: { location: "/iam/oauth2/%61uthorize?client_id=web" } }),
    upstream({ status: 302, headers: { location: "/iam/oauth2//authorize?client_id=web" } }),
    upstream({ status: 302, headers: { location: "/iam/oauth2/../jwks" } }),
    upstream({ headers: { "x-request-id": "bad request id" } }),
    upstream({ setCookies: ["kokoro_session=leak; Path=/; HttpOnly; SameSite=Lax"] }),
    upstream({ setCookies: ["kokoro-issuer.session_token=one; Domain=example.test; Path=/iam; HttpOnly; SameSite=Lax"] }),
    upstream({ setCookies: [
      "kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax",
      "kokoro-issuer.session_token=two; Path=/iam; HttpOnly; SameSite=Lax",
    ] }),
  ])("rejects unsafe upstream metadata instead of emitting it", async (unsafeUpstream) => {
    requestIamRelay.mockResolvedValue(unsafeUpstream)
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/jwks"), params(["jwks"]))

    expect(response.status).toBe(502)
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it("fails closed when BFF relay configuration is absent", async () => {
    delete process.env.KOKORO_INTERNAL_SECRET_WEB_BFF
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/jwks"), params(["jwks"]))

    expect(response.status).toBe(503)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it("fails closed when the fixed public Web origin is absent", async () => {
    delete process.env.KOKORO_WEB_ORIGIN
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/jwks"), params(["jwks"]))

    expect(response.status).toBe(503)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it.each([
    "https://web.example.test/",
    "https://web.example.test/path",
    "ftp://web.example.test",
  ])("fails closed when the fixed public Web origin is not an exact HTTP origin: %s", async (origin) => {
    process.env.KOKORO_WEB_ORIGIN = origin
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/jwks"), params(["jwks"]))

    expect(response.status).toBe(503)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })
})
