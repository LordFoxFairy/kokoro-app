import type { SessionStreamState } from "@/core/state"
import type { SessionScope } from "@/engine/session-scope"

export type AnswerActionTarget = Readonly<{
  actorId: string
  sessionId: string
  scope: Readonly<SessionScope>
  runId: string
  messageId: string
}>
type ActionContext = Omit<AnswerActionTarget, "messageId">

// Render segment IDs are not durable BFF Message IDs. Only the existing
// trusted receipt/ordered descriptor or snapshot Message ownership may bind.
export function answerActionTarget(
  thread: Pick<SessionStreamState, "messages" | "messageParts">,
  context: ActionContext,
): AnswerActionTarget | null {
  if (!context.actorId || !context.sessionId || !context.runId || (context.scope.kind === "project" && !context.scope.projectRef)) return null
  const candidates = new Set<string>()
  for (const message of thread.messages) {
    if (message.role === "assistant" && message.runId === context.runId && message.snapshotMessageId) candidates.add(message.snapshotMessageId)
  }
  for (const part of Object.values(thread.messageParts ?? {})) {
    if (part.runId === context.runId && part.messageId) candidates.add(part.messageId)
  }
  if (candidates.size !== 1) return null
  const messageId = candidates.values().next().value
  return messageId === undefined ? null : { ...context, scope: { ...context.scope }, messageId }
}

// Identity match is necessary, not authorization: the future I/O controller
// must also retain its captured admission/selection token and abort on retirement.
export function sameAnswerActionTarget(left: AnswerActionTarget | null, right: AnswerActionTarget | null): boolean {
  return left !== null && right !== null && left.actorId === right.actorId && left.sessionId === right.sessionId &&
    left.runId === right.runId && left.messageId === right.messageId && left.scope.kind === right.scope.kind &&
    (left.scope.kind === "direct" || (right.scope.kind === "project" && left.scope.projectRef === right.scope.projectRef))
}

// Local view only, never a wire DTO or persistent feedback fact. Non-ready
// phases must not turn a missing owner read into a fabricated null vote.
export type AnswerFeedbackView =
  | { target: AnswerActionTarget; kind: "unread" | "reading" | "writing" | "unknown" | "failed" }
  | { target: AnswerActionTarget; kind: "ready"; value: "up" | "down" | null }
