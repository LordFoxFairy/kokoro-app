import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { RuntimeUnavailable } from "@/ui/auth/runtime-unavailable"

afterEach(cleanup)

it("用 shadcn Alert 呈现运行时配置失败，并提供重试动作", () => {
  const onRetry = vi.fn()

  render(
    <LocaleProvider>
      <RuntimeUnavailable onRetry={onRetry} />
    </LocaleProvider>,
  )

  expect(screen.getByRole("link", { name: "Kokoro" })).toBeInTheDocument()
  const heading = screen.getByRole("heading", { name: /Config unavailable|配置不可用/ })
  expect(heading).toHaveAttribute("id", "runtime-unavailable-title")
  expect(screen.getByRole("main")).toHaveAttribute("aria-labelledby", "runtime-unavailable-title")
  expect(screen.getByRole("alert")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /Reload|重新加载/ }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

it("重试运行中锁定按钮并明确表达 busy 状态", () => {
  render(
    <LocaleProvider>
      <RuntimeUnavailable onRetry={vi.fn()} retrying />
    </LocaleProvider>,
  )

  const retry = screen.getAllByRole("button", { name: /Reload|重新加载/ }).find((button) => button.hasAttribute("disabled"))
  expect(retry).toBeDefined()
  expect(retry).toBeDisabled()
  expect(retry).toHaveAttribute("aria-busy", "true")
})
