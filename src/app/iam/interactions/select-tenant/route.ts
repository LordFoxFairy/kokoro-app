import { consumeIamInteractionCsrf, iamCsrfCookieName, issueIamInteractionCsrf } from "@/lib/server/iam-interaction-csrf"
import {
  boundedInteractionForm, csrfCookieValue, escapeInteractionHtml, interactionError,
  interactionMethodNotAllowed, interactionNavigation, interactionUpstreamHeaders, issuerCookieAfter,
  prepareInteraction, type InteractionContext,
} from "@/lib/server/iam-interaction-route"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { nativeIamResponse } from "@/lib/server/iam-relay-response"
import { requestIamRelay, type IamRelayUpstream } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = "/iam/interactions/select-tenant"
type Tenant = Readonly<{ id: string; name: string }>

export function HEAD(): Response {
  return interactionMethodNotAllowed("GET, POST")
}

export function OPTIONS(): Response {
  return interactionMethodNotAllowed("GET, POST")
}

function upstreamFailure(status: number, id: string): Response {
  const safeStatus = status === 401 ? 401 : status === 429 ? 429 : 503
  const code = safeStatus === 401 ? "iam_interaction_sign_in_required" : safeStatus === 429 ? "iam_interaction_rate_limited" : "iam_interaction_unavailable"
  return interactionError(safeStatus, code, id)
}

function parseTenants(upstream: IamRelayUpstream): Tenant[] | null {
  if (upstream.status !== 200 || !/^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "")) return null
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(upstream.body))
    if (!Array.isArray(value) || value.length > 100) return null
    const ids = new Set<string>()
    const tenants: Tenant[] = []
    for (const item of value as unknown[]) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null
      const record = item as Record<string, unknown>
      if (typeof record.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(record.id) ||
        typeof record.name !== "string" || record.name.length < 1 || record.name.length > 256 ||
        /[\u0000-\u001f\u007f]/u.test(record.name) || ids.has(record.id) || typeof record.status !== "string") return null
      ids.add(record.id)
      if (record.status === "active") tenants.push({ id: record.id, name: record.name })
    }
    return tenants.sort((a, b) => a.id.localeCompare(b.id))
  } catch { return null }
}

async function listTenants(context: InteractionContext, signal: AbortSignal): Promise<IamRelayUpstream> {
  return requestIamRelay({
    url: `${context.config.bffOrigin}/iam/organization/list`, method: "GET",
    headers: interactionUpstreamHeaders(context), signal,
    timeoutMs: IAM_RELAY_POLICY.maxDurationMs, maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes,
    maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
  })
}

export async function GET(request: Request): Promise<Response> {
  const context = prepareInteraction(request, PAGE_PATH, "GET")
  if (context instanceof Response) return context
  try {
    const upstream = await listTenants(context, request.signal)
    if (upstream.status !== 200) return upstreamFailure(upstream.status, context.id)
    const native = nativeIamResponse(upstream, context.config.webOrigin, context.config.secureCookies, context.id)
    const tenants = parseTenants(upstream)
    if (native === null || tenants === null) return interactionError(502, "iam_interaction_response_invalid", context.id)
    const ids = tenants.map((tenant) => tenant.id).join(",")
    const proof = await issueIamInteractionCsrf({
      redisUrl: context.redisUrl, webOrigin: context.config.webOrigin, path: PAGE_PATH, method: "POST",
      query: context.query, issuerCookie: issuerCookieAfter(context.issuerCookie, upstream.setCookies), context: ids,
      secureCookies: context.config.secureCookies,
    })
    const action = escapeInteractionHtml(`${PAGE_PATH}${context.query}`)
    const choices = tenants.map((tenant) => `<option value="${escapeInteractionHtml(tenant.id)}">${escapeInteractionHtml(tenant.name)}</option>`).join("")
    const content = tenants.length === 0 ? "<p>No active tenants are available.</p>" :
      `<label>Tenant <select name="organization_id" required>${choices}</select></label><button type="submit">Continue</button>`
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Select tenant</title></head><body><main><h1>Select tenant</h1><form method="post" action="${action}"><input type="hidden" name="csrf_token" value="${proof.token}"><input type="hidden" name="tenant_ids" value="${escapeInteractionHtml(ids)}">${content}</form></main></body></html>`
    const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-request-id": context.id })
    for (const cookie of native.headers.getSetCookie()) headers.append("set-cookie", cookie)
    headers.append("set-cookie", proof.cookie)
    return new Response(html, { status: 200, headers })
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
}

export async function POST(request: Request): Promise<Response> {
  const context = prepareInteraction(request, PAGE_PATH, "POST")
  if (context instanceof Response) return context
  const form = await boundedInteractionForm(request, ["csrf_token", "tenant_ids", "organization_id"])
  if (form === null) return interactionError(400, "iam_interaction_body_rejected", context.id)
  const ids = form.get("tenant_ids") ?? ""
  const selected = form.get("organization_id") ?? ""
  if (ids.length > 12_900 || !/^[A-Za-z0-9_,-]*$/u.test(ids) || !/^[A-Za-z0-9_-]{1,128}$/u.test(selected) ||
    !ids.split(",").includes(selected)) return interactionError(400, "iam_interaction_selection_rejected", context.id)
  try {
    const valid = await consumeIamInteractionCsrf({
      redisUrl: context.redisUrl, webOrigin: context.config.webOrigin, path: PAGE_PATH, method: "POST",
      query: context.query, issuerCookie: context.issuerCookie, context: ids,
      cookieToken: csrfCookieValue(request.headers.get("cookie"), iamCsrfCookieName()), formToken: form.get("csrf_token"),
    })
    if (!valid) return interactionError(403, "iam_interaction_csrf_rejected", context.id)
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
  try {
    const listed = await listTenants(context, request.signal)
    if (listed.status !== 200) return upstreamFailure(listed.status, context.id)
    const nativeList = nativeIamResponse(listed, context.config.webOrigin, context.config.secureCookies, context.id)
    const tenants = parseTenants(listed)
    if (nativeList === null || tenants === null) return interactionError(502, "iam_interaction_response_invalid", context.id)
    if (!tenants.some((tenant) => tenant.id === selected)) return interactionError(403, "iam_interaction_selection_rejected", context.id)
    const headers = interactionUpstreamHeaders({ ...context, issuerCookie: issuerCookieAfter(context.issuerCookie, listed.setCookies) })
    headers.set("content-type", "application/json")
    const changed = await requestIamRelay({
      url: `${context.config.bffOrigin}/iam/organization/set-active`, method: "POST", headers,
      body: new TextEncoder().encode(JSON.stringify({ organizationId: selected, oauth_query: context.query.slice(1) })),
      signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes, maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes,
      maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    if (changed.status !== 200 && changed.status !== 302) return upstreamFailure(changed.status, context.id)
    if (nativeIamResponse(changed, context.config.webOrigin, context.config.secureCookies, context.id) === null) {
      return interactionError(502, "iam_interaction_response_invalid", context.id)
    }
    const cookies = new Map<string, string>()
    for (const cookie of [...listed.setCookies, ...changed.setCookies]) cookies.set(cookie.slice(0, cookie.indexOf("=")), cookie)
    return interactionNavigation({ ...changed, setCookies: [...cookies.values()] }, context, PAGE_PATH) ??
      interactionError(502, "iam_interaction_response_invalid", context.id)
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
}
