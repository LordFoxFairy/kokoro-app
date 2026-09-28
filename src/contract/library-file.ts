import { z } from "zod"

// Runtime consumer of the pinned BFF LibraryFileListResponse, not an editable public contract.
const libraryFileSchema = z.object({
  kind: z.literal("file"),
  asset_id: z.string().min(1).max(191),
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(191),
  size_bytes: z.string().regex(/^(0|[1-9][0-9]*)$/),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  scan_state: z.literal("clean"),
  created_at: z.string().datetime({ offset: true }),
}).strict()

export const libraryFileListResponseSchema = z.object({
  data: z.object({
    items: z.array(libraryFileSchema).max(100),
    next_cursor: z.string().min(1).max(4096).nullable(),
  }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).strict(),
}).strict()

// Personal upload returns a CLEAN receipt without list-only created_at.
export const libraryFileUploadResponseSchema = z.object({
  data: z.object({
    file: libraryFileSchema.omit({ created_at: true }),
  }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).strict(),
}).strict()
