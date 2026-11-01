import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

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
      ownerCommit: "071c490",
      policySha256: "b2adc766332c1ca87b55900f359f5cc931b7f50505a19ea21cbb0c36faf9f72f",
    })
    expect(IAM_RELAY_POLICY.routes).toEqual({
      "/sign-up/email": ["POST"],
      "/sign-in/email": ["POST"],
      "/verify-email": ["GET"],
      "/sign-out": ["POST"],
      "/get-session": ["GET"],
      "/organization/set-active": ["POST"],
    })
  })

  it("rejects a tampered owner pin or a contracted browser GET route", () => {
    expect(() => validateIamRelayPolicySnapshot({ ...IAM_RELAY_POLICY, iamOwnerCommit: "0".repeat(40) })).toThrow("unsupported IAM relay policy snapshot")
    expect(() => validateIamRelayPolicySnapshot({ ...IAM_RELAY_POLICY, routes: { ...IAM_RELAY_POLICY.routes, "/get-session": [] } })).toThrow(
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
    expect(resolveBrowserIamGet("/iam/get-session", "GET")).toEqual({ relativePath: "/get-session", query: "" })
    expect(resolveBrowserIamGet("/iam/verify-email?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in", "GET")).toEqual({
      relativePath: "/verify-email",
      query: "?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in",
    })
    for (const path of ["/iam/oauth2/authorize", "/iam/jwks", "/iam/oauth2/end-session", "/iam/get-session/", "/iam/%67et-session"]) {
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
})
