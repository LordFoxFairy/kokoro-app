import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { MockPayPanel } from "@/ui/billing/mock-pay-panel"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MockPayPanel", () => {
  it("disables direct payment without a request or an unverified order", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<MockPayPanel />, { wrapper: LocaleProvider })
    const button = screen.getByRole("button")
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText("checkout-1")).toBeNull()
    expect(screen.getByRole("link", { name: "Back to workspace" })).toHaveAttribute("href", "/app")
  })
  it("keeps the published direct page inert with a usable return link", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { default: DirectPayPage } = await import("@/app/billing/pay/[orderId]/page")
    render(<DirectPayPage />, { wrapper: LocaleProvider })
    const action = screen.getByRole("button")
    fireEvent.keyDown(action, { key: "Enter" })
    fireEvent.keyUp(action, { key: "Enter" })
    expect(action).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("Payments aren't set up yet")
    expect(screen.getByRole("link", { name: "Back to workspace" })).toHaveAttribute("href", "/app")
    expect(screen.queryByText(/Paid|checkout-/)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

})
