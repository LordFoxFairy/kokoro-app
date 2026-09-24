// Billing catalog BFF: the Web only calls kokoro-bff. Billing itself remains an
// independent owner behind that business boundary; no direct service fallback is
// allowed in the Web process.

import { NextResponse } from "next/server"
import { z } from "zod"

import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
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

const bffPlansEnvelopeSchema = bffSuccessEnvelopeSchema(
  z
    .object({
      plans: z.array(
        z
          .object({
            id: z.string().min(1),
            key: z.string().min(1),
            name: z.string().min(1),
            currency: z.string().min(1),
            amount_minor: z.string().min(1),
            credit_micros: z.string().min(1),
            billing_interval: z.enum(["once", "month", "year"]),
          })
          .strict(),
      ),
    })
    .strict(),
)

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdForRequest(request)
  const config = productBffConfig()
  if (config === null) return webErrorResponse("auth_not_configured", 503, requestId)
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return webErrorResponse("session_unavailable", 503, requestId)
  }
  if (claims === null) return webErrorResponse("unauthenticated", 401, requestId)
  if (config.bffBaseUrl == null) return webErrorResponse("business_bff_not_configured", 503, requestId)

  const headers = productBffHeaders(config, claims, requestId)

  let upstream: Response
  try {
    upstream = await fetchWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/billing/plans`, config.domain, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: request.signal,
    })
  } catch {
    return webErrorResponse("billing_unreachable", 502, requestId)
  }
  const raw: unknown = await upstream.json().catch(() => null)
  if (!upstream.ok || bffErrorEnvelopeSchema.safeParse(raw).success) {
    return bffErrorResponse(upstream, raw, "billing_error", requestId, upstreamResponseHeaders(upstream, requestId))
  }
  const parsed = bffPlansEnvelopeSchema.safeParse(raw)
  if (!parsed.success) return webErrorResponse("billing_bad_response", 502, requestId)
  return NextResponse.json(
    { plans: parsed.data.data.plans },
    {
      status: 200,
      headers: upstreamResponseHeaders(upstream, parsed.data.meta.request_id),
    },
  )
}
