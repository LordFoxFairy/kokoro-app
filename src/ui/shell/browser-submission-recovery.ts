import { z } from "zod"
import { messageCreateParamsSchema, messageCreateReceiptSchema } from "@/contract/chat"
import { buildMessageCreateParams } from "@/engine/execution-adapter"
import type { PendingSubmission, SubmissionRecovery } from "@/engine/submission-recovery"
import { sessionScopeKey, type SessionScope } from "@/engine/session-scope"

export const SUBMISSION_RECOVERY_PREFIX = "kokoro.web.conversations.submission:"
const MAX_RECORD_BYTES = 1024 * 1024
const recordSchema = z.discriminatedUnion("state", [
  z.object({ version: z.literal(1), state: z.literal("pending"), optimisticUserId: z.string().min(1), request: messageCreateParamsSchema, failureCode: z.string().max(256).nullable() }).strict(),
  z.object({ version: z.literal(1), state: z.literal("acknowledged"), key: z.string().min(1), receipt: messageCreateReceiptSchema }).strict(),
  z.object({ version: z.literal(1), state: z.literal("abandoned"), key: z.string().min(1) }).strict(),
])
type RecordValue = z.infer<typeof recordSchema>

/** Constructed only after Product Session admission. The marker detects retirement, not authorization. */
export function createBrowserSubmissionRecovery(args: {
  subject: string
  scope: SessionScope
  isCurrent: () => boolean
  storage: () => Storage
}): SubmissionRecovery {
  const prefix = `${SUBMISSION_RECOVERY_PREFIX}${encodeURIComponent(args.subject)}:${encodeURIComponent(sessionScopeKey(args.scope))}:`
  function read(sessionId: string): RecordValue | null {
    if (!args.isCurrent()) throw new Error("submission recovery subject retired")
    const raw = args.storage().getItem(prefix + encodeURIComponent(sessionId))
    if (raw === null) return null
    if (new TextEncoder().encode(raw).byteLength > MAX_RECORD_BYTES) throw new Error("submission recovery record too large")
    const parsed = recordSchema.parse(JSON.parse(raw))
    if (parsed.state === "pending") {
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
  function matches(record: RecordValue | null, submission: PendingSubmission): boolean {
    return record?.state === "pending" && JSON.stringify(record.request) === JSON.stringify(
      messageCreateParamsSchema.parse(buildMessageCreateParams({ ...submission, scope: args.scope })),
    ) && record.optimisticUserId === submission.optimisticUserId
  }
  return {
    read: sessionId => {
      const record = read(sessionId)
      if (record?.state !== "pending") return null
      return { failureCode: record.failureCode, submission: {
        sessionId, optimisticUserId: record.optimisticUserId,
        idempotencyKey: record.request.idempotency_key, content: record.request.content,
        options: { mode: record.request.thinking ? "thinking" : "fast", model: record.request.model ?? null,
          selectedSkillSourceRefs: record.request.selected_skill_source_refs,
          selectedMcpConnectionIds: record.request.selected_mcp_connection_ids ?? [] },
      } }
    },
    save: submission => {
      try {
        const current = read(submission.sessionId)
        if (current?.state === "pending") return matches(current, submission)
        if (current && current.key === submission.idempotencyKey) return false
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
      return current?.state === "acknowledged" && current.key === submission.idempotencyKey ? current.receipt : null
    },
    acknowledge: (submission, receipt) => {
      try {
        const current = read(submission.sessionId)
        if (current?.state === "acknowledged" && current.key === submission.idempotencyKey) return true
        if (current?.state === "abandoned" && current.key === submission.idempotencyKey) return true
        // A late ACK must never erase a different successor slot.
        if (current !== null && !matches(current, submission)) return true
        return write(submission.sessionId, { version: 1, state: "acknowledged", key: submission.idempotencyKey, receipt })
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
