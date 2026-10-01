// 会话清单水合 hook：首页取数 / 复合游标翻页追加 / refreshSignal 变化重取首页 / 失败回错误态。
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionClient } from "@/engine/client"
import { DIRECT_SESSION_SCOPE } from "@/engine/session-scope"
import { useSessionList } from "@/ui/rail/use-session-list"

function item(id: string, updatedAt: string) {
  return { session_id: id, title: `chat ${id}`, updated_at: updatedAt }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useSessionList", () => {
  it("shares an in-flight first-page request between concurrent mounts", async () => {
    let resolve!: (value: { sessions: ReturnType<typeof item>[], next_cursor: string | null }) => void
    const firstPage = new Promise<{ sessions: ReturnType<typeof item>[], next_cursor: string | null }>((done) => {
      resolve = done
    })
    const listSessions = vi.fn().mockReturnValue(firstPage)
    const client = { listSessions } as Pick<SessionClient, "listSessions">
    const first = renderHook(() => useSessionList(client, 0))
    const second = renderHook(() => useSessionList(client, 0))

    expect(listSessions).toHaveBeenCalledTimes(1)
    resolve({ sessions: [item("shared", "t1")], next_cursor: null })
    await waitFor(() => expect(first.result.current.entries).toHaveLength(1))
    await waitFor(() => expect(second.result.current.entries).toHaveLength(1))
    first.unmount()
    second.unmount()
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
