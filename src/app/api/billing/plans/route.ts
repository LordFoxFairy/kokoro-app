// 套餐目录 BFF：Billing 迁移面优先；未配置时回退到旧 payment GET /plans，支持双读切换。
// 两个外部边界都校验响应形状，浏览器只见同源 snake_case 契约。
// 把 camelCase + {data} 信封归一成 web 面 snake_case {plans}，浏览器只见同源 `/api/billing/plans`。
// 两个后端都未配置（预览档）→ 503，展示层据此渲染「支付暂未开通」诚实态。

import { NextResponse } from "next/server"
import { z } from "zod"

import { authConfig, INTERNAL_SECRET_HEADER, readEnvelope, SERVICE_HEADER, SERVICE_VALUE } from "@/lib/server/auth"
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// payment storefront 响应（camelCase + {data} 信封）：未知字段默认剥离，形状不符即抛 → BFF 归 502。
const paymentPlansEnvelopeSchema = z.object({
  data: z.object({
    plans: z.array(
      z.object({
        id: z.string().min(1),
        key: z.string().min(1),
        name: z.string().min(1),
        currency: z.string().min(1),
        amountMinor: z.string().min(1),
        creditMicros: z.string().min(1),
        billingInterval: z.enum(["once", "month", "year"]),
      }),
    ),
  }),
})

export async function GET(request: Request): Promise<Response> {
  const config = authConfig()
  if (config === null) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  }
  const envelope = readEnvelope(request, config)
  if (envelope === null) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  const baseUrl = config.billingBaseUrl ?? config.paymentBaseUrl
  if (baseUrl === null) {
    // 未接 Billing/旧 payment 服务：价格目录不可用，展示层据此降级为未开通态。
    return NextResponse.json({ error: "payment_not_configured" }, { status: 503 })
  }
  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()

  const headers = new Headers()
  headers.set(SERVICE_HEADER, SERVICE_VALUE)
  if (config.internalSecret !== null) {
    headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)
  }
  if (config.billingBaseUrl !== null) {
    headers.set("authorization", `Bearer ${envelope.runtime_jwt}`)
  } else {
    headers.set("x-kokoro-subject", envelope.user_id)
  }
  headers.set("x-kokoro-request-id", requestId)

  const target = config.billingBaseUrl !== null
    ? `${baseUrl.replace(/\/+$/, "")}/billing/plans`
    : `${baseUrl.replace(/\/+$/, "")}/plans`
  let upstream: Response
  try {
    upstream = await fetchWithDomain(target, config.domain, { method: "GET", headers, cache: "no-store", signal: request.signal })
  } catch {
    return NextResponse.json({ error: "payment_unreachable" }, { status: 502 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "payment_error" }, { status: 502 })
  }
  let raw: unknown
  try {
    raw = await upstream.json()
  } catch {
    return NextResponse.json({ error: "payment_bad_response" }, { status: 502 })
  }
  const parsed = paymentPlansEnvelopeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "payment_bad_response" }, { status: 502 })
  }
  // camelCase → web 面 snake_case（与 billing_summary 等 web 契约同风格）。
  const plans = parsed.data.data.plans.map((plan) => ({
    id: plan.id,
    key: plan.key,
    name: plan.name,
    currency: plan.currency,
    amount_minor: plan.amountMinor,
    credit_micros: plan.creditMicros,
    billing_interval: plan.billingInterval,
  }))
  return NextResponse.json({ plans }, { status: 200 })
}
