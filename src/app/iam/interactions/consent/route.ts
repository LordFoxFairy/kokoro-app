import { consumeIamInteractionCsrf, iamCsrfCookieName, issueIamInteractionCsrf } from "@/lib/server/iam-interaction-csrf"
import { iamInteractionDocument } from "@/lib/server/iam-interaction-page"
import {
  boundedInteractionForm, csrfCookieValue, escapeInteractionHtml, interactionError,
  interactionMethodNotAllowed, interactionNavigation, interactionUpstreamHeaders, prepareInteraction,
} from "@/lib/server/iam-interaction-route"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { validIamRpCallbackNavigation } from "@/lib/server/iam-relay-response"
import { requestIamRelay, type IamRelayUpstream } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = "/iam/interactions/consent"

export function HEAD(): Response {
  return interactionMethodNotAllowed("GET, POST")
}

export function OPTIONS(): Response {
  return interactionMethodNotAllowed("GET, POST")
}

function requestedScope(query: string): string | null {
  const values = new URLSearchParams(query.slice(1)).getAll("scope")
  if (values.length !== 1) return null
  const value = values[0] ?? ""
  if (Buffer.byteLength(value) > 1024 || !/^[A-Za-z0-9:_.-]+(?: [A-Za-z0-9:_.-]+)*$/u.test(value)) return null
  const scopes = value.split(" ")
  return new Set(scopes).size === scopes.length ? value : null
}

function upstreamFailure(status: number, id: string): Response {
  const safeStatus = status === 401 ? 401 : status === 429 ? 429 : 503
  const code = safeStatus === 401 ? "iam_interaction_sign_in_required" : safeStatus === 429 ? "iam_interaction_rate_limited" : "iam_interaction_unavailable"
  return interactionError(safeStatus, code, id)
}

function unavailableCallback(upstream: IamRelayUpstream, webOrigin: string): boolean {
  let location: unknown
  if (upstream.status === 302) location = upstream.headers.get("location")
  else if (upstream.status === 200 && /^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "")) {
    try {
      const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(upstream.body))
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false
      const fields = payload as Record<string, unknown>
      if (Object.keys(fields).sort().join(",") !== "redirect,url" || fields.redirect !== true) return false
      location = fields.url
    } catch { return false }
  }
  return typeof location === "string" && !validIamRpCallbackNavigation(location, webOrigin) &&
    (location.startsWith(`${webOrigin}/api/auth/callback/kokoro-iam?`) ||
      location.startsWith("/api/auth/callback/kokoro-iam?")) &&
    !location.includes("#") && !location.includes("\\") && Buffer.byteLength(location) <= IAM_RELAY_POLICY.maxQueryBytes
}

export async function GET(request: Request): Promise<Response> {
  const context = prepareInteraction(request, PAGE_PATH, "GET")
  if (context instanceof Response) return context
  const scope = requestedScope(context.query)
  if (scope === null) return interactionError(400, "iam_interaction_scope_rejected", context.id)
  try {
    const proof = await issueIamInteractionCsrf({
      redisUrl: context.redisUrl, webOrigin: context.config.webOrigin, path: PAGE_PATH, method: "POST",
      query: context.query, issuerCookie: context.issuerCookie, secureCookies: context.config.secureCookies,
    })
    const items = scope.split(" ").map((item) => `<li>${escapeInteractionHtml(item)}</li>`).join("")
    const form = `<ul class="scope-list">${items}</ul><form class="auth-form" method="post" action="${escapeInteractionHtml(`${PAGE_PATH}${context.query}`)}"><input type="hidden" name="csrf_token" value="${escapeInteractionHtml(proof.token)}"><div class="actions"><button type="submit" name="decision" value="agree">Agree and continue</button><button class="secondary" type="submit" name="decision" value="decline">Decline</button></div></form>`
    const html = iamInteractionDocument({ title: "Review access", heading: "Review requested access", description: "The identity provider validates this signed request when you continue.", trustedFormHtml: form })
    return new Response(html, { status: 200, headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-request-id": context.id,
      "set-cookie": proof.cookie,
    } })
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
}

export async function POST(request: Request): Promise<Response> {
  const context = prepareInteraction(request, PAGE_PATH, "POST")
  if (context instanceof Response) return context
  const scope = requestedScope(context.query)
  if (scope === null) return interactionError(400, "iam_interaction_scope_rejected", context.id)
  const form = await boundedInteractionForm(request, ["csrf_token", "decision"])
  if (form === null) return interactionError(400, "iam_interaction_body_rejected", context.id)
  if (form.get("decision") !== "agree") return interactionError(403, "iam_interaction_consent_declined", context.id)
  try {
    const valid = await consumeIamInteractionCsrf({
      redisUrl: context.redisUrl, webOrigin: context.config.webOrigin, path: PAGE_PATH, method: "POST",
      query: context.query, issuerCookie: context.issuerCookie,
      cookieToken: csrfCookieValue(request.headers.get("cookie"), iamCsrfCookieName()), formToken: form.get("csrf_token"),
    })
    if (!valid) return interactionError(403, "iam_interaction_csrf_rejected", context.id)
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
  try {
    const headers = interactionUpstreamHeaders(context)
    headers.set("content-type", "application/json")
    const upstream = await requestIamRelay({
      url: `${context.config.bffOrigin}/iam/oauth2/consent`, method: "POST", headers,
      body: new TextEncoder().encode(JSON.stringify({ accept: true, scope, oauth_query: context.query.slice(1) })),
      signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes, maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes,
      maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    if (upstream.status !== 200 && upstream.status !== 302) return upstreamFailure(upstream.status, context.id)
    if (unavailableCallback(upstream, context.config.webOrigin)) return interactionError(503, "rp_callback_unavailable", context.id)
    return interactionNavigation(upstream, context, PAGE_PATH) ?? interactionError(502, "iam_interaction_response_invalid", context.id)
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
}
