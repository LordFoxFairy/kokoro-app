import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { admittedProductSession } from "@/lib/server/product-bff"
import { fetchWithDomain } from "@/lib/server/upstream-http"

vi.mock("@/lib/server/product-bff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/product-bff")>()),
  admittedProductSession: vi.fn(),
}))
vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  fetchWithDomain: vi.fn(),
}))

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value
  vi.mocked(admittedProductSession).mockReset()
  vi.mocked(admittedProductSession).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    generation: 0,
    subject: "admin-user",
    access: "product-access",
    accessExpiresAt: Date.now() + 60_000,
    expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
  })
  vi.mocked(fetchWithDomain).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(ENV)) delete process.env[key]
})

describe("/api/admin-access", () => {
  it("projects the exact administrator identity required by the same-origin Admin consumer", async () => {
    vi.mocked(fetchWithDomain).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_id: "admin-user",
            tenant_id: "tenant-admin",
            platform_admin: true,
          },
          meta: { request_id: "owner-request" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-request-id": "owner-request",
          },
        },
      ),
    )
    const { GET } = await import("@/app/api/admin-access/route")
    const response = await GET(new Request("http://localhost/api/admin-access"))

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toEqual({
      platform_admin: true,
      user_id: "admin-user",
      tenant_id: "tenant-admin",
      manage_url: "/manage",
    })
  })
})
