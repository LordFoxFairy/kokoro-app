import { afterEach, describe, expect, it } from "vitest"
import { addConversation, type ConversationStore } from "@/core/conversations"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { SessionClientError } from "@/engine/client-error"
import { parseSessionSnapshot, type MessagePartsPage } from "@/contract/chat"
import { createFakeClient, createMemoryStorage, settle } from "./fakes"
import { makeEvent, makeSnapshot } from "../core/fixtures"
let engine: SessionEngine | undefined
afterEach(() => engine?.dispose())
const W = "agui_00000000000000000000000000000001"
function orderedSnapshot() {
  return parseSessionSnapshot({ ...makeSnapshot({ eventWatermark: W }), execution_head: { run_id: "r", state: "active", pending_pauses: [] }, messages: [{ message_id: "m", role: "assistant", run_id: "r", content: null, status: "streaming", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "10", event_watermark: W, parts_cursor: "initial" } }] })
}
function result(text = "baseline", revision = "10"): MessagePartsPage {
  return { session_id: "s", message_id: "m", run_id: "r", format_version: 1, revision, event_watermark: W, next_cursor: null, items: [{ kind: "text", part_id: "opaque", segment_id: "segment", first_sequence: "2", latest_sequence: revision, text, offset: "0", end: String(Array.from(text).length), total_scalars: String(Array.from(text).length), completed: true }] }
}
function setup() {
  const client = createFakeClient()
  client.nextSnapshot = async () => orderedSnapshot()
  const storage = createMemoryStorage<ConversationStore>(addConversation(null, "s", 1))
  return { client, start: () => { engine = createSessionEngine({ client, storage, scope: { kind: "project", projectRef: "project" } }); return engine } }
}
describe("ordered history lifecycle", () => {
  it("starts live without waiting for history and merges the same slot's post-ledger delta", async () => {
    const { client, start } = setup(); let resolve!: (page: MessagePartsPage) => void
    client.nextParts = () => new Promise((yes) => { resolve = yes })
    const active = start(); await settle()
    expect(client.streams).toHaveLength(1)
    client.lastStream().emit([makeEvent("message.delta", { segment_id: "segment", delta: "!" }, { session_id: "s", run_id: "r", seq: 1, publicSequence: "11" })])
    await settle(); resolve(result()); await settle()
    expect(active.getSnapshot().thread.messages.filter((m) => !m.orderedContainer).map((m) => m.content)).toEqual(["baseline!"])
    expect(client.partsCalls[0]?.scope).toEqual({ kind: "project", projectRef: "project" })
    expect(client.createCalls).toHaveLength(0)
  })
  it("preserves partial content on a real409, requires a read-only explicit reload", async () => {
    const { client, start } = setup(); client.nextParts = async () => { throw new SessionClientError("http", "changed", "message_parts_changed", 409) }
    const active = start(); await settle()
    expect(active.getSnapshot().thread.messageParts?.m?.status).toBe("changed")
    await settle(); expect(client.partsCalls).toHaveLength(1)
    client.nextParts = async () => result("reloaded", "12")
    active.retryMessageParts?.("m"); await settle()
    expect(client.partsCalls).toHaveLength(2); expect(client.partsCalls[1]?.cursor).toBeUndefined()
    expect(active.getSnapshot().thread.messages.some((m) => m.content === "reloaded")).toBe(true)
    expect(client.createCalls).toHaveLength(0); expect(client.controlCalls).toHaveLength(0)
  })
  it("fetches completion correction after TEXT_END and retires late old reads", async () => {
    const { client, start } = setup(); client.nextParts = async () => result("draft")
    const active = start(); await settle()
    client.nextParts = async () => result("corrected full text", "12")
    client.lastStream().emit([makeEvent("message.delta", { segment_id: "segment", delta: "", text_boundary: "end" }, { session_id: "s", run_id: "r", seq: 1, publicSequence: "12" })]); await settle()
    expect(client.partsCalls).toHaveLength(2)
    expect(active.getSnapshot().thread.messages.some((m) => m.content === "corrected full text")).toBe(true)
    let finish!: (page: MessagePartsPage) => void
    client.nextParts = () => new Promise((yes) => { finish = yes })
    active.retryMessageParts?.("m"); active.newConversation(); finish(result("late", "13")); await settle()
    expect(active.getSnapshot().thread.messages.some((m) => m.content === "late")).toBe(false)
    expect(client.partsCalls.at(-1)?.signal.aborted).toBe(true)
  })
})

it("retains a confirmed first page when continuation changes, with no END-driven retry loop", async () => {
  const { client, start } = setup()
  client.nextParts = async (args) => { if (args.cursor === "next") throw new SessionClientError("http", "changed", "message_parts_changed", 409); return { ...result("confirmed prefix"), next_cursor: "next" } }
  const active = start(); await settle()
  expect(active.getSnapshot().thread.messages.some((message) => message.content === "confirmed prefix")).toBe(true)
  expect(active.getSnapshot().thread.messageParts?.m?.status).toBe("changed")
  client.lastStream().emit([makeEvent("message.delta", { segment_id: "segment", delta: "", text_boundary: "end" }, { session_id: "s", run_id: "r", seq: 1, publicSequence: "11" })]); await settle()
  expect(client.partsCalls).toHaveLength(2)
  expect(client.createCalls).toHaveLength(0)
})

it("cancels a running Message read and ignores its delayed completion", async () => {
  const { client, start } = setup(); let resolve!: (page: MessagePartsPage) => void
  client.nextParts = () => new Promise((yes) => { resolve = yes })
  const active = start(); await settle(); active.cancelRun(); resolve(result("late after cancel")); await settle()
  expect(client.partsCalls[0]?.signal.aborted).toBe(true)
  expect(active.getSnapshot().thread.messages.some((message) => message.content === "late after cancel")).toBe(false)
})

it("uses the same three read slots for background history and explicit reloads", async () => {
  const client = createFakeClient()
  const base = orderedSnapshot()
  client.nextSnapshot = async () => parseSessionSnapshot({ ...base, messages: Array.from({ length: 4 }, (_, index) => ({ ...base.messages![0], message_id: `m${index}`, run_id: `r${index}` })) })
  const pending = new Map<string, (page: MessagePartsPage) => void>()
  client.nextParts = (args) => new Promise((resolve) => pending.set(args.messageId, resolve))
  engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)) })
  await settle()
  expect(client.partsCalls).toHaveLength(3)
  engine.retryMessageParts?.("m0"); await settle()
  expect(client.partsCalls).toHaveLength(3)
  expect(engine.getSnapshot().thread.messageParts?.m0?.status).toBe("loading")
  pending.get("m3")?.({ ...result("first"), message_id: "m3", run_id: "r3" }); await settle()
  expect(client.partsCalls).toHaveLength(4)
  expect(client.partsCalls[3]?.messageId).toBe("m0")
  expect(client.partsCalls.filter((call) => !call.signal.aborted)).toHaveLength(3)
  engine.newConversation()
  for (const [messageId, resolve] of pending) resolve({ ...result("late queued"), message_id: messageId, run_id: messageId.replace("m", "r") })
  await settle()
  expect(engine.getSnapshot().thread.messages.some((message) => message.content === "late queued")).toBe(false)
})

it("does not duplicate a live suffix after two partial scalar pages then a real409", async () => {
  const { client, start } = setup()
  let page2!: (page: MessagePartsPage) => void
  let rejectPage3!: (error: unknown) => void
  const slice = (offset: number) => ({ ...result("x".repeat(4096)).items[0]!, kind: "text" as const, segment_id: "segment", text: "x".repeat(4096), part_id: "opaque", first_sequence: "2", latest_sequence: "10", offset: String(offset), end: String(offset + 4096), total_scalars: "12288", completed: true })
  client.nextParts = (args) => args.cursor === "page2" ? new Promise((resolve) => { page2 = resolve }) : args.cursor === "page3" ? new Promise((_, reject) => { rejectPage3 = reject }) : Promise.resolve({ ...result(), items: [slice(0)], next_cursor: "page2" })
  const active = start(); await settle()
  client.lastStream().emit([makeEvent("message.delta", { segment_id: "segment", delta: "!" }, { session_id: "s", run_id: "r", seq: 1, publicSequence: "11" })]); await settle()
  page2({ ...result(), items: [slice(4096)], next_cursor: "page3" }); await settle()
  rejectPage3(new SessionClientError("http", "changed", "message_parts_changed", 409)); await settle()
  expect(active.getSnapshot().thread.messageParts?.m?.status).toBe("changed")
  const visible = active.getSnapshot().thread.messages.find((message) => message.id === "segment")?.content
  expect(visible).toBe("!")
  expect(visible?.endsWith("!!")).toBe(false)
})

it("keeps live B visible when a fresh R20 read leads W10 but only partial A arrived before409", async () => {
  const { client, start } = setup(); client.nextParts = async () => result("old confirmed A")
  const active = start(); await settle()
  let rejectNext!: (error: unknown) => void
  client.nextParts = (args) => args.cursor === "next" ? new Promise((_, reject) => { rejectNext = reject }) : Promise.resolve({ ...result("x".repeat(4096), "20"), items: [{ ...result("x".repeat(4096), "20").items[0]!, kind: "text", part_id: "opaque", segment_id: "segment", text: "x".repeat(4096), offset: "0", end: "4096", total_scalars: "8192", first_sequence: "2", latest_sequence: "18", completed: true }], next_cursor: "next" })
  active.retryMessageParts?.("m"); await settle()
  client.lastStream().emit([makeEvent("message.delta", { segment_id: "b", delta: "visible B" }, { session_id: "s", run_id: "r", seq: 2, publicSequence: "16" })]); await settle()
  rejectNext(new SessionClientError("http", "changed", "message_parts_changed", 409)); await settle()
  expect(active.getSnapshot().thread.messages.some((message) => message.id === "b" && message.content === "visible B")).toBe(true)
  expect(active.getSnapshot().thread.messages.find((message) => message.id === "segment")?.content).toBe("old confirmed A")
  expect(active.getSnapshot().thread.messageParts?.m).toMatchObject({ status: "changed", revision: "20", confirmedRevision: "10" })
})

it("registers a normal first-send ACK and fetches owner completion correction after END", async () => {
  const client = createFakeClient()
  client.nextSnapshot = async () => null
  client.nextParts = async (args) => ({ ...result("draft corrected", "20"), session_id: args.sessionId, message_id: "run_1:assistant", run_id: "run_1" })
  engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null), createId: (prefix) => `${prefix}-first` })
  expect(engine.submit("first send")).toBe(true); await settle()
  const sessionId = client.createCalls[0]!.sessionId
  client.lastStream().emit([
    makeEvent("message.delta", { segment_id: "segment", delta: "draft" }, { session_id: sessionId, run_id: "run_1", seq: 1, publicSequence: "11" }),
    makeEvent("message.delta", { segment_id: "segment", delta: "", text_boundary: "end" }, { session_id: sessionId, run_id: "run_1", seq: 2, publicSequence: "20" }),
  ]); await settle()
  expect(client.partsCalls).toHaveLength(1)
  expect(client.partsCalls[0]).toMatchObject({ sessionId, messageId: "run_1:assistant", scope: { kind: "direct" } })
  expect(engine.getSnapshot().thread.messages.find((message) => message.id === "segment")?.content).toBe("draft corrected")
  expect(client.createCalls).toHaveLength(1)
})

it.each(["ACK-before-END", "END-before-ACK"])("registers an exact steer receipt for %s without issuing another command", async (order) => {
  const client = createFakeClient()
  client.nextSnapshot = async () => makeSnapshot({ sessionId: "s", activeRun: { run_id: "r", status: "running" } })
  let accept!: (receipt: { run_id: string; user_message_id: string; assistant_message_id: string }) => void
  client.nextCreate = () => new Promise((resolve) => { accept = resolve })
  client.nextParts = async () => ({ ...result("steer corrected", "20"), message_id: "steer-assistant", run_id: "steer-run" })
  engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)) })
  await settle(); expect(engine.submit("steer message")).toBe(true)
  const receipt = { run_id: "steer-run", user_message_id: "steer-user", assistant_message_id: "steer-assistant" }
  if (order === "ACK-before-END") { accept(receipt); await settle() }
  client.lastStream().emit([
    makeEvent("message.delta", { segment_id: "segment", delta: "draft" }, { session_id: "s", run_id: "steer-run", seq: 1, publicSequence: "11" }),
    makeEvent("message.delta", { segment_id: "segment", delta: "", text_boundary: "end" }, { session_id: "s", run_id: "steer-run", seq: 2, publicSequence: "20" }),
  ]); await settle()
  if (order === "END-before-ACK") { expect(client.partsCalls).toHaveLength(0); accept(receipt); await settle() }
  expect(client.partsCalls).toHaveLength(1)
  expect(client.partsCalls[0]?.messageId).toBe("steer-assistant")
  expect(engine.getSnapshot().thread.messages.find((message) => message.id === "segment")?.content).toBe("steer corrected")
  expect(client.createCalls).toHaveLength(1)
})

it("retires a safe-target response from the old Project engine before adopting another scope", async () => {
  const targetPage = (name: string): MessagePartsPage => ({ ...result(), items: [{ kind: "activity", part_id: "target-part", first_sequence: "2", latest_sequence: "10", activity: { activity: "tool", activity_id: `act_${"a".repeat(64)}`, segment_id: `seg_${"b".repeat(64)}`, status: "completed", display_code: "tool.file.read", display_detail: { kind: "file", name } } }] })
  const oldClient = createFakeClient()
  oldClient.nextSnapshot = async () => orderedSnapshot()
  let late!: (page: MessagePartsPage) => void
  oldClient.nextParts = () => new Promise(resolve => { late = resolve })
  const oldEngine = createSessionEngine({ client: oldClient, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)), scope: { kind: "project", projectRef: "old-project" } })
  try {
    await settle()
    oldEngine.dispose()
    const client = createFakeClient()
    client.nextSnapshot = async () => orderedSnapshot()
    const currentPage = targetPage("current-owner.md")
    const currentPart = currentPage.items[0]
    if (currentPart?.kind !== "activity") throw new Error("safe target fixture")
    client.nextParts = async () => currentPage
    engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)), scope: { kind: "project", projectRef: "new-project" } })
    await settle(); late(targetPage("retired-owner.md")); await settle()
    const activities = (engine.getSnapshot().thread.stepsByRun.r ?? []).flatMap(step => step.kind === "activity" ? [step.activity] : [])
    expect(activities).toEqual([currentPart.activity])
    expect(oldClient.partsCalls[0]?.signal.aborted).toBe(true)
    expect(oldClient.partsCalls[0]?.scope).toEqual({ kind: "project", projectRef: "old-project" })
    expect(client.partsCalls[0]?.scope).toEqual({ kind: "project", projectRef: "new-project" })
    expect(client.createCalls).toHaveLength(0)
  } finally { oldEngine.dispose() }
})

it("visible parts target keeps hidden head/SSE while wrong conversation or scope cannot read", async () => {
  const client = createFakeClient(), scope = { kind: "project" as const, projectRef: "visible-parts-project" }
  client.nextSnapshot = async () => orderedSnapshot()
  client.nextParts = async () => result("visible body")
  engine = createSessionEngine({ client, scope, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)), messagePartsReadTarget: null })
  await settle()
  expect(client.snapshotCalls).toEqual(["s"])
  expect(engine.getSnapshot().machine).toMatchObject({ phase: "streaming", runId: "r" })
  expect(client.streams).toHaveLength(1)
  expect(client.partsCalls).toHaveLength(0)
  engine.retryMessageParts?.("m")
  expect(client.partsCalls).toHaveLength(0)
  engine.setMessagePartsReadTarget?.({ scope: { kind: "project", projectRef: "other" }, conversationId: "s" })
  engine.setMessagePartsReadTarget?.({ scope, conversationId: "other" })
  await settle()
  expect(client.partsCalls).toHaveLength(0)
  engine.setMessagePartsReadTarget?.({ scope, conversationId: "s" })
  await settle()
  expect(client.partsCalls).toHaveLength(1)
  expect(client.partsCalls[0]?.cursor).toBe("initial")
  expect(client.partsCalls[0]?.scope).toEqual(scope)
  expect(engine.getSnapshot().thread.messages.some(message => message.content === "visible body")).toBe(true)
  expect(client.createCalls).toHaveLength(0)
  expect(client.controlCalls).toHaveLength(0)
  expect(client.streams[0]?.closed).toBe(false)
})

it("visible parts target aborts late continuation then resumes original cursor without losing confirmed prefix", async () => {
  const client = createFakeClient(), scope = { kind: "project" as const, projectRef: "resume-visible-parts" }
  client.nextSnapshot = async () => orderedSnapshot()
  let late!: (page: MessagePartsPage) => void, call = 0
  client.nextParts = async () => {
    call++
    if (call === 1 || call === 3) return { ...result("confirmed prefix"), next_cursor: "next" }
    if (call === 2) return new Promise(resolve => { late = resolve })
    return { ...result(), items: [] }
  }
  engine = createSessionEngine({ client, scope, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)), messagePartsReadTarget: { scope, conversationId: "s" } })
  await settle()
  expect(client.partsCalls).toHaveLength(2)
  engine.setMessagePartsReadTarget?.(null)
  expect(client.partsCalls[1]?.signal.aborted).toBe(true)
  const latePart = result("late hidden body").items[0]!
  if (latePart.kind !== "text") throw new Error("Expected text fixture")
  late({ ...result(), items: [{ ...latePart, part_id: "late", segment_id: "late", first_sequence: "3" }] })
  await settle()
  expect(engine.getSnapshot().thread.messages.some(message => message.content === "late hidden body")).toBe(false)
  expect(engine.getSnapshot().thread.messages.some(message => message.content === "confirmed prefix")).toBe(true)
  expect(client.partsCalls).toHaveLength(2)
  engine.setMessagePartsReadTarget?.({ scope, conversationId: "s" })
  await settle()
  expect(client.partsCalls.map(args => args.cursor)).toEqual(["initial", "next", "initial", "next"])
  expect(engine.getSnapshot().thread.messageParts?.m?.status).toBe("complete")
  expect(client.streams[0]?.closed).toBe(false)
  expect(client.createCalls).toHaveLength(0)
  expect(client.controlCalls).toHaveLength(0)
})

it("visible parts hidden live suffix survives a delayed fresh completion correction", async () => {
  const client = createFakeClient(), scope = { kind: "project" as const, projectRef: "hidden-live-parts" }
  client.nextSnapshot = async () => orderedSnapshot()
  client.nextParts = async () => result("baseline")
  engine = createSessionEngine({ client, scope, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)), messagePartsReadTarget: null })
  await settle()
  client.lastStream().emit([makeEvent("message.delta", { segment_id: "segment", delta: "!", text_boundary: "end" }, { session_id: "s", run_id: "r", seq: 1, publicSequence: "11" })])
  await settle()
  expect(client.partsCalls).toHaveLength(0)
  engine.setMessagePartsReadTarget?.({ scope, conversationId: "s" })
  await settle()
  expect(engine.getSnapshot().thread.messages.some(message => message.content === "baseline!")).toBe(true)
  expect(client.partsCalls).toHaveLength(1)
  expect(client.partsCalls[0]?.cursor).toBeUndefined()
  expect(client.streams[0]?.closed).toBe(false)
  expect(client.createCalls).toHaveLength(0)
})
