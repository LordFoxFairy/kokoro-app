import { expect, it } from "vitest"
import { applyChatProjectionEvents, appendUserMessage, markRunCancelled, mergeMessageParts, preserveMessageParts } from "@/core/reducer"
import { stateFromSnapshot } from "@/core/hydration"
import { createSessionStreamState, type SessionStreamState } from "@/core/state"
import { buildThreadItems } from "@/core/projections"
import { makeEvent, makeSnapshot, AGENT_FAILURE_PROFILES } from "./fixtures"
it("indexes only exact owner run terminal evidence, not text completion", () => {
  const text = applyChatProjectionEvents(createSessionStreamState(), [makeEvent("message.completed", { segment_id: "text", content: "done text" }, { run_id: "r" })])
  expect(text.runTerminalsById).toEqual({})
  const state = applyChatProjectionEvents(text, [
    makeEvent("run.completed", { status: "completed" }, { run_id: "r" }),
    makeEvent("run.completed", { status: "cancelled" }, { run_id: "cancel" }),
    makeEvent("run.failed", { profile: AGENT_FAILURE_PROFILES[0]! }, { run_id: "failed" }),
  ])
  expect(state.runTerminalsById).toEqual({ r: "completed", cancel: "cancelled", failed: "failed" })
  expect(state.runFailuresById.failed?.kind).toBe("agent")
  expect(state).not.toHaveProperty("cancelledRuns")
})
it("hydrates exact completed/failed/cancelled snapshot facts while active or pending assistant is not terminal", () => {
  const created_at = "now"
  const state = stateFromSnapshot(makeSnapshot({ messages: [
    { message_id: "a", role: "assistant", run_id: "a", content: "", status: "completed", created_at },
    { message_id: "b", role: "assistant", run_id: "b", content: "", status: "failed", terminal_status: "cancelled", created_at },
    { message_id: "c", role: "assistant", run_id: "c", content: "", status: "failed", created_at },
    { message_id: "d", role: "assistant", run_id: "d", content: "", status: "pending", created_at },
  ] }))
  expect(state.runTerminalsById).toEqual({ a: "completed", b: "cancelled", c: "failed" })
  expect(state.runFailuresById.c?.kind).toBe("generic")
  expect(state.runFailuresById.b).toBeUndefined()
})

function oldRam(cancelledRuns?: Record<string, unknown>): SessionStreamState {
  const old = createSessionStreamState()
  Reflect.deleteProperty(old, "runTerminalsById")
  if (cancelledRuns !== undefined) Reflect.set(old, "cancelledRuns", cancelledRuns)
  old.messages.push({ id: "old-text", role: "assistant", content: "kept output", runId: "text-only", textState: "completed" })
  return old
}
it("renders pre-HMR RAM without deriving a successful Run from completed text", () => {
  const old = oldRam({ cancelled: true, invalid: "true" })
  const turns = buildThreadItems(old)
  expect(turns).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "assistant-turn", runId: "cancelled", cancelled: true }),
    expect.objectContaining({ kind: "assistant-turn", runId: "text-only", messagesById: expect.objectContaining({ "old-text": expect.objectContaining({ content: "kept output" }) }) }),
  ]))
  expect(turns.some((turn) => turn.kind === "assistant-turn" && turn.runId === "invalid")).toBe(false)
  expect(buildThreadItems(oldRam())).toHaveLength(1)
  expect(old).not.toHaveProperty("runTerminalsById")
})
it("canonicalizes legacy RAM once on a real write without losing identity or existing user content", () => {
  const old = oldRam({ cancelled: true })
  const normalized = applyChatProjectionEvents(old, [])
  expect(normalized.runTerminalsById).toEqual({ cancelled: "cancelled" })
  expect(normalized).not.toHaveProperty("cancelledRuns")
  expect(normalized.messages).toBe(old.messages)
  expect(normalized.meta).toBe(old.meta)
  expect(normalized.seenEventIds).toBe(old.seenEventIds)
  expect(normalized.todos).toBe(old.todos)
  expect(applyChatProjectionEvents(normalized, [])).toBe(normalized)
  expect(old).toHaveProperty("cancelledRuns", { cancelled: true })
  const written = appendUserMessage(old, { id: "draft-echo", content: "new draft text" })
  expect(written.messages.at(-1)?.content).toBe("new draft text")
  expect(written.runTerminalsById).toEqual({ cancelled: "cancelled" })
  expect(written).not.toHaveProperty("cancelledRuns")
  const owner = applyChatProjectionEvents(normalized, [makeEvent("run.completed", { status: "completed" }, { run_id: "owner" })])
  expect(owner.runTerminalsById).toEqual({ cancelled: "cancelled", owner: "completed" })
  expect(owner.runTerminalsById["text-only"]).toBeUndefined()
  expect(markRunCancelled(old, "not-present")).not.toHaveProperty("cancelledRuns")
  expect(mergeMessageParts(old, { message_id: "absent", run_id: "absent", revision: "1", items: [] }, [], false)).not.toHaveProperty("cancelledRuns")
  const fresh = createSessionStreamState()
  expect(preserveMessageParts(old, fresh)).toBe(fresh)
  expect(preserveMessageParts(fresh, old)).not.toHaveProperty("cancelledRuns")
})
