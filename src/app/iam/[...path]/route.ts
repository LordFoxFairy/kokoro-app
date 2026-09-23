import { randomUUID } from "node:crypto"

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

function configuredOrigin(raw: string | undefined, requireCanonicalSpelling: boolean): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username !== "" ||
      parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" ||
      (requireCanonicalSpelling && value !== parsed.origin)
    ) return null
    return parsed.origin
  } catch {
    return null
  }
}

function relayConfig(env: NodeJS.ProcessEnv): Readonly<{
  bffOrigin: string
  webOrigin: string
  webHost: string
  secret: string
  secureCookies: boolean
}> | null {
  const rawBase = env.KOKORO_BFF_BASE_URL?.trim()
  const secret = env.KOKORO_INTERNAL_SECRET_WEB_BFF?.trim()
  const bffOrigin = configuredOrigin(rawBase, false)
  const webOrigin = configuredOrigin(env.KOKORO_WEB_ORIGIN, true)
  if (bffOrigin === null || webOrigin === null || !secret) return null
  return { bffOrigin, webOrigin, webHost: new URL(webOrigin).host, secret, secureCookies: env.NODE_ENV === "production" }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const id = requestId(request)
  const url = new URL(request.url)
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
  const config = relayConfig(process.env)
  if (config === null) return errorResponse("iam_relay_unavailable", 503, id)
  if (url.origin !== config.webOrigin) return errorResponse("iam_relay_origin_rejected", 403, id)
  if (request.headers.get("host") !== config.webHost) return errorResponse("iam_relay_origin_rejected", 403, id)
  const origin = request.headers.get("origin")
  if (origin !== null && origin !== config.webOrigin) return errorResponse("iam_relay_origin_rejected", 403, id)
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

function rejectMethod(request: Request): Response {
  return errorResponse("iam_relay_method_not_allowed", 405, requestId(request), { allow: "GET" })
}

export const POST = rejectMethod
export const PUT = rejectMethod
export const PATCH = rejectMethod
export const DELETE = rejectMethod
export const HEAD = rejectMethod
export const OPTIONS = rejectMethod
