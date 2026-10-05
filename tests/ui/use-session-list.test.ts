// 会话清单水合 hook：首页取数 / 复合游标翻页追加 / refreshSignal 变化重取首页 / 失败回错误态。
import { StrictMode, createElement, type ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionClient, SessionClientError, type SessionClient } from "@/engine/client"
import type { SessionEngine } from "@/engine/machine"
import { DIRECT_SESSION_SCOPE } from "@/engine/session-scope"
import { useSessionList } from "@/ui/rail/use-session-list"
import * as pageClients from "@/ui/shell/page-clients"
import { useConversationList } from "@/ui/shell/use-conversation-list"

function item(id: string, updatedAt: string) {
  return { session_id: id, title: `chat ${id}`, updated_at: updatedAt }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useSessionList", () => {
  it("shares an in-flight first-page request across StrictMode effect replay of the same hook", async () => {
    let resolve!: (value: { sessions: ReturnType<typeof item>[], next_cursor: string | null }) => void
    const firstPage = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: string | null }>(done => { resolve = done })
    const listSessions = vi.fn().mockReturnValue(firstPage)
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const view = renderHook(() => useSessionList(client, 0), {
      wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children),
    })
    expect(listSessions).toHaveBeenCalledTimes(1)
    resolve({ sessions: [item("shared", "t1")], next_cursor: null })
    await waitFor(() => expect(view.result.current.entries).toHaveLength(1))
    view.unmount()
  })

  it("hydrates the first page and exposes hasMore from next_cursor", async () => {
    const listSessions = vi
      .fn()
      .mockResolvedValue({ sessions: [item("a", "2026-07-13T00:00:00Z")], next_cursor: "cur_2" })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result } = renderHook(() => useSessionList(client, 0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0]).toEqual({ id: "a", title: "chat a", updatedAt: "2026-07-13T00:00:00Z" })
    expect(result.current.hasMore).toBe(true)
  })

  it("appends the next page on loadMore and stops when the cursor runs out", async () => {
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: [item("a", "t1")], next_cursor: "cur_2" })
      .mockResolvedValueOnce({ sessions: [item("b", "t2")], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result } = renderHook(() => useSessionList(client, 0))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    expect(result.current.entries.map((e) => e.id)).toEqual(["a", "b"])
    expect(result.current.hasMore).toBe(false)
    expect(listSessions).toHaveBeenNthCalledWith(2, "cur_2", DIRECT_SESSION_SCOPE)
  })

  it("refetches the first page when refreshSignal changes", async () => {
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: [item("a", "t1")], next_cursor: null })
      .mockResolvedValueOnce({ sessions: [item("a", "t1"), item("c", "t3")], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result, rerender } = renderHook(
      ({ signal }: { signal: number }) => useSessionList(client, signal),
      { initialProps: { signal: 0 } },
    )
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    rerender({ signal: 1 })
    await waitFor(() => expect(result.current.entries).toHaveLength(2))
  })

  it("starts a distinct refreshed GET while the pre-refresh first page is still pending", async () => {
    let resolveOld!: (value: { sessions: ReturnType<typeof item>[], next_cursor: null }) => void
    const oldPage = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: null }>((resolve) => { resolveOld = resolve })
    const listSessions = vi.fn()
      .mockReturnValueOnce(oldPage)
      .mockResolvedValueOnce({ sessions: [item("post-ack", "t2")], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const view = renderHook(
      ({ signal }: { signal: number }) => useSessionList(client, signal),
      { initialProps: { signal: 0 } },
    )
    expect(listSessions).toHaveBeenCalledTimes(1)

    view.rerender({ signal: 1 })
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.result.current.entries.map((entry) => entry.id)).toEqual(["post-ack"]))
    expect(view.result.current.settledFirstPage).toMatchObject({ refreshSignal: 1, success: true })

    await act(async () => { resolveOld({ sessions: [item("pre-ack", "t1")], next_cursor: null }); await oldPage })
    expect(view.result.current.entries.map((entry) => entry.id)).toEqual(["post-ack"])
    view.unmount()
  })

  it("does not share an explicit refresh promise across hook instances with the same signal", async () => {
    let resolveOld!: (value: { sessions: ReturnType<typeof item>[], next_cursor: null }) => void
    const oldRefresh = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: null }>((resolve) => { resolveOld = resolve })
    const listSessions = vi.fn()
      .mockReturnValueOnce(oldRefresh)
      .mockResolvedValueOnce({ sessions: [item("post-ack", "t2")], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const oldHook = renderHook(() => useSessionList(client, 1))
    expect(listSessions).toHaveBeenCalledTimes(1)

    const postAckHook = renderHook(() => useSessionList(client, 1))
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(postAckHook.result.current.entries.map((entry) => entry.id)).toEqual(["post-ack"]))
    expect(oldHook.result.current.loading).toBe(true)

    await act(async () => { resolveOld({ sessions: [item("pre-ack", "t1")], next_cursor: null }); await oldRefresh })
    oldHook.unmount()
    postAckHook.unmount()
  })

  it("surfaces an error state without throwing when the fetch fails", async () => {
    const listSessions = vi.fn().mockRejectedValue(new Error("boom"))
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result } = renderHook(() => useSessionList(client, 0))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.entries).toEqual([])
  })

  it("treats an owner-null cursor as a successful terminal empty page", async () => {
    const listSessions = vi.fn().mockResolvedValue({ sessions: [], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result } = renderHook(() => useSessionList(client, 0))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toEqual([])
    expect(result.current.error).toBe(false)
    expect(result.current.hasMore).toBe(false)
  })

  it("preserves an owner string cursor without treating an empty string as null", async () => {
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({ sessions: [], next_cursor: "" })
      .mockResolvedValueOnce({ sessions: [], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result } = renderHook(() => useSessionList(client, 0))
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    act(() => result.current.loadMore())
    await waitFor(() => expect(listSessions).toHaveBeenNthCalledWith(2, "", DIRECT_SESSION_SCOPE))
  })

  it("scope 切换时在新清单返回前不显示上一个 workspace 的会话", async () => {
    let resolveProject!: (value: { sessions: ReturnType<typeof item>[], next_cursor: null }) => void
    const projectPage = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: null }>((resolve) => {
      resolveProject = resolve
    })
    const listSessions = vi.fn()
      .mockResolvedValueOnce({ sessions: [item("direct-a", "t1")], next_cursor: null })
      .mockReturnValueOnce(projectPage)
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result, rerender } = renderHook(
      ({ scope }: { scope: typeof DIRECT_SESSION_SCOPE | { kind: "project"; projectRef: string } }) =>
        useSessionList(client, 0, scope),
      { initialProps: { scope: DIRECT_SESSION_SCOPE } },
    )
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    rerender({ scope: { kind: "project", projectRef: "project-a" } })
    expect(result.current.entries).toEqual([])
    resolveProject({ sessions: [item("project-a-task", "t2")], next_cursor: null })
    await waitFor(() => expect(result.current.entries.map((entry) => entry.id)).toEqual(["project-a-task"]))
  })

  it("scope 切换后旧 workspace 的 loadMore 回执不清空新清单", async () => {
    let resolveDirectMore!: (value: { sessions: ReturnType<typeof item>[], next_cursor: null }) => void
    const directMore = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: null }>((resolve) => {
      resolveDirectMore = resolve
    })
    const listSessions = vi.fn()
      .mockResolvedValueOnce({ sessions: [item("direct-a", "t1")], next_cursor: "direct-cursor" })
      .mockReturnValueOnce(directMore)
      .mockResolvedValueOnce({ sessions: [item("project-a", "t2")], next_cursor: null })
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const { result, rerender } = renderHook(
      ({ scope }: { scope: typeof DIRECT_SESSION_SCOPE | { kind: "project"; projectRef: string } }) =>
        useSessionList(client, 0, scope),
      { initialProps: { scope: DIRECT_SESSION_SCOPE } },
    )
    await waitFor(() => expect(result.current.entries.map((entry) => entry.id)).toEqual(["direct-a"]))

    act(() => result.current.loadMore())
    rerender({ scope: { kind: "project", projectRef: "project-a" } })
    await waitFor(() => expect(result.current.entries.map((entry) => entry.id)).toEqual(["project-a"]))

    resolveDirectMore({ sessions: [item("direct-b", "t3")], next_cursor: null })
    await waitFor(() => expect(result.current.entries.map((entry) => entry.id)).toEqual(["project-a"]))
  })
})

describe("useConversationList rename reconciliation", () => {
  const engine = {} as SessionEngine
  const thread = { messages: [] } as never
  const focusComposer = () => undefined

  it("serializes one session's intents and keeps the latest overlay until a post-ACK owner GET completes", async () => {
    let resolveFirstRename!: () => void
    let resolveSecondRename!: () => void
    let resolveReconcile!: (page: { sessions: ReturnType<typeof item>[], next_cursor: null }) => void
    const firstRename = new Promise<{ ok: true }>((resolve) => { resolveFirstRename = () => resolve({ ok: true }) })
    const secondRename = new Promise<{ ok: true }>((resolve) => { resolveSecondRename = () => resolve({ ok: true }) })
    const reconcile = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: null }>((resolve) => { resolveReconcile = resolve })
    const listSessions = vi.fn()
      .mockResolvedValueOnce({ sessions: [item("same", "t1")], next_cursor: null })
      .mockReturnValueOnce(reconcile)
    const renameSession = vi.fn()
      .mockReturnValueOnce(firstRename)
      .mockReturnValueOnce(secondRename)
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const view = renderHook(() => useConversationList({ engine, activeId: null, thread, isStreaming: false, focusComposer }))
    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("chat same"))

    act(() => {
      view.result.current.renameConversation("same", "A")
      view.result.current.renameConversation("same", "B")
    })
    expect(renameSession).toHaveBeenCalledTimes(1)
    expect(renameSession).toHaveBeenNthCalledWith(1, "same", "A")
    expect(view.result.current.conversations[0]?.title).toBe("B")

    await act(async () => { resolveFirstRename(); await firstRename })
    await waitFor(() => expect(renameSession).toHaveBeenCalledTimes(2))
    expect(renameSession).toHaveBeenNthCalledWith(2, "same", "B")
    expect(listSessions).toHaveBeenCalledTimes(1)

    await act(async () => { resolveSecondRename(); await secondRename })
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))
    expect(view.result.current.conversations[0]?.title).toBe("B")

    await act(async () => {
      resolveReconcile({ sessions: [{ ...item("same", "t2"), title: "Canonical C" }], next_cursor: null })
      await reconcile
    })
    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("Canonical C"))
    view.unmount()
  })

  it("does not let an earlier rejection roll back a later queued intent", async () => {
    let rejectFirstRename!: (error: Error) => void
    let resolveSecondRename!: () => void
    const firstRename = new Promise<{ ok: true }>((_resolve, reject) => { rejectFirstRename = reject })
    const secondRename = new Promise<{ ok: true }>((resolve) => { resolveSecondRename = () => resolve({ ok: true }) })
    const listSessions = vi.fn().mockResolvedValue({ sessions: [item("same", "t1")], next_cursor: null })
    const renameSession = vi.fn()
      .mockReturnValueOnce(firstRename)
      .mockReturnValueOnce(secondRename)
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const view = renderHook(() => useConversationList({ engine, activeId: null, thread, isStreaming: false, focusComposer }))
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1))

    act(() => {
      view.result.current.renameConversation("same", "A")
      view.result.current.renameConversation("same", "B")
    })
    await act(async () => { rejectFirstRename(new Error("late A")); await firstRename.catch(() => undefined) })
    await waitFor(() => expect(renameSession).toHaveBeenCalledTimes(2))
    expect(view.result.current.conversations[0]?.title).toBe("B")
    await act(async () => { resolveSecondRename(); await secondRename })
    view.unmount()
  })

  it("ignores an old committed lifecycle ACK after direct to project to direct", async () => {
    let resolveRename!: () => void
    const rename = new Promise<{ ok: true }>((resolve) => { resolveRename = () => resolve({ ok: true }) })
    const listSessions = vi.fn().mockResolvedValue({ sessions: [item("same", "t1")], next_cursor: null })
    const renameSession = vi.fn().mockReturnValue(rename)
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const projectScope = { kind: "project" as const, projectRef: "project-a" }
    const view = renderHook(
      ({ scope }: { scope: typeof DIRECT_SESSION_SCOPE | typeof projectScope }) =>
        useConversationList({ engine, activeId: null, thread, isStreaming: false, focusComposer, scope }),
      { initialProps: { scope: DIRECT_SESSION_SCOPE } },
    )
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1))
    act(() => view.result.current.renameConversation("same", "Old lifecycle"))
    expect(view.result.current.conversations[0]?.title).toBe("Old lifecycle")

    view.rerender({ scope: projectScope })
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))
    view.rerender({ scope: DIRECT_SESSION_SCOPE })
    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("chat same"))

    await act(async () => { resolveRename(); await rename })
    await act(async () => { await Promise.resolve() })
    expect(listSessions).toHaveBeenCalledTimes(3)
    expect(view.result.current.conversations[0]?.title).toBe("chat same")
    view.unmount()
  })

  it("reconciles after A commits even when queued B fails", async () => {
    let resolveA!: () => void
    let rejectB!: (error: Error) => void
    const renameA = new Promise<{ ok: true }>((resolve) => { resolveA = () => resolve({ ok: true }) })
    const renameB = new Promise<{ ok: true }>((_resolve, reject) => { rejectB = reject })
    const listSessions = vi.fn()
      .mockResolvedValueOnce({ sessions: [item("same", "t1")], next_cursor: null })
      .mockResolvedValueOnce({ sessions: [{ ...item("same", "t2"), title: "Canonical A" }], next_cursor: null })
    const renameSession = vi.fn().mockReturnValueOnce(renameA).mockReturnValueOnce(renameB)
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const view = renderHook(() => useConversationList({ engine, activeId: null, thread, isStreaming: false, focusComposer }))
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1))
    act(() => {
      view.result.current.renameConversation("same", "A")
      view.result.current.renameConversation("same", "B")
    })
    await act(async () => { resolveA(); await renameA })
    await waitFor(() => expect(renameSession).toHaveBeenCalledTimes(2))
    await act(async () => { rejectB(new Error("B failed")); await renameB.catch(() => undefined) })

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("Canonical A"))
    view.unmount()
  })

  it("does not resurrect a reconciled overlay after a later owner GET fails", async () => {
    let resolveRename!: () => void
    const rename = new Promise<{ ok: true }>((resolve) => { resolveRename = () => resolve({ ok: true }) })
    const listSessions = vi.fn()
      .mockResolvedValueOnce({ sessions: [item("same", "t1")], next_cursor: null })
      .mockResolvedValueOnce({ sessions: [{ ...item("same", "t2"), title: "Canonical C" }], next_cursor: null })
      .mockRejectedValueOnce(new Error("later owner read failed"))
    const renameSession = vi.fn().mockReturnValue(rename)
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const canonicalThread = { messages: [{ id: "message", role: "user", parts: [] }], meta: { title: "Canonical C" } } as never
    const view = renderHook(() => useConversationList({ engine, activeId: "same", thread: canonicalThread, isStreaming: false, focusComposer }))
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1))
    act(() => view.result.current.renameConversation("same", "Optimistic B"))
    await act(async () => { resolveRename(); await rename })
    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("Canonical C"))

    act(() => view.result.current.refresh())
    await waitFor(() => expect(view.result.current.error).toBe(true))
    expect(view.result.current.conversations[0]?.title).toBe("Canonical C")
    view.unmount()
  })

  it("reconciles from the owner after a final network failure may have lost its ACK", async () => {
    const listSessions = vi.fn()
      .mockResolvedValueOnce({ sessions: [item("same", "t1")], next_cursor: null })
      .mockResolvedValueOnce({ sessions: [{ ...item("same", "t2"), title: "Committed despite lost ACK" }], next_cursor: null })
    const renameSession = vi.fn().mockRejectedValueOnce(new SessionClientError("network", "socket closed"))
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const view = renderHook(() => useConversationList({ engine, activeId: null, thread, isStreaming: false, focusComposer }))
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1))
    act(() => view.result.current.renameConversation("same", "Optimistic title"))

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("Committed despite lost ACK"))
    expect(renameSession).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it("rolls back an explicit owner rejection without retrying PATCH or forcing reconciliation", async () => {
    const listSessions = vi.fn().mockResolvedValue({ sessions: [item("same", "t1")], next_cursor: null })
    const renameSession = vi.fn().mockRejectedValueOnce(
      new SessionClientError("http", "Title is too long", "title_too_long"),
    )
    vi.spyOn(pageClients, "browserListClient").mockReturnValue({ listSessions, renameSession } as never)
    const view = renderHook(() => useConversationList({ engine, activeId: null, thread, isStreaming: false, focusComposer }))
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1))
    act(() => view.result.current.renameConversation("same", "Rejected title"))

    await waitFor(() => expect(view.result.current.conversations[0]?.title).toBe("chat same"))
    expect(renameSession).toHaveBeenCalledTimes(1)
    expect(listSessions).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

describe("Project reads stay independent from conversation list/title state", () => {
  const alpha = { id: "project-A", name: "Canonical A", slug: "alpha", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const beta = { ...alpha, id: "project-B", name: "Canonical B", slug: "beta" }
  const envelope = (project: typeof alpha) => Response.json({ data: { project }, meta: { request_id: "req_detail" } })

  it("cancels A detail on A→B, rejects late A, and never reuses an earlier A generation on B→A", async () => {
    const { useProjectList } = await import("@/features/app/use-project-list")
    let resolveA: (response: Response) => void = () => { throw new Error("no pending A") }
    const signals: (AbortSignal | null | undefined)[] = []
    let listCalls = 0
    let aCalls = 0
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/hub/projects") {
        listCalls++
        return Response.json({ data: { projects: [] }, meta: { request_id: "req_list" } })
      }
      if (String(input) === "/api/hub/projects/project-A") {
        signals.push(init?.signal)
        aCalls++
        return new Promise<Response>((resolve) => { resolveA = resolve })
      }
      return envelope(beta)
    })
    const boundary = { admitted: true, subject: "reader", generation: 1 }
    const view = renderHook(({ id }) => useProjectList(false, boundary, id), { initialProps: { id: alpha.id } })
    await waitFor(() => expect(aCalls).toBe(1))
    view.rerender({ id: beta.id })
    expect(view.result.current.current.status).toBe("loading")
    expect(signals[0]?.aborted).toBe(true)
    await waitFor(() => expect(view.result.current.current).toEqual({ status: "ready", data: beta }))
    await act(async () => { resolveA(envelope(alpha)); await Promise.resolve() })
    expect(view.result.current.current).toEqual({ status: "ready", data: beta })
    view.rerender({ id: alpha.id })
    expect(view.result.current.current.status).toBe("loading")
    await waitFor(() => expect(aCalls).toBe(2))
    expect(listCalls).toBe(1)
    view.unmount()
    expect(signals[1]?.aborted).toBe(true)
    await act(async () => { resolveA(envelope(alpha)); await Promise.resolve() })
  })

  it("uses full collection facts for current detail without a second GET on project selection", async () => {
    const { useProjectList } = await import("@/features/app/use-project-list")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { projects: [alpha, beta] }, meta: { request_id: "req_list" } }))
    const boundary = { admitted: true, subject: "reader", generation: 1 }
    const view = renderHook(({ id }) => useProjectList(false, boundary, id), { initialProps: { id: alpha.id } })
    await waitFor(() => expect(view.result.current.current).toEqual({ status: "ready", data: alpha }))
    view.rerender({ id: beta.id })
    expect(view.result.current.current).toEqual({ status: "ready", data: beta })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it("revokes a healthy old user's collection before admitting a different identity and ignores its pending refresh", async () => {
    const { useProjectList } = await import("@/features/app/use-project-list")
    let resolveOld: (response: Response) => void = () => { throw new Error("no pending old user") }
    let calls = 0
    const signals: (AbortSignal | null | undefined)[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      calls++
      signals.push(init?.signal)
      if (calls === 2) return new Promise<Response>((resolve) => { resolveOld = resolve })
      return Response.json({ data: { projects: [calls === 1 ? alpha : beta] }, meta: { request_id: "req_identity" } })
    })
    const view = renderHook(({ boundary }) => useProjectList(false, boundary, alpha.id), {
      initialProps: { boundary: { admitted: true, subject: "old-reader", generation: 1 } },
    })
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [alpha] }))
    act(() => view.result.current.refresh())
    await waitFor(() => expect(calls).toBe(2))
    view.rerender({ boundary: { admitted: false, subject: "", generation: 2 } })
    expect(view.result.current.list.status).toBe("blocked")
    expect(view.result.current.current.status).toBe("blocked")
    expect(signals[1]?.aborted).toBe(true)
    await act(async () => { resolveOld(Response.json({ data: { projects: [alpha] }, meta: { request_id: "req_old" } })); await Promise.resolve() })
    expect(view.result.current.list.status).toBe("blocked")
    expect(calls).toBe(2)
    view.rerender({ boundary: { admitted: true, subject: "new-reader", generation: 3 } })
    await waitFor(() => expect(view.result.current.list).toEqual({ status: "ready", data: [beta] }))
    view.unmount()
  })
})

it.each([401, 403, 404, 503])("a deep-link detail HTTP %s clears the earlier canonical detail without a fake name", async (status) => {
  const { useProjectList } = await import("@/features/app/use-project-list")
  const alpha = { id: "detail-A", name: "Canonical A", slug: "a", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input) === "/api/hub/projects"
    ? Response.json({ data: { projects: [alpha] }, meta: { request_id: "req_list" } })
    : Response.json({ error: { code: "redacted" } }, { status }))
  const boundary = { admitted: true, subject: "detail-reader", generation: 1 }
  const view = renderHook(({ id }) => useProjectList(false, boundary, id), { initialProps: { id: alpha.id } })
  await waitFor(() => expect(view.result.current.current).toEqual({ status: "ready", data: alpha }))
  view.rerender({ id: "detail-B" })
  expect(view.result.current.current.status).toBe("loading")
  await waitFor(() => expect(view.result.current.current).toEqual({ status: "error", retryable: status === 503 }))
  expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(["/api/hub/projects", "/api/hub/projects/detail-B"])
  expect(view.result.current.list).toEqual(status === 401 || status === 403
    ? { status: "error", retryable: false } : { status: "ready", data: [alpha] })
  view.unmount()
})


it("rename refresh aborts the old generation, then reads frozen detail before list without a receipt projection", async () => {
  const { useProjectList } = await import("@/features/app/use-project-list")
  const id = "project_12345678-1234-1234-1234-123456789abc"
  const old = { id, name: "Old", slug: "unchanged", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const fresh = { ...old, name: "Current B" }
  const calls: string[] = []
  const signals: (AbortSignal | null | undefined)[] = []
  let deliverOld: (response: Response) => void = () => { throw new Error("no old read") }
  let deliverDetail: (response: Response) => void = () => { throw new Error("no fresh detail") }
  let deliverList: (response: Response) => void = () => { throw new Error("no fresh list") }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push(String(input)); signals.push(init?.signal)
    if (calls.length === 1) return Response.json({ data: { projects: [old] }, meta: { request_id: "initial" } })
    if (calls.length === 2) return new Promise<Response>((resolve) => { deliverOld = resolve })
    if (String(input) === `/api/hub/projects/${id}`) return new Promise<Response>((resolve) => { deliverDetail = resolve })
    return new Promise<Response>((resolve) => { deliverList = resolve })
  })
  const boundary = { admitted: true, subject: "reader", generation: 1 }
  const view = renderHook(() => useProjectList(false, boundary, id))
  await waitFor(() => expect(view.result.current.current).toEqual({ status: "ready", data: old }))
  act(() => view.result.current.refresh())
  await waitFor(() => expect(calls).toHaveLength(2))
  let pending!: Promise<typeof fresh>
  act(() => { pending = view.result.current.refreshRenamedProject(id, new AbortController().signal) })
  expect(signals[1]?.aborted).toBe(true)
  expect(calls).toEqual(["/api/hub/projects", "/api/hub/projects", `/api/hub/projects/${id}`])
  await act(async () => { deliverOld(Response.json({ data: { projects: [old] }, meta: { request_id: "stale" } })); await Promise.resolve() })
  expect(view.result.current.list.status).toBe("loading")
  await act(async () => { deliverDetail(Response.json({ data: { project: fresh }, meta: { request_id: "detail" } })); await Promise.resolve() })
  await waitFor(() => expect(calls).toHaveLength(4))
  expect(view.result.current.current.status).toBe("loading")
  await act(async () => { deliverList(Response.json({ data: { projects: [fresh] }, meta: { request_id: "list" } })); await pending })
  expect(view.result.current.current).toEqual({ status: "ready", data: fresh })
  expect(view.result.current.list).toEqual({ status: "ready", data: [fresh] })
  expect(calls[3]).toBe("/api/hub/projects")
  view.unmount()
})

it("rename read-back subject/route generation discards held detail and never starts its list", async () => {
  const { useProjectList } = await import("@/features/app/use-project-list")
  const project = { id: "project_12345678-1234-1234-1234-123456789abc", name: "Old", slug: "same", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  let finish: (response: Response) => void = () => { throw new Error("no held detail") }
  let heldSignal: AbortSignal | null | undefined
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) === "/api/hub/projects") return Response.json({ data: { projects: [project] }, meta: { request_id: "list" } })
    heldSignal = init?.signal
    return new Promise<Response>((resolve) => { finish = resolve })
  })
  const view = renderHook(({ boundary }) => useProjectList(false, boundary, project.id), { initialProps: { boundary: { admitted: true, subject: "old-reader", generation: 1 } } })
  await waitFor(() => expect(view.result.current.current.status).toBe("ready"))
  const pending = view.result.current.refreshRenamedProject(project.id, new AbortController().signal)
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  view.rerender({ boundary: { admitted: false, subject: "", generation: 2 } })
  expect(heldSignal?.aborted).toBe(true)
  await act(async () => { finish(Response.json({ data: { project: { ...project, name: "Late" } }, meta: { request_id: "late" } })); await rejected })
  expect(view.result.current.current.status).toBe("blocked")
  expect(fetchMock).toHaveBeenCalledTimes(2)
  view.unmount()
})


it.each(["unmount", "admission"] as const)("R254 %s退役首页后同scope新准入必须发新GET，迟到旧Response不进入新清单", async (boundary) => {
  const scope = { kind: "project" as const, projectRef: "project_retired_page" }
  let releaseOld!: (response: Response) => void
  const old = new Promise<Response>(resolve => { releaseOld = resolve })
  const response = (id: string) => Response.json({ sessions: [item(id, "2026-10-01T00:00:00Z")], next_cursor: null })
  const fetch = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(old).mockResolvedValue(response("fresh-owned-row"))
  const client = createSessionClient({ baseUrl: "http://s.local" })
  const useBoundSessionList = ({ admitted }: { admitted: boolean }) => useSessionList(client, 0, scope, undefined, { identity: "same-subject", admitted })
  const initialProps: { admitted: boolean } = { admitted: true }
  let view = renderHook(useBoundSessionList, { initialProps })
  try {
    expect(fetch).toHaveBeenCalledTimes(1)
    if (boundary === "unmount") {
      view.unmount()
      view = renderHook(useBoundSessionList, { initialProps })
    } else {
      view.rerender({ admitted: false })
      expect(view.result.current.entries).toEqual([])
      view.rerender({ admitted: true })
    }
    expect(fetch).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(view.result.current.entries.map(entry => entry.id)).toEqual(["fresh-owned-row"]))
    await act(async () => { releaseOld(response("retired-private-row")); await old })
    expect(view.result.current.entries.map(entry => entry.id)).toEqual(["fresh-owned-row"])
  } finally { releaseOld(response("retired-private-row")); view.unmount() }
})
