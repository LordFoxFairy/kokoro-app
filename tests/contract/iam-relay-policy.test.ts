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
      ownerCommit: "2d951e1a56b5720431963d728b74f662e2379999",
      policySha256: "b2a3cd952da08b1f8cfc0f43db858f35ba3757b928324f56d094bff8f631c17e",
    })
    expect(IAM_RELAY_POLICY.iamOwnerCommit).toBe("606d9090c2282e13370e17a20379a32629df9722")
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

  it("admits only the read-only browser GET subset", () => {
    for (const path of [
      "/iam/.well-known/openid-configuration",
      "/iam/.well-known/oauth-authorization-server",
      "/iam/jwks",
      "/iam/oauth2/authorize?client_id=web",
      "/iam/get-session",
      "/iam/organization/list",
    ]) {
      expect(resolveBrowserIamGet(path, "GET"), path).not.toBeNull()
    }

    for (const [path, method] of [
      ["/iam/oauth2/userinfo", "GET"],
      ["/iam/oauth2/end-session", "GET"],
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
    expect(filterIssuerCookies("kokoro-issuer.session_token=ok\u0001bad", false)).toBeNull()
  })
})
