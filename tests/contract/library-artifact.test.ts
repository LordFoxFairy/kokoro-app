import { expect, it } from "vitest"

import { libraryArtifactDetailResponseSchema, libraryArtifactListResponseSchema } from "@/contract/library-artifact"

const item = {
  kind: "artifact", conversation_id: "conversation-1", artifact_id: "artifact-1", asset_id: "asset-1",
  artifact_kind: "document", title: "Report", filename: "report.pdf", mime_type: "application/pdf",
  size_bytes: "2048", content_sha256: "a".repeat(64), source_run_id: "run-1", delivered_at: "2026-09-28T10:00:00Z",
}
const envelope = (items: unknown[], next_cursor: string | null = null) => ({ data: { items, next_cursor }, meta: { request_id: "req-1" } })

it("accepts an empty page with a continuation cursor but no file or mixed page", () => {
  expect(libraryArtifactListResponseSchema.parse(envelope([], "cursor-2")).data.next_cursor).toBe("cursor-2")
  expect(libraryArtifactListResponseSchema.parse(envelope([item])).data.items).toHaveLength(1)
  expect(libraryArtifactListResponseSchema.safeParse(envelope([{ ...item, kind: "file" }])).success).toBe(false)
  expect(libraryArtifactListResponseSchema.safeParse(envelope([item, { ...item, kind: "file" }])).success).toBe(false)
  expect(libraryArtifactListResponseSchema.safeParse(envelope([{ ...item, content_hash: "legacy" }])).success).toBe(false)
})

it("requires a full two-part detail identity and bounded owner fields", () => {
  expect(libraryArtifactDetailResponseSchema.parse({ data: item, meta: { request_id: "req-1" } }).data.artifact_id).toBe("artifact-1")
  expect(libraryArtifactDetailResponseSchema.safeParse({ data: { ...item, conversation_id: "" }, meta: { request_id: "req-1" } }).success).toBe(false)
  expect(libraryArtifactDetailResponseSchema.safeParse({ data: { ...item, size_bytes: "-1" }, meta: { request_id: "req-1" } }).success).toBe(false)
  expect(libraryArtifactDetailResponseSchema.safeParse({ data: { ...item, content_sha256: "BAD" }, meta: { request_id: "req-1" } }).success).toBe(false)
})
