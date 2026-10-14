import { ZodError } from "zod"
import { accountSessionLocalErrorSchemas, accountSessionErrorSchemas, accountSessionRevokeSchema, validateAccountSessionPage, type AccountSessions, type AccountSessionRevoke } from "@/lib/account-sessions.schema"

export class AccountSessionsError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
/** A single browser intent, bounded through headers and body; never retries writes. */
async function request(method: "GET" | "DELETE", path: string, signal: AbortSignal, limit = 25, cursor?: string, target?: string): Promise<AccountSessions | AccountSessionRevoke> {
  signal.throwIfAborted()
  const deadline = performance.now() + 10_000
  const controller = new AbortController()
  let retired = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let response: Response | undefined
  let reject!: (error: unknown) => void
  const cancellation = new Promise<never>((_, fail) => { reject = fail })
  const stop = () => {
    controller.abort()
    const active = reader; reader = undefined
    if (active) { void active.cancel().catch(() => undefined); try { active.releaseLock() } catch {} }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { stop(); reject(new AccountSessionsError(503, "account_session_result_unknown")) }
  const timer = setTimeout(abort, 10_000)
  signal.addEventListener("abort", abort, { once: true })
  const check = () => { if (retired || controller.signal.aborted || signal.aborted || performance.now() >= deadline) throw new AccountSessionsError(503, "account_session_result_unknown") }
  const operation = async () => {
    response = await fetch(path, { method, signal: controller.signal, credentials: "same-origin", cache: "no-store", redirect: "error", headers: { accept: "application/json" } })
    if (retired || controller.signal.aborted) { stop(); check() }
    const id = response.headers.get("x-request-id")
    if (!id || id.length > 256 || !/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "") || !/(?:^|,)\s*(?:private\s*,\s*)?no-store\s*(?:,|$)/iu.test(response.headers.get("cache-control") ?? "") || response.headers.has("location") || response.headers.has("set-cookie")) throw new AccountSessionsError(502, "account_session_response_invalid")
    let size = 0; response.headers.forEach((v, k) => { size += new TextEncoder().encode(`${k}: ${v}\r\n`).byteLength })
    let text = ""; const decoder = new TextDecoder("utf-8", { fatal: true })
    if (size > 1_048_576) throw new AccountSessionsError(502, "account_session_response_invalid")
    if (response.body) {
      reader = response.body.getReader()
      for (;;) { const part = await reader.read(); check(); if (part.done) break; size += part.value.byteLength; if (size > 1_048_576) throw new AccountSessionsError(502, "account_session_response_invalid"); text += decoder.decode(part.value, { stream: true }) }
      text += decoder.decode()
    }
    check(); const retry = response.headers.get("retry-after")
    if (retry !== null && (!/^[1-9]\d{0,4}$/u.test(retry) || Number(retry) > 86400 || ![429, 503].includes(response.status))) throw new AccountSessionsError(502, "account_session_response_invalid")
    const raw: unknown = JSON.parse(text)
    if (response.status !== 200) {
      const schema = accountSessionErrorSchemas[response.status]
      const canonical = schema?.safeParse(raw)
      const parsed = canonical?.success ? canonical : accountSessionLocalErrorSchemas[response.status]?.safeParse(raw)
      if (!parsed?.success || parsed.data.meta.request_id !== id) throw new AccountSessionsError(502, "account_session_response_invalid")
      throw new AccountSessionsError(response.status, parsed.data.error.code)
    }
    if (method === "GET") return validateAccountSessionPage(raw, id, limit, cursor)
    const ack = accountSessionRevokeSchema.parse(raw)
    if (ack.meta.request_id !== id || ack.data.session_id !== target || ack.data.revoked !== true) throw new AccountSessionsError(502, "account_session_response_invalid")
    return ack
  }
  try { return await Promise.race([cancellation, operation()]) }
  catch (error) { if (error instanceof AccountSessionsError) throw error; if (error instanceof ZodError || error instanceof SyntaxError) throw new AccountSessionsError(502, "account_session_response_invalid"); throw new AccountSessionsError(503, "account_session_result_unknown") }
  finally { retired = true; clearTimeout(timer); signal.removeEventListener("abort", abort); stop() }
}
export async function listAccountSessions(signal: AbortSignal, cursor?: string): Promise<AccountSessions> {
  if (cursor !== undefined && (!cursor || cursor.length > 2048)) throw new AccountSessionsError(400, "account_session_invalid_request")
  const query = new URLSearchParams({ limit: "25" }); if (cursor !== undefined) query.set("cursor", cursor)
  return await request("GET", `/api/account/sessions?${query}`, signal, 25, cursor) as AccountSessions
}
export async function revokeAccountSession(sessionId: string, signal: AbortSignal): Promise<AccountSessionRevoke> {
  if (!sessionId || sessionId.length > 255) throw new AccountSessionsError(400, "account_session_invalid_request")
  return await request("DELETE", `/api/account/sessions/${encodeURIComponent(sessionId)}`, signal, 25, undefined, sessionId) as AccountSessionRevoke
}
