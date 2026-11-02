import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { SESSION_SHARE_METADATA_PROVENANCE, sessionShareMetadataDataSchema, sessionShareMetadataWireSchema, sessionShareMetadataErrorSchema, sessionShareMetadataOperation } from "@/generated/bff-session-share-metadata"

const share = { share_id: "shr_original", created_at: "2026-11-02T00:00:00.000Z", expires_at: null }
it("consumes the exact committed metadata projection alongside the same committed canonical source", () => {
  expect(SESSION_SHARE_METADATA_PROVENANCE.owner_commit).toBe("8ae73fde765ba55a77679c36199dcc9c1553fa11")
  expect(SESSION_SHARE_METADATA_PROVENANCE.candidate).toBe(false)
  expect(createHash("sha256").update(readFileSync("src/generated/bff-session-share-metadata.json")).digest("hex")).toBe("00c1dae24de9aa9f0d5631fd24019584bbbfc53def41c52cbecf4b12eb6c027d")
  expect(SESSION_SHARE_METADATA_PROVENANCE.canonical_source.sha256).toBe("df5a33d4fa33662e4f70967bf5db60033f71f29511bf5975aa2395d61abb3e9c")
  expect(sessionShareMetadataOperation).toEqual({ method: "GET", path: "/v1/sessions/{id}/share", operationId: "getSessionShareMetadata" })
  execFileSync(process.execPath, ["scripts/generate-bff-session-share-metadata.mjs", "--check"])
  expect(createHash("sha256").update(readFileSync("src/generated/bff-public-openapi.yaml")).digest("hex")).toBe("df5a33d4fa33662e4f70967bf5db60033f71f29511bf5975aa2395d61abb3e9c")
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
