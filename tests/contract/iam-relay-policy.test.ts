import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { iamRelayConfig } from "@/lib/server/iam-relay-config"
import { nativeIamResponse } from "@/lib/server/iam-relay-response"
import {
  filterIssuerCookies,
  IAM_RELAY_POLICY,
  IAM_RELAY_POLICY_PROVENANCE,
  resolveBrowserIamGet,
  validateIamRelayPolicySnapshot,
} from "@/lib/server/iam-relay-policy"

describe("fixed BFF IAM relay policy consumer", () => {
  it("pins the exact BFF policy blob and owner provenance", async () => {
    const bytes = await readFile(resolve(process.cwd(), "src/generated/iam-relay-policy.json"))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(IAM_RELAY_POLICY_PROVENANCE.policySha256)
    expect(IAM_RELAY_POLICY_PROVENANCE).toEqual({
      ownerRepository: "kokoro-bff",
      ownerCommit: "34c9f997a4d86f33be2f815c43cd155ed338fe86",
      policySha256: "c88bab0bd1d5529573eee318e50ac2dd41349a03fc84e8b7284416af700a0ebe",
    })
    expect(IAM_RELAY_POLICY.routes).toEqual({
      "/sign-up/email": ["POST"],
      "/sign-in/email": ["POST"],
      "/verify-email": ["GET"],
      "/sign-out": ["POST"],
      "/organization/set-active": ["POST"],
    })
  })

  it("rejects a tampered owner pin or a contracted browser GET route", () => {
    expect(() => validateIamRelayPolicySnapshot({ ...IAM_RELAY_POLICY, iamOwnerCommit: "0".repeat(40) })).toThrow("unsupported IAM relay policy snapshot")
    expect(() => validateIamRelayPolicySnapshot({ ...IAM_RELAY_POLICY, routes: { ...IAM_RELAY_POLICY.routes, "/verify-email": [] } })).toThrow(
      "IAM relay policy is missing a browser GET route",
    )
    expect(() =>
      validateIamRelayPolicySnapshot({
        ...IAM_RELAY_POLICY,
        invitationRoutes: [{ ...IAM_RELAY_POLICY.invitationRoutes[0], visibility: "public" }, ...IAM_RELAY_POLICY.invitationRoutes.slice(1)],
      }),
    ).toThrow("IAM relay invitation policy is invalid")
  })

  it("admits only native browser GET routes and exact invitation verification queries", () => {
    expect(IAM_RELAY_POLICY.webInteractionPaths).toEqual(["/auth/sign-in", "/auth/select-tenant", "/iam/interactions/invitation"])
    expect(resolveBrowserIamGet("/iam/get-session", "GET")).toBeNull()
    expect(resolveBrowserIamGet("/iam/verify-email?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in", "GET")).toEqual({
      relativePath: "/verify-email",
      query: "?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in",
    })
    for (const path of ["/iam/get-session?disableRefresh=true", "/iam/get-session?disableCookieCache=true&disableRefresh=true", "/iam/oauth2/authorize", "/iam/jwks", "/iam/oauth2/end-session", "/iam/get-session/", "/iam/%67et-session"]) {
      expect(resolveBrowserIamGet(path, "GET"), path).toBeNull()
    }
  })

  it("keeps only exact issuer cookies and rejects ambiguous duplicates", () => {
    expect(filterIssuerCookies("kokoro_session=product; kokoro-issuer.session_token=one; other=x; kokoro-issuer.session_data=two", false)).toBe(
      "kokoro-issuer.session_token=one; kokoro-issuer.session_data=two",
    )
    expect(filterIssuerCookies("__Secure-kokoro-issuer.session_token=secure; kokoro-issuer.session_token=plain", true)).toBe(
      "__Secure-kokoro-issuer.session_token=secure",
    )
    expect(filterIssuerCookies("kokoro-issuer.session_token=one; kokoro-issuer.session_token=two", false)).toBeNull()
    expect(filterIssuerCookies("kokoro-issuer.unknown=value", false)).toBe("")
    expect(filterIssuerCookies("kokoro-issuer.session_token.oauth_logout_confirmation=signed", false)).toBe("")
    expect(filterIssuerCookies("kokoro-issuer.session_token=ok\u0001bad", false)).toBeNull()
  })

  it.each([
    { mode: "development", origin: "http://web.example.test", secure: false },
    { mode: "test", origin: "http://web.example.test", secure: false },
    { mode: "development", origin: "https://web.example.test", secure: true },
    { mode: "test", origin: "https://web.example.test", secure: true },
    { mode: "production", origin: "https://web.example.test", secure: true },
    { mode: "production", origin: "http://web.example.test", secure: true },
  ] as const)("selects the exact issuer mode for $mode $origin without lowering the production floor", ({ mode, origin, secure }) => {
    const config = iamRelayConfig({
      NODE_ENV: mode,
      KOKORO_BFF_BASE_URL: "http://bff.internal.test",
      KOKORO_WEB_ORIGIN: origin,
      KOKORO_INTERNAL_SECRET_WEB_BFF: "fixture-service-secret",
    })
    if (config === null) throw new Error("valid relay configuration was rejected")
    const prefix = secure ? "__Secure-kokoro-issuer." : "kokoro-issuer."
    const pair = `${prefix}session_token=selected`
    expect(filterIssuerCookies("kokoro-issuer.session_token=selected; __Secure-kokoro-issuer.session_token=selected; unrelated=private", config.secureCookies)).toBe(pair)
    const deletion = `${prefix}session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
    const upstream = { status: 200, headers: new Headers(), setCookies: [deletion], body: new Uint8Array() }
    expect(nativeIamResponse(upstream, origin, config.secureCookies, "mode-check")?.headers.getSetCookie()).toEqual([deletion])
    const wrongPrefix = secure ? "kokoro-issuer." : "__Secure-kokoro-issuer."
    expect(nativeIamResponse({ ...upstream, setCookies: [`${wrongPrefix}session_token=other; Path=/; HttpOnly; SameSite=Lax; Secure`] }, origin, config.secureCookies, "mode-check")).toBeNull()
    if (secure) expect(nativeIamResponse({ ...upstream, setCookies: [deletion.replace("; Secure", "")] }, origin, config.secureCookies, "mode-check")).toBeNull()
  })
})
