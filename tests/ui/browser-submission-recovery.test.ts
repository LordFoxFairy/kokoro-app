import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBrowserSubmissionRecovery, SUBMISSION_RECOVERY_PREFIX } from "@/ui/shell/browser-submission-recovery"
import { createSessionEngine } from "@/engine/machine"
import type { PendingSubmission } from "@/engine/submission-recovery"
import type { ConversationStore } from "@/core/conversations"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
import { SessionClientError } from "@/engine/client"
import { makeEvent, makeSnapshot } from "../core/fixtures"

const intent: PendingSubmission = { sessionId: "conv_pending", optimisticUserId: "usr_local", idempotencyKey: "original-key", content: "original text",
  options: { mode: "thinking", model: "exact-model", selectedSkillSourceRefs: undefined, selectedMcpConnectionIds: ["connection-one"] } }
const receipt = { run_id: "run_exact", user_message_id: "msg_exact", assistant_message_id: "assistant_exact" }
function recovery(subject = "alice", projectRef?: string, isCurrent: () => boolean = () => true) {
  return createBrowserSubmissionRecovery({ subject, scope: projectRef ? { kind: "project", projectRef } : { kind: "direct" }, isCurrent, storage: () => window.sessionStorage })
}

beforeEach(() => window.sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe("tab-owned pending request journal", () => {
  it("roundtrips the same wire identity and undefined project-default Skill selection", () => {
    expect(recovery().save(intent)).toBe(true)
    expect(recovery().read(intent.sessionId)).toEqual({ submission: intent, failureCode: null })
    recovery().failure(intent, "agent_not_configured")
    expect(recovery().read(intent.sessionId)?.failureCode).toBe("agent_not_configured")
    expect(recovery("alice", "project-one").read(intent.sessionId)).toBeNull()
    expect(recovery("bob").read(intent.sessionId)).toBeNull()
  })
  it("does not grant recovery from a stale subject marker", () => {
    recovery().save(intent)
    const retired = recovery("alice", undefined, () => false)
    expect(() => retired.read(intent.sessionId)).toThrow()
    expect(retired.save(intent)).toBe(false)
    expect(recovery().read(intent.sessionId)?.submission).toEqual(intent)
  })
  it("refuses replacement of an unresolved request, including its options", () => {
    const journal = recovery()
    journal.save(intent)
    expect(journal.save({ ...intent, idempotencyKey: "new-key" })).toBe(false)
    expect(journal.save({ ...intent, options: { ...intent.options, selectedSkillSourceRefs: [] } })).toBe(false)
    expect(journal.read(intent.sessionId)?.submission).toEqual(intent)
  })
  it("exact ACK or explicit abandonment retires replay without retaining the message body", () => {
    const journal = recovery()
    journal.save(intent)
    journal.acknowledge(intent, receipt)
    expect(journal.read(intent.sessionId)).toBeNull()
    expect(journal.save(intent)).toBe(false)
    expect(window.sessionStorage.getItem(window.sessionStorage.key(0) ?? "")).not.toContain("original text")
    const successor = { ...intent, idempotencyKey: "next-key", optimisticUserId: "usr_next" }
    expect(journal.save(successor)).toBe(true)
    journal.acknowledge(intent, receipt)
    expect(journal.read(intent.sessionId)?.submission).toEqual(successor)
    expect(journal.abandon(successor)).toBe(true)
    expect(journal.read(intent.sessionId)).toBeNull()
    expect(journal.save(successor)).toBe(false)
  })
  it("does not mistake corrupt data or rejected storage for absence", () => {
    recovery().save(intent)
    const key = window.sessionStorage.key(0)
    if (!key) throw new Error("missing record")
    window.sessionStorage.setItem(key, "{broken")
    expect(() => recovery().read(intent.sessionId)).toThrow()
    expect(recovery().save(intent)).toBe(false)
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError") })
    expect(() => recovery().read(intent.sessionId)).toThrow()
    expect(recovery().save(intent)).toBe(false)
  })
  it("rejects oversized records and a project field copied into a direct slot", () => {
    expect(recovery().save({ ...intent, content: "x".repeat(1024 * 1024) })).toBe(false)
    recovery("alice", "project-one").save(intent)
    const source = window.sessionStorage.key(0)
    if (!source) throw new Error("missing record")
    const raw = window.sessionStorage.getItem(source)
    if (!raw) throw new Error("missing record bytes")
    window.sessionStorage.setItem(`${SUBMISSION_RECOVERY_PREFIX}alice:direct:${intent.sessionId}`, raw)
    expect(() => recovery().read(intent.sessionId)).toThrow(/scope/)
  })
  it("keeps the prior unknown identity if storing ACK or cancellation fails", () => {
    const journal = recovery()
    journal.save(intent)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError") })
    journal.acknowledge(intent, receipt)
    expect(journal.abandon(intent)).toBe(false)
    expect(journal.read(intent.sessionId)?.submission).toEqual(intent)
  })
})

describe("real browser journal with engine reconstruction", () => {
  it("retains an unknown POST on reload, GETs first and manually retries only the original request", async () => {
    const storage = createMemoryStorage<ConversationStore>()
    const client = createFakeClient()
    client.nextCreate = () => new Promise(() => undefined)
    const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
    engine.newConversation()
    engine.setSelectedMcpConnectionIds(["connection-one"])
    expect(engine.submit("original unknown")).toBe(true)
    const original = client.createCalls[0]
    if (!original) throw new Error("missing request")
    engine.dispose()
    const next = createFakeClient()
    next.nextCreate = () => Promise.reject(new Error("offline"))
    const restored = createSessionEngine({ client: next, storage, submissionRecovery: recovery() })
    await settle()
    expect(next.createCalls).toEqual([])
    expect(restored.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(restored.submit("replacement")).toBe(false)
    restored.retry()
    await settle()
    expect(next.createCalls).toEqual([original])
    restored.dispose()
  })
  it("does not infer an exact receipt from a 200 snapshot or another message with matching content", async () => {
    const storage = createMemoryStorage<ConversationStore>()
    const first = createFakeClient()
    first.nextCreate = () => Promise.reject(new SessionClientError("network", "unknown"))
    const engine = createSessionEngine({ client: first, storage, submissionRecovery: recovery() })
    engine.newConversation(); engine.submit("original text"); await settle(); engine.dispose()
    const next = createFakeClient()
    next.nextSnapshot = () => Promise.resolve(makeSnapshot({ messages: [{ message_id: "another-user-message", role: "user", content: "original text", status: "completed", created_at: "2026-10-24T00:00:00.000Z" }] }))
    const restored = createSessionEngine({ client: next, storage, submissionRecovery: recovery() })
    await settle()
    expect(restored.getSnapshot().canRetryPendingSubmission).toBe(true)
    expect(next.createCalls).toEqual([])
    restored.dispose()
  })
  it("positive receipt prevents replay after reload and abandoned late ACK still cancels the original run", async () => {
    const storage = createMemoryStorage<ConversationStore>()
    const first = createFakeClient()
    let accept: ((value: typeof receipt) => void) | undefined
    first.nextCreate = () => new Promise(resolve => { accept = resolve })
    const engine = createSessionEngine({ client: first, storage, submissionRecovery: recovery() })
    engine.newConversation(); engine.submit("original text")
    const originalId = engine.getSnapshot().store?.activeId
    engine.cancelRun()
    accept?.(receipt); await settle()
    expect(first.controlCalls[0]?.sessionId).toBe(originalId)
    engine.dispose()
    const next = createFakeClient()
    const restored = createSessionEngine({ client: next, storage, submissionRecovery: recovery() })
    await settle()
    expect(restored.getSnapshot().canRetryPendingSubmission).toBe(false)
    expect(next.createCalls).toEqual([])
    restored.dispose()
  })
  it("refuses to fake cancellation or New when its retirement cannot be saved", async () => {
    const storage = createMemoryStorage<ConversationStore>()
    const client = createFakeClient()
    client.nextCreate = () => new Promise(() => undefined)
    const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
    engine.newConversation(); engine.submit("original text")
    const id = engine.getSnapshot().store?.activeId
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError") })
    engine.newConversation(); engine.cancelRun()
    expect(engine.getSnapshot().store?.activeId).toBe(id)
    expect(engine.getSnapshot().hasPendingSubmission).toBe(true)
    expect(engine.getSnapshot().notice?.key).toBe("chat.submissionRecoveryFailed")
    engine.dispose(); await settle()
  })
})

// Review regressions: successful owner reads cannot stand in for a readable original slot.
it("keeps a rejected recovery read recoverable even when the owner could return200", async () => {
  const journal = recovery()
  journal.save(intent)
  const storage = createMemoryStorage<ConversationStore>({ activeId: intent.sessionId, conversations: [{ id: intent.sessionId, title: "task", updatedAt: 1, mode: "fast" }] })
  let unreadable = true
  const client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: intent.sessionId }))
  const engine = createSessionEngine({ client, storage, submissionRecovery: { ...journal, read: id => { if (unreadable) throw new Error("storage denied"); return journal.read(id) } } })
  await settle()
  expect(engine.getSnapshot().connection.status).toBe("unavailable")
  unreadable = false
  engine.reconnect(); await settle()
  expect(engine.getSnapshot().thread.messages.map(row => row.content)).toContain(intent.content)
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
  expect(client.createCalls).toEqual([])
  engine.dispose()
})

it("a restored owner run can finish, reconcile its exact receipt and accept the next message without revival", async () => {
  recovery().save(intent)
  const storage = createMemoryStorage<ConversationStore>({ activeId: intent.sessionId, conversations: [{ id: intent.sessionId, title: "task", updatedAt: 1, mode: "fast" }] })
  const client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: intent.sessionId, activeRun: { run_id: receipt.run_id, status: "running" } }))
  client.nextCreate = () => Promise.resolve(receipt)
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  await settle()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: intent.sessionId, messages: [
    { message_id: receipt.assistant_message_id, role: "assistant", run_id: receipt.run_id, content: "done", status: "completed", created_at: "2026-10-24T00:00:00Z" },
  ] }))
  client.lastStream().emit([makeEvent("run.completed", { status: "completed" }, { run_id: receipt.run_id })])
  await settle()
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
  engine.retry(); await settle()
  expect(client.createCalls).toHaveLength(1)
  expect(engine.getSnapshot().machine.phase).toBe("idle")
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(false)
  expect(engine.submit("next message")).toBe(true)
  engine.dispose(); await settle()
})

it("ACK storage failure does not strand later sends or turn an accepted run into execution failure", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient()
  let accept: ((value: typeof receipt) => void) | undefined
  client.nextCreate = () => new Promise(resolve => { accept = resolve })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  engine.newConversation(); engine.submit("original text")
  const deny = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError") })
  accept?.(receipt); await settle()
  expect(engine.getSnapshot().machine.phase).toBe("queued")
  client.lastStream().emit([makeEvent("run.completed", { status: "completed" }, { run_id: receipt.run_id })]); await settle()
  deny.mockRestore()
  expect(engine.submit("next message")).toBe(true)
  expect(client.createCalls).toHaveLength(2)
  engine.dispose()
})

it("does not replay a positively acknowledged request on document recreation", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const first = createFakeClient()
  first.nextCreate = () => Promise.resolve(receipt)
  const engine = createSessionEngine({ client: first, storage, submissionRecovery: recovery() })
  engine.newConversation(); engine.submit("original text"); await settle(); engine.dispose()
  const client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ messages: [
    { message_id: receipt.user_message_id, role: "user", content: "original text", status: "completed", created_at: "2026-10-24T00:00:00Z" },
  ] }))
  const restored = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  await settle()
  expect(client.createCalls).toEqual([])
  expect(restored.getSnapshot().thread.messages.map(row => row.id)).toEqual([receipt.user_message_id])
  expect(restored.getSnapshot().canRetryPendingSubmission).toBe(false)
  expect(restored.getSnapshot().canSubmitMessage).toBe(true)
  restored.dispose()
})

it("does not offer manual replay before the initial authoritative read settles", async () => {
  recovery().save(intent)
  const storage = createMemoryStorage<ConversationStore>({ activeId: intent.sessionId, conversations: [{ id: intent.sessionId, title: "task", updatedAt: 1, mode: "fast" }] })
  const client = createFakeClient()
  let absent: (() => void) | undefined
  client.nextSnapshot = () => new Promise(resolve => { absent = () => resolve(null) })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(false)
  engine.retry()
  expect(client.createCalls).toEqual([])
  absent?.(); await settle()
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
  engine.dispose()
})

it("adopts the exact original late ACK after switching away and restoring the same pending intent", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient()
  let accept: ((value: typeof receipt) => void) | undefined
  client.nextCreate = () => new Promise(resolve => { accept = resolve })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  engine.newConversation(); engine.submit("original text")
  const id = engine.getSnapshot().store?.activeId
  if (!id) throw new Error("missing id")
  engine.openConversation("conv_other"); await settle()
  engine.openConversation(id); await settle()
  accept?.(receipt); await settle()
  expect(engine.getSnapshot().hasPendingSubmission).toBe(false)
  expect(engine.getSnapshot().machine.runId).toBe(receipt.run_id)
  expect(client.createCalls).toHaveLength(1)
  engine.dispose()
})

it("known exact RAM receipt is persisted locally on recovery instead of re-POSTing after a scope roundtrip", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient()
  let accept: ((value: typeof receipt) => void) | undefined
  client.nextCreate = () => new Promise(resolve => { accept = resolve })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  engine.newConversation(); engine.submit("original text")
  const id = engine.getSnapshot().store?.activeId
  if (!id) throw new Error("missing id")
  const deny = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError") })
  accept?.(receipt); await settle()
  engine.openConversation("conv_other"); await settle()
  engine.openConversation(id); await settle()
  deny.mockRestore()
  engine.retry(); await settle()
  expect(client.createCalls).toHaveLength(1)
  expect(engine.getSnapshot().hasPendingSubmission).toBe(false)
  engine.dispose()
})

it("a definitive failed approval command can adopt a terminal owner read without stranding the original admission", async () => {
  recovery().save(intent)
  const storage = createMemoryStorage<ConversationStore>({ activeId: intent.sessionId, conversations: [{ id: intent.sessionId, title: "task", updatedAt: 1, mode: "fast" }] })
  const client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: intent.sessionId,
    activeRun: { run_id: receipt.run_id, status: "waiting_input" },
    pendingPauses: [{ run_id: receipt.run_id, tool_id: "tool_pending", status: "pending" }],
  }))
  client.nextControl = () => Promise.resolve({ run_id: receipt.run_id, command_id: "command_failed", request_digest: "sha256:fake", status: "failed", error_code: "run_not_active", replayed: false })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  await settle()
  expect(engine.getSnapshot().machine.phase).toBe("waiting")
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({ sessionId: intent.sessionId }))
  engine.stageToolDecision(receipt.run_id, "tool_pending", { type: "approve" }); await settle()
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
  expect(client.createCalls).toEqual([])
  engine.dispose()
})

it("a deferred exact failed assistant ACK without run_id never revives its settled run", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient()
  let accept: ((value: typeof receipt) => void) | undefined
  client.nextCreate = () => new Promise(resolve => { accept = resolve })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  engine.newConversation(); engine.submit("original text")
  const id = engine.getSnapshot().store?.activeId
  if (!id) throw new Error("missing id")
  engine.openConversation("conv_other"); await settle()
  let load: (() => void) | undefined
  client.nextSnapshot = () => new Promise(resolve => { load = () => resolve(makeSnapshot({ sessionId: id, messages: [
    { message_id: receipt.assistant_message_id, role: "assistant", content: "partial", status: "failed", created_at: "2026-10-24T00:00:00Z" },
  ] })) })
  engine.openConversation(id)
  accept?.(receipt); await settle()
  load?.(); await settle()
  expect(engine.getSnapshot().machine.phase).toBe("idle")
  expect(engine.getSnapshot().hasPendingSubmission).toBe(false)
  expect(client.streams).toEqual([])
  engine.dispose()
})

it.each([false, true])("cancellation survives one failed duplicate attempt while another exact request awaits ACK (New first=%s)", async newFirst => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient()
  let rejectFirst: ((error: Error) => void) | undefined
  let acceptSecond: ((value: typeof receipt) => void) | undefined
  let attempts = 0
  client.nextCreate = () => ++attempts === 1
    ? new Promise((_resolve, reject) => { rejectFirst = reject })
    : new Promise(resolve => { acceptSecond = resolve })
  const engine = createSessionEngine({ client, storage, submissionRecovery: recovery() })
  engine.newConversation(); engine.submit("original text")
  const id = engine.getSnapshot().store?.activeId
  if (!id) throw new Error("missing id")
  engine.openConversation("conv_other"); await settle()
  engine.openConversation(id); await settle()
  engine.retry()
  expect(client.createCalls).toHaveLength(2)
  if (newFirst) engine.newConversation()
  rejectFirst?.(new Error("unknown outcome")); await settle()
  if (!newFirst) engine.newConversation()
  acceptSecond?.(receipt); await settle()
  expect(client.controlCalls).toHaveLength(1)
  expect(client.controlCalls[0]?.sessionId).toBe(id)
  expect(client.controlCalls[0]?.runId).toBe(receipt.run_id)
  engine.dispose()
})

it("an exact journal receipt learned from another engine is reconciled by GET rather than POST", async () => {
  const journal = recovery()
  journal.save(intent)
  const storage = createMemoryStorage<ConversationStore>({ activeId: intent.sessionId, conversations: [{ id: intent.sessionId, title: "task", updatedAt: 1, mode: "fast" }] })
  const client = createFakeClient()
  const engine = createSessionEngine({ client, storage, submissionRecovery: journal })
  await settle()
  journal.acknowledge(intent, receipt)
  engine.retry(); await settle()
  expect(client.createCalls).toEqual([])
  expect(engine.getSnapshot().hasPendingSubmission).toBe(false)
  expect(engine.getSnapshot().missingSessionId).toBe(intent.sessionId)
  engine.dispose()
})
