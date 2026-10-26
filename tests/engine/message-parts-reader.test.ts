import { afterEach, describe, expect, it, vi } from "vitest"
import { readMessageParts, readPartsJson } from "@/engine/message-parts-reader"
import { SessionClientError } from "@/engine/client-error"
import { createFakeClient } from "./fakes"
import type { MessagePartsPage, MessageTextPartSlice } from "@/contract/chat"
const text = (patch: Partial<MessageTextPartSlice> = {}): MessageTextPartSlice => ({ kind: "text", part_id: "opaque:not-a-codec", segment_id: "public-segment", first_sequence: "1", latest_sequence: "7", text: "😀", offset: "0", end: "1", total_scalars: "2", completed: true, ...patch })
const page = (items: MessagePartsPage["items"], next_cursor: string | null = null): MessagePartsPage => ({ session_id: "s", message_id: "m", run_id: "r", format_version: 1, revision: "7", event_watermark: null, items, next_cursor })
afterEach(() => vi.useRealTimers())
describe("bounded message parts read", () => {
  it("continues scalar slices and forwards exact scope without decoding opaque IDs", async () => {
    const client = createFakeClient(), controller = new AbortController()
    client.nextParts = async (args) => args.cursor === "opaque-next" ? page([text({ text: "a", offset: "1", end: "2" })]) : page([text()], "opaque-next")
    const read = await readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "project", projectRef: "project" }, cursor: "opaque-initial", signal: controller.signal })
    expect(read.items).toHaveLength(1)
    expect(read.items[0]).toMatchObject({ text: "😀a", segment_id: "public-segment", part_id: "opaque:not-a-codec", end: "2" })
    expect(client.partsCalls.map((call) => [call.cursor, call.limit, call.scope])).toEqual([["opaque-initial", 16, { kind: "project", projectRef: "project" }], ["opaque-next", 16, { kind: "project", projectRef: "project" }]])
  })
  it.each(["gap", "EOF", "version", "owner", "cycle"])("rejects %s rather than succeeding with incomplete history", async (failure) => {
    const client = createFakeClient(); let count = 0
    client.nextParts = async () => {
      count += 1
      if (failure === "EOF") return page([text()])
      if (count === 1) return page([text()], "next")
      if (failure === "owner") return { ...page([]), message_id: "other" }
      if (failure === "version") return { ...page([]), revision: "8" }
      if (failure === "cycle") return page([text({ text: "a", offset: "1", end: "2" })], "next")
      return page([text({ text: "", offset: "2", end: "2" })])
    }
    await expect(readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, signal: new AbortController().signal })).rejects.toThrow()
  })
  it("does not retry a real changed-version response or dispatch commands", async () => {
    const client = createFakeClient()
    client.nextParts = async () => { throw new SessionClientError("http", "changed", "message_parts_changed", 409) }
    await expect(readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, signal: new AbortController().signal })).rejects.toMatchObject({ status: 409, code: "message_parts_changed" })
    expect(client.partsCalls).toHaveLength(1); expect(client.createCalls).toHaveLength(0)
  })
  it("recovers one admitted401 at the exact continuation cursor without losing its prefix", async () => {
    const client = createFakeClient(); let calls = 0
    const recoverUnauthorized = vi.fn(async () => true)
    client.nextParts = async () => {
      calls++
      if (calls === 1) return page([text()], "opaque-next")
      if (calls === 2) throw new SessionClientError("http", "unauthenticated", "unauthenticated", 401)
      return page([text({ text: "a", offset: "1", end: "2" })])
    }
    const result = await readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "project", projectRef: "project" }, signal: new AbortController().signal, recoverUnauthorized })
    expect(result.items[0]).toMatchObject({ text: "😀a" })
    expect(client.partsCalls.map(({ cursor, scope }) => [cursor, scope])).toEqual([[undefined, { kind: "project", projectRef: "project" }], ["opaque-next", { kind: "project", projectRef: "project" }], ["opaque-next", { kind: "project", projectRef: "project" }]])
    expect(recoverUnauthorized).toHaveBeenCalledTimes(1)
    expect(client.createCalls).toHaveLength(0)
  })
  it.each(["second401", "403", "parse401", "409", "denied"])("retains the actual %s error without a second auth episode", async failure => {
    const client = createFakeClient()
    const error = new SessionClientError(failure === "parse401" ? "parse" : "http", failure, failure === "409" ? "message_parts_changed" : "unauthenticated", failure === "403" ? 403 : failure === "409" ? 409 : 401)
    client.nextParts = async () => { throw error }
    const recoverUnauthorized = vi.fn(async () => failure !== "denied")
    await expect(readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, signal: new AbortController().signal, recoverUnauthorized })).rejects.toBe(error)
    expect(recoverUnauthorized).toHaveBeenCalledTimes(failure === "second401" || failure === "denied" ? 1 : 0)
    expect(client.partsCalls).toHaveLength(failure === "second401" ? 2 : 1)
  })
  it.each(["timeout", "cancel"])("includes auth recovery in its original absolute budget and rejects late %s", async kind => {
    vi.useFakeTimers(); const client = createFakeClient(), controller = new AbortController()
    let admit!: (accepted: boolean) => void
    const recoverUnauthorized = vi.fn((signal: AbortSignal) => { expect(signal.aborted).toBe(false); return new Promise<boolean>(resolve => { admit = resolve }) })
    client.nextParts = async () => { await new Promise(resolve => setTimeout(resolve, 6_000)); throw new SessionClientError("http", "unauthenticated", "unauthenticated", 401) }
    const pending = readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, signal: controller.signal, recoverUnauthorized })
    const rejected = expect(pending).rejects.toThrow("retired or timed out")
    await vi.advanceTimersByTimeAsync(9_000)
    if (kind === "cancel") controller.abort()
    else await vi.advanceTimersByTimeAsync(1_000)
    await rejected
    admit(true); await vi.advanceTimersByTimeAsync(0)
    expect(client.partsCalls).toHaveLength(1)
    expect(recoverUnauthorized.mock.calls[0]?.[0].aborted).toBe(true)
  })
  it("has one absolute deadline even when a client ignores cancellation", async () => {
    vi.useFakeTimers(); const client = createFakeClient()
    client.nextParts = () => new Promise(() => undefined)
    const pending = readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, signal: new AbortController().signal })
    const rejected = expect(pending).rejects.toThrow("timed out")
    await vi.advanceTimersByTimeAsync(10_000); await rejected
    expect(client.partsCalls[0]?.signal.aborted).toBe(true)
  })
  it("requires complete bounded UTF8 EOF and rejects invalid framing", async () => {
    for (const response of [new Response("{}", { headers: { "content-type": "application/json", "content-length": "3" } }), new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }), new Response("{}", { headers: { "content-type": "application/json", "content-length": "1048577" } })]) await expect(readPartsJson(response, new AbortController().signal)).rejects.toBeInstanceOf(SessionClientError)
    expect(await readPartsJson(new Response("{}", { headers: { "content-type": "application/json", "content-length": "2" } }), new AbortController().signal)).toEqual({})
  })
})

it("keeps a10s total across pages and preserves previously confirmed opaque slots", async () => {
  vi.useFakeTimers()
  const client = createFakeClient(); let pageNumber = 0
  client.nextParts = async () => { pageNumber += 1; await new Promise((resolve) => setTimeout(resolve, 6000)); return pageNumber === 1 ? page([text({ text: "a", total_scalars: "1" })], "next") : page([]) }
  const pending = readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, signal: new AbortController().signal })
  const rejected = expect(pending).rejects.toThrow("timed out")
  await vi.advanceTimersByTimeAsync(10_000); await rejected
  expect(client.partsCalls).toHaveLength(2)
  vi.useRealTimers()
  client.nextParts = async () => page([])
  await expect(readMessageParts({ client, sessionId: "s", messageId: "m", runId: "r", scope: { kind: "direct" }, retainedPartIds: ["already-confirmed-opaque"], signal: new AbortController().signal })).rejects.toThrow("slot missing")
})
