import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchWithDomain } from "@/lib/server/upstream-http"

vi.mock("@/lib/server/upstream-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/upstream-http")>()),
  fetchWithDomain: vi.fn(),
}))

const { currentProductSession } = vi.hoisted(() => ({ currentProductSession: vi.fn() }))
vi.mock("@/lib/server/product-session", () => ({ currentProductSession }))

const ENV = {
  KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
  KOKORO_WEB_REDIS_URL: "redis://fixture.invalid/9",
  KOKORO_WEB_ORIGIN: "http://localhost",
  KOKORO_DOMAIN: "dev.kokoro.localhost",
  KOKORO_BFF_BASE_URL: "http://bff.test",
  KOKORO_INTERNAL_SECRET_WEB_BFF: "svc-secret",
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) })

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value
  currentProductSession.mockReset()
  currentProductSession.mockResolvedValue({ access: "product-access", accessExpiresAt: Date.now() + 60_000 })
  vi.mocked(fetchWithDomain).mockReset()
})

afterEach(() => {
  currentProductSession.mockReset()
  vi.unstubAllGlobals()
  for (const key of Object.keys(ENV)) delete process.env[key]
})

describe("/api/admin/[...path] product-session adapter", () => {
  it("forwards an admitted provider mutation to the BFF's formal MCP path", async () => {
    vi.mocked(fetchWithDomain).mockImplementation(async (_url, _domain, init) =>
      new Response(JSON.stringify({ data: { provider_key: "fixture" } }), {
        status: 201,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-request-id": new Headers(init?.headers).get("x-kokoro-request-id")!,
        },
      }),
    )
    const { POST } = await import("@/app/api/admin/[...path]/route")
    const response = await POST(
      new Request("http://localhost/api/admin/mcp/providers?limit=50", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2",
          "idempotency-key": "command-key",
          "x-kokoro-request-id": "admin-request-id",
        },
        body: "{}",
      }),
      params(["mcp", "providers"]),
    )

    expect(response.status).toBe(201)
    expect(response.headers.get("x-request-id")).toBe("admin-request-id")
    expect(await response.json()).toEqual({ data: { provider_key: "fixture" } })
    expect(fetchWithDomain).toHaveBeenCalledWith(
      "http://bff.test/v1/admin/mcp/providers?limit=50",
      "dev.kokoro.localhost",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    )
    const init = vi.mocked(fetchWithDomain).mock.calls[0]![2]!
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer product-access")
    expect(new Headers(init.headers).get("idempotency-key")).toBe("command-key")
  })

  it("keeps unsupported paths and missing product sessions out of the BFF", async () => {
    const { GET } = await import("@/app/api/admin/[...path]/route")
    const unknown = await GET(new Request("http://localhost/api/admin/admin/mcp/providers"), params(["admin", "mcp", "providers"]))
    expect(unknown.status).toBe(404)

    currentProductSession.mockResolvedValueOnce(null)
    const denied = await GET(new Request("http://localhost/api/admin/mcp/providers"), params(["mcp", "providers"]))
    expect(denied.status).toBe(401)
    expect(await denied.json()).toEqual({ error: {
      code: "session_authentication_required", message: expect.any(String), retryable: false,
    } })
    expect(fetchWithDomain).not.toHaveBeenCalled()
  })

  it("keeps local gateway failures in the complete error envelope without forwarding session failures", async () => {
    const { GET } = await import("@/app/api/admin/[...path]/route")
    currentProductSession.mockRejectedValueOnce(new Error("private auth implementation detail"))
    const response = await GET(new Request("http://localhost/api/admin/skills", {
      headers: { "x-kokoro-request-id": "gateway-failure-id" },
    }), params(["skills"]))
    expect(response.status).toBe(503)
    expect(response.headers.get("x-request-id")).toBe("gateway-failure-id")
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await response.json()).toEqual({ error: {
      code: "admin_gateway_unavailable", message: expect.any(String), retryable: true,
    } })
    expect(fetchWithDomain).not.toHaveBeenCalled()
  })
  it("admits the three formal model reads with the original query and request ID", async () => {
    vi.mocked(fetchWithDomain).mockImplementation(async (_url, _domain, init) => Response.json({ data: [], meta: { next_cursor: null } }, {
      headers: { "cache-control": "no-store", "x-request-id": new Headers(init?.headers).get("x-kokoro-request-id")! },
    }))
    const { GET } = await import("@/app/api/admin/[...path]/route")
    for (const kind of ["model-labels", "model-revisions", "model-routing"]) {
      const response = await GET(new Request(`http://localhost/api/admin/${kind}?limit=25&cursor=opaque`, {
        headers: { "x-kokoro-request-id": "model-list-request" },
      }), params([kind]))
      expect(response.status).toBe(200)
      expect(response.headers.get("x-request-id")).toBe("model-list-request")
      expect(fetchWithDomain).toHaveBeenLastCalledWith(`http://bff.test/v1/admin/${kind}?limit=25&cursor=opaque`, "dev.kokoro.localhost", expect.objectContaining({ method: "GET" }))
    }
  })

  it.each([{ "if-match": '\"7\"' }, { "if-none-match": "*" }])("preserves the frozen routing command and CAS: %j", async (precondition) => {
    vi.mocked(fetchWithDomain).mockImplementation(async (_url, _domain, init) => Response.json({ error: { code: "admin_model_routing_version_conflict", message: "Conflict", retryable: false } }, {
      status: 409, headers: { "cache-control": "no-store", "x-request-id": new Headers(init?.headers).get("x-kokoro-request-id")! },
    }))
    const { PUT } = await import("@/app/api/admin/[...path]/route")
    const id = "6ea106a4-031f-460b-9ab3-a3c8cd5f4c92"
    const body = JSON.stringify({ model_revision_id: null, visible: false, is_default: false, priority: 0 })
    const response = await PUT(new Request(`http://localhost/api/admin/model-routing/${id}`, {
      method: "PUT", headers: { ...precondition, "content-type": "application/json", "content-length": String(new TextEncoder().encode(body).length), "idempotency-key": "frozen-model-command", "x-kokoro-request-id": "model-write-request" }, body,
    }), params(["model-routing", id]))
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe("admin_model_routing_version_conflict")
    const init = vi.mocked(fetchWithDomain).mock.calls[0]![2]!
    expect(new Headers(init.headers).get("if-match")).toBe(precondition["if-match"] ?? null)
    expect(new Headers(init.headers).get("if-none-match")).toBe(precondition["if-none-match"] ?? null)
    expect(new Headers(init.headers).get("idempotency-key")).toBe("frozen-model-command")
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body)
    expect(fetchWithDomain).toHaveBeenCalledTimes(1)
  })

  it("rejects model prefix expansion, unsupported methods and command headers on reads before BFF I/O", async () => {
    const { GET, POST, PUT } = await import("@/app/api/admin/[...path]/route")
    for (const [handler, method, path] of [[GET, "GET", ["model-providers"]], [GET, "GET", ["model-revisions", "publish"]], [POST, "POST", ["model-labels"]], [PUT, "PUT", ["model-routing", "not-a-label-id"]]] as const) {
      const response = await handler(new Request(`http://localhost/api/admin/${path.join("/")}`, { method }), params([...path]))
      expect(response.status).toBe(404)
    }
    const response = await GET(new Request("http://localhost/api/admin/model-routing", { headers: { "if-match": '\"1\"' } }), params(["model-routing"]))
    expect(response.status).toBe(400)
    expect(fetchWithDomain).not.toHaveBeenCalled()
  })

})
