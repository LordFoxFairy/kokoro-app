import { randomUUID } from "node:crypto"
import { scheduledRunsBrowserCache, scheduledRunsHeaders, scheduledRunsMaxBytes, scheduledRunsCursor, scheduledRunsQuerySchema,
 validateScheduledRunsError, validateScheduledRunsPage, type ScheduledRunsQuery } from "@/contract/scheduled-task-runs"
import { parseProjectRenameJson } from "@/contract/project-rename"
import { oidcRpConfig } from "./oidc-provider"
import { productBffConfig, productBffHeaders } from "./product-bff"
import { currentProductSession, type ProductClaims } from "./product-session"
import { requestWithDomain } from "./upstream-http"

type RunsLifetime = Readonly<{
 request: Request; requestId: string; signal: AbortSignal; deadline: number
 check: () => void; read: (body: ReadableStream<Uint8Array> | null, limit: number) => Promise<Uint8Array>
 response: (value: Response) => void; fail: (status: number, code: string) => Response
}>

function runsJson(value: unknown, status: number, headers: Record<string, string>): Response {
 const text = JSON.stringify(value)
 return new Response(text, { status, headers: { ...headers, "content-type": "application/json; charset=utf-8", "content-length": String(new TextEncoder().encode(text).byteLength) } })
}

/** One absolute deadline includes request EOF, both session admissions, and owner EOF. */
export async function scheduledTaskRuns(request: Request): Promise<Response> {
 const requestId = randomUUID(), deadline = performance.now() + 10_000, controller = new AbortController()
 const fail = (status: number, code: string) => runsJson({ error: { code, message: code, retryable: status >= 500 } }, status, { "cache-control": scheduledRunsBrowserCache, "x-request-id": requestId, ...(status === 405 ? { allow: "GET" } : {}) })
 let retired = false, fault = "invalid_response", response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
 let interrupt: (reason: Error) => void = () => {}
 const interrupted = new Promise<never>((_, reject) => { interrupt = reject })
 const stop = () => {
  controller.abort()
  if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock() } catch {} reader = undefined }
  if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
 }
 const abort = () => { fault = "request_aborted"; stop(); interrupt(new Error(fault)) }
 const timer = setTimeout(() => { fault = "request_timeout"; stop(); interrupt(new Error(fault)) }, 10_000)
 request.signal.addEventListener("abort", abort, { once: true })
 if (request.signal.aborted) abort()
 const check = () => {
  if (request.signal.aborted) fault = "request_aborted"
  else if (performance.now() >= deadline) fault = "request_timeout"
  if (retired || controller.signal.aborted || request.signal.aborted || performance.now() >= deadline) { stop(); throw new Error(fault) }
 }
 const read = async (body: ReadableStream<Uint8Array> | null, limit: number) => {
  const parts: Uint8Array[] = []; let count = 0
  if (body) {
   reader = body.getReader()
   for (;;) { check(); const part = await reader.read(); check(); if (part.done) break; count += part.value.byteLength; if (count > limit) throw new Error("too_large"); parts.push(part.value) }
   reader.releaseLock(); reader = undefined
  }
  const bytes = new Uint8Array(count); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return bytes
 }
 const currentFault = () => fault
 try { return await Promise.race([interrupted, serveRuns({ request, requestId, deadline, signal: controller.signal, check, read, fail, response: value => { response = value; if (retired || controller.signal.aborted) stop() } })]) }
 catch { const code = currentFault(); return fail(code === "request_timeout" ? 504 : code === "request_aborted" ? 499 : 502, code) }
 finally { retired = true; clearTimeout(timer); request.signal.removeEventListener("abort", abort); stop() }
}

function parseQuery(request: Request): ScheduledRunsQuery {
 const url = new URL(request.url), values: Record<string, string> = {}
 if (url.pathname !== "/api/scheduled-task-runs" || url.hash || url.href.endsWith("?")
  || ["transfer-encoding", "content-encoding", "idempotency-key"].some(name => request.headers.has(name))
  || request.headers.has("content-length") && request.headers.get("content-length") !== "0") throw new Error("invalid_request")
 for (const pair of url.search ? url.search.slice(1).split("&") : []) {
  const match = /^([^=]+)=([^=]*)$/u.exec(pair)
  if (!match) throw new Error("invalid_query")
  const key = decodeURIComponent(match[1]!.replace(/\+/gu, " ")), value = decodeURIComponent(match[2]!.replace(/\+/gu, " "))
  if (!["task_id", "limit", "cursor"].includes(key) || Object.hasOwn(values, key)) throw new Error("invalid_query")
  values[key] = value
 }
 if (values.limit !== undefined && !/^(?:[1-9][0-9]?|100)$/u.test(values.limit)) throw new Error("invalid_query")
 return scheduledRunsQuerySchema.parse({ limit: Number(values.limit ?? "20"), ...(values.task_id === undefined ? {} : { taskId: values.task_id }), ...(values.cursor === undefined ? {} : { cursor: values.cursor }) })
}
function sameSession(first: ProductClaims, latest: ProductClaims | null): boolean {
 return latest !== null && latest.accessExpiresAt > Date.now() && latest.expiresAt > Date.now()
  && (["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"] as const).every(key => first[key] === latest[key])
}
async function serveRuns(input: RunsLifetime): Promise<Response> {
 const { request, check, fail } = input
 check()
 if (request.method !== "GET") return fail(405, "scheduled_runs_method_not_allowed")
 const config = productBffConfig(), rp = oidcRpConfig(process.env)
 if (!config || !rp) return fail(503, "scheduled_runs_dependency_unavailable")
 const url = new URL(request.url), origin = new URL(config.session.webOrigin)
 if (url.protocol !== origin.protocol || request.headers.get("host") !== origin.host || request.headers.has("origin") && request.headers.get("origin") !== origin.origin) return fail(403, "session_forbidden")
 let query: ScheduledRunsQuery
 try { query = parseQuery(request); await input.read(request.body, 0); check() } catch { check(); return fail(400, "invalid_scheduled_runs_request") }
 let first: ProductClaims | null
 try { first = await currentProductSession(request, config.session) } catch { check(); return fail(503, "scheduled_runs_dependency_unavailable") }
 check()
 if (!first || first.accessExpiresAt <= Date.now() || first.expiresAt <= Date.now()) return fail(401, "session_invalid")
 const identity = { tenantId: rp.tenantId, subjectId: first.subject }
 try { if (query.cursor) scheduledRunsCursor(query.cursor, query, identity) } catch { return fail(400, "invalid_scheduled_runs_request") }
 const params = new URLSearchParams({ limit: String(query.limit) })
 if (query.taskId !== undefined) params.set("task_id", query.taskId)
 if (query.cursor !== undefined) params.set("cursor", query.cursor)
 let response: Response
 try {
  response = await requestWithDomain(`${config.bffBaseUrl}/v1/scheduled-task-runs?${params}`, config.domain, { method: "GET", headers: productBffHeaders(config, first, input.requestId), signal: input.signal, timeoutMs: Math.max(1, Math.ceil(input.deadline - performance.now())), maxResponseBytes: scheduledRunsMaxBytes })
  input.response(response)
 } catch { check(); return fail(503, "network_error") }
 check()
 if (!scheduledRunsHeaders(response.headers, response.status, "owner", input.requestId)) return fail(502, "invalid_response")
 let output: unknown
 try {
  const bytes = await input.read(response.body, scheduledRunsMaxBytes)
  check()
  const length = response.headers.get("content-length")
  if (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) !== bytes.length)) throw new Error("invalid_length")
  const raw = parseProjectRenameJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
  output = response.status === 200 ? { data: validateScheduledRunsPage(raw, query, identity) } : validateScheduledRunsError(raw, response.status)
 } catch { check(); return fail(502, "invalid_response") }
 let latest: ProductClaims | null
 try { latest = await currentProductSession(request, config.session) } catch { check(); return fail(503, "scheduled_runs_dependency_unavailable") }
 check()
 if (!sameSession(first, latest)) return fail(401, "session_invalid")
 const retry = response.headers.get("retry-after")
 return runsJson(output, response.status, { "cache-control": scheduledRunsBrowserCache, "x-request-id": input.requestId, ...(retry === null ? {} : { "retry-after": retry }) })
}
