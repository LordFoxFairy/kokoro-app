// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"
import { resumeDecisionSchema } from "./control"
import { deliverySchema, workspaceFileSchema } from "./artifacts"

export const riskSchema = z
  .object({
    level: z.string().min(1),
    source: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict()
export type Risk = z.infer<typeof riskSchema>

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
  })
  .strict()
export type MessageRecord = z.infer<typeof messageRecordSchema>

export const activeRunSchema = z
  .object({
    run_id: z.string().min(1),
    status: z.string().min(1),
  })
  .strict()
export type ActiveRun = z.infer<typeof activeRunSchema>

export const pendingPauseSchema = z
  .object({
    pause_id: z.string().min(1),
    run_id: z.string().min(1),
    tool_id: z.string().min(1),
    segment_id: z.string().min(1),
    tool_name: z.string().min(1),
    kind: z.enum(["tool_approval", "ask_user_question", "result_review", "input"]),
    args: z.record(z.unknown()),
    description: z.string(),
    allowed_decisions: z.array(z.enum(["approve", "edit", "reject", "respond", "submit"])),
    risk: riskSchema.optional(),
    editable: z.boolean(),
    input_schema: z.record(z.unknown()).optional(),
    result: z.string().optional(),
    status: z.enum(["pending", "resolved", "cancelled", "expired"]),
    decision: z.record(z.unknown()).optional(),
    created_at: z.string().min(1),
    resolved_at: z.string().min(1).optional(),
  })
  .strict()
export type PendingPause = z.infer<typeof pendingPauseSchema>
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
    next_cursor: z.string().min(1).optional(),
  })
  .strict()
export type SessionList = z.infer<typeof sessionListSchema>
export const sessionSnapshotSchema = z
  .object({
    session: sessionMetaSchema,
    messages: z.array(messageRecordSchema).optional(),
    active_run: activeRunSchema.optional(),
    pending_pauses: z.array(pendingPauseSchema),
    files: z.array(workspaceFileSchema),
    deliveries: z.array(deliverySchema),
    event_watermark: z.number().int(),
  })
  .strict()
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>

export function parseSessionSnapshot(input: unknown): SessionSnapshot {
  return sessionSnapshotSchema.parse(input)
}

export const messageCreateParamsSchema = z
  .object({
    idempotency_key: z.string().min(1),
    content: z.string().min(1),
    model: z.string().min(1).optional(),
    agent: z.string().min(1).optional(),
    thinking: z.boolean().optional(),
    pinned_skills: z.array(z.string().min(1)).optional(),
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
  z.object({ kind: z.literal("run.cancel"), session_id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("run.resume"), session_id: z.string().min(1), decisions: z.array(resumeDecisionSchema).min(1) }).strict(),
  z.object({ kind: z.literal("run.steer"), session_id: z.string().min(1), message_id: z.string().min(1), content: z.string().min(1) }).strict(),
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
