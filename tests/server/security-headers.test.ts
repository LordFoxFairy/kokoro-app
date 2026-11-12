import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { contentSecurityPolicy, securityHeaders, shouldDisableCaching } from "@/lib/server/security-headers"
import { proxy } from "@/proxy"

describe("security headers", () => {
  it("binds the enforced CSP to the request nonce", () => {
    const headers = securityHeaders("nonce-token")
    expect(headers["Content-Security-Policy"]).toContain("'nonce-nonce-token'")
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'")
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
  })

  it("admits microphone only in documents of the same mounted workbench", async () => {
    const project = "/app/project/project_00000000-0000-0000-0000-000000000001"
    for (const path of ["/app", "/app/library", project, "/", "/auth/sign-out", "/auth/sign-in/form", "/shared/example", "/manage", "/api/session/sessions", "/app/unknown"]) {
      const response = await proxy(new NextRequest(`https://workbench.example.test${path}`, {
        headers: { "sec-fetch-dest": "document", accept: "text/html" },
      }))
      const microphone = ["/app", "/app/library", project].includes(path) ? "self" : ""
      expect(response.headers.get("Permissions-Policy"), path).toBe(`camera=(), microphone=(${microphone}), geolocation=(), browsing-topics=()`)
    }
    const rsc = await proxy(new NextRequest("https://workbench.example.test/app", {
      headers: { "sec-fetch-dest": "empty", accept: "text/x-component", rsc: "1" },
    }))
    expect(rsc.headers.get("Permissions-Policy")).toContain("microphone=()")
    const iframe = await proxy(new NextRequest("https://workbench.example.test/app", {
      headers: { "sec-fetch-dest": "iframe", accept: "text/html" },
    }))
    expect(iframe.headers.get("Permissions-Policy")).toContain("microphone=()")
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
