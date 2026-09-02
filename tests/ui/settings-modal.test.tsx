// 设置中心模态（WEB-FACE 面三）：v1 设置导航、tab 切换单显、对话偏好就地存 localStorage，
// 关闭出口(× / Esc / 背幕点击)均触发 onClose。会话态由 shell 保证,模态本身不再自持匿名闸。
// page-clients 均注入 mock（不打网络）。
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRef, useState } from "react"

import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"

const { registerCustomMcp, registerCustomApi, uploadConnectorIcon } = vi.hoisted(() => ({
  registerCustomMcp: vi.fn().mockResolvedValue({}),
  registerCustomApi: vi.fn().mockResolvedValue({}),
  uploadConnectorIcon: vi.fn().mockResolvedValue({ asset_id: "asset_crm", url: "/assets/crm.png" }),
}))

// AccountCard(退出登录跳转)用 useRouter；模态本身不依赖路由。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

vi.mock("@/ui/shell/page-clients", () => ({
  browserTeamClient: () => ({
    currentNamespace: vi.fn().mockResolvedValue("team_1"),
    listMyTeams: vi.fn().mockResolvedValue([
      { team: { id: "team_1", name: "Studio", type: "team" }, membership: { role: "owner" } },
    ]),
    listInvites: vi.fn().mockResolvedValue([]),
    teamDetail: vi.fn().mockRejectedValue(new Error("detail not needed in tab navigation test")),
  }),
  browserBillingClient: () => ({
    summary: vi.fn().mockResolvedValue({ balance_micros: "12500000", held_micros: "500000" }),
  }),
  browserListClient: () => ({
    listModels: vi.fn().mockResolvedValue({
      models: [{ provider: "anthropic", name: "opus", is_default: true }],
    }),
    listAgents: vi.fn().mockResolvedValue({
      agents: [{ name: "general", description: "default", is_default: true }],
    }),
  }),
  // account/appearance/chat tab 不调用下列客户端；仅需存在 export 供模块 import。
  browserHubClient: () => ({
    listSkillPool: vi.fn().mockResolvedValue([
      { name: "YouTube 影片研究", description: "利用第一手影片证据强化深度研究。", content_hash: "preview:youtube", scope: "official", enabled: false, updated_at: Date.UTC(2026, 7, 28) },
      { name: "Typst PDF 制作工具", description: "使用 Typst 生成专业、高品质的 PDF 文件。", content_hash: "preview:typst", scope: "official", enabled: true, updated_at: Date.UTC(2026, 7, 28) },
    ]),
    listSkillCatalog: vi.fn().mockResolvedValue({
      skills: [
        { name: "YouTube 影片研究", description: "利用第一手影片证据强化深度研究。", content_hash: "preview:youtube", scope: "official", installed: false, enabled: false, updated_at: Date.UTC(2026, 7, 28) },
        { name: "Typst PDF 制作工具", description: "使用 Typst 生成专业、高品质的 PDF 文件。", content_hash: "preview:typst", scope: "official", installed: true, enabled: true, updated_at: Date.UTC(2026, 7, 28) },
      ],
      next_cursor: null,
    }),
    skillQuota: vi.fn().mockResolvedValue(null),
    setSkillEnabled: vi.fn().mockResolvedValue(undefined),
    importGithub: vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/skill-repo",
      default_branch: "main",
      skill: { name: "skill-repo", description: "Imported by the settings fixture" },
    }),
    listMcpServers: vi.fn().mockResolvedValue([]),
    listMcpSecrets: vi.fn().mockResolvedValue([]),
    registerCustomMcp,
    registerCustomApi,
    uploadConnectorIcon,
  }),
  browserPricingClient: () => ({}),
  browserEngine: () => null,
}))

// import 顺延到 mock 之后。
import { normalizeSettingsTab, SettingsModal, type SettingsTab } from "@/ui/settings/settings-modal"

const TAB_KEYS = ["account", "appearance", "personalization", "computer", "deployment", "integration", "chat", "shortcuts", "credits", "subscription", "skills", "mcp", "team"]

function renderSettings(
  onClose: () => void = () => {},
  onTabChange?: (tab: SettingsTab) => void,
  preview = false,
  onStartDeployment?: (kind: "website" | "app") => void,
  initialTab: SettingsTab = "account",
  onCreateSkillWithAi?: () => void,
) {
  window.localStorage.setItem("kokoro.locale", "zh")
  return render(
    <ThemeProvider>
      <LocaleProvider>
      <SettingsModal brandName="Acme" preview={preview} initialTab={initialTab} onClose={onClose} onTabChange={onTabChange} onStartDeployment={onStartDeployment} onCreateSkillWithAi={onCreateSkillWithAi} />
      </LocaleProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  registerCustomMcp.mockClear()
  registerCustomApi.mockClear()
  uploadConnectorIcon.mockClear()
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState({}, "", "/")
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.history.replaceState({}, "", "/")
  vi.unstubAllGlobals()
})

describe("SettingsModal 设置中心模态", () => {
  it("兼容 Manus 的 general 设置深链", () => {
    expect(normalizeSettingsTab("general")).toBe("appearance")
    expect(normalizeSettingsTab("appearance")).toBe("appearance")
  })

  it("默认渲染账户 tab 和完整设置导航，不把团队名冒充个人姓名", () => {
    renderSettings()
    expect(screen.getByTestId("settings-account")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "账户", level: 1 })).toBeInTheDocument()
    for (const key of TAB_KEYS) {
      expect(screen.getByTestId(`settings-tab-${key}`)).toBeInTheDocument()
    }
    expect(screen.queryByText("Studio")).toBeNull()
    expect(screen.getByRole("textbox", { name: "全名" })).toHaveValue("—")
    expect(screen.getByText("个人", { exact: true })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "搜索" })).toHaveAttribute("placeholder", "搜索")
  })

  it("设置导航不暴露已退役的 Mail、数据管理和开发人员入口", () => {
    renderSettings()

    expect(screen.queryByTestId("settings-tab-mail")).toBeNull()
    expect(screen.queryByTestId("settings-tab-library")).toBeNull()
    expect(screen.queryByTestId("settings-tab-developer")).toBeNull()
    expect(screen.getByTestId("settings-tab-deployment").querySelector("svg")).toHaveAttribute("viewBox", "0 0 13.333 14.667")
  })

  it("技能导入完成后只关闭子弹窗，不卸载设置中心", async () => {
    renderSettings(() => {}, undefined, true, undefined, "skills")
    await screen.findByText("YouTube 影片研究")

    fireEvent.pointerDown(screen.getByRole("button", { name: "创建" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "从 GitHub 导入" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), {
      target: { value: "https://github.com/acme/skill-repo" },
    })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))
    expect(await within(dialog).findByTestId("github-import-complete")).toBeInTheDocument()

    fireEvent.click(within(dialog).getByTestId("github-import-done"))
    await waitFor(() => expect(screen.queryByTestId("github-import-dialog")).not.toBeInTheDocument())
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument()
    expect(screen.getByTestId("settings-tab-skills")).toHaveAttribute("data-state", "active")
  })

  it("预览态账户身份沿用 site brand，不把 fixture team 名泄漏到站点壳层", async () => {
    renderSettings(() => {}, undefined, true)
    expect(await screen.findAllByText("Acme")).not.toHaveLength(0)
    expect(screen.queryByText("Studio")).toBeNull()
  })

  it("受控打开时把焦点交给当前设置 Tab，而不是留在已隐藏的触发按钮", async () => {
    renderSettings()
    await waitFor(() => expect(screen.getByTestId("settings-tab-account")).toHaveFocus())
  })

  it("打开常规设置时自动聚焦不会滚动并裁切导航首项", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    renderSettings(() => {}, undefined, false, undefined, "appearance")

    await waitFor(() => expect(screen.getByTestId("settings-tab-appearance")).toHaveFocus())
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  it("从下方设置项返回常规时清除导航残留滚动，不裁切首项", () => {
    renderSettings()
    const list = screen.getByRole("tablist")
    Object.defineProperty(list, "scrollTop", { value: 180, writable: true })

    fireEvent.keyDown(screen.getByTestId("settings-tab-appearance"), { key: "Enter" })

    expect(list.scrollTop).toBe(0)
  })

  it("常规设置打开时在桌面窗口尺寸变化后清除导航残留滚动", async () => {
    renderSettings(() => {}, undefined, false, undefined, "appearance")
    const list = screen.getByRole("tablist")
    Object.defineProperty(list, "scrollTop", { value: 48, writable: true })

    fireEvent(window, new Event("resize"))

    await waitFor(() => expect(list.scrollTop).toBe(0))
  })

  it("每个 Tab 都有真实对应的 shadcn tabpanel", () => {
    renderSettings()

    for (const key of TAB_KEYS) {
      const trigger = screen.getByTestId(`settings-tab-${key}`)
      const panelId = trigger.getAttribute("aria-controls")
      expect(panelId).toBeTruthy()
      expect(panelId ? document.getElementById(panelId) : null).toBeInTheDocument()
    }
    expect(screen.getByTestId("settings-panel-account")).toHaveAttribute("role", "tabpanel")
    expect(screen.getByTestId("settings-panel-account")).toHaveAttribute("data-state", "active")
    expect(screen.getByTestId("settings-panel-team")).toHaveAttribute("hidden")
  })

  it("切到外观 tab:显示外观分区、账户分区移出 DOM（一次只显一个 tab）", () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-appearance"), { key: "Enter" })
    expect(screen.getByTestId("settings-appearance")).toBeInTheDocument()
    expect(screen.queryByTestId("settings-account")).not.toBeInTheDocument()
  })

  it("预览态常规设置使用本地 fixture，并按 runtime 品牌呈现广告偏好", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderSettings(() => {}, undefined, true)
    fireEvent.keyDown(screen.getByTestId("settings-tab-appearance"), { key: "Enter" })

    expect(screen.getByRole("radio", { name: "浅色" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "深色" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "自动" })).toBeChecked()
    expect(screen.getByRole("switch", { name: "关于 Acme 的广告" })).toBeChecked()
    const soundNotifications = screen.getByRole("switch", { name: "声音提醒" })
    expect(screen.getByRole("switch", { name: "浏览器通知" })).not.toBeChecked()
    expect(soundNotifications).toBeEnabled()
    fireEvent.click(soundNotifications)
    expect(soundNotifications).toBeChecked()
    fireEvent.click(screen.getByRole("switch", { name: "浏览器通知" }))
    expect(screen.getByRole("switch", { name: "浏览器通知" })).toBeChecked()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("live 常规设置只使用本地状态，不调用已退役的 settings API", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-appearance"), { key: "Enter" })

    fireEvent.click(screen.getByRole("switch", { name: "声音提醒" }))
    expect(screen.getByRole("switch", { name: "声音提醒" })).toBeChecked()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("个性化 tab 提供资料、知识切换和可持久化字段", async () => {
    renderSettings(() => {}, undefined, true, undefined, "personalization")
    expect(screen.getByTestId("settings-personalization")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "个性化", level: 1 })).toBeInTheDocument()
    expect(screen.getByText("Kokoro 使用此资讯为所有任务打造个性化回应。")).toBeInTheDocument()
    const nickname = screen.getByRole("textbox", { name: "昵称" })
    fireEvent.change(nickname, { target: { value: "小可" } })
    fireEvent.blur(nickname)
    expect(JSON.parse(window.localStorage.getItem("kokoro.personalization.preview") ?? "{}")).toMatchObject({ nickname: "小可" })
    expect(document.querySelector(".lucide-layout-grid")).toBeInTheDocument()
    const importMemoryTrigger = screen.getByRole("button", { name: /^匯入记忆$/ })
    fireEvent.click(importMemoryTrigger)
    expect(screen.getByRole("dialog", { name: "匯入记忆" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "粘贴回应内容" })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "取消" })[0])
    expect(screen.getByRole("textbox", { name: "昵称" })).toHaveValue("小可")
    await waitFor(() => expect(importMemoryTrigger).toHaveFocus())
  })

  it("个性化知识入口保留帮助语义并打开完整新增表单", async () => {
    renderSettings(() => {}, undefined, true, undefined, "personalization")

    const knowledgeTab = screen.getByRole("tab", { name: "知识" })
    expect(knowledgeTab.querySelector("svg[aria-hidden='true']")).toBeInTheDocument()
    fireEvent.click(knowledgeTab)
    const addKnowledgeTrigger = screen.getByRole("button", { name: "新增" })
    fireEvent.click(addKnowledgeTrigger)

    const dialog = screen.getByRole("dialog", { name: "新增知识" })
    expect(within(dialog).getByRole("textbox", { name: "名称" })).toBeInTheDocument()
    expect(within(dialog).getByRole("textbox", { name: "使用时机" })).toBeInTheDocument()
    expect(within(dialog).getByRole("textbox", { name: "内容" })).toBeInTheDocument()
    expect(within(dialog).getByText("0 / 2000")).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(addKnowledgeTrigger).toHaveFocus())

    fireEvent.click(addKnowledgeTrigger)
    const reopenedDialog = screen.getByRole("dialog", { name: "新增知识" })
    fireEvent.change(within(reopenedDialog).getByRole("textbox", { name: "名称" }), { target: { value: "发布检查清单" } })
    fireEvent.change(within(reopenedDialog).getByRole("textbox", { name: "使用时机" }), { target: { value: "准备发布时" } })
    fireEvent.change(within(reopenedDialog).getByRole("textbox", { name: "内容" }), { target: { value: "abc" } })
    expect(within(reopenedDialog).getByText("3 / 2000")).toBeInTheDocument()
    const saveKnowledge = within(reopenedDialog).getByRole("button", { name: "保存" })
    expect(saveKnowledge).toBeEnabled()
    fireEvent.click(saveKnowledge)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新增知识" })).not.toBeInTheDocument())
    expect(screen.getByText("发布检查清单")).toBeInTheDocument()
    await waitFor(() => expect(addKnowledgeTrigger).toHaveFocus())

    const searchKnowledge = screen.getByRole("textbox", { name: "搜索知识" })
    fireEvent.change(searchKnowledge, { target: { value: "不存在" } })
    expect(screen.queryByText("发布检查清单")).toBeNull()
    fireEvent.change(searchKnowledge, { target: { value: "发布" } })
    expect(screen.getByText("发布检查清单")).toBeInTheDocument()
  })

  it("记忆导入支持复制、输入启用和预览态提交关闭", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderSettings(() => {}, undefined, true)
    fireEvent.keyDown(screen.getByTestId("settings-tab-personalization"), { key: "Enter" })
    fireEvent.click(screen.getByRole("button", { name: /^匯入记忆$/ }))

    const dialog = screen.getByRole("dialog", { name: "匯入记忆" })
    const promptScroller = within(dialog).getByLabelText("复制此提示词")
    expect(promptScroller).toBeInTheDocument()
    expect(promptScroller).toHaveTextContent("基本资讯")
    expect(promptScroller).toHaveTextContent("偏好与指令")
    expect(promptScroller.parentElement?.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    const importButton = within(dialog).getByRole("button", { name: "导入" })
    expect(importButton).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("button", { name: "复制" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(within(dialog).getByRole("button", { name: "已复制" })).toBeInTheDocument()

    fireEvent.change(within(dialog).getByRole("textbox", { name: "粘贴回应内容" }), {
      target: { value: "偏好简洁回答并使用中文。" },
    })
    expect(importButton).toBeEnabled()
    fireEvent.click(importButton)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "匯入记忆" })).not.toBeInTheDocument())
  })

  it("My Computer 页面可配置储存并打开独立订单确认弹窗", () => {
    renderSettings(() => {}, undefined, true)
    fireEvent.keyDown(screen.getByTestId("settings-tab-computer"), { key: "Enter" })
    expect(screen.getByTestId("settings-computer")).toBeInTheDocument()
    expect(screen.getByText("持续的云工作空间，全天候可用。")).toBeInTheDocument()
    expect(screen.getByTestId("settings-computer").querySelector("svg[viewBox='0 0 32 32']")).toBeInTheDocument()
    expect(screen.getByTestId("settings-computer").querySelector(".lucide-monitor")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /立即建立/ }))
    const dialog = screen.getByRole("dialog", { name: "建立云端电脑" })
    expect(dialog).toHaveTextContent("Standard")
    expect(dialog).toHaveTextContent("$30")
    expect(within(dialog).getByRole("slider", { name: "储存大小（GB）" })).toHaveAttribute("aria-valuenow", "70")
    fireEvent.click(within(dialog).getByRole("button", { name: "250 GB" }))
    expect(within(dialog).getByRole("spinbutton", { name: "储存大小（GB）" })).toHaveValue(250)
    expect(dialog).toHaveTextContent("$48")
    fireEvent.click(within(dialog).getByRole("button", { name: "下一步" }))
    const orderDialog = screen.getByRole("dialog", { name: "确认您的订单" })
    expect(orderDialog).toHaveTextContent("180 GB 额外储存空间")
    expect(orderDialog).toHaveTextContent("$48 /每月")
    expect(within(orderDialog).getByRole("button", { name: "支付" })).toBeInTheDocument()
    expect(screen.getByTestId("computer-create-dialog")).toBeInTheDocument()
    fireEvent.click(within(orderDialog).getAllByRole("button", { name: "取消" })[0])
    expect(screen.queryByRole("dialog", { name: "确认您的订单" })).toBeNull()
    expect(screen.getByRole("dialog", { name: "建立云端电脑" })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "下一步" }))
    fireEvent.click(within(screen.getByRole("dialog", { name: "确认您的订单" })).getByRole("button", { name: "支付" }))
    expect(screen.queryByRole("dialog", { name: "确认您的订单" })).toBeNull()
    expect(screen.queryByTestId("computer-create-dialog")).toBeNull()
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument()
  })

  it("My Computer 本地电脑 Tab 显示文件夹授权状态并可返回云电脑", () => {
    renderSettings(() => {}, undefined, true)
    fireEvent.keyDown(screen.getByTestId("settings-tab-computer"), { key: "Enter" })
    fireEvent.click(screen.getByRole("tab", { name: "本地电脑" }))
    expect(screen.getByRole("tab", { name: "本地电脑" })).toHaveAttribute("aria-selected", "true")
    const localPanel = screen.getByTestId("settings-local-computer")
    expect(within(localPanel).getByText("需要资料夹存取权限")).toBeInTheDocument()
    expect(within(localPanel).getByRole("link", { name: "Acme 桌面版" })).toHaveAttribute("href", "kokoro://app")
    expect(localPanel.querySelector(".lucide-folder-plus")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "立即建立" })).toBeNull()
    fireEvent.click(screen.getByRole("tab", { name: "云电脑" }))
    expect(screen.getByRole("button", { name: "立即建立" })).toBeInTheDocument()
  })

  it("部署页面提供网站、应用和域名三个真实入口", async () => {
    const onStartDeployment = vi.fn()
    const onTabChange = vi.fn()
    renderSettings(() => {}, onTabChange, true, onStartDeployment)
    fireEvent.keyDown(screen.getByTestId("settings-tab-deployment"), { key: "Enter" })
    expect(screen.getByTestId("settings-deployment")).toBeInTheDocument()
    expect(screen.getByText("尚无网站")).toBeInTheDocument()
    expect(screen.getByText("尚无应用程序")).toBeInTheDocument()
    expect(screen.getByText("尚无已购买的域名")).toBeInTheDocument()

    const websiteIcon = document.querySelector('[data-deployment-kind="website"] > div > svg')
    const appIcon = document.querySelector('[data-deployment-kind="app"] > div > svg')
    const domainIcon = document.querySelector('[data-deployment-kind="domain"] > div > svg')
    expect(websiteIcon).toHaveAttribute("viewBox", "0 0 14 14")
    expect(appIcon).toHaveAttribute("viewBox", "0 0 21.068 29.068")
    expect(domainIcon).toHaveClass("lucide-globe")

    const createButtons = screen.getAllByRole("button", { name: "立即建立" })
    fireEvent.click(createButtons[0])
    fireEvent.click(createButtons[1])
    expect(onStartDeployment).toHaveBeenNthCalledWith(1, "website")
    expect(onStartDeployment).toHaveBeenNthCalledWith(2, "app")

    const buyDomain = screen.getByRole("button", { name: "立即购买" })
    buyDomain.focus()
    fireEvent.click(buyDomain)
    const upgradeDialog = screen.getByRole("dialog", { name: "升级方案以购买域名" })
    expect(within(upgradeDialog).getByText("升级方案以购买域名。免费方案仅支持 Acme 子域名。")).toBeInTheDocument()
    expect(upgradeDialog.querySelector(".lucide-globe")).toBeInTheDocument()
    expect(within(upgradeDialog).getByRole("button", { name: "关闭对话框" })).toBeInTheDocument()
    expect(screen.getByTestId("domain-upgrade-toast")).toHaveTextContent("请先升级")
    expect(onTabChange).not.toHaveBeenCalledWith("subscription")

    fireEvent.click(within(upgradeDialog).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "升级方案以购买域名" })).toBeNull())
    await waitFor(() => expect(buyDomain).toHaveFocus())

    fireEvent.click(buyDomain)
    fireEvent.keyDown(screen.getByRole("dialog", { name: "升级方案以购买域名" }), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "升级方案以购买域名" })).toBeNull())
    await waitFor(() => expect(buyDomain).toHaveFocus())

    fireEvent.click(buyDomain)
    fireEvent.click(within(screen.getByRole("dialog", { name: "升级方案以购买域名" })).getByRole("button", { name: "立即升级" }))
    expect(onTabChange).toHaveBeenLastCalledWith("subscription")
    await waitFor(() => expect(screen.getByTestId("settings-tab-subscription")).toHaveAttribute("data-state", "active"))
  })

  it("整合页面提供四项卡片、详情返回和连接状态", async () => {
    renderSettings(() => {}, undefined, true)
    fireEvent.keyDown(screen.getByTestId("settings-tab-integration"), { key: "Enter" })
    expect(screen.getByTestId("settings-integration")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /在 Zapier 中使用 Acme/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /在 Slack 中使用 Acme/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Telegram/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Line/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /在 Zapier 中使用 Acme/ }))
    expect(screen.getByTestId("settings-integration-detail")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Zapier", level: 1 })).toBeInTheDocument()
    const zapierLinks = screen.getAllByRole("link", { name: /试试看/ })
    expect(zapierLinks).toHaveLength(9)
    expect(zapierLinks[0]).toHaveAttribute("href", "https://zapier.com/apps/manus/integrations")
    expect(zapierLinks[1]).toHaveAttribute("href", "https://zapier.com/webintent/create-zap?template=255666880")
    expect(zapierLinks[1].getAttribute("href")).not.toContain("sign_up_email")
    expect(window.location.hash).toBe("#/account/settings/integration/zapier")
    fireEvent.click(screen.getByRole("button", { name: "返回整合" }))
    expect(window.location.hash).toBe("#/account/settings/integration")

    fireEvent.click(screen.getByRole("button", { name: /在 Slack 中使用 Acme/ }))
    expect(screen.getByText("mute")).toBeInTheDocument()
    expect(screen.getByText("unmute")).toBeInTheDocument()
    expect(screen.getByText("!skip")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /文件/ })).toHaveAttribute("href", "https://api.slack.com/docs")
    fireEvent.click(screen.getByRole("button", { name: "返回整合" }))

    fireEvent.click(screen.getByRole("button", { name: /Line/ }))
    expect(screen.getByRole("heading", { name: "LINE", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "连接" }).querySelector(".lucide-arrow-up-right")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "返回整合" }))

    fireEvent.click(screen.getByRole("button", { name: /Telegram/ }))
    const connect = screen.getByRole("button", { name: "连接" })
    fireEvent.click(connect)
    await waitFor(() => expect(screen.getByRole("button", { name: "已连接" })).toBeDisabled())
  })

  it("整合详情深链在刷新挂载时恢复选中项", () => {
    window.history.replaceState({}, "", "/app#/account/settings/integration/zapier")
    renderSettings(() => {}, undefined, true, undefined, "integration")
    expect(screen.getByTestId("settings-integration-detail")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Zapier", level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /试试看/ })).toHaveLength(9)
  })

  it("快捷键 tab 独立于对话偏好并呈现 Manus 风格快捷键行", () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-shortcuts"), { key: "Enter" })
    expect(screen.getByTestId("settings-shortcuts")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "快捷键" })).toBeInTheDocument()
    const heading = screen.getByRole("heading", { name: "键盘快捷键", level: 1 })
    const description = screen.getByText("自定义快捷键——点击任意操作旁的按键，然后按下新的组合键。")
    expect(heading.parentElement).toContainElement(description)
    expect(screen.getByText("新建任务")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "清除新建任务快捷键" })).toBeInTheDocument()
    expect(screen.getByTestId("settings-shortcuts").querySelector("svg[data-shortcut-leading-icon]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "编辑新建任务快捷键" }))
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).toHaveTextContent("输入按键序列")
    expect(screen.queryByRole("button", { name: "清除新建任务快捷键" })).toBeNull()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).toHaveTextContent("⌘⇧O")
    fireEvent.click(screen.getByRole("button", { name: "编辑新建任务快捷键" }))
    fireEvent.keyDown(document, { key: "P", metaKey: true, shiftKey: true })
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).toHaveTextContent("⌘⇧P")
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).not.toHaveTextContent("O")
    fireEvent.click(screen.getByRole("button", { name: "清除新建任务快捷键" }))
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).toHaveTextContent("未设置")
    expect(screen.getByText("重设为预设值")).toBeInTheDocument()
    fireEvent.click(screen.getByText("重设为预设值"))
    expect(screen.getByRole("status", { name: "已保存" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "编辑新建任务快捷键" })).toHaveTextContent("⌘⇧O")
  })

  it("对话 tab:选缺省模型就地存 localStorage + 就地保存反馈", async () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-chat"), { key: "Enter" })
    fireEvent.click(await screen.findByTestId("settings-default-model"))
    fireEvent.click(await screen.findByText("opus"))
    const prefs = JSON.parse(window.localStorage.getItem("kokoro.web.chat-prefs") ?? "{}")
    expect(prefs.model).toBe("anthropic:opus")
    expect(screen.getByTestId("settings-saved")).toBeInTheDocument()
  })

  it("账户中的登录方式使用设置内容区子页面并支持返回", () => {
    renderSettings(() => {}, undefined, true)
    const planBody = screen.getByTestId("settings-account").querySelector('[data-slot="account-plan-body"]')
    expect(planBody).not.toBeNull()
    expect(planBody?.children).toHaveLength(2)
    expect(planBody?.querySelector('[data-slot="account-credit-group"]')).toBeInTheDocument()
    expect(planBody?.querySelector('[data-slot="account-daily-credit-group"]')).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "管理" }))
    expect(screen.getByTestId("settings-login-methods")).toBeInTheDocument()
    const nestedHeading = screen.getByRole("heading", { name: "管理登入方式", level: 1 })
    expect(nestedHeading.parentElement).toHaveAttribute("data-panel", "account")
    expect(screen.getByText("Google")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "新增通行密钥" })).toBeInTheDocument()
    expect(screen.getByText("尚未新增通行密钥")).toBeInTheDocument()
    expect(screen.getByText("新增通行密钥以无密码方式登入。")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "中断连接" }))
    expect(screen.getAllByRole("button", { name: "连接" })).toHaveLength(3)
    fireEvent.click(screen.getAllByRole("button", { name: "连接" })[0]!)
    expect(screen.getByRole("button", { name: "中断连接" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "管理登入方式" }))
    expect(screen.getByTestId("settings-account")).toBeInTheDocument()
  })

  it("账户邮箱和删除操作打开对应的验证弹窗", async () => {
    renderSettings(() => {}, undefined, true)
    fireEvent.click(screen.getByRole("button", { name: "更改" }))
    const emailDialog = screen.getByRole("dialog", { name: "更改电子邮件地址" })
    expect(screen.getByRole("heading", { name: "更改电子邮件地址" })).toBeInTheDocument()
    fireEvent.click(within(emailDialog).getByRole("button", { name: "发送" }))
    fireEvent.click(within(emailDialog).getAllByRole("button", { name: "取消" })[0]!)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "更改电子邮件地址" })).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "删除账户" }))
    expect(screen.getByRole("heading", { name: "确认删除账户" })).toBeInTheDocument()
    const deleteDialog = screen.getByRole("dialog", { name: "确认删除账户" })
    const deleteButton = within(deleteDialog).getByRole("button", { name: "删除账户" })
    expect(deleteButton).toBeDisabled()
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "发送验证码" }))
    fireEvent.change(within(deleteDialog).getByRole("textbox", { name: "输入验证码" }), { target: { value: "123456" } })
    expect(deleteButton).toBeEnabled()
    fireEvent.click(deleteButton)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "确认删除账户" })).toBeNull())
  })

  it("关闭按钮 × 在退出动画完成后触发 onClose", async () => {
    const onClose = vi.fn()
    renderSettings(onClose)
    fireEvent.click(screen.getByTestId("settings-close"))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("Esc 键在退出动画完成后触发 onClose", async () => {
    const onClose = vi.fn()
    renderSettings(onClose)
    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it("使用官方 Dialog 背幕与卡片结构", () => {
    const onClose = vi.fn()
    renderSettings(onClose)
    const card = screen.getByTestId("settings-modal")
    // 卡内点击不冒泡到背幕(stopPropagation),不关闭。
    fireEvent.click(card)
    expect(onClose).not.toHaveBeenCalled()
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeInTheDocument()
  })

  it("设置面板清除 Dialog 默认内边距并按视口盒模型布局", () => {
    renderSettings()
    const card = screen.getByTestId("settings-modal")
    expect(card).toHaveClass("p-0", "box-border")
  })

  it("右侧标题与设置内容由同一个 ScrollArea viewport 滚动", () => {
    renderSettings(() => {}, undefined, false, undefined, "appearance")

    const panel = screen.getByTestId("settings-panel-appearance")
    const viewport = panel.querySelector('[data-slot="scroll-area-viewport"]')
    expect(viewport).not.toBeNull()
    expect(viewport).toContainElement(screen.getByRole("heading", { name: "一般" }))
    expect(viewport).toContainElement(screen.getByTestId("settings-appearance"))
  })

  it("左侧导航显示与真实滚动比例同步的固定 thumb", () => {
    renderSettings(() => {}, undefined, false, undefined, "appearance")
    const list = screen.getByRole("tablist")
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 530 },
      scrollHeight: { configurable: true, value: 602 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })

    fireEvent.scroll(list)
    const thumb = screen.getByTestId("settings-nav-scrollbar")
    expect(thumb).toHaveStyle({ height: "461px", transform: "translateY(2px)" })

    list.scrollTop = 72
    fireEvent.scroll(list)
    expect(thumb).toHaveStyle({ height: "461px", transform: "translateY(67px)" })
  })

  it("内嵌业务面板把横向 gutter 交给 Settings ScrollArea", async () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), { key: "Enter" })
    expect(await screen.findByTestId("settings-panel-skills")).toBeInTheDocument()
    expect(document.querySelector('[data-embedded="true"]')).not.toBeNull()
  })

  it("技能设置使用双列目录、范围筛选和可用状态开关", async () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), { key: "Enter" })

    expect(await screen.findByText("YouTube 影片研究")).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "搜索技能" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "全部" })).toBeChecked()
    expect(screen.getByRole("switch", { name: "启用 YouTube 影片研究" })).not.toBeChecked()
    expect(screen.getByRole("switch", { name: "停用 Typst PDF 制作工具" })).toBeChecked()
    expect(screen.getAllByText("更新于 2026年8月28日").length).toBeGreaterThan(1)
  })

  it("技能创建菜单与浏览目录保持独立交互", async () => {
    renderSettings(() => {}, undefined, false, undefined, "skills", vi.fn())
    fireEvent.keyDown(screen.getByTestId("settings-tab-skills"), { key: "Enter" })
    await screen.findByText("YouTube 影片研究")

    fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "Enter" })
    expect(screen.getByText("使用 AI 创建技能", { selector: '[role="menuitem"]' })).toBeInTheDocument()
    expect(screen.getByText("上传技能", { selector: '[role="menuitem"]' })).toBeInTheDocument()
    expect(screen.getByText("从 GitHub 导入", { selector: '[role="menuitem"]' })).toBeInTheDocument()
    expect(screen.getByText("从官方技能添加", { selector: '[role="menuitem"]' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "从官方技能添加" }))
    expect(await screen.findByRole("dialog", { name: "技能" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "官方" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "第三方" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加 YouTube 影片研究" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "已添加 Typst PDF 制作工具" })).toBeDisabled()
  })

  it("使用 AI 创建技能交给共享 Composer，而不是误打开上传页", async () => {
    const onCreateSkillWithAi = vi.fn()
    renderSettings(() => {}, undefined, false, undefined, "skills", onCreateSkillWithAi)
    await screen.findByText("YouTube 影片研究")

    fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "使用 AI 创建技能" }))

    expect(onCreateSkillWithAi).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("上传一个 zip：根目录下每个文件夹是一个技能。")).toBeNull()
  })

  it("连接器目录支持搜索、分类、添加状态并在关闭后返回浏览入口", async () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" })

    const browse = await screen.findByRole("button", { name: "浏览连接器" })
    fireEvent.click(browse)
    const catalog = await screen.findByRole("dialog", { name: "连接器" })
    const search = within(catalog).getByRole("searchbox", { name: "搜索连接器" })

    fireEvent.change(search, { target: { value: "GitHub" } })
    expect(within(catalog).getByText("GitHub", { exact: true })).toBeInTheDocument()
    expect(within(catalog).queryByText("Gmail", { exact: true })).toBeNull()

    fireEvent.change(search, { target: { value: "" } })
    fireEvent.keyDown(within(catalog).getByRole("tab", { name: "自订 API" }), { key: "Enter" })
    expect(within(catalog).getByText("ElevenLabs API", { exact: true })).toBeInTheDocument()
    expect(within(catalog).queryByText("My Browser", { exact: true })).toBeNull()

    const add = within(catalog).getByRole("button", { name: "添加 ElevenLabs API" })
    fireEvent.click(add)
    expect(within(catalog).getByRole("button", { name: "移除 ElevenLabs API" })).toBeInTheDocument()

    const create = within(catalog).getByRole("button", { name: "创建" })
    fireEvent.keyDown(create, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "自订 API" }))
    const customApi = await screen.findByRole("dialog", { name: "新增自订 API" })
    const save = within(customApi).getByRole("button", { name: "保存" })
    expect(save).toBeDisabled()

    const iconInput = customApi.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(iconInput, { target: { files: [new File(["text"], "icon.txt", { type: "text/plain" })] } })
    expect(within(customApi).getByRole("alert")).toHaveTextContent("请选择 PNG 或 JPG 图像。")
    fireEvent.change(iconInput, {
      target: { files: [new File([new Uint8Array(1024 * 1024 + 1)], "large.png", { type: "image/png" })] },
    })
    expect(within(customApi).getByRole("alert")).toHaveTextContent("图像大小不能超过 1 MB。")
    fireEvent.change(iconInput, { target: { files: [new File(["png"], "crm.png", { type: "image/png" })] } })
    expect(within(customApi).queryByRole("alert")).toBeNull()
    expect(within(customApi).getByText("crm.png")).toBeInTheDocument()

    fireEvent.change(within(customApi).getByRole("textbox", { name: /^名称$/ }), { target: { value: "CRM API" } })
    fireEvent.change(within(customApi).getByRole("textbox", { name: "密钥名称" }), { target: { value: "CRM_TOKEN" } })
    fireEvent.change(within(customApi).getByRole("textbox", { name: "数值" }), { target: { value: "example-token" } })
    expect(save).toBeEnabled()

    fireEvent.click(within(customApi).getByRole("button", { name: "添加密钥" }))
    expect(within(customApi).getAllByRole("textbox", { name: "密钥名称" })).toHaveLength(2)
    expect(save).toBeDisabled()
    fireEvent.click(within(customApi).getByRole("button", { name: "移除密钥" }))
    fireEvent.click(save)
    await waitFor(() => expect(uploadConnectorIcon).toHaveBeenCalledWith(expect.objectContaining({ name: "crm.png" })))
    await waitFor(() => expect(registerCustomApi).toHaveBeenCalledWith({
      name: "CRM API",
      notes: null,
      icon_asset_id: "asset_crm",
      secrets: [{ name: "CRM_TOKEN", value: "example-token" }],
      enabled: true,
    }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新增自订 API" })).toBeNull())
    await waitFor(() => expect(create).toHaveFocus())
    expect(screen.getByRole("dialog", { name: "连接器" })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "连接器" })).toBeNull())
    await waitFor(() => expect(browse).toHaveFocus())
  })

  it("自订 API 保存失败时保留表单和弹窗并显示错误", async () => {
    registerCustomApi.mockRejectedValueOnce(new Error("fixture rejection"))
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" })
    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }))
    const catalog = await screen.findByRole("dialog", { name: "连接器" })
    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "自订 API" }))

    const dialog = await screen.findByRole("dialog", { name: "新增自订 API" })
    const name = within(dialog).getByRole("textbox", { name: /^名称$/ })
    const secretName = within(dialog).getByRole("textbox", { name: "密钥名称" })
    const secretValue = within(dialog).getByRole("textbox", { name: "数值" })
    fireEvent.change(name, { target: { value: "CRM API" } })
    fireEvent.change(secretName, { target: { value: "CRM_TOKEN" } })
    fireEvent.change(secretValue, { target: { value: "WRITE_ONLY" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作失败，请稍后再试。")
    expect(screen.getByRole("dialog", { name: "新增自订 API" })).toBeInTheDocument()
    expect(name).toHaveValue("CRM API")
    expect(secretName).toHaveValue("CRM_TOKEN")
    expect(secretValue).toHaveValue("WRITE_ONLY")
  })

  it("自订 MCP 使用参考字段、动态 header 和单一发布菜单", async () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" })

    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }))
    const catalog = await screen.findByRole("dialog", { name: "连接器" })
    const create = within(catalog).getByRole("button", { name: "创建" })
    fireEvent.keyDown(create, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "自订 MCP" }))

    const dialog = await screen.findByRole("dialog", { name: "MCP 设置" })
    const save = within(dialog).getAllByRole("button", { name: "保存" })[0]
    const saveOptions = within(dialog).getByRole("button", { name: "保存选项" })
    expect(save).toBeDisabled()
    expect(saveOptions).toBeDisabled()

    fireEvent.click(within(dialog).getByRole("button", { name: "新增自订 header" }))
    expect(within(dialog).getByPlaceholderText("Header 名称")).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText("Header 值")).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "移除 header" }))
    expect(within(dialog).queryByPlaceholderText("Header 名称")).toBeNull()

    fireEvent.change(within(dialog).getByPlaceholderText("e.g., My Custom Server"), { target: { value: "Demo MCP" } })
    fireEvent.change(within(dialog).getByPlaceholderText("https://mcp.yourserver.com/mcp"), { target: { value: "https://example.com/mcp" } })
    expect(save).toBeEnabled()
    expect(saveOptions).toBeEnabled()

    fireEvent.keyDown(saveOptions, { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: "发布到专案" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "保存并启用" })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "保存为停用" })).toBeNull()
  })

  it("JSON 导入与 URL 添加使用独立流程，而不是复用 Custom MCP 表单", async () => {
    renderSettings()
    fireEvent.keyDown(screen.getByTestId("settings-tab-mcp"), { key: "Enter" })
    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }))
    let catalog = await screen.findByRole("dialog", { name: "连接器" })

    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "透过 JSON 汇入 MCP" }))
    const jsonDialog = await screen.findByRole("dialog", { name: "透过 JSON 导入" })
    expect(within(jsonDialog).queryByRole("textbox", { name: "服务器名称" })).toBeNull()
    const jsonInput = within(jsonDialog).getByRole("textbox", { name: "请粘贴您的设置 JSON" })
    const importButton = within(jsonDialog).getByRole("button", { name: "导入" })
    expect(importButton).toBeDisabled()
    fireEvent.change(jsonInput, { target: { value: "{" } })
    fireEvent.click(importButton)
    expect(await within(jsonDialog).findByRole("alert")).toHaveTextContent("JSON 格式无效")
    fireEvent.change(jsonInput, { target: { value: '{"mcpServers":{"demo":{"type":"streamableHttp","url":"https://fixture.example.test/mcp"}}}' } })
    fireEvent.click(importButton)
    await waitFor(() => expect(registerCustomMcp).toHaveBeenCalledWith({
      name: "demo",
      transport: "streamable_http",
      endpoint_url: "https://fixture.example.test/mcp",
      icon_asset_id: null,
      instructions: null,
      headers: [],
      enabled: true,
    }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "透过 JSON 导入" })).toBeNull())

    fireEvent.click(await screen.findByRole("button", { name: "浏览连接器" }))
    catalog = await screen.findByRole("dialog", { name: "连接器" })
    fireEvent.keyDown(within(catalog).getByRole("button", { name: "创建" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /透过 URL 添加 MCP/ }))
    const urlDialog = await screen.findByRole("dialog", { name: /透过 URL 添加 MCP/ })
    expect(within(urlDialog).queryByRole("textbox", { name: "请粘贴您的设置 JSON" })).toBeNull()
    const save = within(urlDialog).getByRole("button", { name: "保存" })
    const publish = within(urlDialog).getByRole("button", { name: /保存并发布/ })
    expect(save).toBeDisabled()
    expect(publish).toBeDisabled()
    fireEvent.change(within(urlDialog).getByRole("textbox", { name: /服务器名称/ }), { target: { value: "Demo URL MCP" } })
    fireEvent.change(within(urlDialog).getByRole("textbox", { name: /服务器 URL/ }), { target: { value: "https://fixture.example.test/mcp" } })
    expect(save).toBeEnabled()
    expect(publish).toBeEnabled()
    fireEvent.click(within(urlDialog).getByRole("button", { name: /进阶设置/ }))
    expect(within(urlDialog).getByRole("textbox", { name: "OAuth 用户端 ID" })).toBeInTheDocument()
    expect(within(urlDialog).getByLabelText("OAuth 用户端密钥")).toHaveAttribute("autocomplete", "new-password")
  })

  it("没有真实 DialogTrigger 时关闭也能把焦点交还给稳定的导航按钮", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button ref={returnFocusRef} type="button">导航</button>
          {open ? <SettingsModal initialTab="account" onClose={() => setOpen(false)} returnFocusRef={returnFocusRef} /> : null}
        </>
      )
    }
    render(<ThemeProvider><LocaleProvider><Harness /></LocaleProvider></ThemeProvider>)
    fireEvent.click(screen.getByTestId("settings-close"))
    await waitFor(() => expect(returnFocusRef.current).toHaveFocus())
  })

  it("设置关闭回收焦点时不改变页面滚动位置", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button ref={returnFocusRef} type="button">导航</button>
          {open ? <SettingsModal initialTab="account" onClose={() => setOpen(false)} returnFocusRef={returnFocusRef} /> : null}
        </>
      )
    }
    render(<ThemeProvider><LocaleProvider><Harness /></LocaleProvider></ThemeProvider>)
    fireEvent.click(screen.getByTestId("settings-close"))
    await waitFor(() => expect(returnFocusRef.current).toHaveFocus())
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  it("深链打开且没有 return ref 时关闭也回到 Composer", async () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <textarea data-settings-return-target="composer" aria-label="对话输入" />
          {open ? <SettingsModal initialTab="subscription" onClose={() => setOpen(false)} /> : null}
        </>
      )
    }
    render(<ThemeProvider><LocaleProvider><Harness /></LocaleProvider></ThemeProvider>)
    fireEvent.click(screen.getByTestId("settings-close"))
    await waitFor(() => expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveFocus())
  })

  it("多站点嵌入时设置关闭回退焦点限定在当前 shell", async () => {
    const localComposerRef = createRef<HTMLTextAreaElement>()
    function Harness() {
      const scopeRef = createRef<HTMLDivElement>()
      const [open, setOpen] = useState(true)
      return (
        <>
          <textarea data-settings-return-target="composer" aria-label="另一个站点输入框" />
          <div ref={scopeRef}>
            <textarea ref={localComposerRef} data-settings-return-target="composer" aria-label="当前站点输入框" />
            {open ? (
              <SettingsModal
                initialTab="subscription"
                onClose={() => setOpen(false)}
                focusScopeRef={scopeRef}
              />
            ) : null}
          </div>
        </>
      )
    }
    render(<ThemeProvider><LocaleProvider><Harness /></LocaleProvider></ThemeProvider>)
    fireEvent.click(screen.getByTestId("settings-close"))
    await waitFor(() => expect(localComposerRef.current).toHaveFocus())
  })

  it("移动触发器在关闭前因断点变为零尺寸时回退到 Composer", async () => {
    const returnFocusRef = createRef<HTMLButtonElement>()
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button ref={returnFocusRef} data-slot="sidebar-trigger" type="button">导航</button>
          <textarea data-settings-return-target="composer" aria-label="对话输入" />
          {open ? (
            <SettingsModal
              initialTab="account"
              onClose={() => setOpen(false)}
              returnFocusRef={returnFocusRef}
            />
          ) : null}
        </>
      )
    }
    render(<ThemeProvider><LocaleProvider><Harness /></LocaleProvider></ThemeProvider>)
    fireEvent.click(screen.getByTestId("settings-close"))
    await waitFor(() => expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveFocus())
  })

  it("Web 设置使用横向 Tab，并通过更多菜单打开次级分区", async () => {
    const onTabChange = vi.fn()
    render(
      <ThemeProvider>
        <LocaleProvider>
          <SettingsModal
            initialTab="account"
            onClose={() => {}}
            onTabChange={onTabChange}
          />
        </LocaleProvider>
      </ThemeProvider>,
    )

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal")
    expect(screen.getByTestId("settings-tab-mcp")).not.toHaveAttribute("data-desktop-secondary")
    expect(screen.getByTestId("settings-tab-skills")).toHaveAttribute("data-desktop-secondary", "true")
    fireEvent.keyDown(screen.getByTestId("settings-more"), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "技能" }))
    expect(onTabChange).toHaveBeenCalledWith("skills")
    expect(screen.getByTestId("settings-panel-skills")).toBeInTheDocument()
  })

})
