import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTaskNotifications } from "@/engine/task-notification"
import { makeEvent as fixtureEvent, AGENT_FAILURE_PROFILES, makeInteractionState, makeAgentFailureEvent, makeDispatchFailureEvent, makeSnapshot, resetFixtureSeq } from "../core/fixtures"
import { makeReceipt } from "./fakes"

const makeEvent: typeof fixtureEvent = (kind, payload, overrides) => fixtureEvent(kind, payload, { session_id: "conv_1", ...overrides })
beforeEach(resetFixtureSeq)
function admitted() {
  const observer = createTaskNotifications()
  observer.select("conv_1")
  observer.anchorReceipt("conv_1", makeReceipt("run_1"))
  const listener = vi.fn()
  observer.subscribe(listener)
  return { observer, listener }
}
describe("typed task notification eligibility", () => {
  it("delivers every distinct live waiting/completed event in a single batch and deduplicates replay", () => {
    const { observer, listener } = admitted()
    const pause = makeInteractionState("item_1", ["item_1"])
    const batch = [makeEvent("interaction.state", pause), makeEvent("run.completed", { status: "completed" })]
    observer.observe(batch); observer.observe(batch)
    expect(listener.mock.calls.map(([signal]) => signal.kind)).toEqual(["awaiting", "completed"])
  })
  it.each(["cancelled", "failed", "dispatch_failed"])("never delivers completion for %s", (kind) => {
    const { observer, listener } = admitted()
    observer.observe([kind === "cancelled" ? makeEvent("run.completed", { status: "cancelled" }) : kind === "failed" ? makeAgentFailureEvent(AGENT_FAILURE_PROFILES[0], { session_id: "conv_1" }) : makeDispatchFailureEvent("1", { session_id: "conv_1" })])
    observer.observe([makeEvent("run.completed", { status: "completed" })])
    expect(listener).not.toHaveBeenCalled()
  })
  it("does not grant eligibility to historical run.created or chase a receipt after terminal", () => {
    const observer = createTaskNotifications(); observer.select("conv_1")
    const listener = vi.fn(); observer.subscribe(listener)
    observer.observe([makeEvent("run.created", { run_id: "run_1" }), makeEvent("run.completed", { status: "completed" })])
    observer.anchorReceipt("conv_1", makeReceipt("run_1"))
    observer.observe([makeEvent("run.completed", { status: "completed" })])
    expect(listener).not.toHaveBeenCalled()
  })
  it("requires matching owner snapshot, baselines existing pauses without history delivery", () => {
    const observer = createTaskNotifications(); observer.select("conv_1")
    const listener = vi.fn(); observer.subscribe(listener)
    const pause = makeInteractionState("item_1", ["item_1"])
    const snapshot = { ...makeSnapshot({ eventWatermark: "agui_00000000000000000000000000000001" }), execution_head: { run_id: "run_1", state: "waiting" as const, pending_pauses: [pause] } }
    observer.anchorSnapshot("conv_1", { ...snapshot, session: { ...snapshot.session, session_id: "wrong-owner-session" } })
    observer.observe([makeEvent("interaction.state", pause)])
    expect(listener).not.toHaveBeenCalled()
    observer.anchorSnapshot("conv_1", snapshot)
    observer.observe([makeEvent("interaction.state", pause), makeEvent("interaction.state", { ...pause, interaction_revision: pause.interaction_revision + 1 })])
    expect(listener).not.toHaveBeenCalled()
    observer.observe([makeEvent("interaction.state", { ...pause, pause_ref: "new_pause", pause_revision: pause.pause_revision + 1, interaction_revision: pause.interaction_revision + 2 }), makeEvent("run.completed", { status: "completed" })])
    expect(listener.mock.calls.map(([signal]) => signal.kind)).toEqual(["awaiting", "completed"])
  })
  it("rejects wrong session and terminal snapshots, and emits nothing at EOF without an owner terminal", () => {
    const { observer, listener } = admitted()
    observer.observe([makeEvent("run.completed", { status: "completed" }, { session_id: "other" })])
    observer.observe([])
    expect(listener).not.toHaveBeenCalled()
    observer.select("other")
    observer.anchorSnapshot("other", makeSnapshot())
    observer.observe([makeEvent("run.completed", { status: "completed" }, { session_id: "other" })])
    expect(listener).not.toHaveBeenCalled()
  })
  it("retires old session receipts/subscriptions and contains observer exceptions", () => {
    const { observer, listener } = admitted()
    observer.subscribe(() => { throw new Error("UI observer") })
    const peer = vi.fn(); observer.subscribe(peer)
    observer.observe([makeEvent("run.completed", { status: "completed" })])
    expect(peer).toHaveBeenCalledTimes(1)
    observer.select("other"); observer.anchorReceipt("conv_1", makeReceipt("run_2"))
    observer.observe([makeEvent("run.completed", { status: "completed" }, { session_id: "other", run_id: "run_2" })])
    observer.dispose(); observer.select("conv_1"); observer.anchorReceipt("conv_1", makeReceipt("run_3"))
    observer.observe([makeEvent("run.completed", { status: "completed" }, { run_id: "run_3" })])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

it("accepts a validated active owner head with null initial watermark without emitting snapshot history", () => {
  const observer = createTaskNotifications(); observer.select("conv_1")
  const listener = vi.fn(); observer.subscribe(listener)
  observer.anchorSnapshot("conv_1", makeSnapshot({ activeRun: { run_id: "run_1", status: "queued" }, eventWatermark: null }))
  expect(listener).not.toHaveBeenCalled()
  observer.observe([makeEvent("run.completed", { status: "completed" })])
  expect(listener).toHaveBeenCalledWith({ kind: "completed", sessionId: "conv_1", runId: "run_1" })
})

it("retires an old receipt anchor at a terminal snapshot and cannot notify its history after GC", () => {
  const { observer, listener } = admitted()
  observer.anchorSnapshot("conv_1", makeSnapshot({ eventWatermark: null, messages: [{ message_id: "assistant_1", role: "assistant", content: "done", status: "completed", created_at: "2026-07-02T00:00:00Z", run_id: "run_1" }] }))
  observer.observe([makeEvent("run.created", { run_id: "run_1" }), makeEvent("run.completed", { status: "completed" })])
  observer.anchorReceipt("conv_1", makeReceipt("run_1"))
  observer.observe([makeEvent("run.completed", { status: "completed" })])
  expect(listener).not.toHaveBeenCalled()
  observer.anchorReceipt("conv_1", makeReceipt("run_2"))
  observer.observe([makeEvent("run.completed", { status: "completed" }, { run_id: "run_2" })])
  expect(listener).toHaveBeenCalledTimes(1)
})
