import { NextResponse } from "next/server"
import { z } from "zod"

import { bffErrorEnvelopeSchema, bffSuccessEnvelopeSchema, requestIdForRequest, webErrorResponse } from "@/lib/server/bff-response"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const currentUserSchema = bffSuccessEnvelopeSchema(z.object({
  user_id: z.string().min(1),
  tenant_id: z.string().min(1),
  platform_admin: z.boolean(),
}).strict())

/** Read-only UI capability projection; BFF/IAM remain the authorization boundary. */
export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdForRequest(request)
  const config = productBffConfig()
  if (config === null) return webErrorResponse("admin_access_unavailable", 503, requestId)
  const claims = await admittedProductSession(request, config).catch(() => null)
  if (claims === null) return webErrorResponse("unauthenticated", 401, requestId)
  let upstream: Response
  try {
    upstream = await fetchWithDomain(`${config.bffBaseUrl}/v1/me`, config.domain, {
      method: "GET", headers: productBffHeaders(config, claims, requestId), cache: "no-store", signal: request.signal,
    })
  } catch { return webErrorResponse("admin_access_unavailable", 503, requestId) }
  const raw: unknown = await upstream.json().catch(() => null)
  if (!upstream.ok || bffErrorEnvelopeSchema.safeParse(raw).success) return webErrorResponse("admin_access_unavailable", 503, requestId)
  const parsed = currentUserSchema.safeParse(raw)
  if (!parsed.success || parsed.data.data.user_id !== claims.subject) return webErrorResponse("admin_access_unavailable", 503, requestId)
  return NextResponse.json({
    platform_admin: parsed.data.data.platform_admin,
    user_id: parsed.data.data.user_id,
    tenant_id: parsed.data.data.tenant_id,
    ...(parsed.data.data.platform_admin ? { manage_url: "/manage" } : {}),
  }, {
    headers: { "cache-control": "private, no-store", "x-request-id": parsed.data.meta.request_id },
  })
}
