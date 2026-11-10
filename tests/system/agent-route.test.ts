import { afterEach, expect, it, vi } from "vitest"

const { productBffConfig, requestWithDomain } = vi.hoisted(() => ({
  productBffConfig: vi.fn(), requestWithDomain: vi.fn(),
}))
vi.mock("@/lib/server/product-bff", async (load) => ({
  ...(await load<typeof import("@/lib/server/product-bff")>()), productBffConfig,
}))
vi.mock("@/lib/server/upstream-http", async (load) => ({
  ...(await load<typeof import("@/lib/server/upstream-http")>()), requestWithDomain,
}))

import { GET, POST } from "@/app/api/agents/[...path]/route"

const url = "https://app.example/api/agents/connections/setup?platform=telegram"
const cookie = "kokoro-issuer.session_token=fixture"
const context = { params: Promise.resolve({ path: ["connections", "setup"] }) }
const config = { bffBaseUrl: "https://bff.internal/", domain: "configured.product.test", internalSecret: "fixture",
  session: { webOrigin: "https://app.example" } }
afterEach(() => { vi.resetAllMocks() })

it("same-origin GET/POST carry only native identity and correlate the closed owner envelope", async () => {
  productBffConfig.mockReturnValue(config)
  const commands: string[] = []
  requestWithDomain.mockImplementation(async (target: string, domain: string, init: { method: string; body?: ArrayBuffer; headers: Headers }) => {
    expect(target).toBe("https://bff.internal/v1/agents/connections/setup?platform=telegram")
    expect(domain).toBe(config.domain)
    expect(init.headers.get("cookie")).toBe(cookie)
    expect(init.headers.get("x-kokoro-subject")).toBeNull()
    const id = init.headers.get("x-kokoro-request-id")!
    if (init.method === "POST") {
      commands.push(new TextDecoder().decode(init.body))
      return Response.json({ error: { code: "agent_connection_precondition_failed", message: "stale" }, meta: { request_id: id } },
        { status: 412, headers: { "cache-control": "no-store", "x-request-id": id } })
    }
    return Response.json({ data: { platform: "telegram", status: "disconnected", state_version: "1" }, meta: { request_id: id } },
      { headers: { "cache-control": "no-store", "x-request-id": id } })
  })
  const get = await GET(new Request(url, { headers: { cookie } }), context)
  expect(get.status).toBe(200)
  expect(await get.json()).toMatchObject({ data: { status: "disconnected" }, meta: { request_id: get.headers.get("x-request-id") } })
  const body = '{ "action":"start","expected_state_version":"1" }'
  const post = await POST(new Request(url, { method: "POST", body, headers: {
    cookie, "content-type": "application/json", origin: config.session.webOrigin, "x-kokoro-subject": "forged",
  } }), context)
  expect(post.status).toBe(412)
  expect(commands).toEqual([body])
})

it("unknown query, foreign POST and browser webhook aliases never dispatch", async () => {
  productBffConfig.mockReturnValue(config)
  const get = (target: string) => new Request(target, { headers: { cookie } })
  expect((await GET(get(`${url}&ignored=1`), context)).status).toBe(400)
  const post = new Request(url, { method: "POST", body: '{"action":"start","expected_state_version":"1"}',
    headers: { cookie, "content-type": "application/json", origin: "https://foreign.example" } })
  expect((await POST(post, context)).status).toBe(403)
  expect((await POST(post, { params: Promise.resolve({ path: ["connections", "telegram", "webhook"] }) })).status).toBe(404)
  expect(requestWithDomain).not.toHaveBeenCalled()
})
