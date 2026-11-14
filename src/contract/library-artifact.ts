import { projectArtifactItemSchema } from "@/generated/bff-project-access"
import { z } from "zod"
import { canonicalProjectIdSchema } from "./conversation-move"

const artifactKind = z.enum(["document", "code", "image", "audio", "video", "data", "archive", "other"])
const decimalBytes = z.string().regex(/^(0|[1-9][0-9]*)$/u).refine((value) => Number.isSafeInteger(Number(value)) && Number(value) <= 1_073_741_824)

export const libraryArtifactItemSchema = z.object({
  kind: z.literal("artifact"),
  conversation_id: z.string().min(1).max(191),
  artifact_id: z.string().min(1).max(191),
  asset_id: z.string().min(1).max(191),
  artifact_kind: artifactKind,
  title: z.string().min(1).max(200),
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(191),
  size_bytes: decimalBytes,
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  source_run_id: z.string().min(1).max(191),
  delivered_at: z.string().datetime({ offset: true }),
  favorited: z.boolean(),
}).strict()

const cursor = z.string().min(1).max(4096).nullable()
const emptyPage = z.object({ items: z.tuple([]), next_cursor: cursor }).strict()
const artifactPage = z.object({ items: z.array(libraryArtifactItemSchema).min(1).max(100), next_cursor: cursor }).strict()
const meta = z.object({ request_id: z.string().min(1) }).strict()

export const libraryArtifactListResponseSchema = z.object({ data: z.union([emptyPage, artifactPage]), meta }).strict()
const libraryArtifactDetailSchema = libraryArtifactItemSchema.extend({
  project_ref: canonicalProjectIdSchema.nullable().optional(),
})
export const libraryArtifactDetailResponseSchema = z.object({ data: z.union([libraryArtifactDetailSchema, projectArtifactItemSchema]), meta }).strict()

export type LibraryArtifactWire = z.infer<typeof libraryArtifactItemSchema>
export type LibraryArtifactDetailWire = z.infer<typeof libraryArtifactDetailResponseSchema>["data"]
