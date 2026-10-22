// Personal Credit reads and idempotent initialization use the existing same-origin BFF adapter only.
import {
  billingCreditAccountPath, billingLedgerPath, billingLedgerSchema, billingSummaryPath, billingSummarySchema,
  type BillingLedger, type BillingSummary,
} from "@/contract/http"
import { billingMissingAccountSchema } from "@/contract/billing"
import { SESSION_PROXY_BASE } from "@/engine/config"

export const CREDIT_INSUFFICIENT = "credit_insufficient"

type BillingFailureReason = "network" | "http" | "parse" | "timeout" | "aborted" | "missing_account"
export class BillingClientError extends Error {
  constructor(readonly reason: BillingFailureReason, readonly status: number | null = null) {
    super(`billing_${reason}`)
    this.name = "BillingClientError"
  }
}

/** Headers, body and validation share the caller's absolute deadline; no transport retry. */
async function getJson<T>(path: string, parse: (raw: unknown) => T, signal: AbortSignal | undefined, deadline: number, initialize = false, getCurrent?: () => boolean): Promise<T> {
  if (signal?.aborted) throw new BillingClientError("aborted")
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  let response: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const check = () => {
    // The browser scope guard only retires stale continuations; the server session
    // remains the sole authority. Storage failure is retirement, never admission.
    let current = true
    try { current = getCurrent === undefined || getCurrent() === true } catch { current = false }
    const reason = performance.now() >= deadline ? "timeout"
      : !current || controller.signal.aborted || signal?.aborted ? "aborted" : null
    if (reason !== null) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
      throw new BillingClientError(reason)
    }
  }
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => { reject(new BillingClientError("aborted")); controller.abort() }
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) { abort(); return }
    timer = setTimeout(() => { reject(new BillingClientError("timeout")); controller.abort() }, Math.max(0, deadline - performance.now()))
  })
  const read = async () => {
    check()
    try {
      response = await fetch(`${SESSION_PROXY_BASE}${path}`, { cache: "no-store", signal: controller.signal, redirect: "error", ...(initialize ? { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" } : {}) })
    } catch {
      check()
      throw new BillingClientError("network")
    }
    check()
    if (!response.ok && (initialize || response.status !== 404)) throw new BillingClientError("http", response.status)
    const media = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
    const directives = response.headers.get("cache-control")?.split(",").map((value) => value.trim().toLowerCase()) ?? []
    const requestId = response.headers.get("x-request-id")
    if ((response.status !== 200 && response.status !== 404) || media !== "application/json" || !directives.includes("no-store") ||
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
      const raw: unknown = JSON.parse(text)
      if (response.status === 404) {
        const missing = billingMissingAccountSchema.safeParse(raw)
        check()
        if (missing.success && missing.data.meta.request_id === requestId) {
          throw new BillingClientError("missing_account", 404)
        }
        throw new BillingClientError("http", 404)
      }
      const data = parse(raw)
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

/** Only a verified missing-account GET permits one idempotent PUT; GETs remain read-only. */
async function readWithInitialization<T>(path: string, parse: (raw: unknown) => T, signal?: AbortSignal, getCurrent?: () => boolean): Promise<T> {
  const deadline = performance.now() + 10_000
  try {
    return await getJson(path, parse, signal, deadline)
  } catch (error) {
    if (!(error instanceof BillingClientError) || error.reason !== "missing_account") throw error
  }
  // Every continuation rechecks both caller retirement and the captured browser scope before fetch.
  try {
    await getJson(billingCreditAccountPath(), (raw) => billingSummarySchema.parse(raw), signal, deadline, true, getCurrent)
  } catch (error) {
    // An unknown command outcome must be verified by the original authoritative GET,
    // never by replaying the PUT. Known rejections and retirement stop immediately.
    if (!(error instanceof BillingClientError) ||
      !(error.reason === "network" || error.reason === "parse" || (error.reason === "http" && (error.status === 502 || error.status === 503)))) throw error
  }
  return getJson(path, parse, signal, deadline, false, getCurrent)
}

export type BillingClient = {
  summary: (signal?: AbortSignal, getCurrent?: () => boolean) => Promise<BillingSummary>
  ledger: (cursor?: string, signal?: AbortSignal, getCurrent?: () => boolean) => Promise<BillingLedger>
}
export function createBillingClient(): BillingClient {
  return {
    summary: (signal, getCurrent) => readWithInitialization(billingSummaryPath(), (raw) => billingSummarySchema.parse(raw), signal, getCurrent),
    ledger: (cursor, signal, getCurrent) => {
      if (cursor !== undefined && (cursor.length === 0 || cursor.length > 2048)) return Promise.reject(new BillingClientError("parse"))
      const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`
      return readWithInitialization(`${billingLedgerPath()}${query}`, (raw) => billingLedgerSchema.parse(raw), signal, getCurrent)
    },
  }
}
