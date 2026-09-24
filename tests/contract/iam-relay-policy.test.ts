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
      ownerCommit: "84a560abeac5b7a63f32d7064abdde849ab33cf9",
      policySha256: "f7c3d29f500ffe729da006c9ff8bf29d4f853e2a613ba92357592414bee421d9",
    })
    expect(IAM_RELAY_POLICY.iamOwnerCommit).toBe("b35a9a5301219654ea344c03407fd355f58c481e")
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
      "/iam/organization/list",
    ]) {
      expect(resolveBrowserIamGet(path, "GET"), path).not.toBeNull()
    }

    for (const [path, method] of [
      ["/iam/oauth2/userinfo", "GET"],
      ["/iam/oauth2/end-session/confirm", "GET"],
      ["/iam/oauth2/authorize", "POST"],
      ["/iam/jwks", "POST"],
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
