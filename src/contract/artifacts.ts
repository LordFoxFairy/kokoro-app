// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"
import { safeVirtualPathSchema } from "./answer-actions"

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

// Delivery proofs share the owner's safe virtual-path domain, but never
// expose a private dot mount such as /.inputs or /.skills.
export const deliveredArtifactDisplayPathSchema = safeVirtualPathSchema.refine(
  value => !value.slice(1).split("/").some(segment => segment.startsWith(".")),
  "Invalid delivered artifact display path",
)
export const privateDeliverySchema = deliverySchema.extend({
  display_path: deliveredArtifactDisplayPathSchema.optional(),
}).strict()
export type PrivateDelivery = z.infer<typeof privateDeliverySchema>
