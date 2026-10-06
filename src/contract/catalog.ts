// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"

export const modelCandidateSchema = z
  .object({
    provider: z.string().min(1),
    name: z.string().min(1),
    is_default: z.boolean(),
    display_name: z.string().min(1).optional(),
  })
  .strict()
export type ModelCandidate = z.infer<typeof modelCandidateSchema>

export const modelCandidateListSchema = z
  .object({
    models: z.array(modelCandidateSchema),
  })
  .strict()
export type ModelCandidateList = z.infer<typeof modelCandidateListSchema>
