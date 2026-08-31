import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { MarketingTopBar } from "@/ui/marketing/marketing-top-bar"

const originalInnerWidth = window.innerWidth
const originalMatchMedia = window.matchMedia

afterEach(() => {
  cleanup()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth, writable: true })
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia })
})

it("从移动端跨过 768px 后卸载导航 Sheet 并把焦点交给品牌入口", async () => {
  const listeners = new Set<() => void>()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 768, writable: true })
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(max-width: 768px)" ? window.innerWidth <= 768 : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    }),
  })

  render(
    <ThemeProvider>
      <LocaleProvider>
        <MarketingTopBar brandName="Kokoro" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }))
  expect(screen.getByRole("dialog")).toBeInTheDocument()

  window.innerWidth = 769
  listeners.forEach((listener) => listener())

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole("link", { name: "Kokoro" })).toHaveFocus())
})

it("移动端正常关闭导航后把焦点还给汉堡触发按钮", async () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390, writable: true })

  render(
    <ThemeProvider>
      <LocaleProvider>
        <MarketingTopBar brandName="Kokoro" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const toggle = screen.getByRole("button", { name: "Open navigation" })
  toggle.focus()
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }))

  await waitFor(() => expect(toggle).toHaveFocus())
})
