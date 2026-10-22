import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { createBillingClient } from "@/billing/client"
import { LocaleProvider } from "@/i18n/context"
import { AccountCreditSummary } from "@/ui/settings/sections/account-credit-summary"
import { BillingContent } from "@/ui/billing/billing-panel"
import { WorkspaceRailAccount } from "@/components/blocks/workspace-rail/workspace-rail-account"

const marker = "kokoro.web.auth-index-subject"
const boundary = { admitted: true, subject: "credit-A", generation: 1 }
const summary = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "1234567", held_micros: "42" }
const ledger = { items: [], page: { next_cursor: null } }
const headers = { "cache-control": "private, no-store", "x-request-id": "credit-retirement" }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
const missing = () => json({ error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credit-retirement" } }, 404)
const cases = (["account", "usage-summary", "usage-ledger", "rail"] as const).flatMap((surface) =>
  (["GET-to-PUT", "PUT-to-GET"] as const).flatMap((stage) =>
    (["changed", "missing", "read-error"] as const).map((mutation) => ({ surface, stage, mutation }))))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem(marker) })

it.each(cases)("$surface suppresses $stage after storage-only $mutation without rerender or signal abort", async ({ surface, stage, mutation }) => {
  localStorage.setItem(marker, boundary.subject)
  const blockedRead = surface === "usage-ledger" ? "ledger" : "summary"
  let resolve!: (response: Response) => void
  const pending = new Promise<Response>((done) => { resolve = done })
  let signal: AbortSignal | null | undefined
  const billingCalls: { url: string; method: string }[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes("/billing/")) return json({}, 403)
    const method = init?.method ?? "GET"
    billingCalls.push({ url, method })
    const target = method === "PUT" || url.endsWith(`/${blockedRead}`)
    if (target && ((stage === "GET-to-PUT" && method === "GET" && billingCalls.filter((call) => call.url === url).length === 1) ||
      (stage === "PUT-to-GET" && method === "PUT"))) {
      signal = init?.signal
      return pending
    }
    if (target && method === "GET" && stage === "PUT-to-GET" && billingCalls.filter((call) => call.url === url).length === 1) return missing()
    return json(url.endsWith("/ledger") ? ledger : summary)
  }))
  render(<LocaleProvider>{surface === "account" ? <AccountCreditSummary readBoundary={boundary} /> : surface === "rail"
    ? <WorkspaceRailAccount readBoundary={boundary} compactDesktop={false} onOpenSettings={vi.fn()} />
    : <BillingContent readBoundary={boundary} client={createBillingClient()} embedded />}</LocaleProvider>)
  await waitFor(() => expect(signal).toBeDefined())
  const count = billingCalls.length
  expect(signal?.aborted).toBe(false)
  // No rerender, focus event, or storage event: the old page still holds A's read boundary.
  if (mutation === "changed") localStorage.setItem(marker, "credit-B")
  else if (mutation === "missing") localStorage.removeItem(marker)
  else {
    const original = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === marker) throw new Error("storage inaccessible")
      return original.call(this, key)
    })
  }
  await act(async () => { resolve(stage === "GET-to-PUT" ? missing() : json(summary)); await Promise.resolve() })
  expect(billingCalls).toHaveLength(count)
  expect(billingCalls.filter((call) => call.method === "PUT")).toHaveLength(stage === "GET-to-PUT" ? 0 : 1)
})
