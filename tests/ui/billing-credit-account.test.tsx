import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createBillingClient } from "@/billing/client"
import type { BillingLedger, BillingSummary } from "@/contract/http"
import { LocaleProvider } from "@/i18n/context"
import { BillingContent } from "@/ui/billing/billing-panel"

const SUBJECT = "set55-credit-account-owner"
const SUMMARY_PATH = "/api/session/billing/summary"
const LEDGER_PATH = "/api/session/billing/ledger"
const OPEN_PATH = "/api/session/billing/credit-account"

// The subsequent owner reads deliberately differ from the PUT acknowledgement:
// rendering the acknowledgement or a locally invented zero cannot pass this journey.
const acknowledgement: BillingSummary = {
  credit_account_id: "55555555-5555-4555-8555-555555555555",
  status: "active",
  available_micros: "0",
  held_micros: "0",
}
const ownerSummary: BillingSummary = {
  ...acknowledgement,
  available_micros: "73456789",
  held_micros: "1234567",
}
const ownerLedger: BillingLedger = {
  items: [{
    journal_id: "66666666-6666-4666-8666-666666666666",
    sequence: "9",
    delta_micros: "-125001",
    balance_after_micros: "73456789",
    source_kind: "set55-owner-read-entry",
    source_ref: "set55-owner-journal",
    created_at: "2026-10-16T03:00:00.000Z",
  }],
  page: { next_cursor: null },
}

type ObservedRequest = Readonly<{
  method: string
  path: string
  headers: Headers
  body: string
}>

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.removeItem("kokoro.locale")
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
})

describe("I5 hidden personal credit account initialization", () => {
  it("initializes without an opening CTA only after strict missing-account reads, then displays fresh owner summary and ledger", async () => {
    window.localStorage.setItem("kokoro.locale", "zh")
    window.localStorage.setItem("kokoro.web.auth-index-subject", SUBJECT)
    const requests: ObservedRequest[] = []
    let opened = false
    let acknowledge!: () => void
    const pendingAcknowledgement = new Promise<void>((resolve) => { acknowledge = resolve })

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), window.location.origin), init)
      const url = new URL(request.url)
      expect(url.origin).toBe(window.location.origin)
      const observed = { method: request.method, path: `${url.pathname}${url.search}`, headers: request.headers, body: await request.text() }
      requests.push(observed)
      const requestId = `set55-credit-${requests.length}`
      const reply = (body: unknown, status = 200) => Response.json(body, {
        status,
        headers: { "cache-control": "private, no-store", "x-request-id": requestId },
      })

      if (observed.method === "PUT" && observed.path === OPEN_PATH) {
        expect(observed.body).toBe("{}")
        expect(observed.headers.get("content-type")).toBe("application/json")
        expect(observed.headers.has("idempotency-key")).toBe(false)
        opened = true
        await pendingAcknowledgement
        const response = reply(acknowledgement)
        response.headers.set("cache-control", "private, no-store, max-age=0")
        return response
      }
      if (observed.method === "GET" && (observed.path === SUMMARY_PATH || observed.path === LEDGER_PATH)) {
        if (!opened) return reply({
          error: { code: "billing_account_not_found", message: "Credit account not found" },
          meta: { request_id: requestId },
        }, 404)
        return reply(observed.path === SUMMARY_PATH ? ownerSummary : ownerLedger)
      }
      throw new Error(`Unexpected billing request: ${observed.method} ${observed.path}`)
    }))

    render(<BillingContent client={createBillingClient()} readBoundary={{ admitted: true, subject: SUBJECT, generation: 1 }} embedded />, { wrapper: LocaleProvider })

    const balance = screen.getByTestId("billing-balance")
    const ledger = screen.getByTestId("billing-ledger")
    await waitFor(() => expect(requests.filter(({ method }) => method === "PUT")).toHaveLength(1))
    expect(requests.slice(0, 2).map(({ method, path }) => `${method} ${path}`).sort()).toEqual([`GET ${LEDGER_PATH}`, `GET ${SUMMARY_PATH}`])
    expect(screen.queryByRole("button", { name: "开通积分账户" })).not.toBeInTheDocument()
    expect(within(balance).queryByText("0", { exact: true })).not.toBeInTheDocument()
    expect(within(ledger).queryByText("暂无交易记录")).not.toBeInTheDocument()

    acknowledge()
    await waitFor(() => {
      expect(balance).toHaveTextContent("73.456789")
      expect(balance).toHaveTextContent("1.234567")
      expect(within(ledger).getByText("set55-owner-read-entry")).toBeInTheDocument()
      expect(within(ledger).getByText("-0.125001")).toBeInTheDocument()
    })

    expect(requests.filter(({ method }) => method === "PUT")).toHaveLength(1)
    const writeIndex = requests.findIndex(({ method }) => method === "PUT")
    expect(requests.slice(writeIndex + 1).map(({ method, path }) => `${method} ${path}`).sort()).toEqual([`GET ${LEDGER_PATH}`, `GET ${SUMMARY_PATH}`])
    expect(requests).toHaveLength(5)
  })
})
