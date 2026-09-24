import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"

const { beginProductSignIn } = vi.hoisted(() => ({
  beginProductSignIn: vi.fn(),
}))
vi.mock("@/ui/auth/product-auth-client", () => ({ beginProductSignIn }))
vi.mock("@/system/use-runtime-manifest", () => ({
  useRuntimeManifest: () => ({
    manifest: { brand: { name: "Kokoro", mark: "心" } },
    source: "live",
    retry: vi.fn(),
  }),
}))

import { LoginPanel } from "@/ui/auth/login-panel"

function renderPanel() {
  window.localStorage.setItem("kokoro.locale", "zh")
  return render(<LoginPanel brandName="Acme" />, { wrapper: LocaleProvider })
}

beforeEach(() => {
  window.history.replaceState({}, "", "/login")
  beginProductSignIn.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("LoginPanel", () => {
  it("renders Product sign-in without an unused email or sent-link state", () => {
    renderPanel()
    expect(screen.getByTestId("login-submit")).toBeInTheDocument()
    expect(screen.queryByTestId("login-email")).toBeNull()
    expect(screen.queryByTestId("login-sent")).toBeNull()
    expect(screen.getByTestId("login-submit")).not.toHaveTextContent("发送登录链接")
    expect(screen.queryByTestId("login-oauth-slot")).toBeNull()
  })

  it("starts the fixed Product OIDC flow and guards duplicate submits", async () => {
    let release!: () => void
    beginProductSignIn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    renderPanel()
    const submit = screen.getByTestId("login-submit")
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(beginProductSignIn).toHaveBeenCalledTimes(1)
    release()
    expect(screen.queryByTestId("login-sent")).toBeNull()
  })

  it("shows a controlled unavailable toast when Product OIDC cannot start", async () => {
    beginProductSignIn.mockRejectedValue(new Error("down"))
    renderPanel()
    fireEvent.click(screen.getByTestId("login-submit"))
    expect((await screen.findByTestId("login-toast")).textContent).toContain("暂不可用")
  })
})
