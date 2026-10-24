import type { MessageCreateReceipt } from "@/contract/http"
import type { CreateMessageArgs } from "./execution-adapter"

/** Browser delivery intent, never a Message/Run fact or an authentication proof. */
export type PendingSubmission = CreateMessageArgs & { optimisticUserId: string }
export type RecoverableSubmission = { submission: PendingSubmission; failureCode: string | null }
export type SubmissionRecovery = {
  /** Throws on unavailable/corrupt storage; absence alone returns null. */
  read: (sessionId: string) => RecoverableSubmission | null
  /** Confirmed write before any POST. An unresolved different request cannot be replaced. */
  save: (submission: PendingSubmission) => boolean
  failure: (submission: PendingSubmission, code: string) => void
  acknowledged: (submission: PendingSubmission) => MessageCreateReceipt | null
  acknowledge: (submission: PendingSubmission, receipt: MessageCreateReceipt) => boolean
  abandon: (submission: PendingSubmission) => boolean
}
