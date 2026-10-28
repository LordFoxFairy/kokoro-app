import { restorePublic281ProjectMcpRecommendationsContract } from "./bff-project-mcp-recommendations-parent"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { expect, it } from "vitest"
import YAML from "yaml"
import { BFF_PROJECT_RESOURCE_PROVENANCE, BFF_PROJECT_RESOURCE_MAX_BYTES, projectResourceItemResponseSchema, projectResourceDeletionResponseSchema, projectResourceErrorEnvelopeSchema, projectResourceAssetIdSchema } from "@/generated/bff-project-resource"
import { restorePublic28ProjectResourceContract, projectResourcePublic28Sha256 } from "./bff-project-resource-parent"

const snapshot = "src/generated/bff-public-openapi.yaml"
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
it("consumes only fixed Public28.1 and inverses its exact resource delta before unchanged Public28 history", async () => {
  const source = await readFile(snapshot, "utf8")
  expect(hash(source)).toBe(BFF_PROJECT_RESOURCE_PROVENANCE.sourceSha256)
  expect(BFF_PROJECT_RESOURCE_PROVENANCE).toEqual({ ownerCommit: "d629653cbf5799a44db55a947321a6ec152b7dcd", sourceSha256: "4d93ec15e2931768afafffb2101039b1da64757ea48c760d16ef88aa8753db16", openapiVersion: "28.11.0" })
  expect(hash(restorePublic28ProjectResourceContract(source))).toBe(projectResourcePublic28Sha256)
  expect(projectResourcePublic28Sha256).toBe("34ca44c01ebc73f7ff76a4a06be33696b96ba1636e8818f02c38d57b1f539809")
  const spec = YAML.parse(restorePublic281ProjectMcpRecommendationsContract(source))
  const methods = ["get", "post", "put", "patch", "delete", "head", "options"]
  expect(Object.values(spec.paths).flatMap((p) => Object.keys(p as object).filter((k) => methods.includes(k)))).toHaveLength(190)
  const parent = YAML.parse(restorePublic28ProjectResourceContract(source))
  expect(Object.values(parent.paths).flatMap((p) => Object.keys(p as object).filter((k) => methods.includes(k)))).toHaveLength(187)
  for (const changed of [source + "\n", source.replace("project.resource.read", "forged.read"), source.replace("operationId: getProjectResource", "operationId: forged"), source.replace("const: clean", "const: pending"), source.replace("listTeamMembers", "changedOperation")]) {
    expect(changed).not.toBe(source)
    expect(() => restorePublic28ProjectResourceContract(changed)).toThrow(/drift/u)
  }
})
it("derives closed metadata/deletion/error decoders from the fixed snapshot without invented list-only fields", async () => {
  execFileSync(process.execPath, ["scripts/generate-bff-project-resource.mjs", "--check"], { cwd: process.cwd(), encoding: "utf8" })
  expect(BFF_PROJECT_RESOURCE_MAX_BYTES).toBe(1073741824)
  expect(projectResourceAssetIdSchema.safeParse("asset_1").success).toBe(true)
  for (const id of ["", "asset/1", "asset?1", "x".repeat(192)]) expect(projectResourceAssetIdSchema.safeParse(id).success).toBe(false)
  const resource = { asset_id: "asset_1", filename: "notes.txt", mime_type: "text/plain", size_bytes: "12", content_sha256: "a".repeat(64), scan_state: "clean" }
  const metadata = { data: { resource }, meta: { request_id: "request_1" } }
  expect(projectResourceItemResponseSchema.safeParse(metadata).success).toBe(true)
  for (const value of [{ ...metadata, extra: true }, { data: resource, meta: metadata.meta }, { ...metadata, meta: {} }, { ...metadata, data: { resource: { ...resource, created_at: "2026-10-27T00:00:00Z" } } }, { ...metadata, data: { resource: { ...resource, scan_state: "pending" } } }]) {
    expect(projectResourceItemResponseSchema.safeParse(value).success).toBe(false)
  }
  expect(projectResourceDeletionResponseSchema.safeParse({ data: { asset_id: "asset_1", deleted_at: "2026-10-27T00:00:00Z", replayed: true }, meta: metadata.meta }).success).toBe(true)
  expect(projectResourceDeletionResponseSchema.safeParse({ data: { asset_id: "asset_1", deleted_at: "not-date", replayed: true }, meta: metadata.meta }).success).toBe(false)
  expect(projectResourceErrorEnvelopeSchema.safeParse({ error: { code: "asset_not_found", message: "missing" }, meta: metadata.meta }).success).toBe(true)
  expect(projectResourceErrorEnvelopeSchema.safeParse({ error: { code: "asset_not_found", message: "missing", retryable: false }, meta: metadata.meta }).success).toBe(false)
})
