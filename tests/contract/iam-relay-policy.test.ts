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
      ownerCommit: "87f9d8d154241e8fbde0fc61e67417ee4f1dfa56",
      policySha256: "b3c234924a48f9f92c9928f6e9d127172ee1f952658fa49dea99865cc554bc92",
    })
    expect(IAM_RELAY_POLICY.version).toBe("2.0.0")
    expect(IAM_RELAY_POLICY.iamOwnerCommit).toBe("3231d2e9b225c337a1432ffb431cd7a5269d988d")
    expect(IAM_RELAY_POLICY.iamAllowlistSha256).toBe("f63dacfa8a7bcec3c56efb8ffb762a3f8bd82bb380eff40a1462db1e77d61ead")
    expect(IAM_RELAY_POLICY.iamSnapshotSha256).toBe("b2eac1919e16fdc30a40bee0f3c4300b641bd8f674214aea7731bf10299559e1")
  })

  it("rejects a tampered owner pin or a contracted browser GET route", () => {
    expect(() => validateIamRelayPolicySnapshot({
      ...IAM_RELAY_POLICY,
      iamOwnerCommit: "0".repeat(40),
    })).toThrow("unsupported IAM relay policy snapshot")
    expect(() => validateIamRelayPolicySnapshot({
      ...IAM_RELAY_POLICY,
      routes: { ...IAM_RELAY_POLICY.routes, "/jwks": [] },
    })).toThrow("IAM relay policy is missing a browser GET route")
  })

  it("admits the fixed browser GET subset including issuer logout confirmation entry", () => {
    expect(IAM_RELAY_POLICY.webInteractionPaths).toEqual([
      "/auth/sign-in", "/auth/select-tenant", "/auth/consent",
    ])
    for (const path of [
      "/iam/.well-known/openid-configuration",
      "/iam/.well-known/oauth-authorization-server",
      "/iam/jwks",
      "/iam/oauth2/authorize?client_id=web",
      "/iam/oauth2/end-session?client_id=web",
      "/iam/get-session",
      "/iam/verify-email?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in",
    ]) {
      expect(resolveBrowserIamGet(path, "GET"), path).not.toBeNull()
    }

    for (const [path, method] of [
      ["/iam/oauth2/userinfo", "GET"],
      ["/iam/organization/list", "GET"],
      ["/iam/oauth2/end-session/confirm", "GET"],
      ["/iam/oauth2/authorize", "POST"],
      ["/iam/jwks", "POST"],
      ["/iam/verify-email", "POST"],
      ["/iam/%76erify-email", "GET"],
      ["/iam/Verify-email", "GET"],
      ["/iam/unknown", "GET"],
      ["/iam/JWKS", "GET"],
      ["/iam//jwks", "GET"],
      ["/iam/%6awks", "GET"],
      ["/iam/jwks/", "GET"],
      ["/iam/jwks#fragment", "GET"],
    ] as const) {
      expect(resolveBrowserIamGet(path, method), `${method} ${path}`).toBeNull()
    }
    expect(resolveBrowserIamGet(`/iam/jwks?x=${"a".repeat(IAM_RELAY_POLICY.maxQueryBytes)}`, "GET")).toBeNull()
    expect(resolveBrowserIamGet("/iam/verify-email?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in", "GET"))
      .toEqual({ relativePath: "/verify-email", query: "?token=a%2Bb&callbackURL=%2Fauth%2Fsign-in" })
    for (const query of [
      "", "?token=", "?token=one&token=two", "?token=one&callbackURL=%2Fauth&callbackURL=%2Fapp",
      "?%74oken=one", "?token=one&%63allbackURL=%2Fauth", "?token=one&extra=one",
    ]) {
      expect(resolveBrowserIamGet(`/iam/verify-email${query}`, "GET"), query).toBeNull()
    }
  })

  it("keeps only exact issuer cookies and rejects ambiguous duplicates", () => {
    expect(filterIssuerCookies(
      "kokoro_session=product; kokoro-issuer.session_token=one; other=x; kokoro-issuer.session_data=two",
      false,
    )).toBe("kokoro-issuer.session_token=one; kokoro-issuer.session_data=two")
    expect(filterIssuerCookies(
      "__Secure-kokoro-issuer.session_token=secure; kokoro-issuer.session_token=plain",
      true,
    )).toBe("__Secure-kokoro-issuer.session_token=secure")
    expect(filterIssuerCookies(
      "kokoro-issuer.session_token=one; kokoro-issuer.session_token=two",
      false,
    )).toBeNull()
    expect(filterIssuerCookies("kokoro-issuer.unknown=value", false)).toBe("")
    expect(filterIssuerCookies("kokoro-issuer.session_token.oauth_logout_confirmation=signed", false)).toBe("")
    expect(filterIssuerCookies("kokoro-issuer.session_token.oauth_logout_confirmation=signed", false, true))
      .toBe("kokoro-issuer.session_token.oauth_logout_confirmation=signed")
    expect(filterIssuerCookies("kokoro-issuer.session_token=ok\u0001bad", false)).toBeNull()
  })
})
