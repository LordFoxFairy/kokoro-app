import { z } from "zod";
import { installationIdSchema } from "./schemas";

// Browser-private canonical Project target; never a slug or a user-supplied owner identity.
export const projectSkillIdSchema = z.string().regex(/^project_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/u);
export const projectSkillSelectionInputSchema = z.object({
  installation_ids: z.array(installationIdSchema).max(16).refine(ids => new Set(ids).size === ids.length),
}).strict();
export const projectSkillSelectionSchema = z.object({ data: projectSkillSelectionInputSchema.extend({ project_id: projectSkillIdSchema }).strict() }).strict();
export type ProjectSkillSelection = z.infer<typeof projectSkillSelectionSchema>["data"];
