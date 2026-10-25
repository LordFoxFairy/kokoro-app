import { describe, expect, it } from "vitest"

import { contentSecurityPolicy, securityHeaders, shouldDisableCaching } from "@/lib/server/security-headers"

describe("security headers", () => {
  it("binds the enforced CSP to the request nonce", () => {
    const headers = securityHeaders("nonce-token")
    expect(headers["Content-Security-Policy"]).toContain("'nonce-nonce-token'")
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'")
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
  })

  it("only permits development eval in development policy", () => {
    expect(contentSecurityPolicy("nonce-token")).not.toContain("'unsafe-eval'")
    expect(contentSecurityPolicy("nonce-token", true)).toContain("'unsafe-eval'")
  })

  it.each(["http://127.0.0.1:39190", "http://localhost:39190", "http://[::1]:39190"])("adds only the configured local upload origin in a matching development page (%s)", (localUploadOrigin) => {
    const policy = contentSecurityPolicy("nonce-token", true, {
      webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: null, localUploadOrigin,
    })
    expect(policy).toBe(contentSecurityPolicy("nonce-token", true).replace("connect-src 'self' https: wss:", `connect-src 'self' https: wss: ${localUploadOrigin}`).replace("img-src 'self' data: blob: https:", `img-src 'self' data: blob: https: ${localUploadOrigin}`))
    expect(securityHeaders("nonce-token", true, {
      webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: null, localUploadOrigin,
    })["Content-Security-Policy"]).toBe(policy)
  })

  it.each([
    undefined, "", "http:", "http://objects.example:39190", "https://127.0.0.1:39190",
    "http://user:pass@127.0.0.1:39190", "http://127.0.0.1:39190/", "http://127.0.0.1:39190/path",
    "http://127.0.0.1:39190?query=1", "http://127.0.0.1:39190#fragment",
    "http://127.0.0.1:39190 http://localhost:39190", "http://127.0.0.1:39190; connect-src http:",
    " http://127.0.0.1:39190", "http://127.0.0.1:39190 ", "http://127.1:39190", "http://127.0.0.1:80",
    "http://localhost.evil.test:39190", "http://127.0.0.1:0", "http://127.0.0.1:65536",
  ])("keeps development CSP unchanged for missing or invalid upload origin (%s)", (localUploadOrigin) => {
    expect(contentSecurityPolicy("nonce-token", true, {
      webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: null, localUploadOrigin,
    })).toBe(contentSecurityPolicy("nonce-token", true))
  })

  it.each([
    { webOrigin: undefined, requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: null },
    { webOrigin: "http://web.example:3311", requestProtocol: "http:", requestHost: "web.example:3311", requestOrigin: null },
    { webOrigin: "https://127.0.0.1:3311", requestProtocol: "https:", requestHost: "127.0.0.1:3311", requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311/", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "https:", requestHost: "127.0.0.1:3311", requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3312", requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "localhost:3311", requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "evil.test:3311", requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: null, requestOrigin: null },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: "http://localhost:3311" },
    { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: "null" },
  ])("keeps CSP unchanged outside the exact configured local page (%j)", (context) => {
    expect(contentSecurityPolicy("nonce-token", true, { ...context, localUploadOrigin: "http://127.0.0.1:39190" })).toBe(contentSecurityPolicy("nonce-token", true))
  })

  it("keeps production and default policy byte-identical with local upload configuration", () => {
    const context = { webOrigin: "http://127.0.0.1:3311", requestProtocol: "http:", requestHost: "127.0.0.1:3311", requestOrigin: null, localUploadOrigin: "http://127.0.0.1:39190" }
    expect(contentSecurityPolicy("nonce-token", false, context)).toBe(contentSecurityPolicy("nonce-token"))
    expect(securityHeaders("nonce-token", false, context)).toEqual(securityHeaders("nonce-token"))
  })

  it("marks browser API responses as private", () => {
    expect(shouldDisableCaching("/api/auth/session")).toBe(true)
    expect(shouldDisableCaching("/app")).toBe(true)
    expect(shouldDisableCaching("/app/project/example")).toBe(true)
    expect(shouldDisableCaching("/application")).toBe(false)
    expect(shouldDisableCaching("/")).toBe(false)
  })
})
