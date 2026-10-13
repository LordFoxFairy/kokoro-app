// Catalog read states stay functional; unsupported checkout is disabled before interaction.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PricingClient } from "@/billing/pricing"
import { PricingClientError } from "@/billing/pricing"
import { LocaleProvider } from "@/i18n/context"
import { PricingContent, PricingPanel } from "@/ui/billing/pricing-panel"

const PLAN = {
  id: "p1",
  key: "studio",
  name: "Studio Bundle",
  currency: "USD",
  amount_minor: "4900",
  credit_micros: "1000000",
  billing_interval: "month" as const,
}

function makeClient(over: Partial<PricingClient> = {}): PricingClient {
  return {
    plans: async () => ({ plans: [PLAN] }),
    checkout: async () => ({ status: "unavailable" }),
    ...over,
  }
}

afterEach(cleanup)

function renderPanel(client: PricingClient) {
  render(<PricingPanel client={client} onClose={() => {}} />, { wrapper: LocaleProvider })
}

describe("PricingPanel", () => {
  it("渲染套餐卡：名称 + 价格（minor→十进制）+ 积分（micros→十进制）", async () => {
    renderPanel(makeClient())
    await screen.findByTestId("pricing-card")
    expect(screen.getByText("Studio Bundle")).toBeTruthy()
    expect(screen.getByText("49.00")).toBeTruthy()
    expect(screen.getByText(/1 credits/)).toBeTruthy()
  })

  it("catalog not_configured → 诚实未开通态（无套餐卡）", async () => {
    const client = makeClient({
      plans: async () => {
        throw new PricingClientError("not_configured", "payment not configured", 503)
      },
    })
    renderPanel(client)
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.queryByTestId("pricing-card")).toBeNull()
  })

  it("disables the first nonempty catalog purchase without checkout", async () => {
    const checkout = vi.fn(async () => ({ status: "ok" as const, checkout_url: "https://pay.invalid" }))
    renderPanel(makeClient({ checkout }))
    const card = await screen.findByTestId("pricing-card")
    const buy = card.querySelector("button")!
    expect(buy).toBeDisabled()
    fireEvent.click(buy)
    fireEvent.keyDown(buy, { key: "Enter" })
    fireEvent.keyUp(buy, { key: "Enter" })
    expect(checkout).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Payments aren't set up yet")
  })
  it("keeps embedded catalog prices readable with purchases disabled", async () => {
    const checkout = vi.fn()
    render(<PricingContent client={makeClient({ checkout })} embedded />, { wrapper: LocaleProvider })
    const card = await screen.findByTestId("pricing-card")
    expect(screen.getByText("49.00")).toBeInTheDocument()
    expect(card.querySelector("button")).toBeDisabled()
    fireEvent.click(card.querySelector("button")!)
    expect(checkout).not.toHaveBeenCalled()
  })

  it("preserves the canonical empty catalog without invented offers", async () => {
    renderPanel(makeClient({ plans: async () => ({ plans: [] }) }))
    await screen.findByText("No plans available to purchase")
    expect(screen.queryByTestId("pricing-card")).toBeNull()
    expect(screen.queryByRole("button", { name: "Payments unavailable" })).toBeNull()
  })

  it("shows loading while the catalog is unresolved, then its real offer", async () => {
    let resolve!: (value: { plans: typeof PLAN[] }) => void
    renderPanel(makeClient({ plans: () => new Promise((done) => { resolve = done }) }))
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByTestId("pricing-card")).toBeNull()
    resolve({ plans: [PLAN] })
    await screen.findByTestId("pricing-card")
  })

  it("retains catalog error and explicit retry without invoking checkout", async () => {
    const plans = vi.fn().mockRejectedValueOnce(new Error("read failure")).mockResolvedValueOnce({ plans: [PLAN] })
    const checkout = vi.fn()
    renderPanel(makeClient({ plans, checkout }))
    const retry = await screen.findByRole("button", { name: "Reload plans" })
    fireEvent.click(retry)
    await screen.findByTestId("pricing-card")
    expect(plans).toHaveBeenCalledTimes(2)
    expect(checkout).not.toHaveBeenCalled()
  })

})
