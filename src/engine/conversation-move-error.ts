import type { MoveSessionErrorResponse } from "@/contract/conversation-move"

type OwnerCode = MoveSessionErrorResponse["error"]["code"]

export type ConversationMoveErrorDetails =
  | Readonly<{
      kind: "owner"
      status: number
      code: OwnerCode
      retryable: boolean
      requestId: string
      retryAfter: string | null
    }>
  | Readonly<{ kind: "network" | "parse" | "adapter" | "unsupported" }>

export class ConversationMoveError extends Error {
  readonly details: ConversationMoveErrorDetails

  constructor(details: ConversationMoveErrorDetails) {
    const message = details.kind === "owner"
      ? `Conversation move rejected: ${details.code}`
      : `Conversation move failed: ${details.kind}`
    super(message)
    this.name = "ConversationMoveError"
    this.details = details
  }
}
