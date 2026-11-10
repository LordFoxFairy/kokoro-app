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

it("LINE continuation only returns the official URL bound to the original setup and link token", async () => {
  productBffConfig.mockReturnValue(config)
  const line = "https://app.example/api/agents/connections/line/continue"
  const route = { params: Promise.resolve({ path: ["connections", "line", "continue"] }) }
  const setup_id = "a".repeat(32)
  const token = "line-test-token"
  const nonce = setup_id + "b".repeat(32)
  const official = `https://access.line.me/dialog/bot/accountLink?${new URLSearchParams({ linkToken: token, nonce })}`
  const command = JSON.stringify({ setup_id, expected_state_version: "3", link_token: token })
  const request = (origin = config.session.webOrigin) => new Request(line, { method: "POST", body: command,
    headers: { cookie, "content-type": "application/json", origin } })
  let returnedUrl = official
  requestWithDomain.mockImplementation(async (target: string, domain: string, init: { body: ArrayBuffer; headers: Headers }) => {
    expect(target).toBe("https://bff.internal/v1/agents/connections/line/continue")
    expect(domain).toBe(config.domain)
    expect(new TextDecoder().decode(init.body)).toBe(command)
    const id = init.headers.get("x-kokoro-request-id")!
    return Response.json({ data: { platform: "line", status: "awaiting_line_callback", setup_id,
      state_version: "4", expires_at: "2099-08-30T06:30:00.000Z", continue_url: returnedUrl }, meta: { request_id: id } },
      { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-request-id": id } })
  })
  expect((await POST(request("https://foreign.example"), route)).status).toBe(403)
  expect(requestWithDomain).not.toHaveBeenCalled()
  const receipt = await POST(request(), route)
  expect(receipt.status).toBe(200)
  expect(receipt.headers.get("referrer-policy")).toBe("no-referrer")
  expect((await receipt.json()).data.continue_url).toBe(official)
  returnedUrl = official.replace(token, "wrong-token")
  const wrong = await POST(request(), route)
  expect(wrong.status).toBe(502)
  expect(await wrong.text()).not.toContain("wrong-token")
})

it("Slack top-level callback sends a bounded private POST and always redirects without its query", async () => {
  productBffConfig.mockReturnValue(config)
  const callback = "https://app.example/api/agents/connections/slack/callback"
  const route = { params: Promise.resolve({ path: ["connections", "slack", "callback"] }) }
  const state = "a".repeat(32)
  const code = "1234.5678.fixture"
  const go = (query: string, session = cookie) => GET(new Request(`${callback}?${query}`, { headers: {
    cookie: session, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document",
  } }), route)
  requestWithDomain.mockImplementation(async (target: string, domain: string, init: { method: string; body: ArrayBuffer; headers: Headers }) => {
    expect(target).toBe("https://bff.internal/v1/agents/connections/slack/complete")
    expect(domain).toBe(config.domain)
    expect(init.method).toBe("POST")
    expect(init.headers.get("cookie")).toBe(cookie)
    expect(init.headers.get("origin")).toBe(config.session.webOrigin)
    expect(JSON.parse(new TextDecoder().decode(init.body))).toEqual({ state, code })
    return new Response(null, { status: 409 }) // An owner refusal is never shown as a connection.
  })
  const assertSafeReturn = async (result: Response) => {
    expect(result.status).toBe(303)
    expect(result.headers.get("location")).toBe("/app/agents?connection=slack")
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(result.headers.get("referrer-policy")).toBe("no-referrer")
    expect(await result.text()).toBe("")
  }
  await assertSafeReturn(await go(`error=access_denied&state=${state}`))
  await assertSafeReturn(await go(`code=${code}&state=${state}`, ""))
  expect(requestWithDomain).not.toHaveBeenCalled()
  await assertSafeReturn(await go(`code=${code}&state=${state}`))
  expect(requestWithDomain).toHaveBeenCalledTimes(1)
})
