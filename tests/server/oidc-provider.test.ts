import { NextRequest } from "next/server"
import type { OAuthConfig } from "next-auth/providers/oauth"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { nextAuth, issueOidcState } = vi.hoisted(() => ({
  nextAuth: vi.fn(),
  issueOidcState: vi.fn(),
}))
vi.mock("next-auth", () => ({ default: nextAuth }))
vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))
vi.mock("@/lib/server/oidc-rp-transaction", () => ({
  issueOidcState,
  consumeOidcState: vi.fn(),
  rpCleanupCookies: vi.fn(),
}))

import { POST } from "@/app/api/auth/[...nextauth]/route"
import { oidcAuthOptions, oidcRpConfig } from "@/lib/server/oidc-provider"

const BASE_SCOPE = "openid profile email offline_access iam:session-authorization.verify"
const TEAM_READ_SCOPES = ["iam:member.read", "iam:invitation.read", "iam:role.read"]
const TEAM_WRITE_SCOPES = ["iam:member.write", "iam:invitation.write"]
const TEAM_SCOPES = [...TEAM_READ_SCOPES, ...TEAM_WRITE_SCOPES]
const EXPECTED_SCOPE = `${BASE_SCOPE} ${TEAM_SCOPES.join(" ")}`
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

describe("Product OIDC fixed-tenant Team scopes", () => {
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
  it("requests the original scopes followed by exactly three Team read and two write scopes", () => {
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
      `${BASE_SCOPE} ${TEAM_SCOPES.filter((scope) => scope !== missing).join(" ")}`,
    ]),
    ["extra scope", `${EXPECTED_SCOPE} iam:role.write`],
    ["reordered scope", `${BASE_SCOPE} ${[...TEAM_SCOPES].reverse().join(" ")}`],
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
