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

  it("marks browser API responses as private", () => {
    expect(shouldDisableCaching("/api/auth/session-state")).toBe(true)
    expect(shouldDisableCaching("/app")).toBe(false)
  })
})
