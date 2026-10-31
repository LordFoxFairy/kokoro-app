import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { nativeProductBffConfig, nativeSessionBffHeaders, admittedNativeSession, oidcRpConfig } = vi.hoisted(() => ({
  nativeProductBffConfig: vi.fn(),
  nativeSessionBffHeaders: vi.fn(),
  admittedNativeSession: vi.fn(),
  oidcRpConfig: vi.fn(),
}))

vi.mock("@/lib/server/product-bff", () => ({ nativeProductBffConfig, nativeSessionBffHeaders, admittedNativeSession }))
vi.mock("@/lib/server/oidc-provider", () => ({ oidcRpConfig }))
vi.mock("@/lib/server/oidc-bff-agent", () => ({ boundedOidcBffAgent: vi.fn() }))
vi.mock("@/lib/server/oidc-rp-transaction", () => ({ consumeOidcState: vi.fn(), issueOidcState: vi.fn() }))
vi.mock("@/lib/server/oidc-token", () => ({ refreshOidcToken: vi.fn(), revokeOidcToken: vi.fn() }))

describe("native session route cutover", () => {
  it("reads a native session without requiring the legacy RP configuration", async () => {
    nativeProductBffConfig.mockReturnValue({
      bffBaseUrl: "https://bff.example",
      domain: "bff.example",
      internalSecret: "service-secret",
      session: { webOrigin: "https://web.example" },
    })
    nativeSessionBffHeaders.mockReturnValue({ state: "valid", headers: new Headers({ cookie: "kokoro-issuer.session_token=session" }) })
    admittedNativeSession.mockResolvedValue({
      id: "native-session",
      generation: 0,
      access: "",
      accessExpiresAt: Date.now() + 60_000,
      expiresAt: Date.now() + 60_000,
      subject: "subject-1",
      issuerSessionId: "native-session",
      nativeCookie: "kokoro-issuer.session_token=session",
    })
    oidcRpConfig.mockReturnValue(null)
    const { GET } = await import("@/app/api/auth/[...nextauth]/route")
    const response = await GET(
      new NextRequest("https://web.example/api/auth/session", { headers: { host: "web.example", cookie: "kokoro-issuer.session_token=session" } }),
      { params: Promise.resolve({ nextauth: ["session"] }) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ authenticated: true, subject: "subject-1", mode: "native" })
    expect(admittedNativeSession).toHaveBeenCalledOnce()
  })

  it("hands native sign-out to the issuer without requiring the legacy RP configuration", async () => {
    nativeProductBffConfig.mockReturnValue({
      bffBaseUrl: "https://bff.example",
      domain: "bff.example",
      internalSecret: "service-secret",
      session: { webOrigin: "https://web.example" },
    })
    nativeSessionBffHeaders.mockReturnValue({ state: "valid", headers: new Headers({ cookie: "kokoro-issuer.session_token=session" }) })
    oidcRpConfig.mockReturnValue(null)
    vi.stubEnv("KOKORO_OIDC_CLIENT_ID", "web-client")
    const { POST } = await import("@/app/api/auth/[...nextauth]/route")
    const response = await POST(
      new NextRequest("https://web.example/api/auth/signout", {
        method: "POST",
        headers: { host: "web.example", cookie: "kokoro-issuer.session_token=session", "content-type": "application/x-www-form-urlencoded" },
        body: "csrfToken=legacy-token",
      }),
      { params: Promise.resolve({ nextauth: ["signout"] }) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "signed_out", issuer_session: "native" })
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("kokoro_product_session="))).toBe(true)
  })
})
