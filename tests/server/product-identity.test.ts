import { createServer, type Server } from "node:http"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { OidcRpConfig } from "@/lib/server/oidc-provider"
import { verifyProductIdentity } from "@/lib/server/product-identity"

function currentIdentity(platformAdmin: boolean = false) {
  return {
    data: { user_id: "user-identity", tenant_id: "tenant-identity", platform_admin: platformAdmin },
    meta: { request_id: "request-identity" },
  }
}

describe("Product identity admission against current BFF me", () => {
  let server: Server
  let config: OidcRpConfig
  let body: unknown
  let receivedPath: string | undefined
  let receivedAuthorization: string | undefined

  beforeEach(async () => {
    body = currentIdentity()
    receivedPath = undefined
    receivedAuthorization = undefined
    server = createServer((request, response) => {
      receivedPath = request.url
      receivedAuthorization = request.headers.authorization
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(body))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("identity fixture did not bind")
    config = {
      relay: {
        bffOrigin: `http://127.0.0.1:${address.port}`,
        webOrigin: "http://127.0.0.1:3310",
        webHost: "127.0.0.1:3310",
        secret: "identity-fixture-secret",
        secureCookies: false,
      },
      clientId: "identity-fixture-client",
      clientSecret: "identity-fixture-client-secret",
      authSecret: "identity-fixture-auth-secret",
      redisUrl: "redis://127.0.0.1:6379/0",
      issuer: "http://127.0.0.1:3310/iam",
      callbackUrl: "http://127.0.0.1:3310/api/auth/callback/kokoro-iam",
      domain: "dev.kokoro.localhost",
      tenantId: "tenant-identity",
    }
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  it.each([true, false])("admits exact current three-field identity with platform_admin=%s", async (platformAdmin) => {
    body = currentIdentity(platformAdmin)

    await expect(verifyProductIdentity(config, "fixture-access", "user-identity", new AbortController().signal)).resolves.toBeUndefined()
    expect(receivedPath).toBe("/v1/me")
    expect(receivedAuthorization).toBe("Bearer fixture-access")
  })

  it.each(["platform_admin", "user_id", "tenant_id"])("rejects missing current data field %s", async (field) => {
    const identity = currentIdentity()
    body = { ...identity, data: Object.fromEntries(Object.entries(identity.data).filter(([key]) => key !== field)) }

    await expect(verifyProductIdentity(config, "fixture-access", "user-identity", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
  })

  it.each([null, "true", "false", 0, 1, {}, []])("rejects non-boolean platform_admin=%j", async (platformAdmin) => {
    const identity = currentIdentity()
    body = { ...identity, data: { ...identity.data, platform_admin: platformAdmin } }

    await expect(verifyProductIdentity(config, "fixture-access", "user-identity", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
  })

  it.each([
    ["extra data field", { ...currentIdentity(), data: { ...currentIdentity().data, role: "admin" } }],
    ["extra envelope field", { ...currentIdentity(), extra: true }],
    ["extra meta field", { ...currentIdentity(), meta: { request_id: "request-identity", extra: true } }],
    ["missing meta request ID", { ...currentIdentity(), meta: {} }],
    ["missing meta", { data: currentIdentity().data }],
    ["missing data", { meta: currentIdentity().meta }],
    ["null envelope", null],
    ["array envelope", []],
    ["null data", { ...currentIdentity(), data: null }],
    ["array data", { ...currentIdentity(), data: [] }],
    ["null meta", { ...currentIdentity(), meta: null }],
    ["array meta", { ...currentIdentity(), meta: [] }],
  ])("rejects %s", async (_name, invalidIdentity) => {
    body = invalidIdentity

    await expect(verifyProductIdentity(config, "fixture-access", "user-identity", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
  })

  it.each(["user_id", "tenant_id"])("rejects malformed %s", async (field) => {
    for (const value of [null, 42, "", "x".repeat(257)]) {
      const identity = currentIdentity()
      body = { ...identity, data: { ...identity.data, [field]: value } }

      await expect(verifyProductIdentity(config, "fixture-access", "user-identity", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
    }
  })

  it("rejects malformed request ID", async () => {
    for (const requestId of [null, 42, "", "x".repeat(257)]) {
      body = { ...currentIdentity(), meta: { request_id: requestId } }

      await expect(verifyProductIdentity(config, "fixture-access", "user-identity", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
    }
  })

  it("rejects an identity for a different subject", async () => {
    await expect(verifyProductIdentity(config, "fixture-access", "other-user", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
  })

  it("rejects an identity for a different configured tenant", async () => {
    await expect(verifyProductIdentity({ ...config, tenantId: "other-tenant" }, "fixture-access", "user-identity", new AbortController().signal)).rejects.toThrow("Product identity mismatch")
  })
})
