import { describe, expect, it } from "vitest"

import { parseMcpOAuthCallback } from "@/ui/mcp/mcp-oauth-callback"

describe("parseMcpOAuthCallback", () => {
  it("accepts exactly one standard success callback", () => {
    expect(parseMcpOAuthCallback("?state=opaque-state&code=authorization-code")).toEqual({ state: "opaque-state", code: "authorization-code" })
  })

  it("accepts exactly one standard provider-denied callback", () => {
    expect(parseMcpOAuthCallback("?state=opaque-state&error=access_denied")).toEqual({ state: "opaque-state", error: "access_denied" })
  })

  it("rejects malformed, duplicate, and ambiguous callback query values", () => {
    expect(parseMcpOAuthCallback("?code=authorization-code")).toBeUndefined()
    expect(parseMcpOAuthCallback("?state=one&state=two&code=authorization-code")).toBeUndefined()
    expect(parseMcpOAuthCallback("?state=opaque-state&code=authorization-code&error=access_denied")).toBeUndefined()
  })
})
