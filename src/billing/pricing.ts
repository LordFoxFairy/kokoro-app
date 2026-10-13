// 价格/购买客户端（PAY-2）：经同源 `/api/billing` BFF 代理到 kokoro-billing 的 storefront 面
// （BFF 从密封信封派生 teamId，并从部署配置注入 RFC 7239 `Forwarded`）。入站过 Zod（payment 属外部边界）；
// 失败类型化上抛。当前配对 BFF checkout 固定503，目录UI预先禁用交易；下列运输协议不提供支付能力。

import { z } from "zod"

// 套餐目录条目（storefront 子集）：金额/积分全程 BigInt 字符串（不过 Number 丢精度）。
const planCatalogEntrySchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    name: z.string().min(1),
    currency: z.string().min(1),
    amount_minor: z.string().min(1),
    credit_micros: z.string().min(1),
    billing_interval: z.enum(["once", "month", "year"]),
  })
  .strict()
export type PlanCatalogEntry = z.infer<typeof planCatalogEntrySchema>

const planCatalogSchema = z
  .object({ plans: z.array(planCatalogEntrySchema) })
  .strict()
export type PlanCatalog = z.infer<typeof planCatalogSchema>

// Existing checkout transport result: ok carries a returned URL; unavailable maps HTTP501.
// 当前配对 BFF 固定503，不会通过此协议提供 checkout；目录UI不调用它。
// unauthenticated映射401；保留运输类型不表示当前交易可用。
type CheckoutResult =
  | { status: "ok"; checkout_url: string }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type PricingFailureReason = "network" | "http" | "parse" | "not_configured"

export class PricingClientError extends Error {
  readonly reason: PricingFailureReason
  readonly status: number | null

  constructor(reason: PricingFailureReason, message: string, status: number | null) {
    super(message)
    this.name = "PricingClientError"
    this.reason = reason
    this.status = status
  }
}

const PLANS_PATH = "/api/billing/plans"
const CHECKOUT_PATH = "/api/billing/checkout"

const checkoutOkSchema = z.object({ checkout_url: z.string().min(1) }).strict()

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type PricingClient = {
  // 正式套餐目录只读；503作为不可用，不能由目录非空推断支付能力。
  plans: () => Promise<PlanCatalog>
  // 既有运输协议保留501/401映射；当前正规目录UI不发起此请求。
  checkout: (planId: string) => Promise<CheckoutResult>
}

export function createPricingClient(): PricingClient {
  return {
    plans: async () => {
      let response: Response
      try {
        response = await fetch(PLANS_PATH, { cache: "no-store" })
      } catch (error) {
        throw new PricingClientError("network", describeUnknown(error), null)
      }
      if (response.status === 503) {
        throw new PricingClientError("not_configured", "payment not configured", 503)
      }
      if (!response.ok) {
        throw new PricingClientError("http", `plans request failed with status ${response.status}`, response.status)
      }
      let raw: unknown
      try {
        raw = await response.json()
      } catch (error) {
        throw new PricingClientError("parse", describeUnknown(error), response.status)
      }
      try {
        return planCatalogSchema.parse(raw)
      } catch (error) {
        throw new PricingClientError("parse", describeUnknown(error), response.status)
      }
    },

    checkout: async (planId) => {
      let response: Response
      try {
        response = await fetch(CHECKOUT_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan_id: planId }),
        })
      } catch (error) {
        throw new PricingClientError("network", describeUnknown(error), null)
      }
      // 保留既有运输状态映射；当前配对 BFF 返回503，UI不调用checkout。
      if (response.status === 501) {
        return { status: "unavailable" }
      }
      if (response.status === 401) {
        return { status: "unauthenticated" }
      }
      if (!response.ok) {
        throw new PricingClientError("http", `checkout failed with status ${response.status}`, response.status)
      }
      let raw: unknown
      try {
        raw = await response.json()
      } catch (error) {
        throw new PricingClientError("parse", describeUnknown(error), response.status)
      }
      try {
        return { status: "ok", checkout_url: checkoutOkSchema.parse(raw).checkout_url }
      } catch (error) {
        throw new PricingClientError("parse", describeUnknown(error), response.status)
      }
    },
  }
}
