// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"
import { eventCursorSchema } from "./agui-events"
import { resumeDecisionSchema, interactionStateSchema } from "./control"
import { deliverySchema, workspaceFileSchema } from "./artifacts"
import { agentFailureProfileSchema } from "./agent-failure"


export const sessionMetaSchema = z
  .object({
    session_id: z.string().min(1),
    title: z.string().min(1),
    owner_id: z.string().min(1),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
    // Session runtime may expose the server-selected product capability on
    // newer snapshots. It is additive metadata: older Session deployments
    // omit it, so the Web contract accepts both generations while keeping
    // the identity and timestamp fields strict.
    feature_key: z.string().min(1).optional(),
  })
  .strict()
export type SessionMeta = z.infer<typeof sessionMetaSchema>

export const messageRecordSchema = z
  .object({
    message_id: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    status: z.enum(["pending", "streaming", "completed", "failed"]),
    created_at: z.string().min(1),
    run_id: z.string().min(1).optional(),
    failure: agentFailureProfileSchema.optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.failure === undefined) return
    if (message.role !== "assistant") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["role"], message: "failure requires assistant role" })
    }
    if (message.status !== "failed") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "failure requires failed status" })
    }
    if (message.run_id === undefined || message.run_id.trim().length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["run_id"], message: "failure requires a nonblank run_id" })
    }
  })
export type MessageRecord = z.infer<typeof messageRecordSchema>

export const pendingPauseSchema = interactionStateSchema.refine((state) => state.phase === "waiting" || state.phase === "resuming")
export type PendingPause = z.infer<typeof pendingPauseSchema>
export const executionHeadSchema = z.object({
  run_id: z.string().min(1), state: z.enum(["queued", "active", "waiting", "resuming"]), pending_pauses: z.array(pendingPauseSchema).max(1),
}).strict().superRefine((head, context) => {
  const pending = head.state === "waiting" || head.state === "resuming"
  if (pending ? head.pending_pauses.length !== 1 || head.pending_pauses[0]?.phase !== head.state : head.pending_pauses.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Head must match its complete pending state" })
  }
})
export type ExecutionHead = z.infer<typeof executionHeadSchema>
export const sessionListItemSchema = z
  .object({
    session_id: z.string().min(1),
    title: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()
export type SessionListItem = z.infer<typeof sessionListItemSchema>

export const sessionListSchema = z
  .object({
    sessions: z.array(sessionListItemSchema),
    next_cursor: z.string().nullable(),
  })
  .strict()
export type SessionList = z.infer<typeof sessionListSchema>
export const sessionSnapshotSchema = z
  .object({
    session: sessionMetaSchema,
    messages: z.array(messageRecordSchema).optional(),
    execution_head: executionHeadSchema.optional(),
    files: z.array(workspaceFileSchema),
    deliveries: z.array(deliverySchema),
    deliveries_has_more: z.boolean(),
    event_watermark: eventCursorSchema.nullable(),
  })
  .strict()
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>

export function parseSessionSnapshot(input: unknown): SessionSnapshot {
  return sessionSnapshotSchema.parse(input)
}

const skillSourceRefSchema = z.string().regex(
  /^skill:(?!skill:)[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u,
)

const selectedSkillSourceRefsSchema = z
  .array(skillSourceRefSchema)
  .max(16)
  .superRefine((refs, context) => {
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Skill source refs must be unique" })
    }
    if (new TextEncoder().encode(JSON.stringify(refs)).byteLength > 4096) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Skill source refs exceed 4096 JSON bytes" })
    }
  })

export const messageCreateParamsSchema = z
  .object({
    idempotency_key: z.string().min(1),
    content: z.string().min(1),
    model: z.string().min(1).optional(),
    agent: z.string().min(1).optional(),
    thinking: z.boolean().optional(),
    selected_skill_source_refs: selectedSkillSourceRefsSchema.default([]),
    mcp_servers: z.array(z.string().min(1)).optional(),
    // Opaque project ownership for a project's first task. Tenant/site
    // identity is resolved by the BFF and is deliberately not browser data.
    project_ref: z.string().min(1).optional(),
  })
  .strict()
export type MessageCreateParams = z.infer<typeof messageCreateParamsSchema>

export const messageCreateReceiptSchema = z
  .object({
    run_id: z.string().min(1),
    user_message_id: z.string().min(1),
    assistant_message_id: z.string().min(1),
  })
  .strict()
export type MessageCreateReceipt = z.infer<typeof messageCreateReceiptSchema>

export const runControlBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("run.cancel") }).strict(),
  z.object({ kind: z.literal("run.resume"), expected_pause_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), pause_ref: z.string().min(1), decisions: z.array(resumeDecisionSchema).min(1) }).strict(),
  z.object({ kind: z.literal("run.steer"), message_id: z.string().min(1), content: z.string().min(1) }).strict(),
])
export type RunControlBody = z.infer<typeof runControlBodySchema>

export const runControlReceiptSchema = z.object({
  run_id: z.string().min(1),
  command_id: z.string().min(1),
  request_digest: z.string().min(1),
  status: z.enum(["pending", "succeeded", "failed"]),
  error_code: z.string().min(1).nullable().optional(),
  replayed: z.boolean(),
}).strict()
export type RunControlReceipt = z.infer<typeof runControlReceiptSchema>

export const mutationReceiptSchema = z.object({ ok: z.literal(true) }).strict()
export type MutationReceipt = z.infer<typeof mutationReceiptSchema>

export const renameSessionBodySchema = z.object({ title: z.string().min(1) }).strict()
export type RenameSessionBody = z.infer<typeof renameSessionBodySchema>
export const renameSessionReceiptSchema = z.object({ ok: z.literal(true) }).strict()
export type RenameSessionReceipt = z.infer<typeof renameSessionReceiptSchema>

export const shareReceiptSchema = z.object({ share_id: z.string().min(1) }).strict()
export type ShareReceipt = z.infer<typeof shareReceiptSchema>

export const controlReceiptViewSchema = z.object({ command_id: z.string().min(1), status: z.enum(["pending", "succeeded", "failed"]), replayed: z.boolean().optional() }).strict()
export type ControlReceiptView = z.infer<typeof controlReceiptViewSchema>

export const deleteSessionReceiptSchema = z.object({ status: z.string().min(1) }).strict()
export type DeleteSessionReceipt = z.infer<typeof deleteSessionReceiptSchema>

export const errorResponseSchema = z.object({ error: z.string().min(1) }).strict()
export type ErrorResponse = z.infer<typeof errorResponseSchema>
