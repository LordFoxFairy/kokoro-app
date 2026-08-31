import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"

const runtime = vi.hoisted(() => ({
  manifest: { brand: { name: "Kokoro", mark: "心" } },
  source: "error" as "error" | "loading" | "preview" | "live",
  retry: vi.fn(),
  retrying: false,
}))

vi.mock("@/ui/auth/use-session-state", () => ({
  useSessionState: () => "anonymous",
}))

vi.mock("@/system/use-runtime-manifest", () => ({
  useRuntimeManifest: () => runtime,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

import { HomeGate } from "@/ui/auth/home-gate"

afterEach(() => {
  cleanup()
  runtime.retry.mockClear()
  runtime.retrying = false
  runtime.source = "error"
})

it("首页运行时重试期间保持错误卡并锁定重新加载按钮", () => {
  const { rerender } = render(<HomeGate />, { wrapper: LocaleProvider })

  expect(screen.getByRole("heading", { name: /Config unavailable|配置不可用/ })).toBeInTheDocument()
  const initialReload = screen.getByRole("button", { name: /Reload|重新加载/ })
  expect(initialReload).not.toBeDisabled()

  runtime.retrying = true
  rerender(<HomeGate />)

  const reloadButtons = screen.getAllByRole("button", { name: /Reload|重新加载/ })
  const retryingButton = reloadButtons.find((button) => button.hasAttribute("disabled"))
  expect(retryingButton).toBeDefined()
  expect(retryingButton).toHaveAttribute("aria-busy", "true")
  expect(runtime.retry).not.toHaveBeenCalled()
})
