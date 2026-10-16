import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
const { list, revoke } = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn() }))
vi.mock("@/ui/settings/account-sessions-client", () => ({ listAccountSessions: list, revokeAccountSession: revoke, AccountSessionsError: class extends Error {} }))
import { useAccountSessions } from "@/ui/settings/use-account-sessions"
const sid = { session_id: "current", created_at: "2026-10-14T00:00:00.000Z", expires_at: "2026-10-15T00:00:00.000Z" }
const page = (ids = ["other"], cursor: string | null = null) => ({ data: { current_session: sid, sessions: ids.map((session_id) => ({ ...sid, session_id })) }, meta: { request_id: "id", next_cursor: cursor } })
const boundary = { admitted: true, subject: "alice", generation: 1 }
beforeEach(() => { list.mockReset().mockResolvedValue(page()); revoke.mockReset().mockResolvedValue({ data: { session_id: "other", revoked: true } }) })
afterEach(cleanup)
it("keeps current separate, confirms an ACK then reads owner facts again", async () => {
  const { result } = renderHook(() => useAccountSessions(true, false, boundary)); await waitFor(() => expect(result.current.phase).toBe("ready"))
  await act(async () => { await result.current.remove("current") }); expect(revoke).not.toHaveBeenCalled()
  list.mockResolvedValueOnce(page([])); await act(async () => { await result.current.remove("other") })
  expect(revoke).toHaveBeenCalledOnce(); expect(list).toHaveBeenCalledTimes(2); expect(result.current.others).toEqual([]); expect(result.current.notice).toBe("removed")
})
it("unknown write preserves the row and never automatically retries or reads", async () => {
  revoke.mockRejectedValueOnce(new Error("timeout")); const { result } = renderHook(() => useAccountSessions(true, false, boundary)); await waitFor(() => expect(result.current.phase).toBe("ready"))
  await act(async () => { await result.current.remove("other") }); expect(result.current.notice).toBe("unknown"); expect(result.current.others).toHaveLength(1); expect(list).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce()
  act(() => result.current.reload()); await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
})
it("retired generation aborts pending read and ignores late old data", async () => {
  let resolve!: (r: ReturnType<typeof page>) => void; list.mockReturnValueOnce(new Promise((r) => { resolve = r }))
  const { result, rerender } = renderHook(({ generation, admitted }) => useAccountSessions(true, false, { ...boundary, generation, admitted }), { initialProps: { generation: 1, admitted: true } })
  await waitFor(() => expect(list).toHaveBeenCalledOnce()); const signal = list.mock.calls[0]![0] as AbortSignal
  rerender({ generation: 2, admitted: false }); expect(signal.aborted).toBe(true); expect(result.current.current).toBeNull()
  await act(async () => resolve(page(["old"]))); expect(result.current.others).toEqual([])
  rerender({ generation: 2, admitted: true }); await waitFor(() => expect(result.current.phase).toBe("ready")); expect(result.current.others[0]?.session_id).toBe("other")
})
it("closing/unmount/preview retire reads and pending writes", async () => {
  const { result, rerender, unmount } = renderHook(({ open }) => useAccountSessions(open, false, boundary), { initialProps: { open: true } }); await waitFor(() => expect(result.current.phase).toBe("ready"))
  let resolve!: () => void; revoke.mockReturnValueOnce(new Promise<void>((r) => { resolve = r })); let pending!: Promise<void>
  act(() => { pending = result.current.remove("other") }); const signal = revoke.mock.calls[0]![1] as AbortSignal
  rerender({ open: false }); expect(signal.aborted).toBe(true); await act(async () => { resolve(); await pending }); expect(result.current.notice).toBeNull(); unmount()
  list.mockClear(); renderHook(() => useAccountSessions(true, true, boundary)); expect(list).not.toHaveBeenCalled()
})
it("shows partial data on page failure and rejects repeated IDs", async () => {
  list.mockResolvedValueOnce(page(["other"], "next")); const { result } = renderHook(() => useAccountSessions(true, false, boundary)); await waitFor(() => expect(result.current.phase).toBe("ready"))
  list.mockRejectedValueOnce(new Error("offline")); act(() => result.current.more()); await waitFor(() => expect(result.current.phase).toBe("error")); expect(result.current.others).toHaveLength(1)
  list.mockResolvedValueOnce(page(["other"])); act(() => result.current.more()); await waitFor(() => expect(result.current.phase).toBe("error")); expect(result.current.others).toHaveLength(1)
})

it("reopening starts a fresh read and cannot resurrect closed-session rows", async () => {
  const { result, rerender } = renderHook(({ open }) => useAccountSessions(open, false, boundary), { initialProps: { open: true } })
  await waitFor(() => expect(result.current.phase).toBe("ready"))
  rerender({ open: false }); expect(result.current.others).toEqual([])
  list.mockReturnValueOnce(new Promise(() => {})); rerender({ open: true })
  expect(result.current.others).toEqual([]); expect(result.current.current).toBeNull()
})
it("a repeated cross-page cursor fails without inventing a complete list", async () => {
  list.mockResolvedValueOnce(page(["one"], "cursor-one"))
  const { result } = renderHook(() => useAccountSessions(true, false, boundary)); await waitFor(() => expect(result.current.phase).toBe("ready"))
  list.mockResolvedValueOnce(page(["two"], "cursor-two")); act(() => result.current.more()); await waitFor(() => expect(result.current.others).toHaveLength(2))
  list.mockResolvedValueOnce(page(["three"], "cursor-one")); act(() => result.current.more()); await waitFor(() => expect(result.current.phase).toBe("error"))
  expect(result.current.others.map((item) => item.session_id)).toEqual(["one", "two"])
})
it.each(["success", "failure"])("unknown DELETE remains fenced after More %s without a second write", async (outcome) => {
  list.mockResolvedValueOnce(page(["other"], "next")); revoke.mockRejectedValueOnce(new Error("timeout"))
  const { result } = renderHook(() => useAccountSessions(true, false, boundary)); await waitFor(() => expect(result.current.phase).toBe("ready"))
  await act(async () => { await result.current.remove("other") }); expect(revoke).toHaveBeenCalledOnce()
  if (outcome === "success") list.mockResolvedValueOnce(page(["later"]))
  else list.mockRejectedValueOnce(new Error("read offline"))
  act(() => result.current.more()); await waitFor(() => expect(result.current.pending).toBe(false))
  await act(async () => { await result.current.remove("other") })
  expect(revoke).toHaveBeenCalledOnce()
  expect(result.current.reconciliationRequired).toBe(true)
})
it("unknown DELETE survives failed first-page reconciliation and only successful first page reopens writes", async () => {
  list.mockResolvedValueOnce(page(["other"], "next")); revoke.mockRejectedValueOnce(new Error("timeout"))
  const { result } = renderHook(() => useAccountSessions(true, false, boundary)); await waitFor(() => expect(result.current.phase).toBe("ready"))
  await act(async () => { await result.current.remove("other") })
  list.mockRejectedValueOnce(new Error("offline")); act(() => result.current.reload()); await waitFor(() => expect(result.current.phase).toBe("error"))
  expect(result.current.reconciliationRequired).toBe(true)
  await act(async () => { await result.current.remove("other") }); expect(revoke).toHaveBeenCalledOnce()
  list.mockResolvedValueOnce(page(["other"])); act(() => result.current.reload()); await waitFor(() => expect(result.current.phase).toBe("ready"))
  expect(result.current.reconciliationRequired).toBe(false)
  await act(async () => { await result.current.remove("other") }); expect(revoke).toHaveBeenCalledTimes(2)
})
