// 登录页面板测试（WEB-FACE 面二）：idle→发送后态、dev 链、toast 归一（不内联）、改邮箱返回、
// 回调失败 ?auth=link_unavailable 进页即 toast。fetch 为注入 mock（不打网络）。
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"

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

const fetchMock = vi.fn()

beforeEach(() => {
  window.history.replaceState({}, "", "/login")
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("LoginPanel", () => {
  it("renders the email field and real submit action without fake OAuth controls", () => {
    renderPanel()
    expect(screen.getByTestId("login-panel")).toBeInTheDocument()
    expect(screen.getByTestId("login-email")).toBeInTheDocument()
    expect(screen.getByTestId("login-submit")).toBeInTheDocument()
    // OAuth 未接入时不渲染假按钮。
    expect(screen.queryByTestId("login-oauth-slot")).toBeNull()
    expect(screen.queryByTestId("login-toast")).not.toBeInTheDocument()
  })

  it("attaches invalid-email feedback to the email field before sending", () => {
    renderPanel()
    fireEvent.click(screen.getByTestId("login-submit"))
    expect(screen.getByTestId("login-email")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByTestId("login-toast").textContent).toContain("合法邮箱")
  })

  it("validation failure returns focus to the email field", async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId("login-submit"))
    await vi.waitFor(() => expect(screen.getByTestId("login-email")).toHaveFocus())
  })

  it("moves to the sent state with a resend countdown after a successful request", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    renderPanel()
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } })
    fireEvent.click(screen.getByTestId("login-submit"))
    await screen.findByTestId("login-sent")
    // 重发按钮进入倒计时禁用态。
    expect(screen.getByTestId("login-resend")).toBeDisabled()
    await vi.waitFor(() => expect(screen.getByRole("heading", { name: /查收邮件|检查邮箱|Check your email/ })).toHaveFocus())
  })

  it("guards duplicate submit events while the request is pending", async () => {
    let resolveFetch: ((value: { ok: boolean; json: () => Promise<Record<string, never>> }) => void) | undefined
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve }),
    )
    renderPanel()
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } })
    const submit = screen.getByTestId("login-submit")
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFetch?.({ ok: true, json: async () => ({}) })
    await screen.findByTestId("login-sent")
  })

  it("renders the dev link when the BFF returns one", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ dev_link: "/api/auth/callback?token=abc" }) })
    renderPanel()
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } })
    fireEvent.click(screen.getByTestId("login-submit"))
    const link = await screen.findByTestId("dev-link")
    expect(link).toHaveAttribute("href", "/api/auth/callback?token=abc")
  })

  it("surfaces rate limiting through a toast, not an inline field error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    renderPanel()
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } })
    fireEvent.click(screen.getByTestId("login-submit"))
    const toast = await screen.findByTestId("login-toast")
    expect(toast.textContent).toContain("频繁")
    // 仍停留在 idle（发送后态未进入）。
    expect(screen.getByTestId("login-panel")).toBeInTheDocument()
  })

  it("returns to the email form when changing email from the sent state", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    renderPanel()
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } })
    fireEvent.click(screen.getByTestId("login-submit"))
    await screen.findByTestId("login-sent")
    fireEvent.click(screen.getByTestId("login-change-email"))
    expect(screen.getByTestId("login-panel")).toBeInTheDocument()
  })

  it("toasts on mount when arriving with ?auth=link_unavailable", async () => {
    window.history.replaceState({}, "", "/login?auth=link_unavailable")
    renderPanel()
    const toast = await screen.findByTestId("login-toast")
    expect(toast.textContent).toContain("过期")
  })
})
