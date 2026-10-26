import { describe, expect, it } from "vitest"
import { stateFromSnapshot } from "@/core/hydration"
import { mergeMessageParts, preserveMessageParts, applyChatProjectionEvents } from "@/core/reducer"
import { buildThreadItems, groupSegments } from "@/core/projections"
import { parseSessionSnapshot, type MessagePart, type MessageTextPartSlice } from "@/contract/chat"
import { makeEvent, makeSnapshot } from "./fixtures"
const snapshot = () => parseSessionSnapshot({ ...makeSnapshot(), messages: [{ message_id: "owner", run_id: "r", role: "assistant", status: "streaming", created_at: "now", content: null, rendering: { mode: "ordered", format_version: 1, revision: "9007199254740993", event_watermark: null, parts_cursor: "opaque-initial" } }] })
const text = (id: string, content: string, first: string, latest = first): MessageTextPartSlice => ({ kind: "text", part_id: `opaque-${id}`, segment_id: id, text: content, first_sequence: first, latest_sequence: latest, offset: "0", end: String(Array.from(content).length), total_scalars: String(Array.from(content).length), completed: false })
const activity: MessagePart = { kind: "activity", part_id: "not-an-activity-codec", first_sequence: "9007199254740992", latest_sequence: "9007199254740993", activity: { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "completed", display_code: "tool.execution" } }
describe("owner message ordered projection", () => {
  it("does not mistake a nullable descriptor for inline empty success", () => {
    const state = stateFromSnapshot(snapshot())
    expect(state.messageParts?.owner?.status).toBe("unread")
    expect(state.stepsByRun.r).toBeUndefined()
    expect(buildThreadItems(state)[0]).toMatchObject({ kind: "assistant-turn", steps: [] })
  })
  it("uses ledger positions, stable segment identity, and a cursor-independent newer live suffix", () => {
    const initial = stateFromSnapshot(snapshot())
    const live = makeEvent("message.delta", { segment_id: "a", delta: "!" }, { run_id: "r", seq: 2, publicSequence: "9007199254740994" })
    const current = applyChatProjectionEvents(initial, [live])
    const state = mergeMessageParts(current, { message_id: "owner", run_id: "r", revision: "9007199254740993", items: [text("a", "before", "9007199254740991"), activity, text("b", "after", "9007199254740993")] }, [live], true)
    expect(state.messages.filter((item) => !item.orderedContainer).map((item) => [item.id, item.content])).toEqual([["a", "before!"], ["b", "after"]])
    expect(state.resumeCursor).toBe(current.resumeCursor)
    expect(groupSegments(state.stepsByRun.r ?? []).map((segment) => segment.activities.length ? "process" : segment.segmentId)).toEqual(["a", "process", "b"])
    expect(state.messageParts?.owner?.status).toBe("complete")
    expect(mergeMessageParts(state, { message_id: "owner", run_id: "r", revision: "9007199254740992", items: [] }, [], true)).toBe(state)
  })
  it("keeps process-only and first-text turn identity stable", () => {
    const initial = stateFromSnapshot(snapshot())
    const before = buildThreadItems(initial)[0]
    const after = buildThreadItems(mergeMessageParts(initial, { message_id: "owner", run_id: "r", revision: "9007199254740993", items: [text("a", "visible", "1")] }, [], true))[0]
    expect(before?.kind === "assistant-turn" && before.anchorId).toBe(after?.kind === "assistant-turn" && after.anchorId)
  })
})

it("does not let a huge legacy Agent seq override or order an already confirmed public slot", () => {
  const restored = mergeMessageParts(stateFromSnapshot(snapshot()), { message_id: "owner", run_id: "r", revision: "9007199254740993", items: [text("a", "confirmed", "1")] }, [], true)
  const noCoordinate = makeEvent("message.delta", { segment_id: "a", delta: "wrong" }, { run_id: "r", seq: Number.MAX_SAFE_INTEGER })
  const duplicateBaseline = makeEvent("message.delta", { segment_id: "a", delta: "duplicate" }, { run_id: "r", seq: 1, publicSequence: "9007199254740993" })
  const after = applyChatProjectionEvents(restored, [noCoordinate, duplicateBaseline])
  expect(after.messages.filter((item) => !item.orderedContainer).map((item) => item.content)).toEqual(["confirmed"])
  expect(after.stepsByRun.r?.map((step) => step.seq)).toEqual(["1"])
})

it("does not confuse an owner Message marker with an equal public segment ID", () => {
  const restored = mergeMessageParts(stateFromSnapshot(snapshot()), { message_id: "owner", run_id: "r", revision: "9007199254740993", items: [text("owner", "body", "1")] }, [], true)
  const after = applyChatProjectionEvents(restored, [makeEvent("message.delta", { segment_id: "owner", delta: "!" }, { run_id: "r", seq: 1, publicSequence: "9007199254740994" })])
  expect(after.messages.find((message) => message.orderedContainer)?.content).toBe("")
  expect(after.messages.find((message) => !message.orderedContainer)?.content).toBe("body!")
  const item = buildThreadItems(after)[0]
  expect(item?.kind === "assistant-turn" && item.messagesById.owner?.content).toBe("body!")
})

it("never replays a live suffix twice while a large text slot remains partial", () => {
  const initial = stateFromSnapshot(parseSessionSnapshot({ ...snapshot(), messages: [{ ...snapshot().messages![0], rendering: { mode: "ordered", format_version: 1, revision: "10", event_watermark: null, parts_cursor: "c" } }] }))
  const part = (body: string): MessagePart => ({ ...text("a", body, "1", "10"), kind: "text", end: String(body.length), total_scalars: "12288", completed: true })
  let state = mergeMessageParts(initial, { message_id: "owner", run_id: "r", revision: "10", items: [part("x".repeat(4096))] }, [], false)
  const live = makeEvent("message.delta", { segment_id: "a", delta: "!" }, { run_id: "r", seq: 1, publicSequence: "11" })
  state = applyChatProjectionEvents(state, [live])
  state = mergeMessageParts(state, { message_id: "owner", run_id: "r", revision: "10", items: [part("x".repeat(8192))] }, [live], false)
  expect(state.messages.find((message) => message.id === "a")?.content).toBe("!")
  expect(state.messages.find((message) => message.id === "a")?.content.endsWith("!!")).toBe(false)
})

it("keeps the confirmed minimum when a lagging snapshot arrives while parts led the SSE cursor", () => {
  const initial = stateFromSnapshot(snapshot())
  const leading = mergeMessageParts(initial, { message_id: "owner", run_id: "r", revision: "9007199254740999", items: [text("a", "new confirmed body", "1")] }, [], true)
  const lagging = preserveMessageParts(leading, stateFromSnapshot(snapshot()))
  expect(lagging.resumeCursor).toBe(initial.resumeCursor)
  expect(lagging.messageParts?.owner).toMatchObject({ revision: "9007199254740999", confirmedRevision: "9007199254740999", partIds: ["opaque-a"] })
  const attempted = mergeMessageParts(lagging, { message_id: "owner", run_id: "r", revision: "9007199254740993", items: [text("a", "stale body", "1")] }, [], true)
  expect(attempted).toBe(lagging)
  expect(attempted.messages.some((message) => message.content === "new confirmed body")).toBe(true)
})

it("does not suppress an unread B slot while a leading R20 A text is only partial", () => {
  const initial = stateFromSnapshot(parseSessionSnapshot({ ...snapshot(), messages: [{ ...snapshot().messages![0], rendering: { mode: "ordered", format_version: 1, revision: "10", event_watermark: null, parts_cursor: "c" } }] }))
  let state = mergeMessageParts(initial, { message_id: "owner", run_id: "r", revision: "20", items: [{ ...text("a", "prefix", "11", "18"), end: "6", total_scalars: "10000" }] }, [], false)
  expect(state.messageParts?.owner?.confirmedRevision).toBeUndefined()
  state = applyChatProjectionEvents(state, [makeEvent("message.delta", { segment_id: "b", delta: "visible unread B" }, { run_id: "r", seq: 2, publicSequence: "16" })])
  expect(state.messages.some((message) => message.id === "b" && message.content === "visible unread B")).toBe(true)
  expect(state.messageParts?.owner?.status).toBe("partial")
  // A fully obtained slot can suppress its own duplicate frames without
  // suppressing other slots that have not yet been read.
  state = mergeMessageParts(state, { message_id: "owner", run_id: "r", revision: "20", items: [text("a", "complete A", "11", "18")] }, [], false)
  state = applyChatProjectionEvents(state, [makeEvent("message.delta", { segment_id: "a", delta: "duplicate", }, { run_id: "r", seq: 3, publicSequence: "18" })])
  expect(state.messages.find((message) => message.id === "a")?.content).toBe("complete A")
  expect(state.messages.find((message) => message.id === "b")?.content).toBe("visible unread B")
})


it("keeps the original user exactly once when real user and assistant rows share the owner run", () => {
  const ownerSnapshot = () => parseSessionSnapshot({ ...snapshot(), messages: [
    { message_id: "same-run-user", run_id: "r", role: "user", content: "same-run user prompt", status: "completed", created_at: "now" },
    ...snapshot().messages!,
  ] })
  let state = stateFromSnapshot(ownerSnapshot())
  const originalUser = state.messages.find((message) => message.role === "user")
  const oneUser = () => {
    expect(state.messages.filter((message) => message.role === "user")).toEqual([originalUser])
    expect(state.messages.filter((message) => message.id === "same-run-user")).toHaveLength(1)
  }
  oneUser()
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const revision = String(BigInt("9007199254740993") + BigInt(cycle))
    const read = { message_id: "owner", run_id: "r", revision, items: [text("a", "authoritative assistant body", "1", revision)] }
    state = mergeMessageParts(state, read, [], false); oneUser()
    state = mergeMessageParts(state, read, [], true); oneUser()
    state = preserveMessageParts(state, stateFromSnapshot(ownerSnapshot())); oneUser()
    expect(state.messages.some((message) => message.role === "assistant" && message.content === "authoritative assistant body")).toBe(true)
  }
})

for (const display_code of ["tool.execution", "tool.file.read", "tool.mcp.discover", "tool.mcp.describe", "tool.mcp.call", "tool.web.search", "tool.web.fetch"] as const) {
  it(`Public28 ${display_code} stays in its owner slot without disturbing surrounding text`, () => {
    if (activity.kind !== "activity" || activity.activity.activity !== "tool") throw new Error("tool fixture")
    const safe = { ...activity, activity: { ...activity.activity, display_code } }
    const state = mergeMessageParts(stateFromSnapshot(snapshot()), { message_id: "owner", run_id: "r", revision: "9007199254740993", items: [text("a", "before", "9007199254740991"), safe, text("b", "after", "9007199254740993")] }, [], true)
    const groups = groupSegments(state.stepsByRun.r ?? [])
    expect(groups.map((segment) => segment.activities.length ? "process" : segment.segmentId)).toEqual(["a", "process", "b"])
    expect(groups.flatMap((segment) => segment.activities)).toEqual([safe.activity])
    expect(state.messages.filter((item) => !item.orderedContainer).map((item) => item.content)).toEqual(["before", "after"])
    expect(mergeMessageParts(state, { message_id: "owner", run_id: "r", revision: "9007199254740992", items: [] }, [], true)).toBe(state)
  })
}
