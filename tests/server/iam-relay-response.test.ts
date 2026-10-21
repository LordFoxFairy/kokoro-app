import { describe, expect, it } from "vitest"

import { browserAuthorizeResponse, nativeIamResponse, validIamRpCallbackNavigation } from "@/lib/server/iam-relay-response"
import { browserLogoutStartResponse, browserLogoutFailureResponse } from "@/lib/server/iam-logout-response"
import type { IamRelayUpstream } from "@/lib/server/iam-relay-transport"

const WEB_ORIGIN = "http://127.0.0.1:3310"
const CALLBACK_PATH = "/api/auth/callback/kokoro-iam"
const QUERY = new URLSearchParams({ code: "code.valid_~-", state: "state_valid_123456789", iss: `${WEB_ORIGIN}/iam` }).toString()

function nativeRedirect(location: string): IamRelayUpstream {
  return { status: 302, headers: new Headers({ location }), setCookies: [], body: new Uint8Array() }
}

function authorizeJson(value: unknown): IamRelayUpstream {
  return {
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    setCookies: [],
    body: new TextEncoder().encode(JSON.stringify(value)),
  }
}

describe("closed Product IAM RP callback navigation", () => {
  it("preserves native 302 for the exact Product callback", () => {
    for (const location of [`${CALLBACK_PATH}?${QUERY}`, `${WEB_ORIGIN}${CALLBACK_PATH}?${QUERY}`]) {
      const response = nativeIamResponse(nativeRedirect(location), WEB_ORIGIN, false, "request-native")
      expect(response?.status).toBe(302)
      expect(response?.headers.get("location")).toBe(location)
      expect(validIamRpCallbackNavigation(location, WEB_ORIGIN)).toBe(true)
    }
  })

  it("preserves a valid OAuth error callback for the RP", () => {
    const error = new URLSearchParams({ error: "invalid_request", state: "state_valid_123456789", iss: `${WEB_ORIGIN}/iam`, error_description: "request rejected" })
    const location = `${WEB_ORIGIN}${CALLBACK_PATH}?${error}`
    const response = nativeIamResponse(nativeRedirect(location), WEB_ORIGIN, false, "request-error")

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toBe(location)
    expect(validIamRpCallbackNavigation(location, WEB_ORIGIN)).toBe(true)
  })

  it("converts the exact JSON authorize continuation", () => {
    const location = `${WEB_ORIGIN}${CALLBACK_PATH}?${QUERY}`
    const response = browserAuthorizeResponse(authorizeJson({ redirect: true, url: location }), WEB_ORIGIN, false, "request-json")

    expect(response?.status).toBe(302)
    expect(response?.headers.get("location")).toBe(location)
    expect(response?.headers.get("cache-control")).toBe("no-store")
    expect(response?.headers.has("content-type")).toBe(false)
    expect(response?.headers.has("content-length")).toBe(false)
  })

  const invalidPaths = [
    "/manage", "/manage/", "/manage/api/auth/callback/other", "/manage/api/auth/callback/kokoro-iam/",
    "/api/auth/callback/other", "/api/auth/callback/kokoro-iam/", "/manage//api/auth/callback/kokoro-iam",
    "/manage/./api/auth/callback/kokoro-iam", "/manage/x/../api/auth/callback/kokoro-iam",
    "/manage/%61pi/auth/callback/kokoro-iam", "/manage%2fapi/auth/callback/kokoro-iam",
    "/manage/api/auth/callback/kokoro-iam%2f", "/iam/error",
  ]

  it.each(invalidPaths)("rejects non-exact callback path %s", (path) => {
    const location = `${WEB_ORIGIN}${path}?${QUERY}`
    expect(validIamRpCallbackNavigation(location, WEB_ORIGIN)).toBe(false)
    expect(nativeIamResponse(nativeRedirect(location), WEB_ORIGIN, false, "request-native")).toBeNull()
    expect(browserAuthorizeResponse(authorizeJson({ redirect: true, url: location }), WEB_ORIGIN, false, "request-json")).toBeNull()
  })

  it("rejects invalid origin, issuer and query", () => {
    const valid = `${WEB_ORIGIN}${CALLBACK_PATH}?${QUERY}`
    const invalid = [
      `http://127.0.0.1:3320${CALLBACK_PATH}?${QUERY}`,
      `http://localhost:3310${CALLBACK_PATH}?${QUERY}`,
      `https://127.0.0.1:3310${CALLBACK_PATH}?${QUERY}`,
      `http://user:pass@127.0.0.1:3310${CALLBACK_PATH}?${QUERY}`,
      `//127.0.0.1:3310${CALLBACK_PATH}?${QUERY}`,
      valid.replace("/callback/", "\\callback/"),
      `${valid}#fragment`,
      `${valid}&extra=true`,
      `${valid}&code=duplicate`,
      `${valid}&state=duplicate_state_123456`,
      `${valid}&iss=${encodeURIComponent(`${WEB_ORIGIN}/iam`)}`,
    ]
    for (const [field, badValues] of [
      ["code", ["", "invalid code", "x".repeat(2049)]],
      ["state", ["", "short", "invalid.state_123456789", "x".repeat(257)]],
      ["iss", ["", "http://127.0.0.1:3320/iam", `${WEB_ORIGIN}/iam/`, `${WEB_ORIGIN}/manage/iam`]],
    ] as const) {
      const missing = new URL(valid)
      missing.searchParams.delete(field)
      invalid.push(missing.href)
      for (const badValue of badValues) {
        const bad = new URL(valid)
        bad.searchParams.set(field, badValue)
        invalid.push(bad.href)
      }
    }
    for (const location of invalid) {
      expect(validIamRpCallbackNavigation(location, WEB_ORIGIN), location).toBe(false)
      expect(nativeIamResponse(nativeRedirect(location), WEB_ORIGIN, false, "request-native"), location).toBeNull()
      expect(browserAuthorizeResponse(authorizeJson({ redirect: true, url: location }), WEB_ORIGIN, false, "request-json"), location).toBeNull()
    }
  })

  it("rejects relative JSON authorize callback and non-exact JSON envelope", () => {
    const absolute = `${WEB_ORIGIN}${CALLBACK_PATH}?${QUERY}`
    for (const value of [
      { redirect: true, url: `${CALLBACK_PATH}?${QUERY}` },
      { redirect: false, url: absolute },
      { redirect: "true", url: absolute },
      { redirect: true, url: absolute, extra: true },
      { url: absolute },
      { redirect: true },
      null,
      [],
    ]) {
      expect(browserAuthorizeResponse(authorizeJson(value), WEB_ORIGIN, false, "request-json")).toBeNull()
    }
  })
})


describe("native issuer logout view projection", () => {
  const cookie = "kokoro-issuer.session_token.oauth_logout_confirmation=opaque-proof; Path=/iam/oauth2/end-session/confirm; HttpOnly; SameSite=Lax; Max-Age=300"
  const input = (cookies: string[] = [cookie]): IamRelayUpstream => ({ status: 200,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }), setCookies: cookies,
    body: new TextEncoder().encode("<form>issuer-owned template</form>") })
  const request = (headers: HeadersInit = {}) => new Request(WEB_ORIGIN + "/iam/oauth2/end-session", { headers: {
    accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "x-nonce": "fixture-nonce-1234567890", ...headers,
  } })

  it("projects only a fresh validated issuer cookie and retains its exact native Path", async () => {
    const response = browserLogoutStartResponse(request(), input(), WEB_ORIGIN, false, "logout-proof")
    expect(response?.status).toBe(303)
    expect(response?.headers.get("location")).toBe("/auth/sign-out")
    expect(response?.headers.getSetCookie()).toEqual([cookie])
    expect(await response?.text()).toBe("")
    const secure = cookie.replace("kokoro-issuer", "__Secure-kokoro-issuer") + "; Secure"
    expect(browserLogoutStartResponse(request(), input([secure]), WEB_ORIGIN, true, "secure-proof")?.status).toBe(303)
  })

  it("rejects missing, cleared, stale or wrong-scope confirmation without exposing upstream HTML", () => {
    for (const cookies of [[], [cookie.replace("opaque-proof", "")], [cookie.replace("300", "0")],
      [cookie.replace("300", "301")], [cookie.replace("Max-Age=300", "Expires=Wed, 01 Jan 2020 00:00:00 GMT")],
      [cookie + "; Expires=Wed, 01 Jan 2020 00:00:00 GMT"], [cookie.replace("/iam/oauth2/end-session/confirm", "/")],
      [cookie, cookie], [cookie.replace("SameSite=Lax", "SameSite=None")],
    ]) expect(browserLogoutStartResponse(request(), input(cookies), WEB_ORIGIN, false, "bad-proof")).toBeNull()
  })

  it("keeps API/zero-quality HTML responses native and strips unverified failure material only for document navigation", async () => {
    for (const headers of [{ accept: "application/json" }, { accept: "text/html;q=0" }, { "sec-fetch-dest": "empty" }]) {
      const req = request(headers)
      const response = browserLogoutStartResponse(req, input(), WEB_ORIGIN, false, "api-proof")
      expect(response?.status).toBe(200)
      expect(await response?.text()).toContain("issuer-owned template")
      const error = new Response("private upstream error", { status: 403 })
      expect(browserLogoutFailureResponse(req, error)).toBe(error)
    }
    const error = new Response("private upstream error", { status: 503, headers: { "set-cookie": cookie, location: "/private", "x-request-id": "fixed-request" } })
    const failed = browserLogoutFailureResponse(request(), error)
    expect(failed.status).toBe(303)
    expect(failed.headers.get("location")).toBe("/auth/sign-out?failed=1")
    expect(failed.headers.get("x-request-id")).toBe("fixed-request")
    expect(failed.headers.getSetCookie()).toEqual([])
    expect(await failed.text()).toBe("")
  })
})
