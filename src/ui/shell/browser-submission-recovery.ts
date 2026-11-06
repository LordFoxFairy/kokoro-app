import { freezeCustomApiSelection } from "@/engine/custom-api-selection"
import { z } from "zod"
import { messageCreateParamsSchema, messageCreateReceiptSchema, runControlReceiptSchema } from "@/contract/chat"
import { buildMessageCreateParams } from "@/engine/execution-adapter"
import type { PendingSubmission, SteerSubmission, SubmissionRecovery } from "@/engine/submission-recovery"
import { sessionScopeKey, type SessionScope } from "@/engine/session-scope"

export const SUBMISSION_RECOVERY_PREFIX = "kokoro.web.conversations.submission:"
const MAX_RECORD_BYTES = 1024 * 1024
const steerIntentSchema = z.object({
  kind: z.literal("steer"), sessionId: z.string().min(1), runId: z.string().min(1),
  idempotencyKey: z.string().min(1), clientMessageId: z.string().min(1), content: z.string().min(1),
}).strict()
const steerReceiptSchema = runControlReceiptSchema.extend({ message_id: z.string().min(1) })
const recordSchema = z.union([
  z.object({ version: z.literal(1), state: z.literal("pending"), optimisticUserId: z.string().min(1), request: messageCreateParamsSchema, failureCode: z.string().max(256).nullable() }).strict(),
  z.object({ version: z.literal(1), state: z.literal("acknowledged"), key: z.string().min(1), receipt: messageCreateReceiptSchema }).strict(),
  z.object({ version: z.literal(1), state: z.literal("pending"), kind: z.literal("steer"), scopeKey: z.string(), request: steerIntentSchema, failureCode: z.string().max(256).nullable() }).strict(),
  z.object({ version: z.literal(1), state: z.literal("acknowledged"), kind: z.literal("steer"), scopeKey: z.string(), sessionId: z.string().min(1), clientMessageId: z.string().min(1), key: z.string().min(1), receipt: steerReceiptSchema }).strict(),
  z.object({ version: z.literal(1), state: z.literal("abandoned"), key: z.string().min(1) }).strict(),
])
type RecordValue = z.infer<typeof recordSchema>

/** Constructed only after native admission. The marker detects retirement, not authorization. */
export function createBrowserSubmissionRecovery(args: {
  subject: string
  scope: SessionScope
  isCurrent: () => boolean
  storage: () => Storage
}): SubmissionRecovery {
  const scopeKey = sessionScopeKey(args.scope)
  const prefix = `${SUBMISSION_RECOVERY_PREFIX}${encodeURIComponent(args.subject)}:${encodeURIComponent(scopeKey)}:`
  function read(sessionId: string): RecordValue | null {
    if (!args.isCurrent()) throw new Error("submission recovery subject retired")
    const raw = args.storage().getItem(prefix + encodeURIComponent(sessionId))
    if (raw === null) return null
    if (new TextEncoder().encode(raw).byteLength > MAX_RECORD_BYTES) throw new Error("submission recovery record too large")
    const parsed = recordSchema.parse(JSON.parse(raw))
    if ("kind" in parsed) {
      if (parsed.scopeKey !== scopeKey || (parsed.state === "pending" ? parsed.request.sessionId !== sessionId :
        parsed.sessionId !== sessionId || parsed.receipt.command_id !== parsed.key)) {
        throw new Error("submission recovery scope or steer binding mismatch")
      }
    } else if (parsed.state === "pending") {
      const expectedProject = args.scope.kind === "project" ? args.scope.projectRef : undefined
      if (parsed.request.project_ref !== expectedProject || parsed.request.thinking === undefined || parsed.request.agent !== undefined) {
        throw new Error("submission recovery scope or request mismatch")
      }
    }
    return parsed
  }
  function write(sessionId: string, value: RecordValue): boolean {
    if (!args.isCurrent()) return false
    const raw = JSON.stringify(recordSchema.parse(value))
    if (new TextEncoder().encode(raw).byteLength > MAX_RECORD_BYTES) return false
    const storage = args.storage()
    const key = prefix + encodeURIComponent(sessionId)
    storage.setItem(key, raw)
    return args.isCurrent() && storage.getItem(key) === raw
  }
  function sameSteer(left: SteerSubmission, right: SteerSubmission): boolean {
    return left.sessionId === right.sessionId && left.runId === right.runId &&
      left.idempotencyKey === right.idempotencyKey && left.clientMessageId === right.clientMessageId &&
      left.content === right.content
  }
  function matches(record: RecordValue | null, submission: PendingSubmission): boolean {
    if (record?.state !== "pending") return false
    if ("kind" in record) return submission.kind === "steer" && sameSteer(record.request, submission)
    if (submission.kind === "steer") return false
    return JSON.stringify(record.request) === JSON.stringify(
      messageCreateParamsSchema.parse(buildMessageCreateParams({ ...submission, scope: args.scope })),
    ) && record.optimisticUserId === submission.optimisticUserId
  }
  return {
    read: sessionId => {
      const record = read(sessionId)
      if (record?.state !== "pending") return null
      if ("kind" in record) return { failureCode: record.failureCode, submission: Object.freeze(record.request) }
      return { failureCode: record.failureCode, submission: {
        sessionId, optimisticUserId: record.optimisticUserId,
        idempotencyKey: record.request.idempotency_key, content: record.request.content,
        options: { mode: record.request.thinking ? "thinking" : "fast", model: record.request.model ?? null,
          selectedSkillSourceRefs: record.request.selected_skill_source_refs,
          ...(record.request.selected_resource_refs === undefined ? {} : { selectedResourceRefs: record.request.selected_resource_refs }),
          selectedMcpConnectionIds: record.request.selected_mcp_connection_ids ?? [],
          ...(record.request.interrupt_run_id === undefined ? {} : { interruptRunId: record.request.interrupt_run_id }),
          ...(record.request.selected_custom_api_profiles === undefined ? {} : { selectedCustomApiProfiles: freezeCustomApiSelection(record.request.selected_custom_api_profiles.map(value => ({ profileId: value.profile_id, expectedStateVersion: String(value.expected_state_version) }))) }) },
      } }
    },
    save: submission => {
      try {
        const current = read(submission.sessionId)
        if (current?.state === "pending") return matches(current, submission)
        if (current && current.key === submission.idempotencyKey) return false
        if (submission.kind === "steer") {
          return write(submission.sessionId, { version: 1, state: "pending", kind: "steer", scopeKey, request: submission, failureCode: null })
        }
        return write(submission.sessionId, { version: 1, state: "pending", optimisticUserId: submission.optimisticUserId,
          request: messageCreateParamsSchema.parse(buildMessageCreateParams({ ...submission, scope: args.scope })), failureCode: null })
      } catch { return false }
    },
    failure: (submission, code) => {
      try {
        const current = read(submission.sessionId)
        if (current?.state === "pending" && matches(current, submission)) write(submission.sessionId, { ...current, failureCode: code.length <= 256 ? code : null })
      } catch { /* Keep the original intent; failure metadata is not an admission fact. */ }
    },
    acknowledged: submission => {
      const current = read(submission.sessionId)
      if (current?.state !== "acknowledged" || current.key !== submission.idempotencyKey) return null
      if ("kind" in current) return submission.kind === "steer" && current.receipt.run_id === submission.runId &&
        current.clientMessageId === submission.clientMessageId ? current.receipt : null
      return submission.kind !== "steer" ? current.receipt : null
    },
    acknowledge: (submission, receipt) => {
      try {
        const current = read(submission.sessionId)
        if (current?.state === "acknowledged" && current.key === submission.idempotencyKey) {
          if ("kind" in current) return submission.kind === "steer" && "message_id" in receipt &&
            current.receipt.run_id === submission.runId && current.clientMessageId === submission.clientMessageId &&
            current.receipt.message_id === receipt.message_id
          return submission.kind !== "steer" && "assistant_message_id" in receipt
        }
        if (current?.state === "abandoned" && current.key === submission.idempotencyKey) return true
        // A late ACK must never erase a different successor slot.
        if (current !== null && !matches(current, submission)) return true
        if (submission.kind === "steer") {
          if (!("message_id" in receipt) || receipt.run_id !== submission.runId || receipt.command_id !== submission.idempotencyKey) return false
          return write(submission.sessionId, { version: 1, state: "acknowledged", kind: "steer", scopeKey,
            sessionId: submission.sessionId, clientMessageId: submission.clientMessageId, key: submission.idempotencyKey, receipt })
        }
        return "assistant_message_id" in receipt &&
          write(submission.sessionId, { version: 1, state: "acknowledged", key: submission.idempotencyKey, receipt })
      } catch { return false }
    },
    abandon: submission => {
      try {
        const current = read(submission.sessionId)
        if (current?.state === "abandoned" && current.key === submission.idempotencyKey) return true
        if (current?.state === "acknowledged" && current.key === submission.idempotencyKey) return true
        if (current !== null && !matches(current, submission)) return false
        return write(submission.sessionId, { version: 1, state: "abandoned", key: submission.idempotencyKey })
      } catch { return false }
    },
  }
}
