// Local mock checkout confirmation. The Web delegates to kokoro-bff so the
// browser never signs or sends a provider webhook directly.

import { NextResponse } from "next/server"
import { z } from "zod"

import { authConfig, INTERNAL_SECRET_HEADER, readEnvelope, sameOriginOk, SERVICE_HEADER, SERVICE_VALUE } from "@/lib/server/auth"
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mockPayRequestSchema = z.object({ order_id: z.string().min(1) }).strip()
const responseSchema = z.object({ data: z.object({ ok: z.boolean() }).strict() }).passthrough()

export async function POST(request: Request): Promise<Response> {
  const config = authConfig()
  if (config === null) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  if (!sameOriginOk(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  const envelope = readEnvelope(request, config)
  if (envelope === null) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (process.env.NODE_ENV === "production" || config.bffBaseUrl == null) {
    return NextResponse.json({ error: "mock_pay_unavailable" }, { status: 503 })
  }
  const parsed = mockPayRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const headers = new Headers({
    "content-type": "application/json",
    [SERVICE_HEADER]: SERVICE_VALUE,
    ["x-kokoro-namespace"]: envelope.namespace,
    ["x-kokoro-principal-id"]: envelope.user_id,
    ["x-kokoro-request-id"]: request.headers.get("x-kokoro-request-id") || crypto.randomUUID(),
  })
  if (config.internalSecret !== null) headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)
  let upstream: Response
  try {
    upstream = await fetchWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/billing/mock-pay`, config.domain, {
      method: "POST", headers, body: JSON.stringify(parsed.data), cache: "no-store", signal: request.signal,
    })
  } catch {
    return NextResponse.json({ error: "billing_unreachable" }, { status: 502 })
  }
  if (!upstream.ok) return NextResponse.json({ error: "mock_pay_failed" }, { status: 502 })
  const body = responseSchema.safeParse(await upstream.json().catch(() => null))
  if (!body.success || !body.data.data.ok) return NextResponse.json({ error: "billing_bad_response" }, { status: 502 })
  return NextResponse.json({ ok: true }, { status: 200 })
}
