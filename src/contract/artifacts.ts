// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

export const workspaceFileSchema = z
  .object({
    path: z.string().min(1),
    mime: z.string().min(1),
    bytes: z.number().int(),
  })
  .strict()
export type WorkspaceFile = z.infer<typeof workspaceFileSchema>

export const deliverySchema = z
  .object({
    conversation_id: z.string().min(1),
    artifact_id: z.string().min(1),
    asset_id: z.string().min(1),
    artifact_kind: z.enum(["document", "code", "image", "audio", "video", "data", "archive", "other"]),
    title: z.string().min(1),
    mime: z.string().min(1),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    run_id: z.string().min(1),
    created_at: z.string().min(1),
  })
  .strict()
export type Delivery = z.infer<typeof deliverySchema>
