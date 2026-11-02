import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const FLOW = "f".repeat(24)
const TOKEN = "a".repeat(43)
const QUERY = "?native=1&return_to=%2Fapp"
const TENANT = "Product:fixed-tenant_1"
const ORIGIN = "https://web.example.test"

const { consume, readFlow, retireFlow, relay, admit } = vi.hoisted(() => ({
  consume: vi.fn(),
  readFlow: vi.fn(),
  retireFlow: vi.fn(),
  relay: vi.fn(),
  admit: vi.fn(),
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

vi.mock("@/lib/server/product-bff", async original => ({
  ...(await original<typeof import("@/lib/server/product-bff")>()),
  admittedNativeSession: admit,
}))

import { POST } from "@/app/auth/sign-in/route"
import { iamSignInCsrfCookieName } from "@/lib/server/iam-interaction-csrf"
import { iamSignInFlowCookieName } from "@/lib/server/iam-sign-in-flow"

beforeEach(() => {
  vi.stubEnv("KOKORO_WEB_ORIGIN", ORIGIN)
  vi.stubEnv("KOKORO_TENANT_ID", TENANT)
  vi.stubEnv("KOKORO_DOMAIN", "web.example.test")
  vi.stubEnv("NODE_ENV", "test")
  admit.mockReset().mockResolvedValue({ subject: "user" })
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

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

function loginRequest(extraCookie = "", signal?: AbortSignal): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/sign-in?flow=${FLOW}`, {
    method: "POST", ...(signal === undefined ? {} : { signal }),
    headers: {
      host: "web.example.test", origin: ORIGIN, accept: "text/html",
      cookie: `${iamSignInFlowCookieName(FLOW)}=${"p".repeat(43)}; ${iamSignInCsrfCookieName(QUERY, TOKEN, FLOW)}=${TOKEN}${extraCookie ? `; ${extraCookie}` : ""}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ csrf_token: TOKEN, email: "user@example.test", password: "secret" }),
  })
}

function upstream(status = 200, setCookies: string[] = []) {
  return { status, headers: new Headers({ "content-type": "application/json" }), setCookies, body: new TextEncoder().encode("{}") }
}

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
    expect(relay).toHaveBeenCalledTimes(2)
    expect(admit).toHaveBeenCalledOnce()
    expect(relay.mock.calls[0]?.[0]?.url).toBe(`${"https://bff.example.test"}/iam/sign-in/email`)
    expect(retireFlow).toHaveBeenCalledOnce()
  })
})


describe("fixed Product cold sign-in completion", () => {
  it("activates only the configured tenant with new issuer cookies before online admission", async () => {
    relay.mockReset()
      .mockResolvedValueOnce(upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"]))
      .mockResolvedValueOnce(upstream(200, ["kokoro-issuer.session_token=rotated; Path=/; HttpOnly; SameSite=Lax"]))
    const response = await POST(loginRequest("kokoro-issuer.session_token=old; unrelated=private"))
    expect(response.status).toBe(303)
    const activation = relay.mock.calls[1]?.[0]
    expect(activation?.url).toBe("https://bff.example.test/iam/organization/set-active")
    expect(JSON.parse(new TextDecoder().decode(activation?.body))).toEqual({ organizationId: TENANT })
    expect(activation?.headers.get("cookie")).toBe("kokoro-issuer.session_token=new")
    expect(activation?.headers.get("origin")).toBe(ORIGIN)
    expect(admit.mock.calls[0]?.[0].headers.get("cookie")).toBe("kokoro-issuer.session_token=rotated")
    expect(response.headers.getSetCookie().filter(value => value.startsWith("kokoro-issuer.session_token=")))
      .toEqual(["kokoro-issuer.session_token=rotated; Path=/; HttpOnly; SameSite=Lax"])
  })

  it.each([undefined, "", " ", "bad tenant", "bad\u0001tenant", "t".repeat(256)])("rejects bad fixed tenant config %s before credentials", async tenant => {
    vi.stubEnv("KOKORO_TENANT_ID", tenant)
    const response = await POST(loginRequest())
    expect(response.status).toBe(503)
    expect(relay).not.toHaveBeenCalled()
    expect(consume).not.toHaveBeenCalled()
  })

  it.each([401, 403, 429, 500])("never enters Product or replays credentials after activation %s", async status => {
    relay.mockResolvedValueOnce(upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"]))
      .mockResolvedValueOnce(upstream(status))
    const response = await POST(loginRequest("kokoro-issuer.session_token=old"))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.has("location")).toBe(false)
    expect(relay).toHaveBeenCalledTimes(2)
    expect(admit).not.toHaveBeenCalled()
    expect(retireFlow).toHaveBeenCalledOnce()
    expect(response.headers.getSetCookie().some(value => value.startsWith("kokoro-issuer."))).toBe(false)
    expect(response.headers.getSetCookie().join(";")).not.toContain("session_token=new")
  })

  it.each([null, new Error("unavailable")])("requires final online admission even after activation succeeds", async result => {
    if (result instanceof Error) admit.mockRejectedValueOnce(result)
    else admit.mockResolvedValueOnce(result)
    const response = await POST(loginRequest())
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.headers.has("location")).toBe(false)
    expect(retireFlow).toHaveBeenCalledOnce()
  })

  it("rejects unallowlisted activation cookies and never admits", async () => {
    relay.mockResolvedValueOnce(upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"]))
      .mockResolvedValueOnce(upstream(200, ["foreign=secret; Path=/; HttpOnly; SameSite=Lax"]))
    const response = await POST(loginRequest())
    expect(response.status).toBe(502)
    expect(admit).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie().join(";")).not.toContain("foreign=")
  })

  it("uses only the remaining total upstream budget and rejects late admission", async () => {
    vi.useFakeTimers()
    relay.mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(3000)
      return upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"])
    }).mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      return upstream()
    })
    admit.mockImplementationOnce(async request => {
      await vi.advanceTimersByTimeAsync(501)
      expect(request.signal.aborted).toBe(true)
      return { subject: "late" }
    })
    const response = await POST(loginRequest())
    expect(relay.mock.calls[1]?.[0]?.timeoutMs).toBeLessThanOrEqual(2000)
    expect(response.status).toBe(503)
    expect(response.headers.has("location")).toBe(false)
  })

  it("does not activate when the client cancels after credentials are accepted", async () => {
    const controller = new AbortController()
    relay.mockImplementationOnce(async () => {
      controller.abort()
      return upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"])
    })
    const response = await POST(loginRequest("", controller.signal))
    expect(response.status).toBe(503)
    expect(relay).toHaveBeenCalledOnce()
    expect(admit).not.toHaveBeenCalled()
    expect(retireFlow).toHaveBeenCalledOnce()
  })
})


describe("unchanged sign-in safety boundaries", () => {
  it("keeps an existing browser session on rejected credentials without activation", async () => {
    relay.mockResolvedValueOnce(upstream(401))
    const response = await POST(loginRequest("kokoro-issuer.session_token=existing"))
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`/auth/sign-in?flow=${FLOW}`)
    expect(relay).toHaveBeenCalledOnce()
    expect(admit).not.toHaveBeenCalled()
    expect(retireFlow).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie().some(value => value.startsWith("kokoro-issuer."))).toBe(false)
  })

  it("rejects bad CSRF before credentials", async () => {
    consume.mockResolvedValueOnce(false)
    expect((await POST(loginRequest())).status).toBe(403)
    expect(relay).not.toHaveBeenCalled()
  })

  it("rejects cross-origin credentials", async () => {
    const request = loginRequest()
    request.headers.set("origin", "https://foreign.example.test")
    expect((await POST(request)).status).toBe(403)
    expect(relay).not.toHaveBeenCalled()
  })
})


describe("native completion cookie and deadline edges", () => {
  it("removes deleted allowlist cookies from admission while forwarding the latest deletion", async () => {
    relay.mockResolvedValueOnce(upstream(200, [
      "kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax",
      "kokoro-issuer.session_data=cached; Path=/; HttpOnly; SameSite=Lax",
    ])).mockResolvedValueOnce(upstream(200, [
      "kokoro-issuer.session_data=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    ]))
    const response = await POST(loginRequest())
    expect(response.status).toBe(303)
    expect(admit.mock.calls[0]?.[0].headers.get("cookie")).toBe("kokoro-issuer.session_token=new")
    expect(response.headers.getSetCookie().filter(value => value.startsWith("kokoro-issuer.session_data=")))
      .toEqual(["kokoro-issuer.session_data=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"])
  })

  it("supports only the secure issuer prefix in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    relay.mockResolvedValueOnce(upstream(200, ["__Secure-kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax; Secure"]))
      .mockResolvedValueOnce(upstream())
    const response = await POST(loginRequest("kokoro-issuer.session_token=wrong-prefix; __Secure-kokoro-issuer.session_token=old"))
    expect(response.status).toBe(303)
    expect(relay.mock.calls[1]?.[0].headers.get("cookie")).toBe("__Secure-kokoro-issuer.session_token=new")
    expect(admit.mock.calls[0]?.[0].headers.get("cookie")).toBe("__Secure-kokoro-issuer.session_token=new")
    expect(response.headers.getSetCookie().every(value => value.includes("Secure"))).toBe(true)
  })

  it.each([{ cookies: [] }, { cookies: ["kokoro-issuer.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"] }])("requires a fresh usable issuer token from sign-in $cookies", async ({ cookies }) => {
    relay.mockResolvedValueOnce(upstream(200, cookies))
    const response = await POST(loginRequest("kokoro-issuer.session_token=old"))
    expect(response.status).toBe(502)
    expect(relay).toHaveBeenCalledOnce()
    expect(retireFlow).toHaveBeenCalledOnce()
    expect(admit).not.toHaveBeenCalled()
  })

  it("blocks the final admission request when activation exhausts the shared budget", async () => {
    vi.useFakeTimers()
    relay.mockResolvedValueOnce(upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"]))
      .mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(5001)
        return upstream()
      })
    expect((await POST(loginRequest())).status).toBe(503)
    expect(admit).not.toHaveBeenCalled()
  })

  it("rejects a pre-cancelled request without sending credentials", async () => {
    const controller = new AbortController()
    controller.abort()
    expect((await POST(loginRequest("", controller.signal))).status).toBe(503)
    expect(relay).not.toHaveBeenCalled()
  })

  it("retains terminal cleanup when activation transport fails and never retries", async () => {
    relay.mockResolvedValueOnce(upstream(200, ["kokoro-issuer.session_token=new; Path=/; HttpOnly; SameSite=Lax"]))
      .mockRejectedValueOnce(new Error("upstream unavailable"))
    const response = await POST(loginRequest())
    expect(response.status).toBe(503)
    expect(response.headers.getSetCookie()).toContain(`${iamSignInFlowCookieName(FLOW)}=; Path=/auth/sign-in; Max-Age=0; HttpOnly; SameSite=Lax`)
    expect(response.headers.getSetCookie().some(value => value.startsWith("kokoro-issuer."))).toBe(false)
    expect(relay).toHaveBeenCalledTimes(2)
    expect(retireFlow).toHaveBeenCalledOnce()
  })

  it("does not emit a successful navigation when flow cleanup crosses the deadline", async () => {
    vi.useFakeTimers()
    retireFlow.mockImplementationOnce(async () => {
      await vi.advanceTimersByTimeAsync(5001)
      return true
    })
    const response = await POST(loginRequest())
    expect(response.status).toBe(503)
    expect(response.headers.has("location")).toBe(false)
    expect(response.headers.getSetCookie().some(value => value.startsWith("kokoro-issuer."))).toBe(false)
  })
})


it("bounds the merged issuer request headers before activating the session", async () => {
  relay.mockResolvedValueOnce(upstream(200, [`kokoro-issuer.session_token=${"n".repeat(8100)}; Path=/; HttpOnly; SameSite=Lax`]))
  const response = await POST(loginRequest(`kokoro-issuer.dont_remember=${"o".repeat(8100)}`))
  expect(response.status).toBe(503)
  expect(relay).toHaveBeenCalledOnce()
  expect(admit).not.toHaveBeenCalled()
  expect(response.headers.getSetCookie().some(value => value.startsWith("kokoro-issuer."))).toBe(false)
})
