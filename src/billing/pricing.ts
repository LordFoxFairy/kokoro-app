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

export type PricingFailureReason = "network" | "http" | "parse" | "not_configured" | "timeout" | "aborted"

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
  plans: (signal?: AbortSignal) => Promise<PlanCatalog>
  // 既有运输协议保留501/401映射；当前正规目录UI不发起此请求。
  checkout: (planId: string) => Promise<CheckoutResult>
}

export function createPricingClient(): PricingClient {
  return {
    plans: async (signal) => {
      const controller = new AbortController()
      const deadline = performance.now() + 10_000
      let response: Response | undefined
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let retired = false
      let rejectAbort!: (reason: unknown) => void
      const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
      let bodyCancelled = false
      const cancel = () => {
        if (bodyCancelled || !response?.body) return
        bodyCancelled = true
        if (reader) {
          const owned = reader
          reader = undefined
          void owned.cancel().catch(() => undefined)
          owned.releaseLock()
        } else {
          void response.body.cancel().catch(() => undefined)
        }
      }
      const abort = () => { cancel(); rejectAbort(controller.signal.reason) }
      const parentAbort = () => controller.abort(new PricingClientError("aborted", "Plans read retired", null))
      controller.signal.addEventListener("abort", abort, { once: true })
      signal?.addEventListener("abort", parentAbort, { once: true })
      const timer = setTimeout(() => controller.abort(new PricingClientError("timeout", "Plans read timed out", null)), 10_000)
      const check = () => {
        controller.signal.throwIfAborted()
        if (performance.now() >= deadline) {
          controller.abort(new PricingClientError("timeout", "Plans read timed out", null))
          controller.signal.throwIfAborted()
        }
      }
      const operation = async () => {
        check()
        try { response = await fetch(PLANS_PATH, { cache: "no-store", signal: controller.signal }) }
        catch (error) { check(); throw new PricingClientError("network", describeUnknown(error), null) }
        if (retired || controller.signal.aborted) { cancel(); check() }
        check()
        if (response.status === 503) throw new PricingClientError("not_configured", "payment not configured", 503)
        if (!response.ok) throw new PricingClientError("http", `plans request failed with status ${response.status}`, response.status)
        let raw: unknown
        try {
          let text = ""
          if (response.body) {
            const owned = response.body.getReader()
            reader = owned
            const decoder = new TextDecoder()
            try {
              for (;;) {
                const part = await owned.read()
                check()
                if (part.done) break
                text += decoder.decode(part.value, { stream: true })
              }
              text += decoder.decode()
            } finally {
              if (reader === owned) {
                reader = undefined
                owned.releaseLock()
              }
            }
          }
          raw = JSON.parse(text)
        }
        catch (error) { check(); throw new PricingClientError("parse", describeUnknown(error), response.status) }
        check()
        try { const parsed = planCatalogSchema.parse(raw); check(); return parsed }
        catch (error) { check(); throw new PricingClientError("parse", describeUnknown(error), response.status) }
      }
      if (signal?.aborted) parentAbort()
      try { return await Promise.race([operation(), interrupted]) }
      finally {
        retired = true
        if (response && !response.ok) cancel()
        clearTimeout(timer)
        signal?.removeEventListener("abort", parentAbort)
        controller.signal.removeEventListener("abort", abort)
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
