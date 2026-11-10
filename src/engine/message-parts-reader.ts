// One bounded read episode; no command recovery, background polling, or cursor arithmetic.
import type { UIMessageChunk } from "ai"
import { messagePartsPageSchema, type MessagePart, type MessagePartsPage, type MessageTextPartSlice } from "@/contract/chat"
import type { SessionClient } from "./client"
import { SessionClientError } from "./client-error"
import type { SessionScope } from "./session-scope"

const MAX_BYTES = 1_048_576
export async function readPartsJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new SessionClientError("parse", "Message parts require JSON")
  const declared = response.headers.get("content-length")
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || BigInt(declared) > BigInt(MAX_BYTES))) throw new SessionClientError("parse", "Message parts response exceeds budget")
  if (!response.body) throw new SessionClientError("parse", "Message parts body absent")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
  const abort = () => { void reader.cancel().catch(() => undefined); rejectAbort(new SessionClientError("network", "Message parts read retired")) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    if (signal.aborted) abort()
    for (;;) {
      const chunk = await Promise.race([reader.read(), aborted])
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) throw new SessionClientError("parse", "Message parts response exceeds budget")
      chunks.push(chunk.value)
    }
    if (signal.aborted) throw new SessionClientError("network", "Message parts read retired")
    if (declared !== null && bytes !== Number(declared)) throw new SessionClientError("parse", "Message parts response incomplete")
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown
  } catch (error) {
    if (error instanceof SessionClientError) throw error
    throw new SessionClientError("parse", "Invalid complete message parts response")
  } finally {
    signal.removeEventListener("abort", abort)
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export type MessagePartsRead = Omit<MessagePartsPage, "items" | "next_cursor"> & { items: MessagePart[] }
/** Captured by the trusted browser admission owner before the first page GET. */
export type MessagePartsReadRecheck = (signal: AbortSignal) => Promise<boolean>

// One local SDK stream per validated owner text slot, never a network transport.
function openTextSlot(readUIMessageStream: typeof import("ai").readUIMessageStream, requireCurrent: () => void) {
  let input!: ReadableStreamDefaultController<UIMessageChunk>
  let inputOpen = true
  const stream = new ReadableStream<UIMessageChunk>({
    start: controller => { input = controller },
    cancel: () => { inputOpen = false },
  })
  const reader = readUIMessageStream({ stream, terminateOnError: true }).getReader()
  const closeInput = () => {
    if (!inputOpen) return
    inputOpen = false
    input.close()
  }
  // The reader is already scoped to this one slot; the SDK ID is not an owner identifier.
  const id = "text"
  input.enqueue({ type: "text-start", id })
  const readText = async () => {
    const { done, value } = await reader.read()
    requireCurrent()
    if (done || value.parts.length !== 1 || value.parts[0]?.type !== "text") throw new Error("Expected one SDK text part")
    return value.parts[0].text
  }
  let started = false, reachedEof = false, closing = false
  return {
    async append(slice: MessageTextPartSlice): Promise<string> {
      try {
        if (!started) {
          await readText()
          started = true
        }
        input.enqueue({ type: "text-delta", id, delta: slice.text })
        const text = await readText()
        if (slice.end !== slice.total_scalars) return text
        input.enqueue({ type: "text-end", id })
        closeInput()
        const complete = await readText()
        if (!(await reader.read()).done) throw new Error("Expected SDK text EOF")
        reachedEof = true
        requireCurrent()
        return complete
      } catch {
        requireCurrent()
        throw new SessionClientError("parse", "Invalid SDK message text projection")
      }
    },
    close() {
      if (closing) return
      closing = true
      closeInput()
      if (reachedEof) { reader.releaseLock(); return }
      // The SDK closes its output after consuming input. Drain retired snapshots
      // to EOF rather than cancelling that output before the SDK can close it.
      void (async () => {
        try { while (!(await reader.read()).done) { /* Discard retired snapshots. */ } }
        catch { /* The active read reports its parse error or retirement. */ }
        finally { reader.releaseLock() }
      })()
    },
  }
}

export async function readMessageParts(args: {
  client: SessionClient; sessionId: string; messageId: string; runId: string; scope: SessionScope;
  recoverUnauthorized?: MessagePartsReadRecheck;
  cursor?: string; retainedPartIds?: readonly string[]; minimumRevision?: string; expected?: { final_segment_id?: string; revision: string; event_watermark: MessagePartsPage["event_watermark"] }; signal: AbortSignal; onProgress?: (read: MessagePartsRead) => void;
}): Promise<MessagePartsRead> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  args.signal.addEventListener("abort", abort, { once: true })
  const timeoutMs = 10_000
  const deadline = performance.now() + timeoutMs
  const timer = setTimeout(abort, timeoutMs)
  const retiredError = () => new SessionClientError("network", "Message parts read retired or timed out")
  const retired = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(retiredError()), { once: true }))
  const requireCurrent = () => {
    if (performance.now() >= deadline) abort()
    if (controller.signal.aborted) throw retiredError()
  }
  let activeText: ReturnType<typeof openTextSlot> | null = null
  const closeTextSlot = () => {
    activeText?.close()
    activeText = null
  }
  try {
    if (args.signal.aborted) abort()
    const read = async (): Promise<MessagePartsRead> => {
      let cursor = args.cursor, baseline: MessagePartsRead | undefined
      let recoverySpent = false
      let loadSdk: Promise<typeof import("ai")> | undefined
      const cursors = new Set<string>(), identities = new Set<string>()
      const slots = new Map<string, MessagePart>()
      let last: MessagePart | undefined
      for (;;) {
        requireCurrent()
        if (cursor !== undefined) {
          if (cursors.has(cursor)) throw new SessionClientError("parse", "Message parts cursor cycle")
          cursors.add(cursor)
        }
        const request = { sessionId: args.sessionId, messageId: args.messageId, ...(cursor === undefined ? {} : { cursor }), limit: 16, scope: args.scope, signal: controller.signal }
        let response: MessagePartsPage
        try { response = await args.client.fetchMessageParts(request) }
        catch (error) {
          if (controller.signal.aborted || recoverySpent || !(error instanceof SessionClientError) || error.reason !== "http" || error.status !== 401 || !args.recoverUnauthorized) throw error
          recoverySpent = true
          // Same read episode, scope and opaque cursor; the original timer also
          // bounds Product readmission. Never recover a command or a409 here.
          if (!await args.recoverUnauthorized(controller.signal)) throw error
          requireCurrent()
          response = await args.client.fetchMessageParts(request)
        }
        requireCurrent()
        const page = messagePartsPageSchema.parse(response)
        if (args.minimumRevision !== undefined && BigInt(page.revision) < BigInt(args.minimumRevision)) throw new SessionClientError("parse", "Message parts revision regressed")
        if (args.expected && (page.revision !== args.expected.revision || page.event_watermark !== args.expected.event_watermark || page.final_segment_id !== args.expected.final_segment_id)) throw new SessionClientError("parse", "Message parts snapshot binding mismatch")
        if (page.items.length > 16) throw new SessionClientError("parse", "Message parts page exceeds requested limit")
        if (page.session_id !== args.sessionId || page.message_id !== args.messageId || page.run_id !== args.runId) throw new SessionClientError("parse", "Message parts owner mismatch")
        if (baseline && (page.revision !== baseline.revision || page.event_watermark !== baseline.event_watermark || page.final_segment_id !== baseline.final_segment_id)) throw new SessionClientError("parse", "Message parts version mismatch")
        baseline ??= { ...(page.final_segment_id === undefined ? {} : { final_segment_id: page.final_segment_id }), session_id: page.session_id, message_id: page.message_id, run_id: page.run_id, format_version: page.format_version, revision: page.revision, event_watermark: page.event_watermark, items: [] }
        if (page.items.length === 0 && page.next_cursor !== null) throw new SessionClientError("parse", "Empty message parts continuation")
        for (const part of page.items) {
          const previous = slots.get(part.part_id)
          if (previous) {
            if (last?.part_id !== part.part_id || previous.kind !== "text" || part.kind !== "text" ||
              previous.segment_id !== part.segment_id || previous.first_sequence !== part.first_sequence || previous.latest_sequence !== part.latest_sequence ||
              previous.total_scalars !== part.total_scalars || previous.completed !== part.completed || previous.end !== part.offset || previous.end === previous.total_scalars) throw new SessionClientError("parse", "Noncontinuous message text slice")
          } else {
            if (last && (BigInt(last.first_sequence) >= BigInt(part.first_sequence) || (last.kind === "text" && last.end !== last.total_scalars))) throw new SessionClientError("parse", "Message parts slot order changed")
            if (part.kind === "text" && part.offset !== "0") throw new SessionClientError("parse", "Message text prefix missing")
            const identity = part.kind === "text" ? `text:${part.segment_id}` : `activity:${part.activity.activity_id}`
            if (identities.has(identity)) throw new SessionClientError("parse", "Duplicate message slot")
            identities.add(identity)
          }
          if (part.kind === "text") {
            if (activeText === null) {
              const { readUIMessageStream } = await (loadSdk ??= import("ai"))
              requireCurrent()
              activeText = openTextSlot(readUIMessageStream, requireCurrent)
            }
            last = { ...part, text: await activeText.append(part), offset: "0" }
            requireCurrent()
            if (part.end === part.total_scalars) closeTextSlot()
          } else last = part
          slots.set(part.part_id, last)
        }
        requireCurrent()
        baseline.items = [...slots.values()]
        args.onProgress?.({ ...baseline, items: [...baseline.items] })
        requireCurrent()
        if (page.next_cursor === null) {
          if (args.retainedPartIds?.some((id) => !slots.has(id))) throw new SessionClientError("parse", "Confirmed message slot missing from complete version")
          if (last?.kind === "text" && last.end !== last.total_scalars) throw new SessionClientError("parse", "Message text EOF incomplete")
          return baseline
        }
        cursor = page.next_cursor
      }
    }
    return await Promise.race([retired, read()])
  } finally {
    clearTimeout(timer); args.signal.removeEventListener("abort", abort); controller.abort()
    closeTextSlot()
  }
}
