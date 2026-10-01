// 壳层主路径冒烟：发送 → 流式过程 → HITL 批准 → 终态收束；刷新水合后审批卡直接可操作。
// （行为规格在 core/engine 层。）

import { readFileSync } from "node:fs"
import { act } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mockedPathname = vi.hoisted(() => ({ value: "/app" }))

it("对话列按 Composer 合成 gutter 在全部宽度保持同一 48rem 阅读轴", () => {
  const css = readFileSync(`${process.cwd()}/src/components/blocks/app-frame/app-frame-main.module.css`, "utf8")
  expect(css).not.toContain("width: min(46rem, 100%);")
  expect(css).toMatch(/@media \(min-width: 961px\)\s*\{\s*\.main\[data-desktop-web="true"\]\[data-web-view="thread"\] :global\(\[data-slot="message-scroller-viewport"\]\)\s*\{[^}]*padding-inline: 3rem;/)
  expect(css).toMatch(/@media \(min-width: 961px\)[\s\S]*?\.main\[data-desktop-web="true"\]\[data-web-view="thread"\] > \[data-slot="composer"\] > \[data-slot="composer-wrap"\]\s*\{[^}]*padding-inline: 1\.5rem;/)
  expect(css).toMatch(/@media \(min-width: 641px\) and \(max-width: 960px\)\s*\{\s*\.main\[data-desktop-web="true"\]\[data-web-view="thread"\] :global\(\[data-slot="message-scroller-viewport"\]\)\s*\{[^}]*padding-inline: 1rem;/)
  expect(css).toMatch(/@media \(max-width: 640px\)\s*\{\s*\.main\[data-desktop-web="true"\]\[data-web-view="thread"\] :global\(\[data-slot="message-scroller-viewport"\]\)\s*\{[^}]*padding-inline: 0\.125rem;/)
  expect(css).toMatch(/@media \(max-width: 960px\)[\s\S]*?\.main\[data-desktop-web="true"\]\[data-web-view="thread"\] > \[data-slot="composer"\] > div > form\[aria-label\]\s*\{[^}]*width: min\(48rem, 100%\);/)
})

it("窄屏 active Composer 复用本体紧凑内边距而不覆盖成额外顶部留白", () => {
  const css = readFileSync(`${process.cwd()}/src/components/blocks/app-frame/app-frame-main.module.css`, "utf8")
  const rule = css.match(
    /@media \(max-width: 960px\)[\s\S]*?\.main\[data-desktop-web="true"\]\[data-web-view="thread"\] > \[data-slot="composer"\] > div > form\[aria-label\]\s*\{([^}]*)\}/,
  )?.[1]
  expect(rule).toMatch(/padding:\s*0\.7rem 0\.85rem 0\.6rem;/)
  expect(rule).not.toMatch(/padding:\s*1\.7rem 0\.85rem 0\.3rem;/)
})

it("viewport 独占顶部呼吸且所有会话项保持统一轮间距", () => {
  const appFrameCss = readFileSync(`${process.cwd()}/src/components/blocks/app-frame/app-frame-main.module.css`, "utf8")
  const threadCss = readFileSync(`${process.cwd()}/src/ui/thread/thread.module.css`, "utf8")

  expect(appFrameCss).toMatch(/\[data-slot="message-scroller-viewport"\]\)\s*\{[^}]*padding-top: 0\.25rem;/)
  expect(appFrameCss).toMatch(/\[data-slot="message-scroller-content"\]\)\s*\{[^}]*gap: 1\.75rem;/)
  expect(appFrameCss).not.toMatch(/\[data-slot="message-scroller-item"\]:first-child\)\s*\{/)
  expect(threadCss).not.toContain('[data-message-id$=":user"]')
  expect(threadCss).not.toMatch(/\[data-message-id\$=":user"\][^{]*\{[^}]*(?:margin-top:\s*2\.75rem|margin-bottom:\s*-2\.75rem|transform:\s*translateY\(0\.5rem\))/)
})

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
import { AppFrame, COMPACT_DESKTOP_RAIL_BREAKPOINT, type EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { KokoroAppSurface } from "@/features/app/kokoro-app-surface"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import type { ScheduledTaskClient } from "@/features/scheduled-tasks"
import { SessionClientError } from "@/engine/client"
import * as pageClients from "@/ui/shell/page-clients"

import {
  awaitingPayload,
  makeDeliveryPayload,
  makeEvent,
  makeFailedSnapshot,
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
  engine?.dispose()
  cleanup()
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

function stubSuccessfulSessionList() {
  const listClient = {
    ...client,
    listSessions: vi.fn().mockResolvedValue({ sessions: [], next_cursor: null }),
  }
  return vi.spyOn(pageClients, "browserListClient").mockReturnValue(listClient)
}

it("旧名称 pin 与 preview 挂载不会污染正式 typed Skill wire", async () => {
  window.localStorage.setItem("kokoro.web.pinned_skills", JSON.stringify(["legacy-name"]))
  buildEngine()
  const view = render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  view.rerender(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" preview={false} />
      </LocaleProvider>
    </ThemeProvider>,
  )
  act(() => engine.submit("formal request"))
  await settle()

  expect(client.createCalls).toHaveLength(1)
  expect(client.createCalls[0]?.body).toMatchObject({ selected_skill_source_refs: [] })
  expect(client.createCalls[0]?.body).not.toHaveProperty("pinned_skills")
  expect(window.localStorage.getItem("kokoro.web.pinned_skills")).toBe(JSON.stringify(["legacy-name"]))
})

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

it("桌面折叠侧栏后焦点交给品牌展开入口", async () => {
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
    const brand = screen.getByRole("button", { name: "展开侧栏" })
    expect(brand).toHaveFocus()
    expect(brand).toHaveAttribute("data-collapsed-brand", "true")
    expect(screen.queryByRole("button", { name: "搜索会话" })).toBeNull()
    expect(screen.queryByRole("button", { name: "展开侧栏" })).not.toHaveAttribute("data-sidebar", "trigger")
    expect(screen.queryByRole("button", { name: "展开侧栏" })).not.toHaveAttribute("data-slot", "sidebar-trigger")
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
    expect(kokoroLinks.find((link) => link.getAttribute("href") === "/app/project/kokoro")).toBeUndefined()
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
    expect(screen.getByRole("navigation", { name: "专案会话" })).toHaveAttribute("data-conversation-list", "project-conversation")
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
    createScheduledTask: vi.fn(),
    updateScheduledTask: vi.fn(),
    retryScheduledTask: vi.fn(),
    deleteScheduledTask: vi.fn(),
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
  expect(screen.getByRole("tab", { name: "个人文件" })).toHaveAttribute("data-state", "active")
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Agent 作品" }), { button: 0, ctrlKey: false })
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

  expect(client.streams).toHaveLength(0)
  expect(screen.getByTestId("catalog-probe")).toBeInTheDocument()
  expect(screen.queryByTestId("conversation-timeline")).toBeNull()
  expect(screen.queryByRole("form", { name: "消息编辑区" })).toBeNull()
})

it("专案入口是受 project_ref 约束的工作区，含专案会话 Composer 与项目上下文", async () => {
  buildEngine()
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input) === "/api/hub/projects"
    ? Response.json({ data: { projects: [{ id: "project_kokoro", name: "Kokoro", slug: "workspace", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }] }, meta: { request_id: "req_workspace" } })
    : Response.json({}, { status: 503 }))
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame
          engine={engine}
          chatHref="/app"
          projectWorkspace
          projectRef="project_kokoro"
          projectReadBoundary={{ admitted: true, subject: "workspace-reader", generation: 1 }}
          emptyState={KokoroProjectWorkspace}
          emptyStateOwnsComposer
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => {
    expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/app")
    expect(screen.getByRole("navigation", { name: "专案会话" })).toHaveAttribute("data-conversation-list", "project-conversation")
    expect(screen.getByRole("form", { name: "消息编辑区" })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument()
    expect(screen.getByText("文件和资源")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Kokoro 工作区" })).toHaveTextContent("Kokoro 1.6")
    expect(screen.getByRole("heading", { name: "Kokoro" })).toBeInTheDocument()
  })
})

it("A→B 专案切换会清除 A 的失败上传意图与重试身份", async () => {
  buildEngine()
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "resource_scan_pending" } }), { status: 503 }))
  vi.stubGlobal("fetch", fetchMock)
  const capabilities = { instructions: true, connectors: true, resources: true, skills: true, projectConversations: true }
  const renderProject = (projectRef: string) => <ThemeProvider><LocaleProvider><AppFrame
    engine={engine} chatHref="/app" preview projectWorkspace projectRef={projectRef}
    emptyState={KokoroProjectWorkspace} emptyStateOwnsComposer workspaceCapabilities={capabilities}
  /></LocaleProvider></ThemeProvider>
  try {
    const view = render(renderProject("project-a"))
    const resourceCard = document.querySelector('[data-context-kind="resources-skills"]') as HTMLElement
    fireEvent.click(within(resourceCard).getAllByRole("button", { name: /文件和资源/ })[0]!)
    const first = new File(["a"], "project-a.txt", { type: "text/plain" })
    fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [first] } })
    await waitFor(() => expect(screen.getByRole("button", { name: "重试上传 project-a.txt" })).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    view.rerender(renderProject("project-b"))
    await waitFor(() => expect(screen.queryByRole("button", { name: "重试上传 project-a.txt" })).not.toBeInTheDocument())
    expect(screen.queryByText("project-a.txt")).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
  }
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

  fireEvent.click(screen.getByTestId("rail-new-conversation"))
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

it("项目 conversation 深链水合期间保留可见加载面，不误画空白新任务", async () => {
  window.history.replaceState(window.history.state, "", "/app/project/kokoro?conversation=project_pending")
  mockedPathname.value = "/app/project/kokoro"
  buildEngine()

  let resolveSnapshot: ((snapshot: ReturnType<typeof makeSnapshot> | null) => void) | undefined
  client.nextSnapshot = () => new Promise((resolve) => {
    resolveSnapshot = resolve
  })
  const listClientSpy = stubSuccessfulSessionList()

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <KokoroAppSurface engine={engine} desktopRailCollapsed={false} />
        </LocaleProvider>
      </ThemeProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("app-frame-loading")).toBeInTheDocument())
    expect(screen.queryByTestId("project-conversation-welcome")).toBeNull()
    expect(engine.getSnapshot().hydrating).toBe(true)

    await act(async () => {
      resolveSnapshot?.(null)
      await settle()
    })

    await waitFor(() => expect(document.querySelector('[data-slot="project-conversation-welcome"]')).toBeInTheDocument())
    expect(engine.getSnapshot().hydrating).toBe(false)
  } finally {
    listClientSpy.mockRestore()
  }
})

it("项目 conversation 深链被拒后回退到 overview，不永久停在 loading 面", async () => {
  window.history.replaceState(window.history.state, "", "/app/project/kokoro?conversation=stale_project_task")
  mockedPathname.value = "/app/project/kokoro"
  buildEngine()
  client.nextSnapshot = (sessionId) => sessionId === "stale_project_task"
    ? Promise.reject(new SessionClientError("http", "session_forbidden"))
    : Promise.resolve(null)

  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} desktopRailCollapsed={false} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument())
  expect(window.location.pathname).toBe("/app/project/kokoro")
  expect(window.location.search).toBe("")
  expect(screen.queryByTestId("app-frame-loading")).toBeNull()
})

it.each([
  {
    label: "project snapshot 500",
    pathname: "/app/project/kokoro?conversation=project_snapshot_failed",
    routePathname: "/app/project/kokoro",
    project: true,
    reason: "http" as const,
    detail: "snapshot_failed",
    emptyTestId: "project-conversation-welcome",
  },
  {
    label: "direct snapshot network error",
    pathname: "/app?conversation=direct_snapshot_failed",
    routePathname: "/app",
    project: false,
    reason: "network" as const,
    detail: "network_down",
    emptyTestId: "direct-chat-welcome",
  },
])("$label 进入可操作错误终态，重试后恢复原深链语义", async ({ pathname, routePathname, project, reason, detail, emptyTestId }) => {
  window.history.replaceState(window.history.state, "", pathname)
  mockedPathname.value = routePathname
  buildEngine()
  let attempts = 0
  client.nextSnapshot = (sessionId) => {
    attempts += 1
    if (attempts === 1 && sessionId.endsWith("snapshot_failed")) {
      return Promise.reject(new SessionClientError(reason, detail))
    }
    return Promise.resolve(null)
  }
  const listClientSpy = stubSuccessfulSessionList()

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <KokoroAppSurface engine={engine} desktopRailCollapsed={false} />
        </LocaleProvider>
      </ThemeProvider>,
    )

    const conversationError = await waitFor(() => {
      const surface = screen.getByTestId("app-frame-conversation-error")
      expect(surface).toBeInTheDocument()
      return surface
    })
    // 当前会话 snapshot 错误独立于成功的会话清单，重试必须仍绑定原深链。
    expect(conversationError).toHaveTextContent("会话列表加载失败")
    expect(within(conversationError).getByRole("button", { name: "重试" })).toBeEnabled()
    expect(screen.queryByTestId("project-conversation-welcome")).toBeNull()

    fireEvent.click(within(conversationError).getByRole("button", { name: "重试" }))

    await waitFor(() => expect(client.snapshotCalls.filter((id) => id.endsWith("snapshot_failed"))).toHaveLength(2))
    await waitFor(() => expect(document.querySelector(`[data-slot="${emptyTestId}"]`)).toBeInTheDocument())
    expect(window.location.pathname).toBe(routePathname)
    expect(window.location.search).toBe(project ? "?conversation=project_snapshot_failed" : "?conversation=direct_snapshot_failed")
    expect(screen.queryByTestId("app-frame-conversation-error")).toBeNull()
  } finally {
    listClientSpy.mockRestore()
  }
})

it("direct conversation 深链被拒后清理 conversation URL 并回到新对话", async () => {
  window.history.replaceState(window.history.state, "", "/app?conversation=direct_forbidden")
  mockedPathname.value = "/app"
  buildEngine()
  client.nextSnapshot = (sessionId) => sessionId === "direct_forbidden"
    ? Promise.reject(new SessionClientError("http", "session_forbidden"))
    : Promise.resolve(null)

  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} desktopRailCollapsed={false} />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(document.querySelector('[data-slot="direct-chat-welcome"]')).toBeInTheDocument())
  expect(window.location.pathname).toBe("/app")
  expect(window.location.search).toBe("")
  expect(screen.queryByTestId("app-frame-conversation-error")).toBeNull()
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
  expect(window.location.pathname).toBe("/app/project/kokoro")
  expect(window.location.search).toBe("")
  expect(document.querySelector('[data-slot="conversation-timeline"]')).toBeNull()
})

it("Direct Chat 承接到项目后保留草稿，并在新会话入口进入项目 Chat", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "交给 Kokoro 项目继续处理" } })
  // The direct home starts with the compact desktop rail. Open the project
  // picker first, just as a user does, instead of reaching into its hidden
  // expanded-only link.
  const projectPicker = screen.getByTestId("rail-project")
  fireEvent.pointerDown(projectPicker, { button: 0 })
  fireEvent.pointerUp(projectPicker, { button: 0 })
  fireEvent.click(projectPicker)
  const projectLink = await screen.findByRole("menuitem", { name: "新建专案" })
  fireEvent.click(projectLink)

  await waitFor(() => {
    expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument()
    expect(screen.getByLabelText("对话输入")).toHaveValue("交给 Kokoro 项目继续处理")
  })
  await waitFor(() => expect(screen.queryByRole("menuitem", { name: "新建专案" })).toBeNull())

  fireEvent.click(screen.getByTestId("rail-new-conversation"))
  await waitFor(() => expect(window.location.search).toMatch(/^\?conversation=conv_/))
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "项目首条消息" } })
  fireEvent.click(screen.getByLabelText("发送消息"))

  await waitFor(() => expect(document.querySelector('[data-slot="conversation-timeline"]')).toBeInTheDocument())
  expect(screen.getByText("项目首条消息")).toBeInTheDocument()
})

it("项目跳转时显式草稿覆盖遗留的 pending 胶囊文案", async () => {
  buildEngine()
  // 模拟前一次 Website 创建模式留下的 route-neutral 草稿；本次用户输入
  // 是跳转时的权威值，不应被旧的 placeholder-like fixture 抢回去。
  window.localStorage.setItem("kokoro.web.drafts", JSON.stringify({ __pending__: "描述你想要建立的网站" }))
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} desktopRailCollapsed={false} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const input = await screen.findByLabelText("对话输入")
  fireEvent.change(input, { target: { value: "本次项目的真实草稿" } })
  const projectTrigger = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(projectTrigger, { button: 0 })
  fireEvent.pointerUp(projectTrigger, { button: 0 })
  fireEvent.click(projectTrigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))

  await waitFor(() => {
    expect(window.location.pathname).toMatch(/^\/app\/project\/preview-project-\d+$/)
    expect(screen.getByLabelText("对话输入")).toHaveValue("本次项目的真实草稿")
  })
})

it("项目侧栏的新建专案菜单会进入新的项目工作区", async () => {
  buildEngine()
  mockedPathname.value = "/app/project/kokoro"
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  const trigger = await screen.findByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  const entry = await screen.findByRole("menuitem", { name: "新建专案" })
  fireEvent.click(entry)

  await waitFor(() => {
    expect(window.location.pathname).toMatch(/^\/app\/project\/preview-project-\d+$/)
    expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument()
  })
  expect(screen.queryByRole("menuitem", { name: "新建专案" })).toBeNull()
})

it("Direct Chat 展开侧栏后新建专案仍承接当前草稿", async () => {
  buildEngine()
  render(
    <ThemeProvider>
      <LocaleProvider>
        <KokoroAppSurface engine={engine} desktopRailCollapsed={false} preview />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.change(await screen.findByLabelText("对话输入"), { target: { value: "从 Chat 承接到新专案" } })
  const trigger = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))

  await waitFor(() => {
    expect(window.location.pathname).toMatch(/^\/app\/project\/preview-project-\d+$/)
    expect(document.querySelector('[data-slot="project-workspace"]')).toBeInTheDocument()
    expect(screen.getByLabelText("对话输入")).toHaveValue("从 Chat 承接到新专案")
  })
})

it("正式新建专案只在 BFF canonical 回执后导航，多击不重复提交，承接点击时草稿", async () => {
  buildEngine()
  let finish!: (response: Response) => void
  const createResponse = new Promise<Response>((resolve) => { finish = resolve })
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/hub/projects" && init?.method === "POST") return createResponse
    return Promise.resolve(new Response(JSON.stringify({ data: {}, meta: { request_id: "req-get" } }), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<ThemeProvider><LocaleProvider><KokoroAppSurface engine={engine} desktopRailCollapsed={false} preview={false} /></LocaleProvider></ThemeProvider>)

  fireEvent.change(await screen.findByLabelText("对话输入"), { target: { value: "A 草稿" } })
  const trigger = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  const entry = await screen.findByRole("menuitem", { name: "新建专案" })
  fireEvent.click(entry)
  expect(window.location.pathname).not.toContain("preview-project")
  expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/hub/projects" && init?.method === "POST")).toHaveLength(1)
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/hub/projects" && init?.method === "POST")).toHaveLength(1)
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "B 草稿" } })

  await act(async () => finish(new Response(JSON.stringify({
    data: { project: { id: "project_canonical-a", slug: "new-project-a", name: "New project A", description: "", created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z" } },
    meta: { request_id: "req-1" },
  }), { status: 200 })))
  await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_canonical-a"))
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveValue("A 草稿"))
  expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/hub/projects" && init?.method === "POST")).toHaveLength(1)
  vi.unstubAllGlobals()
})

it("正式新建未知结果后从 rail 重进仍复用原 key/name/draft，绝不导航假项目", async () => {
  buildEngine()
  let createCount = 0
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url !== "/api/hub/projects" || init?.method !== "POST") {
      return Promise.resolve(new Response(JSON.stringify({ data: {}, meta: { request_id: "req-get" } }), { status: 200 }))
    }
    createCount += 1
    // A malformed 200 has an uncertain commit outcome: retry the same key,
    // never infer a project identity from a partial envelope.
    if (createCount === 1) return Promise.resolve(new Response(JSON.stringify({ data: { project: { slug: "partial" } }, meta: { request_id: "req-uncertain" } }), { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify({
      data: { project: { id: "project_canonical-b", slug: "new-project-b", name: "New project B", description: "", created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z" } },
      meta: { request_id: "req-2" },
    }), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<ThemeProvider><LocaleProvider><KokoroAppSurface engine={engine} desktopRailCollapsed={false} preview={false} /></LocaleProvider></ThemeProvider>)
  fireEvent.change(await screen.findByLabelText("对话输入"), { target: { value: "A 草稿" } })
  const trigger = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))

  expect(await screen.findByTestId("project-create-error")).toHaveTextContent("专案创建失败")
  expect(window.location.pathname).toBe("/")
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "B 草稿" } })
  expect(screen.getByLabelText("对话输入")).toHaveValue("B 草稿")
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_canonical-b"))
  const requests = fetchMock.mock.calls.filter(([url, init]) => url === "/api/hub/projects" && init?.method === "POST") as Array<[string, RequestInit]>
  expect(requests).toHaveLength(2)
  expect(requests[0]?.[1].headers).toEqual(requests[1]?.[1].headers)
  expect(requests[0]?.[1].body).toBe(requests[1]?.[1].body)
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveValue("A 草稿"))
  vi.unstubAllGlobals()
})

it("正式欢迎页新建未知结果后重进仍复用原意图，不把 B 草稿放进 A 项目", async () => {
  buildEngine()
  let createCount = 0
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url !== "/api/hub/projects" || init?.method !== "POST") {
      return Promise.resolve(new Response(JSON.stringify({ data: {}, meta: { request_id: "req-get" } }), { status: 200 }))
    }
    createCount += 1
    if (createCount === 1) return Promise.resolve(new Response(JSON.stringify({ error: { code: "service_unavailable" } }), { status: 503 }))
    return Promise.resolve(new Response(JSON.stringify({
      data: { project: { id: "project_welcome-a", slug: "new-project-welcome-a", name: "New project A", description: "", created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z" } },
      meta: { request_id: "req-2" },
    }), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<ThemeProvider><LocaleProvider><KokoroAppSurface engine={engine} desktopRailCollapsed={false} preview={false} /></LocaleProvider></ThemeProvider>)
  fireEvent.click(await screen.findByRole("button", { name: /建立网站/ }))
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "A 网站草稿" } })
  const trigger = screen.getByRole("button", { name: "新增到专案" })
  fireEvent.pointerDown(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  expect(await screen.findByTestId("project-create-error")).toHaveTextContent("专案创建失败")
  expect(window.location.pathname).toBe("/")
  fireEvent.change(screen.getByLabelText("对话输入"), { target: { value: "B 网站草稿" } })
  expect(screen.getByLabelText("对话输入")).toHaveValue("B 网站草稿")
  fireEvent.pointerDown(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_welcome-a"))
  const requests = fetchMock.mock.calls.filter(([url, init]) => url === "/api/hub/projects" && init?.method === "POST") as Array<[string, RequestInit]>
  expect(requests).toHaveLength(2)
  expect(requests[0]?.[1].headers).toEqual(requests[1]?.[1].headers)
  expect(requests[0]?.[1].body).toBe(requests[1]?.[1].body)
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveValue("A 网站草稿"))
  await act(async () => {
    window.history.pushState(window.history.state, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveValue("B 网站草稿"))
  vi.unstubAllGlobals()
})

it("owner 已创建但导航回调抛错时重试只重新导航，不再 POST", async () => {
  buildEngine()
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/hub/projects" && init?.method === "POST") {
      return Promise.resolve(new Response(JSON.stringify({
        data: { project: { id: "project_created-once", slug: "created-once", name: "New project", description: "", created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z" } },
        meta: { request_id: "req-created" },
      }), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify({ data: {}, meta: { request_id: "req-get" } }), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchMock)
  const onOpenProject = vi.fn()
    .mockImplementationOnce(() => { throw new Error("navigation_interrupted") })
    .mockImplementationOnce((id: string) => {
      window.history.pushState(window.history.state, "", `/app/project/${id}`)
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
  render(<ThemeProvider><LocaleProvider><KokoroAppSurface engine={engine} desktopRailCollapsed={false} preview={false} onOpenProject={onOpenProject} /></LocaleProvider></ThemeProvider>)
  const trigger = await screen.findByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  expect(await screen.findByTestId("project-create-error")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_created-once"))
  expect(onOpenProject).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/hub/projects" && init?.method === "POST")).toHaveLength(1)
  vi.unstubAllGlobals()
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

it("待创建网站模式在刷新挂载后恢复，并由新建会话清除", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "新对话" }))
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
  expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["技能"])

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
  fireEvent.click(screen.getByRole("option", { name: /新对话|New chat/i }))
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

  fireEvent.click(screen.getByRole("button", { name: "新对话" }))
  expect(screen.getByLabelText("对话输入")).toHaveFocus()
})

it("独立目录页点击新建会话返回直接会话并挂载 Composer", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "新对话" }))

  await waitFor(() => {
    expect(window.location.pathname).toBe("/app")
    expect(screen.queryByTestId("agents-surface")).toBeNull()
    expect(screen.getByRole("form", { name: "消息编辑区" })).toBeInTheDocument()
  })
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveFocus())
})

it("专案页点击新建会话切换到会话视图并聚焦 Composer", async () => {
  buildEngine()
  function ProjectConversationProbe({ projectConversation, composer }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="project-conversation-state">{projectConversation ? "conversation" : "overview"}</output>
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
          emptyState={ProjectConversationProbe}
          emptyStateOwnsComposer
          projectWorkspace
          projectRef="kokoro"
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByTestId("rail-new-conversation"))
  await waitFor(() => {
    expect(screen.getByTestId("project-conversation-state")).toHaveTextContent("conversation")
    expect(window.location.search).toMatch(/^\?conversation=conv_/)
  })
  await waitFor(() => expect(screen.getByLabelText("对话输入")).toHaveFocus())
})

it("专案清单不从标题或本地相位伪造 durable run status", async () => {
  buildEngine()
  const listClient = {
    ...client,
    listSessions: vi.fn().mockResolvedValue({
      sessions: [{ session_id: "conv_empty", title: "空白会话", updated_at: "2026-10-01T00:00:00Z" }],
      next_cursor: null,
    }),
  }
  const listSpy = vi.spyOn(pageClients, "browserListClient").mockReturnValue(listClient)
  function ProjectConversationStatusProbe({ projectConversations }: EmptyStateProps) {
    const first = projectConversations?.[0]
    return (
      <output data-testid="project-conversation-status">
        {projectConversations?.length ?? 0}:{first && "status" in first ? "present" : "absent"}
      </output>
    )
  }

  try {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame
            engine={engine}
            chatHref="/app"
            emptyState={ProjectConversationStatusProbe}
            projectWorkspace
            projectRef="kokoro"
          />
        </LocaleProvider>
      </ThemeProvider>,
    )

    await waitFor(() => expect(screen.getByTestId("project-conversation-status")).toHaveTextContent("1:absent"))
  } finally {
    listSpy.mockRestore()
  }
})

it("专案 Composer 首次发送后承接到当前会话视图", async () => {
  buildEngine()
  function ProjectConversationProbe({ projectConversation, composer }: EmptyStateProps) {
    return (
      <div>
        <output data-testid="project-conversation-state">{projectConversation ? "conversation" : "overview"}</output>
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
          emptyState={ProjectConversationProbe}
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
  expect(screen.getAllByText("项目任务首条消息").length).toBeGreaterThanOrEqual(1)
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
    fireEvent.click(screen.getByRole("option", { name: /新对话|New chat/i }))
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

  // HITL：点批准 → 单帧凑齐即发一条带 command identity 的 run.resume。
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
        eventWatermark: "agui_00000000000000000000000000000014",
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
      makeEvent("delivery.created", makeDeliveryPayload({ artifact_id: "artifact_a", title: "调研报告", mime: "application/octet-stream", size: 4096 })),
      makeEvent("delivery.created", makeDeliveryPayload({ artifact_id: "artifact_b", title: "附录资料", mime: "application/octet-stream", size: 2048 })),
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
  // Delivery stays metadata-only; no Blob/iframe inline preview is mounted.
  expect(within(panel).getAllByText(/application\/octet-stream/)).toHaveLength(2)
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


it("Composer 保留 IME 确认与 Shift+Enter，普通 Enter 仅提交一次", async () => {
  buildEngine()
  render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
  const input = await screen.findByRole("textbox", { name: "对话输入" })
  fireEvent.change(input, { target: { value: "输入法候选" } })
  const submit = vi.spyOn(engine, "submit")
  fireEvent.keyDown(input, { key: "Enter", isComposing: true })
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
  expect(submit).not.toHaveBeenCalled()
  expect(input).toHaveValue("输入法候选")
  fireEvent.keyDown(input, { key: "Enter" })
  expect(submit).toHaveBeenCalledExactlyOnceWith("输入法候选")
})

it.each([false, true])("Composer 的 IME 229 确认不消费草稿或意图（projectWorkspace=%s）", async (projectWorkspace) => {
  buildEngine()
  const listClientSpy = stubSuccessfulSessionList()
  const path = projectWorkspace ? "/app/project/project_ime" : "/app"
  window.history.replaceState(window.history.state, "", path)
  window.sessionStorage.setItem("kokoro.web.pending-creation-intent", "website")
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" projectWorkspace={projectWorkspace} {...(projectWorkspace ? { projectRef: "project_ime" } : {})} /></LocaleProvider></ThemeProvider>)
    const input = await screen.findByRole("textbox", { name: "对话输入" })
    // Textarea 会先挂载；意图读取及项目清理各经一次 microtask。
    // 等待上下文真正就绪后再输入，避免把挂载竞态误当成 IME 行为。
    const expectedIntent = projectWorkspace ? null : "website"
    await waitFor(() => {
      expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBe(expectedIntent)
      if (projectWorkspace) {
        expect(screen.queryByTestId("creation-intent-pill")).toBeNull()
      } else {
        expect(screen.getByTestId("creation-intent-pill")).toHaveAttribute("data-intent", "website")
      }
    })
    fireEvent.change(input, { target: { value: "输入法候选" } })
    const submit = vi.spyOn(engine, "submit")
    const previousUrl = window.location.href
    const confirm = new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: false, bubbles: true, cancelable: true })
    expect(confirm.keyCode).toBe(229)
    expect(confirm.isComposing).toBe(false)

    fireEvent(input, confirm)

    expect(submit).not.toHaveBeenCalled()
    expect(client.createCalls).toHaveLength(0)
    expect(confirm.defaultPrevented).toBe(false)
    expect(input).toHaveValue("输入法候选")
    expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBe(expectedIntent)
    expect(window.location.href).toBe(previousUrl)

    fireEvent.keyDown(input, { key: "Enter", keyCode: 13, isComposing: false })
    expect(submit).toHaveBeenCalledExactlyOnceWith("输入法候选")
    expect(client.createCalls).toHaveLength(1)
    await act(settle)
  } finally {
    listClientSpy.mockRestore()
  }
})

it("未获receipt时拒绝第二次提交并保留草稿，不产生额外POST", async () => {
  buildEngine()
  client.nextCreate = () => new Promise(() => {})
  window.history.replaceState(window.history.state, "", "/app/project/project_keep")
  render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" projectWorkspace projectRef="project_keep" /></LocaleProvider></ThemeProvider>)
  const input = await screen.findByRole("textbox", { name: "对话输入" })

  fireEvent.change(input, { target: { value: "first request" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(client.createCalls).toHaveLength(1)
  const acceptedUrl = window.location.href

  fireEvent.change(input, { target: { value: "keep this draft" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(client.createCalls).toHaveLength(1)
  expect(input).toHaveValue("keep this draft")
  expect(input).toHaveFocus()
  expect(window.location.href).toBe(acceptedUrl)

  fireEvent.click(screen.getByRole("button", { name: "发送插话" }))
  expect(client.createCalls).toHaveLength(1)
  expect(input).toHaveValue("keep this draft")
  expect(window.location.href).toBe(acceptedUrl)
})

it("同步拒绝不会清除既有创建意图", async () => {
  buildEngine()
  client.nextCreate = () => new Promise(() => {})
  expect(engine.submit("already submitting")).toBe(true)
  window.sessionStorage.setItem("kokoro.web.pending-creation-intent", "website")

  render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
  const input = await screen.findByRole("textbox", { name: "对话输入" })
  fireEvent.change(input, { target: { value: "keep intent too" } })
  fireEvent.keyDown(input, { key: "Enter" })

  expect(client.createCalls).toHaveLength(1)
  expect(input).toHaveValue("keep intent too")
  expect(window.sessionStorage.getItem("kokoro.web.pending-creation-intent")).toBe("website")
})

it("已获receipt后的stream error显示独立连接恢复且不伪造run failure", async () => {
  buildEngine()
  const listClientSpy = stubSuccessfulSessionList()
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
    const input = screen.getByLabelText("对话输入")
    fireEvent.change(input, { target: { value: "post receipt" } })
    fireEvent.click(screen.getByLabelText("发送消息"))
    await act(settle)

    act(() => client.lastStream().fail(new SessionClientError("network", "stream lost after receipt")))
    await act(settle)

    expect(screen.getByRole("status", { name: "连接暂时中断" })).toBeInTheDocument()
    expect(document.querySelector('[data-message-id="run-error"]')).toBeNull()
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
    const reconnect = screen.getByRole("button", { name: "重新连接" })
    expect(reconnect).toBeEnabled()
    const createCount = client.createCalls.length
    fireEvent.change(input, { target: { value: "keep this offline draft" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(input).toHaveValue("keep this offline draft")
    expect(client.createCalls).toHaveLength(createCount)
    expect(screen.getByLabelText("停止生成")).toBeEnabled()
    client.nextSnapshot = () => Promise.resolve(makeSnapshot({
      sessionId: engine.getSnapshot().store?.activeId ?? "conv_1",
      activeRun: { run_id: "run_1", status: "running" },
    }))
    fireEvent.click(reconnect)
    await act(settle)
    expect(client.createCalls).toHaveLength(createCount)
    act(() => client.lastStream().connected())
    expect(screen.queryByRole("status", { name: "连接暂时中断" })).toBeNull()
  } finally {
    listClientSpy.mockRestore()
  }
})

it("direct restored conversation 的首次 snapshot 错误仍显示整 stage 读取失败", async () => {
  const seeded = addConversation(null, "conv_initial_error", 500)
  client = createFakeClient()
  client.nextSnapshot = () => Promise.reject(new SessionClientError("network", "initial snapshot unavailable"))
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(seeded),
    now: () => 1_000,
  })
  const listClientSpy = stubSuccessfulSessionList()
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
    await act(settle)
    expect(screen.getByTestId("app-frame-conversation-error")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled()
    expect(document.querySelector('[data-message-id="run-error"]')).toBeNull()
  } finally {
    listClientSpy.mockRestore()
  }
})

it("settled 历史会话零空闲 SSE，正文与复制保留且可继续发送", async () => {
  const seeded = addConversation(null, "conv_settled", 500)
  client = createFakeClient()
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({
    sessionId: "conv_settled",
    eventWatermark: "agui_00000000000000000000000000000014",
    messages: [
      { message_id: "user_old", role: "user", content: "old ask", status: "completed", created_at: "2026-07-02T00:00:00Z" },
      { message_id: "assistant_old", role: "assistant", run_id: "run_old", content: "old complete answer", status: "completed", created_at: "2026-07-02T00:00:01Z" },
    ],
  }))
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(seeded),
    now: () => 1_000,
  })
  const listClientSpy = stubSuccessfulSessionList()
  try {
    render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
    await act(settle)

    expect(client.streams).toHaveLength(0)
    expect(screen.getByText("old complete answer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "复制回答" })).toBeEnabled()
    expect(screen.queryByRole("status", { name: "正在重新连接" })).toBeNull()

    const input = screen.getByLabelText("对话输入")
    fireEvent.change(input, { target: { value: "continue after history" } })
    fireEvent.click(screen.getByLabelText("发送消息"))
    await act(settle)

    expect(client.createCalls).toHaveLength(1)
    expect(client.streams).toHaveLength(1)
    expect(input).toHaveValue("")
  } finally {
    listClientSpy.mockRestore()
  }
})

it("历史失败footer与后来成功正文不被429连接错误移动或复制", async () => {
  const seeded = addConversation(null, "conv_1", 500)
  client = createFakeClient()
  const failed = makeFailedSnapshot(null, { content: "old partial" }).messages
  client.nextSnapshot = () => Promise.resolve(makeSnapshot({
    sessionId: "conv_1",
    activeRun: { run_id: "run_active", status: "running" },
    messages: [
      ...(failed ?? []),
      { message_id: "user_2", role: "user", content: "later ask", status: "completed", created_at: "2026-07-02T00:00:02Z" },
      { message_id: "assistant_2", role: "assistant", run_id: "run_new", content: "later complete answer", status: "completed", created_at: "2026-07-02T00:00:03Z" },
    ],
  }))
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(seeded),
    now: () => 1_000,
  })
  const listClientSpy = stubSuccessfulSessionList()
  try {
    const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" /></LocaleProvider></ThemeProvider>)
    await act(settle)
    expect(view.container.querySelectorAll('[data-run-failure="run_failed"]')).toHaveLength(1)
    expect(screen.getByText("later complete answer")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "复制回答" })).toHaveLength(2)

    act(() => client.lastStream().fail(new SessionClientError("http", "status 429")))
    await act(settle)

    expect(view.container.querySelectorAll('[data-run-failure="run_failed"]')).toHaveLength(1)
    expect(view.container.querySelector('[data-message-id="run-error"]')).toBeNull()
    expect(screen.getByText("later complete answer")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "复制回答" })).toHaveLength(2)
    expect(screen.getByRole("status", { name: "连接暂时中断" })).toBeInTheDocument()
  } finally {
    listClientSpy.mockRestore()
  }
})

it("连接恢复条在窄屏保留换行、命中区、forced-colors 与既有focus-visible按钮", () => {
  const css = readFileSync(`${process.cwd()}/src/components/blocks/app-frame/app-frame-status.module.css`, "utf8")
  expect(css).toMatch(/@media \(max-width: 960px\)[\s\S]*?\.connectionStatus\s*\{[^}]*flex-wrap:\s*wrap;/u)
  expect(css).toMatch(/\.connectionStatus button\s*\{[^}]*min-height:\s*2\.75rem;/u)
  expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*?\.connectionStatus\s*\{[^}]*border-color:\s*CanvasText;/u)
})

// Project-read fixtures use spies, so every case restores its browser boundary.
afterEach(() => vi.restoreAllMocks())
