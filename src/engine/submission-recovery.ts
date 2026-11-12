import type { MessageCreateReceipt, RunControlReceipt } from "@/contract/http"
import type { CreateMessageArgs } from "./execution-adapter"

/** Browser delivery intent, never a Message/Run fact or an authentication proof. */
export type CreateSubmission = CreateMessageArgs & { kind?: never; optimisticUserId: string }
export type SteerSubmission = Readonly<{
  kind: "steer"
  sessionId: string
  runId: string
  idempotencyKey: string
  clientMessageId: string
  content: string
}>
export type PendingSubmission = CreateSubmission | SteerSubmission
export type SteerReceipt = RunControlReceipt & { message_id: string }
export type SubmissionReceipt = MessageCreateReceipt | SteerReceipt
export type RecoverableSubmission = { submission: PendingSubmission; failureCode: string | null }
export type SubmissionRecovery = {
  /** Throws on unavailable/corrupt storage; absence alone returns null. */
  read: (sessionId: string) => RecoverableSubmission | null
  /** Confirmed write before any POST. An unresolved different request cannot be replaced. */
  save: (submission: PendingSubmission) => boolean
  failure: (submission: PendingSubmission, code: string) => void
  acknowledged: (submission: PendingSubmission) => SubmissionReceipt | null
  acknowledge: (submission: PendingSubmission, receipt: SubmissionReceipt) => boolean
  abandon: (submission: PendingSubmission) => boolean
}
