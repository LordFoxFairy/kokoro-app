import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth/jwt", () => ({ encode: vi.fn(async () => "encrypted-fixture"), decode: vi.fn() }))

import { clearProductSessionCookie, productSessionCookie } from "@/lib/server/product-session"

const claims = { id: "00000000-0000-4000-8000-000000000000", generation: 0,
  access: "access-fixture", accessExpiresAt: Date.now() + 600_000,
  expiresAt: Date.now() + 3_600_000, subject: "user-one", issuerSessionId:"issuer-one" }

describe("Product cookie secure transport boundary", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("keeps an authenticated Product session for the configured seven-day window", async () => {
    const week = 7 * 24 * 60 * 60
    const longLivedClaims = { ...claims, expiresAt: Date.now() + (week + 60) * 1_000 }

    expect(await productSessionCookie(longLivedClaims, "secret", "http://localhost:3000"))
      .toContain(`; Max-Age=${week}; HttpOnly; SameSite=Lax`)
  })

  it("sets Secure for an HTTPS public origin even in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(await productSessionCookie(claims, "secret", "https://web.example.test"))
      .toContain("; HttpOnly; SameSite=Lax; Secure")
    expect(clearProductSessionCookie("https://web.example.test"))
      .toContain("; Max-Age=0; HttpOnly; SameSite=Lax; Secure")
  })

  it("omits Secure only for an HTTP public origin in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(await productSessionCookie(claims, "secret", "http://localhost:3000"))
      .not.toContain("; Secure")
    expect(clearProductSessionCookie("http://localhost:3000"))
      .not.toContain("; Secure")
  })

  it("preserves Secure for an HTTP public origin in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(await productSessionCookie(claims, "secret", "http://web.example.test"))
      .toContain("; HttpOnly; SameSite=Lax; Secure")
    expect(clearProductSessionCookie("http://web.example.test"))
      .toContain("; Max-Age=0; HttpOnly; SameSite=Lax; Secure")
  })
  it("rejects a legacy cookie without the verified issuer Session binding",async()=>{
    const {issuerSessionId,...old}=claims;expect(issuerSessionId).toBe("issuer-one");await expect(productSessionCookie(old as never,"secret","https://web.example.test")).rejects.toThrow()
  })

})
