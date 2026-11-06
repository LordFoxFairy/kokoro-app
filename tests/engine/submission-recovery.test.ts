import { describe, expect, it, vi } from "vitest"
import { createSessionEngine } from "@/engine/machine"
import type { PendingSubmission } from "@/engine/submission-recovery"
import { addConversation, type ConversationStore } from "@/core/conversations"
import { SessionClientError } from "@/engine/client"
import { makeEvent, makeSnapshot } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, makeReceipt, settle } from "./fakes"

type Intent = PendingSubmission
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

it("freezes an exact started Run and restores the draft only after a definitive interrupt conflict", async () => {
  const client = createFakeClient()
  const recovery = journal()
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: recovery })
  try {
    expect(engine.submit("first message")).toBe(true)
    await settle()
    const runId = engine.getSnapshot().machine.runId!
    expect(engine.submit("original interrupt", { interruptRunId: runId })).toBe(false)
    client.lastStream().emit([makeEvent("run.created", { run_id: runId }, { run_id: runId })])
    await settle()
    expect(engine.submit("original interrupt", { interruptRunId: "different_run" })).toBe(false)

    client.nextCreate = () => Promise.reject(new SessionClientError("network", "lost ACK"))
    expect(engine.submit("original interrupt", { interruptRunId: runId })).toBe(true)
    await settle()
    const original = client.createCalls[1]!
    expect(original.body.interrupt_run_id).toBe(runId)
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(engine.restoreRejectedDelivery?.(() => true)).toBe(false)

    client.nextCreate = () => Promise.reject(new SessionClientError("http", "stale target", "run_delivery_conflict", 409))
    engine.retry()
    await settle()
    expect(client.createCalls[2]).toEqual(original)
    expect(engine.getSnapshot()).toMatchObject({ canRetryPendingSubmission: false, canRestoreRejectedDelivery: true })
    expect(engine.restoreRejectedDelivery?.(() => false)).toBe(false)
    expect(recovery.read()?.submission.content).toBe("original interrupt")
    const drafts: string[] = []
    expect(engine.restoreRejectedDelivery?.((draft) => { drafts.push(draft); return true })).toBe(true)
    expect(drafts).toEqual(["original interrupt"])
    expect(recovery.read()).toBeNull()
    expect(engine.getSnapshot().thread.messages.some(row => row.content === "original interrupt")).toBe(false)
    expect(engine.getSnapshot().machine.runId).toBe(runId)
    expect(client.createCalls).toHaveLength(3)
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

it("replays a lost same-Run supplement only on explicit retry, then uses the canonical user receipt", async () => {
  const client = createFakeClient()
  const recovery = journal()
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: recovery })
  try {
    expect(engine.submit("start one Run")).toBe(true)
    await settle()
    const runId = engine.getSnapshot().machine.runId!
    const stream = client.lastStream()
    stream.emit([makeEvent("run.created", { run_id: runId }, { run_id: runId })])
    await settle()
    client.nextControl = () => Promise.reject(new SessionClientError("network", "lost acknowledgement"))
    expect(engine.submit("keep the current Run", { steerRunId: runId })).toBe(true)
    await settle()
    const original = client.controlCalls[0]!
    expect(original).toMatchObject({ runId, body: { kind: "run.steer", content: "keep the current Run" } })
    expect(recovery.read()?.submission.content).toBe("keep the current Run")
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(client.controlCalls).toHaveLength(1)
    expect(client.createCalls).toHaveLength(1)
    expect(engine.getSnapshot().thread.messages.some(row => row.content === "keep the current Run")).toBe(false)

    client.nextControl = async () => ({
      run_id: runId, command_id: original.commandId, message_id: "owner-supplement",
      request_digest: "sha256:owner", status: "failed", error_code: "control_superseded", replayed: true,
    })
    engine.retry()
    await settle()
    expect(client.controlCalls).toEqual([original, original])
    expect(client.createCalls).toHaveLength(1)
    expect(engine.getSnapshot().machine.runId).toBe(runId)
    expect(client.lastStream()).toBe(stream)
    expect(engine.getSnapshot().thread.messages.filter(row => row.id === "owner-supplement")).toEqual([
      { id: "owner-supplement", role: "user", runId, content: "keep the current Run", deliveryStatus: "failed" },
    ])
    expect(engine.getSnapshot().canRetryPendingSubmission).toBe(false)
    expect(recovery.read()).toBeNull()
  } finally { engine.dispose() }
})

it("follows a pending canonical supplement by exact scoped owner GET without replacing live state", async () => {
  const client = createFakeClient()
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>() })
  try {
    engine.submit("start Run")
    await settle()
    const { machine: { runId }, store } = engine.getSnapshot()
    if (!runId || !store) throw new Error("missing Run")
    const sessionId = store.activeId
    const stream = client.lastStream()
    stream.emit([makeEvent("run.created", { run_id: runId }, { run_id: runId })])
    await settle()
    vi.useFakeTimers()
    const text = "same content"
    const row = { role: "user", content: text, status: "completed", created_at: "2026-10-24T00:00:00Z" } as const
    client.nextControl = async () => ({
      run_id: runId, command_id: client.controlCalls[0]!.commandId, message_id: "canonical",
      request_digest: "sha256:owner", status: "pending", replayed: false,
    })
    expect(engine.submit(text, { steerRunId: "not-current" })).toBe(false)
    expect(engine.submit(text, { steerRunId: runId })).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    const supplement = () => engine.getSnapshot().thread.messages.find(message => message.id === "canonical")
    expect(supplement()?.deliveryStatus).toBe("pending")
    client.nextSnapshot = async () => makeSnapshot({ sessionId, messages: [
      { ...row, message_id: "another-message", run_id: runId },
      { ...row, message_id: "canonical", run_id: "another-run" },
    ] })
    await vi.advanceTimersByTimeAsync(750)
    expect(supplement()?.deliveryStatus).toBe("pending")
    await vi.advanceTimersByTimeAsync(45_000)
    const readsBeforeTerminal = client.snapshotCalls.length
    expect(readsBeforeTerminal).toBeLessThan(30)
    await vi.advanceTimersByTimeAsync(45_000)
    expect(client.snapshotCalls).toHaveLength(readsBeforeTerminal)
    expect(supplement()?.deliveryStatus).toBe("pending")

    // The Run's terminal can be projected before the independent steer worker
    // writes its owner-confirmed receipt. A quiet EOF need not reconnect SSE.
    let terminalSnapshot = true
    client.nextSnapshot = async () => {
      const status = terminalSnapshot ? "pending" : "completed"
      terminalSnapshot = false
      return makeSnapshot({ sessionId, messages: [{ ...row, message_id: "canonical", run_id: runId, status }] })
    }
    stream.emit([makeEvent("run.completed", { status: "completed" }, { session_id: sessionId, run_id: runId })])
    await vi.advanceTimersByTimeAsync(0)
    expect(client.snapshotCalls).toHaveLength(readsBeforeTerminal + 1)
    expect(supplement()?.deliveryStatus).toBe("pending")
    await vi.advanceTimersByTimeAsync(750)
    expect(supplement()).toMatchObject({ role: "user", runId, content: text })
    expect(supplement()?.deliveryStatus).toBeUndefined()
    expect(client.snapshotCalls).toEqual(Array.from({ length: readsBeforeTerminal + 2 }, () => sessionId))
    expect(client.controlCalls).toHaveLength(1)
    expect(client.createCalls).toHaveLength(1)
    expect(engine.getSnapshot().machine.runId).toBeNull()
    expect(client.lastStream()).toBe(stream)
  } finally { engine.dispose(); vi.useRealTimers() }
})
