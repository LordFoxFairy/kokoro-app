import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { MockPayPanel } from "@/ui/billing/mock-pay-panel"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MockPayPanel", () => {
  it("uses the shadcn card composition and completes the mock payment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    render(<MockPayPanel orderId="checkout-1" />, { wrapper: LocaleProvider })

    expect(screen.getByRole("heading", { name: "Confirm payment" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Confirm payment/ }))

    await screen.findByRole("status")
    expect(screen.getByRole("link", { name: "Back to workspace" })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/mock-pay",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ order_id: "checkout-1" }),
      }),
    )
  })

  it("keeps the retry action available and exposes a destructive alert on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    render(<MockPayPanel orderId="checkout-2" />, { wrapper: LocaleProvider })
    fireEvent.click(screen.getByRole("button", { name: /Confirm payment/ }))

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.getByRole("button", { name: /Confirm payment/ })).toBeEnabled()
  })
})
