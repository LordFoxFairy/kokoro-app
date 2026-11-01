import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const FLOW = "f".repeat(24)
const TOKEN = "a".repeat(43)
const QUERY = "?native=1&return_to=%2Fapp"
const ORIGIN = "https://web.example.test"

const { consume, readFlow, retireFlow, relay } = vi.hoisted(() => ({
  consume: vi.fn(),
  readFlow: vi.fn(),
  retireFlow: vi.fn(),
  relay: vi.fn(),
}))

vi.mock("@/lib/server/iam-interaction-csrf", async original => ({
  ...(await original<typeof import("@/lib/server/iam-interaction-csrf")>()),
  consumeIamInteractionCsrf: consume,
}))
vi.mock("@/lib/server/iam-sign-in-flow", async original => ({
  ...(await original<typeof import("@/lib/server/iam-sign-in-flow")>()),
  readIamSignInFlow: readFlow,
  retireIamSignInFlow: retireFlow,
}))
vi.mock("@/lib/server/iam-relay-transport", async original => ({
  ...(await original<typeof import("@/lib/server/iam-relay-transport")>()),
  requestIamRelay: relay,
}))

import { POST } from "@/app/auth/sign-in/route"
import { iamSignInCsrfCookieName } from "@/lib/server/iam-interaction-csrf"
import { iamSignInFlowCookieName } from "@/lib/server/iam-sign-in-flow"

beforeEach(() => {
  vi.stubEnv("KOKORO_WEB_ORIGIN", ORIGIN)
  vi.stubEnv("KOKORO_BFF_BASE_URL", "https://bff.example.test")
  vi.stubEnv("KOKORO_INTERNAL_SECRET_WEB_BFF", "service-secret")
  vi.stubEnv("KOKORO_WEB_REDIS_URL", "redis://fixture.invalid/9")
  readFlow.mockReset().mockResolvedValue({ query: QUERY, expiresAt: Date.now() + 60_000 })
  consume.mockReset().mockResolvedValue(true)
  retireFlow.mockReset().mockResolvedValue(true)
  relay.mockReset().mockResolvedValue({
    status: 200,
    headers: new Headers({ "content-type": "application/json", "cache-control": "no-store" }),
    setCookies: ["kokoro-issuer.session_token=session; Path=/; HttpOnly; SameSite=Lax"],
    body: new TextEncoder().encode("{}"),
  })
})

describe("native IAM sign-in route", () => {
  it("sets the IAM native cookie and redirects without OAuth continuation", async () => {
    const csrfCookie = `${iamSignInCsrfCookieName(QUERY, TOKEN, FLOW)}=${TOKEN}`
    const flowCookie = `${iamSignInFlowCookieName(FLOW)}=${"p".repeat(43)}`
    const request = new NextRequest(`${ORIGIN}/auth/sign-in?flow=${FLOW}`, {
      method: "POST",
      headers: {
        host: "web.example.test",
        origin: ORIGIN,
        accept: "text/html",
        cookie: `${flowCookie}; ${csrfCookie}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf_token: TOKEN, email: "user@example.test", password: "secret" }),
    })

    const response = await POST(request)
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/app")
    expect(response.headers.getSetCookie()).toEqual(expect.arrayContaining([
      "kokoro-issuer.session_token=session; Path=/; HttpOnly; SameSite=Lax",
      `${iamSignInFlowCookieName(FLOW)}=; Path=/auth/sign-in; Max-Age=0; HttpOnly; SameSite=Lax`,
    ]))
    expect(relay).toHaveBeenCalledOnce()
    expect(relay.mock.calls[0]?.[0]?.url).toBe(`${"https://bff.example.test"}/iam/sign-in/email`)
    expect(relay.mock.calls.some(([input]) => input.url.endsWith("/iam/oauth2/continue"))).toBe(false)
    expect(retireFlow).toHaveBeenCalledOnce()
  })
})
