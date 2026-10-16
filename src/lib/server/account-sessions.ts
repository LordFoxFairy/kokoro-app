import { randomUUID } from "node:crypto"
import { accountSessionErrorSchemas, accountSessionRevokeSchema, validateAccountSessionPage } from "@/lib/account-sessions.schema"
import { productBffConfig, productBffHeaders } from "./product-bff"
import { currentProductSession } from "./product-session"
import { requestWithDomain } from "./upstream-http"

/** Only the two account-session operations; the final cookie read shares the same budget. */
export async function accountSessions(request: Request, sessionTarget?: string | Promise<string>): Promise<Response> {
  const deadline = performance.now() + 10_000
  const requestId = randomUUID()
  const headers = { "cache-control": "private, no-store", "x-request-id": requestId }
  const fail = (status: number, code: string) => Response.json({ error: { code, message: code }, meta: { request_id: requestId } }, { status, headers })
  const config = productBffConfig()
  if (!config) return fail(503, "account_session_dependency_unavailable")
  let sessionId: string | undefined
  const method = sessionTarget === undefined ? "GET" : "DELETE"
  const url = new URL(request.url)
  const origin = new URL(config.session.webOrigin)
  if (request.method !== method) return accountSessionMethodNotAllowed(method)
  if (url.protocol !== origin.protocol || request.headers.get("host") !== origin.host ||
    (method === "DELETE" ? request.headers.get("origin") !== origin.origin : request.headers.has("origin") && request.headers.get("origin") !== origin.origin)) return fail(403, "account_session_forbidden_origin")
  let limit = 25; let cursor: string | undefined
  if ((method === "GET" && request.body !== null) || request.headers.has("transfer-encoding") || request.headers.has("idempotency-key") ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return fail(400, "account_session_invalid_request")
  if (method === "GET") {
    if (url.pathname !== "/api/account/sessions") return fail(400, "account_session_invalid_request")
    for (const key of url.searchParams.keys()) if (!["limit", "cursor"].includes(key) || url.searchParams.getAll(key).length !== 1) return fail(400, "account_session_invalid_request")
    const rawLimit = url.searchParams.get("limit")
    if (rawLimit !== null) { if (!/^[1-9]\d{0,2}$/u.test(rawLimit) || Number(rawLimit) > 100) return fail(400, "account_session_invalid_request"); limit = Number(rawLimit) }
    cursor = url.searchParams.get("cursor") ?? undefined
    if (cursor !== undefined && (!cursor || cursor.length > 2048)) return fail(400, "account_session_invalid_request")
  }

  const controller = new AbortController()
  let retired = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let response: Response | undefined
  let reject!: (reason: unknown) => void
  const cancelled = new Promise<never>((_, fail) => { reject = fail })
  const stop = () => {
    controller.abort()
    const active = reader; reader = undefined
    if (active) { void active.cancel().catch(() => undefined); try { active.releaseLock() } catch {} }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { stop(); reject(new Error("retired")) }
  const timer = setTimeout(abort, Math.max(0, deadline - performance.now()))
  request.signal.addEventListener("abort", abort, { once: true })
  if (request.signal.aborted) abort()
  const check = () => { if (retired || controller.signal.aborted || performance.now() >= deadline) throw new Error("retired") }
  const operation = async () => {
    check()
    if (method === "DELETE") {
      // Next's Node adapter provides a stream even for a bodyless DELETE.
      // Prove EOF inside the existing budget instead of testing stream presence.
      if (request.body !== null) {
        reader = request.body.getReader()
        for (;;) {
          const part = await reader.read()
          check()
          if (part.done) break
          if (part.value.byteLength > 0) return fail(400, "account_session_invalid_request")
        }
        reader.releaseLock()
        reader = undefined
      }
      sessionId = await sessionTarget
      check()
    try {
      const rawId = url.pathname.slice("/api/account/sessions/".length)
      if (!url.pathname.startsWith("/api/account/sessions/") || rawId.includes("/") || decodeURIComponent(rawId) !== sessionId || !sessionId || sessionId.length > 255 || request.url.includes("?")) return fail(400, "account_session_invalid_request")
    } catch { return fail(400, "account_session_invalid_request") }
  }
    const session = await currentProductSession(request, config.session)
    check()
    if (!session || session.accessExpiresAt <= Date.now() || session.expiresAt <= Date.now()) return fail(401, "account_session_session_required")
    const query = new URLSearchParams({ limit: String(limit) }); if (cursor !== undefined) query.set("cursor", cursor)
    const path = method === "GET" ? `/v1/account/sessions?${query}` : `/v1/account/sessions/${encodeURIComponent(sessionId!)}`
    response = await requestWithDomain(`${config.bffBaseUrl}${path}`, config.domain, { method, signal: controller.signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())), maxResponseBytes: 1_048_576, headers: productBffHeaders(config, session, requestId) })
    if (retired || controller.signal.aborted) { stop(); check() }
    check()
    if (response.headers.get("x-request-id") !== requestId || !/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "") || !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(response.headers.get("cache-control") ?? "") || response.headers.has("location") || response.headers.has("set-cookie")) return fail(502, "account_session_response_invalid")
    let size = 0; response.headers.forEach((v, k) => { size += new TextEncoder().encode(`${k}: ${v}\r\n`).byteLength })
    let text = ""; const decoder = new TextDecoder("utf-8", { fatal: true })
    if (size > 1_048_576) return fail(502, "account_session_response_invalid")
    if (response.body) {
      reader = response.body.getReader()
      for (;;) { const part = await reader.read(); check(); if (part.done) break; size += part.value.byteLength; if (size > 1_048_576) return fail(502, "account_session_response_invalid"); text += decoder.decode(part.value, { stream: true }) }
      text += decoder.decode()
    }
    check()
    let output: unknown
    const status = response.status
    try {
      const raw: unknown = JSON.parse(text)
      if (status === 200) {
        if (method === "GET") output = validateAccountSessionPage(raw, requestId, limit, cursor)
        else { const ack = accountSessionRevokeSchema.parse(raw); if (ack.data.session_id !== sessionId || ack.meta.request_id !== requestId) throw new Error("binding"); output = ack }
      } else {
        const error = accountSessionErrorSchemas[status]?.parse(raw)
        if (!error || error.meta.request_id !== requestId) throw new Error("status")
        output = { error: { code: error.error.code, message: error.error.code }, meta: { request_id: requestId } }
      }
    } catch { return fail(502, "account_session_response_invalid") }
    const latest = await currentProductSession(request, config.session)
    check()
    if (!latest || latest.id !== session.id || latest.generation !== session.generation || latest.subject !== session.subject || latest.access !== session.access || latest.accessExpiresAt !== session.accessExpiresAt || latest.expiresAt !== session.expiresAt || latest.accessExpiresAt <= Date.now() || latest.expiresAt <= Date.now()) return fail(401, "account_session_session_required")
    const retry = response.headers.get("retry-after")
    if (retry !== null && (!/^[1-9]\d{0,4}$/u.test(retry) || Number(retry) > 86400 || ![429, 503].includes(status))) return fail(502, "account_session_response_invalid")
    return Response.json(output, { status, headers: { ...headers, ...(retry === null ? {} : { "retry-after": retry }) } })
  }
  try { return await Promise.race([cancelled, operation()]) }
  catch { return fail(503, "account_session_dependency_unavailable") }
  finally { retired = true; clearTimeout(timer); request.signal.removeEventListener("abort", abort); stop() }
}
export function accountSessionMethodNotAllowed(allow: "GET" | "DELETE"): Response {
  const requestId = randomUUID()
  return Response.json({ error: { code: "account_session_method_not_allowed", message: "account_session_method_not_allowed" }, meta: { request_id: requestId } }, { status: 405, headers: { allow, "cache-control": "private, no-store", "x-request-id": requestId } })
}
