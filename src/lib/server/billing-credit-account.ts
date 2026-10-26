import { randomUUID } from "node:crypto"

import { creditAccountBrowserCache, creditAccountErrorAllowed, creditAccountHeaderBytes, creditAccountHeadersValid,
  creditAccountMaxBytes, creditAccountOwnerAck, creditAccountOwnerError, creditAccountPath } from "@/contract/billing-credit-account"
import { parseProjectRenameJson } from "@/contract/project-rename"
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff"
import { currentProductSession, type ProductClaims } from "./product-session"
import { requestWithDomain } from "./upstream-http"

type Lifetime = Readonly<{
  request: Request; params: Promise<{ path: string[] }>; requestId: string; deadline: number; signal: AbortSignal
  check: () => void; read: (body: ReadableStream<Uint8Array> | null, limit: number) => Promise<Uint8Array>
  response: (value: Response) => void; fail: (status: number, code: string) => Response
}>

/** Only classification decodes; aliases are rejected against the original target in the adapter. */
export function isBillingCreditAccountRequest(request: Request): boolean {
  const parts = new URL(request.url).pathname.split("/").flatMap(part => {
    try { return decodeURIComponent(part).split("/") } catch { return [part] }
  }).filter(Boolean)
  return parts.length === 4 && parts[0] === "api" && parts[1] === "session" && parts[2] === "billing" && parts[3] === "credit-account"
}

function json(value: unknown, status: number, headers: Record<string, string>): Response {
  const text = JSON.stringify(value)
  return new Response(text, { status, headers: { ...headers, "content-type": "application/json; charset=utf-8", "content-length": String(new TextEncoder().encode(text).byteLength) } })
}

/** A single absolute deadline covers params, request EOF, both sessions and owner EOF. */
export async function billingCreditAccount(request: Request, params: Promise<{ path: string[] }>): Promise<Response> {
  const requestId = randomUUID(), deadline = performance.now() + 15_000, controller = new AbortController()
  const fail = (status: number, code: string) => json({ error: { code, message: code, retryable: status >= 500 || status === 499 } }, status,
    { "cache-control": creditAccountBrowserCache, "x-request-id": requestId, ...(status === 405 ? { allow: "PUT" } : {}) })
  let retired = false, fault = "network_error", response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let interrupt: (error: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject })
  const stop = () => {
    controller.abort()
    if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock() } catch {} reader = undefined }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { fault = "request_aborted"; stop(); interrupt(new Error(fault)) }
  const timer = setTimeout(() => { fault = "request_timeout"; stop(); interrupt(new Error(fault)) }, 15_000)
  request.signal.addEventListener("abort", abort, { once: true })
  if (request.signal.aborted) abort()
  const check = () => {
    if (request.signal.aborted) fault = "request_aborted"
    else if (performance.now() >= deadline) fault = "request_timeout"
    if (retired || controller.signal.aborted || request.signal.aborted || performance.now() >= deadline) { stop(); throw new Error(fault) }
  }
  const read = async (body: ReadableStream<Uint8Array> | null, limit: number) => {
    const parts: Uint8Array[] = []; let size = 0
    if (body) {
      reader = body.getReader()
      for (;;) { check(); const part = await reader.read(); check(); if (part.done) break; size += part.value.byteLength; if (size > limit) throw new Error("too_large"); parts.push(part.value) }
      reader.releaseLock(); reader = undefined
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    return bytes
  }
  const currentFault = () => fault
  try { return await Promise.race([interrupted, serve({ request, params, requestId, deadline, signal: controller.signal, check, read, fail,
    response: value => { response = value; if (retired || controller.signal.aborted) stop() } })]) }
  catch { const code = currentFault(); return fail(code === "request_timeout" ? 504 : code === "request_aborted" ? 499 : 503, code) }
  finally { retired = true; clearTimeout(timer); request.signal.removeEventListener("abort", abort); stop() }
}

function validRequest(request: Request, path: readonly string[]): boolean {
  const url = new URL(request.url), length = request.headers.get("content-length"), transfer = request.headers.get("transfer-encoding")
  return url.pathname === creditAccountPath && !url.href.includes("?") && !url.hash
    && path.length === 2 && path[0] === "billing" && path[1] === "credit-account"
    && /^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")
    && !request.headers.has("idempotency-key") && !request.headers.has("content-encoding")
    && (length === null || /^(0|[1-9][0-9]*)$/u.test(length) && Number(length) <= 4096)
    && (transfer === null || transfer.toLowerCase() === "chunked" && length === null)
}
function sameSession(first: ProductClaims, latest: ProductClaims | null): boolean {
  return latest !== null && latest.expiresAt > Date.now() && latest.accessExpiresAt > Date.now()
    && (["id", "subject", "generation", "access", "expiresAt", "accessExpiresAt"] as const).every(key => first[key] === latest[key])
}
async function serve(input: Lifetime): Promise<Response> {
  const { request, check, fail } = input
  check()
  if (request.method !== "PUT") return fail(405, "credit_account_method_not_allowed")
  const config = productBffConfig()
  if (!config) return fail(503, "product_tenant_not_configured")
  const url = new URL(request.url), origin = new URL(config.session.webOrigin)
  if (url.protocol !== origin.protocol || request.headers.get("host") !== origin.host || request.headers.get("origin") !== origin.origin) return fail(403, "session_forbidden")
  const { path } = await input.params; check()
  if (!validRequest(request, path)) return fail(400, "billing_credit_account_input_invalid")
  try {
    const bytes = await input.read(request.body, 4096); check()
    const length = request.headers.get("content-length")
    if (length !== null && Number(length) !== bytes.length) throw new Error("invalid_length")
    const raw: unknown = parseProjectRenameJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 0) throw new Error("invalid_body")
  } catch { check(); return fail(400, "billing_credit_account_input_invalid") }
  let first: ProductClaims | null
  try { first = await admittedProductSession(request, config) } catch { check(); return fail(503, "iam_admission_unavailable") }
  check()
  if (!first || first.expiresAt <= Date.now()) return fail(401, "session_invalid")
  const headers = productBffHeaders(config, first, input.requestId); headers.set("content-type", "application/json")
  let response: Response
  try {
    response = await requestWithDomain(`${config.bffBaseUrl}/v1/billing/credit-account`, config.domain, { method: "PUT", body: new TextEncoder().encode("{}").buffer, headers, signal: input.signal,
      timeoutMs: Math.max(1, Math.ceil(input.deadline - performance.now())), maxResponseBytes: creditAccountMaxBytes })
    input.response(response)
  } catch { check(); return fail(503, "network_error") }
  check()
  if (!creditAccountHeadersValid(response.headers, response.status, "owner", input.requestId)) return fail(502, "invalid_response")
  let output: unknown
  try {
    const bytes = await input.read(response.body, creditAccountMaxBytes - creditAccountHeaderBytes(response.headers)); check()
    const length = response.headers.get("content-length")
    if (length !== null && Number(length) !== bytes.length) throw new Error("invalid_length")
    const raw = parseProjectRenameJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
    if (response.status === 200) {
      const value = creditAccountOwnerAck.parse(raw)
      if (value.meta.request_id !== input.requestId) throw new Error("invalid_id")
      output = value.data
    } else {
      const value = creditAccountOwnerError.parse(raw)
      if (value.meta.request_id !== input.requestId || !creditAccountErrorAllowed(response.status, value.error.code, value.error.retryable)) throw new Error("invalid_error")
      output = { error: { ...value.error, message: value.error.code } }
    }
  } catch { check(); return fail(502, "invalid_response") }
  let latest: ProductClaims | null
  try { latest = await currentProductSession(request, config.session) } catch { check(); return fail(503, "iam_admission_unavailable") }
  check()
  if (!sameSession(first, latest)) return fail(401, "session_invalid")
  const retry = response.headers.get("retry-after")
  return json(output, response.status, { "cache-control": creditAccountBrowserCache, "x-request-id": input.requestId, ...(retry === null ? {} : { "retry-after": retry }) })
}
