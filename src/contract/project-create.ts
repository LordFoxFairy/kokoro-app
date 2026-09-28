import { z } from "zod"

// Consumer narrowing of the pinned BFF public ProjectResponse; never a second
// editable public API definition.
const projectSchema = z.object({
  id: z.string().trim().min(1).refine((id) => !id.startsWith("preview-project")),
  slug: z.string().trim().min(1),
  name: z.string().min(1),
  description: z.string(),
  instruction: z.string().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})

export const projectCreateResponseSchema = z.object({
  data: z.object({ project: projectSchema }),
  meta: z.object({ request_id: z.string().min(1) }).passthrough(),
})
