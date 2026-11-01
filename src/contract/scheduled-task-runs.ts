import { z } from "zod"
import { parseProjectRenameJson, projectRenameRetryAfterValid } from "./project-rename"

export const scheduledRunsMaxBytes = 1_048_576
export const scheduledRunsBrowserCache = "private, no-store, max-age=0"
const lossless = (text: string) => new TextDecoder().decode(new TextEncoder().encode(text)) === text
const id = z.string().min(1).refine(value => Array.from(value).length <= 255 && lossless(value))
function instant(value: string, precision: 3 | 9): boolean {
 const pattern = precision === 9 ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/u : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
 if (!pattern.test(value) || value.startsWith("0000")) return false
 const date = new Date(value)
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19)
}
const scheduledFor = z.string().refine(value => instant(value, 9))
const terminalAt = z.string().refine(value => instant(value, 3))
const observedAt = z.string().datetime({ offset: false }).refine(value => !value.startsWith("0000") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19))
const runCommon = {
 task_id: id, title: z.string().refine(lossless), project_ref: z.string().refine(lossless).nullable(), run_id: id,

 state: z.enum(["pending", "admission_unknown", "admitted", "dispatch_failed", "completed", "cancelled", "failed"]),
 terminal_event_at: terminalAt.nullable(),
}
export const scheduledRunItemSchema = z.union([
 z.object({ ...runCommon, trigger_kind: z.literal("calendar"), scheduled_for: scheduledFor }).strict(),
 z.object({ ...runCommon, trigger_kind: z.literal("rss"), scheduled_for: z.null(), observed_at: observedAt }).strict(),
]).refine(item => ["completed", "cancelled", "failed"].includes(item.state) === (item.terminal_event_at !== null))
export const scheduledRunsPageSchema = z.object({ data: z.object({ items: z.array(scheduledRunItemSchema).max(100), next_cursor: z.string().min(1).max(2048).nullable() }).strict() }).strict()
export const scheduledRunsQuerySchema = z.object({ limit: z.number().int().min(1).max(100), taskId: id.optional(), cursor: z.string().min(1).max(2048).optional() }).strict()
export type ScheduledRunsQuery = Readonly<z.infer<typeof scheduledRunsQuerySchema>>
const cursorSchema = z.object({ tenantId: z.string().min(1), subjectId: z.string().min(1), taskId: id.nullable(), limit: z.number().int().min(1).max(100),
 sort: z.literal("occurrence_order_key:C:desc,dispatch_id:C:desc"), orderKey: scheduledFor, dispatchId: z.string().min(1).max(1024).refine(lossless) }).strict()

/** Decode only the published opaque format. Scope checks do not grant authority. */
export function scheduledRunsCursor(value: string, query: ScheduledRunsQuery, identity?: Readonly<{ tenantId: string; subjectId: string }>) {
 if (value.length > 2048 || !/^str1_[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid_cursor")
 const encoded = value.slice(5), binary = atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/"))
 if (btoa(binary).replace(/=/gu, "").replace(/\+/gu, "-").replace(/\//gu, "_") !== encoded) throw new Error("invalid_cursor")
 const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
 const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
 const cursor = cursorSchema.parse(parseProjectRenameJson(text))
 if (cursor.taskId !== (query.taskId ?? null) || cursor.limit !== query.limit
  || identity && (cursor.tenantId !== identity.tenantId || cursor.subjectId !== identity.subjectId)) throw new Error("invalid_cursor_scope")
 return cursor
}

export function validateScheduledRunsPage(raw: unknown, query: ScheduledRunsQuery, identity?: Readonly<{ tenantId: string; subjectId: string }>) {
 const { data } = scheduledRunsPageSchema.parse(raw)
 const incoming = query.cursor === undefined ? null : scheduledRunsCursor(query.cursor, query, identity)
 if (data.items.length > query.limit || new Set(data.items.map(item => item.run_id)).size !== data.items.length) throw new Error("invalid_page")
 let previousCalendar: string | undefined
 for (const item of data.items) {
  if (query.taskId !== undefined && item.task_id !== query.taskId) throw new Error("invalid_page")
  if (item.trigger_kind === "calendar") {
   if (previousCalendar !== undefined && item.scheduled_for > previousCalendar || incoming !== null && item.scheduled_for > incoming.orderKey) throw new Error("invalid_page")
   previousCalendar = item.scheduled_for
  }
 }
 if (data.next_cursor !== null) {
  const next = scheduledRunsCursor(data.next_cursor, query, identity)
  const last = data.items.at(-1)
  if (!last || last.trigger_kind === "calendar" && next.orderKey !== last.scheduled_for || incoming && !positionBefore(next, incoming)) throw new Error("invalid_cursor")
 }
 return data
}

function positionBefore(next: ReturnType<typeof scheduledRunsCursor>, prior: ReturnType<typeof scheduledRunsCursor>): boolean {
 if (next.orderKey !== prior.orderKey) return next.orderKey < prior.orderKey
 const left = new TextEncoder().encode(next.dispatchId), right = new TextEncoder().encode(prior.dispatchId)
 for (let index = 0; index < Math.min(left.length, right.length); index++) {
  if (left[index] !== right[index]) return left[index]! < right[index]!
 }
 return left.length < right.length
}

const ownerCodes: Readonly<Record<number, readonly string[]>> = {
 400: ["scheduled_task_runs_input_invalid"], 401: ["session_authentication_required", "session_invalid"],
 403: ["service_auth_failed", "session_forbidden", "product_tenant_forbidden"], 404: ["scheduled_task_not_found"],
 429: ["session_rate_limited"], 500: ["internal_error"],
 503: ["product_tenant_not_configured", "iam_admission_unavailable", "scheduled_task_runs_unavailable"],
}
const localCodes: Readonly<Record<number, readonly string[]>> = { 400: ["invalid_scheduled_runs_request"], 405: ["scheduled_runs_method_not_allowed"], 499: ["request_aborted"], 502: ["invalid_response"], 503: ["scheduled_runs_dependency_unavailable", "network_error"], 504: ["request_timeout"] }
export const scheduledRunsErrorSchema = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean() }).strict() }).strict()
export function validateScheduledRunsError(raw: unknown, status: number, browser = false) {
 const parsed = scheduledRunsErrorSchema.parse(raw)
 const code = parsed.error.code
 const owner = ownerCodes[status]?.includes(code) === true
 const local = browser && localCodes[status]?.includes(code) === true
 if ((!owner && !local) || parsed.error.retryable !== (owner ? status === 429 || status === 503 : status >= 500)) throw new Error("invalid_error")
 return { error: { ...parsed.error, message: code } }
}
export function scheduledRunsHeaders(headers: Headers, status: number, boundary: "owner" | "browser", requestId?: string): boolean {
 const actual = headers.get("x-request-id"), retry = headers.get("retry-after")
 return /^application\/json(?:;\s*charset=utf-8)?$/iu.test(headers.get("content-type") ?? "")
  && headers.get("cache-control") === (boundary === "owner" ? "no-store" : scheduledRunsBrowserCache)
  && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(actual ?? "") && (requestId === undefined || actual === requestId)
  && !["location", "set-cookie", "content-encoding", "transfer-encoding"].some(key => headers.has(key))
  && (retry === null || status === 429 && projectRenameRetryAfterValid(retry))
}
