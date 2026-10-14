// 侧栏会话重命名内联编辑（CONV-UX）：双击/✎ 进入编辑，Enter 提交、Escape 取消、空题与未改动不上抛。

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { createSessionClient } from "@/engine/client"
import { createSessionEngine } from "@/engine/machine"
import { createFakeClient, createMemoryStorage } from "../engine/fakes"
import type { ConversationStore } from "@/core/conversations"
import { WorkspaceRailAccount } from "@/components/blocks/workspace-rail/workspace-rail-account"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import railStyles from "@/components/blocks/workspace-rail/workspace-rail.module.css"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { ConversationSummary } from "@/ui/rail/rail-search"
import * as pageClients from "@/ui/shell/page-clients"
import type { ConversationListController } from "@/ui/shell/use-conversation-list"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { act, useState } from "react"

const workspaceRailCss = readFileSync(
  "src/components/blocks/workspace-rail/workspace-rail.module.css",
  "utf8",
)

function renderRail(overrides?: Partial<Parameters<typeof WorkspaceRail>[0]>) {
  const onRenameConversation = vi.fn()
  const onOpenSettings = vi.fn()
  const onOpenNotifications = vi.fn()
  const conversations: ConversationSummary[] = [{ id: "ses_1", title: "旧标题" }]
  const view = render(
    <ThemeProvider>
    <LocaleProvider>
      <WorkspaceRail
        collapsed={false}
        onToggleCollapse={() => {}}
        onNewChat={() => {}}
        chatHref="/app"
        conversations={conversations}
        activeId="ses_1"
        awaitingIds={new Set()}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => true}
        onRenameConversation={onRenameConversation}
        onOpenSettings={onOpenSettings}
        onOpenNotifications={onOpenNotifications}
        listLoading={false}
        listError={false}
        hasMore={false}
        onLoadMore={() => {}}
        {...overrides}
      />
    </LocaleProvider>
    </ThemeProvider>,
  )
  return { ...view, onRenameConversation, onOpenSettings, onOpenNotifications }
}

// Owner-confirmed project folders with the real scoped list parser. Controlled
// `conversations` in a standalone rail now represents the always-present inbox.
function renderProjectFolderRail(overrides: Partial<Parameters<typeof WorkspaceRail>[0]> = {}) {
  const projectRef = "project_a"
  const onNewChat = vi.fn()
  const onFolderNewChat = vi.fn()
  const transient = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const thread = transient.getSnapshot().thread
  transient.dispose()
  const listClient = createSessionClient({ baseUrl: "http://s.local" })
  const fetchMock = stubBusinessFetch(vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    const project = url.searchParams.get("project_ref")
    return Response.json({ sessions: [{ session_id: project === projectRef ? "task_a" : "conv_direct", title: project === projectRef ? "整理需求" : "普通持久会话", updated_at: "2026-10-01T00:00:00.000Z" }], next_cursor: null })
  }))
  // Import binding is the existing browser client; no extra engine is created
  // to read an expanded folder's durable rows.
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(listClient)
  const currentController: ConversationListController = {
    conversations: [{ id: "task_a", title: "整理需求" }], loading: false, loadingMore: false, error: false,
    refresh: vi.fn(), hasMore: false, loadMore: vi.fn(), selectConversation: vi.fn(),
    deleteConversation: vi.fn().mockResolvedValue(true), renameConversation: vi.fn(), startNewChat: vi.fn(),
  }
  return {
    ...renderRail({
      projects: [{ id: projectRef, name: "产品规划", href: `/app/project/${projectRef}`, active: true }, { id: "project_b", name: "发布清单", href: "/app/project/project_b" }],
      projectListStatus: "ready", projectHref: `/app/project/${projectRef}`, projectActive: true,
      onNewChat,
      conversationReads: { engine: null, scope: { kind: "project", projectRef }, currentController, activeId: null, thread, isStreaming: false, identity: "folder-fixture", admitted: true, scopeVersions: new Map(), failedMoveScopeKey: null, focusComposer: () => {}, onSelect: vi.fn(), onNewChat: onFolderNewChat, onMove: vi.fn(), onDeleteConfirmed: vi.fn() },
      ...overrides,
    }), onNewChat, onFolderNewChat, projectRef, fetchMock, currentController,
  }
}


// Admin capability reads are independent of the business response queue.
const adminAccessFetch = vi.fn<typeof fetch>(async (input, init) => {
  expect(input).toBe("/api/admin-access")
  expect(init).toEqual(expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }))
  return Response.json({ platform_admin: false }, { headers: { "cache-control": "private, no-store", "x-request-id": "req-ordinary-account" } })
})
function stubBusinessFetch<T extends typeof fetch>(businessFetch: T): T {
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname === "/api/admin-access"
      ? adminAccessFetch(input, init)
      : businessFetch(input, init),
  )
  return businessFetch
}

beforeEach(() => {
  adminAccessFetch.mockClear()
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(window.history.state, "", "/")
})

it("按 runtime manifest 选择已注册菜单，未知 route 只呈现禁用态", () => {
  const { onOpenSettings } = renderRail({
    navigation: [
      { key: "skills", label: "自定义技能" },
      { key: "chat", label: "重复对话" },
      { key: "future-capability", label: "未来能力", featureFlag: "future" },
      { key: "disabled-capability", label: "关闭能力", featureFlag: "disabled" },
    ],
    featureFlags: [{ key: "future", enabled: true }, { key: "disabled", enabled: false }],
  })

  expect(screen.getByRole("link", { name: "自定义技能" })).toHaveAttribute("href", "/app/skills")
  expect(screen.queryByRole("button", { name: "重复对话" })).toBeNull()
  expect(screen.getByRole("button", { name: "未来能力" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "关闭能力" })).toBeNull()
  expect(screen.queryByTestId("rail-library")).toBeNull()

  expect(onOpenSettings).not.toHaveBeenCalled()
})

it("默认桌面导航不展示未接入能力的占位入口", () => {
  renderRail()

  expect(screen.queryByRole("button", { name: "Agent" })).toBeNull()
  expect(screen.queryByRole("button", { name: "外挂" })).toBeNull()
  expect(screen.queryByRole("button", { name: "已排程" })).toBeNull()
  expect(screen.queryByRole("button", { name: "资料库" })).toBeNull()
  expect(screen.queryByRole("button", { name: /创建专案/ })).toBeNull()
})

it("项目标题旁的加号打开新建专案菜单，不导航、不新建聊天或收起侧栏", async () => {
  const onNewChat = vi.fn()
  const onToggleCollapse = vi.fn()
  const onCreateProject = vi.fn()
  renderRail({
    projectHref: "/app/project/kokoro",
    onNewChat,
    onToggleCollapse,
    onCreateProject,
  })

  const before = window.location.href
  const createProject = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(createProject, { button: 0 })
  fireEvent.click(createProject)

  await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument())
  const createProjectEntry = screen.getByRole("menuitem", { name: "新建专案" })
  expect(createProjectEntry).toBeInTheDocument()
  fireEvent.click(createProjectEntry)
  expect(onCreateProject).toHaveBeenCalledTimes(1)
  expect(window.location.href).toBe(before)
  expect(onNewChat).not.toHaveBeenCalled()
  expect(onToggleCollapse).not.toHaveBeenCalled()
})

it("专案文件夹与普通清单并存，专案加号只创建专案，文件夹加号指定所属专案", async () => {
  const onCreateProject = vi.fn()
  const { onNewChat, onFolderNewChat, projectRef } = renderProjectFolderRail({ onCreateProject })
  const projects = document.querySelector('[data-project-list="true"]') as HTMLElement
  expect(projects).toHaveAttribute("aria-label", "专案")
  expect(within(projects).getByRole("link", { name: "产品规划" })).toBeInTheDocument()
  expect(within(projects).getByRole("link", { name: "发布清单" })).toBeInTheDocument()
  expect(await screen.findByRole("button", { name: "整理需求" })).toBeInTheDocument()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toHaveTextContent("普通持久会话")
  const newProject = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(newProject, { button: 0 })
  fireEvent.click(newProject)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  fireEvent.click(screen.getByTestId("rail-new-project-conversation"))
  expect(onCreateProject).toHaveBeenCalledTimes(1)
  expect(onFolderNewChat).toHaveBeenCalledExactlyOnceWith({ kind: "project", projectRef })
  expect(onNewChat).not.toHaveBeenCalled()
})

it("R170只把owner确认且非当前scope的目的地放入会话Move菜单", async () => {
  const onMoveConversation = vi.fn()
  const conversationId = "conv_11111111-1111-4111-8111-111111111111"
  const currentProject = "project_22222222-2222-4222-8222-222222222222"
  const targetProject = "project_33333333-3333-4333-8333-333333333333"
  renderRail({
    projects: [
      { id: currentProject, name: "当前专案", href: `/app/project/${currentProject}`, active: true },
      { id: targetProject, name: "目标专案", href: `/app/project/${targetProject}` },
    ],
    projectListStatus: "ready",
    projectHref: `/app/project/${currentProject}`,
    projectActive: true,
    conversations: [{ id: conversationId, title: "旧标题" }],
    ...({
      conversationScope: { kind: "project", projectRef: currentProject },
      onMoveConversation,
      conversationMove: null,
    } as unknown as Partial<Parameters<typeof WorkspaceRail>[0]>),
  })

  fireEvent.click(screen.getByRole("button", { name: "移动会话 旧标题" }))
  const menu = await screen.findByRole("menu")
  expect(within(menu).getByRole("menuitem", { name: "直接会话" })).toBeEnabled()
  expect(within(menu).getByRole("menuitem", { name: "目标专案" })).toBeEnabled()
  expect(within(menu).queryByRole("menuitem", { name: "当前专案" })).toBeNull()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "目标专案" }))
  expect(onMoveConversation).toHaveBeenCalledWith(conversationId, targetProject)
})

it.each(["loading", "error"] as const)(
  "R170不把%s或synthetic project shortcut当作Move目的地",
  async (projectListStatus) => {
    const conversationId = "conv_11111111-1111-4111-8111-111111111111"
    renderRail({
      projectHref: "/app/project/synthetic-preview-project",
      projectActive: false,
      projectListStatus,
      conversations: [{ id: conversationId, title: "旧标题" }],
      ...({
        conversationScope: { kind: "direct" },
        onMoveConversation: vi.fn(),
        conversationMove: null,
      } as unknown as Partial<Parameters<typeof WorkspaceRail>[0]>),
    })

    fireEvent.click(screen.getByRole("button", { name: "移动会话 旧标题" }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).queryByRole("menuitem", { name: "synthetic-preview-project" })).toBeNull()
    expect(within(menu).queryAllByRole("menuitem")).toHaveLength(0)
  },
)

it("会话指针拖动只在当前清单内排序，并向宿主上报稳定顺序", () => {
  const onReorderConversations = vi.fn()
  renderRail({
    conversations: [
      { id: "conversation_a", title: "第一个" },
      { id: "conversation_b", title: "第二个" },
    ],
    onReorderConversations,
  })

  const list = screen.getByRole("navigation", { name: "直接会话" })
  const first = within(list).getByRole("button", { name: "第一个" })
  const second = within(list).getByRole("button", { name: "第二个" })
  const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() }
  fireEvent.dragStart(first, { dataTransfer })
  fireEvent.dragOver(second, { dataTransfer })
  fireEvent.drop(second, { dataTransfer })

  expect(onReorderConversations).toHaveBeenCalledWith(["conversation_b", "conversation_a"])
  expect([...list.querySelectorAll("[data-conversation-id]")].map((node) => node.textContent)).toEqual(["第二个", "第一个"])
  expect(first).toHaveAttribute("aria-grabbed", "false")
})

it("会话键盘拖动提供可访问的抓取、上下移动和取消", () => {
  const onReorderConversations = vi.fn()
  renderRail({
    conversations: [
      { id: "conversation_a", title: "第一个" },
      { id: "conversation_b", title: "第二个" },
    ],
    onReorderConversations,
  })

  const list = screen.getByRole("navigation", { name: "直接会话" })
  const first = within(list).getByRole("button", { name: "第一个" })
  first.focus()
  fireEvent.keyDown(first, { key: " " })
  expect(first).toHaveAttribute("aria-grabbed", "true")
  fireEvent.keyDown(first, { key: "ArrowDown" })
  expect(onReorderConversations).toHaveBeenCalledWith(["conversation_b", "conversation_a"])
  fireEvent.keyDown(first, { key: "Escape" })
  expect(first).toHaveAttribute("aria-grabbed", "false")
  expect(onReorderConversations).toHaveBeenLastCalledWith(["conversation_a", "conversation_b"])
  expect(first).toHaveAttribute("aria-keyshortcuts", "Space ArrowUp ArrowDown Escape")
})

it("专案清单和任务清单分别支持键盘排序，不会互相移动", () => {
  const onReorderProjects = vi.fn()
  const onReorderConversations = vi.fn()
  renderRail({
    projects: [
      { id: "project_a", name: "产品规划", href: "/app/project/product", active: true },
      { id: "project_b", name: "发布清单", href: "/app/project/release" },
    ],
    projectHref: "/app/project/product",
    projectActive: true,
    conversations: [
      { id: "task_a", title: "第一个任务" },
      { id: "task_b", title: "第二个任务" },
    ],
    onReorderProjects,
    onReorderConversations,
  })

  const project = screen.getByTestId("rail-project")
  project.focus()
  fireEvent.keyDown(project, { key: " " })
  fireEvent.keyDown(project, { key: "ArrowDown" })
  fireEvent.keyDown(project, { key: " " })
  expect(onReorderProjects).toHaveBeenCalledWith(["project_b", "project_a"])
  expect(onReorderConversations).not.toHaveBeenCalled()

  const task = screen.getByRole("button", { name: "第一个任务" })
  task.focus()
  fireEvent.keyDown(task, { key: " " })
  fireEvent.keyDown(task, { key: "ArrowDown" })
  expect(onReorderConversations).toHaveBeenCalledWith(["task_b", "task_a"])
})

it("选择新建专案后完成路由与草稿承接，并把焦点留在展开态的加号", async () => {
  function ControlledRail() {
    const [projectActive, setProjectActive] = useState(false)
    const directDraft = "从直接会话承接的草稿"
    const [projectDraft, setProjectDraft] = useState("")

    return (
      <>
        <output aria-label="当前草稿">{projectDraft}</output>
        <WorkspaceRail
          collapsed={false}
          onToggleCollapse={() => {}}
          onNewChat={() => {}}
          chatHref="/app"
          projectHref="/app/project/preview-project"
          projectActive={projectActive}
          onCreateProject={() => {
            window.history.pushState(window.history.state, "", "/app/project/preview-project")
            setProjectDraft(directDraft)
            setProjectActive(true)
          }}
          conversations={[]}
          activeId={null}
          awaitingIds={new Set()}
          onSelectConversation={() => {}}
          onDeleteConversation={async () => true}
          onRenameConversation={() => {}}
          onOpenSettings={() => {}}
          listLoading={false}
          listError={false}
          hasMore={false}
          onLoadMore={() => {}}
        />
      </>
    )
  }

  render(<ThemeProvider><LocaleProvider><ControlledRail /></LocaleProvider></ThemeProvider>)

  const trigger = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(trigger, { button: 0 })
  fireEvent.click(trigger)
  const entry = await screen.findByRole("menuitem", { name: "新建专案" })
  fireEvent.click(entry)

  await waitFor(() => {
    expect(window.location.pathname).toBe("/app/project/preview-project")
    expect(screen.queryByRole("menuitem", { name: "新建专案" })).toBeNull()
    expect(screen.getByRole("button", { name: "新建专案" })).toHaveFocus()
  })
  expect(screen.getByLabelText("当前草稿")).toHaveTextContent("从直接会话承接的草稿")
  expect(document.querySelector('[data-desktop-rail="true"][data-collapsed="false"]')).toBeInTheDocument()
})

it("桌面 Rail 显示邀请入口并进入团队设置", () => {
  const { onOpenSettings } = renderRail({ brandName: "Kokoro" })

  fireEvent.click(screen.getByRole("button", { name: "邀请朋友使用 Kokoro" }))
  expect(onOpenSettings).toHaveBeenCalledWith("team")
})

it("桌面 Rail 的紧凑样式由实际 rail 模式标记驱动", () => {
  renderRail({ brandName: "Kokoro" })

  const rail = document.querySelector('[data-collapsed="false"]')
  expect(rail).toHaveAttribute("data-desktop-rail", "true")
  expect(rail).toHaveAttribute("data-desktop-web", "true")
})

it("收起 Rail 时不渲染邀请卡，避免占用图标轨道", () => {
  renderRail({ collapsed: true, brandName: "Kokoro" })

  expect(screen.queryByRole("button", { name: "邀请朋友使用 Kokoro" })).toBeNull()
})

it("默认品牌使用中性产品标记，不回退到旧手掌或心字符", () => {
  renderRail({ brandName: "Kokoro", brandMark: "心" })

  expect(document.querySelector(".lucide-audio-waveform")).toBeInTheDocument()
  expect(document.querySelector(".lucide-hand")).toBeNull()
  expect(screen.queryByText("心")).toBeNull()
})

it("直接会话桌面页保持聊天语义，不被渲染为专案任务", () => {
  renderRail({
    projectHref: "/app/project/kokoro",
    projectActive: false,
    conversations: [{ id: "chat_direct_1", title: "整理本周计划" }],
    activeId: "chat_direct_1",
  })

  expect(screen.getByRole("button", { name: "新对话" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/app")
  const chats = screen.getByRole("navigation", { name: "直接会话" })
  expect(chats).toHaveAttribute("data-conversation-list", "direct")
  expect(within(chats).getByText("聊天")).toBeInTheDocument()
  expect(within(chats).queryByText("任务")).toBeNull()
})

it("空的直接会话桌面页仍保留独立会话分区", () => {
  renderRail({
    projectHref: "/app/project/kokoro",
    projectActive: false,
    conversations: [],
    activeId: null,
  })

  const chats = screen.getByRole("navigation", { name: "直接会话" })
  expect(chats).toHaveAttribute("data-conversation-list", "direct")
  expect(within(chats).getByText("聊天")).toBeInTheDocument()
  expect(within(chats).getByText("还没有直接会话")).toBeInTheDocument()
  expect(within(chats).queryByText("任务")).toBeNull()
})

it("收起态不复制直接会话或孤立专案会话 stop，并保留专案与底部账户锚点", () => {
  renderRail({
    collapsed: true,
    projectHref: "/app/project/kokoro",
    projectActive: true,
  })

  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
  expect(screen.getByTestId("rail-project")).toHaveAttribute("data-navigation-section", "project")
  expect(screen.queryByTestId("rail-project-conversation")).toBeNull()
  expect(screen.queryByTestId("rail-utility-device")).toBeNull()
  expect(screen.getByTestId("rail-utility-notifications")).toHaveAttribute("data-rail-anchor", "utility")
  expect(screen.getByTestId("rail-utility-account")).toHaveAttribute("data-rail-anchor", "account")
})

it("当前专案由文件夹内的明确加号创建一次新会话，不替换全局新对话行为", async () => {
  const { onNewChat, onFolderNewChat, projectRef } = renderProjectFolderRail()
  await screen.findByRole("button", { name: "整理需求" })
  expect(screen.queryByTestId("rail-project-conversation")).toBeNull()
  fireEvent.click(screen.getByTestId("rail-new-project-conversation"))
  expect(onFolderNewChat).toHaveBeenCalledExactlyOnceWith({ kind: "project", projectRef })
  expect(onNewChat).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId("rail-new-conversation"))
  expect(onNewChat).toHaveBeenCalledTimes(1)
})

it("展开态账户卡左对齐，通知动作保留在同一行", () => {
  renderRail({ brandName: "Kokoro" })

  const rail = document.querySelector('[data-desktop-rail="true"][data-collapsed="false"]')
  const account = screen.getByTestId("rail-utility-account")
  const accountStatus = rail?.querySelector(`.${railStyles.accountStatus}`)
  const userTriggerClass = railStyles.userTrigger
  if (userTriggerClass === undefined) {
    throw new Error("Expected the workspace rail user trigger style")
  }

  expect(account).toHaveTextContent("Kokoro")
  expect(account).toHaveTextContent("个人工作区")
  expect(account).toHaveClass(userTriggerClass)
  expect(accountStatus?.querySelector('[data-testid="rail-utility-device"]')).toBeNull()
  expect(accountStatus?.querySelector('[data-testid="rail-utility-notifications"]')).toBeInTheDocument()
  // jsdom does not calculate flex layout; lock the desktop CSS contract here
  // and verify the resulting geometry with the browser viewport check.
  expect(workspaceRailCss).toMatch(
    /\.rail\[data-desktop-rail="true"\] \.userTrigger \{\s*justify-content: flex-start;/,
  )
  expect(workspaceRailCss).toMatch(/container: workspace-rail \/ inline-size;/)
  expect(workspaceRailCss).toMatch(/@container workspace-rail \(max-width: 12\.5rem\)/)
})

it("Manus 紧凑 stop 清单只保留一个工作区气泡入口", () => {
  renderRail({
    collapsed: true,
    navigation: [
      { key: "agent", label: "Agent" },
      { key: "skills", label: "技能" },
      { key: "mcp", label: "外挂" },
      { key: "scheduled", label: "已排程" },
      { key: "library", label: "资料库" },
    ],
  })

  expect(screen.getByTestId("rail-new-conversation")).toBeInTheDocument()
  for (const key of ["agent", "skills", "mcp", "scheduled", "library"]) {
    expect(screen.getByTestId(`rail-${key}`)).toBeInTheDocument()
  }
  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
  expect(document.querySelectorAll('[data-navigation-section]').length).toBe(6)
  expect(document.querySelectorAll('[data-navigation-section="agent"] svg.lucide-message-square-more')).toHaveLength(1)
  expect(document.querySelectorAll('[data-navigation-section="direct-chat"]')).toHaveLength(0)
  expect(document.querySelectorAll('[data-navigation-section] span').length).toBe(0)
})

it("收起态导航保留无文字的可访问入口名称", () => {
  renderRail({
    collapsed: true,
    navigation: [
      { key: "agent", label: "Agent" },
      { key: "skills", label: "技能" },
      { key: "scheduled", label: "已排程" },
      { key: "library", label: "资料库" },
    ],
    projectHref: "/app/project/kokoro",
  })

  expect(screen.getByRole("button", { name: "新对话" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Agent" })).toHaveAttribute("href", "/app/agents")
  expect(screen.getByRole("link", { name: "技能" })).toHaveAttribute("href", "/app/skills")
  expect(screen.getByRole("link", { name: "已排程" })).toHaveAttribute("href", "/app/scheduled?tab=calendar")
  expect(screen.getByRole("link", { name: "资料库" })).toHaveAttribute("href", "/app/library")
  expect(document.querySelector(`[data-collapsed="true"] .${railStyles.navLabel}`)).toBeNull()
  expect(document.querySelector(`[data-collapsed="true"] .${railStyles.brandText}`)).toBeNull()
  expect(document.querySelector(`[data-collapsed="true"] .${railStyles.userText}`)).toBeNull()
})

it("展开态不为已显示文字的菜单保留 Radix tooltip trigger", () => {
  renderRail({
    navigation: [{ key: "agent", label: "Agent" }],
    projectHref: "/app/project/kokoro",
  })

  expect(screen.getByTestId("rail-new-conversation")).not.toHaveAttribute("data-state")
  expect(screen.getByTestId("rail-agent")).not.toHaveAttribute("data-state")
  expect(screen.queryByTestId("rail-project-conversation")).toBeNull()
})

it("收起态不保留隐藏标签或会话操作按钮", () => {
  renderRail({
    collapsed: true,
    navigation: [{ key: "agent", label: "Agent" }],
    projectHref: "/app/project/kokoro",
    conversations: [{ id: "ses_1", title: "旧标题" }],
  })

  const rail = document.querySelector('[data-collapsed="true"]')
  expect(rail?.querySelector(`.${railStyles.brandText}`)).toBeNull()
  expect(rail?.querySelector(`.${railStyles.navGroupLabel}`)).toBeNull()
  expect(rail?.querySelector(`.${railStyles.userText}`)).toBeNull()
    const conversationList = rail?.querySelector("[data-conversation-list]")
    expect(conversationList).not.toBeNull()
    expect(conversationList?.querySelector('[data-sidebar="menu-action"]')).toBeNull()
  expect(rail?.querySelectorAll('[data-sidebar="menu-action"]')).toHaveLength(0)
})

it("鼠标收起时品牌入口 focus 不挂错误 ring 标记，键盘收起不走 pointer 标记", async () => {
  function ControlledRail() {
    const [collapsed, setCollapsed] = useState(false)
    return <WorkspaceRail
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((value) => !value)}
      onNewChat={() => {}}
      chatHref="/app"
      conversations={[]}
      activeId={null}
      awaitingIds={new Set()}
      onSelectConversation={() => {}}
      onDeleteConversation={async () => true}
      onRenameConversation={() => {}}
      onOpenSettings={() => {}}
      listLoading={false}
      listError={false}
      hasMore={false}
      onLoadMore={() => {}}
    />
  }

  render(<ThemeProvider><LocaleProvider><ControlledRail /></LocaleProvider></ThemeProvider>)
  const collapse = screen.getByRole("button", { name: "收起侧栏" })
  fireEvent.click(collapse, { detail: 1 })
  await waitFor(() => expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveFocus())
  expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute("data-pointer-focus", "true")

  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }))
  const search = screen.getByRole("button", { name: "搜索会话" })
  fireEvent.click(search)
  const searchInput = await screen.findByRole("searchbox", { name: "搜索最近会话" })
  expect(searchInput).toHaveFocus()
  fireEvent.keyDown(searchInput, { key: "Escape" })
  await waitFor(() => expect(screen.getByRole("button", { name: "搜索会话" })).toHaveFocus())
  expect(screen.getByRole("button", { name: "收起侧栏" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }), { detail: 0 })
  await waitFor(() => expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveFocus())
  expect(screen.getByRole("button", { name: "展开侧栏" })).not.toHaveAttribute("data-pointer-focus")
})

it("活动导航用 aria-current 固定路由切换期间的选中语义", () => {
  renderRail({
    navigation: [{ key: "agent", label: "Agent" }],
    activeNavigationKey: "agent",
    projectHref: "/app/project/kokoro",
  })

  expect(screen.getByTestId("rail-agent")).toHaveAttribute("aria-current", "page")
})

it("站内 surface 导航变化时关闭收起态旧 tooltip，普通 hover 仍可重新打开", async () => {
  const view = renderRail({
    collapsed: true,
    navigation: [
      { key: "agent", label: "Agent" },
      { key: "skills", label: "技能" },
    ],
    activeNavigationKey: "agent",
  })

  fireEvent.pointerMove(screen.getByTestId("rail-agent"), { pointerType: "mouse" })
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Agent")
  const workbenchMenu = screen.getByTestId("rail-agent").closest('[data-slot="sidebar-menu"]')
  expect(workbenchMenu).not.toBeNull()

  view.rerender(
    <ThemeProvider>
      <LocaleProvider>
        <WorkspaceRail
          collapsed
          onToggleCollapse={() => {}}
          onNewChat={() => {}}
          chatHref="/app"
          navigation={[
            { key: "agent", label: "Agent" },
            { key: "skills", label: "技能" },
          ]}
          activeNavigationKey="skills"
          conversations={[]}
          activeId={null}
          awaitingIds={new Set()}
          onSelectConversation={() => {}}
          onDeleteConversation={async () => true}
          onRenameConversation={() => {}}
          onOpenSettings={() => {}}
          listLoading={false}
          listError={false}
          hasMore={false}
          onLoadMore={() => {}}
        />
      </LocaleProvider>
    </ThemeProvider>,
  )

  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
  expect(screen.getByTestId("rail-skills").closest('[data-slot="sidebar-menu"]')).toBe(workbenchMenu)

  fireEvent.pointerMove(screen.getByTestId("rail-skills"), { pointerType: "mouse" })
  expect(await screen.findByRole("tooltip")).toHaveTextContent("技能")
})

it("compactDesktop 模式变化时关闭账户菜单", async () => {
  let setCollapsed: (collapsed: boolean) => void = () => {}

  function ControlledRail() {
    const [collapsed, setCollapsedState] = useState(true)
    setCollapsed = setCollapsedState
    return (
      <WorkspaceRail
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsedState((value) => !value)}
        onNewChat={() => {}}
        chatHref="/app"
        conversations={[]}
        activeId={null}
        awaitingIds={new Set()}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => true}
        onRenameConversation={() => {}}
        onOpenSettings={() => {}}
        listLoading={false}
        listError={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    )
  }

  render(<ThemeProvider><LocaleProvider><ControlledRail /></LocaleProvider></ThemeProvider>)
  const account = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  fireEvent.pointerDown(account, { button: 0 })
  fireEvent.click(account)
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "账户" })).toBeInTheDocument())

  act(() => setCollapsed(false))
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
})

it("专案侧栏保留普通会话清单与概览入口，所属会话嵌在文件夹内", async () => {
  renderProjectFolderRail()
  await screen.findByRole("button", { name: "整理需求" })
  expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/app")
  expect(screen.getByRole("navigation", { name: "直接会话" })).toHaveTextContent("普通持久会话")
  const project = screen.getByRole("link", { name: "产品规划" }).closest('[data-project-id]') as HTMLElement
  expect(within(project).getByRole("navigation", { name: "产品规划" })).toHaveAttribute("data-conversation-list", "project-conversation")
  expect(screen.queryByRole("navigation", { name: "专案会话" })).toBeNull()
  expect(screen.queryByText("没有匹配的会话")).toBeNull()
})

it("文件夹渲染owner返回的所属会话且不混入普通清单", async () => {
  renderProjectFolderRail()
  await screen.findByRole("button", { name: "整理需求" })
  const folder = screen.getByRole("link", { name: "产品规划" }).closest('[data-project-id]') as HTMLElement
  expect(within(folder).getByRole("button", { name: "整理需求" })).toBeInTheDocument()
  expect(within(folder).queryByText("普通持久会话")).toBeNull()
  const direct = screen.getByRole("navigation", { name: "直接会话" })
  expect(within(direct).getByText("普通持久会话")).toBeInTheDocument()
  expect(within(direct).queryByText("整理需求")).toBeNull()
})

it("当前scope复用主controller且仅非当前展开文件夹建立独立owner reader", async () => {
  const { fetchMock, currentController } = renderProjectFolderRail()
  await screen.findByRole("button", { name: "整理需求" })
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  expect(fetchMock.mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    .searchParams.get("project_ref"))).toEqual([null])
  expect(currentController.refresh).not.toHaveBeenCalled()

  const other = screen.getByRole("link", { name: "发布清单" }).closest('[data-project-id]') as HTMLElement
  fireEvent.click(within(other).getByRole("button", { name: /展开专案 发布清单/u }))
  await waitFor(() => expect(fetchMock.mock.calls.map(([input]) =>
    new URL(input instanceof Request ? input.url : String(input), window.location.origin).searchParams.get("project_ref"),
  )).toContain("project_b"))
})

it("桌面收起侧栏通过账户菜单打开设置", async () => {
  const { onOpenSettings } = renderRail({ collapsed: true })
  const account = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  fireEvent.pointerDown(account, { button: 0 })
  fireEvent.click(account)
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "账户" })).toBeInTheDocument())
  fireEvent.click(screen.getByRole("menuitem", { name: "账户" }))
  await waitFor(() => expect(onOpenSettings).toHaveBeenCalledWith("account"))
})

it("账户文件入口使用已挂载的资料库路由", async () => {
  renderRail()
  window.history.replaceState(window.history.state, "", "/app")
  const account = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  fireEvent.pointerDown(account, { button: 0 })
  fireEvent.click(account)
  const files = await screen.findByRole("menuitem", { name: "文件" })
  expect(files).toHaveAttribute("href", "/app/library")
  fireEvent.click(files)
  expect(window.location.pathname).toBe("/app/library")
})

it("双击标题进入编辑，Enter 提交新题一次并把焦点还给会话行", async () => {
  const { onRenameConversation } = renderRail()
  fireEvent.doubleClick(screen.getByText("旧标题"))
  const input = screen.getByLabelText("会话标题")
  fireEvent.change(input, { target: { value: "全新标题" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onRenameConversation).toHaveBeenCalledTimes(1)
  expect(onRenameConversation).toHaveBeenCalledWith("ses_1", "全新标题")
  await waitFor(() => expect(screen.getByRole("button", { name: "旧标题" })).toHaveFocus())
})

it("✎ 按钮进入编辑，失焦提交", () => {
  const { onRenameConversation } = renderRail()
  fireEvent.click(screen.getByLabelText("重命名会话 旧标题"))
  const input = screen.getByLabelText("会话标题")
  fireEvent.change(input, { target: { value: "改一下" } })
  fireEvent.blur(input)
  expect(onRenameConversation).toHaveBeenCalledWith("ses_1", "改一下")
})

it("Escape 取消不上抛，标题回落原值", () => {
  const { onRenameConversation } = renderRail()
  fireEvent.doubleClick(screen.getByText("旧标题"))
  const input = screen.getByLabelText("会话标题")
  fireEvent.change(input, { target: { value: "不要保存" } })
  fireEvent.keyDown(input, { key: "Escape" })
  expect(onRenameConversation).not.toHaveBeenCalled()
  expect(screen.getByText("旧标题")).toBeInTheDocument()
})

it("桌面删除确认取消后把焦点还给原删除按钮", async () => {
  renderRail()
  const deleteButton = screen.getByRole("button", { name: "删除会话 旧标题" })
  deleteButton.focus()
  fireEvent.click(deleteButton)
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(deleteButton).toHaveFocus())
})

it("桌面确认删除后把焦点交给稳定的新对话入口", async () => {
  const onDeleteConversation = vi.fn().mockResolvedValue(true)
  renderRail({ onDeleteConversation })
  const deleteButton = screen.getByRole("button", { name: "删除会话 旧标题" })
  deleteButton.focus()
  fireEvent.click(deleteButton)
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }))

  expect(onDeleteConversation).toHaveBeenCalledWith("ses_1")
  await waitFor(() => expect(screen.getByRole("button", { name: /新对话/ })).toHaveFocus())
})

it("空题与未改动不触发请求", () => {
  const { onRenameConversation } = renderRail()
  fireEvent.doubleClick(screen.getByText("旧标题"))
  const input = screen.getByLabelText("会话标题")
  // 空白
  fireEvent.change(input, { target: { value: "   " } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onRenameConversation).not.toHaveBeenCalled()
  // 未改动（与原题相同）
  fireEvent.doubleClick(screen.getByText("旧标题"))
  const input2 = screen.getByLabelText("会话标题")
  fireEvent.keyDown(input2, { key: "Enter" })
  expect(onRenameConversation).not.toHaveBeenCalled()
})

it("runtime manifest 的一级页面与设置入口使用各自导航语义", () => {
  const { onOpenSettings, onOpenNotifications } = renderRail({
    navigation: [
      { key: "library", label: "作品" },
      { key: "mcp", label: "连接" },
      { key: "team", label: "团队" },
    ],
  })
  expect(screen.getByTestId("rail-library")).toHaveAttribute("href", "/app/library")
  expect(screen.getByTestId("rail-mcp")).toHaveAttribute("href", "/app/plugins")
  expect(screen.getByTestId("rail-mcp").querySelector('[data-slot="plugins-icon"]')?.querySelectorAll("circle")).toHaveLength(4)
  expect(screen.queryByRole("button", { name: "我的电脑" })).toBeNull()
  expect(onOpenSettings).not.toHaveBeenCalledWith("computer")
  fireEvent.click(screen.getByRole("button", { name: "打开通知" }))
  expect(onOpenSettings).not.toHaveBeenCalledWith("appearance")
  expect(onOpenNotifications).toHaveBeenLastCalledWith(expect.any(HTMLElement))
  fireEvent.click(screen.getByTestId("rail-team"))
  expect(onOpenSettings).toHaveBeenLastCalledWith("team")
})

it("Agent 一级入口导航到独立页面，不再回落为新建聊天", () => {
  const onNewChat = vi.fn()
  renderRail({
    navigation: [
      { key: "agent", label: "Agent" },
      { key: "skills", label: "技能" },
    ],
    activeNavigationKey: "agent",
    onNewChat,
  })

  const agent = screen.getByTestId("rail-agent")
  expect(agent).toHaveAttribute("href", "/app/agents")
  expect(agent).toHaveAttribute("data-active", "true")
  expect(agent.querySelector("svg.lucide-message-square-more")).toBeInTheDocument()
  expect(screen.getByTestId("rail-skills").querySelector("svg.lucide-puzzle")).toBeInTheDocument()
  fireEvent.click(agent)
  expect(onNewChat).not.toHaveBeenCalled()
})

it("已排程入口导航到独立日历页面，不再回落为新建聊天", () => {
  const onNewChat = vi.fn()
  renderRail({ navigation: [{ key: "scheduled", label: "已排程" }], onNewChat })

  const scheduled = screen.getByTestId("rail-scheduled")
  expect(scheduled).toHaveAttribute("href", "/app/scheduled?tab=calendar")
  fireEvent.click(scheduled)
  expect(onNewChat).not.toHaveBeenCalled()
})

it("桌面账户菜单在下一帧释放 Dropdown 后交接 Settings", () => {
  vi.useFakeTimers()
  try {
    const { onOpenSettings } = renderRail()
    fireEvent.pointerDown(screen.getByRole("button", { name: /工作区/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: "账户" }))
    expect(onOpenSettings).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(32))
    expect(onOpenSettings).toHaveBeenCalledWith("account")
  } finally {
    vi.useRealTimers()
  }
})

it("桌面账户菜单启用个性化入口并交接对应设置页", () => {
  vi.useFakeTimers()
  try {
    const { onOpenSettings } = renderRail()
    fireEvent.pointerDown(screen.getByRole("button", { name: /工作区/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: "个性化" }))
    act(() => vi.advanceTimersByTime(32))
    expect(onOpenSettings).toHaveBeenCalledWith("personalization")
  } finally {
    vi.useRealTimers()
  }
})

it("预览 Rail 的产品身份不被 Preview Team fixture 覆盖", async () => {
  renderRail({ preview: true, brandName: "Kokoro" })

  await waitFor(() => {
    expect(screen.getAllByText("Kokoro").length).toBeGreaterThanOrEqual(2)
  })
  expect(screen.queryByText("Preview Workspace")).toBeNull()
})

it("品牌入口使用真实的直接会话导航语义", () => {
  renderRail()
  const chatLink = screen.getByRole("link", { name: "Workspace" })
  expect(chatLink).toHaveAttribute("href", "/app")

  const conversation = screen.getByRole("button", { name: "旧标题" })
  expect(conversation).toHaveAttribute("aria-pressed", "true")
})

it("侧栏操作按钮默认是 action，不会提交外层表单", () => {
  renderRail()
  expect(screen.getByRole("button", { name: /新对话/ })).toHaveAttribute("type", "button")
  expect(screen.getByLabelText("重命名会话 旧标题")).toHaveAttribute("type", "button")
  expect(screen.getByLabelText("删除会话 旧标题")).toHaveAttribute("type", "button")
})

it("品牌入口由站点路由契约提供，而不是被 rail 写死", () => {
  renderRail({ chatHref: "/custom-chat" })
  expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/custom-chat")
})

it("桌面折叠态只显示品牌展开入口，展开后搜索仍可用", async () => {
  function ControlledRail() {
    const [collapsed, setCollapsed] = useState(true)
    return <WorkspaceRail
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((value) => !value)}
      onNewChat={() => {}}
      chatHref="/app"
      conversations={[{ id: "ses_1", title: "旧标题" }]}
      activeId="ses_1"
      awaitingIds={new Set()}
      onSelectConversation={() => {}}
      onDeleteConversation={async () => true}
      onRenameConversation={() => {}}
      onOpenSettings={() => {}}
      listLoading={false}
      listError={false}
      hasMore={false}
      onLoadMore={() => {}}
    />
  }
  render(<ThemeProvider><LocaleProvider><ControlledRail /></LocaleProvider></ThemeProvider>)
  expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "搜索会话" })).toBeNull()

  const expand = screen.getByRole("button", { name: "展开侧栏" })
  fireEvent.click(expand)
  await waitFor(() => expect(screen.getByRole("button", { name: "搜索会话" })).toBeInTheDocument())

  fireEvent.click(screen.getByRole("button", { name: "搜索会话" }))
  const input = screen.getByRole("searchbox", { name: "搜索最近会话" })
  expect(input).toBeInTheDocument()
  expect(input).toHaveFocus()
})

it("Escape 关闭侧栏搜索后把焦点交还给搜索按钮", async () => {
  renderRail()
  const search = screen.getByRole("button", { name: "搜索会话" })
  fireEvent.click(search)
  const input = screen.getByRole("searchbox", { name: "搜索最近会话" })
  fireEvent.keyDown(input, { key: "Escape" })
  await waitFor(() => expect(search).toHaveFocus())
})

it("收起侧栏时清理搜索状态，重新展开不恢复隐藏搜索框", async () => {
  function ControlledRail() {
    const [collapsed, setCollapsed] = useState(false)
    return (
      <WorkspaceRail
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onNewChat={() => {}}
        chatHref="/app"
        conversations={[]}
        activeId={null}
        awaitingIds={new Set()}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => true}
        onRenameConversation={() => {}}
        onOpenSettings={() => {}}
        listLoading={false}
        listError={false}
        hasMore={false}
        onLoadMore={() => {}}
      />
    )
  }

  render(
    <ThemeProvider>
      <LocaleProvider>
        <ControlledRail />
      </LocaleProvider>
    </ThemeProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "搜索会话" }))
  expect(screen.getByRole("searchbox", { name: "搜索最近会话" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument())
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }))
  await waitFor(() => expect(screen.queryByRole("searchbox", { name: "搜索最近会话" })).toBeNull())
})

it("待批徽标（HITL-NOTIFY）：id 命中 awaitingIds 才渲染", () => {
  renderRail({ awaitingIds: new Set(["ses_1"]) })
  expect(screen.getByLabelText("等待批准")).toBeInTheDocument()
})

it("待批徽标：id 未命中则不渲染", () => {
  renderRail({ awaitingIds: new Set(["ses_other"]) })
  expect(screen.queryByLabelText("等待批准")).toBeNull()
})

it("会话清单失败时提供重试入口，并保留已加载会话", () => {
  const onRetryList = vi.fn()
  renderRail({ listError: true, onRetryList })
  expect(screen.getByText("会话列表加载失败")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "重试加载" }))
  expect(onRetryList).toHaveBeenCalledTimes(1)
  expect(screen.getByText("旧标题")).toBeInTheDocument()
})

it("会话清单加载态暴露 status，错误态暴露 alert", () => {
  renderRail({ conversations: [], listLoading: true })
  expect(screen.getByRole("status", { name: "正在加载会话…" })).toBeInTheDocument()

  cleanup()
  renderRail({ conversations: [], listError: true, onRetryList: vi.fn() })
  expect(screen.getByRole("alert")).toHaveTextContent("会话列表加载失败")
})

it("文件夹明确的新对话入口只发所属意图，独立任务导航不创建会话", async () => {
  const { onNewChat, onFolderNewChat, projectRef } = renderProjectFolderRail({ navigation: [{ key: "scheduled", label: "定时任务" }] })
  await screen.findByRole("button", { name: "整理需求" })
  expect(screen.queryByTestId("rail-project-conversation")).toBeNull()
  // The global action remains present; the folder adds its explicit project target.
  expect(screen.getAllByRole("button", { name: "新对话" })).toHaveLength(2)
  fireEvent.click(screen.getByTestId("rail-new-project-conversation"))
  expect(onFolderNewChat).toHaveBeenCalledExactlyOnceWith({ kind: "project", projectRef })
  fireEvent.click(screen.getByRole("link", { name: "定时任务" }))
  expect(onFolderNewChat).toHaveBeenCalledTimes(1)
  expect(onNewChat).not.toHaveBeenCalled()
})

it("收起侧栏的新建专案只发创建意图，不把菜单事件当草稿", async () => {
  const onCreateProject = vi.fn()
  renderRail({ collapsed: true, onCreateProject })
  const picker = screen.getByTestId("rail-project")
  fireEvent.pointerDown(picker, { button: 0 })
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  expect(onCreateProject).toHaveBeenCalledExactlyOnceWith()
})

it("专案侧栏不渲染孤立会话气泡，文件夹加号是明确专案新对话入口", async () => {
  renderProjectFolderRail()
  await screen.findByRole("button", { name: "整理需求" })
  expect(screen.getByTestId("rail-new-conversation")).toHaveAttribute("data-navigation-section", "new-conversation")
  expect(screen.queryByTestId("rail-project-conversation")).toBeNull()
  const explicitEntry = screen.getByTestId("rail-new-project-conversation")
  expect(explicitEntry).toHaveAccessibleName("新对话")
  expect(explicitEntry.querySelector(".lucide-plus")).not.toBeNull()
  expect(explicitEntry.closest('[data-project-id]')).toHaveAttribute("data-project-id", "project_a")
})

it("会话重命名只提交 conversation 身份，canonical Project 名称与 id 原样保留", () => {
  const { onRenameConversation } = renderRail({
    brandName: "不属于项目的品牌",
    projects: [{ id: "canonical-project", name: "独立项目名称", href: "/app/project/canonical-project" }],
    projectListStatus: "ready",
  })
  fireEvent.click(screen.getByLabelText("重命名会话 旧标题"))
  const input = screen.getByRole("textbox", { name: "会话标题" })
  fireEvent.change(input, { target: { value: "新会话标题" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onRenameConversation).toHaveBeenCalledWith("ses_1", "新会话标题")
  const project = screen.getByRole("link", { name: "独立项目名称" })
  expect(project).toHaveAttribute("href", "/app/project/canonical-project")
  expect(project.closest("[data-project-id]")).toHaveAttribute("data-project-id", "canonical-project")
  expect(document.querySelector('[data-project-list] a[aria-label="新会话标题"]')).toBeNull()
})

it("正式 rail 只有当前路由而无集合时不造通用项目；显式 preview 仍独立", () => {
  renderRail({ projectHref: "/app/project/deep-link", preview: false })
  expect(document.querySelector('[data-project-list] [data-project-id]')).toBeNull()
  cleanup()
  renderRail({ projectHref: "/app/project/preview-project", preview: true })
  expect(screen.getByRole("link", { name: "当前专案" })).toHaveAttribute("href", "/app/project/preview-project")
})

it("R254 当前项目选择不替换普通持久会话分区，项目名称仍是概览Link", () => {
  renderRail({
    projects: [{ id: "project_a", name: "产品规划", href: "/app/project/project_a", active: true }],
    projectHref: "/app/project/project_a",
    projectActive: true,
    conversations: [{ id: "conv_direct", title: "普通持久会话" }],
    activeId: null,
  })
  const direct = screen.getByRole("navigation", { name: "直接会话" })
  expect(direct).toHaveAttribute("data-conversation-list", "direct")
  expect(within(direct).getByRole("button", { name: "普通持久会话" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "产品规划" })).toHaveAttribute("href", "/app/project/project_a")
  expect(screen.queryByRole("navigation", { name: "专案会话" })).not.toBeInTheDocument()
})


function retirementRailFixture() {
  const transient = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const thread = transient.getSnapshot().thread
  transient.dispose()
  const list = createSessionClient({ baseUrl: "http://s.local" })
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(list)
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    const project = url.searchParams.get("project_ref")
    return Response.json({ sessions: project === null ? [] : [{ session_id: `conv_${project}`, title: `会话${project}`, updated_at: "2026-10-01T00:00:00Z" }], next_cursor: null })
  })
  const props: Parameters<typeof WorkspaceRail>[0] = {
    collapsed: false, onToggleCollapse: vi.fn(), onNewChat: vi.fn(), chatHref: "/app", conversations: [], activeId: null,
    awaitingIds: new Set(), onSelectConversation: vi.fn(), onDeleteConversation: vi.fn().mockResolvedValue(true), onRenameConversation: vi.fn(), onOpenSettings: vi.fn(), listLoading: false, listError: false, hasMore: false, onLoadMore: vi.fn(),
    projects: [{ id: "P", name: "同名专案", href: "/app/project/P" }, { id: "Q", name: "同名专案", href: "/app/project/Q" }], projectListStatus: "ready",
    conversationReads: { engine: null, scope: { kind: "direct" }, currentController: {
      conversations: [], loading: false, loadingMore: false, error: false, refresh: vi.fn(), hasMore: false,
      loadMore: vi.fn(), selectConversation: vi.fn(), deleteConversation: vi.fn().mockResolvedValue(true),
      renameConversation: vi.fn(), startNewChat: vi.fn(),
    }, activeId: null, thread, isStreaming: false, identity: "retire-actor", admitted: true, scopeVersions: new Map(), failedMoveScopeKey: null, focusComposer: vi.fn(), onSelect: vi.fn(), onNewChat: vi.fn(), onMove: vi.fn(), onDeleteConfirmed: vi.fn() },
  }
  const frame = (admitted: boolean) => <ThemeProvider><LocaleProvider><WorkspaceRail {...props} conversationReads={{ ...props.conversationReads!, admitted }} /></LocaleProvider></ThemeProvider>
  return { props, frame }
}

it.each(["folder", "delete"] as const)("R254 同主体撤准入后%s意图真正退役，恢复不复活旧展开或删除确认", async (kind) => {
  const { frame, props } = retirementRailFixture()
  const view = render(frame(true))
  const folder = document.querySelector('[data-project-id="P"]') as HTMLElement
  const toggle = folder.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  fireEvent.click(toggle)
  await within(folder).findByRole("button", { name: "会话P" })
  if (kind === "delete") {
    fireEvent.click(within(folder).getByRole("button", { name: "删除会话 会话P" }))
    await screen.findByRole("alertdialog")
  }
  view.rerender(frame(false))
  expect(screen.queryByRole("alertdialog")).toBeNull()
  view.rerender(frame(true))
  if (kind === "delete") expect(screen.queryByRole("alertdialog")).toBeNull()
  else expect(document.querySelector('[data-project-id="P"] button[aria-expanded]')).toHaveAttribute("aria-expanded", "false")
  expect(props.onDeleteConversation).not.toHaveBeenCalled()
})

it("R254 重名文件夹disclosure有独立可辨动作名，键盘Enter/Space只展开对应ID且概览Link不改", async () => {
  const { frame } = retirementRailFixture()
  render(frame(true))
  window.history.replaceState({}, "", "/app")
  const before = window.location.href
  const p = document.querySelector('[data-project-id="P"]') as HTMLElement
  const q = document.querySelector('[data-project-id="Q"]') as HTMLElement
  const pToggle = p.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  const qToggle = q.querySelector<HTMLButtonElement>('button[aria-expanded]')!
  expect(pToggle).toHaveAccessibleName(/展开.*同名专案/u)
  expect(qToggle).toHaveAccessibleName(/展开.*同名专案/u)
  expect(pToggle.getAttribute("aria-label")).not.toBe(qToggle.getAttribute("aria-label"))
  expect(pToggle.getAttribute("aria-controls")).not.toBe(qToggle.getAttribute("aria-controls"))
  expect(within(p).getByRole("link", { name: "同名专案" })).toHaveAttribute("href", "/app/project/P")
  expect(within(q).getByRole("link", { name: "同名专案" })).toHaveAttribute("href", "/app/project/Q")
  // Native buttons emit a keyboard click. jsdom has no default key activation;
  // dispatch that click after the key events, without calling any controller.
  pToggle.focus()
  fireEvent.keyDown(pToggle, { key: "Enter" })
  fireEvent.click(pToggle, { detail: 0 })
  expect(pToggle).toHaveAttribute("aria-expanded", "true")
  expect(qToggle).toHaveAttribute("aria-expanded", "false")
  await within(p).findByRole("button", { name: "会话P" })
  qToggle.focus()
  fireEvent.keyDown(qToggle, { key: " " })
  fireEvent.keyUp(qToggle, { key: " " })
  fireEvent.click(qToggle, { detail: 0 })
  await within(q).findByRole("button", { name: "会话Q" })
  expect(pToggle).toHaveAttribute("aria-expanded", "true")
  expect(qToggle).toHaveAttribute("aria-expanded", "true")
  expect(window.location.href).toBe(before)
})

// R255 native account projection shares the published personal Credit reader.
it.each([false, true])("账户菜单精确显示 available 且不虚构免费套餐（读取失败=%s）", async (failed) => {
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({
    summary: failed ? vi.fn().mockRejectedValue(new Error("billing_unavailable")) : vi.fn().mockResolvedValue({ credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "9007199254740993", held_micros: "500000" }),
    ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-credit-owner")
  renderRail({ readBoundary: { admitted: true, subject: "r255-credit-owner", generation: 1 } })
  const account = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  fireEvent.pointerDown(account, { button: 0 })
  fireEvent.click(account)
  const menu = await screen.findByRole("menu")
  await waitFor(() => expect(menu).toHaveTextContent(failed ? "—" : "9007199254.740993"))
  expect(within(menu).queryByText("免费", { exact: true })).toBeNull()
  expect(within(menu).getByRole("button", { name: "升级" })).toBeInTheDocument()
})

function r255DeferredAccount() {
  let resolve!: (value: { credit_account_id: string; status: "active"; available_micros: string; held_micros: string }) => void
  const promise = new Promise<{ credit_account_id: string; status: "active"; available_micros: string; held_micros: string }>((done) => { resolve = done })
  return { promise, resolve }
}
const r255AccountValue = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active" as const, available_micros: "42000000", held_micros: "0" }
function r255AccountElement(readBoundary: ProjectReadBoundary) {
  return <ThemeProvider><LocaleProvider><WorkspaceRailAccount compactDesktop={false} onOpenSettings={() => {}} readBoundary={readBoundary} /></LocaleProvider></ThemeProvider>
}
async function r255OpenAccountMenu() {
  const button = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  fireEvent.pointerDown(button, { button: 0 })
  fireEvent.click(button)
  return screen.findByRole("menu")
}
it("账户余额主体切换先撤旧值，旧读取迟到不覆盖B且取消原读取", async () => {
  const late = r255DeferredAccount()
  const fresh = r255DeferredAccount()
  const signals: (AbortSignal | undefined)[] = []
  const summary = vi.fn((signal?: AbortSignal) => { signals.push(signal); return signals.length === 1 ? late.promise : fresh.promise })
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({ summary, ledger: vi.fn() })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-A")
  const view = render(r255AccountElement({ admitted: true, subject: "r255-A", generation: 1 }))
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(1))
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-B")
  view.rerender(r255AccountElement({ admitted: true, subject: "r255-B", generation: 2 }))
  await act(async () => { late.resolve(r255AccountValue); await Promise.resolve() })
  expect(menu).not.toHaveTextContent("42")
  expect(signals[0]?.aborted).toBe(true)
  expect(summary).toHaveBeenCalledTimes(2)
  await act(async () => { fresh.resolve({ ...r255AccountValue, available_micros: "7000000" }); await Promise.resolve() })
  expect(menu).toHaveTextContent("7")
})
it("账户准入marker撤回时立即隐藏旧余额而不读取未知主体", async () => {
  const readmit = r255DeferredAccount()
  const summary = vi.fn().mockResolvedValueOnce(r255AccountValue).mockImplementationOnce(() => readmit.promise)
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({ summary, ledger: vi.fn() })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-A")
  const view = render(r255AccountElement({ admitted: true, subject: "r255-A", generation: 1 }))
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(menu).toHaveTextContent("42"))
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
  view.rerender(r255AccountElement({ admitted: true, subject: "r255-A", generation: 1 }))
  await act(async () => { await Promise.resolve() })
  expect(menu).not.toHaveTextContent("42")
  expect(menu).toHaveTextContent("—")
  expect(summary).toHaveBeenCalledTimes(1)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-A")
  view.rerender(r255AccountElement({ admitted: true, subject: "r255-A", generation: 1 }))
  expect(menu).not.toHaveTextContent("42")
  expect(summary).toHaveBeenCalledTimes(2)
  await act(async () => { readmit.resolve({ ...r255AccountValue, available_micros: "7000000" }); await Promise.resolve() })
  expect(menu).toHaveTextContent("7")
})
it("账户卸载真正abort且迟到completion不进入后续菜单", async () => {
  const late = r255DeferredAccount()
  let signal: AbortSignal | undefined
  const summary = vi.fn((value?: AbortSignal) => { signal = value; return late.promise })
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({ summary, ledger: vi.fn() })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-A")
  const view = render(r255AccountElement({ admitted: true, subject: "r255-A", generation: 1 }))
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(1))
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => { late.resolve(r255AccountValue); await Promise.resolve() })
  expect(screen.queryByRole("menu")).toBeNull()
})


it("R255 稳定主体重核时隐藏私有分支，恢复后保留P/Q展开且Direct常驻", async () => {
  const { props } = retirementRailFixture()
  const frame = (admitted: boolean, generation: number) => {
    const conversationReads = { ...props.conversationReads!, identity: `actor-A:gen${generation}`, admitted, folderIntentIdentity: "actor-A" }
    return <ThemeProvider><LocaleProvider><WorkspaceRail {...props} conversationReads={conversationReads} /></LocaleProvider></ThemeProvider>
  }
  const view = render(frame(true, 1))
  expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()
  for (const id of ["P", "Q"]) {
    const toggle = document.querySelector<HTMLButtonElement>(`[data-project-id="${id}"] button[aria-expanded]`)
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle!)
    await screen.findByRole("button", { name: `会话${id}` })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  }

  view.rerender(frame(false, 2))
  expect(document.querySelectorAll('[data-conversation-list="project-conversation"]')).toHaveLength(0)
  expect(screen.queryByRole("button", { name: "会话P" })).toBeNull()
  expect(screen.queryByRole("button", { name: "会话Q" })).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()

  view.rerender(frame(true, 2))
  for (const id of ["P", "Q"]) {
    expect(document.querySelector(`[data-project-id="${id}"] button[aria-expanded]`)).toHaveAttribute("aria-expanded", "true")
    await screen.findByRole("button", { name: `会话${id}` })
  }
  expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()
  expect(props.onDeleteConversation).not.toHaveBeenCalled()
})

it.each(["actor-B", null])("R255 展开意图遇主体%s再回A不复活旧P/Q分支", async (nextActor) => {
  const { props } = retirementRailFixture()
  const frame = (actor: string | null, generation: number, admitted: boolean) => {
    const conversationReads = { ...props.conversationReads!, identity: `${actor ?? "unknown"}:gen${generation}`, admitted, folderIntentIdentity: actor }
    return <ThemeProvider><LocaleProvider><WorkspaceRail {...props} conversationReads={conversationReads} /></LocaleProvider></ThemeProvider>
  }
  const view = render(frame("actor-A", 1, true))
  for (const id of ["P", "Q"]) {
    const toggle = document.querySelector<HTMLButtonElement>(`[data-project-id="${id}"] button[aria-expanded]`)
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle!)
    await screen.findByRole("button", { name: `会话${id}` })
  }
  view.rerender(frame(nextActor, 2, nextActor !== null))
  expect(document.querySelectorAll('[data-conversation-list="project-conversation"]')).toHaveLength(0)
  expect(screen.queryByRole("button", { name: "会话P" })).toBeNull()
  expect(screen.queryByRole("button", { name: "会话Q" })).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()

  view.rerender(frame("actor-A", 3, true))
  for (const id of ["P", "Q"]) {
    expect(document.querySelector(`[data-project-id="${id}"] button[aria-expanded]`)).toHaveAttribute("aria-expanded", "false")
  }
  await act(async () => { await Promise.resolve() })
  expect(document.querySelectorAll('[data-conversation-list="project-conversation"]')).toHaveLength(0)
  expect(screen.queryByRole("button", { name: "会话P" })).toBeNull()
  expect(screen.queryByRole("button", { name: "会话Q" })).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()
  expect(props.onDeleteConversation).not.toHaveBeenCalled()
})

it("ordinary account capability read uses its own exact endpoint and exposes no Admin entry", async () => {
  renderProjectFolderRail()
  await waitFor(() => expect(adminAccessFetch).toHaveBeenCalled())
  for (const [input, init] of adminAccessFetch.mock.calls) {
    expect(input).toBe("/api/admin-access")
    expect(init).toEqual(expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }))
  }
  const account = screen.getByRole("button", { name: /个人工作区|用户范围/ })
  fireEvent.pointerDown(account, { button: 0 })
  fireEvent.click(account)
  await screen.findByRole("menu")
  expect(screen.queryByRole("menuitem", { name: /后台管理/ })).toBeNull()
  expect(document.querySelector('a[href="/manage"]')).toBeNull()
})

// SET29: trusted rail balance lifecycle
function set29Account(readBoundary?: ProjectReadBoundary, preview = false) {
  return <ThemeProvider><LocaleProvider><WorkspaceRailAccount compactDesktop={false} onOpenSettings={() => {}} preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} /></LocaleProvider></ThemeProvider>
}
function set29Summary() {
  const summary = vi.fn().mockResolvedValue(r255AccountValue)
  const client = vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({ summary, ledger: vi.fn() })
  return { summary, client }
}
const set29A = { admitted: true, subject: "set29-A", generation: 1 }
it("SET29 same-subject withdrawal synchronously hides 42 and reads zero until readmitted", async () => {
  const { summary } = set29Summary()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-A")
  const view = render(set29Account(set29A))
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(menu).toHaveTextContent("42"))
  view.rerender(set29Account({ ...set29A, admitted: false, generation: 2 }))
  expect(menu).not.toHaveTextContent("42")
  expect(menu).toHaveTextContent("—")
  await act(async () => { await Promise.resolve() })
  expect(summary).toHaveBeenCalledTimes(1)
  summary.mockResolvedValue({ ...r255AccountValue, available_micros: "7000000" })
  view.rerender(set29Account({ ...set29A, generation: 2 }))
  expect(menu).not.toHaveTextContent("42")
  await waitFor(() => expect(menu).toHaveTextContent("7"))
  expect(summary).toHaveBeenCalledTimes(2)
})
it("SET29 pending same-subject generation retires signal and ignores late result before new 7", async () => {
  const late = r255DeferredAccount()
  const fresh = r255DeferredAccount()
  const signals: (AbortSignal | undefined)[] = []
  const summary = vi.fn((signal?: AbortSignal) => { signals.push(signal); return signals.length === 1 ? late.promise : fresh.promise })
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({ summary, ledger: vi.fn() })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-A")
  const view = render(set29Account(set29A))
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(1))
  view.rerender(set29Account({ ...set29A, admitted: false, generation: 2 }))
  expect(signals[0]?.aborted).toBe(true)
  expect(summary).toHaveBeenCalledTimes(1)
  await act(async () => { late.resolve(r255AccountValue); await Promise.resolve() })
  expect(menu).not.toHaveTextContent("42")
  view.rerender(set29Account({ ...set29A, generation: 2 }))
  expect(summary).toHaveBeenCalledTimes(2)
  await act(async () => { fresh.resolve({ ...r255AccountValue, available_micros: "7000000" }); await Promise.resolve() })
  expect(menu).toHaveTextContent("7")
})
it("SET29 A-B-A does not revive the original ready tuple or B late completion", async () => {
  const pendingB = r255DeferredAccount()
  const newA = r255DeferredAccount()
  const summary = vi.fn().mockResolvedValueOnce(r255AccountValue).mockImplementationOnce(() => pendingB.promise).mockImplementationOnce(() => newA.promise)
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({ summary, ledger: vi.fn() })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-A")
  const view = render(set29Account(set29A))
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(menu).toHaveTextContent("42"))
  // The marker is unchanged: mismatched B may not use it as admission authority.
  view.rerender(set29Account({ admitted: true, subject: "set29-B", generation: 2 }))
  expect(menu).not.toHaveTextContent("42")
  expect(summary).toHaveBeenCalledTimes(1)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-B")
  view.rerender(set29Account({ admitted: true, subject: "set29-B", generation: 2 }))
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(2))
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-A")
  view.rerender(set29Account(set29A))
  expect(menu).not.toHaveTextContent("42")
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(3))
  await act(async () => { pendingB.resolve({ ...r255AccountValue, available_micros: "99000000" }); await Promise.resolve() })
  expect(menu).not.toHaveTextContent("99")
  await act(async () => { newA.resolve({ ...r255AccountValue, available_micros: "7000000" }); await Promise.resolve() })
  expect(menu).toHaveTextContent("7")
})
it.each([
  ["missing boundary", undefined],
  ["not admitted", { ...set29A, admitted: false }],
  ["null subject", { ...set29A, subject: null }],
  ["empty subject", { ...set29A, subject: "" }],
  ["blank subject", { ...set29A, subject: "   " }],
  ["negative generation", { ...set29A, generation: -1 }],
  ["fractional generation", { ...set29A, generation: 1.5 }],
  ["unsafe generation", { ...set29A, generation: Number.MAX_SAFE_INTEGER + 1 }],
  ["nonfinite generation", { ...set29A, generation: Number.NaN }],
] as const)("SET29 %s reads no summary despite a marker", async (_label, boundary) => {
  const { summary } = set29Summary()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-A")
  render(set29Account(boundary))
  await act(async () => { await Promise.resolve() })
  expect(summary).not.toHaveBeenCalled()
  const menu = await r255OpenAccountMenu()
  expect(menu).toHaveTextContent("—")
  expect(menu).not.toHaveTextContent("42")
})
it.each(["missing", "mismatch", "failure"])("SET29 marker %s cannot authorize a trusted live boundary", async (kind) => {
  const { summary } = set29Summary()
  if (kind === "mismatch") window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-B")
  if (kind === "failure") {
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === "kokoro.web.auth-index-subject") throw new Error("storage unavailable")
      return getItem.call(this, key)
    })
  }
  render(set29Account(set29A))
  await act(async () => { await Promise.resolve() })
  expect(summary).not.toHaveBeenCalled()
  const menu = await r255OpenAccountMenu()
  expect(menu).toHaveTextContent("—")
})
it("SET29 actual rail shell forwards trusted balance admission and retires it", async () => {
  const { summary } = set29Summary()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "set29-A")
  const { rerender } = renderRail({ readBoundary: set29A })
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(menu).toHaveTextContent("42"))
  const frame = (readBoundary: ProjectReadBoundary) => <ThemeProvider><LocaleProvider><WorkspaceRail collapsed={false} onToggleCollapse={() => {}} onNewChat={() => {}} chatHref="/app" conversations={[]} activeId={null} awaitingIds={new Set()} onSelectConversation={() => {}} onDeleteConversation={async () => true} onRenameConversation={() => {}} onOpenSettings={() => {}} listLoading={false} listError={false} hasMore={false} onLoadMore={() => {}} readBoundary={readBoundary} /></LocaleProvider></ThemeProvider>
  rerender(frame({ ...set29A, admitted: false, generation: 2 }))
  expect(menu).not.toHaveTextContent("42")
  await act(async () => { await Promise.resolve() })
  expect(summary).toHaveBeenCalledTimes(1)
})
it("SET29 preview keeps the published preview balance path without a live boundary or marker", async () => {
  const { summary, client } = set29Summary()
  render(set29Account(undefined, true))
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(menu).toHaveTextContent("42"))
  expect(client).toHaveBeenCalledWith({ preview: true })
  expect(summary).toHaveBeenCalledTimes(1)
})
