import { expect, it } from "vitest"
import { applyChatProjectionEvents } from "@/core/reducer"
import { stateFromSnapshot } from "@/core/hydration"
import { createSessionStreamState } from "@/core/state"
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
