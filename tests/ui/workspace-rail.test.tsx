// 侧栏会话重命名内联编辑（CONV-UX）：双击/✎ 进入编辑，Enter 提交、Escape 取消、空题与未改动不上抛。

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { WorkspaceRailAccount } from "@/components/blocks/workspace-rail/workspace-rail-account"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import railStyles from "@/components/blocks/workspace-rail/workspace-rail.module.css"
import type { ConversationSummary } from "@/ui/rail/rail-search"
import * as pageClients from "@/ui/shell/page-clients"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { act, useState } from "react"

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

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(window.history.state, "", "/")
})

it("默认桌面导航不展示未接入能力的占位入口", () => {
  renderRail()

  expect(screen.queryByRole("button", { name: "Agent" })).toBeNull()
  expect(screen.queryByRole("button", { name: "外挂" })).toBeNull()
  expect(screen.queryByRole("button", { name: "已排程" })).toBeNull()
  expect(screen.queryByRole("button", { name: "资料库" })).toBeNull()
  expect(screen.queryByRole("button", { name: /创建项目/ })).toBeNull()
})

it("项目标题旁的加号打开创建表单，不导航、不新建聊天或收起侧栏", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }))
  expect(await screen.findByRole("dialog", { name: "创建项目" })).toBeInTheDocument()
  expect(window.location.href).toBe(before)
  expect(onNewChat).not.toHaveBeenCalled()
  expect(onToggleCollapse).not.toHaveBeenCalled()
  expect(onCreateProject).not.toHaveBeenCalled()
})

it("R170只把owner确认且非当前scope的目的地放入会话Move菜单", async () => {
  const onMoveConversation = vi.fn()
  const conversationId = "conv_11111111-1111-4111-8111-111111111111"
  const currentProject = "project_22222222-2222-4222-8222-222222222222"
  const targetProject = "project_33333333-3333-4333-8333-333333333333"
  renderRail({
    projects: [
      { id: currentProject, name: "当前项目", href: `/app/project/${currentProject}`, active: true },
      { id: targetProject, name: "目标项目", href: `/app/project/${targetProject}` },
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
  expect(within(menu).getByRole("menuitem", { name: "目标项目" })).toBeEnabled()
  expect(within(menu).queryByRole("menuitem", { name: "当前项目" })).toBeNull()
  fireEvent.click(within(menu).getByRole("menuitem", { name: "目标项目" }))
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

it("项目清单和任务清单分别支持键盘排序，不会互相移动", () => {
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
  const expandedBeforeSort = project.getAttribute("aria-expanded")
  project.focus()
  fireEvent.keyDown(project, { key: " " })
  fireEvent.keyDown(project, { key: "ArrowDown" })
  fireEvent.keyDown(project, { key: " " })
  expect(onReorderProjects).toHaveBeenCalledWith(["project_b", "project_a"])
  expect(project.getAttribute("aria-expanded")).toBe(expandedBeforeSort)
  expect(onReorderConversations).not.toHaveBeenCalled()

  const task = screen.getByRole("button", { name: "第一个任务" })
  task.focus()
  fireEvent.keyDown(task, { key: " " })
  fireEvent.keyDown(task, { key: "ArrowDown" })
  expect(onReorderConversations).toHaveBeenCalledWith(["task_b", "task_a"])
})

it("桌面 Rail 暂不呈现独立的邀请朋友推广入口", () => {
  renderRail({ brandName: "Kokoro" })

  expect(screen.queryByRole("button", { name: "邀请朋友使用 Kokoro" })).toBeNull()
})

it("桌面 Rail 的紧凑样式由实际 rail 模式标记驱动", () => {
  renderRail({ brandName: "Kokoro" })

  const rail = document.querySelector('[data-collapsed="false"]')
  expect(rail).toHaveAttribute("data-desktop-rail", "true")
  expect(rail).toHaveAttribute("data-desktop-web", "true")
})

it("默认品牌使用中性产品标记，不回退到旧手掌或心字符", () => {
  renderRail({ brandName: "Kokoro", brandMark: "心" })

  expect(document.querySelector(".lucide-audio-waveform")).toBeInTheDocument()
  expect(document.querySelector(".lucide-hand")).toBeNull()
  expect(screen.queryByText("心")).toBeNull()
})

it("直接会话桌面页保持任务语义，不被渲染为项目任务", () => {
  renderRail({
    projectHref: "/app/project/kokoro",
    projectActive: false,
    conversations: [{ id: "chat_direct_1", title: "整理本周计划" }],
    activeId: "chat_direct_1",
  })

  expect(screen.getByTestId("rail-new-conversation")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/app")
  const chats = screen.getByRole("navigation", { name: "直接会话" })
  expect(chats).toHaveAttribute("data-conversation-list", "direct")
  expect(within(chats).queryByText("项目会话")).toBeNull()
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
  expect(within(chats).getByText("还没有直接会话")).toBeInTheDocument()
  expect(within(chats).queryByText("项目会话")).toBeNull()
})

it("活动项目在侧栏展开其 own scope 的会话，不与直接任务混合", async () => {
  const projectId = "project_22222222-2222-4222-8222-222222222222"
  const selectProjectConversation = vi.fn()
  const listSessions = vi.fn()
  const directFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("project_ref=")) listSessions(url)
    return Response.json({ sessions: [], next_cursor: null })
  })
  vi.stubGlobal("fetch", directFetch)
  renderRail({
    projects: [{ id: projectId, name: "产品规划", href: `/app/project/${projectId}`, active: true }],
    projectHref: `/app/project/${projectId}`,
    projectActive: true,
    conversations: [],
    conversationReads: {
      scope: { kind: "project", projectRef: projectId },
      read: (scope) => ({
        conversations: scope.kind === "project" ? [{ id: "conv_project_1", title: "项目内会话" }] : [],
        loading: false, loadingMore: false, error: false, hasMore: false,
        refresh: () => {}, loadMore: () => {},
        deleteConversation: async () => true, renameConversation: () => {},
      }),
      ensureScope: () => {}, activeId: "conv_project_1",
      identity: "reader-a", admitted: true, failedMoveScopeKey: null,
      onSelect: selectProjectConversation, onNewChat: () => {}, onMove: () => {},
    },
  })

  const projectConversations = await screen.findByRole("navigation", { name: "项目会话" })
  expect(within(projectConversations).getByRole("button", { name: "项目内会话" })).toBeInTheDocument()
  expect(within(screen.getByRole("navigation", { name: "直接会话" })).queryByText("项目内会话")).toBeNull()
  expect(listSessions).not.toHaveBeenCalled()

  fireEvent.click(within(projectConversations).getByRole("button", { name: "项目内会话" }))
  expect(selectProjectConversation).toHaveBeenCalledWith({ kind: "project", projectRef: projectId }, "conv_project_1")
})

it("已准入但 reader 尚未注册时显示加载态，不误报不可用", () => {
  renderRail({
    conversationReads: {
      scope: { kind: "direct" }, identity: "pending-reader", admitted: true,
      read: () => undefined, ensureScope: () => {}, activeId: null, failedMoveScopeKey: null,
      onSelect: () => {}, onNewChat: () => {}, onMove: () => {},
    },
  })
  const direct = within(screen.getByRole("navigation", { name: "直接会话" }))
  expect(direct.getByRole("status", { name: "正在加载会话…" })).toBeVisible()
  expect(direct.queryByText("不可用")).toBeNull()
})

it("收起态不复制直接会话或孤立项目会话 stop，并保留项目与底部账户锚点", () => {
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

it("展开态账户卡左对齐，通知动作保留在同一行", () => {
  renderRail({ brandName: "Kokoro" })

  const rail = document.querySelector('[data-desktop-rail="true"][data-collapsed="false"]')
  const account = screen.getByTestId("rail-utility-account")
  const accountStatus = rail?.querySelector(`.${railStyles.accountStatus}`)
  expect(account).toHaveTextContent("Kokoro")
  expect(accountStatus?.querySelector('[data-testid="rail-utility-device"]')).toBeNull()
  expect(accountStatus?.querySelector('[data-testid="rail-utility-notifications"]')).toBeInTheDocument()
})

it("更多保留技能导航与个性化设置，明确电脑能力未开放", () => {
  const { onOpenSettings } = renderRail({ navigation: [{ key: "skills", label: "技能" }] })
  fireEvent.pointerDown(screen.getByTestId("rail-more"))
  expect(screen.getByRole("menuitem", { name: /Computer Use/ })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("menuitem", { name: "技能" })).toHaveAttribute("href", "/app/skills")
  fireEvent.click(screen.getByRole("menuitem", { name: "个性化" }))
  expect(onOpenSettings).toHaveBeenCalledWith("personalization")
})

it("已接入排程从自动化主入口访问，不再挤入更多菜单", () => {
  renderRail({ navigation: [{ key: "skills", label: "技能" }, { key: "scheduled", label: "已排程" }], activeNavigationKey: "scheduled" })
  const automation = screen.getByRole("link", { name: "自动化" })
  expect(automation).toHaveAttribute("href", "/app/scheduled?tab=calendar")
  expect(automation).toHaveAttribute("aria-current", "page")
  expect(screen.getByTestId("rail-more")).not.toHaveAttribute("aria-current")
  fireEvent.pointerDown(screen.getByTestId("rail-more"))
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Computer Use", "技能", "个性化"])
  fireEvent.keyDown(screen.getByRole("menu", { name: "更多" }), { key: "Escape" })
  fireEvent.click(automation)
  expect(window.location.pathname + window.location.search).toBe("/app/scheduled?tab=calendar")
})

it("排程被运行配置关闭时自动化明确不可用，不暴露可点击替代入口", () => {
  renderRail({ navigation: [{ key: "skills", label: "技能" }, { key: "scheduled", label: "已排程", featureFlag: "scheduler" }], featureFlags: [{ key: "scheduler", enabled: false }] })
  expect(screen.getByRole("button", { name: "自动化" })).toBeDisabled()
  expect(screen.queryByRole("link", { name: "自动化" })).toBeNull()
  fireEvent.pointerDown(screen.getByTestId("rail-more"))
  expect(screen.queryByRole("menuitem", { name: "已排程" })).toBeNull()
})

it("更多的站内导航提交后关闭菜单，不残留在目标页面上", () => {
  renderRail({ navigation: [{ key: "skills", label: "技能" }] })
  fireEvent.pointerDown(screen.getByTestId("rail-more"))
  fireEvent.click(screen.getByRole("menuitem", { name: "技能" }))
  expect(screen.queryByRole("menu", { name: "更多" })).toBeNull()
})

it("Manus 紧凑 rail 保留一级入口，并把次级页面收进更多菜单", () => {
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
  for (const key of ["agent", "mcp", "library", "more"]) {
    expect(screen.getByTestId(`rail-${key}`)).toBeInTheDocument()
  }
  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
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

  expect(screen.getByRole("button", { name: "新建任务" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Agent" })).toHaveAttribute("href", "/app/agents")
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
  const search = await screen.findByRole("button", { name: "搜索会话" })
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
      { key: "mcp", label: "外挂" },
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
            { key: "mcp", label: "外挂" },
          ]}
          activeNavigationKey="mcp"
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
  expect(screen.getByTestId("rail-mcp").closest('[data-slot="sidebar-menu"]')).toBe(workbenchMenu)

  fireEvent.pointerMove(screen.getByTestId("rail-mcp"), { pointerType: "mouse" })
  expect(await screen.findByRole("tooltip")).toHaveTextContent("外挂")
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
  await waitFor(() => expect(screen.getByTestId("rail-new-conversation")).toHaveFocus())
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

it("runtime manifest 的一级页面与连接器入口使用各自导航语义", () => {
  const { onOpenSettings, onOpenNotifications } = renderRail({
    navigation: [
      { key: "library", label: "作品" },
      { key: "mcp", label: "连接" },
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
})

it("Agent 一级入口导航到独立页面，不再回落为新建聊天", () => {
  const onNewChat = vi.fn()
  renderRail({
    navigation: [
      { key: "agent", label: "Agent" },
    ],
    activeNavigationKey: "agent",
    onNewChat,
  })

  const agent = screen.getByTestId("rail-agent")
  expect(agent).toHaveAttribute("href", "/app/agents")
  expect(agent).toHaveAttribute("data-active", "true")
  expect(agent.querySelector("svg.lucide-message-square-more")).toBeInTheDocument()
  fireEvent.click(agent)
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
  expect(screen.getByTestId("rail-new-conversation")).toHaveAttribute("type", "button")
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

it("侧栏初始读取保留无文字骨架，并向辅助技术暴露状态", () => {
  renderRail({
    conversations: [],
    listLoading: true,
    projectHref: "/app/project/alpha",
    projectListStatus: "loading",
  })

  const conversationsLoading = screen.getByRole("status", { name: "正在加载会话…" })
  const projectsLoading = screen.getByRole("status", { name: "正在加载项目…" })
  expect(conversationsLoading).not.toHaveTextContent("正在加载会话…")
  expect(projectsLoading).not.toHaveTextContent("正在加载项目…")
  expect(conversationsLoading.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  expect(projectsLoading.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)

  cleanup()
  renderRail({ conversations: [], listError: true, onRetryList: vi.fn() })
  expect(screen.getByRole("alert")).toHaveTextContent("会话列表加载失败")
})

it("收起侧栏的新建项目只打开创建表单，不把菜单事件当草稿", async () => {
  const onCreateProject = vi.fn()
  renderRail({ collapsed: true, onCreateProject })
  const picker = screen.getByTestId("rail-project")
  fireEvent.pointerDown(picker, { button: 0 })
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建项目" }))
  expect(await screen.findByRole("dialog", { name: "创建项目" })).toBeInTheDocument()
  expect(onCreateProject).not.toHaveBeenCalled()
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
  const project = screen.getByRole("link", { name: "新对话 · 独立项目名称" })
  expect(project).toHaveAttribute("href", "/app/project/canonical-project")
  expect(project.closest("[data-project-id]")).toHaveAttribute("data-project-id", "canonical-project")
  expect(document.querySelector('[data-project-list] a[aria-label="新会话标题"]')).toBeNull()
})

it("项目整行只展开任务，快捷入口进项目，重命名独立在菜单", async () => {
  const onRequestProjectRename = vi.fn()
  const ensureScope = vi.fn()
  let emptyProject = false
  const oldLocation = `${window.location.pathname}${window.location.search}`
  renderRail({
    projects: [{ id: "project_a", name: "产品规划", href: "/app/project/project_a" }],
    projectListStatus: "ready", onRequestProjectRename,
    conversationReads: {
      scope: { kind: "direct" }, identity: "project-controls", admitted: true,
      ensureScope, activeId: null, failedMoveScopeKey: null,
      read: (scope) => ({
        conversations: scope.kind === "project" && !emptyProject ? [{ id: "conv-a", title: "项目内任务" }] : [],
        loading: false, loadingMore: false, error: false, hasMore: false,
        refresh: () => {}, loadMore: () => {}, deleteConversation: async () => true, renameConversation: () => {},
      }),
      onSelect: () => {}, onNewChat: () => {}, onMove: () => {},
    },
  })
  const row = screen.getByRole("button", { name: "产品规划" })
  expect(row).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(row)
  expect(row).toHaveAttribute("aria-expanded", "true")
  expect(await screen.findByRole("button", { name: "项目内任务" })).toBeVisible()
  expect(`${window.location.pathname}${window.location.search}`).toBe(oldLocation)
  expect(onRequestProjectRename).not.toHaveBeenCalled()
  fireEvent.click(row)
  expect(row).toHaveAttribute("aria-expanded", "false")
  expect(screen.queryByRole("button", { name: "项目内任务" })).toBeNull()
  emptyProject = true
  fireEvent.click(row)
  expect(within(screen.getByRole("navigation", { name: "项目会话" })).getByRole("status")).toHaveTextContent("暂无任务")
  const compose = screen.getByRole("link", { name: "新对话 · 产品规划" })
  expect(compose).toHaveAttribute("href", "/app/project/project_a")
  try {
    fireEvent.click(compose)
    expect(window.location.pathname).toBe("/app/project/project_a")
    expect(window.location.search).toBe("")
    expect(onRequestProjectRename).not.toHaveBeenCalled()
  } finally { window.history.replaceState({}, "", oldLocation) }
  const controls = within(row.closest("[data-project-id]") as HTMLElement)
  fireEvent.pointerDown(controls.getByRole("button", { name: "项目选项" }), { button: 0 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "重命名项目" }))
  expect(onRequestProjectRename).toHaveBeenCalledExactlyOnceWith("project_a")
})

it("项目菜单的重命名动作交给路由 owner，不制造本地副本", async () => {
  const onRequestProjectRename = vi.fn()
  renderRail({
    projects: [{ id: "project_a", name: "独立项目名称", href: "/app/project/project_a" }],
    projectListStatus: "ready",
    onRequestProjectRename,
  })

  const projectRow = screen.getByRole("button", { name: "独立项目名称" }).closest("[data-project-id]") as HTMLElement
  fireEvent.pointerDown(within(projectRow).getByRole("button", { name: "项目选项" }), { button: 0 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "重命名项目" }))
  expect(onRequestProjectRename).toHaveBeenCalledExactlyOnceWith("project_a")
})

it("无 scoped reader 仍保持整行展开语义，只展示不可用而不借用直接任务", () => {
  renderRail({
    projects: [{ id: "project_a", name: "独立项目名称", href: "/app/project/project_a", active: true }],
    projectListStatus: "ready",
    projectHref: "/app/project/project_a",
    projectActive: true,
    conversations: [],
    activeId: null,
  })

  const project = screen.getByRole("link", { name: "新对话 · 独立项目名称" })
  const projectRow = project.closest("[data-project-id]")
  const disclosure = within(projectRow as HTMLElement).getByRole("button", { name: "独立项目名称" })
  expect(disclosure).toHaveAttribute("aria-expanded", "true")
  expect(within(document.getElementById(disclosure.getAttribute("aria-controls")!)!).getByRole("status")).toHaveTextContent("不可用")
  fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute("aria-expanded", "false")
  expect(projectRow?.querySelector('[data-conversation-list]')).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()
})

it("正式 rail 只有当前路由而无集合时不造通用项目；显式 preview 仍独立", () => {
  renderRail({ projectHref: "/app/project/deep-link", preview: false })
  expect(document.querySelector('[data-project-list] [data-project-id]')).toBeNull()
  cleanup()
  renderRail({ projectHref: "/app/project/preview-project", preview: true })
  expect(screen.getByRole("link", { name: "新对话 · 当前项目" })).toHaveAttribute("href", "/app/project/preview-project")
})

it("R254 项目展开和快捷概览入口都不替换普通持久会话分区", () => {
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
  expect(screen.getByRole("link", { name: "新对话 · 产品规划" })).toHaveAttribute("href", "/app/project/project_a")
  expect(screen.queryByRole("navigation", { name: "项目会话" })).not.toBeInTheDocument()
})


it.each([false, true])("账户菜单精确显示 available 且不虚构免费套餐（读取失败=%s）", async (failed) => {
  vi.spyOn(pageClients, "browserBillingClient").mockReturnValue({
    summary: failed ? vi.fn().mockRejectedValue(new Error("billing_unavailable")) : vi.fn().mockResolvedValue({ credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "9007199254740993", held_micros: "500000" }),
    ledger: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-credit-owner")
  renderRail()
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
function r255AccountElement() {
  return <ThemeProvider><LocaleProvider><WorkspaceRailAccount compactDesktop={false} onOpenSettings={() => {}} /></LocaleProvider></ThemeProvider>
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
  const view = render(r255AccountElement())
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(1))
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-B")
  view.rerender(r255AccountElement())
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
  const view = render(r255AccountElement())
  const menu = await r255OpenAccountMenu()
  await waitFor(() => expect(menu).toHaveTextContent("42"))
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
  view.rerender(r255AccountElement())
  await act(async () => { await Promise.resolve() })
  expect(menu).not.toHaveTextContent("42")
  expect(menu).toHaveTextContent("—")
  expect(summary).toHaveBeenCalledTimes(1)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "r255-A")
  view.rerender(r255AccountElement())
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
  const view = render(r255AccountElement())
  await waitFor(() => expect(summary).toHaveBeenCalledTimes(1))
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => { late.resolve(r255AccountValue); await Promise.resolve() })
  expect(screen.queryByRole("menu")).toBeNull()
})
