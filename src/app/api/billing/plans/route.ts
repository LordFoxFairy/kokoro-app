// Billing catalog BFF: the Web only calls kokoro-bff. Billing itself remains an
// independent owner behind that business boundary; no direct service fallback is
// allowed in the Web process.

import { NextResponse } from "next/server"
import { z } from "zod"

import { authConfig, INTERNAL_SECRET_HEADER, readEnvelope, SERVICE_HEADER, SERVICE_VALUE } from "@/lib/server/auth"
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bffErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).passthrough(),
}).passthrough()

const bffPlansEnvelopeSchema = z.object({
  data: z.object({
    plans: z.array(z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      name: z.string().min(1),
      currency: z.string().min(1),
      amount_minor: z.string().min(1),
      credit_micros: z.string().min(1),
      billing_interval: z.enum(["once", "month", "year"]),
    }).strict()),
  }).strict(),
}).passthrough()

async function projectBffError(upstream: Response, fallback: string): Promise<Response> {
  const parsed = bffErrorEnvelopeSchema.safeParse(await upstream.clone().json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: fallback }, { status: upstream.status })
  return NextResponse.json({ error: parsed.data.error.message, code: parsed.data.error.code }, { status: upstream.status })
}

export async function GET(request: Request): Promise<Response> {
  const config = authConfig()
  if (config === null) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  const envelope = readEnvelope(request, config)
  if (envelope === null) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (config.bffBaseUrl == null) return NextResponse.json({ error: "business_bff_not_configured" }, { status: 503 })

  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()
  const headers = new Headers({
    [SERVICE_HEADER]: SERVICE_VALUE,
    ["x-kokoro-namespace"]: envelope.namespace,
    ["x-kokoro-principal-id"]: envelope.user_id,
    ["x-kokoro-request-id"]: requestId,
  })
  if (config.internalSecret !== null) headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)

  let upstream: Response
  try {
    upstream = await fetchWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/billing/plans`, config.domain, {
      method: "GET", headers, cache: "no-store", signal: request.signal,
    })
  } catch {
    return NextResponse.json({ error: "billing_unreachable" }, { status: 502 })
  }
  if (!upstream.ok) return projectBffError(upstream, "billing_error")
  const parsed = bffPlansEnvelopeSchema.safeParse(await upstream.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "billing_bad_response" }, { status: 502 })
  return NextResponse.json({ plans: parsed.data.data.plans }, { status: 200 })
}
