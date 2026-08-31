// 收银台 BFF（PAY-2）：读信封 → 派生 teamId（=信封 namespace，team 运行时键，浏览器无从伪造）
// → Billing target 注入 IAM runtime JWT（legacy Payment fallback 保留 web-bff caller 凭据）→ 转发 checkout。诚实态优先：
// provider 未配置时 payment 回 501（未开通），BFF 原样透传 501，浏览器据此禁用购买按钮（非假按钮）。
// 购买要求登录：无信封 → 401（未登录不可买）。变更类请求校验同源 Origin。

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

// 浏览器只提交 plan_id；owner 一律信封派生。显式 .strip()：即便请求夹带 teamId/domain 等身份字段，
// 一律剥离无视（绝不接收浏览器传来的身份轴），杜绝伪造。
const checkoutRequestSchema = z.object({ plan_id: z.string().min(1) }).strip()

// 旧 payment checkout 成功：{data:{checkoutUrl}}。
const paymentCheckoutOkSchema = z.object({ data: z.object({ checkoutUrl: z.string().min(1) }) })
const billingPlansSchema = z.object({ data: z.object({ plans: z.array(z.object({ id: z.string().min(1), key: z.string().min(1), name: z.string().min(1), currency: z.string().regex(/^[A-Z]{3}$/u), amountMinor: z.string().regex(/^\d+$/u), creditMicros: z.string().regex(/^\d+$/u), billingInterval: z.enum(["once", "month", "year"]) }) ) }) })
// Billing adapters in the migration window emit amountMinor as either a JSON
// number or a decimal string; both represent the same immutable quote value.
const moneyMinorSchema = z.union([z.string().regex(/^\d+$/u), z.number().int().nonnegative()])
const billingCheckoutSchema = z.object({ data: z.object({ checkoutId: z.string().min(1), status: z.string(), amountMinor: moneyMinorSchema, currency: z.string(), checkoutUrl: z.string().url().optional() }) })

export async function POST(request: Request): Promise<Response> {
  const config = authConfig()
  if (config === null) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  }
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  }
  const envelope = readEnvelope(request, config)
  if (envelope === null) {
    // 购买要求登录：未登录不可买（诚实态，不放行匿名下单）。
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  const baseUrl = config.billingBaseUrl ?? config.paymentBaseUrl
  if (baseUrl === null) {
    return NextResponse.json({ error: "payment_not_configured" }, { status: 503 })
  }
  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const parsed = checkoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const headers = new Headers()
  headers.set("content-type", "application/json")
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

  if (config.billingBaseUrl !== null) {
    // Resolve the mutable plan key to a published immutable offer revision before
    // creating checkout. The browser never supplies amount or credit quantity.
    let plansResponse: Response
    try {
      plansResponse = await fetchWithDomain(`${baseUrl.replace(/\/+$/, "")}/billing/plans`, config.domain, { method: "GET", headers, cache: "no-store", signal: request.signal })
    } catch {
      return NextResponse.json({ error: "billing_unreachable" }, { status: 502 })
    }
    if (!plansResponse.ok) return NextResponse.json({ error: "billing_catalog_unavailable" }, { status: 502 })
    let plansRaw: unknown
    try { plansRaw = await plansResponse.json() } catch { return NextResponse.json({ error: "billing_bad_response" }, { status: 502 }) }
    const plans = billingPlansSchema.safeParse(plansRaw)
    const plan = plans.success ? plans.data.data.plans.find((candidate) => candidate.id === parsed.data.plan_id) : undefined
    if (!plan) return NextResponse.json({ error: "plan_not_found" }, { status: 404 })
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || `web-checkout:${envelope.user_id}:${plan.id}:${randomUUID()}`
    headers.set("idempotency-key", idempotencyKey)
    const target = `${baseUrl.replace(/\/+$/, "")}/billing/checkout`
    const upstreamBody = JSON.stringify({
      offerRevisionId: plan.id,
      amountMinor: plan.amountMinor,
      currency: plan.currency,
      quoteSnapshot: { id: plan.id, key: plan.key, name: plan.name, amountMinor: plan.amountMinor, creditMicros: plan.creditMicros, billingInterval: plan.billingInterval },
    })
    let upstream: Response
    try { upstream = await fetchWithDomain(target, config.domain, { method: "POST", headers, body: upstreamBody, cache: "no-store", signal: request.signal }) } catch { return NextResponse.json({ error: "billing_unreachable" }, { status: 502 }) }
    if (!upstream.ok) return NextResponse.json({ error: "checkout_failed" }, { status: 502 })
    let raw: unknown
    try { raw = await upstream.json() } catch { return NextResponse.json({ error: "billing_bad_response" }, { status: 502 }) }
    const checkout = billingCheckoutSchema.safeParse(raw)
    if (!checkout.success) return NextResponse.json({ error: "billing_bad_response" }, { status: 502 })
    // The local fixture checkout page drives the same Billing mock webhook; a real provider
    // deployment replaces this URL with the provider-hosted checkout URL at the adapter edge.
    return NextResponse.json({ checkout_url: checkout.data.data.checkoutUrl ?? `/billing/pay/${checkout.data.data.checkoutId}` }, { status: 200 })
  }

  const target = `${baseUrl.replace(/\/+$/, "")}/orders/checkout`
  // teamId 从信封 namespace 派生（team 运行时隔离键）；部署域名由 RFC 7239 `Forwarded` header 派生——浏览器 body 只携 plan_id。
  const upstreamBody = JSON.stringify({ teamId: envelope.namespace, planId: parsed.data.plan_id })
  let upstream: Response
  try {
    upstream = await fetchWithDomain(target, config.domain, { method: "POST", headers, body: upstreamBody, cache: "no-store", signal: request.signal })
  } catch {
    return NextResponse.json({ error: "payment_unreachable" }, { status: 502 })
  }
  // 诚实态：501=支付渠道未开通（provider 未配置），原样透传，展示层据此禁用购买按钮。
  if (upstream.status === 501) {
    return NextResponse.json({ error: "checkout_unavailable" }, { status: 501 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 })
  }
  let raw: unknown
  try {
    raw = await upstream.json()
  } catch {
    return NextResponse.json({ error: "payment_bad_response" }, { status: 502 })
  }
  const ok = paymentCheckoutOkSchema.safeParse(raw)
  if (!ok.success) {
    return NextResponse.json({ error: "payment_bad_response" }, { status: 502 })
  }
  return NextResponse.json({ checkout_url: ok.data.data.checkoutUrl }, { status: 200 })
}
