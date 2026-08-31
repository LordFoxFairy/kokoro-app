import { readFileSync } from "node:fs"

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroAgentsSurface } from "@/features/app/kokoro-agents-surface"
import type { AgentClient, AgentConnectionSetup, AgentPlatform } from "@/agents/client"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(cleanup)

function setup(platform: AgentPlatform, overrides: Partial<AgentConnectionSetup> = {}): AgentConnectionSetup {
  return {
    platform,
    status: "disconnected",
    qr_value: `https://agents.fixture.test/connect?platform=${platform}&ticket=retry`,
    continue_url: `https://agents.fixture.test/continue?platform=${platform}&ticket=retry`,
    expires_at: "2099-08-30T06:30:00.000Z",
    ...overrides,
  }
}

function renderAgents(client?: AgentClient) {
  return render(<LocaleProvider><KokoroAgentsSurface client={client} /></LocaleProvider>)
}

it("Agent 首页呈现 Hero、四项能力和即将上线平台", () => {
  renderAgents()

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("部署你的 Agent 用于")
  expect(screen.getByRole("button", { name: "开始体验" })).toBeInTheDocument()
  expect(screen.getAllByTestId("agent-feature-card")).toHaveLength(4)
  expect(screen.getByRole("heading", { name: "品牌一致性的 AI 身份" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "持久的记忆与电脑" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "自定义技能" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "在聊天应用中使用" })).toBeInTheDocument()
  expect(screen.getByText("WhatsApp")).toBeInTheDocument()
  expect(screen.getByText("Messenger")).toBeInTheDocument()
  const startButton = screen.getByRole("button", { name: "开始体验" })
  expect(within(startButton).getByTestId("agent-platform-stack")).toBeInTheDocument()
  expect(within(startButton).getAllByTestId(/^agent-platform-(telegram|line|slack)$/)).toHaveLength(3)
  expect(screen.queryByRole("link", { name: "返回工作区" })).toBeNull()
  expect(screen.queryByText("AI Agent")).toBeNull()
  expect(screen.queryByText("Always available")).toBeNull()
})

it("能力卡是可操作的 Agent 设置入口，并保持 CTA 的展开状态", async () => {
  renderAgents()

  const identityCard = screen.getByRole("button", { name: /品牌一致性的 AI 身份/ })
  expect(identityCard).toHaveAttribute("aria-haspopup", "dialog")
  expect(identityCard).toHaveAttribute("aria-expanded", "false")

  identityCard.focus()
  fireEvent.click(identityCard)

  const dialog = await screen.findByRole("dialog")
  expect(identityCard).toHaveAttribute("aria-expanded", "true")

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(identityCard).toHaveAttribute("aria-expanded", "false")
})

it("从能力卡打开设置后关闭时把焦点交还给实际触发卡", async () => {
  renderAgents()
  const identityCard = screen.getByRole("button", { name: /品牌一致性的 AI 身份/ })

  fireEvent.click(identityCard)
  const dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))

  await waitFor(() => expect(identityCard).toHaveFocus())
})

it("开始体验打开连接弹窗，并可切换 Telegram、LINE 与 Slack", async () => {
  renderAgents()
  const opener = screen.getByRole("button", { name: "开始体验" })
  expect(opener).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(opener)

  const dialog = screen.getByRole("dialog")
  expect(opener).toHaveAttribute("aria-expanded", "true")
  expect(within(dialog).getByRole("heading", { name: "在 Telegram 中继续设置" })).toBeInTheDocument()
  await waitFor(() => expect(within(dialog).getByRole("tab", { name: /Telegram/ })).toHaveFocus())
  const telegramQr = await within(dialog).findByRole("img", { name: "Telegram 连接二维码" })
  expect(telegramQr).toBeInTheDocument()
  await waitFor(() => expect(within(dialog).getByRole("img", { name: "Telegram 连接二维码" }).tagName).toBe("svg"))
  expect(within(dialog).getByRole("img", { name: "Telegram 连接二维码" })).toHaveAttribute("width", "140")

  const slackTab = within(dialog).getByRole("tab", { name: /Slack/ })
  fireEvent.focus(slackTab)
  await waitFor(() => expect(within(dialog).getByRole("heading", { name: "在 Slack 中继续设置" })).toBeInTheDocument())
  expect(within(dialog).getByText("在 Slack 中批准此连接。")).toBeInTheDocument()
  await waitFor(() => expect(within(dialog).getByRole("link", { name: /在 Slack 继续/ })).toHaveAttribute("href", expect.stringContaining("platform=slack")))
  expect(within(dialog).getByRole("link", { name: /在 Slack 继续/ })).toHaveAttribute("target", "_blank")

  const lineTab = within(dialog).getByRole("tab", { name: /LINE/ })
  fireEvent.focus(lineTab)
  await waitFor(() => expect(within(dialog).getByRole("heading", { name: "在 LINE 中继续设置" })).toBeInTheDocument())
  await waitFor(() => expect(within(dialog).getByRole("img", { name: "LINE 连接二维码" })).toBeInTheDocument())

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("平台 Tab 保持 Radix 键盘焦点顺序并随箭头键切换内容", async () => {
  renderAgents()
  fireEvent.click(screen.getByRole("button", { name: "开始体验" }))

  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByTestId("agent-setup-scroll")).toBeInTheDocument()
  const telegramTab = within(dialog).getByRole("tab", { name: /Telegram/ })
  const lineTab = within(dialog).getByRole("tab", { name: /LINE/ })
  const slackTab = within(dialog).getByRole("tab", { name: /Slack/ })

  await waitFor(() => expect(telegramTab).toHaveFocus())
  fireEvent.keyDown(telegramTab, { key: "ArrowRight" })
  await waitFor(() => expect(lineTab).toHaveFocus())
  expect(lineTab).toHaveAttribute("aria-selected", "true")

  fireEvent.keyDown(lineTab, { key: "ArrowRight" })
  await waitFor(() => expect(slackTab).toHaveFocus())
  expect(slackTab).toHaveAttribute("aria-selected", "true")

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("loading 保留稳定的二维码槽和禁用的继续入口", async () => {
  let resolveSetup!: (value: AgentConnectionSetup) => void
  const client: AgentClient = {
    connectionSetup: vi.fn(() => new Promise<AgentConnectionSetup>((resolve) => { resolveSetup = resolve })),
  }
  renderAgents(client)
  fireEvent.click(screen.getByRole("button", { name: "开始体验" }))

  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveAttribute("data-dialog-state", "loading")
  expect(within(dialog).getByRole("status", { name: "Telegram 连接二维码" })).toBeInTheDocument()
  expect(within(dialog).getByRole("status", { name: "Telegram 连接二维码" }).parentElement).toHaveAttribute("aria-busy", "true")
  expect(within(dialog).getByRole("button", { name: "在 Telegram 继续" })).toBeDisabled()

  resolveSetup(setup("telegram"))
  await waitFor(() => expect(within(dialog).getByRole("link", { name: /在 Telegram 继续/ })).toBeInTheDocument())
  expect(dialog).toHaveAttribute("data-dialog-state", "ready")

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("setup 失败时显示可重试错误且不渲染假链接", async () => {
  const connectionSetup = vi.fn()
    .mockRejectedValueOnce(new Error("setup unavailable"))
    .mockResolvedValueOnce(setup("telegram"))
  renderAgents({ connectionSetup })
  fireEvent.click(screen.getByRole("button", { name: "开始体验" }))

  const dialog = screen.getByRole("dialog")
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("实时配置暂时不可用")
  expect(dialog).toHaveAttribute("data-dialog-state", "error")
  expect(within(dialog).queryByRole("link", { name: /在 Telegram 继续/ })).toBeNull()
  fireEvent.click(within(dialog).getByRole("button", { name: "重试" }))
  await waitFor(() => expect(within(dialog).getByRole("link", { name: /在 Telegram 继续/ })).toBeInTheDocument())
  expect(connectionSetup).toHaveBeenCalledTimes(2)

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it.each([
  ["connected", setup("telegram", { status: "connected" })],
  ["pending", setup("telegram", { status: "pending" })],
  ["expired", setup("telegram", { status: "connected", expires_at: "2020-08-30T06:30:00.000Z" })],
] as const)("依据 status 和 expires_at 渲染 %s 连接状态", async (expectedStatus, response) => {
  const client: AgentClient = { connectionSetup: vi.fn().mockResolvedValue(response) }
  renderAgents(client)
  fireEvent.click(screen.getByRole("button", { name: "开始体验" }))

  const dialog = screen.getByRole("dialog")
  const status = await within(dialog).findByTestId("agent-connection-status")
  expect(status).toHaveAttribute("data-status", expectedStatus)
  expect(status).toHaveAccessibleName(expectedStatus === "connected" ? "已连接" : expectedStatus === "expired" ? "邀请已过期。" : "待接受的邀请")

  if (expectedStatus === "expired") {
    expect(within(dialog).getByRole("button", { name: "在 Telegram 继续" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "重试" })).toBeInTheDocument()
  }

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("过期连接禁用 Continue，并通过重试重新生成可继续的连接", async () => {
  const connectionSetup = vi.fn()
    .mockResolvedValueOnce(setup("telegram", { status: "pending", expires_at: "2020-08-30T06:30:00.000Z" }))
    .mockResolvedValueOnce(setup("telegram", { status: "pending" }))
  renderAgents({ connectionSetup })
  fireEvent.click(screen.getByRole("button", { name: "开始体验" }))

  const dialog = screen.getByRole("dialog")
  await within(dialog).findByTestId("agent-connection-status")
  fireEvent.click(within(dialog).getByRole("button", { name: "重试" }))

  await waitFor(() => expect(connectionSetup).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(within(dialog).getByTestId("agent-connection-status")).toHaveAttribute("data-status", "pending"))
  expect(within(dialog).getByRole("link", { name: /在 Telegram 继续/ })).toBeInTheDocument()

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("桌面能力卡布局由 agents-surface 容器宽度决定，而不是 pointer 条件", () => {
  const css = readFileSync("src/features/app/kokoro-agents-surface.module.css", "utf8")

  expect(css).toContain("@container agents-surface (min-width: 42rem)")
  expect(css).toContain("@container agents-surface (min-width: 60rem)")
  expect(css).not.toContain("(pointer: fine)")
})

it("连接平台面板只保留一份 TabsContent 结构", () => {
  const source = readFileSync("src/features/app/kokoro-agents-surface.tsx", "utf8")
  const openingTags = source.match(/<TabsContent key=\{value\} value=\{value\} className=\{styles\.platformPanel\}>/g) ?? []
  const closingTags = source.match(/<\/TabsContent>/g) ?? []

  expect(openingTags).toHaveLength(1)
  expect(closingTags).toHaveLength(1)
})

it("prefers-reduced-motion 时不建立动态文案轮换计时器", () => {
  vi.useFakeTimers()
  const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList)

  try {
    renderAgents()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("客户支持")
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    matchMedia.mockRestore()
    vi.useRealTimers()
  }
})

it("关闭按钮退出 Agent 设置弹窗并把焦点交还给开始入口", async () => {
  renderAgents()
  const opener = screen.getByRole("button", { name: "开始体验" })
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole("button", { name: "关闭 Agent 设置" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  await waitFor(() => expect(opener).toHaveFocus())
})
