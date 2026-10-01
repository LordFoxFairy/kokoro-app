import { z } from "zod"

// Consumer validation of the pinned public 3.0.0 Project shapes. Additive
// Project/envelope fields are accepted; RequestMeta alone is closed by owner.
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  instruction: z.string().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})

const requestMetaSchema = z.object({ request_id: z.string().min(1).max(256) }).strict()

export const projectResponseSchema = z.object({
  data: z.object({ project: projectSchema }),
  meta: requestMetaSchema,
})

export const projectListResponseSchema = z.object({
  data: z.object({ projects: z.array(projectSchema) }),
  meta: requestMetaSchema,
})

export type Project = z.infer<typeof projectSchema>

export const projectInstructionRevisionSchema = z.object({
  id: z.string(),
  instruction: z.string(),
  updated_at: z.string().datetime({ offset: true }),
  actor_name: z.string(),
  current: z.boolean(),
})

export const projectInstructionRevisionResponseSchema = z.object({
  data: z.object({ items: z.array(projectInstructionRevisionSchema) }),
  meta: requestMetaSchema,
})

export type ProjectInstructionRevisionWire = z.infer<typeof projectInstructionRevisionSchema>
