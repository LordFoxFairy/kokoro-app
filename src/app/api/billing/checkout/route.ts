// Billing checkout BFF: browser intent is validated here, then delegated to
// kokoro-bff. Quote, identity, provider and idempotency facts remain server-owned.

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import {
  authConfig,
  INTERNAL_SECRET_HEADER,
  readEnvelope,
  sameOriginOk,
  SERVICE_HEADER,
  SERVICE_VALUE,
} from "@/lib/server/auth"
import {
  bffErrorEnvelopeSchema,
  bffErrorResponse,
  bffSuccessEnvelopeSchema,
  requestIdForRequest,
  upstreamResponseHeaders,
  webErrorResponse,
} from "@/lib/server/bff-response"
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const checkoutRequestSchema = z.object({ plan_id: z.string().min(1) }).strip()
const checkoutResponseSchema = bffSuccessEnvelopeSchema(z.object({ checkout_url: z.string().min(1) }).strict())

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdForRequest(request)
  const config = authConfig()
  if (config === null) return webErrorResponse("auth_not_configured", 503, requestId)
  if (!sameOriginOk(request)) return webErrorResponse("forbidden_origin", 403, requestId)
  const envelope = readEnvelope(request, config)
  if (envelope === null) return webErrorResponse("unauthenticated", 401, requestId)
  if (config.bffBaseUrl == null) return webErrorResponse("business_bff_not_configured", 503, requestId)

  const parsed = checkoutRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return webErrorResponse("invalid_body", 400, requestId)

  const headers = new Headers({
    "content-type": "application/json",
    [SERVICE_HEADER]: SERVICE_VALUE,
    ["x-kokoro-namespace"]: envelope.namespace,
    ["x-kokoro-principal-id"]: envelope.user_id,
    ["x-kokoro-request-id"]: requestId,
    ["idempotency-key"]: request.headers.get("idempotency-key")?.trim() || `web-checkout:${envelope.user_id}:${randomUUID()}`,
  })
  if (config.internalSecret !== null) headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)

  let upstream: Response
  try {
    upstream = await fetchWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/billing/checkout`, config.domain, {
      method: "POST", headers, body: JSON.stringify(parsed.data), cache: "no-store", signal: request.signal,
    })
  } catch {
    return webErrorResponse("billing_unreachable", 502, requestId)
  }
  const raw: unknown = await upstream.json().catch(() => null)
  if (!upstream.ok || bffErrorEnvelopeSchema.safeParse(raw).success) {
    return bffErrorResponse(upstream, raw, "checkout_failed", requestId, upstreamResponseHeaders(upstream, requestId))
  }
  const checkout = checkoutResponseSchema.safeParse(raw)
  if (!checkout.success) return webErrorResponse("billing_bad_response", 502, requestId)
  return NextResponse.json({ checkout_url: checkout.data.data.checkout_url }, {
    status: 200,
    headers: upstreamResponseHeaders(upstream, checkout.data.meta.request_id),
  })
}
