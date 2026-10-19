import { StrictMode, useLayoutEffect } from "react"
import { act, render, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createSessionStreamState } from "@/core/state"
import { DIRECT_SESSION_SCOPE, sessionScopeKey, type SessionScope } from "@/engine/session-scope"
import { useConversationReaders } from "@/ui/shell/use-conversation-readers"
import * as pageClients from "@/ui/shell/page-clients"
import { createFakeClient } from "../engine/fakes"

const project: SessionScope = { kind: "project", projectRef: "project-reader-a" }
const other: SessionScope = { kind: "project", projectRef: "project-reader-b" }
const thread = createSessionStreamState()
const revisions = new Map<string, number>()
const deleteConfirmed = vi.fn()
type Readers = ReturnType<typeof useConversationReaders>
let readers: Readers

function Harness({ scope = DIRECT_SESSION_SCOPE, identity = "subject-a:1", admitted = true }: {
  scope?: SessionScope; identity?: string; admitted?: boolean
}) {
  const current = useConversationReaders({
    engine: null, scope, activeId: null, thread, isStreaming: false,
    readBoundary: { identity, admitted }, scopeVersions: revisions,
    onDeleteConfirmed: deleteConfirmed,
  })
  useLayoutEffect(() => { readers = current })
  return <StrictMode>{current.hosts}</StrictMode>
}

afterEach(() => { vi.restoreAllMocks(); deleteConfirmed.mockClear() })

it("keeps an off-scope DELETE flight through entry and departure, reconciling only its source", async () => {
  let committed = false
  let acknowledge!: () => void
  const client = createFakeClient()
  const listSessions = vi.fn<typeof client.listSessions>(async (_cursor, scope) => ({
    sessions: committed && sessionScopeKey(scope ?? DIRECT_SESSION_SCOPE) === sessionScopeKey(project) ? [] : [{
      session_id: "same-id", title: sessionScopeKey(scope ?? DIRECT_SESSION_SCOPE), updated_at: "2026-10-15T00:00:00Z",
    }], next_cursor: null,
  }))
  const deleteSession = vi.fn<typeof client.deleteSession>(() => new Promise((resolve) => {
    acknowledge = () => { committed = true; resolve({ status: "deleted" }) }
  }))
  vi.spyOn(pageClients, "browserListClient").mockReturnValue({ ...client, listSessions, deleteSession })
  const view = render(<Harness />)
  try {
    act(() => { readers.ensureScope(project); readers.ensureScope(other) })
    await waitFor(() => expect(readers.read(project)?.conversations).toHaveLength(1))
    await waitFor(() => expect(readers.read(other)?.conversations).toHaveLength(1))
    let deletion!: Promise<boolean>
    act(() => { deletion = readers.read(project)!.deleteConversation("same-id") })
    expect(deleteSession).toHaveBeenCalledWith("same-id", project, expect.any(AbortSignal))
    view.rerender(<Harness scope={project} />)
    view.rerender(<Harness scope={other} />)
    expect(deleteSession.mock.calls[0]?.[2]?.aborted).toBe(false)
    await act(async () => { acknowledge(); expect(await deletion).toBe(true) })
    await waitFor(() => expect(readers.read(project)?.conversations).toEqual([]))
    expect(readers.read(other)?.conversations[0]?.title).toBe(sessionScopeKey(other))
    expect(readers.read(DIRECT_SESSION_SCOPE)?.conversations[0]?.title).toBe("direct")
    expect(deleteConfirmed).toHaveBeenCalledExactlyOnceWith(project, "same-id")
    expect(listSessions.mock.calls.filter(([, scope]) => sessionScopeKey(scope ?? DIRECT_SESSION_SCOPE) !== sessionScopeKey(project))).toHaveLength(2)
  } finally { view.unmount() }
})

it.each(["subject", "generation", "admission"] as const)("retires old facts and pending rename ACKs immediately on %s change", async (boundary) => {
  let currentIdentity = true
  let acknowledge!: () => void
  const client = createFakeClient()
  const listSessions = vi.fn<typeof client.listSessions>(async () => currentIdentity
    ? { sessions: [{ session_id: "old-id", title: "old private title", updated_at: "2026-10-15T00:00:00Z" }], next_cursor: null }
    : new Promise(() => {}))
  const renameSession = vi.fn<typeof client.renameSession>(() => new Promise((resolve) => {
    acknowledge = () => resolve({ ok: true })
  }))
  vi.spyOn(pageClients, "browserListClient").mockReturnValue({ ...client, listSessions, renameSession })
  const view = render(<Harness />)
  try {
    act(() => { readers.ensureScope(project) })
    await waitFor(() => expect(readers.read(project)?.conversations).toHaveLength(1))
    act(() => { readers.read(project)!.renameConversation("old-id", "old optimistic title") })
    const before = listSessions.mock.calls.length
    currentIdentity = false
    view.rerender(<Harness identity={boundary === "subject" ? "subject-b:1" : boundary === "generation" ? "subject-a:2" : "subject-a:1"} admitted={boundary !== "admission"} />)
    expect(readers.read(project)?.conversations ?? []).toEqual([])
    expect(readers.read(DIRECT_SESSION_SCOPE)?.conversations ?? []).toEqual([])
    const after = listSessions.mock.calls.length
    expect(after).toBe(before + (boundary === "admission" ? 0 : 1))
    await act(async () => { acknowledge() })
    expect(listSessions).toHaveBeenCalledTimes(after)
    expect(readers.read(project)?.conversations ?? []).toEqual([])
  } finally { view.unmount() }
})

it("does not queue a renewed identity's rename behind a retired identity's pending command", async () => {
  let acknowledgeOld!: () => void
  const client = createFakeClient()
  const listSessions = vi.fn<typeof client.listSessions>(async () => ({
    sessions: [{ session_id: "same-id", title: "canonical", updated_at: "2026-10-15T00:00:00Z" }], next_cursor: null,
  }))
  const renameSession = vi.fn<typeof client.renameSession>()
    .mockImplementationOnce(() => new Promise((resolve) => { acknowledgeOld = () => resolve({ ok: true }) }))
    .mockResolvedValue({ ok: true })
  vi.spyOn(pageClients, "browserListClient").mockReturnValue({ ...client, listSessions, renameSession })
  const view = render(<Harness />)
  try {
    await waitFor(() => expect(readers.read(DIRECT_SESSION_SCOPE)?.conversations).toHaveLength(1))
    act(() => { readers.read(DIRECT_SESSION_SCOPE)!.renameConversation("same-id", "old intent") })
    view.rerender(<Harness identity="subject-b:1" />)
    await waitFor(() => expect(readers.read(DIRECT_SESSION_SCOPE)?.conversations[0]?.title).toBe("canonical"))
    act(() => { readers.read(DIRECT_SESSION_SCOPE)!.renameConversation("same-id", "new intent") })
    expect(renameSession).toHaveBeenCalledTimes(2)
    await act(async () => { acknowledgeOld() })
    expect(renameSession).toHaveBeenCalledTimes(2)
  } finally { view.unmount() }
})
