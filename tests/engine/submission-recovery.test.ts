import { describe, expect, it } from "vitest"
import { createSessionEngine } from "@/engine/machine"
import type { CreateMessageArgs } from "@/engine/execution-adapter"
import { addConversation, type ConversationStore } from "@/core/conversations"
import { SessionClientError } from "@/engine/client"
import { makeEvent } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "./fakes"

type Intent = CreateMessageArgs & { optimisticUserId: string }
function journal() {
  let pending: { submission: Intent; failureCode: string | null } | null = null
  return {
    read: () => pending,
    save: (submission: Intent) => { pending = { submission: structuredClone(submission), failureCode: null }; return true },
    failure: (_submission: Intent, code: string) => { if (pending) pending.failureCode = code },
    acknowledged: () => null,
    acknowledge: () => { pending = null; return true },
    abandon: () => { pending = null; return true },
  }
}

describe("first submission survives document recreation without dispatching", () => {
  it("503 followed by reload and owner404 keeps original text/key/options for manual retry", async () => {
    const storage = createMemoryStorage<ConversationStore>()
    const recovery = journal()
    const first = createFakeClient()
    first.nextCreate = () => Promise.reject(new SessionClientError("http", "agent_not_configured", "agent_not_configured"))
    const engine = createSessionEngine({ client: first, storage, ...{ submissionRecovery: recovery } })
    engine.newConversation()
    engine.setModel("exact-model")
    engine.setSelectedMcpConnectionIds(["connection-one"])
    expect(engine.submit("original text")).toBe(true)
    await settle()
    const original = first.createCalls[0]
    if (!original) throw new Error("missing original request")
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    engine.dispose()

    const second = createFakeClient()
    second.nextCreate = () => Promise.reject(new Error("offline"))
    const restored = createSessionEngine({ client: second, storage, ...{ submissionRecovery: recovery } })
    await settle()
    expect(second.snapshotCalls).toEqual([original.sessionId])
    expect(second.createCalls).toEqual([])
    expect(restored.getSnapshot().missingSessionId).toBeUndefined()
    expect(restored.getSnapshot().thread.messages.map(row => row.content)).toContain("original text")
    expect(restored.getSnapshot().canRetryPendingSubmission).toBe(true)
    restored.setModel("changed-after-reload")
    restored.setSelectedMcpConnectionIds([])
    restored.retry()
    await settle()
    expect(second.createCalls).toEqual([original])
    restored.dispose()
  })

  it("does not send or consume a local draft when recovery storage rejects the write", () => {
    const client = createFakeClient()
    const storage = createMemoryStorage<ConversationStore>()
    let retired = 0
    const engine = createSessionEngine({ client, storage,
      draftLifecycle: { isUnsubmitted: () => true, retire: () => { retired++; return true } },
      ...{ submissionRecovery: { ...journal(), save: () => false } },
    })
    engine.newConversation()
    expect(engine.submit("keep input")).toBe(false)
    expect(client.createCalls).toEqual([])
    expect(retired).toBe(0)
    expect(engine.getSnapshot().notice?.key).toBe("chat.localDraftPersistenceFailed")
    engine.dispose()
  })
})

it("retries a lost FIFO receipt with the same intent without interrupting the current run", async () => {
  const client = createFakeClient()
  const recovery = journal()
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: recovery })
  try {
    expect(engine.submit("start the current run")).toBe(true)
    await settle()
    const activeRun = engine.getSnapshot().machine.runId
    const stream = client.lastStream()
    expect(activeRun).not.toBeNull()
    const todos = [{ content: "Original progress", status: "in_progress" as const }]
    stream.emit([makeEvent("todo.updated", { todos }, { run_id: activeRun! })])
    await settle()
    expect(engine.getSnapshot().thread.todos).toEqual(todos)

    let savedBeforePost = false
    client.nextCreate = () => {
      savedBeforePost = recovery.read()?.submission.content === "queue one follow-up"
      return Promise.reject(new SessionClientError("network", "lost acknowledgement"))
    }
    expect(engine.submit("queue one follow-up")).toBe(true)
    await settle()
    expect(savedBeforePost).toBe(true)
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(engine.getSnapshot().machine.runId).toBe(activeRun)
    expect(engine.getSnapshot().thread.todos).toEqual(todos)
    expect(engine.submit("keep this next draft")).toBe(false)
    expect(client.createCalls).toHaveLength(2)

    const receipt = makeReceipt("queued_successor")
    client.nextCreate = () => Promise.resolve(receipt)
    engine.retry()
    await settle()
    expect(client.createCalls).toHaveLength(3)
    expect(client.createCalls[2]).toEqual(client.createCalls[1])
    expect(engine.getSnapshot().thread.messages.filter(row => row.id === receipt.user_message_id)).toHaveLength(1)
    expect(engine.getSnapshot().machine.runId).toBe(activeRun)
    expect(client.lastStream()).toBe(stream)
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(false)
    expect(recovery.read()).toBeNull()
  } finally { engine.dispose() }
})

it("absorbs a FIFO receipt received during automatic stream reconnection without opening a second stream", async () => {
  const client = createFakeClient()
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: journal() })
  try {
    engine.submit("current run")
    await settle()
    const activeRun = engine.getSnapshot().machine.runId
    const stream = client.lastStream()
    let acknowledge!: (receipt: ReturnType<typeof makeReceipt>) => void
    client.nextCreate = () => new Promise(resolve => { acknowledge = resolve })
    expect(engine.submit("queued while connected")).toBe(true)
    stream.reconnecting()
    const receipt = makeReceipt("queued_while_reconnecting")
    acknowledge(receipt)
    await settle()
    expect(engine.getSnapshot().canSubmitMessage).toBe(false)

    stream.connected()
    await settle()
    expect(engine.getSnapshot()).toMatchObject({ hasPendingSubmission: false, canSubmitMessage: true })
    expect(engine.getSnapshot().thread.messages.filter(row => row.id === receipt.user_message_id)).toHaveLength(1)
    expect(engine.getSnapshot().machine.runId).toBe(activeRun)
    expect(client.lastStream()).toBe(stream)
    expect(client.createCalls).toHaveLength(2)
  } finally { engine.dispose() }
})

it("a cold local home selection preserves another session's original unknown for explicit recovery without cancelling it", async () => {
  const records = new Map<string, { submission: Intent; failureCode: string | null }>()
  let abandoned = 0
  const recovery = { read: (id: string) => records.get(id) ?? null,
    save: (submission: Intent) => { records.set(submission.sessionId, { submission: structuredClone(submission), failureCode: null }); return true },
    failure: (submission: Intent, code: string) => { const value = records.get(submission.sessionId); if (value) value.failureCode = code },
    acknowledged: () => null, acknowledge: (submission: Intent) => { records.delete(submission.sessionId); return true },
    abandon: () => { abandoned++; return true } }
  const storage = createMemoryStorage<ConversationStore>()
  const first = createFakeClient()
  first.nextCreate = () => Promise.reject(Error("lost ACK"))
  const originalEngine = createSessionEngine({ client: first, storage, submissionRecovery: recovery })
  originalEngine.newConversation()
  originalEngine.submit("original frozen input")
  await settle()
  const original = first.createCalls[0]!
  const before = JSON.stringify(records.get(original.sessionId))
  originalEngine.dispose()
  // This is the existing local-store projection chosen before engine creation,
  // not the command-bearing newConversation action after restoring the old Run.
  storage.write(addConversation(storage.read(), "new-home-local", 2, "fast", true))
  const client = createFakeClient()
  client.nextCreate = () => Promise.reject(Error("explicit retry still offline"))
  const home = createSessionEngine({ client, storage, submissionRecovery: recovery, draftLifecycle: { isUnsubmitted: id => id === "new-home-local", retire: () => true } })
  try {
    expect(home.getSnapshot().locallyCreatedSessionId).toBe("new-home-local")
    expect(client.snapshotCalls).toEqual([])
    expect(client.createCalls).toEqual([])
    expect(client.controlCalls).toEqual([])
    expect(client.deleteCalls).toEqual([])
    expect(abandoned).toBe(0)
    expect(JSON.stringify(records.get(original.sessionId))).toBe(before)
    home.openConversation(original.sessionId)
    await settle()
    expect(home.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(client.createCalls).toEqual([])
    home.retry(); await settle()
    expect(client.createCalls).toEqual([original])
    expect(client.controlCalls).toEqual([])
    expect(abandoned).toBe(0)
  } finally { home.dispose() }
})
