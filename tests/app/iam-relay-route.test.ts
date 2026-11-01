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

function upstream(input: { status?: number; headers?: HeadersInit; setCookies?: string[]; body?: string } = {}) {
  return {
    status: input.status ?? 200,
    headers: new Headers(input.headers),
    setCookies: input.setCookies ?? [],
    body: new TextEncoder().encode(input.body ?? "ok"),
  }
}

describe("/iam/[...path] native relay", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(ENV)) process.env[name] = value
    requestIamRelay.mockReset()
  })

  afterEach(() => {
    for (const name of Object.keys(ENV)) delete process.env[name]
  })

  it("relays get-session with rebuilt service identity and issuer cookies", async () => {
    requestIamRelay.mockResolvedValue(upstream({ headers: { "content-type": "application/json", "x-request-id": "upstream-1" }, body: "{}" }))
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(
      browserRequest("https://web.example.test/iam/get-session?state=one", {
        headers: {
          accept: "application/json",
          cookie: "kokoro_session=product; authjs.session-token=rp; kokoro-issuer.session_token=issuer",
          origin: "https://web.example.test",
          "x-kokoro-service": "attacker",
          "x-kokoro-internal-secret": "attacker-secret",
          "x-request-id": "browser-request",
        },
      }),
      params(["get-session"]),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("{}")
    const call = requestIamRelay.mock.calls[0]?.[0] as { url: string; headers: Headers }
    expect(call.url).toBe("http://bff.test/iam/get-session?state=one")
    expect(call.headers.get("cookie")).toBe("kokoro-issuer.session_token=issuer")
    expect(call.headers.get("x-kokoro-service")).toBe("web-bff")
    expect(call.headers.get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(call.headers.has("authorization")).toBe(false)
  })

  it("rejects removed OAuth routes before opening BFF", async () => {
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/oauth2/authorize"), params(["oauth2", "authorize"]))
    expect(response.status).toBe(404)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })

  it("preserves native redirects and each Set-Cookie field", async () => {
    requestIamRelay.mockResolvedValue(
      upstream({
        status: 302,
        headers: { location: "/auth/select-tenant?interaction=one", "cache-control": "no-store", "x-request-id": "issuer-request" },
        setCookies: ["kokoro-issuer.session_token=one; Path=/; HttpOnly; SameSite=Lax", "kokoro-issuer.session_data=two; Path=/; HttpOnly; SameSite=Lax"],
        body: "redirect",
      }),
    )
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(browserRequest("https://web.example.test/iam/verify-email?token=one"), params(["verify-email"]))
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/auth/select-tenant?interaction=one")
    expect(response.headers.getSetCookie()).toEqual([
      "kokoro-issuer.session_token=one; Path=/; HttpOnly; SameSite=Lax",
      "kokoro-issuer.session_data=two; Path=/; HttpOnly; SameSite=Lax",
    ])
  })

  it("relays native sign-out with the filtered session cookie", async () => {
    requestIamRelay.mockResolvedValue(upstream({ status: 204, headers: { "x-request-id": "signout" }, body: "" }))
    const { POST } = await import("@/app/iam/[...path]/route")
    const response = await POST(
      browserRequest("https://web.example.test/iam/sign-out", {
        method: "POST",
        headers: { origin: "https://web.example.test", cookie: "authjs.session-token=rp; kokoro-issuer.session_token=issuer" },
      }),
      params(["sign-out"]),
    )
    expect(response.status).toBe(204)
    const call = requestIamRelay.mock.calls[0]?.[0] as { url: string; headers: Headers }
    expect(call.url).toBe("http://bff.test/iam/sign-out")
    expect(call.headers.get("cookie")).toBe("kokoro-issuer.session_token=issuer")
  })

  it("accepts the empty urlencoded body emitted by the confirmation form", async () => {
    requestIamRelay.mockResolvedValue(upstream({ status: 204, body: "" }))
    const { POST } = await import("@/app/iam/[...path]/route")
    const response = await POST(
      browserRequest("https://web.example.test/iam/sign-out", {
        method: "POST",
        headers: { origin: "https://web.example.test", "content-type": "application/x-www-form-urlencoded" },
        body: "",
      }),
      params(["sign-out"]),
    )
    expect(response.status).toBe(204)
  })

  it("rejects authorization headers before native relay", async () => {
    const { GET } = await import("@/app/iam/[...path]/route")
    const response = await GET(
      browserRequest("https://web.example.test/iam/get-session", { headers: { authorization: "Bearer token" } }),
      params(["get-session"]),
    )
    expect(response.status).toBe(403)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })
})
