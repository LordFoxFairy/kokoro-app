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
    content_hash: z.string().min(1),
    path: z.string().min(1),
    title: z.string().min(1),
    mime: z.string().min(1),
    size: z.number().int(),
    run_id: z.string().min(1),
    created_at: z.string().min(1),
  })
  .strict()
export type Delivery = z.infer<typeof deliverySchema>

export const artifactRecordSchema = z
  .object({
    content_hash: z.string().min(1),
    session_id: z.string().min(1),
    title: z.string().min(1),
    mime: z.string().min(1),
    size: z.number().int(),
    created_at: z.string().min(1),
  })
  .strict()
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>

export const artifactListSchema = z
  .object({
    artifacts: z.array(artifactRecordSchema),
    next_cursor: z.string().min(1).optional(),
  })
  .strict()
export type ArtifactList = z.infer<typeof artifactListSchema>
