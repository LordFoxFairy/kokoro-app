// 营销落地页组件测试（WEB-FACE 面一）：品牌注入、能力区/FAQ 齐全、hero 输入暂存草稿并跳 /login。
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"

import { LocaleProvider } from "@/i18n/context"
import { admitBrowserAuthSessionIndexes } from "@/ui/shell/page-clients"
import { LandingPage } from "@/ui/marketing/landing-page"

const push = vi.fn()
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}))

function renderLanding(brandName?: string, marketingHref?: string) {
  // 固定中文源：jsdom 的 navigator.languages 会协商到 en，显式落 zh 以断言源文案。
  window.localStorage.setItem("kokoro.locale", "zh")
  const props: ComponentProps<typeof LandingPage> = {}
  if (brandName !== undefined) props.brandName = brandName
  if (marketingHref !== undefined) props.marketingHref = marketingHref
  return render(<LandingPage {...props} />, { wrapper: LocaleProvider })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  push.mockClear()
  replace.mockClear()
  window.history.replaceState({}, "", "/")
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe("LandingPage", () => {
  it("does not redirect a legacy magic-link error query to the unavailable login page", () => {
    window.history.replaceState({}, "", "/?auth=link_unavailable")
    renderLanding()
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it("renders the injected brand name in top bar and footer", () => {
    renderLanding("Acme")
    expect(screen.getAllByText("Acme").length).toBeGreaterThanOrEqual(2)
  })

  it("falls back to Kokoro when no brand is provided", () => {
    renderLanding()
    expect(screen.getAllByText("Kokoro").length).toBeGreaterThanOrEqual(1)
  })

  it("describes the existing-account sign-in instead of a removed email form", () => {
    renderLanding()
    expect(screen.getByText("使用现有账号登录，即可开始。")).toBeInTheDocument()
    expect(screen.queryByText("输入邮箱即可开始，无需信用卡。")).not.toBeInTheDocument()
  })

  it("renders all six capability sections and four FAQ items", () => {
    renderLanding()
    expect(screen.getByText("对话即协作，关键处由你把关")).toBeInTheDocument()
    expect(screen.getByText("技能库，按需装配能力")).toBeInTheDocument()
    expect(screen.getByText("连接你的工具与数据")).toBeInTheDocument()
    expect(screen.getByText("成果可交付、可分享")).toBeInTheDocument()
    expect(screen.getByText("与团队共享一个工作区")).toBeInTheDocument()
    expect(screen.getByText("多模型，随任务切换")).toBeInTheDocument()
    expect(screen.getByText("怎么计费？")).toBeInTheDocument()
    expect(screen.getByText("我的数据归谁？")).toBeInTheDocument()
    expect(screen.getByText("支持团队协作吗？")).toBeInTheDocument()
    expect(screen.getByText("能接入我自己的工具吗？")).toBeInTheDocument()
  })

  it("stashes the hero draft and routes to /login on submit", () => {
    renderLanding()
    fireEvent.change(screen.getByTestId("landing-hero-input"), {
      target: { value: "帮我起草季度复盘" },
    })
    fireEvent.click(screen.getByTestId("landing-hero-start"))
    expect(push).toHaveBeenCalledWith("/login")
    expect(window.localStorage.getItem("kokoro.web.drafts")).toBeNull()
    expect(JSON.parse(window.sessionStorage.getItem("kokoro.web.anonymous-prompt-handoff") ?? "null")).toEqual([1, expect.any(Number), "帮我起草季度复盘"])
  })

  it("routes to /login even with an empty hero draft without stashing", () => {
    renderLanding()
    fireEvent.click(screen.getByTestId("landing-hero-start"))
    expect(push).toHaveBeenCalledWith("/login")
    expect(window.localStorage.getItem("kokoro.web.drafts")).toBeNull()
  })

  it("keeps site-local marketing links inside the injected site entry", () => {
    renderLanding("Acme", "/sites/acme")
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/sites/acme")
    const topNav = within(screen.getByRole("navigation", { name: "Acme" }))
    expect(topNav.getByRole("link", { name: "能力" })).toHaveAttribute("href", "/sites/acme#capabilities")
    expect(topNav.getByRole("link", { name: "常见问题" })).toHaveAttribute("href", "/sites/acme#faq")
  })

  it("submits the hero draft with Enter and exposes the active capability tab", () => {
    renderLanding()
    const input = screen.getByTestId("landing-hero-input")
    fireEvent.change(input, { target: { value: "整理会议记录" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(push).toHaveBeenCalledWith("/login")

    const skillsTab = screen.getByTestId("cap-tab-1")
    fireEvent.mouseDown(skillsTab, { button: 0 })
    fireEvent.click(skillsTab)
    expect(skillsTab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("技能库，按需装配能力")).toBeVisible()
    const capabilityPanels = Array.from(document.querySelectorAll('[data-slot="tabs-content"]'))
    expect(capabilityPanels.find((panel) => panel.getAttribute("data-state") === "active")).not.toHaveAttribute("aria-hidden", "true")
    expect(capabilityPanels.find((panel) => panel.id.endsWith("-content-0"))).toHaveAttribute("aria-hidden", "true")
  })

  it("opens and closes FAQ items through the shadcn accordion contract", () => {
    renderLanding()
    const billing = screen.getByRole("button", { name: "怎么计费？" })
    fireEvent.click(billing)
    const answer = screen.getByText("按实际用量从余额扣减，模型调用与工具调用都记在账单流水里，随时可查。没有隐藏订阅。")
    expect(answer).toBeVisible()
    fireEvent.click(billing)
    expect(answer).not.toBeVisible()
  })
})


it("keeps the actual explicit landing prompt through first verified admission without keeping old actor drafts", () => {
  window.localStorage.setItem("kokoro.web.drafts", JSON.stringify({ oldConversation: "old private draft" }))
  renderLanding()
  fireEvent.change(screen.getByTestId("landing-hero-input"), { target: { value: "  fresh landing prompt  " } })
  fireEvent.click(screen.getByTestId("landing-hero-start"))
  expect(push).toHaveBeenCalledExactlyOnceWith("/login")
  expect(admitBrowserAuthSessionIndexes("subject-new", null)).toBe(true)
  expect(JSON.parse(window.localStorage.getItem("kokoro.web.drafts") ?? "{}")).toEqual({ __pending__: "fresh landing prompt" })
  expect(window.sessionStorage.getItem("kokoro.web.anonymous-prompt-handoff")).toBeNull()
})
it("clears the previous explicit handoff when the user starts with an empty prompt", () => {
  window.sessionStorage.setItem("kokoro.web.anonymous-prompt-handoff", JSON.stringify([1, Date.now(), "stale choice"]))
  renderLanding()
  fireEvent.click(screen.getByTestId("landing-hero-start"))
  expect(push).toHaveBeenCalledExactlyOnceWith("/login")
  expect(window.sessionStorage.getItem("kokoro.web.anonymous-prompt-handoff")).toBeNull()
})


it("bounds the existing hero input and preserves it without navigating when handoff storage fails", () => {
  renderLanding()
  const input = screen.getByTestId("landing-hero-input")
  expect(input).toHaveAttribute("maxlength", "65536")
  fireEvent.change(input, { target: { value: "keep visible prompt" } })
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
    if (this === window.sessionStorage && key === "kokoro.web.anonymous-prompt-handoff") throw new DOMException("blocked", "SecurityError")
    return original.call(this, key, value)
  })
  fireEvent.click(screen.getByTestId("landing-hero-start"))
  expect(push).not.toHaveBeenCalled()
  expect(input).toHaveValue("keep visible prompt")
})
