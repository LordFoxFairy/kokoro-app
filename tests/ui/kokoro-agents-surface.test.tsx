import { readFileSync } from "node:fs"

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ComponentProps } from "react"

import { LocaleProvider } from "@/i18n/context"
import { KokoroAgentsSurface } from "@/features/app/kokoro-agents-surface"
import { AgentClientError, type AgentClient, type AgentConnectionSetup } from "@/agents/client"

const subject = "telegram-test-actor"
const boundary = { admitted: true, subject, tenant: "fixture", generation: 1 }
const setupId = "a".repeat(32)
const expires = "2099-08-30T06:30:00.000Z"
const link = `https://t.me/KokoroFixtureBot?start=${setupId}`
const telegram = { platform: "telegram" } as const
const disconnected = { ...telegram, status: "disconnected", state_version: "1" } as const
const awaiting = { ...telegram, status: "awaiting_telegram", state_version: "2", setup_id: setupId, expires_at: expires, continue_url: link } as const
const proofRequested = { ...telegram, status: "awaiting_confirmation", state_version: "3", setup_id: setupId, expires_at: expires } as const
const connected = { ...telegram, status: "connected", state_version: "4", connected_at: "2026-08-30T06:30:00.000Z" } as const

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.setItem("kokoro.web.auth-index-subject", subject)
})
afterEach(() => { cleanup(); window.localStorage.removeItem("kokoro.web.auth-index-subject") })

function renderAgents(options: { client?: AgentClient; preview?: boolean } = {}) {
  const props: ComponentProps<typeof KokoroAgentsSurface> = { projectReadBoundary: boundary }
  if (options.client !== undefined) props.client = options.client
  if (options.preview !== undefined) props.preview = options.preview
  return render(<LocaleProvider><KokoroAgentsSurface {...props} /></LocaleProvider>)
}

function openSetup() {
  fireEvent.click(screen.getByRole("button", { name: "开始体验" }))
  return within(screen.getByRole("dialog"))
}

it("Agent 首页呈现 Hero、四项能力和即将上线平台", () => {
  renderAgents({ preview: true })

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
  renderAgents({ preview: true })

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
  renderAgents({ preview: true })
  const identityCard = screen.getByRole("button", { name: /品牌一致性的 AI 身份/ })

  fireEvent.click(identityCard)
  const dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭 Agent 设置" }))

  await waitFor(() => expect(identityCard).toHaveFocus())
})

it("预览和未接入的平台不展示合成链接或发请求", async () => {
  const client = { connectionSetup: vi.fn(), changeConnection: vi.fn() }
  renderAgents({ preview: true, client })
  const dialog = openSetup()
  expect(dialog.getByRole("status")).toHaveTextContent("Telegram 连接暂不可用")
  for (const label of ["LINE", "Slack"]) {
    fireEvent.focus(dialog.getByRole("tab", { name: label }))
    await waitFor(() => expect(dialog.getByRole("status")).toHaveTextContent(`${label} 连接暂不可用`))
    expect(dialog.queryByRole("link")).not.toBeInTheDocument()
  }
  expect(client.connectionSetup).not.toHaveBeenCalled()
  expect(client.changeConnection).not.toHaveBeenCalled()
})

it("平台 Tab 保持 Radix 键盘焦点顺序并随箭头键切换内容", async () => {
  renderAgents({ preview: true })
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

it("Telegram opens read-only; a setup starts only from its explicit owner-versioned command", async () => {
  const connectionSetup = vi.fn<AgentClient["connectionSetup"]>()
    .mockResolvedValueOnce(disconnected).mockResolvedValueOnce(proofRequested).mockResolvedValueOnce(connected)
  const changeConnection = vi.fn<AgentClient["changeConnection"]>()
    .mockResolvedValueOnce(awaiting).mockResolvedValueOnce(connected).mockResolvedValueOnce({ ...disconnected, state_version: "5" })
  const client = { connectionSetup, changeConnection }
  const first = renderAgents({ client })
  let dialog = openSetup()
  expect(dialog.getByRole("status", { name: "正在检查 Telegram 连接…" })).toBeInTheDocument()
  const start = await dialog.findByRole("button", { name: "开始连接 Telegram" })
  expect(connectionSetup).toHaveBeenCalledTimes(1)
  expect(changeConnection).not.toHaveBeenCalled()
  fireEvent.click(start)
  expect(changeConnection).toHaveBeenNthCalledWith(1, "telegram", { action: "start", expected_state_version: "1" }, expect.any(AbortSignal))
  expect(await dialog.findByRole("link", { name: "在 Telegram 继续" })).toHaveAttribute("href", link)
  expect(dialog.getByRole("img", { name: "Telegram 连接二维码" })).toHaveAttribute("width", "140")
  expect(dialog.queryByLabelText("Telegram 确认码")).not.toBeInTheDocument()

  fireEvent.click(dialog.getByRole("button", { name: "查看 Telegram 状态" }))
  const proof = "p".repeat(22)
  fireEvent.change(await dialog.findByLabelText("Telegram 确认码"), { target: { value: proof } })
  fireEvent.click(dialog.getByRole("button", { name: "确认连接" }))
  expect(changeConnection).toHaveBeenNthCalledWith(2, "telegram", { action: "confirm", expected_state_version: "3", setup_id: setupId, proof }, expect.any(AbortSignal))
  expect(await dialog.findByRole("status", { name: "已连接" })).toBeInTheDocument()
  expect(dialog.queryByLabelText("Telegram 确认码")).not.toBeInTheDocument()
  expect(dialog.queryByRole("link")).not.toBeInTheDocument()

  first.unmount()
  renderAgents({ client })
  dialog = openSetup()
  await dialog.findByRole("status", { name: "已连接" })
  expect(connectionSetup).toHaveBeenCalledTimes(3)
  fireEvent.click(dialog.getByRole("button", { name: "断开 Telegram" }))
  expect(changeConnection).toHaveBeenNthCalledWith(3, "telegram", { action: "disconnect", expected_state_version: "4" }, expect.any(AbortSignal))
  expect(await dialog.findByRole("status", { name: "未连接" })).toBeInTheDocument()
})

it("过期修订只重新 GET，已切走的 setup 回执不覆盖面板", async () => {
  let finish!: (value: AgentConnectionSetup) => void
  const connectionSetup = vi.fn<AgentClient["connectionSetup"]>().mockResolvedValueOnce(disconnected)
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const changeConnection = vi.fn<AgentClient["changeConnection"]>().mockRejectedValueOnce(new AgentClientError(412, "agent_connection_precondition_failed"))
  renderAgents({ client: { connectionSetup, changeConnection } })
  const dialog = openSetup()
  fireEvent.click(await dialog.findByRole("button", { name: "开始连接 Telegram" }))
  await waitFor(() => expect(connectionSetup).toHaveBeenCalledTimes(2))
  const readback = connectionSetup.mock.calls[1]?.[1]
  fireEvent.focus(dialog.getByRole("tab", { name: "LINE" }))
  expect(readback?.aborted).toBe(true)
  await act(async () => { finish(awaiting) })
  expect(dialog.getByRole("status")).toHaveTextContent("LINE 连接暂不可用")
  expect(dialog.queryByRole("link")).not.toBeInTheDocument()
  expect(changeConnection).toHaveBeenCalledTimes(1)
})

it("打开的未完成票据到期即撤下，等待显式回读，不自动发请求", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-08-30T06:30:00.000Z"))
  const connectionSetup = vi.fn<AgentClient["connectionSetup"]>().mockResolvedValue({ ...awaiting, expires_at: "2026-08-30T06:30:01.000Z" })
  const changeConnection = vi.fn<AgentClient["changeConnection"]>()
  try {
    renderAgents({ client: { connectionSetup, changeConnection } })
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "开始体验" })) })
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByRole("img", { name: "Telegram 连接二维码" })).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(dialog.getByRole("status", { name: "连接设置已过期。" })).toBeInTheDocument()
    expect(dialog.queryByRole("img", { name: "Telegram 连接二维码" })).not.toBeInTheDocument()
    expect(dialog.queryByRole("link")).not.toBeInTheDocument()
    expect(connectionSetup).toHaveBeenCalledTimes(1)
    expect(changeConnection).not.toHaveBeenCalled()
  } finally { cleanup(); vi.useRealTimers() }
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
    renderAgents({ preview: true })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("客户支持")
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    matchMedia.mockRestore()
    vi.useRealTimers()
  }
})

it("关闭按钮退出 Agent 设置弹窗并把焦点交还给开始入口", async () => {
  renderAgents({ preview: true })
  const opener = screen.getByRole("button", { name: "开始体验" })
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole("button", { name: "关闭 Agent 设置" }))
  expect(screen.queryByRole("dialog")).toBeNull()
  await waitFor(() => expect(opener).toHaveFocus())
})
