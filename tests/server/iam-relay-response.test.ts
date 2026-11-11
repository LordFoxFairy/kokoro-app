import { describe, expect, it } from "vitest"

import { nativeIamResponse, validInvitationLocation } from "@/lib/server/iam-relay-response"
import type { IamRelayUpstream } from "@/lib/server/iam-relay-transport"

const WEB_ORIGIN = "http://127.0.0.1:3310"

function response(input: Partial<IamRelayUpstream> = {}): IamRelayUpstream {
  return {
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    setCookies: [],
    body: new TextEncoder().encode("{}"),
    ...input,
  }
}

describe("native IAM relay response projection", () => {
  it("preserves validated native metadata and issuer cookies", () => {
    const upstream = response({
      status: 302,
      headers: new Headers({ location: "/auth/select-tenant?sig=opaque", "cache-control": "no-store" }),
      setCookies: ["kokoro-issuer.session_token=one; Path=/; HttpOnly; SameSite=Lax"],
      body: new Uint8Array(),
    })
    const projected = nativeIamResponse(upstream, WEB_ORIGIN, false, "request-native", "/sign-in/email")
    expect(projected?.status).toBe(302)
    expect(projected?.headers.get("location")).toBe("/auth/select-tenant?sig=opaque")
    expect(projected?.headers.getSetCookie()).toEqual(upstream.setCookies)
  })

  it("rejects cross-origin or malformed native redirects and cookies", () => {
    expect(
      nativeIamResponse(
        response({ status: 302, headers: new Headers({ location: "https://evil.example.test/" }), body: new Uint8Array() }),
        WEB_ORIGIN,
        false,
        "id",
      ),
    ).toBeNull()
    expect(
      nativeIamResponse(response({ setCookies: ["kokoro-issuer.session_token=one; Path=/iam; HttpOnly; SameSite=Lax"] }), WEB_ORIGIN, false, "id"),
    ).toBeNull()
  })

  it("projects no body for empty native statuses", () => {
    const projected = nativeIamResponse(response({ status: 204, headers: new Headers(), body: new Uint8Array() }), WEB_ORIGIN, false, "id")
    expect(projected?.status).toBe(204)
    expect(projected?.headers.get("content-length")).toBe("0")
    expect(projected?.body).toBeNull()
  })
})

describe("invitation verify-email Location", () => {
  const origin = "https://web.example.test"
  const id = "01234567-89ab-4cde-8f01-23456789abcd"

  it("accepts only the owner-ordered same-origin invitation query from verify-email", () => {
    expect(validInvitationLocation(`${origin}/iam/interactions/invitation?id=${id}`, origin, "/verify-email")).toBe(true)
    expect(validInvitationLocation(`${origin}/iam/interactions/invitation?id=${id}&error=INVALID_TOKEN`, origin, "/verify-email")).toBe(true)
    for (const value of [
      `${origin}/iam/interactions/invitation?id=${id}&error=OTHER`,
      `/iam/interactions/invitation?error=INVALID_TOKEN&id=${id}`,
      `/iam/interactions/invitation?id=${id}&id=${id}`,
      `/iam/interactions/invitation?id=%30${id.slice(1)}`,
      `https://evil.example.test/iam/interactions/invitation?id=${id}`,
      `/auth/invitation?id=${id}`,
    ])
      expect(validInvitationLocation(value, origin, "/verify-email"), value).toBe(false)
    expect(validInvitationLocation(`/iam/interactions/invitation?id=${id}`, origin, "/sign-in/email")).toBe(false)
  })
})
