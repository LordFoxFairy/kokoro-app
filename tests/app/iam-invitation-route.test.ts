import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { requestIamRelay, issueIamInteractionCsrf, consumeIamInteractionCsrf } = vi.hoisted(() => ({
  requestIamRelay: vi.fn(), issueIamInteractionCsrf: vi.fn(), consumeIamInteractionCsrf: vi.fn(),
}))

vi.mock("@/lib/server/iam-relay-transport", async (original) => ({
  ...(await original<typeof import("@/lib/server/iam-relay-transport")>()), requestIamRelay,
}))
vi.mock("@/lib/server/iam-interaction-csrf", async (original) => ({
  ...(await original<typeof import("@/lib/server/iam-interaction-csrf")>()), issueIamInteractionCsrf,
  consumeIamInteractionCsrf,
}))

const ID = "01234567-89ab-4cde-8f01-23456789abcd"
const ORIGIN = "https://web.example.test"
const ENV = {
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "web-bff-secret",
  KOKORO_WEB_ORIGIN: ORIGIN,
  KOKORO_TENANT_ID: "tenant-one",
  KOKORO_WEB_REDIS_URL: "redis://127.0.0.1:6379",
}

function request(path: string, headers: HeadersInit = {}, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, { ...init, headers: { host: "web.example.test", ...headers } })
}

describe("static invitation GET", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) process.env[key] = value
    requestIamRelay.mockReset()
    issueIamInteractionCsrf.mockReset()
    consumeIamInteractionCsrf.mockReset()
    consumeIamInteractionCsrf.mockResolvedValue(true)
    issueIamInteractionCsrf.mockImplementation(async ({ cookieName }: { cookieName: string }) => ({
      token: "csrf-proof", cookie: `${cookieName}=csrf-proof; Path=/iam/interactions/invitation; HttpOnly; SameSite=Lax`,
    }))
  })
  afterEach(() => { for (const key of Object.keys(ENV)) delete process.env[key] })

  it("shows a real independent issuer login and registration form without Product admission", async () => {
    const { GET } = await import("@/app/iam/interactions/invitation/route")
    const response = await GET(request(`/iam/interactions/invitation?id=${ID}`))
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(html).toContain('name="email"')
    expect(html).toContain('name="password"')
    expect(html).toContain('name="name"')
    expect(html).toContain('name="decision" value="sign-in"')
    expect(html).toContain('name="decision" value="sign-up"')
    expect(html).not.toContain("连接中")
    expect(html).not.toContain("重试登录")
    expect(requestIamRelay).not.toHaveBeenCalled()
    expect(issueIamInteractionCsrf).toHaveBeenCalledTimes(2)
  })

  it("renders only matching pending owner context through service-scoped BFF relay", async () => {
    requestIamRelay.mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "application/json" }), setCookies: [],
      body: new TextEncoder().encode(JSON.stringify({ data: { invitation_id: ID, tenant_id: "tenant-one", tenant_name: "Team Alpha",
        roles: ["member"], status: "pending", expires_at: "2026-10-01T12:00:00Z" } })) })
    const { GET } = await import("@/app/iam/interactions/invitation/route")
    const response = await GET(request(`/iam/interactions/invitation?id=${ID}`, {
      cookie: "kokoro_session=product; kokoro-issuer.session_token=issuer-one",
    }))
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain("Team Alpha")
    expect(html).toContain("member")
    expect(html).not.toContain('name="password"')
    const call = requestIamRelay.mock.calls[0]?.[0] as { url: string; headers: Headers }
    expect(call.url).toBe(`http://bff.test/iam/v1/tenants/tenant-one/invitations/${ID}/context`)
    expect(call.headers.get("cookie")).toBe("kokoro-issuer.session_token=issuer-one")
    expect(call.headers.get("x-kokoro-service")).toBe("web-bff")
    expect(call.headers.has("authorization")).toBe(false)
  })

  it("rejects malformed query and wrong-recipient owner response without disclosing context", async () => {
    const { GET } = await import("@/app/iam/interactions/invitation/route")
    const bad = await GET(request(`/iam/interactions/invitation?id=${ID}&id=${ID}`))
    expect(bad.status).toBe(404)
    expect(requestIamRelay).not.toHaveBeenCalled()
    requestIamRelay.mockResolvedValue({ status: 404, headers: new Headers({ "content-type": "application/json" }), setCookies: [],
      body: new TextEncoder().encode(JSON.stringify({ error: { code: "INVITATION_NOT_FOUND", message: "raw owner message" } })) })
    const hidden = await GET(request(`/iam/interactions/invitation?id=${ID}`, { cookie: "kokoro-issuer.session_token=wrong" }))
    expect(hidden.status).toBe(404)
    expect(await hidden.text()).not.toContain("raw owner message")
  })

  it("shows a safe expired state without exposing the owner error body", async () => {
    requestIamRelay.mockResolvedValue({ status: 409, headers: new Headers({ "content-type": "application/json" }), setCookies: [],
      body: new TextEncoder().encode(JSON.stringify({ error: { code: "INVITATION_EXPIRED", message: "secret owner text" } })) })
    const { GET } = await import("@/app/iam/interactions/invitation/route")
    const response = await GET(request(`/iam/interactions/invitation?id=${ID}`, { cookie: "kokoro-issuer.session_token=issuer" }))
    const html = await response.text()
    expect(response.status).toBe(409)
    expect(html).toContain("邀请已过期")
    expect(html).not.toContain("secret owner text")
  })

  it("signs in with a consumed invitation-bound proof and returns only issuer cookie and same-page navigation", async () => {
    requestIamRelay.mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "application/json" }),
      setCookies: ["kokoro-issuer.session_token=issuer; Path=/iam; HttpOnly; SameSite=Lax"],
      body: new TextEncoder().encode('{"token":"upstream-secret"}') })
    const { POST } = await import("@/app/iam/interactions/invitation/route")
    const response = await POST(request(`/iam/interactions/invitation?id=${ID}`, {
      origin: ORIGIN, "content-type": "application/x-www-form-urlencoded",
      cookie: "kokoro_iam_csrf_invite_signin=csrf-proof",
    }, { method: "POST", body: "decision=sign-in&email=invitee%40example.test&password=secret-password&csrf_token=csrf-proof" }))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`/iam/interactions/invitation?id=${ID}`)
    expect(response.headers.getSetCookie()).toContain("kokoro-issuer.session_token=issuer; Path=/iam; HttpOnly; SameSite=Lax")
    expect(await response.text()).not.toContain("upstream-secret")
    expect(consumeIamInteractionCsrf).toHaveBeenCalledWith(expect.objectContaining({ context: "sign-in", query: `?id=${ID}` }))
    const call = requestIamRelay.mock.calls[0]?.[0] as { url: string; body: Uint8Array }
    expect(call.url).toBe("http://bff.test/iam/sign-in/email")
    expect(JSON.parse(new TextDecoder().decode(call.body))).toEqual({ email: "invitee@example.test", password: "secret-password" })
  })

  it("registers with server-built invitation callback and never creates issuer or Product session", async () => {
    requestIamRelay.mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "application/json" }), setCookies: [],
      body: new TextEncoder().encode('{"user":{"email":"new@example.test"},"token":null}') })
    const { POST } = await import("@/app/iam/interactions/invitation/route")
    const response = await POST(request(`/iam/interactions/invitation?id=${ID}`, {
      origin: ORIGIN, "content-type": "application/x-www-form-urlencoded",
      cookie: "kokoro_iam_csrf_invite_signup=csrf-proof",
    }, { method: "POST", body: "decision=sign-up&name=New+Member&email=new%40example.test&password=secret-password&csrf_token=csrf-proof" }))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("请查收邮件")
    expect(response.headers.getSetCookie()).not.toEqual(expect.arrayContaining([expect.stringContaining("session_token=")]))
    const call = requestIamRelay.mock.calls[0]?.[0] as { url: string; body: Uint8Array; headers: Headers }
    expect(call.url).toBe("http://bff.test/iam/sign-up/email")
    expect(JSON.parse(new TextDecoder().decode(call.body))).toEqual({ name: "New Member", email: "new@example.test",
      password: "secret-password", callbackURL: `${ORIGIN}/iam/interactions/invitation?id=${ID}` })
    expect(call.headers.has("cookie")).toBe(false)
  })

  it("rejects reused or mismatched form proof before any upstream write", async () => {
    consumeIamInteractionCsrf.mockResolvedValue(false)
    const { POST } = await import("@/app/iam/interactions/invitation/route")
    const response = await POST(request(`/iam/interactions/invitation?id=${ID}`, {
      origin: ORIGIN, "content-type": "application/x-www-form-urlencoded",
      cookie: "kokoro_iam_csrf_invite_signin=csrf-proof",
    }, { method: "POST", body: "decision=sign-in&email=invitee%40example.test&password=secret-password&csrf_token=csrf-proof" }))
    expect(response.status).toBe(403)
    expect(requestIamRelay).not.toHaveBeenCalled()
  })
})
