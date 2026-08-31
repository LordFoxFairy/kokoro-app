import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { fetchWithDomain } = vi.hoisted(() => ({ fetchWithDomain: vi.fn() }))

vi.mock("@/lib/server/upstream-http", () => ({ fetchWithDomain }))

const ENV = {
  KOKORO_WEB_SESSION_SECRET: "test-session-secret",
  KOKORO_USER_BASE_URL: "http://user.test",
  KOKORO_SESSION_BASE_URL: "http://session.test",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "web-bff-secret",
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value
  fetchWithDomain.mockReset()
})

afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key]
})

describe("GET /api/shared/[id] proxy", () => {
  it("keeps public access userless while authenticating the BFF upstream hop", async () => {
    fetchWithDomain.mockResolvedValue(new Response('{"data":{"id":"shr_1"}}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }))
    const { GET } = await import("@/app/api/shared/[id]/route")

    const response = await GET(
      new Request("http://localhost/api/shared/shr_1"),
      { params: Promise.resolve({ id: "shr_1" }) },
    )

    expect(response.status).toBe(200)
    const [target, domain, init] = fetchWithDomain.mock.calls[0] as [string, string, RequestInit]
    expect(target).toBe("http://session.test/shared/shr_1")
    expect(domain).toBe("dev.kokoro.localhost")
    const headers = new Headers(init.headers)
    expect(headers.get("x-kokoro-service")).toBe("web-bff")
    expect(headers.get("x-kokoro-internal-secret")).toBe("web-bff-secret")
    expect(headers.get("authorization")).toBeNull()
  })
})
