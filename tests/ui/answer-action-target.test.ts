import { describe, expect, it } from "vitest"
import { createSessionStreamState } from "@/core/state"
import { answerActionTarget, sameAnswerActionTarget } from "@/ui/thread/answer-action-target"
const context = { actorId: "actor", sessionId: "session", scope: { kind: "project" as const, projectRef: "project" }, runId: "run" }
describe("durable answer action ownership", () => {
  it("never treats an LLM segment_id as the BFF assistant Message identity", () => {
    const thread = { ...createSessionStreamState(), messages: [{ id: "llm-segment", role: "assistant" as const, runId: "run", content: "text" }] }
    expect(answerActionTarget(thread, context)).toBeNull()
    thread.messageParts = { durable: { messageId: "durable", runId: "run", revision: "0", status: "unread" } }
    expect(answerActionTarget(thread, context)).toMatchObject({ messageId: "durable", runId: "run" })
  })
  it("uses snapshot/ordered ownership and refuses conflicting or wrong-run identities", () => {
    const thread = { ...createSessionStreamState(), messages: [{ id: "segment", snapshotMessageId: "durable", role: "assistant" as const, runId: "run", content: "" }] }
    expect(answerActionTarget(thread, context)?.messageId).toBe("durable")
    thread.messageParts = { other: { messageId: "other", runId: "run", revision: "1", status: "complete" } }
    expect(answerActionTarget(thread, context)).toBeNull()
    expect(answerActionTarget(thread, { ...context, runId: "different" })).toBeNull()
  })
  it("captures actor/session/project/run/message independently and rejects every late identity mismatch", () => {
    const thread = { ...createSessionStreamState(), messageParts: { durable: { messageId: "durable", runId: "run", revision: "1", status: "complete" as const } } }
    const target = answerActionTarget(thread, context)!
    expect(sameAnswerActionTarget(target, { ...target })).toBe(true)
    for (const patch of [{ actorId: "other" }, { sessionId: "other" }, { runId: "other" }, { messageId: "other" }, { scope: { kind: "project" as const, projectRef: "other" } }, { scope: { kind: "direct" as const } }]) {
      expect(sameAnswerActionTarget(target, { ...target, ...patch })).toBe(false)
    }
    context.scope.projectRef = "new-project"
    expect(target.scope).toEqual({ kind: "project", projectRef: "project" })
    context.scope.projectRef = "project"
  })
})
