export type ClientFailureReason = "network" | "http" | "parse"

export class SessionClientError extends Error {
  readonly reason: ClientFailureReason

  constructor(reason: ClientFailureReason, message: string) {
    super(message)
    this.name = "SessionClientError"
    this.reason = reason
  }
}
