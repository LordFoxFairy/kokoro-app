import { randomUUID } from "node:crypto"

import NextAuth from "next-auth"
import { NextRequest } from "next/server"

import { boundedInteractionForm } from "@/lib/server/iam-interaction-route"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { oidcAuthOptions, oidcRpConfig, OIDC_RESOURCE, OIDC_SCOPE } from "@/lib/server/oidc-provider"
import { consumeOidcState, issueOidcState, rpCleanupCookies } from "@/lib/server/oidc-rp-transaction"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ nextauth: string[] }> }
type Action = "csrf" | "signin" | "callback"

function errorResponse(status: number, code: string, clearCookies: readonly string[] = []): Response {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-request-id": randomUUID() })
  for (const cookie of clearCookies) headers.append("set-cookie", cookie)
  return new Response(JSON.stringify({ error: { code, message: "RP request was rejected" } }), { status, headers })
}

function routeAction(parts: readonly string[]): Action | null {
  if (parts.length === 1 && parts[0] === "csrf") return "csrf"
  if (parts.length === 2 && parts[1] === "kokoro-iam") {
    if (parts[0] === "signin") return "signin"
    if (parts[0] === "callback") return "callback"
  }
  return null
}

function parameterOnlyOnce(query: URLSearchParams, name: string): string | null {
  const values = query.getAll(name)
  return values.length === 1 ? values[0] ?? null : null
}

function safeAuthorizeLocation(value: string, webOrigin: string, clientId: string, callbackUrl: string): string | null {
  if (value.length > 8192 || /[\\#\u0000-\u001f\u007f]/u.test(value)) return null
  try {
    const url = new URL(value)
    if (url.origin !== webOrigin || url.pathname !== "/iam/oauth2/authorize") return null
    const expected = ["client_id", "redirect_uri", "response_type", "scope", "resource", "state", "nonce", "code_challenge", "code_challenge_method"]
    if ([...url.searchParams.keys()].length !== expected.length || expected.some((name) => url.searchParams.getAll(name).length !== 1)) return null
    if (
      url.searchParams.get("client_id") !== clientId || url.searchParams.get("redirect_uri") !== callbackUrl ||
      url.searchParams.get("response_type") !== "code" || url.searchParams.get("scope") !== OIDC_SCOPE ||
      url.searchParams.get("resource") !== OIDC_RESOURCE || url.searchParams.get("code_challenge_method") !== "S256" ||
      !/^[A-Za-z0-9_-]{16,256}$/u.test(url.searchParams.get("state") ?? "") ||
      !/^[A-Za-z0-9_-]{16,256}$/u.test(url.searchParams.get("nonce") ?? "") ||
      !/^[A-Za-z0-9_-]{43}$/u.test(url.searchParams.get("code_challenge") ?? "")
    ) return null
    return url.searchParams.get("state")
  } catch {
    return null
  }
}

async function handle(request: NextRequest, context: Context, method: "GET" | "POST"): Promise<Response> {
  const parts = (await context.params).nextauth
  const action = routeAction(parts)
  if (request.method !== method || action === null ||
    (action === "signin" ? method !== "POST" : method !== "GET")) return errorResponse(405, "rp_method_not_allowed")
  const config = oidcRpConfig(process.env)
  if (config === null) return errorResponse(503, "rp_unavailable")
  const expectedPath = `/api/auth/${parts.join("/")}`
  const url = request.nextUrl
  if (url.origin !== config.relay.webOrigin || url.pathname !== expectedPath || request.headers.get("host") !== config.relay.webHost ||
    (method === "POST" ? request.headers.get("origin") !== config.relay.webOrigin :
      request.headers.has("origin") && request.headers.get("origin") !== config.relay.webOrigin)) {
    return errorResponse(403, "rp_origin_rejected")
  }
  if (request.headers.has("authorization") || request.headers.has("x-kokoro-service") || request.headers.has("x-kokoro-internal-secret")) {
    return errorResponse(403, "rp_credential_rejected")
  }
  let headerBytes = 2
  for (const [name, value] of request.headers) headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  if (headerBytes > IAM_RELAY_POLICY.maxHeaderBytes) return errorResponse(413, "rp_request_too_large")
  if (method === "GET" && (request.body !== null || request.headers.has("transfer-encoding") ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0"))) {
    return errorResponse(400, "rp_body_rejected")
  }

  if (action === "csrf") {
    if (url.search !== "") return errorResponse(400, "rp_query_rejected")
    try {
      const response = await NextAuth(request, context, oidcAuthOptions(config, () => undefined, request.signal)) as Response
      if (response.status !== 200 || response.headers.getSetCookie().some((cookie) =>
        !/^(?:(?:__Host-)?next-auth\.csrf-token|(?:__Secure-)?next-auth\.callback-url)=/u.test(cookie))) {
        return errorResponse(502, "rp_response_invalid")
      }
      response.headers.set("cache-control", "no-store")
      return response
    } catch { return errorResponse(503, "rp_unavailable") }
  }

  if (action === "signin") {
    if (url.search !== "" || request.headers.get("content-type") !== "application/x-www-form-urlencoded") {
      return errorResponse(400, "rp_signin_rejected")
    }
    const form = await boundedInteractionForm(request, ["csrfToken"])
    if (form === null || !/^[A-Za-z0-9]+$/u.test(form.get("csrfToken") ?? "")) return errorResponse(400, "rp_signin_rejected")
    try {
      const headers = new Headers(request.headers)
      headers.delete("content-length")
      headers.delete("transfer-encoding")
      const authRequest = new NextRequest(request.url, { method: "POST", headers, body: form.toString() })
      const response = await NextAuth(authRequest, context, oidcAuthOptions(config, () => undefined, request.signal)) as Response
      const location = response.headers.get("location")
      const state = location === null ? null : safeAuthorizeLocation(location, config.relay.webOrigin, config.clientId, config.callbackUrl)
      const setCookies = response.headers.getSetCookie()
      if (response.status !== 302 || state === null || setCookies.some((cookie) => /(?:^|;)\s*(?:__Secure-)?next-auth\.session-token=/u.test(cookie))) {
        return errorResponse(403, "rp_signin_rejected")
      }
      await issueOidcState({ redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin, state, setCookies })
      response.headers.set("cache-control", "no-store")
      return response
    } catch { return errorResponse(503, "rp_unavailable") }
  }

  const cleanup = rpCleanupCookies(config.relay.secureCookies)
  const query = url.searchParams
  if ([...query.keys()].length !== 2 || parameterOnlyOnce(query, "code") === null ||
    parameterOnlyOnce(query, "state") === null ||
    !/^[A-Za-z0-9._~-]{1,2048}$/u.test(query.get("code") ?? "")) {
    return errorResponse(400, "rp_callback_rejected", cleanup)
  }
  let consumed: boolean
  try {
    consumed = await consumeOidcState({ redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin,
      state: query.get("state") ?? "", cookieHeader: request.headers.get("cookie") })
  } catch { return errorResponse(503, "rp_unavailable", cleanup) }
  if (!consumed) return errorResponse(403, "rp_transaction_rejected", cleanup)
  let verified = false
  try {
    await NextAuth(request, context, oidcAuthOptions(config, () => { verified = true }, request.signal))
  } catch { return errorResponse(503, "rp_unavailable", cleanup) }
  return verified
    ? errorResponse(503, "product_session_unavailable", cleanup)
    : errorResponse(403, "rp_callback_rejected", cleanup)
}

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context, "GET")
}

export async function POST(request: NextRequest, context: Context): Promise<Response> {
  return handle(request, context, "POST")
}

function methodNotAllowed(): Response {
  return errorResponse(405, "rp_method_not_allowed")
}

export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
