// Canonical v1 runtime contract. Keep these schemas synchronized with the checked-in API documentation and contract tests.

import { z } from "zod"
import { eventCursorSchema, runProcessActivitySchema, runTodoSchema } from "./agui-events"
import { resumeDecisionSchema, interactionStateSchema } from "./control"
import { deliverySchema, workspaceFileSchema } from "./artifacts"
import { agentFailureProfileSchema } from "./agent-failure"
import { BFF_PRIVATE_CANCELLED_STATUS } from "@/generated/bff-agent-failure"


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

export const messageRecordSchema = z
  .object({
    message_id: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    status: z.enum(["pending", "streaming", "completed", "failed"]),
    created_at: z.string().min(1),
    run_id: z.string().min(1).optional(),
    failure: agentFailureProfileSchema.optional(),
    selected_skill_source_refs: selectedSkillSourceRefsSchema.optional(),
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

// Private reads retain Message ownership while bounded parts are read separately.
export const messagePartsDecimalSchema = z.string().regex(/^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u)
  .refine((value) => BigInt(value) <= BigInt("9223372036854775807"))
const positivePartsDecimalSchema = messagePartsDecimalSchema.refine((value) => value !== "0")
const scalarTextSchema = z.string().refine((value) => Array.from(value).length <= 4096 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
export const orderedMessageRenderingSchema = z.object({
  mode: z.literal("ordered"), format_version: z.literal(1), revision: messagePartsDecimalSchema,
  event_watermark: eventCursorSchema.nullable(), parts_cursor: z.string().min(1),
}).strict()
const privateInlineMessageReadSchema = messageRecordSchema.innerType().extend({
  terminal_status: z.literal(BFF_PRIVATE_CANCELLED_STATUS).optional(),
}).superRefine((message, context) => {
  const { terminal_status: terminalStatus, ...original } = message
  const parsed = messageRecordSchema.safeParse(original)
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue(issue)
  if (terminalStatus !== undefined && (message.role !== "assistant" || message.status !== "failed" ||
    !message.run_id?.trim() || message.failure !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["terminal_status"], message: "cancelled requires an exact failed assistant without failure" })
  }
})
export const orderedAssistantMessageReadSchema = z.object({
  message_id: z.string().min(1), role: z.literal("assistant"), content: z.null(),
  status: z.enum(["pending", "streaming", "completed", "failed"]), created_at: z.string().min(1),
  run_id: z.string().min(1), failure: agentFailureProfileSchema.optional(),
  terminal_status: z.literal(BFF_PRIVATE_CANCELLED_STATUS).optional(),
  selected_skill_source_refs: selectedSkillSourceRefsSchema.optional(), rendering: orderedMessageRenderingSchema,
}).strict().refine((message) => (message.failure === undefined || message.status === "failed") &&
  (message.terminal_status === undefined || (message.status === "failed" && message.failure === undefined && message.run_id.trim().length > 0)))
export const chatMessageReadSchema = z.union([privateInlineMessageReadSchema, orderedAssistantMessageReadSchema])
export type ChatMessageRead = z.infer<typeof chatMessageReadSchema>
const messagePartPosition = { part_id: z.string().min(1), first_sequence: positivePartsDecimalSchema, latest_sequence: positivePartsDecimalSchema }
export const messageTextPartSliceSchema = z.object({
  kind: z.literal("text"), ...messagePartPosition, segment_id: z.string().min(1), text: scalarTextSchema,
  offset: messagePartsDecimalSchema, end: messagePartsDecimalSchema, total_scalars: messagePartsDecimalSchema, completed: z.boolean(),
}).strict().refine((part) => BigInt(part.offset) <= BigInt(part.end) && BigInt(part.end) <= BigInt(part.total_scalars) &&
  BigInt(part.end) - BigInt(part.offset) === BigInt(Array.from(part.text).length))
export const messageActivityPartSchema = z.object({ kind: z.literal("activity"), ...messagePartPosition, activity: runProcessActivitySchema }).strict()
export const messagePartSchema = z.union([messageTextPartSliceSchema, messageActivityPartSchema])
export type MessagePart = z.infer<typeof messagePartSchema>
export type MessageTextPartSlice = z.infer<typeof messageTextPartSliceSchema>
export const messagePartsPageSchema = z.object({
  session_id: z.string().min(1), message_id: z.string().min(1), run_id: z.string().min(1), format_version: z.literal(1),
  revision: messagePartsDecimalSchema, event_watermark: eventCursorSchema.nullable(), items: z.array(messagePartSchema).max(32), next_cursor: z.string().min(1).nullable(),
}).strict().superRefine((page, context) => {
  let previous = BigInt(0)
  for (const part of page.items) {
    const first = BigInt(part.first_sequence), latest = BigInt(part.latest_sequence)
    if (first < previous || first > latest || latest > BigInt(page.revision)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid public part position" })
    previous = first
  }
})
export type MessagePartsPage = z.infer<typeof messagePartsPageSchema>

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
export type RunProcessActivity = z.infer<typeof runProcessActivitySchema>
export const runExecutionProcessSchema = z.object({ run_id: z.string().min(1), todos: z.array(runTodoSchema).max(100).nullable(), activities: z.array(runProcessActivitySchema).max(100), next_cursor: eventCursorSchema.nullable() }).strict()
export type RunExecutionProcess = z.infer<typeof runExecutionProcessSchema>
export const runProcessPageSchema = runExecutionProcessSchema.extend({ event_watermark: eventCursorSchema }).strict()
export type RunProcessPage = z.infer<typeof runProcessPageSchema>
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
export const sharedSessionSnapshotSchema = z
  .object({
    session: sessionMetaSchema,
    messages: z.array(messageRecordSchema).optional(),
    execution_head: executionHeadSchema.optional(),
    execution_process: z.null(),
    files: z.array(workspaceFileSchema),
    deliveries: z.array(deliverySchema),
    deliveries_has_more: z.boolean(),
    event_watermark: eventCursorSchema.nullable(),
  })
  .strict()
export type SharedSessionSnapshot = z.infer<typeof sharedSessionSnapshotSchema>
export function parseSharedSessionSnapshot(input: unknown): SharedSessionSnapshot { return sharedSessionSnapshotSchema.parse(input) }
export const sessionSnapshotSchema = sharedSessionSnapshotSchema.extend({ messages: z.array(chatMessageReadSchema).optional(), execution_process: runExecutionProcessSchema.nullable() }).strict()
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>

export function parseSessionSnapshot(input: unknown): SessionSnapshot {
  return sessionSnapshotSchema.parse(input)
}

// Message intent only: owner checks current eligibility; never derive execution from trace names.
export const selectedMcpConnectionIdsSchema = z
  .array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u))
  .max(16)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Connection IDs must be unique" })
    }
    if (JSON.stringify(ids).length > 4096) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Connection selection exceeds its JSON byte budget" })
    }
  })

export const messageCreateParamsSchema = z
  .object({
    idempotency_key: z.string().min(1),
    content: z.string().min(1),
    model: z.string().min(1).optional(),
    agent: z.string().min(1).optional(),
    thinking: z.boolean().optional(),
    selected_skill_source_refs: selectedSkillSourceRefsSchema.optional(),
    selected_mcp_connection_ids: selectedMcpConnectionIdsSchema.optional(),
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
