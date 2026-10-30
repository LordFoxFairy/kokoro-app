import { afterEach, expect, it } from "vitest"
import { createSessionEngine } from "@/engine/machine"
import type { EngineDeps, SessionEngine } from "@/engine/engine-types"
import { addConversation } from "@/core/conversations"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "./fakes"
import { makeEvent, makeSnapshot } from "../core/fixtures"
const engines: SessionEngine[] = []
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose() })
const source = { message_id: "answer", role: "assistant" as const, run_id: "old", content: "original answer", status: "completed" as const, created_at: "now" }
const human = { message_id: "human", role: "user" as const, content: "original question", status: "completed" as const, created_at: "now" }
const ack = { run_id: "regenerated", user_message_id: "human", assistant_message_id: "new-answer", regenerated_from_message_id: "answer" }
async function setup() {
  const client = createFakeClient()
  client.nextSnapshot = async () => makeSnapshot({ messages: [human, source] })
  let resolve!: (value: typeof ack) => void
  const calls: unknown[][] = []
  const answerActions = { regenerate: (...args: unknown[]) => { calls.push(args); return new Promise<typeof ack>(r => { resolve = r }) } }
  const engine = createSessionEngine({ client, storage: createMemoryStorage(addConversation(null, "conv_1", 1)), answerActions } as EngineDeps)
  engines.push(engine)
  await settle()
  return { client, engine, calls, resolve: () => resolve(ack) }
}
const intent = () => ({ sourceMessageId: "answer", sourceRunId: "old", key: "same-key", signal: new AbortController().signal })
it("admits a real regenerated assistant without echoing or renaming the original human", async () => {
  const { engine, client, calls, resolve } = await setup()
  expect(typeof engine.regenerateAnswer).toBe("function")
  const pending = engine.regenerateAnswer!(intent())
  resolve(); expect(await pending).toEqual(ack)
  const current = engine.getSnapshot()
  expect(current.machine).toMatchObject({ phase: "queued", runId: "regenerated" })
  expect(current.thread.messageParts?.["new-answer"]?.runId).toBe("regenerated")
  expect(current.thread.messages.filter(m => m.role === "user")).toEqual([expect.objectContaining({ id: "human", content: "original question" })])
  expect(client.createCalls).toHaveLength(0)
  expect(calls).toHaveLength(1)
})
it("late regeneration ACK preserves a newer ordinary followup ACK/head/cursor and its optimistic input", async () => {
  const { engine, client, resolve } = await setup()
  expect(typeof engine.regenerateAnswer).toBe("function")
  const pending = engine.regenerateAnswer!(intent())
  client.nextCreate = async () => makeReceipt("followup")
  expect(engine.submit("new followup")).toBe(true)
  await settle()
  client.lastStream().emit([makeEvent("run.created", { run_id: "followup" }, { run_id: "followup" }), makeEvent("message.delta", { segment_id: "new-text", delta: "new progress" }, { run_id: "followup" })])
  await settle()
  const before = engine.getSnapshot(), streams = client.streams.length
  resolve(); await pending
  const after = engine.getSnapshot()
  expect(after.machine).toEqual(before.machine)
  expect(after.thread.resumeCursor).toBe(before.thread.resumeCursor)
  expect(after.thread.messages).toEqual(before.thread.messages)
  expect(after.thread.messages.some(m => m.content === "new followup")).toBe(true)
  expect(after.thread.messageParts?.["new-answer"]?.runId).toBe("regenerated")
  expect(client.streams).toHaveLength(streams)
  expect(client.snapshotCalls).toHaveLength(1)
})
it("retired conversation or aborted caller never adopts an accepted old answer into a replacement view", async () => {
  for (const retire of ["conversation", "abort"] as const) {
    const { engine, calls, resolve } = await setup()
    expect(typeof engine.regenerateAnswer).toBe("function")
    const controller = new AbortController(), pending = engine.regenerateAnswer!({ ...intent(), signal: controller.signal })
    if (retire === "conversation") engine.newConversation(); else controller.abort()
    const before = engine.getSnapshot()
    resolve(); await expect(pending).rejects.toThrow()
    expect(engine.getSnapshot()).toBe(before)
    expect(engine.getSnapshot().thread.messageParts?.["new-answer"]).toBeUndefined()
    expect(calls).toHaveLength(1)
  }
})
it("unproven segment identity is rejected before any command", async () => {
  const { engine, calls } = await setup()
  expect(typeof engine.regenerateAnswer).toBe("function")
  await expect(engine.regenerateAnswer!({ ...intent(), sourceMessageId: "llm-segment" })).rejects.toThrow()
  expect(calls).toHaveLength(0)
})
it.each([false, true])("a non-head parts race discovers the accepted Run without erasing a later followup (%s)", async (lateRead) => {
  const client = createFakeClient()
  let resolveParts!: (page: Awaited<ReturnType<typeof client.fetchMessageParts>>) => void
  client.nextParts = () => new Promise(resolve => { resolveParts = resolve })
  client.nextSnapshot = async () => makeSnapshot({ messages: [human, { ...source, content: null, rendering: { mode: "ordered", format_version: 1, revision: "1", event_watermark: null, parts_cursor: "old-parts" } }] })
  let resolve!: (value: typeof ack) => void
  let commands = 0
  const engine = createSessionEngine({ client, storage: createMemoryStorage(addConversation(null, "conv_1", 1)),
    answerActions: { regenerate: () => { commands++; return new Promise<typeof ack>(r => { resolve = r }) } } } as EngineDeps)
  engines.push(engine); await settle()
  const pending = engine.regenerateAnswer!(intent())
  resolveParts({ session_id: "conv_1", message_id: "answer", run_id: "old", revision: "1", format_version: 1, event_watermark: null,
    items: [{ kind: "text", part_id: "text:old", segment_id: "old-public-segment", first_sequence: "1", latest_sequence: "1", text: "original answer", offset: "0", end: "15", total_scalars: "15", completed: true }], next_cursor: null })
  await settle()
  const owner = makeSnapshot({ messages: [human, source, { ...source, message_id: "new-answer", run_id: "regenerated", content: "real accepted answer" }] })
  let resolveRead!: (value: typeof owner) => void
  client.nextSnapshot = async () => lateRead ? new Promise(r => { resolveRead = r }) : owner
  resolve(ack); await pending; await settle()
  if (lateRead) {
    expect(engine.submit("preserve this later input")).toBe(true)
    await settle()
    const before = engine.getSnapshot()
    resolveRead(owner); await settle()
    expect(engine.getSnapshot().machine).toEqual(before.machine)
    expect(engine.getSnapshot().thread).toBe(before.thread)
    expect(engine.getSnapshot().thread.messages.some(message => message.content === "preserve this later input")).toBe(true)
    expect(commands).toBe(1)
    return
  }
  expect(engine.getSnapshot().thread.messages.some(message => message.id === "new-answer" && message.content === "real accepted answer")).toBe(true)
  expect(engine.getSnapshot().thread.messages.filter(message => message.role === "user")).toHaveLength(1)
  expect(engine.getSnapshot().thread.runTerminalsById.regenerated).toBe("completed")
  expect(client.snapshotCalls).toHaveLength(2)
  expect(commands).toBe(1)
  expect(client.createCalls).toHaveLength(0)
})
it("a second benign historical parts completion during the compensation read cannot strand a real accepted Run", async () => {
  const client = createFakeClient(), pages = new Map<string, (page: Awaited<ReturnType<typeof client.fetchMessageParts>>) => void>()
  client.nextParts = args => new Promise(resolve => { pages.set(args.messageId, resolve) })
  const ordered = (message_id: string, run_id: string) => ({ ...source, message_id, run_id, content: null, rendering: { mode: "ordered" as const, format_version: 1 as const, revision: "1", event_watermark: null, parts_cursor: `parts-${message_id}` } })
  client.nextSnapshot = async () => makeSnapshot({ messages: [human, ordered("older", "older-run"), ordered("answer", "old")] })
  let accept!: (value: typeof ack) => void
  const engine = createSessionEngine({ client, storage: createMemoryStorage(addConversation(null, "conv_1", 1)),
    answerActions: { regenerate: () => new Promise<typeof ack>(resolve => { accept = resolve }) } } as EngineDeps)
  engines.push(engine); await settle()
  const pending = engine.regenerateAnswer!(intent())
  const page = (message_id: string, run_id: string) => ({ session_id: "conv_1", message_id, run_id, format_version: 1 as const, revision: "1", event_watermark: null, next_cursor: null,
    items: [{ kind: "text" as const, part_id: `text:${message_id}`, segment_id: `text-${message_id}`, first_sequence: "1", latest_sequence: "1", text: "read", offset: "0", end: "4", total_scalars: "4", completed: true }] })
  pages.get("answer")!(page("answer", "old")); await settle()
  let read!: (snapshot: ReturnType<typeof makeSnapshot>) => void
  client.nextSnapshot = () => new Promise(resolve => { read = resolve })
  accept(ack); await pending; await settle()
  pages.get("older")!(page("older", "older-run")); await settle()
  read(makeSnapshot({ messages: [human, source, { ...source, message_id: "new-answer", run_id: "regenerated", content: "accepted owner output" }] }))
  await settle()
  expect(engine.getSnapshot().thread.messages.some(message => message.id === "new-answer" && message.content === "accepted owner output")).toBe(true)
  expect(client.snapshotCalls).toHaveLength(2)
  expect(client.createCalls).toHaveLength(0)
})
