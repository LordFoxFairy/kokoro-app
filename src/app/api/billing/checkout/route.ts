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
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const checkoutRequestSchema = z.object({ plan_id: z.string().min(1) }).strip()
const bffErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).passthrough(),
}).passthrough()
const checkoutResponseSchema = z.object({
  data: z.object({ checkout_url: z.string().min(1) }).strict(),
}).passthrough()

async function projectBffError(upstream: Response, fallback: string): Promise<Response> {
  const parsed = bffErrorEnvelopeSchema.safeParse(await upstream.clone().json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: fallback }, { status: upstream.status })
  return NextResponse.json({ error: parsed.data.error.message, code: parsed.data.error.code }, { status: upstream.status })
}

export async function POST(request: Request): Promise<Response> {
  const config = authConfig()
  if (config === null) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  if (!sameOriginOk(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  const envelope = readEnvelope(request, config)
  if (envelope === null) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (config.bffBaseUrl == null) return NextResponse.json({ error: "business_bff_not_configured" }, { status: 503 })

  const parsed = checkoutRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const requestId = request.headers.get("x-kokoro-request-id") || randomUUID()
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
    return NextResponse.json({ error: "billing_unreachable" }, { status: 502 })
  }
  if (!upstream.ok) return projectBffError(upstream, "checkout_failed")
  const checkout = checkoutResponseSchema.safeParse(await upstream.json().catch(() => null))
  if (!checkout.success) return NextResponse.json({ error: "billing_bad_response" }, { status: 502 })
  return NextResponse.json({ checkout_url: checkout.data.data.checkout_url }, { status: 200 })
}
