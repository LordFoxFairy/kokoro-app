// Public4 interaction and decision schemas. No private execution locator or arguments on reads.
import { z } from "zod"

const identity = z.string().min(1).refine((value) => value.trim().length > 0)
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export const resumeDecisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve"), item_id: identity, args: z.record(z.unknown()).nullable().optional() }).strict(),
  z.object({ type: z.literal("edit"), item_id: identity, args: z.record(z.unknown()) }).strict(),
  z.object({ type: z.literal("reject"), item_id: identity, reason: z.string().nullable().optional() }).strict(),
  z.object({ type: z.literal("respond"), item_id: identity, response: z.string().min(1) }).strict(),
  z.object({ type: z.literal("submit"), item_id: identity, value: z.record(z.unknown()) }).strict(),
])
export type ResumeDecision = z.infer<typeof resumeDecisionSchema>
export type ResumeDecisionType = ResumeDecision["type"]

export const interactionDisplaySchema = z.object({
  name: identity, description: z.string(), editable: z.boolean(), input_schema: z.record(z.unknown()),
  result_preview: z.string().nullable().optional(), truncated: z.boolean().nullable().optional(), source: z.string().nullable().optional(),
}).strict().superRefine((display, context) => {
  if (typeof display.result_preview === "string" && (typeof display.truncated !== "boolean" || !display.source?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Preview requires truncation and provenance" })
  }
})
export const interactionItemSchema = z.object({
  item_id: identity, request_id: identity,
  kind: z.enum(["tool_approval", "ask_user_question", "result_review", "input"]),
  allowed_decisions: z.array(z.enum(["approve", "edit", "reject", "respond", "submit"])).min(1).refine((v) => new Set(v).size === v.length),
  display: interactionDisplaySchema,
  validation: z.object({ code: z.literal("json_schema_invalid"), instance_path: z.array(z.union([z.string(), z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)])) }).strict().nullable().optional(),
}).strict()
export type InteractionItem = z.infer<typeof interactionItemSchema>
export const interactionStateSchema = z.object({
  interaction_revision: revision, pause_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), pause_ref: identity.nullable(),
  phase: z.enum(["active", "waiting", "resuming", "terminal"]),
  groups: z.array(z.object({ group_id: identity, items: z.array(interactionItemSchema).min(1) }).strict()),
  action_result: z.object({ command_id: identity, pause_revision: revision, kind: z.enum(["accepted", "unknown", "native_consumed", "validation_failed", "cancelled"]) }).strict().nullable(),
}).strict().superRefine((state, context) => {
  const bad = () => context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid complete interaction state" })
  if (state.pause_revision > state.interaction_revision || (state.pause_revision === 0) !== (state.pause_ref === null)) bad()
  const pending = state.phase === "waiting" || state.phase === "resuming"
  if (pending ? state.groups.length === 0 || state.pause_revision === 0 : state.groups.length !== 0) bad()
  const groups = new Set<string>(), items = new Set<string>()
  for (const group of state.groups) {
    if (groups.has(group.group_id)) bad()
    groups.add(group.group_id)
    for (const item of group.items) { if (items.has(item.item_id)) bad(); items.add(item.item_id) }
  }
  const action = state.action_result
  if (action && action.pause_revision > state.pause_revision) bad()
  if (state.phase === "resuming" && (!action || !["accepted", "unknown"].includes(action.kind) || action.pause_revision !== state.pause_revision)) bad()
  if (state.phase === "waiting" && action?.kind === "validation_failed" && action.pause_revision >= state.pause_revision) bad()
})
export type InteractionState = z.infer<typeof interactionStateSchema>
