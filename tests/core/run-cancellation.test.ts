import { describe, expect, it } from "vitest"
import { chatMessageReadSchema, messageRecordSchema, parseSessionSnapshot, parseSharedSessionSnapshot } from "@/contract/chat"
import { stateFromSnapshot } from "@/core/hydration"
import { buildThreadItems } from "@/core/projections"
import { applyChatProjectionEvents, markRunCancelled } from "@/core/reducer"
import { createSessionStreamState } from "@/core/state"
import { AGENT_FAILURE_PROFILES, makeEvent, makeSnapshot } from "./fixtures"

const row = { message_id: "m", role: "assistant", run_id: "r", content: "", status: "failed", created_at: "now" }
describe("authoritative cancellation", () => {
  it.each(["", "preserved prefix"])("hydrates explicit cancellation without inventing body completeness: %j", (content) => {
    const state = stateFromSnapshot(parseSessionSnapshot({ ...makeSnapshot(), messages: [{ ...row, content, terminal_status: "cancelled" }] }))
    expect(state.runStatus).toBe("cancelled")
    expect(buildThreadItems(state)).toContainEqual(expect.objectContaining({ runId: "r", cancelled: true }))
    expect(state.runFailuresById).toEqual({})
    expect(state.messages[0]).toMatchObject({ content })
    expect(state.messages[0]?.textState).not.toBe("completed")
  })
  it("keeps an ordered cancelled body unread rather than fabricating complete parts", () => {
    const state = stateFromSnapshot(parseSessionSnapshot({ ...makeSnapshot(), messages: [{ ...row, content: null, terminal_status: "cancelled", rendering: { mode: "ordered", format_version: 1, revision: "1", event_watermark: null, parts_cursor: "cursor" } }] }))
    expect(state.messageParts?.m?.status).toBe("unread")
    expect(state.runFailuresById).toEqual({})
  })
  it("indexes live cancelled by exact run, retaining text and not cancelling its successor", () => {
    const state = applyChatProjectionEvents(createSessionStreamState(), [
      makeEvent("message.delta", { segment_id: "a", delta: "prefix" }, { run_id: "r" }),
      makeEvent("run.created", { run_id: "next" }, { run_id: "next" }),
      makeEvent("run.completed", { status: "cancelled" }, { run_id: "r" }),
    ])
    expect(state.activeRunId).toBe("next")
    expect(state.messages[0]?.content).toBe("prefix")
    expect(buildThreadItems(state).find((turn) => turn.kind === "assistant-turn" && turn.runId === "r")).toMatchObject({ cancelled: true })
    expect(buildThreadItems(state).find((turn) => turn.kind === "assistant-turn" && turn.runId === "next")).not.toHaveProperty("cancelled")
  })
  it("renders a live cancellation before first token, while local abandonment is not owner evidence", () => {
    const initial = createSessionStreamState()
    expect(buildThreadItems(markRunCancelled(initial, "r"))).toEqual([])
    const state = applyChatProjectionEvents(initial, [makeEvent("run.completed", { status: "cancelled" }, { run_id: "r" })])
    expect(buildThreadItems(state)).toContainEqual(expect.objectContaining({ runId: "r", cancelled: true }))
  })
  it("keeps failed/no-profile generic and rejects the private marker on public messages", () => {
    const state = stateFromSnapshot(parseSessionSnapshot({ ...makeSnapshot(), messages: [row] }))
    expect(state.runFailuresById.r?.kind).toBe("generic")
    expect(messageRecordSchema.safeParse({ ...row, terminal_status: "cancelled" }).success).toBe(false)
    expect(() => parseSharedSessionSnapshot({ ...makeSnapshot(), messages: [{ ...row, terminal_status: "cancelled" }], execution_process: null })).toThrow()
    for (const patch of [{ role: "user" }, { run_id: " " }, { status: "completed" }, { terminal_status: null }, { terminal_status: "completed" }, { failure: AGENT_FAILURE_PROFILES[0] }]) {
      expect(chatMessageReadSchema.safeParse({ ...row, terminal_status: "cancelled", ...patch }).success).toBe(false)
    }
  })
})

it("does not let a previous cancellation hide a later explicit failure for the same run", () => {
  const state = applyChatProjectionEvents(createSessionStreamState(), [
    makeEvent("run.completed", { status: "cancelled" }, { run_id: "r" }),
    makeEvent("run.failed", { profile: AGENT_FAILURE_PROFILES[0]! }, { run_id: "r" }),
  ])
  expect(buildThreadItems(state).find((turn) => turn.kind === "assistant-turn" && turn.runId === "r")).not.toHaveProperty("cancelled")
  expect(state.runFailuresById.r?.kind).toBe("agent")
})
