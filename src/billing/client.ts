// Personal Credit reads use the existing same-origin BFF adapter only.
import {
  billingLedgerPath, billingLedgerSchema, billingSummaryPath, billingSummarySchema,
  type BillingLedger, type BillingSummary,
} from "@/contract/http"
import { SESSION_PROXY_BASE } from "@/engine/config"

export const CREDIT_INSUFFICIENT = "credit_insufficient"

type BillingFailureReason = "network" | "http" | "parse" | "timeout" | "aborted"
class BillingClientError extends Error {
  constructor(readonly reason: BillingFailureReason, readonly status: number | null = null) {
    super(`billing_${reason}`)
    this.name = "BillingClientError"
  }
}

/** A single local deadline includes headers, body and validation; no retry. */
async function getJson<T>(path: string, parse: (raw: unknown) => T, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new BillingClientError("aborted")
  const controller = new AbortController()
  const deadline = performance.now() + 10_000
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  let response: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const check = () => {
    const reason = performance.now() >= deadline ? "timeout"
      : controller.signal.aborted || signal?.aborted ? "aborted" : null
    if (reason !== null) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
      throw new BillingClientError(reason)
    }
  }
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => { reject(new BillingClientError("aborted")); controller.abort() }
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) { abort(); return }
    timer = setTimeout(() => { reject(new BillingClientError("timeout")); controller.abort() }, 10_000)
  })
  const read = async () => {
    check()
    try {
      response = await fetch(`${SESSION_PROXY_BASE}${path}`, { cache: "no-store", signal: controller.signal, redirect: "error" })
    } catch {
      check()
      throw new BillingClientError("network")
    }
    check()
    if (!response.ok) throw new BillingClientError("http", response.status)
    const media = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
    const directives = response.headers.get("cache-control")?.split(",").map((value) => value.trim().toLowerCase()) ?? []
    const requestId = response.headers.get("x-request-id")
    if (response.status !== 200 || media !== "application/json" || !directives.includes("no-store") ||
      !directives.includes("private") || !requestId || requestId.length > 256 || !/^[\x21-\x7e]+$/.test(requestId)) {
      throw new BillingClientError("parse", response.status)
    }
    if (!response.body) throw new BillingClientError("parse", response.status)
    const bodyReader = response.body.getReader()
    reader = bodyReader
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let text = ""
    let bytes = 0
    try {
      while (true) {
        check()
        const chunk = await bodyReader.read()
        check()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 16 * 1024 * 1024) throw new BillingClientError("parse", response.status)
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
      const data = parse(JSON.parse(text) as unknown)
      check()
      return data
    } catch (error) {
      check()
      if (error instanceof BillingClientError) throw error
      throw new BillingClientError("parse", response.status)
    } finally {
      if (reader === bodyReader) { reader = undefined; bodyReader.releaseLock() }
    }
  }
  try {
    return await Promise.race([interrupted, read()])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
    controller.abort()
    if (reader) {
      const held = reader
      reader = undefined
      void held.cancel().catch(() => undefined)
      held.releaseLock()
    }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
}

export type BillingClient = {
  summary: (signal?: AbortSignal) => Promise<BillingSummary>
  ledger: (cursor?: string, signal?: AbortSignal) => Promise<BillingLedger>
}
export function createBillingClient(): BillingClient {
  return {
    summary: (signal) => getJson(billingSummaryPath(), (raw) => billingSummarySchema.parse(raw), signal),
    ledger: (cursor, signal) => {
      if (cursor !== undefined && (cursor.length === 0 || cursor.length > 2048)) return Promise.reject(new BillingClientError("parse"))
      const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`
      return getJson(`${billingLedgerPath()}${query}`, (raw) => billingLedgerSchema.parse(raw), signal)
    },
  }
}
