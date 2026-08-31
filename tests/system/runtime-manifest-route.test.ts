import { afterEach, describe, expect, it, vi } from "vitest"

const { getJsonWithDomain } = vi.hoisted(() => ({ getJsonWithDomain: vi.fn() }))

vi.mock("@/lib/server/upstream-http", () => ({ getJsonWithDomain }))

import { GET } from "@/app/api/system/runtime-manifest/route"

describe("System Runtime Manifest BFF", () => {
  const original = {
    baseUrl: process.env.KOKORO_SYSTEM_BASE_URL,
    domain: process.env.KOKORO_DOMAIN,
    workloadToken: process.env.KOKORO_SYSTEM_WORKLOAD_TOKEN,
    internalSecret: process.env.KOKORO_INTERNAL_SECRET_WEB_BFF,
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    for (const [key, value] of Object.entries({
      KOKORO_SYSTEM_BASE_URL: original.baseUrl,
      KOKORO_DOMAIN: original.domain,
      KOKORO_SYSTEM_WORKLOAD_TOKEN: original.workloadToken,
      KOKORO_INTERNAL_SECRET_WEB_BFF: original.internalSecret,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    getJsonWithDomain.mockReset()
  })

  it("fails closed when System is not configured", async () => {
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    delete process.env.KOKORO_SYSTEM_BASE_URL

    const response = await GET(new Request("https://app.example/app?product_id=kokoro"))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "system_runtime_unavailable" })
  })

  it("uses the server-only KOKORO_DOMAIN and removes internal tenant data from the browser response", async () => {
    vi.stubEnv("NODE_ENV", "test")
    process.env.KOKORO_SYSTEM_BASE_URL = "https://system.internal"
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    process.env.KOKORO_SYSTEM_WORKLOAD_TOKEN = "system-workload-token"
    process.env.KOKORO_INTERNAL_SECRET_WEB_BFF = "web-bff-secret"
    getJsonWithDomain.mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        tenantId: "backend-resolved-tenant",
        productId: "kokoro",
        locale: "en-US",
        navigation: [{ key: "chat", label: "Chat", icon: "⌁" }],
        localeNamespaces: ["common"],
        theme: {},
        featureFlags: [],
        references: [],
        configVersion: "1",
        releaseId: null,
        digest: "abc",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }))

    const response = await GET(new Request("https://app.example/api/system/runtime-manifest?product_id=kokoro"))
    const body = await response.json()
    const [systemTarget, domain, upstreamInit] = getJsonWithDomain.mock.calls[0] as [URL, string, Record<string, string>]

    expect(String(systemTarget)).toContain("https://system.internal/system/runtime-manifest")
    expect(domain).toBe("dev.kokoro.localhost")
    expect(new Headers(upstreamInit).get("x-kokoro-request-id")).toBeTruthy()
    expect(new Headers(upstreamInit).get("authorization")).toBe("Bearer system-workload-token")
    expect(new Headers(upstreamInit).get("x-kokoro-service")).toBe("web-bff")
    expect(new Headers(upstreamInit).get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(new Headers(upstreamInit).get("host")).toBeNull()
    expect(new Headers(upstreamInit).get("x-kokoro-tenant-id")).toBeNull()
    expect(body.data.tenantId).toBeUndefined()
    expect(body.data.productId).toBe("kokoro")
  })

  it("does not reject a well-shaped manifest because its internal tenant id is opaque to Web", async () => {
    process.env.KOKORO_SYSTEM_BASE_URL = "https://system.internal"
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    getJsonWithDomain.mockResolvedValueOnce(new Response(JSON.stringify({ data: {
      tenantId: "any-backend-tenant",
      productId: "kokoro",
      locale: "en-US",
      navigation: [], localeNamespaces: [], theme: {}, featureFlags: [], references: [],
      configVersion: "1", releaseId: null, digest: "abc",
    } }), { status: 200 }))

    const response = await GET(new Request("https://app.example/api/system/runtime-manifest?product_id=kokoro"))

    expect(response.status).toBe(200)
  })

  it("returns 503 in production when the web-bff internal secret is missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    process.env.KOKORO_SYSTEM_BASE_URL = "https://system.internal"
    process.env.KOKORO_DOMAIN = "dev.kokoro.localhost"
    delete process.env.KOKORO_INTERNAL_SECRET_WEB_BFF

    const response = await GET(new Request("https://app.example/api/system/runtime-manifest?product_id=kokoro"))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "system_runtime_unavailable" })
    expect(getJsonWithDomain).not.toHaveBeenCalled()
  })
})
