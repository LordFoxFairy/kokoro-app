import { afterEach, expect, it, vi } from "vitest"
import { createScheduledTaskClient, type ScheduledTaskClient } from "@/features/scheduled-tasks"
type Query = Readonly<{ limit: number; taskId?: string; cursor?: string }>
type Reader = (query: Query, signal: AbortSignal) => Promise<unknown>
const wire = { data: { items: [{ trigger_kind: "calendar" as const, task_id: "task-A", title: "原始标题", project_ref: null, run_id: "run-A", scheduled_for: "2026-10-21T23:30:00.123456789Z", state: "pending", terminal_event_at: null }], next_cursor: null } }
function reply(raw = JSON.stringify(wire), headers?: HeadersInit, status = 200) { return new Response(raw, { status, headers: { "content-type": "application/json", "cache-control": "private, no-store, max-age=0", "x-request-id": "request-A", ...Object.fromEntries(new Headers(headers)) } }) }
function read(fetcher: typeof fetch, query: Query = { limit: 20 }, signal = new AbortController().signal, admission?: () => number | null) {
 const client: ScheduledTaskClient & { listScheduledTaskRuns?: Reader } = createScheduledTaskClient(fetcher, admission)
 expect(client.listScheduledTaskRuns).toBeTypeOf("function")
 if (!client.listScheduledTaskRuns) throw new Error("Actual client has no run-read capability")
 return client.listScheduledTaskRuns(query, signal)
}
afterEach(() => vi.useRealTimers())
it("I4 browser exposes an actual same-origin read and maps only run metadata preserving nanoseconds", async () => {
 const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply())
 expect(await read(fetcher)).toEqual({ items: [{ triggerKind: "calendar" as const, taskId: "task-A", title: "原始标题", projectRef: null, runId: "run-A", scheduledFor: "2026-10-21T23:30:00.123456789Z", state: "pending", terminalEventAt: null }], nextCursor: null })
 expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/scheduled-task-runs?limit=20", { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) })
})
it.each(["no-store", "private, no-store", "private, no-store, max-age=1", ""])("I4 browser rejects noncanonical final cache %j", async cache => { await expect(read(vi.fn<typeof fetch>().mockResolvedValue(reply(undefined, { "cache-control": cache })))).rejects.toThrow() })
it.each(["location", "set-cookie", "content-encoding", "transfer-encoding"])("I4 browser rejects unsafe response %s", async key => { await expect(read(vi.fn<typeof fetch>().mockResolvedValue(reply(undefined, { [key]: "bad" })))).rejects.toThrow() })
it("I4 browser rejects a duplicate JSON key and mismatched selected task", async () => {
 await expect(read(vi.fn<typeof fetch>().mockResolvedValue(reply('{"data":{"items":[],"next_cursor":null},"data":{}}')))).rejects.toThrow()
 await expect(read(vi.fn<typeof fetch>().mockResolvedValue(reply()), { limit: 20, taskId: "task-B" })).rejects.toThrow()
})
it("I4 browser admission loss or generation change cannot issue or publish a read", async () => {
 const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply())
 await expect(read(fetcher, undefined, undefined, () => null)).rejects.toThrow()
 expect(fetcher).not.toHaveBeenCalled()
 let generation = 1
 const late = vi.fn<typeof fetch>().mockImplementation(async () => { generation = 2; return reply() })
 await expect(read(late, undefined, undefined, () => generation)).rejects.toThrow()
 expect(late).toHaveBeenCalledTimes(1)
})
it("I4 browser waits for actual EOF inside its single fifteen-second budget", async () => {
 vi.useFakeTimers()
 const cancel = vi.fn(() => new Promise<void>(() => undefined))
 const response = reply(); Object.defineProperty(response, "body", { value: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(wire))) }, cancel }) })
 const pending = read(vi.fn<typeof fetch>().mockResolvedValue(response)), assertion = expect(pending).rejects.toMatchObject({ code: "request_timeout" })
 await vi.advanceTimersByTimeAsync(15_001); await assertion; expect(cancel).toHaveBeenCalledTimes(1)
})
it("I4 browser cancellation bounds a noncooperative fetch and never retries automatically", async () => {
 const controller = new AbortController(), fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => undefined))
 const pending = read(fetcher, undefined, controller.signal), assertion = expect(pending).rejects.toMatchObject({ code: "request_aborted" })
 controller.abort(); await assertion; expect(fetcher).toHaveBeenCalledTimes(1)
})

it("I4 invokes the native-compatible fetch as a function without an arbitrary receiver", async () => {
 const fetcher = vi.fn<typeof fetch>(async function (this: unknown) {
  expect(this).toBeUndefined()
  return reply()
 })
 expect(await read(fetcher)).toMatchObject({ nextCursor: null })
 expect(fetcher).toHaveBeenCalledTimes(1)
})

it("I6 browser maps RSS discovery as observedAt with a null scheduledFor, without sorting by discovery", async () => {
 const common = { task_id: "feed-A", project_ref: null, trigger_kind: "rss", scheduled_for: null, state: "pending", terminal_event_at: null }
 const items = [{ ...common, title: "Owner first", run_id: "rss-1", observed_at: "2026-10-23T01:00:00Z" }, { ...common, title: "Owner second", run_id: "rss-2", observed_at: "2026-10-23T02:00:00.123456Z" }]
 const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(JSON.stringify({ data: { items, next_cursor: null } })))
 expect(await read(fetcher)).toEqual({ items: items.map(row => ({ taskId: row.task_id, title: row.title, projectRef: null, runId: row.run_id, triggerKind: "rss", scheduledFor: null, observedAt: row.observed_at, state: "pending", terminalEventAt: null })), nextCursor: null })
 expect(fetcher).toHaveBeenCalledTimes(1)
})
