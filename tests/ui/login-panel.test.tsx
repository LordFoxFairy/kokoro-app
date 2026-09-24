import { StrictMode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"

const { beginProductSignIn } = vi.hoisted(() => ({
  beginProductSignIn: vi.fn(),
}))
vi.mock("@/ui/auth/product-auth-client", () => ({ beginProductSignIn }))
const { useRuntimeManifest } = vi.hoisted(() => ({
  useRuntimeManifest: vi.fn(() => { throw new Error("Login must not load System runtime") }),
}))
vi.mock("@/system/use-runtime-manifest", () => ({ useRuntimeManifest }))

import { LoginPanel } from "@/ui/auth/login-panel"

function renderPanel({ strict = false, initialFailure = false }: { strict?: boolean; initialFailure?: boolean } = {}) {
  window.localStorage.setItem("kokoro.locale", "zh")
  return render(strict ? <StrictMode><LoginPanel initialFailure={initialFailure} /></StrictMode> : <LoginPanel initialFailure={initialFailure} />, { wrapper: LocaleProvider })
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
  it("renders the branded connecting surface and starts fixed OIDC without System runtime", async () => {
    renderPanel()
    expect(screen.getByRole("heading", { name: "正在连接 Kokoro" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Kokoro" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("status")).toHaveTextContent("正在前往安全登录页面")
    await waitFor(() => expect(beginProductSignIn).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(useRuntimeManifest).not.toHaveBeenCalled()
    expect(screen.queryByText("配置不可用")).toBeNull()
  })
  it("has no credential inputs or intermediate login action", () => {
    renderPanel()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByTestId("login-email")).toBeNull()
    expect(screen.queryByTestId("login-sent")).toBeNull()
    expect(screen.queryByTestId("login-oauth-slot")).toBeNull()
  })

  it("starts the fixed Product OIDC flow once under StrictMode and keeps connecting after success", async () => {
    let release!: () => void
    beginProductSignIn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    renderPanel({ strict: true })
    await waitFor(() => expect(beginProductSignIn).toHaveBeenCalledTimes(1))
    release()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("正在前往安全登录页面"))
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("stops after a failure and starts exactly one new attempt when retried", async () => {
    beginProductSignIn.mockRejectedValue(new Error("down"))
    renderPanel()
    expect((await screen.findByRole("alert")).textContent).toContain("登录未完成")
    expect(beginProductSignIn).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { name: "登录 Kokoro" })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(beginProductSignIn).toHaveBeenCalledTimes(1)

    beginProductSignIn.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole("button", { name: "重试登录" }))
    await waitFor(() => expect(beginProductSignIn).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("status")).toHaveTextContent("正在前往安全登录页面")
  })

  it("does not auto-loop after the browser returns from a failed form POST", async () => {
    renderPanel({ initialFailure: true })
    expect(screen.getByRole("heading", { name: "登录 Kokoro" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试登录" })).toBeVisible()
    expect(beginProductSignIn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "重试登录" }))
    await waitFor(() => expect(beginProductSignIn).toHaveBeenCalledTimes(1))
  })

  it("aborts pending sign-in when the login page unmounts", async () => {
    let signal: AbortSignal | undefined
    beginProductSignIn.mockImplementation((receivedSignal: AbortSignal) => {
      signal = receivedSignal
      return new Promise<void>(() => undefined)
    })
    const page = renderPanel()
    await waitFor(() => expect(beginProductSignIn).toHaveBeenCalledTimes(1))
    page.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
