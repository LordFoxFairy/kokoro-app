export type ClientFailureReason = "network" | "http" | "parse"

export class SessionClientError extends Error {
  readonly reason: ClientFailureReason
  readonly code: string | null

  constructor(reason: ClientFailureReason, message: string, code: string | null = null) {
    super(message)
    this.name = "SessionClientError"
    this.reason = reason
    this.code = code
  }
}
