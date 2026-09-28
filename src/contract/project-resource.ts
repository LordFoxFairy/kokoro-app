import { z } from "zod"

// Browser projection of the pinned BFF ProjectResourceUploadResponse.
const resourceSchema = z.object({
  upload_id: z.string().min(1),
  asset_id: z.string().min(1),
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(191),
  size_bytes: z.string().regex(/^(0|[1-9][0-9]*)$/),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  scan_state: z.literal("clean"),
}).strict()

export const projectResourceUploadResponseSchema = z.object({
  data: z.object({ resources: z.array(resourceSchema).length(1) }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).passthrough(),
}).strict()

export type ProjectResourceUploadResult = {
  assetId: string
  filename: string
  mimeType: string
  sizeBytes: string
}
