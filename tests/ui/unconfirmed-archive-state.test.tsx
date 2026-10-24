import { useSyncExternalStore } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ConversationStore } from "@/core/conversations"
import { createSessionEngine } from "@/engine/machine"
import type { SessionEngine } from "@/engine/machine"
import { createBrowserSubmissionRecovery } from "@/ui/shell/browser-submission-recovery"
import { useConversationList } from "@/ui/shell/use-conversation-list"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
import { makeSnapshot } from "../core/fixtures"

const api = vi.hoisted(() => ({ archive: vi.fn(), list: vi.fn() }))
vi.mock("@/ui/settings/archived-tasks-client", () => ({ readArchiveState: api.archive }))
vi.mock("@/ui/shell/page-clients", () => ({ browserListClient: () => listClient }))
const listClient = { listSessions: api.list }
const journal = () => createBrowserSubmissionRecovery({ subject: "alice", scope: { kind: "direct" }, isCurrent: () => true, storage: () => sessionStorage })
function useList(engine: SessionEngine) {
  const view = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
  return useConversationList({ engine, activeId: view.store?.activeId ?? null, thread: view.thread,
    isStreaming: view.machine.phase !== "idle" && view.machine.phase !== "error", readBoundary: { identity: "alice", admitted: true } })
}
beforeEach(() => {
  sessionStorage.clear(); vi.resetAllMocks()
  api.list.mockResolvedValue({ sessions: [], next_cursor: null })
  api.archive.mockRejectedValue(Object.assign(Error("absent"), { status: 404 }))
})
afterEach(cleanup)

it("does not interpret an optimistic first message as an archive-readable owner conversation", async () => {
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: journal() })
  engine.submit("original first message")
  const { result, unmount } = renderHook(() => useList(engine))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(api.archive).not.toHaveBeenCalled()
  expect(result.current.archiveStatus).toBe("unconfirmed")
  expect(result.current.archiveStateError).toBe(false)
  expect(result.current.conversations).toEqual([{ id: engine.getSnapshot().store?.activeId, title: "original first message", submissionUnconfirmed: true }])
  unmount(); engine.dispose()
})

it("restores the pending navigation row after reload without claiming owner acceptance or reading archive", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const original = createSessionEngine({ client, storage, submissionRecovery: journal() })
  original.submit("original after reload"); original.dispose()
  const reloaded = createSessionEngine({ client, storage, submissionRecovery: journal() })
  const { result, unmount } = renderHook(() => useList(reloaded))
  await waitFor(() => expect(reloaded.getSnapshot().hydrating).toBe(false))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(reloaded.getSnapshot()).not.toHaveProperty("locallyCreatedSessionId")
  expect(api.archive).not.toHaveBeenCalled()
  expect(result.current.archiveStatus).toBe("unconfirmed")
  expect(result.current.conversations[0]).toMatchObject({ title: "original after reload", submissionUnconfirmed: true })
  expect(client.createCalls).toHaveLength(1)
  unmount(); reloaded.dispose()
})

it("a positive owner snapshot restores real archive checks even while the exact submission remains unresolved", async () => {
  const storage = createMemoryStorage<ConversationStore>()
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const original = createSessionEngine({ client, storage, submissionRecovery: journal() })
  original.submit("still unresolved"); original.dispose()
  const id = storage.read()!.activeId
  client.nextSnapshot = async () => makeSnapshot({ sessionId: id })
  const reloaded = createSessionEngine({ client, storage, submissionRecovery: journal() })
  const { result, unmount } = renderHook(() => useList(reloaded))
  await waitFor(() => expect(reloaded.getSnapshot().hydrating).toBe(false))
  await waitFor(() => expect(result.current.archiveStatus).toBe("missing"))
  expect(api.archive).toHaveBeenCalledTimes(1)
  expect(result.current.archiveStateError).toBe(true)
  expect(result.current.conversations).toEqual([])
  expect(reloaded.getSnapshot().hasPendingSubmission).toBe(true)
  unmount(); reloaded.dispose()
})

it("an exact create receipt resumes archive checks without waiting for list projection", async () => {
  let accept!: (receipt: {run_id: string; user_message_id: string; assistant_message_id: string}) => void
  const client = createFakeClient(); client.nextCreate = () => new Promise(resolve => { accept = resolve })
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: journal() })
  engine.submit("first message")
  const { result, unmount } = renderHook(() => useList(engine))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(api.archive).not.toHaveBeenCalled()
  await act(async () => { accept({ run_id: "run_1", user_message_id: "u_1", assistant_message_id: "a_1" }); await settle() })
  await waitFor(() => expect(result.current.archiveStatus).toBe("missing"))
  expect(api.archive).toHaveBeenCalledTimes(1)
  expect(result.current.conversations).toEqual([])
  unmount(); engine.dispose()
})

it("keeps positive list evidence across A→B→A and observes A's later owner404", async () => {
  const client = createFakeClient(); client.nextCreate = () => new Promise(() => {})
  const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(), submissionRecovery: journal() })
  engine.submit("unresolved A")
  const id = engine.getSnapshot().store!.activeId
  api.list.mockResolvedValue({ sessions: [{ session_id: id, title: "accepted A" }], next_cursor: null })
  const { result, rerender, unmount } = renderHook(({ activeId }) => useConversationList({ engine, activeId, thread: engine.getSnapshot().thread,
    isStreaming: true, readBoundary: { identity: "alice", admitted: true } }), { initialProps: { activeId: id } })
  await waitFor(() => expect(result.current.archiveStatus).toBe("unarchived"))
  expect(engine.getSnapshot()).not.toHaveProperty("locallyCreatedSessionId")
  rerender({ activeId: "conversation-B" })
  await waitFor(() => expect(result.current.archiveStatus).toBe("missing"))
  api.list.mockResolvedValue({ sessions: [], next_cursor: null })
  act(() => result.current.refresh())
  await waitFor(() => expect(result.current.loading).toBe(false))
  rerender({ activeId: id })
  await waitFor(() => expect(result.current.archiveStatus).toBe("missing"))
  expect(result.current.archiveStateError).toBe(true)
  expect(result.current.conversations).toEqual([])
  unmount(); engine.dispose()
})
