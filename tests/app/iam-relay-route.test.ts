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
  KOKORO_OIDC_CLIENT_ID: "web-client",
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

  it("turns only the authorize owner's exact redirect JSON into browser navigation", async () => {
    const target = "https://web.example.test/auth/sign-in?sig=%2BAb"
    requestIamRelay.mockResolvedValue(upstream({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": "issuer-authorize" },
      setCookies: ["kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax"],
      body: JSON.stringify({ redirect: true, url: target }),
    }))
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/oauth2/authorize?client_id=web"),
      params(["oauth2", "authorize"]))

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(target)
    expect(response.headers.get("content-type")).toBeNull()
    expect(response.headers.get("content-length")).toBeNull()
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-request-id")).toBe("issuer-authorize")
    expect(response.headers.getSetCookie()).toEqual(["kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax"])
    expect(await response.text()).toBe("")

    const other = await GET(browserRequest("https://web.example.test/iam/get-session"), params(["get-session"]))
    expect(other.status).toBe(200)
    expect(other.headers.get("location")).toBeNull()
    expect(await other.json()).toEqual({ redirect: true, url: target })
  })

  it.each([
    { redirect: true, url: "https://evil.example/auth/sign-in?sig=%2BAb" },
    { redirect: true, url: "/auth/sign-in?sig=%2BAb" },
    { redirect: true, url: "https://web.example.test/auth/sign-in" },
    { redirect: true, url: "https://web.example.test/auth/%73ign-in?sig=%2BAb" },
    { redirect: true, url: "https://web.example.test/auth/sign-in?sig=%2BAb", extra: "drift" },
    { redirect: false, url: "https://web.example.test/auth/sign-in?sig=%2BAb" },
  ])("rejects invalid authorize redirect JSON without leaking issuer body or cookie", async (payload) => {
    requestIamRelay.mockResolvedValue(upstream({ status: 200, headers: { "content-type": "application/json" },
      setCookies: ["kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax"],
      body: JSON.stringify(payload) }))
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/oauth2/authorize?client_id=web"),
      params(["oauth2", "authorize"]))
    expect(response.status).toBe(502)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await response.text()).not.toContain("evil.example")
  })

  it("relays only the fixed issuer logout URL and strips confirmation cookie from GET", async () => {
    requestIamRelay.mockResolvedValue(upstream({ headers: { "content-type": "text/html; charset=utf-8" },
      setCookies: ["kokoro-issuer.session_token.oauth_logout_confirmation=signed; Path=/iam/oauth2/end-session/confirm; HttpOnly; SameSite=Lax"], body: "confirm" }))
    const { GET } = await import("@/app/iam/[...path]/route")
    const target = "https://web.example.test/iam/oauth2/end-session?client_id=web-client&post_logout_redirect_uri=https%3A%2F%2Fweb.example.test%2Fauth%2Fsign-in"
    const response = await GET(browserRequest(target, { headers: { cookie:
      "kokoro-issuer.session_token=issuer; kokoro-issuer.session_token.oauth_logout_confirmation=old; kokoro_product_session=product" } }),
    params(["oauth2", "end-session"]))
    expect(response.status).toBe(200)
    expect(requestIamRelay.mock.calls[0]?.[0].headers.get("cookie")).toBe("kokoro-issuer.session_token=issuer")
    expect(response.headers.getSetCookie()).toHaveLength(1)
    for (const bad of [
      "?client_id=web-client&post_logout_redirect_uri=https%3A%2F%2Fevil.test%2Fauth%2Fsign-in",
      "?client_id=evil&post_logout_redirect_uri=https%3A%2F%2Fweb.example.test%2Fauth%2Fsign-in",
      "?client_id=web-client&post_logout_redirect_uri=https%3A%2F%2Fweb.example.test%2Fauth%2Fsign-in&state=x",
    ]) {
      const rejected = await GET(browserRequest(`https://web.example.test/iam/oauth2/end-session${bad}`),
        params(["oauth2", "end-session"]))
      expect(rejected.status).toBe(400)
    }
    expect(requestIamRelay).toHaveBeenCalledTimes(1)
  })

  it("posts only signed logout confirmation with exact Origin and form to BFF", async () => {
    requestIamRelay.mockResolvedValue(upstream({ status: 302, headers: { location: "/auth/sign-in" },
      setCookies: ["kokoro-issuer.session_token=; Path=/iam; Max-Age=0; HttpOnly; SameSite=Lax"] }))
    const { POST } = await import("@/app/iam/[...path]/route")
    const target = "https://web.example.test/iam/oauth2/end-session/confirm"
    const cookie = "kokoro-issuer.session_token=issuer; kokoro-issuer.session_token.oauth_logout_confirmation=signed; kokoro_product_session=product"
    const good = () => browserRequest(target, { method: "POST", headers: { origin: "https://web.example.test",
      "content-type": "application/x-www-form-urlencoded", cookie }, body: "action=confirm" })
    const response = await POST(good(), params(["oauth2", "end-session", "confirm"]))
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/auth/sign-in")
    const call = requestIamRelay.mock.calls[0]?.[0]
    expect(call.url).toBe("http://bff.test/iam/oauth2/end-session/confirm")
    expect(call.headers.get("cookie")).toBe("kokoro-issuer.session_token=issuer; kokoro-issuer.session_token.oauth_logout_confirmation=signed")
    expect(call.headers.get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(new TextDecoder().decode(call.body)).toBe("action=confirm")
    for (const invalid of [
      browserRequest(target, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: "action=confirm" }),
      browserRequest(target, { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/x-www-form-urlencoded", cookie }, body: "action=confirm" }),
      browserRequest(target, { method: "POST", headers: { origin: "https://web.example.test", "content-type": "application/x-www-form-urlencoded", cookie }, body: "action=cancel" }),
      browserRequest(target, { method: "POST", headers: { origin: "https://web.example.test", "content-type": "application/x-www-form-urlencoded", cookie: "kokoro-issuer.session_token=issuer" }, body: "action=confirm" }),
    ]) expect((await POST(invalid, params(["oauth2", "end-session", "confirm"]))).status).toBeGreaterThanOrEqual(400)
    expect(requestIamRelay).toHaveBeenCalledTimes(1)
  })

  it("cuts off an application-visible slow confirmation stream within five seconds without opening BFF", async () => {
    const { POST } = await import("@/app/iam/[...path]/route")
    const url = "https://web.example.test/iam/oauth2/end-session/confirm"
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode("action="))
    } })
    const request = browserRequest(url, { method: "POST", headers: { origin: "https://web.example.test",
      "content-type": "application/x-www-form-urlencoded" }, body, duplex: "half" } as RequestInit)
    const started = Date.now()
    const response = await POST(request, params(["oauth2", "end-session", "confirm"]))
    expect(response.status).toBe(400)
    expect(Date.now() - started).toBeLessThan(6_000)
    expect(requestIamRelay).not.toHaveBeenCalled()
  }, 8_000)

  it.each([
    ["GET", "https://web.example.test/iam/oauth2/userinfo", ["oauth2", "userinfo"]],
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
      const response = await handler(browserRequest("https://web.example.test/iam/oauth2/authorize", { method }))
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
