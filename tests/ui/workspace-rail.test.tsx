// 侧栏会话重命名内联编辑（CONV-UX）：双击/✎ 进入编辑，Enter 提交、Escape 取消、空题与未改动不上抛。

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import railStyles from "@/components/blocks/workspace-rail/workspace-rail.module.css"
import type { ConversationSummary } from "@/ui/rail/rail-search"
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
        onDeleteConversation={() => {}}
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

it("专案与任务使用独立清单，专案加号只创建专案，任务加号只创建任务", async () => {
  const onCreateProject = vi.fn()
  const onCreateTask = vi.fn()
  renderRail({
    projects: [
      { id: "project_a", name: "产品规划", href: "/app/project/product", active: true },
      { id: "project_b", name: "发布清单", href: "/app/project/release" },
    ],
    projectHref: "/app/project/product",
    projectActive: true,
    onCreateProject,
    onCreateTask,
    conversations: [{ id: "task_a", title: "整理需求" }],
  })

  const projects = document.querySelector('[data-project-list="true"]')
  expect(projects).toHaveAttribute("aria-label", "专案")
  expect(within(projects as HTMLElement).getByText("产品规划")).toBeInTheDocument()
  expect(within(projects as HTMLElement).getByText("发布清单")).toBeInTheDocument()
  expect(screen.getByRole("navigation", { name: "任务" })).toHaveAttribute("data-conversation-list", "project-conversation")
  expect(screen.getByText("整理需求")).toBeInTheDocument()

  const newProject = screen.getByRole("button", { name: "新建专案" })
  fireEvent.pointerDown(newProject, { button: 0 })
  fireEvent.click(newProject)
  fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
  fireEvent.click(screen.getByTestId("rail-new-project-task"))
  expect(onCreateProject).toHaveBeenCalledTimes(1)
  expect(onCreateTask).toHaveBeenCalledTimes(1)
})

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
  const onReorderTasks = vi.fn()
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
    onReorderTasks,
  })

  const project = screen.getByTestId("rail-project")
  project.focus()
  fireEvent.keyDown(project, { key: " " })
  fireEvent.keyDown(project, { key: "ArrowDown" })
  fireEvent.keyDown(project, { key: " " })
  expect(onReorderProjects).toHaveBeenCalledWith(["project_b", "project_a"])
  expect(onReorderTasks).not.toHaveBeenCalled()

  const task = screen.getByRole("button", { name: "第一个任务" })
  task.focus()
  fireEvent.keyDown(task, { key: " " })
  fireEvent.keyDown(task, { key: "ArrowDown" })
  expect(onReorderTasks).toHaveBeenCalledWith(["task_b", "task_a"])
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
          onDeleteConversation={() => {}}
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

  expect(screen.getByRole("button", { name: "新建任务" })).toBeInTheDocument()
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

it("收起态不复制直接会话 stop，并保留专案任务和底部账户锚点", () => {
  renderRail({
    collapsed: true,
    projectHref: "/app/project/kokoro",
    projectActive: true,
  })

  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
  expect(screen.getByTestId("rail-project")).toHaveAttribute("data-navigation-section", "project")
  expect(screen.getByTestId("rail-project-task")).toHaveAttribute("data-navigation-section", "project-task")
  expect(screen.getByTestId("rail-utility-device")).toHaveAttribute("data-rail-anchor", "utility")
  expect(screen.getByTestId("rail-utility-notifications")).toHaveAttribute("data-rail-anchor", "utility")
  expect(screen.getByTestId("rail-utility-account")).toHaveAttribute("data-rail-anchor", "account")
})

it("当前专案的任务图标创建新任务，不重复导航到当前专案", () => {
  const onNewChat = vi.fn()
  renderRail({
    projectHref: "/app/project/kokoro",
    projectActive: true,
    onNewChat,
  })

  const task = screen.getByTestId("rail-project-task")
  expect(task.querySelector("a")).toBeNull()
  fireEvent.click(task)
  expect(onNewChat).toHaveBeenCalledTimes(1)
})

it("展开态账户卡左对齐，设备与通知动作保留在同一行", () => {
  renderRail({ brandName: "Kokoro" })

  const rail = document.querySelector('[data-desktop-rail="true"][data-collapsed="false"]')
  const account = screen.getByTestId("rail-utility-account")
  const accountStatus = rail?.querySelector(`.${railStyles.accountStatus}`)

  expect(account).toHaveTextContent("Kokoro")
  expect(account).toHaveTextContent("个人工作区")
  expect(account).toHaveClass(railStyles.userTrigger)
  expect(accountStatus?.querySelector('[data-testid="rail-utility-device"]')).toBeInTheDocument()
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

  expect(screen.getByTestId("rail-new-task")).toBeInTheDocument()
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

  expect(screen.getByRole("button", { name: "新建任务" })).toBeInTheDocument()
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

  expect(screen.getByTestId("rail-new-task")).not.toHaveAttribute("data-state")
  expect(screen.getByTestId("rail-agent")).not.toHaveAttribute("data-state")
  expect(screen.getByTestId("rail-project-task")).not.toHaveAttribute("data-state")
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
      onDeleteConversation={() => {}}
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
          onDeleteConversation={() => {}}
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
        onDeleteConversation={() => {}}
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

it("专案侧栏保留直接会话入口，并以专案会话作为独立列表", () => {
  renderRail({
    projectHref: "/app/project/kokoro",
    projectActive: true,
    conversations: [],
    activeId: null,
  })

  expect(screen.getByRole("navigation", { name: "任务" })).toHaveAttribute("data-conversation-list", "project-conversation")
  expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/app")
  expect(screen.getByText("任务")).toBeInTheDocument()
  expect(screen.queryByText("没有匹配的会话")).toBeNull()
})

it("专案侧栏渲染已由专案范围筛选的会话，而不是隐藏会话列表", () => {
  renderRail({
    projectHref: "/app/project/kokoro",
    projectActive: true,
    conversations: [{ id: "task_project_1", title: "整理发布清单" }],
    activeId: "task_project_1",
  })

  const tasks = screen.getByRole("navigation", { name: "任务" })
  expect(tasks).toHaveAttribute("data-conversation-list", "project-conversation")
  expect(within(tasks).getByText("整理发布清单")).toBeInTheDocument()
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
  const onDeleteConversation = vi.fn()
  renderRail({ onDeleteConversation })
  const deleteButton = screen.getByRole("button", { name: "删除会话 旧标题" })
  deleteButton.focus()
  fireEvent.click(deleteButton)
  fireEvent.click(screen.getByRole("button", { name: "确认删除" }))

  expect(onDeleteConversation).toHaveBeenCalledWith("ses_1")
  await waitFor(() => expect(screen.getByRole("button", { name: /新建任务/ })).toHaveFocus())
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
  expect(document.querySelector('[data-slot="computer-status-icon"] circle')).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "我的电脑" }))
  expect(onOpenSettings).toHaveBeenLastCalledWith("computer")
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
  expect(screen.getByRole("button", { name: /新建任务/ })).toHaveAttribute("type", "button")
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
      onDeleteConversation={() => {}}
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
        onDeleteConversation={() => {}}
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
