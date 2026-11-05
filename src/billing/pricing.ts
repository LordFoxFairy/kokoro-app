// 只读套餐目录经同源 Billing adapter 获取，由 Zod 验证并返回类型化错误。

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

function describeUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type PricingClient = {
  // 正式套餐目录只读；503作为不可用，不能由目录非空推断支付能力。
  plans: (signal?: AbortSignal) => Promise<PlanCatalog>
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
  }
}
