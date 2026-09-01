import { describe, expect, it } from "vitest"

import { authConfig, callerHeaders } from "@/lib/server/auth"

describe("auth BFF deployment domain context", () => {
  it("adds the configured deployment domain to caller headers", () => {
    const headers = callerHeaders({
      sessionSecrets: ["secret"],
      userBaseUrl: "https://user.internal",
      sessionBaseUrl: "https://session.internal",
      domain: "dev.kokoro.localhost",
      hubBaseUrl: null,
      paymentBaseUrl: null,
      billingBaseUrl: null,
      internalSecret: "web-secret",
      mockWebhookSecret: null,
      secureCookies: true,
      revealDevLink: false,
    })

    expect(headers.forwarded).toBe("host=dev.kokoro.localhost")
    expect(headers["x-kokoro-service"]).toBe("web-bff")
    expect(headers["x-kokoro-internal-secret"]).toBe("web-secret")
    expect(headers.host).toBeUndefined()
    expect(headers["x-kokoro-tenant-id"]).toBeUndefined()
  })

  it("uses KOKORO_DOMAIN as the only deployment context", () => {
    expect(authConfig({
      KOKORO_WEB_SESSION_SECRET: "secret",
      KOKORO_USER_BASE_URL: "https://user.internal",
      KOKORO_SESSION_BASE_URL: "https://session.internal",
      KOKORO_DOMAIN: "  dev.kokoro.localhost  ",
    } as unknown as NodeJS.ProcessEnv)?.domain).toBe("dev.kokoro.localhost")
    expect(authConfig({
      KOKORO_WEB_SESSION_SECRET: "secret",
      KOKORO_USER_BASE_URL: "https://user.internal",
      KOKORO_SESSION_BASE_URL: "https://session.internal",
    } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it("uses one server-only gateway root for all Web business defaults", () => {
    const config = authConfig({
      KOKORO_WEB_SESSION_SECRET: "secret",
      KOKORO_GATEWAY_BASE_URL: "http://gateway.internal/",
      KOKORO_DOMAIN: "dev.kokoro.localhost",
    } as unknown as NodeJS.ProcessEnv)

    expect(config).toMatchObject({
      // Session, Hub, User, and Agent BFFs append their own gateway namespace
      // to the request path; the configured base itself stays at the root.
      userBaseUrl: "http://gateway.internal",
      sessionBaseUrl: "http://gateway.internal",
      hubBaseUrl: "http://gateway.internal",
      agentBaseUrl: "http://gateway.internal",
      paymentBaseUrl: "http://gateway.internal/payment",
      billingBaseUrl: "http://gateway.internal/billing-service",
    })
  })

  it("prefers an explicit service URL over the unified gateway default", () => {
    const config = authConfig({
      KOKORO_WEB_SESSION_SECRET: "secret",
      KOKORO_GATEWAY_BASE_URL: "http://gateway.internal",
      KOKORO_USER_BASE_URL: "http://user.internal",
      KOKORO_SESSION_BASE_URL: "http://session.internal",
      KOKORO_HUB_BASE_URL: "http://hub.internal",
      KOKORO_DOMAIN: "dev.kokoro.localhost",
    } as unknown as NodeJS.ProcessEnv)

    expect(config).toMatchObject({
      userBaseUrl: "http://user.internal",
      sessionBaseUrl: "http://session.internal",
      hubBaseUrl: "http://hub.internal",
      agentBaseUrl: "http://gateway.internal",
      paymentBaseUrl: "http://gateway.internal/payment",
      billingBaseUrl: "http://gateway.internal/billing-service",
    })
  })

  it("returns null in production when the web-bff internal secret is missing", () => {
    expect(authConfig({
      NODE_ENV: "production",
      KOKORO_WEB_SESSION_SECRET: "secret",
      KOKORO_USER_BASE_URL: "https://user.internal",
      KOKORO_SESSION_BASE_URL: "https://session.internal",
      KOKORO_DOMAIN: "dev.kokoro.localhost",
    } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it("returns the production config when the web-bff internal secret is present", () => {
    expect(authConfig({
      NODE_ENV: "production",
      KOKORO_WEB_SESSION_SECRET: "secret",
      KOKORO_USER_BASE_URL: "https://user.internal",
      KOKORO_SESSION_BASE_URL: "https://session.internal",
      KOKORO_DOMAIN: "dev.kokoro.localhost",
      KOKORO_INTERNAL_SECRET_WEB_BFF: "web-secret",
    } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      internalSecret: "web-secret",
      secureCookies: true,
      revealDevLink: false,
    })
  })
})
