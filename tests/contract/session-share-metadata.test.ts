import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { SESSION_SHARE_METADATA_PROVENANCE, sessionShareMetadataDataSchema, sessionShareMetadataWireSchema, sessionShareMetadataErrorSchema, sessionShareMetadataOperation } from "@/generated/bff-session-share-metadata"

const share = { share_id: "shr_original", created_at: "2026-11-02T00:00:00.000Z", expires_at: null }
it("consumes the exact committed metadata projection without replacing the old public artifact", () => {
  expect(SESSION_SHARE_METADATA_PROVENANCE.owner_commit).toBe("2e737cad9649460dc477fc7d96ba593783fef619")
  expect(SESSION_SHARE_METADATA_PROVENANCE.candidate).toBe(false)
  expect(createHash("sha256").update(readFileSync("src/generated/bff-session-share-metadata.json")).digest("hex")).toBe("112d6e9be1f3969b7820f85a06e627966b72d669b02898d7f57f64e18d03bb2f")
  expect(SESSION_SHARE_METADATA_PROVENANCE.canonical_source.sha256).toBe("4e4ce620887b1a1a431a9346d0d259aa5bed3bd5af06f4428f11e9054173418e")
  expect(sessionShareMetadataOperation).toEqual({ method: "GET", path: "/v1/sessions/{id}/share", operationId: "getSessionShareMetadata" })
  execFileSync(process.execPath, ["scripts/generate-bff-session-share-metadata.mjs", "--check"])
  expect(createHash("sha256").update(readFileSync("src/generated/bff-public-openapi.yaml")).digest("hex")).toBe("258bde9c39f785667cb205976e1547d1cf2c9662a5a2d7f356c4b11e807fcaf7")
})
it("distinguishes an accessible unshared session from metadata or envelope corruption", () => {
  expect(sessionShareMetadataDataSchema.parse({ share: null })).toEqual({ share: null })
  expect(sessionShareMetadataDataSchema.parse({ share })).toEqual({ share })
  for (const invalid of [{}, { share, can_manage: true }, { share: { ...share, expires_at: "invalid" } }, { share: { ...share, url: "http://external.test" } }, { share: { ...share, created_at: "yesterday" } }, { share: { ...share, share_id: "" } }]) expect(sessionShareMetadataDataSchema.safeParse(invalid).success).toBe(false)
  const wire = { data: { share }, meta: { request_id: "request_actual" } }
  expect(sessionShareMetadataWireSchema.safeParse(wire).success).toBe(true)
  expect(sessionShareMetadataWireSchema.safeParse({ ...wire, meta: { ...wire.meta, tenant: "forged" } }).success).toBe(false)
  expect(sessionShareMetadataErrorSchema.safeParse({ error: { code: "session_not_found", message: "Not found" }, meta: wire.meta }).success).toBe(true)
  expect(sessionShareMetadataErrorSchema.safeParse({ error: { code: "session_not_found", message: "Not found", share: null }, meta: wire.meta }).success).toBe(false)
})
