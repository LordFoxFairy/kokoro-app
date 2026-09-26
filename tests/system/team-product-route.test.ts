import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { admittedProductSession, productBffConfig, requestWithDomain, sameOriginOk } = vi.hoisted(() => ({
  admittedProductSession: vi.fn(),
  productBffConfig: vi.fn(),
  requestWithDomain: vi.fn(),
  sameOriginOk: vi.fn(() => true),
}))

vi.mock("@/lib/server/same-origin", () => ({ sameOriginOk }))
vi.mock("@/lib/server/product-bff", () => ({
  admittedProductSession,
  productBffConfig,
  productBffHeaders: (_config: unknown, claims: { access: string }, requestId: string) => new Headers({
    authorization: `Bearer ${claims.access}`,
    "x-kokoro-service": "web-bff",
    "x-kokoro-request-id": requestId,
  }),
}))
vi.mock("@/lib/server/upstream-http", () => ({
  requestWithDomain,
  readBoundedRequestBody: (request: Request) => request.arrayBuffer(),
  UpstreamRequestTooLargeError: class extends Error {},
}))

import * as teamRoute from "@/app/api/team/[...path]/route"

const context = (path: string[]) => ({ params: Promise.resolve({ path }) })

beforeEach(() => {
  productBffConfig.mockReturnValue({ bffBaseUrl: "https://bff.internal", domain: "web.example.test" })
  admittedProductSession.mockResolvedValue({ access: "product-access", accessExpiresAt: Date.now() + 60_000 })
  requestWithDomain.mockImplementation(async () => new Response(JSON.stringify({
    data: [], meta: { request_id: "bff-request", next_cursor: null },
  }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "bff-request" } }))
  sameOriginOk.mockReturnValue(true)
})

afterEach(() => vi.clearAllMocks())

describe("fixed-tenant Team Product adapter", () => {
  it.each([
    ["GET", ["members"]],
    ["GET", ["invitations"]],
    ["GET", ["roles"]],
    ["POST", ["invitations"]],
    ["POST", ["invitations", "inv-1", "resend"]],
    ["DELETE", ["invitations", "inv-1"]],
    ["PUT", ["members", "member-1", "roles"]],
    ["DELETE", ["members", "member-1"]],
    ["DELETE", ["members", "me"]],
  ] as const)("forwards only the exact %s /v1/team/%s operation with Product Bearer", async (method, path) => {
    const handler = (teamRoute as unknown as Record<string, (request: Request, ctx: ReturnType<typeof context>) => Promise<Response>>)[method]
    expect(handler).toBeTypeOf("function")
    if (handler === undefined) throw new Error(`missing Team ${method} handler`)
    const body = method === "POST" && path.length === 1 ? JSON.stringify({ email: "a@example.test", roles: ["member"] })
      : method === "PUT" ? JSON.stringify({ roles: ["admin"] }) : undefined
    const request = new Request(`https://web.example.test/api/team/${path.join("/")}`, {
      method, headers: { origin: "https://web.example.test", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body === undefined ? {} : { body }),
    })
    const response = await handler(request, context([...path]))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("x-request-id")).toBe("bff-request")
    const [target, domain, init] = requestWithDomain.mock.calls.at(-1) as [string, string, RequestInit]
    expect(target).toBe(`https://bff.internal/v1/team/${path.join("/")}`)
    expect(domain).toBe("web.example.test")
    const headers = new Headers(init.headers)
    expect(headers.get("authorization")).toBe("Bearer product-access")
    expect(headers.get("x-kokoro-principal-id")).toBeNull()
    expect(headers.get("x-kokoro-namespace")).toBeNull()
    expect(headers.get("cookie")).toBeNull()
    expect(init.method).toBe(method)
    expect(init.body === undefined).toBe(body === undefined)
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
  })

  it("preserves the opaque owner cursor and rejects unknown Team paths before BFF I/O", async () => {
    const response = await teamRoute.GET(new Request("https://web.example.test/api/team/members?limit=25&cursor=opaque%2Bnext"), context(["members"]))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ meta: { next_cursor: null } })
    expect(requestWithDomain.mock.calls[0]?.[0]).toBe("https://bff.internal/v1/team/members?limit=25&cursor=opaque%2Bnext")
    requestWithDomain.mockClear()
    for (const path of [["me", "teams"], ["members", "change-role"], ["auth", "team-sessions"], ["invitations", "inv-1", "accept"]]) {
      const denied = await teamRoute.GET(new Request(`https://web.example.test/api/team/${path.join("/")}`), context(path))
      expect(denied.status).toBe(404)
    }
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated or cross-origin mutations before BFF I/O", async () => {
    admittedProductSession.mockResolvedValueOnce(null)
    const anonymous = await teamRoute.GET(new Request("https://web.example.test/api/team/members"), context(["members"]))
    expect(anonymous.status).toBe(401)
    sameOriginOk.mockReturnValueOnce(false)
    const csrf = await teamRoute.POST(new Request("https://web.example.test/api/team/invitations", { method: "POST", body: "{}" }), context(["invitations"]))
    expect(csrf.status).toBe(403)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("rejects caller-supplied tenant or actor fields and malformed page queries before BFF I/O", async () => {
    const body = JSON.stringify({ email: "a@example.test", roles: ["member"], tenant_id: "forged" })
    const mutation = await teamRoute.POST(new Request("https://web.example.test/api/team/invitations", {
      method: "POST", headers: { origin: "https://web.example.test", "content-type": "application/json" }, body,
    }), context(["invitations"]))
    expect(mutation.status).toBe(400)
    const page = await teamRoute.GET(new Request("https://web.example.test/api/team/members?cursor=one&cursor=two"), context(["members"]))
    expect(page.status).toBe(400)
    expect(requestWithDomain).not.toHaveBeenCalled()
  })

  it("does not retry a conflict and preserves the stable owner error", async () => {
    requestWithDomain.mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: "LAST_OWNER", message: "Last owner" }, meta: { request_id: "owner-conflict" },
    }), { status: 409, headers: { "content-type": "application/json", "x-request-id": "owner-conflict" } }))
    const response = await teamRoute.DELETE(new Request("https://web.example.test/api/team/members/me", { method: "DELETE", headers: { origin: "https://web.example.test" } }), context(["members", "me"]))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "LAST_OWNER" } })
    expect(requestWithDomain).toHaveBeenCalledTimes(1)
  })
})
