import {
  interactionError, interactionMethodNotAllowed, interactionNavigation,
  interactionUpstreamHeaders, prepareInteraction,
} from "@/lib/server/iam-interaction-route"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { oidcLoginRecovery } from "@/lib/server/oidc-login-recovery"
import { requestIamRelay, type IamRelayUpstream } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = "/iam/interactions/select-tenant"

function fixedTenantId(): string | null {
  const value = process.env.KOKORO_TENANT_ID?.trim()
  return value !== undefined && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null
}

function upstreamFailure(upstream: IamRelayUpstream, id: string): Response {
  const status = upstream.status
  let classification = "unclassified"
  // Only this fixed native OAuth code is diagnostic, never an authorization input.
  // Do not print arbitrary upstream messages or retain credential-bearing bodies.
  if (upstream.body.byteLength <= 4096 && /^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "")) {
    try {
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(upstream.body))
      if (typeof value === "object" && value !== null && !Array.isArray(value) &&
        "error" in value && value.error === "invalid_grant") classification = "invalid_grant"
    } catch { /* Unrecognized data remains a fixed diagnostic category. */ }
  }
  console.warn("Kokoro tenant continuation rejected:", "upstream_status", status, classification)
  if (status === 401) return interactionError(401, "iam_interaction_sign_in_required", id)
  if (status === 403) return interactionError(403, "iam_interaction_tenant_forbidden", id)
  if (status === 429) return interactionError(429, "iam_interaction_rate_limited", id)
  return interactionError(503, "iam_interaction_unavailable", id)
}

async function continueTenant(request: Request): Promise<Response> {
  const context = prepareInteraction(request, PAGE_PATH, "GET")
  if (context instanceof Response) return context
  const tenantId = fixedTenantId()
  if (tenantId === null) return interactionError(503, "iam_interaction_tenant_not_configured", context.id)
  if (context.issuerCookie === "") return interactionError(401, "iam_interaction_sign_in_required", context.id)

  let phase = "upstream_transport"
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
    phase = "continuation_validation"
    if (changed.status !== 200 && changed.status !== 302) return upstreamFailure(changed, context.id)
    const continuation = interactionNavigation(changed, context, PAGE_PATH)
    if (continuation === null) return interactionError(502, "iam_interaction_response_invalid", context.id)
    const target = continuation.headers.get("location")
    if (target === null || new URL(target, context.config.webOrigin).pathname === "/auth/select-tenant") {
      return interactionError(502, "iam_interaction_continuation_loop", context.id)
    }
    return continuation
  } catch {
    console.warn("Kokoro tenant continuation rejected:", phase)
    return interactionError(503, "iam_interaction_unavailable", context.id)
  }
}

export async function GET(request: Request): Promise<Response> {
  const response = await continueTenant(request)
  // Never retry a tenant mutation or clear another transaction after an
  // unconfirmed continuation. Native documents leave the protocol URL;
  // JSON, q=0 and non-navigation clients retain their original rejection.
  return response.status >= 400 ? oidcLoginRecovery(request) ?? response : response
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
