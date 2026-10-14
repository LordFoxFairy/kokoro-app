import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { listAccountSessions, revokeAccountSession } from "@/ui/settings/account-sessions-client"
const sid = { session_id: "current", created_at: "2026-10-14T00:00:00.000Z", expires_at: "2026-10-15T00:00:00.000Z" }
const page = () => ({ data: { current_session: sid, sessions: [{ ...sid, session_id: "other" }] }, meta: { request_id: "request-one", next_cursor: null } })
const response = (raw: unknown = page(), status = 200, extra: Record<string, string> = {}) => Response.json(raw, { status, headers: { "x-request-id": "request-one", "cache-control": "private, no-store", ...extra } })
const fetcher = vi.fn()
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset().mockResolvedValue(response()) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it("reads only the same-origin endpoint without credentials or owner URLs", async () => {
  const result = await listAccountSessions(new AbortController().signal, "opaque")
  expect(result.data.current_session.session_id).toBe("current")
  expect(fetcher.mock.calls[0]![0]).toBe("/api/account/sessions?limit=25&cursor=opaque")
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" })
  expect(fetcher.mock.calls[0]![1].headers).toEqual({ accept: "application/json" })
})
it.each([
  (raw: ReturnType<typeof page>) => ({ ...raw, token: "secret" }),
  (raw: ReturnType<typeof page>) => ({ ...raw, data: { ...raw.data, token: "secret" } }),
  (raw: ReturnType<typeof page>) => ({ ...raw, data: { ...raw.data, sessions: [{ ...sid, token: "secret" }] } }),
  (raw: ReturnType<typeof page>) => ({ ...raw, meta: { ...raw.meta, request_id: "wrong" } }),
  (raw: ReturnType<typeof page>) => ({ ...raw, data: { ...raw.data, sessions: [sid] } }),
  (raw: ReturnType<typeof page>) => ({ ...raw, data: { ...raw.data, sessions: [raw.data.sessions[0], raw.data.sessions[0]] } }),
  (raw: ReturnType<typeof page>) => ({ ...raw, data: { ...raw.data, sessions: [] }, meta: { ...raw.meta, next_cursor: "next" } }),
])("rejects malformed raw projection", async (mutate) => { fetcher.mockResolvedValueOnce(response(mutate(page()))); await expect(listAccountSessions(new AbortController().signal)).rejects.toBeDefined() })
it("requires matching true ACK and sends exactly one DELETE", async () => {
  fetcher.mockResolvedValueOnce(response({ data: { session_id: "other", revoked: true }, meta: { request_id: "request-one" } }))
  await revokeAccountSession("other", new AbortController().signal)
  expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0]![1].method).toBe("DELETE"); expect(fetcher.mock.calls[0]![1].body).toBeUndefined()
  fetcher.mockResolvedValueOnce(response({ data: { session_id: "wrong", revoked: true }, meta: { request_id: "request-one" } }))
  await expect(revokeAccountSession("other", new AbortController().signal)).rejects.toBeDefined()
})
it("keeps local and canonical errors closed by status", async () => {
  fetcher.mockResolvedValueOnce(response({ error: { code: "account_session_dependency_unavailable", message: "safe" }, meta: { request_id: "request-one" } }, 503))
  await expect(listAccountSessions(new AbortController().signal)).rejects.toMatchObject({ status: 503, code: "account_session_dependency_unavailable" })
  fetcher.mockResolvedValueOnce(response({ error: { code: "account_session_conflict", message: "safe" }, meta: { request_id: "request-one" } }, 403))
  await expect(listAccountSessions(new AbortController().signal)).rejects.toMatchObject({ status: 502 })
})
it("bounds a noncooperating DELETE fetch and cleans late body without retry", async () => {
  vi.useFakeTimers(); let resolve!: (r: Response) => void; fetcher.mockReturnValueOnce(new Promise<Response>((r) => { resolve = r }))
  const promise = revokeAccountSession("other", new AbortController().signal); const outcome = expect(promise).rejects.toMatchObject({ status: 503 })
  await vi.advanceTimersByTimeAsync(10000); await outcome; expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true)
  const cancel = vi.fn(); resolve(new Response(new ReadableStream({ cancel }))); await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalled()
})
it("actively releases an uncooperative body reader on browser abort", async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {})); const body = new ReadableStream({ pull: () => new Promise(() => {}), cancel })
  fetcher.mockResolvedValueOnce(new Response(body, { headers: { "x-request-id": "request-one", "content-type": "application/json", "cache-control": "no-store" } }))
  const control = new AbortController(); const promise = listAccountSessions(control.signal); const outcome = expect(promise).rejects.toBeDefined(); await Promise.resolve(); control.abort(); await outcome
  expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false)
})
it("rejects combined header/body bytes over one MiB and invalid Retry-After", async () => {
  fetcher.mockResolvedValueOnce(response({ ...page(), overflow: "x".repeat(1_048_576) })); await expect(listAccountSessions(new AbortController().signal)).rejects.toMatchObject({ status: 502 })
  fetcher.mockResolvedValueOnce(response(page(), 200, { "retry-after": "3" })); await expect(listAccountSessions(new AbortController().signal)).rejects.toMatchObject({ status: 502 })
})
