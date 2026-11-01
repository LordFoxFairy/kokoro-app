import { scheduledRunsHeaders, scheduledRunsMaxBytes, scheduledRunsQuerySchema, scheduledRunsCursor, validateScheduledRunsPage, validateScheduledRunsError, type ScheduledRunsQuery } from "@/contract/scheduled-task-runs"
import { parseProjectRenameJson } from "@/contract/project-rename"
import type { ScheduledTaskRunsReader } from "../model/scheduled-task-run"

export class ScheduledTaskRunsError extends Error {
 constructor(readonly code: string) { super(code); this.name = "ScheduledTaskRunsError" }
}

/** One request, no implicit retry. Caller owns view qualification; this reader also retires admission changes. */
export function createScheduledTaskRunsReader(fetcher: typeof fetch, admission?: () => number | null): ScheduledTaskRunsReader {
 return async (input, signal) => {
  const query = scheduledRunsQuerySchema.parse(input)
  if (query.cursor) scheduledRunsCursor(query.cursor, query)
  const generation = admission?.()
  if (generation === null || generation !== undefined && (!Number.isSafeInteger(generation) || generation < 0)) throw new ScheduledTaskRunsError("session_invalid")
  const deadline = performance.now() + 15_000, controller = new AbortController()
  let retired = false, response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let fault = "network_error", interrupt: (reason: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject })
  const stop = () => {
   controller.abort()
   if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock() } catch {} reader = undefined }
   if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { fault = "request_aborted"; stop(); interrupt(new ScheduledTaskRunsError(fault)) }
  const timer = setTimeout(() => { fault = "request_timeout"; stop(); interrupt(new ScheduledTaskRunsError(fault)) }, 15_000)
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  const check = () => {
   if (signal.aborted) fault = "request_aborted"
   else if (performance.now() >= deadline) fault = "request_timeout"
   else if (admission && admission() !== generation) fault = "session_invalid"
   if (retired || controller.signal.aborted || signal.aborted || performance.now() >= deadline || admission && admission() !== generation) { stop(); throw new ScheduledTaskRunsError(fault) }
  }
  try {
   return await Promise.race([interrupted, readRunsPage({ fetcher, query, signal: controller.signal, check,
    response: value => { response = value; if (retired || controller.signal.aborted) stop() },
    reader: value => { reader = value } })])
  } finally { retired = true; clearTimeout(timer); signal.removeEventListener("abort", abort); stop() }
 }
}

type PageRead = Readonly<{
 fetcher: typeof fetch; query: ScheduledRunsQuery; signal: AbortSignal; check: () => void
 response: (value: Response) => void; reader: (value: ReadableStreamDefaultReader<Uint8Array> | undefined) => void
}>
async function readRunsPage(input: PageRead) {
 input.check()
 const params = new URLSearchParams({ limit: String(input.query.limit) })
 if (input.query.taskId !== undefined) params.set("task_id", input.query.taskId)
 if (input.query.cursor !== undefined) params.set("cursor", input.query.cursor)
 const fetcher = input.fetcher
 const response = await fetcher(`/api/scheduled-task-runs?${params}`, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: input.signal })
 input.response(response); input.check()
 if (!scheduledRunsHeaders(response.headers, response.status, "browser")) throw new ScheduledTaskRunsError("invalid_response")
 let size = 0, text = ""
 const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
 try {
  if (response.body) {
   const reader = response.body.getReader(); input.reader(reader)
   for (;;) {
    input.check(); const part = await reader.read(); input.check(); if (part.done) break
    size += part.value.byteLength
    if (size > scheduledRunsMaxBytes) throw new ScheduledTaskRunsError("invalid_response")
    text += decoder.decode(part.value, { stream: true })
   }
   text += decoder.decode(); reader.releaseLock(); input.reader(undefined)
  }
  const length = response.headers.get("content-length")
  if (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) !== size)) throw new Error("invalid_length")
  const raw = parseProjectRenameJson(text)
  input.check()
  if (response.status !== 200) throw new ScheduledTaskRunsError(validateScheduledRunsError(raw, response.status, true).error.code)
  const page = validateScheduledRunsPage(raw, input.query)
  return { items: page.items.map(item => ({ taskId: item.task_id, title: item.title, projectRef: item.project_ref, runId: item.run_id, triggerKind: item.trigger_kind, scheduledFor: item.scheduled_for, ...(item.trigger_kind === "rss" ? { observedAt: item.observed_at } : {}), state: item.state, terminalEventAt: item.terminal_event_at })), nextCursor: page.next_cursor }
 } catch (error) { input.check(); throw error instanceof ScheduledTaskRunsError ? error : new ScheduledTaskRunsError("invalid_response") }
}
