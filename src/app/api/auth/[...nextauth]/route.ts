import { createHash, randomUUID, timingSafeEqual } from "node:crypto"

import NextAuth from "next-auth"
import { NextRequest } from "next/server"

import { boundedInteractionForm } from "@/lib/server/iam-interaction-route"
import { matchesCanonicalWebRequest } from "@/lib/server/iam-relay-config"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { oidcAuthOptions, oidcRpConfig, OIDC_RESOURCE, OIDC_SCOPE, type VerifiedOidcTokens } from "@/lib/server/oidc-provider"
import { verifyProductIdentity } from "@/lib/server/product-identity"
import { consumeOidcState, issueOidcState, rpCleanupCookies } from "@/lib/server/oidc-rp-transaction"
import { clearProductSessionCookie, currentProductSession, decodeProductSession, productSessionCookie, type ProductClaims } from "@/lib/server/product-session"
import { createSession, finalizeRefresh, invalidatePending, newSessionCandidate, reserveRefresh, tombstoneSession } from "@/lib/server/product-session-store"
import { refreshOidcToken, revokeOidcToken } from "@/lib/server/oidc-token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ nextauth: string[] }> }
type Action = "csrf" | "signin" | "callback" | "session" | "signout"

function errorResponse(status: number, code: string, clearCookies: readonly string[] = []): Response {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-request-id": randomUUID() })
  for (const cookie of clearCookies) headers.append("set-cookie", cookie)
  return new Response(JSON.stringify({ error: { code, message: "RP request was rejected" } }), { status, headers })
}

function routeAction(parts: readonly string[]): Action | null {
  if (parts.length === 1 && parts[0] === "csrf") return "csrf"
  if (parts.length === 1 && parts[0] === "session") return "session"
  if (parts.length === 1 && parts[0] === "signout") return "signout"
  if (parts.length === 2 && parts[1] === "kokoro-iam") {
    if (parts[0] === "signin") return "signin"
    if (parts[0] === "callback") return "callback"
  }
  return null
}

async function validCsrf(request: Request, secret: string): Promise<boolean> {
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") return false
  const form = await boundedInteractionForm(request, ["csrfToken"])
  const supplied = form?.get("csrfToken")
  if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/u.test(supplied)) return false
  const cookie = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim())
    .filter((part) => /^(?:__Host-)?next-auth\.csrf-token=/u.test(part))
  if (cookie.length !== 1) return false
  let decoded: string
  try { decoded = decodeURIComponent(cookie[0]!.slice(cookie[0]!.indexOf("=") + 1)) }
  catch { return false }
  const [token, digest] = decoded.split("|")
  const expected = createHash("sha256").update(`${supplied}${secret}`).digest("hex")
  return token === supplied && typeof digest === "string" && digest.length === expected.length &&
    timingSafeEqual(Buffer.from(digest), Buffer.from(expected))
}

async function productAction(request: NextRequest, action: "session" | "signout", config: NonNullable<ReturnType<typeof oidcRpConfig>>): Promise<Response> {
  const store = { redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin, secret: config.authSecret }
  const requestId = randomUUID()
  if (request.method === "GET" && action === "session") {
    try {
      const session = await currentProductSession(request, store)
      return Response.json(session === null || session.accessExpiresAt <= Date.now()
        ? { authenticated: false }
        : { authenticated: true, subject: session.subject, expires_at: session.expiresAt },
      { headers: { "cache-control": "private, no-store", "x-request-id": requestId } })
    } catch { return errorResponse(503, "product_session_unavailable") }
  }
  if (request.method !== "POST") return errorResponse(405, "rp_method_not_allowed")
  if (!(await validCsrf(request, config.authSecret))) return errorResponse(403, "rp_csrf_rejected")
  if (action === "signout") {
    const issuerEndSessionUrl = `/iam/oauth2/end-session?${new URLSearchParams({
      client_id: config.clientId, post_logout_redirect_uri: `${config.relay.webOrigin}/auth/sign-in`,
    })}`
    const issuer = { issuer_session: "pending_browser_confirmation", issuer_end_session_url: issuerEndSessionUrl }
    const claims = await decodeProductSession(request, config.authSecret)
    const headers = new Headers({ "cache-control": "private, no-store", "x-request-id": requestId })
    if (claims === null) {
      headers.append("set-cookie", clearProductSessionCookie(config.relay.webOrigin))
      return Response.json({ status: "signed_out", remote_revocation: "not_required", ...issuer }, { headers })
    }
    let taken: Awaited<ReturnType<typeof tombstoneSession>>
    try { taken = await tombstoneSession(store, claims.id, claims.generation) }
    catch {
      headers.append("set-cookie", clearProductSessionCookie(config.relay.webOrigin))
      return Response.json({ status: "browser_cookie_cleared", remote_revocation: "unconfirmed", ...issuer }, { status: 503, headers })
    }
    if (taken.status === "stale") {
      return Response.json({ status: "stale_session", remote_revocation: "not_required" }, { headers })
    }
    headers.append("set-cookie", clearProductSessionCookie(config.relay.webOrigin))
    if (taken.status !== "active" || taken.refresh === undefined) {
      return Response.json({ status: "signed_out", remote_revocation: "unconfirmed", ...issuer }, { headers })
    }
    const revoked = await revokeOidcToken(config, taken.refresh, request.signal)
    return Response.json({ status: "signed_out", remote_revocation: revoked ? "confirmed" : "unconfirmed", ...issuer }, { headers })
  }
  let claims: ProductClaims | null
  try { claims = await currentProductSession(request, store) }
  catch { return errorResponse(503, "product_session_unavailable") }
  if (claims === null) return errorResponse(401, "product_session_required")
  let reserved: Awaited<ReturnType<typeof reserveRefresh>>
  try { reserved = await reserveRefresh(store, claims.id, claims.generation) }
  catch { return errorResponse(503, "product_session_unavailable") }
  if (reserved === null) return errorResponse(409, "product_session_refresh_conflict")
  try {
    const refreshed = await refreshOidcToken(config, reserved.refresh, request.signal)
    await verifyProductIdentity(config, refreshed.access, claims.subject, request.signal)
    const next: ProductClaims = { ...claims, generation: claims.generation + 1, access: refreshed.access,
      accessExpiresAt: Date.now() + refreshed.expiresIn * 1_000 }
    const cookie = await productSessionCookie(next, config.authSecret, config.relay.webOrigin)
    if (!(await finalizeRefresh(store, claims.id, claims.generation, reserved.reservation, refreshed.refresh))) {
      return errorResponse(409, "product_session_refresh_conflict")
    }
    const headers = new Headers({ "cache-control": "private, no-store", "x-request-id": requestId })
    headers.append("set-cookie", cookie)
    return Response.json({ authenticated: true, subject: next.subject, expires_at: next.expiresAt }, { headers })
  } catch {
    await invalidatePending(store, claims.id, reserved.reservation).catch(() => undefined)
    return errorResponse(503, "product_session_refresh_unconfirmed")
  }
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
    (action === "signin" || action === "signout" ? method !== "POST" :
      action === "session" ? false : method !== "GET")) return errorResponse(405, "rp_method_not_allowed")
  const config = oidcRpConfig(process.env)
  if (config === null) return errorResponse(503, "rp_unavailable")
  const expectedPath = `/api/auth/${parts.join("/")}`
  const url = request.nextUrl
  if (url.pathname !== expectedPath || !matchesCanonicalWebRequest(request, config.relay, method)) {
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

  if (action === "session" || action === "signout") {
    if (url.search !== "") return errorResponse(400, "rp_query_rejected")
    return productAction(request, action, config)
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
        console.error("Kokoro RP sign-in response rejected:", response.status,
          location === null ? "no_location" : new URL(location, config.relay.webOrigin).pathname,
          state === null ? "no_state" : "state_ok")
        return errorResponse(403, "rp_signin_rejected")
      }
      await issueOidcState({ redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin, state, setCookies })
      response.headers.set("cache-control", "no-store")
      return response
    } catch { console.error("Kokoro RP sign-in start threw"); return errorResponse(503, "rp_unavailable") }
  }

  const cleanup = rpCleanupCookies(config.relay.secureCookies)
  const query = url.searchParams
  if ([...query.keys()].length !== 3 || parameterOnlyOnce(query, "code") === null ||
    parameterOnlyOnce(query, "state") === null ||
    parameterOnlyOnce(query, "iss") !== config.issuer ||
    !/^[A-Za-z0-9._~-]{1,2048}$/u.test(query.get("code") ?? "")) {
    return errorResponse(400, "rp_callback_rejected", cleanup)
  }
  let consumed: boolean
  try {
    consumed = await consumeOidcState({ redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin,
      state: query.get("state") ?? "", cookieHeader: request.headers.get("cookie") })
  } catch { return errorResponse(503, "rp_unavailable", cleanup) }
  if (!consumed) return errorResponse(403, "rp_transaction_rejected", cleanup)
  let verified: VerifiedOidcTokens | null = null
  try {
    await NextAuth(request, context, oidcAuthOptions(config, (tokens) => { verified = tokens }, request.signal))
  } catch { return errorResponse(503, "rp_unavailable", cleanup) }
  if (verified === null) return errorResponse(403, "rp_callback_rejected", cleanup)
  try {
    const tokens: VerifiedOidcTokens = verified
    await verifyProductIdentity(config, tokens.access, tokens.subject, request.signal)
    const candidate = newSessionCandidate()
    const cookie = await productSessionCookie({ id: candidate.id, generation: 0, access: tokens.access,
      accessExpiresAt: tokens.accessExpiresAt, expiresAt: candidate.expiresAt, subject: tokens.subject },
    config.authSecret, config.relay.webOrigin)
    await createSession({ redisUrl: config.redisUrl, webOrigin: config.relay.webOrigin,
      secret: config.authSecret }, tokens.refresh, candidate)
    const headers = new Headers({ location: "/app", "cache-control": "private, no-store", "referrer-policy": "no-referrer" })
    for (const value of cleanup) headers.append("set-cookie", value)
    headers.append("set-cookie", cookie)
    return new Response(null, { status: 303, headers })
  } catch { return errorResponse(503, "product_session_unavailable", cleanup) }
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
