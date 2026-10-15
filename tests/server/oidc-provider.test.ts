import { NextRequest } from "next/server"
import type { OAuthConfig } from "next-auth/providers/oauth"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { nextAuth, issueOidcState, consumeOidcState, verifyProductIdentity, createSession, productSessionCookie, newSessionCandidate } = vi.hoisted(() => ({
  nextAuth: vi.fn(),
  issueOidcState: vi.fn(),
  consumeOidcState: vi.fn(), verifyProductIdentity: vi.fn(), createSession: vi.fn(), productSessionCookie: vi.fn(), newSessionCandidate: vi.fn(),
}))
vi.mock("next-auth", () => ({ default: nextAuth }))
vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))
vi.mock("@/lib/server/oidc-rp-transaction", () => ({
  issueOidcState,
  consumeOidcState,
  rpCleanupCookies: () => ["next-auth.state=; Max-Age=0", "next-auth.pkce.code_verifier=; Max-Age=0", "next-auth.nonce=; Max-Age=0"],
}))

vi.mock("@/lib/server/product-identity", () => ({ verifyProductIdentity }))
vi.mock("@/lib/server/product-session", async (original) => ({
  ...(await original<typeof import("@/lib/server/product-session")>()), productSessionCookie,
}))
vi.mock("@/lib/server/product-session-store", async (original) => ({
  ...(await original<typeof import("@/lib/server/product-session-store")>()), createSession, newSessionCandidate,
}))

import { parseProductReturnTarget } from "@/lib/product-return-target"
import { productLoginReturnCookie } from "@/lib/server/product-login-return"
import { GET, POST } from "@/app/api/auth/[...nextauth]/route"
import { oidcAuthOptions, oidcRpConfig, OIDC_SCOPE } from "@/lib/server/oidc-provider"

const BASE_SCOPE = "openid profile email offline_access iam:session-authorization.verify"
const TEAM_READ_SCOPES = ["iam:member.read", "iam:invitation.read", "iam:role.read"]
const TEAM_WRITE_SCOPES = ["iam:member.write", "iam:invitation.write"]
const TEAM_SCOPES = [...TEAM_READ_SCOPES, ...TEAM_WRITE_SCOPES]
const SKILL_SCOPES = ["iam:authorization.check", "iam:skill-authorization.check", "iam:publisher-profile.read"]
const ORIGINAL_SCOPE = `${BASE_SCOPE} ${TEAM_SCOPES.join(" ")}`
const EXPECTED_SCOPE = `${ORIGINAL_SCOPE} ${SKILL_SCOPES.join(" ")}`
const ENV = {
  NODE_ENV: "test",
  KOKORO_BFF_BASE_URL: "https://bff.example.test",
  KOKORO_WEB_ORIGIN: "https://web.example.test",
  KOKORO_DOMAIN: "web.example.test",
  KOKORO_TENANT_ID: "tenant-one",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "service-secret",
  KOKORO_OIDC_CLIENT_ID: "product-web",
  KOKORO_OIDC_CLIENT_SECRET: "client-secret",
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  NEXTAUTH_URL: "https://web.example.test/api/auth",
} satisfies NodeJS.ProcessEnv

function authorizeResponse(scope: string, duplicateScope = false): Response {
  const query = new URLSearchParams({
    client_id: ENV.KOKORO_OIDC_CLIENT_ID,
    redirect_uri: `${ENV.NEXTAUTH_URL}/callback/kokoro-iam`,
    response_type: "code",
    scope,
    resource: "https://kokoro.dev/resources/iam-internal",
    state: "s".repeat(32),
    nonce: "n".repeat(32),
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
  })
  if (duplicateScope) query.append("scope", scope)
  return new Response(null, {
    status: 302,
    headers: { location: `${ENV.KOKORO_WEB_ORIGIN}/iam/oauth2/authorize?${query}` },
  })
}

async function signIn(accept?: string, body = new URLSearchParams({ csrfToken: "a".repeat(64) }).toString()): Promise<Response> {
  return POST(new NextRequest(`${ENV.NEXTAUTH_URL}/signin/kokoro-iam`, {
    method: "POST",
    headers: {
      host: "web.example.test",
      origin: ENV.KOKORO_WEB_ORIGIN,
      "content-type": "application/x-www-form-urlencoded",
      ...(accept ? { accept } : {}),
    },
    body,
  }), { params: Promise.resolve({ nextauth: ["signin", "kokoro-iam"] }) })
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value)
  issueOidcState.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe("Product OIDC fixed-tenant Team and Skill scopes", () => {
  it.each(["logout", "session-state"])("returns 404 for retired /api/auth/%s before RP configuration", async (legacy) => {
    vi.stubEnv("KOKORO_OIDC_CLIENT_ID", "")
    const response = await GET(new NextRequest(`${ENV.NEXTAUTH_URL}/${legacy}`, {
      headers: { host: "web.example.test" },
    }), { params: Promise.resolve({ nextauth: [legacy] }) })
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(nextAuth).not.toHaveBeenCalled()
  })
  it("fails RP configuration closed without the server-only fixed tenant", () => {
    expect(oidcRpConfig({ ...ENV, KOKORO_TENANT_ID: "" })).toBeNull()
  })

  it("returns RP start failures without a browser retry-page redirect", async () => {
    const browser = await signIn("text/html", "csrfToken=invalid%20token")
    expect(browser.status).toBe(400)
    expect(browser.headers.get("location")).toBeNull()
    expect(browser.headers.get("cache-control")).toBe("no-store")
    expect(await browser.json()).toMatchObject({ error: { code: "rp_signin_rejected" } })
    expect(nextAuth).not.toHaveBeenCalled()
    const api = await signIn(undefined, "csrfToken=invalid%20token")
    expect(api.status).toBe(400)
    expect(await api.json()).toMatchObject({ error: { code: "rp_signin_rejected" } })
    vi.stubEnv("KOKORO_OIDC_CLIENT_ID", "")
    const unavailable = await signIn("text/html")
    expect(unavailable.status).toBe(503)
    expect(unavailable.headers.get("location")).toBeNull()
    expect(await unavailable.json()).toMatchObject({ error: { code: "rp_unavailable" } })
  })
  it("requests the original ten scopes followed by exactly three registered Skill scopes", () => {
    const config = oidcRpConfig(ENV)!
    const provider = oidcAuthOptions(config, vi.fn(), new AbortController().signal)
      .providers[0] as OAuthConfig<{ sub: string }>
    expect(provider.authorization).toEqual({
      url: `${ENV.KOKORO_WEB_ORIGIN}/iam/oauth2/authorize`,
      params: {
        response_type: "code",
        scope: EXPECTED_SCOPE,
        resource: "https://kokoro.dev/resources/iam-internal",
      },
    })
    expect(provider.checks).toEqual(["pkce", "state", "nonce"])
    expect(OIDC_SCOPE.split(" ")).toHaveLength(13)
    expect(new Set(OIDC_SCOPE.split(" ")).size).toBe(13)
  })

  it("accepts the complete fixed scope in the Auth.js authorization redirect", async () => {
    nextAuth.mockResolvedValueOnce(authorizeResponse(EXPECTED_SCOPE))
    const response = await signIn()
    expect(response.status).toBe(302)
    expect(new URL(response.headers.get("location")!).searchParams.getAll("scope")).toEqual([EXPECTED_SCOPE])
    expect(issueOidcState).toHaveBeenCalledOnce()
    expect(issueOidcState).toHaveBeenCalledWith(expect.objectContaining({ state: "s".repeat(32) }))
  })

  it.each([
    ["legacy scope", BASE_SCOPE],
    ...TEAM_SCOPES.map((missing) => [
      `missing ${missing}`,
      `${BASE_SCOPE} ${TEAM_SCOPES.filter((scope) => scope !== missing).join(" ")} ${SKILL_SCOPES.join(" ")}`,
    ]),
    ["old ten scopes", ORIGINAL_SCOPE],
    ...SKILL_SCOPES.map((missing) => [
      `missing ${missing}`,
      `${ORIGINAL_SCOPE} ${SKILL_SCOPES.filter((scope) => scope !== missing).join(" ")}`,
    ]),
    ...SKILL_SCOPES.map((duplicate) => [`duplicate ${duplicate}`, `${EXPECTED_SCOPE} ${duplicate}`]),
    ["extra scope", `${EXPECTED_SCOPE} iam:role.write`],
    ["reordered Team scope", `${BASE_SCOPE} ${[...TEAM_SCOPES].reverse().join(" ")} ${SKILL_SCOPES.join(" ")}`],
    ["reordered Skill scope", `${ORIGINAL_SCOPE} ${[...SKILL_SCOPES].reverse().join(" ")}`],
  ])("rejects %s before recording the RP transaction", async (_label, scope) => {
    nextAuth.mockResolvedValueOnce(authorizeResponse(scope!))
    const response = await signIn()
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "rp_signin_rejected" } })
    expect(issueOidcState).not.toHaveBeenCalled()
  })

  it("rejects duplicate scope parameters before recording the RP transaction", async () => {
    nextAuth.mockResolvedValueOnce(authorizeResponse(EXPECTED_SCOPE, true))
    expect((await signIn()).status).toBe(403)
    expect(issueOidcState).not.toHaveBeenCalled()
  })
})


describe("transaction-bound Product login return", () => {
  const target = parseProductReturnTarget("/app/project/project_00000000-0000-4000-8000-000000000301?conversation=conv_00000000-0000-4000-8000-000000000302")!
  function callback(extra = "") {
    return GET(new NextRequest(`${ENV.NEXTAUTH_URL}/callback/kokoro-iam?${new URLSearchParams({ code: "verified-code", state: "s".repeat(32), iss: `${ENV.KOKORO_WEB_ORIGIN}/iam` })}${extra}`, {
      headers: { host: "web.example.test", cookie: "next-auth.state=bound" },
    }), { params: Promise.resolve({ nextauth: ["callback", "kokoro-iam"] }) })
  }
  function verifiedCallback() {
    consumeOidcState.mockResolvedValue(target)
    verifyProductIdentity.mockResolvedValue(undefined)
    createSession.mockResolvedValue(undefined)
    productSessionCookie.mockResolvedValue("kokoro_product_session=fixture; HttpOnly")
    newSessionCandidate.mockReturnValue({ id: "00000000-0000-4000-8000-000000000303", expiresAt: Date.now() + 3_600_000 })
    nextAuth.mockImplementation(async (_request, _context, options) => {
      await options.callbacks.signIn({ account: { provider: "kokoro-iam", providerAccountId: "subject-a", access_token: "verified-access", refresh_token: "verified-refresh", expires_at: Math.floor(Date.now() / 1000) + 300 } })
      return new Response(null, { status: 302, headers: { location: "/app" } })
    })
  }
  it("passes the finite target only via internal Context and keeps fixed issuer redirect_uri", async () => {
    nextAuth.mockResolvedValue(authorizeResponse(EXPECTED_SCOPE))
    const response = await POST(new NextRequest(`${ENV.NEXTAUTH_URL}/signin/kokoro-iam`, {
      method: "POST", headers: { host: "web.example.test", origin: ENV.KOKORO_WEB_ORIGIN, "content-type": "application/x-www-form-urlencoded" }, body: "csrfToken=Token123",
    }), { params: Promise.resolve({ nextauth: ["signin", "kokoro-iam"] }), productReturnTarget: target })
    expect(response.status).toBe(302)
    expect(issueOidcState).toHaveBeenCalledWith(expect.objectContaining({ target, authSecret: ENV.KOKORO_WEB_AUTH_SECRET }))
    const authorize = new URL(response.headers.get("location")!)
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${ENV.NEXTAUTH_URL}/callback/kokoro-iam`)
    expect(authorize.searchParams.has("return_to")).toBe(false)
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })
  it("does not let a public HTTP header supply the internal target", async () => {
    nextAuth.mockResolvedValue(authorizeResponse(EXPECTED_SCOPE))
    const response = await POST(new NextRequest(`${ENV.NEXTAUTH_URL}/signin/kokoro-iam`, {
      method: "POST", headers: { host: "web.example.test", origin: ENV.KOKORO_WEB_ORIGIN, "content-type": "application/x-www-form-urlencoded", "x-kokoro-product-return-target": target }, body: "csrfToken=Token123",
    }), { params: Promise.resolve({ nextauth: ["signin", "kokoro-iam"] }) })
    expect(response.status).toBe(302)
    expect(issueOidcState).toHaveBeenCalledWith(expect.objectContaining({ target: "/app" }))
  })
  it("uses only the signed /login return cookie when browser-native provider POST starts", async () => {
    nextAuth.mockResolvedValue(authorizeResponse(EXPECTED_SCOPE))
    const cookie = productLoginReturnCookie(target, ENV.KOKORO_WEB_AUTH_SECRET, false).split(";", 1)[0]!
    const response = await POST(new NextRequest(`${ENV.NEXTAUTH_URL}/signin/kokoro-iam`, {
      method: "POST", headers: { host: "web.example.test", origin: ENV.KOKORO_WEB_ORIGIN,
        "content-type": "application/x-www-form-urlencoded", cookie }, body: "csrfToken=Token123",
    }), { params: Promise.resolve({ nextauth: ["signin", "kokoro-iam"] }) })
    expect(response.status).toBe(302)
    expect(issueOidcState).toHaveBeenCalledWith(expect.objectContaining({ target }))
    expect(response.headers.getSetCookie()).toContain("kokoro_product_login_return=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
  })
  it("rejects public extra form target without issuing a transaction", async () => {
    expect((await signIn(undefined, `csrfToken=Token123&return_to=${encodeURIComponent(target)}`)).status).toBe(400)
    expect(issueOidcState).not.toHaveBeenCalled()
  })
  it("redirects to the consumed target only after identity verification and durable session creation", async () => {
    verifiedCallback()
    let settle!: () => void
    createSession.mockImplementation(() => new Promise<void>((resolve) => { settle = resolve }))
    let complete = false
    const pending = callback().then((response) => { complete = true; return response })
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce())
    expect(verifyProductIdentity).toHaveBeenCalledWith(expect.anything(), "verified-access", "subject-a", expect.any(AbortSignal))
    expect(complete).toBe(false)
    settle()
    const response = await pending
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(target)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.getSetCookie()).toHaveLength(4)
    expect(consumeOidcState).toHaveBeenCalledWith(expect.objectContaining({ authSecret: ENV.KOKORO_WEB_AUTH_SECRET }))
  })
  it("fails closed on replay/invalid transaction before Auth.js or Product session creation", async () => {
    consumeOidcState.mockResolvedValue(null)
    const response = await callback()
    expect(response.status).toBe(403)
    expect(response.headers.get("location")).toBeNull()
    expect(nextAuth).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toHaveLength(3)
  })
  it.each(["identity", "store", "unverified"])("never redirects on %s failure", async (stage) => {
    verifiedCallback()
    if (stage === "identity") verifyProductIdentity.mockRejectedValue(new Error("denied"))
    if (stage === "store") createSession.mockRejectedValue(new Error("unavailable"))
    if (stage === "unverified") nextAuth.mockResolvedValue(new Response(null, { status: 302 }))
    const response = await callback()
    expect(response.status).toBe(stage === "unverified" ? 403 : 503)
    expect(response.headers.get("location")).toBeNull()
    if (stage === "identity" || stage === "unverified") expect(createSession).not.toHaveBeenCalled()
  })
  it("rejects callback self-reported target before consuming state", async () => {
    expect((await callback("&return_to=%2Fapp")).status).toBe(400)
    expect(consumeOidcState).not.toHaveBeenCalled()
  })
})
