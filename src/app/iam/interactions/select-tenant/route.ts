import {
  interactionError, interactionMethodNotAllowed, interactionNavigation,
  interactionUpstreamHeaders, prepareInteraction,
} from "@/lib/server/iam-interaction-route"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { requestIamRelay } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = "/iam/interactions/select-tenant"

function fixedTenantId(): string | null {
  const value = process.env.KOKORO_TENANT_ID?.trim()
  return value !== undefined && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null
}

function upstreamFailure(status: number, id: string): Response {
  if (status === 401) return interactionError(401, "iam_interaction_sign_in_required", id)
  if (status === 403) return interactionError(403, "iam_interaction_tenant_forbidden", id)
  if (status === 429) return interactionError(429, "iam_interaction_rate_limited", id)
  return interactionError(503, "iam_interaction_unavailable", id)
}

export async function GET(request: Request): Promise<Response> {
  const context = prepareInteraction(request, PAGE_PATH, "GET")
  if (context instanceof Response) return context
  const tenantId = fixedTenantId()
  if (tenantId === null) return interactionError(503, "iam_interaction_tenant_not_configured", context.id)
  if (context.issuerCookie === "") return interactionError(401, "iam_interaction_sign_in_required", context.id)

  try {
    const headers = interactionUpstreamHeaders(context)
    headers.set("content-type", "application/json")
    const changed = await requestIamRelay({
      url: `${context.config.bffOrigin}/iam/organization/set-active`, method: "POST", headers,
      body: new TextEncoder().encode(JSON.stringify({ organizationId: tenantId, oauth_query: context.query.slice(1) })),
      signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes, maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes,
      maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    if (changed.status !== 200 && changed.status !== 302) return upstreamFailure(changed.status, context.id)
    const continuation = interactionNavigation(changed, context, PAGE_PATH)
    if (continuation === null) return interactionError(502, "iam_interaction_response_invalid", context.id)
    const target = continuation.headers.get("location")
    if (target === null || new URL(target, context.config.webOrigin).pathname === "/auth/select-tenant") {
      return interactionError(502, "iam_interaction_continuation_loop", context.id)
    }
    return continuation
  } catch { return interactionError(503, "iam_interaction_unavailable", context.id) }
}

export function HEAD(): Response {
  return interactionMethodNotAllowed("GET")
}

export function OPTIONS(): Response {
  return interactionMethodNotAllowed("GET")
}

export function POST(): Response {
  return interactionMethodNotAllowed("GET")
}
