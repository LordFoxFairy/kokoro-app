import { randomUUID } from "node:crypto"

import { iamRelayConfig, matchesCanonicalWebRequest } from "@/lib/server/iam-relay-config"
import { filterIssuerCookies, IAM_RELAY_POLICY, resolveBrowserIamGet } from "@/lib/server/iam-relay-policy"
import { nativeIamResponse } from "@/lib/server/iam-relay-response"
import { requestIamRelay } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SERVICE_HEADER = "x-kokoro-service"
const SERVICE_VALUE = "web-bff"
const INTERNAL_SECRET_HEADER = "x-kokoro-internal-secret"

type RouteContext = { params: Promise<{ path: string[] }> }

function requestId(request: Request): string {
  const value = request.headers.get("x-request-id")
  return value !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : randomUUID()
}

function errorResponse(code: string, status: number, id: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders)
  headers.set("cache-control", "no-store")
  headers.set("content-type", "application/json; charset=utf-8")
  headers.set("x-request-id", id)
  return new Response(JSON.stringify({ error: { code, message: "IAM relay request was rejected" } }), { status, headers })
}

function incomingHeaderBytes(headers: Headers): number {
  let bytes = 2
  for (const [name, value] of headers) bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  return bytes
}

function safeShortHeader(value: string): boolean {
  return Buffer.byteLength(value) <= 256 && /^[\x20-\x7e]*$/u.test(value)
}

function rawPathAndQuery(absoluteUrl: string): string | null {
  const scheme = absoluteUrl.indexOf("://")
  if (scheme < 1) return null
  const pathStart = absoluteUrl.indexOf("/", scheme + 3)
  return pathStart < 0 ? "/" : absoluteUrl.slice(pathStart)
}

async function readLogoutConfirmationBody(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length")
  if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1024)) return null
  if (request.body === null) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let cancelled = false
  let abortRead!: () => void
  const aborted = new Promise<never>((_resolve, reject) => { abortRead = () => reject(new Error("logout confirmation body deadline")) })
  const onAbort = (): void => { cancelled = true; abortRead(); void reader.cancel().catch(() => undefined) }
  const deadline = setTimeout(onAbort, IAM_RELAY_POLICY.maxDurationMs)
  request.signal.addEventListener("abort", onAbort, { once: true })
  try {
    if (request.signal.aborted) return null
    while (true) {
      const result = await Promise.race([reader.read(), aborted])
      if (result.done) break
      total += result.value.byteLength
      if (total > 1024) { cancelled = true; void reader.cancel().catch(() => undefined); return null }
      chunks.push(result.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } catch { return null }
  finally {
    clearTimeout(deadline)
    request.signal.removeEventListener("abort", onAbort)
    if (!cancelled) reader.releaseLock()
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const id = requestId(request)
  const { path } = await context.params
  const expectedPath = `/iam/${path.join("/")}`
  const rawTarget = rawPathAndQuery(request.url)
  if (rawTarget === null) return errorResponse("iam_relay_route_not_found", 404, id)
  const question = rawTarget.indexOf("?")
  const rawPath = question < 0 ? rawTarget : rawTarget.slice(0, question)
  if (rawPath !== expectedPath) return errorResponse("iam_relay_route_not_found", 404, id)
  const route = resolveBrowserIamGet(rawTarget, request.method)
  if (route === null) return errorResponse("iam_relay_route_not_found", 404, id)
  if (incomingHeaderBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) {
    return errorResponse("iam_relay_request_too_large", 413, id)
  }
  if (request.headers.has("authorization")) return errorResponse("iam_relay_credential_rejected", 403, id)
  const config = iamRelayConfig(process.env)
  if (config === null) return errorResponse("iam_relay_unavailable", 503, id)
  if (!matchesCanonicalWebRequest(request, config, "GET")) return errorResponse("iam_relay_origin_rejected", 403, id)
  if (route.relativePath === "/oauth2/end-session") {
    const query = new URLSearchParams(route.query)
    const clientId = process.env.KOKORO_OIDC_CLIENT_ID?.trim()
    if (!clientId || [...query.keys()].length !== 2 || query.getAll("client_id").length !== 1 ||
      query.getAll("post_logout_redirect_uri").length !== 1 || query.get("client_id") !== clientId ||
      query.get("post_logout_redirect_uri") !== `${config.webOrigin}/auth/sign-in`) {
      return errorResponse("iam_logout_query_rejected", 400, id)
    }
  }
  const origin = request.headers.get("origin")
  const contentLength = request.headers.get("content-length")
  if (
    request.headers.has("transfer-encoding") || request.body !== null ||
    (contentLength !== null && contentLength !== "0")
  ) return errorResponse("iam_relay_body_rejected", 400, id)

  const cookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
  if (cookie === null) return errorResponse("iam_relay_cookie_invalid", 400, id)

  const headers = new Headers()
  const accept = request.headers.get("accept")
  if (accept !== null) {
    if (!safeShortHeader(accept)) return errorResponse("iam_relay_header_invalid", 400, id)
    headers.set("accept", accept)
  }
  if (origin !== null) headers.set("origin", origin)
  if (cookie !== "") headers.set("cookie", cookie)
  headers.set(SERVICE_HEADER, SERVICE_VALUE)
  headers.set(INTERNAL_SECRET_HEADER, config.secret)
  headers.set("x-request-id", id)

  try {
    const upstream = await requestIamRelay({
      url: `${config.bffOrigin}/iam${route.relativePath}${route.query}`,
      headers,
      signal: request.signal,
      timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes,
      maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    return nativeIamResponse(upstream, config.webOrigin, config.secureCookies, id)
      ?? errorResponse("iam_relay_response_invalid", 502, id)
  } catch {
    return errorResponse("iam_relay_unavailable", 503, id)
  }
}

export async function POST(request: Request, context?: RouteContext): Promise<Response> {
  const id = requestId(request)
  const path = context === undefined ? [] : (await context.params).path
  const rawTarget = rawPathAndQuery(request.url)
  if (request.method !== "POST" || path.join("/") !== "oauth2/end-session/confirm" ||
    rawTarget !== "/iam/oauth2/end-session/confirm") return rejectMethod(request)
  const config = iamRelayConfig(process.env)
  if (config === null) return errorResponse("iam_relay_unavailable", 503, id)
  if (!matchesCanonicalWebRequest(request, config, "POST")) return errorResponse("iam_relay_origin_rejected", 403, id)
  if (request.headers.has("authorization") || incomingHeaderBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) {
    return errorResponse("iam_relay_credential_rejected", 403, id)
  }
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") {
    return errorResponse("iam_logout_form_rejected", 400, id)
  }
  const bytes = await readLogoutConfirmationBody(request)
  if (bytes === null) return errorResponse("iam_logout_form_rejected", 400, id)
  const body = new TextDecoder().decode(bytes)
  const form = new URLSearchParams(body)
  if ([...form.keys()].length !== 1 || form.getAll("action").length !== 1 || form.get("action") !== "confirm") {
    return errorResponse("iam_logout_form_rejected", 400, id)
  }
  const cookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies, true)
  if (cookie === null || !cookie.includes(`${config.secureCookies ? "__Secure-" : ""}kokoro-issuer.session_token.oauth_logout_confirmation=`)) {
    return errorResponse("iam_logout_confirmation_required", 403, id)
  }
  const headers = new Headers({ origin: config.webOrigin, cookie, "content-type": "application/x-www-form-urlencoded",
    "x-kokoro-service": SERVICE_VALUE, [INTERNAL_SECRET_HEADER]: config.secret, "x-request-id": id })
  try {
    const upstream = await requestIamRelay({ url: `${config.bffOrigin}/iam/oauth2/end-session/confirm`, method: "POST",
      body: bytes, headers, signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxRequestBytes: 1024, maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes,
      maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes })
    return nativeIamResponse(upstream, config.webOrigin, config.secureCookies, id)
      ?? errorResponse("iam_relay_response_invalid", 502, id)
  } catch { return errorResponse("iam_relay_unavailable", 503, id) }
}

function rejectMethod(request: Request): Response {
  return errorResponse("iam_relay_method_not_allowed", 405, requestId(request), { allow: "GET" })
}

export const PUT = rejectMethod
export const PATCH = rejectMethod
export const DELETE = rejectMethod
export const HEAD = rejectMethod
export const OPTIONS = rejectMethod
