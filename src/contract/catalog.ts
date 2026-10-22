// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

export const modelCandidateSchema = z
  .object({
    provider: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    is_default: z.boolean(),
    display_name: z.string().min(1).max(255),
    model_id: z.string().uuid(),
    revision_id: z.string().uuid(),
    provider_id: z.string().uuid(),
    feature_key: z.string().min(1).max(128),
    request_model: z.string().min(1).max(255),
  })
  .strict()
export type ModelCandidate = z.infer<typeof modelCandidateSchema>

export const modelCandidateListSchema = z
  .object({
    models: z.array(modelCandidateSchema),
    next_cursor: z.string().nullable(),
  })
  .strict()
export type ModelCandidateList = z.infer<typeof modelCandidateListSchema>
