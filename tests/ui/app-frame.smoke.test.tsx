// 壳层主路径冒烟：发送 → 流式过程 → HITL 批准 → 终态收束；刷新水合后审批卡直接可操作。
// （行为规格在 core/engine 层。）

import { act } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mockedPathname = vi.hoisted(() => ({ value: "/app" }))

// canvas 面板构造下载 URL 需要 base URL（本文件不发真实请求，仅 URL 拼接）。
vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }))
// AppFrame 的错误恢复卡（余额/套餐）改为路由跳设置中心,需 mock next/navigation。
vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import { addConversation, type ConversationStore } from "@/core/conversations"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { resetCanvasStore } from "@/ui/canvas/canvas-store"
import { AppFrame, COMPACT_DESKTOP_RAIL_BREAKPOINT, settingsTabFromLocation, type EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { KokoroAppSurface } from "@/features/app/kokoro-app-surface"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import type { ScheduledTaskClient } from "@/features/app/scheduled-task-client"

import {
  awaitingPayload,
  makeEvent,
  makePendingPause,
  makeSnapshot,
  resetFixtureSeq,
} from "../core/fixtures"
import { createFakeClient, createMemoryStorage, settle, type FakeClient } from "../engine/fakes"

let client: FakeClient
let engine: SessionEngine

beforeEach(() => {
  mockedPathname.value = "/app"
  window.history.replaceState(window.history.state, "", "/")
  resetFixtureSeq()
  resetCanvasStore()
  document.cookie = "sidebar_state=; Max-Age=0; path=/"
  window.localStorage.clear()
  window.sessionStorage.clear()
  // 锁定中文源语言：jsdom navigator 默认 en-US 会让 LocaleProvider 协商到 en，
  // 而本文件断言中文文案。显式置 zh 偏好，走查/真栈另测语言切换。
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(() => {
  engine.dispose()
  cleanup()
})

it("数据管理子视图 hash 刷新后仍解析为设置页", () => {
  buildEngine()
  window.history.replaceState(null, "", "/app#/account/settings/library/cloud-browser")
  expect(settingsTabFromLocation()).toBe("library")
  window.history.replaceState(null, "", "/app#/account/settings/library/authorized-apps")
  expect(settingsTabFromLocation()).toBe("library")
})

it("开发人员复数深链和参考嵌套路由都恢复到开发人员页", () => {
  buildEngine()
  window.history.replaceState(null, "", "/app#/account/settings/developers")
  expect(settingsTabFromLocation()).toBe("developer")
  window.history.replaceState(null, "", "/app#/account/general/developers/settings/developers")
  expect(settingsTabFromLocation()).toBe("developer")
})

function buildEngine(initial: ConversationStore | null = null) {
  client = createFakeClient()
  let idCounter = 0
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(initial),
    now: () => 1_000,
    createId: (prefix) => `${prefix}_${(idCounter += 1)}`,
  })
}

it("工作台可见按钮都具备可读名称，分隔条具备键盘语义", () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const unnamed = screen.getAllByRole("button").filter((button) => {
    const name = button.getAttribute("aria-label") ?? button.getAttribute("title") ?? button.textContent
    return name?.trim() === ""
  })
  expect(unnamed).toHaveLength(0)

  const railSeparator = screen.getByRole("separator", { name: "调整侧栏宽度" })
  expect(railSeparator).toHaveAttribute("aria-valuemin", "240")
  expect(railSeparator).toHaveAttribute("aria-valuemax", "440")
  expect(railSeparator).toHaveAttribute("aria-valuenow", "300")
  expect(railSeparator).toHaveAttribute("aria-valuetext", "300px")
})

it("User Web 桌面首帧默认进入 Manus 风格紧凑 Rail，并可展开完整导航", async () => {
  buildEngine()
  const previousWidth = window.innerWidth
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })

  try {
    expect(COMPACT_DESKTOP_RAIL_BREAKPOINT).toBe(768)
    render(
      <ThemeProvider>
        <LocaleProvider>
          <KokoroAppSurface engine={engine} />
        </LocaleProvider>
      </ThemeProvider>,
    )

    await waitFor(() => {
      const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
      expect(shell).toHaveAttribute("data-rail-collapsed", "true")
      expect(shell).toHaveStyle({ "--sidebar-width-icon": "52px" })
    })
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth })
  }
})

it("桌面 Rail 拖动把事务标记挂到真实 SidebarProvider 节点并在 pointerup 清理", () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const separator = screen.getByRole("separator", { name: "调整侧栏宽度" })
  const shell = separator.closest('[data-slot="sidebar-wrapper"]')
  expect(shell).toBeTruthy()
  fireEvent.pointerDown(separator, { clientX: 320, pointerId: 1 })
  expect(shell).toHaveAttribute("data-rail-resizing", "true")
  expect(shell).toHaveAttribute("data-resizing", "true")
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(shell).not.toHaveAttribute("data-rail-resizing")
  expect(shell).not.toHaveAttribute("data-resizing")
})

it("桌面折叠侧栏后焦点交给新的展开按钮", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }))
  await waitFor(() => {
    const trigger = screen.getByRole("button", { name: "展开侧栏" })
    expect(trigger).toHaveFocus()
    // TooltipTrigger must not overwrite SidebarTrigger's primitive identity
    // when the collapsed control is composed with a tooltip.
    expect(trigger).toHaveAttribute("data-sidebar", "trigger")
    expect(trigger).toHaveAttribute("data-slot", "sidebar-trigger")
  })
})

it("站点可以把桌面首访 rail 设为 Manus 风格 icon rail", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" desktopRailCollapsed />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toHaveAttribute("data-rail-collapsed", "true")
  })
})

it("Kokoro 直接会话首页以 Composer 为主，而项目入口不替代该直接会话", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} desktopRailCollapsed={false} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    expect(screen.getByRole("form", { name: "消息编辑区" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "我能为你做什么？" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /制作简报/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /制作游戏/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /指令/ })).toBeNull()
    const kokoroLinks = screen.getAllByRole("link", { name: "Kokoro" })
    expect(kokoroLinks.find((link) => link.getAttribute("href") === "/app")).toBeDefined()
    expect(kokoroLinks.find((link) => link.getAttribute("href") === "/app/project/kokoro")).toBeDefined()
  })
})

it("站点路由把直接会话与专案内会话投影为两个独立工作区", async () => {
  buildEngine()
  mockedPathname.value = "/app/project/kokoro"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} desktopRailCollapsed={false} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="direct-chat-welcome"]')).toBeNull()
    expect(screen.getByRole("navigation", { name: "任务" })).toHaveAttribute("data-conversation-list", "project-conversation")
    expect(screen.getAllByRole("link", { name: "Kokoro" }).some((link) => link.getAttribute("href") === "/app")).toBe(true)
  })
})

it("专案路由首帧展开 scoped rail，而直接会话仍保持紧凑 rail", async () => {
  buildEngine()
  mockedPathname.value = "/app/project/kokoro"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
    expect(shell).toHaveAttribute("data-rail-collapsed", "false")
    expect(shell).toHaveStyle({ "--rail-seam-width": "300px" })
  })
})

it("外挂路由渲染一级插件目录且不残留会话 Composer", async () => {
  buildEngine()
  mockedPathname.value = "/app/plugins"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  expect(await screen.findByTestId("plugins-page")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "外挂", level: 1 })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "外挂" })).toHaveAttribute("href", "/app/plugins")
  expect(screen.queryByRole("form", { name: "消息编辑区" })).toBeNull()
})

it("主导航在已挂载工作台内即时切换，不等待空路由的 RSC 请求", async () => {
  buildEngine()
  window.history.replaceState(window.history.state, "", "/app")
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByTestId("rail-skills"))

  await waitFor(() => {
    expect(window.location.pathname).toBe("/app/skills")
    expect(screen.getByTestId("skills-surface")).toBeInTheDocument()
  })
})

it("已排程路由渲染独立日历空态且不残留会话 Composer", async () => {
  buildEngine()
  mockedPathname.value = "/app/scheduled"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  expect(await screen.findByTestId("scheduled-surface")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: /能独立执行工作/, level: 2 })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "已排程" })).toHaveAttribute("href", "/app/scheduled?tab=calendar")
  expect(screen.queryByRole("form", { name: "消息编辑区" })).toBeNull()
})

it("KokoroAppSurface 将显式 ScheduledTaskClient 注入已排程 live surface", async () => {
  buildEngine()
  mockedPathname.value = "/app/scheduled"
  window.history.replaceState(window.history.state, "", "/app/scheduled?tab=list")
  const scheduledTaskClient: ScheduledTaskClient = {
    listScheduledTasks: vi.fn().mockResolvedValue([{
      id: "scheduled_injected_1",
      title: "Injected live task",
      frequency: "daily",
      time: "08:00",
      status: "active",
    }]),
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} scheduledTaskClient={scheduledTaskClient} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  expect(await screen.findByText("Injected live task")).toBeInTheDocument()
  expect(scheduledTaskClient.listScheduledTasks).toHaveBeenCalledTimes(1)
})

it("资料库路由渲染独立目录而不是设置中心弹窗", async () => {
  buildEngine()
  mockedPathname.value = "/app/library"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  expect(await screen.findByTestId("library-page")).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "资料库", level: 1 })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "搜寻档案" })).toBeInTheDocument()
  expect(screen.queryByTestId("settings-modal")).toBeNull()
  expect(screen.queryByRole("form", { name: "消息编辑区" })).toBeNull()
})

it("恢复了会话消息时目录路由仍保持独立，不被 ConversationThread 抢占", async () => {
  const initial = addConversation(null, "conv_catalog", 500)
  buildEngine(initial)
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({
    sessionId: "conv_catalog",
    messages: [{
      message_id: "msg_catalog",
      role: "user",
      content: "恢复的旧消息",
      status: "completed",
      created_at: "2026-07-02T00:00:00Z",
    }],
  }))
  engine.dispose()
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage(initial),
    now: () => 1_000,
  })

  function CatalogProbe() {
    return <div data-testid="catalog-probe">Agent catalog</div>
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={CatalogProbe}
          emptyStateOwnsComposer
          hideWorkspaceHeader
          standaloneSurface
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await act(settle)
  await act(async () => {
    client.lastStream().emit([
      makeEvent("message.user", { message_id: "msg_catalog", content: "恢复的旧消息" }),
    ])
  })
  await act(settle)

  expect(screen.getByTestId("catalog-probe")).toBeInTheDocument()
  expect(screen.queryByTestId("conversation-timeline")).toBeNull()
  expect(screen.queryByRole("form", { name: "消息编辑区" })).toBeNull()
})

it("专案入口是受 project_ref 约束的工作区，含专案会话 Composer 与项目上下文", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          projectWorkspace
          projectRef="project_kokoro"
          emptyState={KokoroProjectWorkspace}
          emptyStateOwnsComposer
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/app")
    expect(screen.getByRole("navigation", { name: "任务" })).toHaveAttribute("data-conversation-list", "project-conversation")
    expect(screen.getByRole("form", { name: "消息编辑区" })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument()
    expect(screen.getByText("文件和资源")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Kokoro 工作区" })).toHaveTextContent("Kokoro 1.6")
    expect(screen.getByRole("heading", { name: "Kokoro" })).toBeInTheDocument()
  })
})

it("切换会话使用无刷新 URL 状态，并支持新建会话清理地址", async () => {
  buildEngine({
    activeId: "conv_a",
    conversations: [
      { id: "conv_a", title: "第一个会话", updatedAt: 2, mode: "fast" },
      { id: "conv_b", title: "第二个会话", updatedAt: 1, mode: "fast" },
    ],
  })
  function ConversationProbe({ onSelectProjectConversation }: EmptyStateProps) {
    return (
      <button type="button" onClick={() => onSelectProjectConversation?.("conv_b")}>
        第二个会话
      </button>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" emptyState={ConversationProbe} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(await screen.findByRole("button", { name: "第二个会话" }))
  await waitFor(() => {
    expect(window.location.search).toBe("?conversation=conv_b")
    expect(engine.getSnapshot().store?.activeId).toBe("conv_b")
  })

  fireEvent.click(screen.getByTestId("rail-new-task"))
  await waitFor(() => {
    expect(window.location.search).toBe("")
    expect(engine.getSnapshot().store?.activeId).not.toBe("conv_b")
  })
})

it("独立目录打开来源会话时先回到 Chat 路由并保留 conversation 查询", async () => {
  buildEngine({
    activeId: "conv_a",
    conversations: [
      { id: "conv_a", title: "第一个会话", updatedAt: 2, mode: "fast" },
      { id: "conv_b", title: "来源会话", updatedAt: 1, mode: "fast" },
    ],
  })
  function CatalogProbe({ onOpenSession }: EmptyStateProps) {
    return <button type="button" onClick={() => onOpenSession?.("conv_b")}>查看来源会话</button>
  }

  window.history.replaceState(window.history.state, "", "/app/library")
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={CatalogProbe}
          standaloneSurface
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "查看来源会话" }))
  await waitFor(() => {
    expect(window.location.pathname).toBe("/app")
    expect(window.location.search).toBe("?conversation=conv_b")
    expect(engine.getSnapshot().store?.activeId).toBe("conv_b")
  })
})

it("直接会话切换时清理上一个会话的创建意图和草稿", async () => {
  buildEngine({
    activeId: "conv_a",
    conversations: [
      { id: "conv_a", title: "第一个会话", updatedAt: 2, mode: "fast" },
      { id: "conv_b", title: "第二个会话", updatedAt: 1, mode: "fast" },
    ],
  })
  function CreationIntentConversationProbe({ creationIntent, draft, onPrompt, onOpenSession }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="switch-creation-intent">{creationIntent ?? "none"}</output>
        <output data-testid="switch-draft">{draft}</output>
        <button type="button" onClick={() => onPrompt("建立一个网站", "website")}>选择网站</button>
        <button type="button" onClick={() => onOpenSession?.("conv_b")}>切换到第二个会话</button>
      </div>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" emptyState={CreationIntentConversationProbe} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(await screen.findByRole("button", { name: "选择网站" }))
  await waitFor(() => {
    expect(screen.getByTestId("switch-creation-intent")).toHaveTextContent("website")
    expect(screen.getByTestId("switch-draft")).toHaveTextContent("建立一个网站")
  })

  fireEvent.click(screen.getByRole("button", { name: "切换到第二个会话" }))
  await waitFor(() => {
    expect(screen.getByTestId("switch-creation-intent")).toHaveTextContent("none")
    expect(screen.getByTestId("switch-draft")).toHaveTextContent("")
    expect(window.location.search).toBe("?conversation=conv_b")
  })
  expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBeNull()
})

it("关闭创建胶囊时保留 URL 与草稿并把焦点交回 Composer", async () => {
  buildEngine()
  function CreationIntentDismissProbe({ creationIntent, draft, onPrompt }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="dismiss-creation-intent">{creationIntent ?? "none"}</output>
        <output data-testid="dismiss-draft">{draft}</output>
        <button type="button" onClick={() => onPrompt("建立一个网站", "website")}>选择网站</button>
      </div>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" emptyState={CreationIntentDismissProbe} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(await screen.findByRole("button", { name: "选择网站" }))
  await waitFor(() => {
    expect(screen.getByTestId("dismiss-creation-intent")).toHaveTextContent("website")
    expect(screen.getByTestId("dismiss-draft")).toHaveTextContent("建立一个网站")
    expect(screen.getByRole("button", { name: "关闭网站创作模式", hidden: true })).toBeInTheDocument()
  })

  const initialUrl = window.location.href
  fireEvent.click(screen.getByRole("button", { name: "关闭网站创作模式", hidden: true }))
  await waitFor(() => {
    expect(screen.getByTestId("dismiss-creation-intent")).toHaveTextContent("none")
    expect(screen.getByTestId("dismiss-draft")).toHaveTextContent("建立一个网站")
    expect(window.location.href).toBe(initialUrl)
    expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveFocus()
  })
  expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBeNull()
})

it("桌面关闭网站 creation-intent capsule 后保留多行草稿高度、焦点与内容", async () => {
  buildEngine()
  const previousWidth = window.innerWidth
  const textareaPrototype = HTMLTextAreaElement.prototype
  const originalScrollHeight = Object.getOwnPropertyDescriptor(textareaPrototype, "scrollHeight")
  const multilineDraft = "第一行\n第二行\n第三行"

  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 })
  Object.defineProperty(textareaPrototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return this.value.includes("\n") ? 144 : 64
    },
  })

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <KokoroAppSurface engine={engine} />
        </LocaleProvider>
      </ThemeProvider>,
    )

    fireEvent.click(await screen.findByRole("button", { name: /建立网站/ }))
    const textarea = screen.getByRole("textbox", { name: "对话输入" })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "关闭网站创作模式", hidden: true })).toBeInTheDocument()
    })

    fireEvent.change(textarea, { target: { value: multilineDraft } })
    await waitFor(() => {
      expect(textarea).toHaveValue(multilineDraft)
      expect(textarea).toHaveStyle({ height: "144px" })
    })

    fireEvent.click(screen.getByRole("button", { name: "关闭网站创作模式", hidden: true }))
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "关闭网站创作模式" })).toBeNull()
      expect(textarea).toHaveValue(multilineDraft)
      expect(textarea).toHaveStyle({ height: "144px" })
      expect(textarea).toHaveFocus()
    })
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth })
    if (originalScrollHeight) {
      Object.defineProperty(textareaPrototype, "scrollHeight", originalScrollHeight)
    } else {
      Reflect.deleteProperty(textareaPrototype, "scrollHeight")
    }
  }
})

it("直接会话通过浏览器历史切换时也清理创建意图", async () => {
  buildEngine({
    activeId: "conv_a",
    conversations: [
      { id: "conv_a", title: "第一个会话", updatedAt: 2, mode: "fast" },
      { id: "conv_b", title: "第二个会话", updatedAt: 1, mode: "fast" },
    ],
  })
  function HistoryIntentProbe({ creationIntent, onPrompt }: EmptyStateProps) {
    return (
      <>
        <output data-testid="history-creation-intent">{creationIntent ?? "none"}</output>
        <button type="button" onClick={() => onPrompt("建立一个应用", "app")}>选择应用</button>
      </>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" emptyState={HistoryIntentProbe} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(await screen.findByRole("button", { name: "选择应用" }))
  await waitFor(() => expect(screen.getByTestId("history-creation-intent")).toHaveTextContent("app"))

  act(() => {
    window.history.pushState(window.history.state, "", "/app?conversation=conv_b")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  await waitFor(() => {
    expect(screen.getByTestId("history-creation-intent")).toHaveTextContent("none")
    expect(engine.getSnapshot().store?.activeId).toBe("conv_b")
  })
  expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBeNull()
})

it("带 conversation 参数进入时优先恢复指定会话", async () => {
  window.history.replaceState(window.history.state, "", "/app?conversation=conv_b")
  buildEngine({
    activeId: "conv_a",
    conversations: [{ id: "conv_a", title: "第一个会话", updatedAt: 1, mode: "fast" }],
  })

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(engine.getSnapshot().store?.activeId).toBe("conv_b"))
  expect(window.location.search).toBe("?conversation=conv_b")
})

it.each(["/app#conversation=conv_b", "/app#/conversation/conv_b"])("conversation hash 深链 %s 同样恢复指定会话", async (href) => {
  window.history.replaceState(window.history.state, "", href)
  buildEngine({
    activeId: "conv_a",
    conversations: [{ id: "conv_a", title: "第一个会话", updatedAt: 1, mode: "fast" }],
  })

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(engine.getSnapshot().store?.activeId).toBe("conv_b"))
  expect(window.location.hash).toBe(new URL(href, window.location.origin).hash)
})

it("挂载壳跨 direct/project 路由时重新应用 conversation 深链", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(engine.getSnapshot().store).toBeNull())
  window.history.replaceState(window.history.state, "", "/app/project/kokoro?conversation=project_task")
  mockedPathname.value = "/app/project/kokoro"
  act(() => window.dispatchEvent(new CustomEvent("kokoro:surface-navigation")))

  await waitFor(() => expect(engine.getSnapshot().store?.activeId).toBe("project_task"))
})

it("进入无 conversation 的项目 overview 时不承接 direct 线程", async () => {
  buildEngine()
  const { rerender } = render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "direct thread" } })
  fireEvent.click(screen.getByLabelText("发送消息"))
  await act(settle)
  await act(async () => {
    client.lastStream().emit([
      makeEvent("message.completed", { segment_id: "seg_direct", content: "direct answer" }),
      makeEvent("run.completed", { status: "completed" }),
    ])
    await settle()
  })
  await waitFor(() => expect(document.querySelector('[data-slot="conversation-timeline"]')).toBeInTheDocument())

  window.history.replaceState(window.history.state, "", "/app/project/kokoro")
  function ProjectOverviewProbe({ composer }: EmptyStateProps) {
    return <div data-testid="project-overview-probe">{composer}</div>
  }
  rerender(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          projectWorkspace
          projectRef="kokoro"
          emptyState={ProjectOverviewProbe}
          emptyStateOwnsComposer
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(screen.getByTestId("project-overview-probe")).toBeInTheDocument())
  expect(document.querySelector('[data-slot="conversation-timeline"]')).toBeNull()
})

it("快捷任务的更多菜单关闭后把焦点交回 Composer", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const more = await screen.findByRole("button", { name: "更多" })
  fireEvent.pointerDown(more, { button: 0, ctrlKey: false })
  fireEvent.pointerUp(more, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole("menuitem", { name: "写一篇文章" }))

  await waitFor(() => {
    const composer = screen.getByRole("textbox", { name: "对话输入" })
    expect(composer).toHaveFocus()
    expect(composer).toHaveValue("帮我写一篇关于「主题」的文章，风格专业、结构清晰。")
  })
})

it("User Web 在窄桌面分屏中自动隐藏 Rail，保留全宽工作区与菜单入口", async () => {
  buildEngine()
  const previousWidth = window.innerWidth
  const originalMatchMedia = window.matchMedia
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 })
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("max-width: 768px") && query.includes("pointer: fine"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  function DesktopProbe({ composer }: EmptyStateProps) {
    return <div data-testid="desktop-probe">{composer}</div>
  }

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame
            engine={engine}
            chatHref="/app"
            brandName="Kokoro"
            emptyState={DesktopProbe}
            emptyStateOwnsComposer
          />
        </LocaleProvider>
      </ThemeProvider>,
    )

    let navigationTrigger: HTMLElement
    await waitFor(() => {
      expect(screen.getByTestId("desktop-probe").querySelector('[data-slot="composer"]')).toBeInTheDocument()
      const separator = document.querySelector<HTMLElement>('[role="separator"][aria-label="调整侧栏宽度"]')
      expect(separator).toBeNull()
      expect(document.querySelector('[data-slot="sidebar-gap"]')).toBeInTheDocument()
      expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toHaveAttribute("data-rail-hidden", "true")
      navigationTrigger = screen.getByRole("button", { name: /展开侧栏|Expand chat navigation/ })
      expect(navigationTrigger).toHaveAttribute("data-web-navigation-trigger", "true")
      expect(navigationTrigger).toBeInTheDocument()
    })

    fireEvent.click(navigationTrigger!)
    await waitFor(() => {
      expect(document.querySelector('[data-web-navigation-trigger="true"][aria-label="收起侧栏"], [data-web-navigation-trigger="true"][aria-label="Collapse chat navigation"]')).not.toBeNull()
      const separator = document.querySelector<HTMLElement>('[role="separator"][aria-label="调整侧栏宽度"]')
      expect(separator).not.toBeNull()
      expect(separator).not.toHaveAttribute("aria-hidden")
      expect(screen.getByRole("button", { name: /收起侧栏|Collapse chat navigation/ })).toHaveFocus()
    })
  } finally {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth })
  }
})

it("窄桌面自动隐藏侧栏，展开后恢复完整 Rail 与可调整分隔条", async () => {
  buildEngine()
  const originalMatchMedia = window.matchMedia
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("max-width: 768px") && query.includes("pointer: fine"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame engine={engine} chatHref="/app" />
        </LocaleProvider>
      </ThemeProvider>,
    )

    const expand = await waitFor(() => {
      const target = document.querySelector<HTMLButtonElement>('[data-web-navigation-trigger="true"][aria-label="展开侧栏"], [data-web-navigation-trigger="true"][aria-label="Expand chat navigation"]')
      expect(target).not.toBeNull()
      return target as HTMLButtonElement
    })
    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toHaveAttribute("data-rail-hidden", "true")
    expect(document.querySelector('[role="separator"][aria-label="调整侧栏宽度"]')).toBeNull()

    fireEvent.click(expand)

    await waitFor(() => {
      expect(document.querySelector('[data-web-navigation-trigger="true"][aria-label="收起侧栏"], [data-web-navigation-trigger="true"][aria-label="Collapse chat navigation"]')).not.toBeNull()
      const separator = document.querySelector<HTMLElement>('[role="separator"][aria-label="调整侧栏宽度"]')
      expect(separator).not.toBeNull()
      expect(separator).toHaveAttribute("tabindex", "0")
    })
  } finally {
    window.matchMedia = originalMatchMedia
  }
})

it("窄桌面手动展开不会跨越宽屏后残留，再次缩窄会自动收起", async () => {
  buildEngine()
  const originalMatchMedia = window.matchMedia
  let compact = false
  const listeners = new Set<() => void>()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("max-width: 768px") && query.includes("pointer: fine") ? compact : false,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame engine={engine} chatHref="/app" />
        </LocaleProvider>
      </ThemeProvider>,
    )

    expect(await screen.findByRole("button", { name: /收起侧栏|Collapse chat navigation/ })).toBeInTheDocument()

    compact = true
    listeners.forEach((listener) => listener())
    const expand = await waitFor(() => {
      const target = document.querySelector<HTMLButtonElement>('[data-web-navigation-trigger="true"][aria-label="展开侧栏"], [data-web-navigation-trigger="true"][aria-label="Expand chat navigation"]')
      expect(target).not.toBeNull()
      return target as HTMLButtonElement
    })
    fireEvent.click(expand)
    await waitFor(() => expect(document.querySelector('[data-web-navigation-trigger="true"][aria-label="收起侧栏"], [data-web-navigation-trigger="true"][aria-label="Collapse chat navigation"]')).not.toBeNull())

    compact = false
    listeners.forEach((listener) => listener())
    await waitFor(() => expect(screen.getByRole("button", { name: /收起侧栏|Collapse chat navigation/ })).toBeInTheDocument())

    compact = true
    listeners.forEach((listener) => listener())
    await waitFor(() => expect(document.querySelector('[data-web-navigation-trigger="true"][aria-label="展开侧栏"], [data-web-navigation-trigger="true"][aria-label="Expand chat navigation"]')).not.toBeNull())
  } finally {
    window.matchMedia = originalMatchMedia
  }
})

it("live manifest 未声明的工作区能力不会传给 site surface", async () => {
  buildEngine()
  function CapabilityProbe({ workspaceCapabilities }: EmptyStateProps) {
    return <output data-testid="workspace-capabilities">{JSON.stringify(workspaceCapabilities)}</output>
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={CapabilityProbe}
          featureFlags={[{ key: "workspace.instructions", enabled: true }]}
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId("workspace-capabilities")).toHaveTextContent(
      JSON.stringify({ instructions: true, connectors: false, resources: false, skills: false, projectConversations: false }),
    )
  })
})

it("待创建网站模式在刷新挂载后恢复，并由新建任务清除", async () => {
  buildEngine()
  window.sessionStorage.setItem("kokoro.web.pending-creation-intent", "website")

  function CreationIntentProbe({ creationIntent }: EmptyStateProps) {
    return <output data-testid="creation-intent">{creationIntent ?? "none"}</output>
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" emptyState={CreationIntentProbe} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(screen.getByTestId("creation-intent")).toHaveTextContent("website"))
  fireEvent.click(screen.getByRole("button", { name: "新建任务" }))
  await waitFor(() => expect(screen.getByTestId("creation-intent")).toHaveTextContent("none"))
  expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBeNull()
})

it("首页待创建意图不会泄漏到专案工作区", async () => {
  buildEngine()
  window.sessionStorage.setItem("kokoro.web.pending-creation-intent", "website")

  function ProjectIntentProbe({ creationIntent, composer }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="project-creation-intent">{creationIntent ?? "none"}</output>
        {composer}
      </div>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={ProjectIntentProbe}
          emptyStateOwnsComposer
          projectWorkspace
          projectRef="kokoro"
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(screen.getByTestId("project-creation-intent")).toHaveTextContent("none"))
  expect(screen.queryByRole("status", { name: "网站" })).toBeNull()
  expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBeNull()
})

it("preview 专案指令按 projectRef 水合并在保存后更新持久 projection", async () => {
  buildEngine()
  window.localStorage.setItem("kokoro.preview.project.kokoro.instructions", "先给出来源。")

  function ProjectInstructionsProbe({ projectInstructions, onSaveProjectInstructions }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="project-instructions">{projectInstructions}</output>
        <button type="button" onClick={() => void onSaveProjectInstructions?.("先给出结论。")}>保存指令</button>
      </div>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={ProjectInstructionsProbe}
          emptyStateOwnsComposer
          preview
          projectWorkspace
          projectRef="kokoro"
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(screen.getByTestId("project-instructions")).toHaveTextContent("先给出来源。"))
  fireEvent.click(screen.getByRole("button", { name: "保存指令" }))
  await waitFor(() => {
    expect(screen.getByTestId("project-instructions")).toHaveTextContent("先给出结论。")
    expect(window.localStorage.getItem("kokoro.preview.project.kokoro.instructions")).toBe("先给出结论。")
  })
})

it("桌面快捷键打开命令菜单后 Escape 把焦点还给原触发控件", async () => {
  buildEngine()
  document.cookie = "sidebar_state=true; path=/"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const trigger = screen.getByRole("button", { name: "收起侧栏" })
  trigger.focus()
  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument())
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }))
  await waitFor(() => expect(trigger).toHaveFocus())
})

it("命令菜单结果列表使用当前 locale 的无障碍名称", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  await waitFor(() => {
    const list = screen.getByRole("listbox")
    expect(list).toHaveAttribute("aria-label", "命令结果")
  })
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }))
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
})

it("桌面设置关闭后焦点回到账户菜单触发按钮", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const settings = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  settings.focus()
  fireEvent.pointerDown(settings, { button: 0 })
  fireEvent.click(settings)
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "账户" })).toBeInTheDocument())
  fireEvent.click(screen.getByRole("menuitem", { name: "账户" }))
  await waitFor(() => expect(screen.getByTestId("settings-modal")).toBeInTheDocument())
  fireEvent.click(screen.getByTestId("settings-close"))
  await waitFor(() => expect(settings).toHaveFocus())
})

it("Composer 资源菜单只展示真实入口且设置关闭后焦点回到原触发器", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const resources = await screen.findByRole("button", { name: "文件和资源" })
  resources.focus()
  fireEvent.pointerDown(resources, { button: 0 })
  fireEvent.click(resources)

  const menu = await screen.findByRole("menu", { name: "文件和资源" })
  expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["文件和资源", "技能"])

  fireEvent.click(within(menu).getByRole("menuitem", { name: "技能" }))
  await waitFor(() => expect(screen.getByTestId("settings-panel-skills")).toBeVisible())
  fireEvent.click(screen.getByTestId("settings-close"))
  await waitFor(() => expect(resources).toHaveFocus())
})

it("命令菜单打开设置时等待旧 Dialog 完成关闭再挂载新 Dialog", async () => {
  try {
    buildEngine()
    render(
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame engine={engine} chatHref="/app" />
        </LocaleProvider>
      </ThemeProvider>,
    )

    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    // Catalog destinations are first-class routes now. Use the preference
    // entry to exercise the command-menu -> Settings handoff without
    // coupling the test to catalog navigation semantics.
    fireEvent.click(screen.getByRole("option", { name: /外观|Appearance/i }))
    expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    })
    await waitFor(() => expect(screen.getByTestId("settings-modal")).toBeInTheDocument())
    fireEvent.click(screen.getByTestId("settings-close"))
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    })
  } finally {
    window.history.replaceState(window.history.state, "", "/")
  }
})

it("命令菜单新建对话后把焦点交给 Composer", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  fireEvent.click(screen.getByRole("option", { name: /新建任务|New task/i }))
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  })
  expect(screen.getByLabelText("对话输入")).toHaveFocus()
})

it("新对话快捷键直接把焦点交给 Composer", () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.keyDown(window, { key: "o", ctrlKey: true, shiftKey: true })
  expect(screen.getByLabelText("对话输入")).toHaveFocus()
})

it("侧栏新对话按钮直接把焦点交给 Composer", () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "新建任务" }))
  expect(screen.getByLabelText("对话输入")).toHaveFocus()
})

it("独立目录页点击新建任务返回直接会话并挂载 Composer", async () => {
  buildEngine()
  mockedPathname.value = "/app/agents"
  window.history.replaceState(window.history.state, "", "/app/agents")

  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  expect(screen.getByTestId("agents-surface")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "新建任务" }))

  await waitFor(() => {
    expect(window.location.pathname).toBe("/app")
    expect(screen.queryByTestId("agents-surface")).toBeNull()
    expect(screen.getByRole("form", { name: "消息编辑区" })).toBeInTheDocument()
  })
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveFocus())
})

it("专案页点击新建任务切换到任务视图并聚焦 Composer", async () => {
  buildEngine()
  function ProjectTaskProbe({ projectTask, composer }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="project-task-state">{projectTask ? "task" : "overview"}</output>
        {composer}
      </div>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={ProjectTaskProbe}
          emptyStateOwnsComposer
          projectWorkspace
          projectRef="kokoro"
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByTestId("rail-new-task"))
  await waitFor(() => {
    expect(screen.getByTestId("project-task-state")).toHaveTextContent("task")
    expect(window.location.search).toMatch(/^\?conversation=conv_/)
  })
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveFocus())
})

it("专案 Composer 首次发送后承接到当前任务视图", async () => {
  buildEngine()
  function ProjectTaskProbe({ projectTask, composer }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="project-task-state">{projectTask ? "task" : "overview"}</output>
        {composer}
      </div>
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          emptyState={ProjectTaskProbe}
          emptyStateOwnsComposer
          projectWorkspace
          projectRef="kokoro"
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "项目任务首条消息" } })
  fireEvent.click(screen.getByLabelText("发送消息"))

  await waitFor(() => expect(window.location.search).toMatch(/^\?conversation=conv_/))
  await waitFor(() => expect(document.querySelector('[data-slot="conversation-timeline"]')).toBeInTheDocument())
  expect(screen.getByText("项目任务首条消息")).toBeInTheDocument()
})

it("命令菜单新建对话后立即打开设置不会被延迟焦点回收打断", async () => {
  try {
    buildEngine()
    render(
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame engine={engine} chatHref="/app" />
        </LocaleProvider>
      </ThemeProvider>,
    )

    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    fireEvent.click(screen.getByRole("option", { name: /新建任务|New task/i }))
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    fireEvent.click(screen.getByRole("option", { name: /外观|Appearance/i }))

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    })
    expect(screen.getByTestId("settings-modal")).toBeInTheDocument()
    expect(screen.getByLabelText("对话输入")).not.toHaveFocus()
  } finally {
    window.history.replaceState(window.history.state, "", "/")
  }
})

it("主路径：发送 → 流式 → HITL 批准 → 完成收束", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )

  // 空首屏保持 Codex 式空白工作区：只保留品牌状态行，不再渲染旧 hero。
  expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0)
  expect(screen.queryByText("今天想做什么？")).not.toBeInTheDocument()
  expect(screen.queryByText(/等你发出首条消息/)).not.toBeInTheDocument()

  // 发送：用户胶囊即时出现（不等回执），输入框清空并进入流式停用。
  fireEvent.change(screen.getByLabelText("对话输入"), {
    target: { value: "帮我写个文件" },
  })
  fireEvent.click(screen.getByLabelText("发送消息"))
  expect(screen.getAllByText("帮我写个文件").length).toBeGreaterThan(0)
  expect(screen.getByLabelText("对话输入")).toHaveValue("")
  expect(screen.getByRole("region", { name: "对话记录" })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveFocus())
  expect(screen.getByRole("log")).toHaveAttribute("data-slot", "message-scroller-content")
  await act(settle)
  expect(client.createCalls).toHaveLength(1)
  // 流式中输入保持可用（运行中插话）；草稿为空时右键位是停止。
  expect(screen.getByLabelText("对话输入")).toBeEnabled()
  expect(screen.getByLabelText("停止生成")).toBeInTheDocument()

  // 流式过程：思考 + 工具待批帧（待批强制展开，批准按钮必须可达）。
  await act(async () => {
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("thinking.delta", { segment_id: "seg_1", delta: "先确认写入范围。" }),
      makeEvent("tool.invoked", {
        segment_id: "seg_1",
        tool_id: "tool_1",
        name: "write_file",
        args: { path: "/tmp/a" },
      }),
      makeEvent("tool.awaiting_approval", awaitingPayload("tool_1", ["tool_1"])),
    ])
    await settle()
  })
  expect(screen.getByText("write_file")).toBeInTheDocument()
  expect(screen.getByText("先确认写入范围。")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "工具调用待批准" })).toBeInTheDocument()
  expect(screen.queryByText("正在整理回答")).not.toBeInTheDocument()

  // HITL：点批准 → 单帧凑齐即发一条带 decision_id 的 run.resume。
  fireEvent.click(screen.getByRole("button", { name: "批准" }))
  expect(
    within(screen.getByRole("group", { name: "工具调用待批准" })).getByRole("status"),
  ).toHaveTextContent("已记录你的决定")
  await act(settle)
  expect(client.controlCalls).toHaveLength(1)
  expect(client.controlCalls[0]?.body).toMatchObject({ kind: "run.resume" })

  // 工具回流 + 正文增量 + 终态：markdown 正文可见，composer 复位可继续输入。
  await act(async () => {
    client.lastStream().emit([
      makeEvent("tool.returned", {
        segment_id: "seg_1",
        tool_id: "tool_1",
        name: "write_file",
        result: "ok",
        is_error: false,
      }),
      makeEvent("message.delta", { segment_id: "seg_2", delta: "文件已" }),
      makeEvent("message.delta", { segment_id: "seg_2", delta: "写好。" }),
      makeEvent("message.completed", { segment_id: "seg_2", content: "文件已写好。" }),
      makeEvent("run.completed", { status: "completed" }),
    ])
    await settle()
  })

  expect(screen.getByText("文件已写好。")).toBeInTheDocument()
  expect(screen.getByLabelText("对话输入")).not.toBeDisabled()
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveFocus())
  expect(screen.getByLabelText("发送消息")).toBeInTheDocument()
  // 直接会话进入侧栏「聊天」列表（标题取首条用户消息）。
  expect(screen.getByLabelText("直接会话")).toBeInTheDocument()
  // 完成态不再常驻旧版 transport 提示，保持 Codex 式干净工作区。
  expect(screen.queryByText(/已准备继续/)).not.toBeInTheDocument()
})

it("刷新场景：带 pending pause 的 snapshot 水合后审批卡直接可操作", async () => {
  buildEngine(addConversation(null, "conv_9", 500))
  client.nextSnapshot = () =>
    Promise.resolve(
      makeSnapshot({
        sessionId: "conv_9",
        title: "恢复的会话",
        messages: [
          {
            message_id: "msg_u",
            role: "user",
            content: "帮我写个文件",
            status: "completed",
            created_at: "2026-07-02T00:00:00Z",
          },
        ],
        activeRun: { run_id: "run_9", status: "waiting_input" },
        pendingPauses: [
          makePendingPause({ run_id: "run_9", tool_id: "tool_1", tool_name: "write_file" }),
        ],
        eventWatermark: 20,
      }),
    )
  // 引擎在构造时水合：重建一次以套用编程后的 snapshot。
  engine.dispose()
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(addConversation(null, "conv_9", 500)),
    now: () => 1_000,
  })
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )
  await act(settle)
  // 线程=事件史全量回放重建（水合后开流从 0）：注入历史事件即重现消息与审批帧。
  await act(async () => {
    client.lastStream().emit([
      makeEvent("message.user", { message_id: "msg_u", content: "帮我写个文件" }, { run_id: "run_9", seq: 1 }),
      makeEvent(
        "tool.awaiting_approval",
        awaitingPayload("tool_1", ["tool_1"], { name: "write_file" }),
        { run_id: "run_9", seq: 2 },
      ),
    ])
  })
  await act(settle)
  expect(screen.getAllByText("帮我写个文件").length).toBeGreaterThan(0)
  expect(screen.getByText("write_file")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "批准" }))
  await act(settle)
  expect(client.controlCalls).toHaveLength(1)
  expect(client.controlCalls[0]).toMatchObject({
    sessionId: "conv_9",
    runId: "run_9",
    body: { kind: "run.resume", decisions: [{ type: "approve", tool_id: "tool_1" }] },
  })
})

it("成果链路：delivery.created → 尾部成果卡 → canvas 打开 → 手动关后可重开", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "交付成果" } })
  fireEvent.click(screen.getByLabelText("发送消息"))
  await act(settle)
  await act(async () => {
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("message.completed", { segment_id: "seg_1", content: "成果已交付。" }),
      makeEvent("delivery.created", {
        path: "out/report.bin",
        title: "调研报告",
        mime: "application/octet-stream",
        size: 4096,
        content_hash: "hash_a",
      }),
      makeEvent("delivery.created", {
        path: "out/appendix.bin",
        title: "附录资料",
        mime: "application/octet-stream",
        size: 2048,
        content_hash: "hash_b",
      }),
      makeEvent("run.completed", { status: "completed" }),
    ])
    await settle()
  })

  // 会话流尾部成果区：图标卡（标题/大小），点击在 canvas 打开。
  expect(screen.getByLabelText("成果")).toBeInTheDocument()
  const reportOpener = screen.getByRole("button", { name: "打开成果 调研报告" })
  const appendixOpener = screen.getByRole("button", { name: "打开成果 附录资料" })
  // Model a real pointer click: the clicked Canvas opener owns focus.  The
  // shell must not later replace it with the last matching action in the DOM.
  reportOpener.focus()
  fireEvent.click(reportOpener)
  const panel = screen.getByLabelText("canvas 详情 调研报告")
  expect(panel).toBeInTheDocument()
  expect(screen.getByRole("separator", { name: "调整工作区宽度" })).toHaveAttribute("aria-valuetext", "480px")
  // 非文本成果给下载态（冻结副本仍可下载，不做内嵌预览）。
  expect(screen.getByText(/暂不支持内嵌预览/)).toBeInTheDocument()
  expect(within(panel).getByRole("button", { name: "下载" })).toBeInTheDocument()
  expect(within(panel).getByRole("button", { name: "全屏" })).toBeInTheDocument()

  // Canvas and Rail must share one live-resize transaction. The shell locks
  // the page interaction policy synchronously, then releases it on pointerup
  // instead of leaving the body in a stale col-resize state.
  const canvasSeparator = screen.getByRole("separator", { name: "调整工作区宽度" })
  const shell = canvasSeparator.closest('[data-slot="sidebar-wrapper"]')
  expect(shell).toBeTruthy()
  fireEvent.pointerDown(canvasSeparator, { pointerId: 2 })
  expect(shell).toHaveAttribute("data-canvas-resizing", "true")
  expect(shell).toHaveAttribute("data-resizing", "true")
  expect(document.body.style.cursor).toBe("col-resize")
  expect(document.body.style.userSelect).toBe("none")
  fireEvent.pointerUp(window, { pointerId: 2 })
  expect(shell).not.toHaveAttribute("data-canvas-resizing")
  expect(shell).not.toHaveAttribute("data-resizing")
  expect(document.body.style.cursor).toBe("")
  expect(document.body.style.userSelect).toBe("")

  // 全屏一键切换（aria-pressed 表达当前态）。
  fireEvent.click(screen.getByRole("button", { name: "全屏" }))
  expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument()

  // 手动关闭记 closed：面板退场，出现「打开工作区」重开入口；点击即恢复上次内容。
  fireEvent.click(screen.getByLabelText("关闭预览"))
  await waitFor(() => expect(screen.queryByLabelText("canvas 详情 调研报告")).not.toBeInTheDocument())
  await waitFor(() => expect(reportOpener).toHaveFocus())
  expect(appendixOpener).not.toHaveFocus()
  fireEvent.click(screen.getByRole("button", { name: "打开工作区" }))
  expect(screen.getByLabelText("canvas 详情 调研报告")).toBeInTheDocument()
})

it("工具 pill 点击升级为 canvas 详情：参数与结果在面板呈现", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "跑个工具" } })
  fireEvent.click(screen.getByLabelText("发送消息"))
  await act(settle)
  await act(async () => {
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("tool.invoked", {
        segment_id: "seg_1",
        tool_id: "tool_1",
        name: "write_file",
        args: { file_path: "/tmp/a.md" },
      }),
      makeEvent("tool.returned", {
        segment_id: "seg_1",
        tool_id: "tool_1",
        name: "write_file",
        result: "wrote 42 bytes",
        is_error: false,
      }),
      makeEvent("run.completed", { status: "completed" }),
    ])
    await settle()
  })

  // 已升级到 Canvas 的工具 pill 是 action，不是 disclosure：真实动作发生前后
  // 都不应暴露一个永远为 false 的 aria-expanded。
  const openToolButton = screen.getByRole("button", { name: "在工作区打开 write_file" })
  expect(openToolButton).not.toHaveAttribute("aria-expanded")
  fireEvent.click(openToolButton)
  const panel = screen.getByLabelText("canvas 详情 write_file")
  expect(panel).toBeInTheDocument()
  expect(within(panel).getByText("参数")).toBeInTheDocument()
  expect(within(panel).getByText("结果")).toBeInTheDocument()
  expect(within(panel).getByText("wrote 42 bytes")).toBeInTheDocument()
})

it("ask_user 待批帧渲染问答卡：问题=description、choices 可选、提交即 respond", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "选个方案" } })
  fireEvent.click(screen.getByLabelText("发送消息"))
  await act(settle)
  await act(async () => {
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent(
        "tool.awaiting_approval",
        awaitingPayload("tool_1", ["tool_1"], {
          name: "ask_user_question",
          kind: "ask_user_question",
          description: "选择要导入的 skill",
          allowed_decisions: ["respond"],
          args: { question: "选择要导入的 skill", choices: [" skill-a ", "skill-a", "", "skill-b"] },
        }),
      ),
    ])
    await settle()
  })

  // 问答卡：问题、choices、取消 run 入口；不渲染批准/拒绝按钮组。
  expect(screen.getByText("选择要导入的 skill")).toBeInTheDocument()
  expect(screen.getAllByRole("radio")).toHaveLength(2)
  expect(screen.queryByRole("button", { name: "批准" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "不回答，停止本轮" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "取消等待" })).toBeInTheDocument()

  fireEvent.click(screen.getByRole("radio", { name: "skill-a" }))
  fireEvent.click(screen.getByRole("button", { name: "发送回复" }))
  await act(settle)
  expect(client.controlCalls).toHaveLength(1)
  expect(client.controlCalls[0]?.body).toMatchObject({
    kind: "run.resume",
    decisions: [{ type: "respond", tool_id: "tool_1", response: "skill-a" }],
  })
})

it("result_review 待批帧渲染审核卡：结果只读、三动作齐备、空替换禁用、采纳即 approve", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" />
      </LocaleProvider>
    </ThemeProvider>,
  )
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "写个文件" } })
  fireEvent.click(screen.getByLabelText("发送消息"))
  await act(settle)
  await act(async () => {
    client.lastStream().emit([
      makeEvent("run.created", { run_id: "run_1" }),
      makeEvent("tool.invoked", {
        segment_id: "seg_1",
        tool_id: "tool_1",
        name: "write_file",
        args: { path: "/tmp/a" },
      }),
      makeEvent(
        "tool.awaiting_approval",
        awaitingPayload("tool_1", ["tool_1"], {
          kind: "result_review",
          description: "审核 write_file 的执行结果",
          allowed_decisions: ["approve", "respond", "reject"],
          result: "wrote 42 bytes to /tmp/a",
        }),
      ),
    ])
    await settle()
  })

  // 审核卡：工具名 + 待审结果只读区 + 三动作；不出现审批卡的「批准」。
  expect(screen.getByText("write_file")).toBeInTheDocument()
  expect(screen.getByText("wrote 42 bytes to /tmp/a")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "批准" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "采纳" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument()

  // 替换：空文本禁用，输入后可点。
  const replaceButton = screen.getByRole("button", { name: "替换" })
  expect(replaceButton).toBeDisabled()
  fireEvent.change(screen.getByLabelText("替换结果"), { target: { value: "人工替换结果" } })
  expect(replaceButton).not.toBeDisabled()

  // 点采纳 → 单帧凑齐即发 run.resume，决策为 approve。
  fireEvent.click(screen.getByRole("button", { name: "采纳" }))
  await act(settle)
  expect(client.controlCalls).toHaveLength(1)
  expect(client.controlCalls[0]?.body).toMatchObject({
    kind: "run.resume",
    decisions: [{ type: "approve", tool_id: "tool_1" }],
  })
})
