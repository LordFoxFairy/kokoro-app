import { useConversationReaders } from "@/ui/shell/use-conversation-readers"
import { DIRECT_SESSION_SCOPE, type SessionScope } from "@/engine/session-scope"
import type { EngineSnapshot } from "@/engine/machine"
import type { ConversationStore } from "@/core/conversations"
import { createFakeClient, createMemoryStorage } from "../engine/fakes"
import { createSessionEngine } from "@/engine/machine"
import { createSessionClient } from "@/engine/client"
// 侧栏会话重命名内联编辑（CONV-UX）：双击/行菜单进入编辑，Enter 提交、Escape 取消、空题与未改动不上抛。

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { SidebarProvider } from "@/components/ui/sidebar"
import { WorkspaceRailAccount } from "@/components/blocks/workspace-rail/workspace-rail-account"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import railStyles from "@/components/blocks/workspace-rail/workspace-rail.module.css"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"
import type { ConversationSummary } from "@/ui/rail/rail-search"
import * as pageClients from "@/ui/shell/page-clients"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { act, useLayoutEffect, useState } from "react"

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

const EMPTY_SCOPE_VERSIONS = new Map<string,number>()
/** Real keyed readers: fixture rerenders cannot bypass admission retirement. */
function ScopedRailHarness({props,thread,scope,identity,admitted,onFolderNewChat}: {
 props:Parameters<typeof WorkspaceRail>[0];thread:EngineSnapshot["thread"];scope:SessionScope;identity:string;admitted:boolean;onFolderNewChat?:()=>void;
}) {
 const readers=useConversationReaders({engine:null,preview:false,activeId:null,thread,isStreaming:false,observeRunStatus:false,scope,scopeVersions:EMPTY_SCOPE_VERSIONS,readBoundary:{identity,admitted}})
 return <>{readers.hosts}<WorkspaceRail {...props} conversationReads={{scope,read:readers.read,ensureScope:readers.ensureScope,activeId:null,identity,admitted,failedMoveScopeKey:null,onSelect:()=>{},onNewChat:onFolderNewChat??(()=>{}),onMove:()=>{}}}/></>
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
  const props = {
      collapsed:false,onToggleCollapse:vi.fn(),conversations:[],activeId:null,awaitingIds:new Set<string>(),
      onSelectConversation:vi.fn(),onDeleteConversation:vi.fn().mockResolvedValue(true),onRenameConversation:vi.fn(),onOpenSettings:vi.fn(),
      listLoading:false,listError:false,hasMore:false,onLoadMore:vi.fn(),chatHref:"/app",
      projects: [{ id: projectRef, name: "产品规划", href: `/app/project/${projectRef}`, active: true }, { id: "project_b", name: "发布清单", href: "/app/project/project_b" }],
      projectListStatus: "ready" as const, projectHref: `/app/project/${projectRef}`, projectActive: true,
      onNewChat, ...overrides,
  }
  return {...render(<ThemeProvider><LocaleProvider><ScopedRailHarness props={props} thread={thread} scope={{kind:"project",projectRef}} identity="folder-fixture" admitted onFolderNewChat={onFolderNewChat}/></LocaleProvider></ThemeProvider>),onNewChat,onFolderNewChat,projectRef,fetchMock}
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


function retirementRailFixture() {
  const transient = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const thread = transient.getSnapshot().thread
  transient.dispose()
  const list = createSessionClient({ baseUrl: "http://s.local" })
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(list)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    const project = url.searchParams.get("project_ref")
    return Response.json({ sessions: project === null ? [] : [{ session_id: `conv_${project}`, title: `会话${project}`, updated_at: "2026-10-01T00:00:00Z" }], next_cursor: null })
  })
  const props: Parameters<typeof WorkspaceRail>[0] = {
    collapsed: false, onToggleCollapse: vi.fn(), onNewChat: vi.fn(), chatHref: "/app", conversations: [], activeId: null,
    awaitingIds: new Set(), onSelectConversation: vi.fn(), onDeleteConversation: vi.fn().mockResolvedValue(true), onRenameConversation: vi.fn(), onOpenSettings: vi.fn(), listLoading: false, listError: false, hasMore: false, onLoadMore: vi.fn(),
    projects: [{ id: "P", name: "同名专案", href: "/app/project/P" }, { id: "Q", name: "同名专案", href: "/app/project/Q" }], projectListStatus: "ready",

  }
  const frame = (admitted: boolean) => <ThemeProvider><LocaleProvider><ScopedRailHarness props={props} thread={thread} scope={DIRECT_SESSION_SCOPE} identity="retire-actor" admitted={admitted}/></LocaleProvider></ThemeProvider>
  return { props, frame, fetchMock, thread }
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

// CSS media rules may hide the opener before the independently subscribed
// provider commits its desktop tree. Keep that opener connected to reproduce
// the browser's body-focus branch, rather than assuming removal is immediate.
function renderResponsiveFocusRail() {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: query === "(width < 768px)", media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: () => false,
  }))
  const frame = (desktop: boolean, hidden = false) => <ThemeProvider><LocaleProvider>
    <SidebarProvider forceDesktop={desktop} open persistOpenState={false}>
      <button data-web-navigation-trigger="true" aria-label="Compact opener" style={{ display: hidden ? "none" : undefined }}>Open</button>
      <button aria-label="Other action">Other</button>
      <WorkspaceRail withinProvider collapsed={false} onToggleCollapse={() => {}} onNewChat={() => {}}
        chatHref="/app" conversations={[]} activeId={null} awaitingIds={new Set()}
        onSelectConversation={() => {}} onDeleteConversation={async () => true}
        onRenameConversation={async () => {}} onOpenSettings={() => {}}
        listLoading={false} listError={false} hasMore={false} onLoadMore={() => {}} />
    </SidebarProvider>
  </LocaleProvider></ThemeProvider>
  return { ...render(frame(false)), frame }
}

it("hands focus from a CSS-hidden but still connected compact opener to the desktop control", async () => {
  const view = renderResponsiveFocusRail()
  const opener = screen.getByRole("button", { name: "Compact opener" })
  act(() => { opener.focus(); opener.style.display = "none"; opener.blur() })
  expect(opener.isConnected).toBe(true)
  expect(document.body).toHaveFocus()
  view.rerender(view.frame(true, true))
  await waitFor(() => expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveFocus())
})

it.each(["blur", "other-control"] as const)("does not revive navigation ownership after an intentional %s", async choice => {
  const view = renderResponsiveFocusRail()
  const opener = screen.getByRole("button", { name: "Compact opener" })
  act(() => {
    opener.focus()
    if (choice === "other-control") screen.getByRole("button", { name: "Other action" }).focus()
    ;(document.activeElement as HTMLElement).blur()
    opener.style.display = "none"
  })
  view.rerender(view.frame(true, true))
  await waitFor(() => expect(screen.getByRole("button", { name: "收起侧栏" })).toBeVisible())
  expect(document.body).toHaveFocus()
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

  await openConversationActions()
  const move = screen.getByRole("menuitem", { name: "移动会话 旧标题" })
  move.focus()
  fireEvent.keyDown(move, { key: "ArrowRight" })
  const menu = await screen.findByRole("menu", { name: "移动会话 旧标题" })
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

    await openConversationActions()
    const move = screen.getByRole("menuitem", { name: "移动会话 旧标题" })
    move.focus()
    fireEvent.keyDown(move, { key: "ArrowRight" })
    const menu = await screen.findByRole("menu", { name: "移动会话 旧标题" })
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

it.each([true, false])("项目展开独立于当前路由，主动收起后再次进入不反弹（初始活动=%s）", (initialActive) => {
  const projectId = "project_22222222-2222-4222-8222-222222222222"
  function RouteHarness() {
    const [active, setActive] = useState(initialActive)
    return <ThemeProvider><LocaleProvider>
      <button onClick={() => setActive(false)}>前往资料库</button>
      <button onClick={() => setActive(true)}>进入项目</button>
      <WorkspaceRail collapsed={false} onToggleCollapse={() => {}} onNewChat={() => {}} chatHref="/app"
        projectActive={active} projectHref={`/app/project/${projectId}`} projectListStatus="ready"
        projects={[{ id: projectId, name: "产品规划", href: `/app/project/${projectId}`, active }]}
        conversations={[]} activeId={null} awaitingIds={new Set()} onSelectConversation={() => {}}
        onDeleteConversation={async () => true} onRenameConversation={() => {}} onOpenSettings={() => {}} onOpenNotifications={() => {}}
        listLoading={false} listError={false} hasMore={false} onLoadMore={() => {}}
        conversationReads={{
          scope: active ? { kind: "project", projectRef: projectId } : { kind: "direct" }, identity: "same-admitted-reader", admitted: true,
          read: (scope) => ({ conversations: scope.kind === "project" ? [{ id: "conv_project_1", title: "项目内会话" }] : [], loading: false, loadingMore: false, error: false, hasMore: false, refresh: () => {}, loadMore: () => {}, deleteConversation: async () => true, renameConversation: () => {} }),
          ensureScope: () => {}, activeId: null, failedMoveScopeKey: null, onSelect: () => {}, onNewChat: () => {}, onMove: () => {},
        }}
      />
    </LocaleProvider></ThemeProvider>
  }
  render(<RouteHarness />)
  const project = () => screen.getByRole("button", { name: "产品规划" })
  expect(project()).toHaveAttribute("aria-expanded", String(initialActive))
  fireEvent.click(screen.getByRole("button", { name: "进入项目" }))
  expect(project()).toHaveAttribute("aria-expanded", "true")
  fireEvent.click(screen.getByRole("button", { name: "前往资料库" }))
  expect(project()).toHaveAttribute("aria-expanded", "true")
  expect(within(screen.getByRole("navigation", { name: "项目会话" })).getByRole("button", { name: "项目内会话" })).toBeInTheDocument()
  expect(within(screen.getByRole("navigation", { name: "直接会话" })).queryByText("项目内会话")).toBeNull()
  fireEvent.click(project())
  fireEvent.click(screen.getByRole("button", { name: "进入项目" }))
  expect(project()).toHaveAttribute("aria-expanded", "false")
  expect(screen.queryByRole("navigation", { name: "项目会话" })).toBeNull()
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
    useLayoutEffect(() => { setCollapsed = setCollapsedState }, [setCollapsedState])
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

it("会话菜单进入编辑并获得焦点，失焦提交", async () => {
  const { onRenameConversation } = renderRail()
  await openConversationActions()
  fireEvent.click(screen.getByRole("menuitem", { name: "重命名会话 旧标题" }))
  await waitFor(() => expect(screen.getByLabelText("会话标题")).toHaveFocus())
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

it("桌面菜单删除确认取消后把焦点还给稳定的ellipsis", async () => {
  renderRail()
  const trigger = await openConversationActions()
  fireEvent.click(screen.getByRole("menuitem", { name: "删除会话 旧标题" }))
  await screen.findByRole("alertdialog")
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  await waitFor(() => expect(trigger).toHaveFocus())
})

it("桌面确认删除后把焦点交给稳定的新对话入口", async () => {
  const onDeleteConversation = vi.fn().mockResolvedValue(true)
  renderRail({ onDeleteConversation })
  await openConversationActions()
  fireEvent.click(screen.getByRole("menuitem", { name: "删除会话 旧标题" }))
  await screen.findByRole("alertdialog")
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

it("侧栏操作按钮默认是 action，不会提交外层表单", async () => {
  renderRail()
  expect(screen.getByTestId("rail-new-conversation")).toHaveAttribute("type", "button")
  const trigger = await openConversationActions()
  expect(trigger).toHaveAttribute("type", "button")
  expect(screen.getByRole("menuitem", { name: "重命名会话 旧标题" })).not.toHaveAttribute("type", "submit")
  expect(screen.getByRole("menuitem", { name: "删除会话 旧标题" })).not.toHaveAttribute("type", "submit")
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

it("会话清单刷新失败保留已加载会话，不追加异常重试卡", () => {
  const onRetryList = vi.fn()
  renderRail({ listError: true, onRetryList })
  expect(screen.queryByText("会话列表加载失败")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试加载" })).not.toBeInTheDocument()
  expect(onRetryList).not.toHaveBeenCalled()
  expect(screen.getByText("旧标题")).toBeInTheDocument()
})

it("侧栏初始读取保留静态空间，并向辅助技术暴露状态", () => {
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
  expect(conversationsLoading).toBeEmptyDOMElement()
  expect(projectsLoading).toBeEmptyDOMElement()

  cleanup()
  renderRail({ conversations: [], listError: true, onRetryList: vi.fn() })
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByText("还没有直接会话")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试加载" })).not.toBeInTheDocument()
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

it("会话重命名只提交 conversation 身份，canonical Project 名称与 id 原样保留", async () => {
  const { onRenameConversation } = renderRail({
    brandName: "不属于项目的品牌",
    projects: [{ id: "canonical-project", name: "独立项目名称", href: "/app/project/canonical-project" }],
    projectListStatus: "ready",
  })
  await openConversationActions()
  fireEvent.click(screen.getByRole("menuitem", { name: "重命名会话 旧标题" }))
  await waitFor(() => expect(screen.getByLabelText("会话标题")).toHaveFocus())
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
  const projectTrigger = controls.getByRole("button", { name: "项目选项" })
  fireEvent.pointerDown(projectTrigger, { button: 0 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑项目" }))
  expect(projectTrigger).toBeInstanceOf(HTMLButtonElement)
  expect(projectTrigger.isConnected).toBe(true)
  expect(onRequestProjectRename).toHaveBeenCalledExactlyOnceWith("project_a", projectTrigger)
})

it("项目菜单的编辑动作交给路由 owner，不制造本地副本", async () => {
  const onRequestProjectRename = vi.fn()
  renderRail({
    projects: [{ id: "project_a", name: "独立项目名称", href: "/app/project/project_a" }],
    projectListStatus: "ready",
    onRequestProjectRename,
  })

  const projectRow = screen.getByRole("button", { name: "独立项目名称" }).closest("[data-project-id]") as HTMLElement
  const trigger = within(projectRow).getByRole("button", { name: "项目选项" })
  fireEvent.pointerDown(trigger, { button: 0 })
  const menu = await screen.findByRole("menu", { name: "项目选项" })
  expect(menu).toHaveAttribute("data-side", "bottom")
  expect(menu).toHaveAttribute("data-align", "end")
  fireEvent.keyDown(menu, { key: "Escape" })
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(onRequestProjectRename).not.toHaveBeenCalled()
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑项目" }))
  expect(trigger).toBeInstanceOf(HTMLButtonElement)
  expect(trigger.isConnected).toBe(true)
  expect(onRequestProjectRename).toHaveBeenCalledExactlyOnceWith("project_a", trigger)
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


// Integrated folder disclosure stays closed across admission and identity transitions.
// Restoring the approved affordance never restores old private rows or starts a read.
it.each(["same-subject", "actor-B", null])("R255 project links retain no private P/Q task branches across %s retirement", async (nextActor) => {
  const { props, fetchMock, thread } = retirementRailFixture()
  const frame = (actor: string | null, generation: number, admitted: boolean) => {
    return <ThemeProvider><LocaleProvider><ScopedRailHarness props={props} thread={thread} scope={DIRECT_SESSION_SCOPE} identity={`${actor ?? "unknown"}:gen${generation}`} admitted={admitted}/></LocaleProvider></ThemeProvider>
  }
  const view = render(frame("actor-A", 1, true))
  const assertNoBranches = () => {
    expect(document.querySelectorAll('[data-conversation-list="project-conversation"]')).toHaveLength(0)
    for (const id of ["P", "Q"]) {
      expect(document.querySelector(`[data-project-id="${id}"] button[aria-expanded]`)).toHaveAttribute("aria-expanded", "false")
      expect(screen.queryByRole("button", { name: `会话${id}` })).toBeNull()
      expect(document.querySelector(`[data-project-id="${id}"] a`)).toHaveAttribute("href", `/app/project/${id}`)
    }
    expect(screen.getByRole("navigation", { name: "直接会话" })).toBeInTheDocument()
  }
  assertNoBranches()
  view.rerender(frame(nextActor === "same-subject" ? "actor-A" : nextActor, 2, false))
  assertNoBranches()
  view.rerender(frame("actor-A", 3, true))
  await act(async () => { await Promise.resolve() })
  assertNoBranches()
  expect(props.onDeleteConversation).not.toHaveBeenCalled()
  for (const [input] of fetchMock.mock.calls) {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    expect(url.searchParams.has("project_ref")).toBe(false)
  }
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

// SET47-BEGIN: the row menu delegates archive without destructive delete.
it("SET47 task archive is a keyboard-accessible menu action with its own caller",async()=>{
 const archive=vi.fn();const remove=vi.fn();renderRail({onArchiveConversation:archive,onDeleteConversation:remove});
 await openConversationActions();
 const item=await screen.findByRole("menuitem",{name:"归档任务 · 旧标题"});fireEvent.click(item);expect(archive).toHaveBeenCalledWith("ses_1");expect(remove).not.toHaveBeenCalled();
});
// SET47-END

it("an expired Custom API creation shows inspection guidance, keeps its frozen draft and leaves Close available", async () => {
  const { createCustomApiCreateFlow } = await import("@/ui/mcp/custom-api-create-flow")
  const { CustomApiForm } = await import("@/ui/mcp/custom-api-form")
  const { HubClientError } = await import("@/hub/client")
  const boundary = { admitted: true, subject: "expired-api-ui", generation: 1 }
  const call = vi.fn().mockRejectedValue(new HubClientError("http", "private-error", "custom_api_command_replay_expired", 412, false))
  const onCancel = vi.fn(), onDone = vi.fn().mockResolvedValue(undefined)
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: call }, boundary, onConfirmed: vi.fn() })
  render(<LocaleProvider><CustomApiForm flow={flow} boundary={boundary} onCancel={onCancel} onDone={onDone} /></LocaleProvider>)
  const name = screen.getByLabelText(/^(Name|名称)$/u)
  fireEvent.change(name, { target: { value: "Original API" } })
  fireEvent.change(screen.getByLabelText(/^(Secret name|密钥名称)$/u), { target: { value: "QA_API_KEY" } })
  fireEvent.change(screen.getByLabelText(/^(Value|值)$/u), { target: { value: "qa-public-fixture-value" } })
  fireEvent.click(screen.getByRole("button", { name: /^(Save|保存)$/u }))
  expect(await screen.findByRole("alert")).toHaveTextContent(/期限|expired/iu)
  expect(screen.getByRole("button", { name: /核验|Check status/iu })).toBeDisabled()
  expect(name).toHaveValue("Original API")
  expect(name).toHaveAttribute("readonly")
  fireEvent.click(screen.getByRole("button", { name: /^(Cancel|取消)$/u }))
  expect(onCancel).toHaveBeenCalledOnce()
  expect(call).toHaveBeenCalledOnce()
  expect(onDone).not.toHaveBeenCalled()
})

it("keeps an unconfirmed local submission navigable but does not offer owner mutations", async () => {
  const select = vi.fn()
  renderRail({ conversations: [{ id: "conv_unconfirmed", title: "原请求", submissionUnconfirmed: true }], activeId: "conv_unconfirmed", onSelectConversation: select })
  const row = await screen.findByRole("button", { name: /^原请求/ })
  expect(row).toHaveTextContent("原请求接收状态尚未确认")
  fireEvent.doubleClick(row)
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /重命名|删除|归档|移动/ })).not.toBeInTheDocument()
  fireEvent.click(row)
  expect(select).toHaveBeenCalledExactlyOnceWith("conv_unconfirmed")
})


async function openConversationActions(title = "旧标题") {
  const trigger = screen.getByRole("button", { name: `更多 · ${title}` })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" })
  await screen.findByRole("menu", { name: `更多 · ${title}` })
  return trigger
}

it("one conversation ellipsis owns all actions without stealing row selection or keyboard drag", async () => {
  const onSelect = vi.fn()
  renderRail({ onSelectConversation: onSelect, onMoveConversation: vi.fn(), onArchiveConversation: vi.fn() })
  const row = screen.getByRole("button", { name: "旧标题" }).closest('[data-drag-kind="conversation"]') as HTMLElement
  expect(within(row).getAllByRole("button")).toHaveLength(2)
  const trigger = await openConversationActions()
  expect(screen.getByRole("menuitem", { name: "重命名会话 旧标题" })).toBeVisible()
  expect(screen.getByRole("menuitem", { name: "移动会话 旧标题" })).toHaveAttribute("aria-haspopup", "menu")
  expect(screen.getByRole("menuitem", { name: "归档任务 · 旧标题" })).toBeVisible()
  expect(screen.getByRole("menuitem", { name: "删除会话 旧标题" })).toBeVisible()
  expect(trigger).not.toHaveAttribute("draggable")
  fireEvent.keyDown(screen.getByRole("menu", { name: "更多 · 旧标题" }), { key: "Escape" })
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(onSelect).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "旧标题" })).toHaveAttribute("aria-grabbed", "false")
})

it("conversation ellipsis retries an unknown move through its frozen caller, not a new move", async () => {
  const onMove = vi.fn(), send = vi.fn()
  const frozen = { sessionId: "ses_1", targetProjectId: null, commandId: "original-command-key", status: "unknown" as const }
  const retry = vi.fn(() => send(frozen.commandId))
  renderRail({ onMoveConversation: onMove, conversationMove: frozen, onRetryConversationMove: retry })
  await openConversationActions()
  const move = screen.getByRole("menuitem", { name: "移动会话 旧标题" })
  move.focus()
  fireEvent.keyDown(move, { key: "ArrowRight" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "重试移动会话" }))
  expect(retry).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledExactlyOnceWith("original-command-key")
  expect(onMove).not.toHaveBeenCalled()
  expect(frozen.commandId).toBe("original-command-key")
})

it("conversation ellipsis keeps pending actions unavailable without disabling unrelated actions", async () => {
  const archive = vi.fn(), move = vi.fn()
  renderRail({ onArchiveConversation: archive, archiveBusy: true, onMoveConversation: move, conversationMovePending: true })
  await openConversationActions()
  expect(screen.getByRole("menuitem", { name: "移动会话 旧标题" })).toHaveAttribute("data-disabled")
  expect(screen.getByRole("menuitem", { name: "归档任务 · 旧标题" })).toHaveAttribute("data-disabled")
  expect(screen.getByRole("menuitem", { name: "重命名会话 旧标题" })).not.toHaveAttribute("data-disabled")
  expect(screen.getByRole("menuitem", { name: "删除会话 旧标题" })).not.toHaveAttribute("data-disabled")
  expect(archive).not.toHaveBeenCalled()
  expect(move).not.toHaveBeenCalled()
})

it("conversation ellipsis retains the invalid archive identity explanation and never invokes archive", async () => {
  const archive = vi.fn()
  renderRail({ conversations: [{ id: ".", title: "旧标题" }], onArchiveConversation: archive })
  await openConversationActions()
  const item = screen.getByRole("menuitem", { name: "归档任务 · 旧标题" })
  expect(item).toHaveAttribute("data-disabled")
  expect(screen.getByText("此历史任务标识无法通过浏览器安全访问，暂不可操作。")).toBeVisible()
  fireEvent.click(item)
  expect(archive).not.toHaveBeenCalled()
})


it("conversation menu keyboard rename hands off focus and Escape restores the draggable row", async () => {
  const { onRenameConversation } = renderRail()
  await openConversationActions()
  const rename = screen.getByRole("menuitem", { name: "重命名会话 旧标题" })
  rename.focus()
  fireEvent.keyDown(rename, { key: "Enter", code: "Enter" })
  const input = await screen.findByRole("textbox", { name: "会话标题" })
  await waitFor(() => expect(input).toHaveFocus())
  fireEvent.change(input, { target: { value: "未保存" } })
  fireEvent.keyDown(input, { key: "Escape" })
  await waitFor(() => expect(screen.getByRole("button", { name: "旧标题" })).toHaveFocus())
  expect(onRenameConversation).not.toHaveBeenCalled()
  const trigger = await openConversationActions()
  fireEvent.keyDown(screen.getByRole("menu", { name: "更多 · 旧标题" }), { key: "Escape" })
  await waitFor(() => expect(trigger).toHaveFocus())
})


it("long conversation titles stay in precise aria targets, not visible menu action labels", async () => {
  const title = "任务".repeat(128)
  const rename = vi.fn(), move = vi.fn(), archive = vi.fn(), remove = vi.fn()
  renderRail({ conversations: [{ id: "ses_long_title", title }], onRenameConversation: rename,
    onMoveConversation: move, onArchiveConversation: archive, onDeleteConversation: remove })
  await openConversationActions(title)
  const menu = screen.getByRole("menu", { name: `更多 · ${title}` })
  expect(within(menu).getAllByRole("menuitem").map(item => item.textContent)).toEqual(["重命名", "移动到", "归档", "删除"])
  expect(within(menu).getByRole("menuitem", { name: `重命名会话 ${title}` })).toHaveTextContent(/^重命名$/u)
  expect(within(menu).getByRole("menuitem", { name: `移动会话 ${title}` })).toHaveTextContent(/^移动到$/u)
  expect(within(menu).getByRole("menuitem", { name: `删除会话 ${title}` })).toHaveTextContent(/^删除$/u)
  expect(within(menu).getByRole("menuitem", { name: `归档任务 · ${title}` })).toHaveTextContent(/^归档$/u)
  expect(menu).not.toHaveTextContent(title)
  fireEvent.click(within(menu).getByRole("menuitem", { name: `重命名会话 ${title}` }))
  const input = await screen.findByRole("textbox", { name: "会话标题" })
  expect(input).toHaveValue(title)
  fireEvent.keyDown(input, { key: "Escape" })
  expect(rename).not.toHaveBeenCalled()
  expect(move).not.toHaveBeenCalled()
  expect(archive).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
})

it("a long unbroken Project destination retains its full exact identity in the move submenu", async () => {
  const projectId = "project_00000000-0000-4000-8000-000000000909"
  const name = "D".repeat(256)
  const onMove = vi.fn()
  renderRail({ projects: [{ id: projectId, name, href: `/app/project/${projectId}` }], projectListStatus: "ready", conversationScope: { kind: "direct" }, onMoveConversation: onMove })
  await openConversationActions()
  const move = screen.getByRole("menuitem", { name: "移动会话 旧标题" })
  expect(move).toHaveTextContent(/^移动到$/u)
  move.focus()
  fireEvent.keyDown(move, { key: "ArrowRight" })
  const destination = await screen.findByRole("menuitem", { name })
  expect(destination.textContent).toBe(name)
  fireEvent.click(destination)
  expect(onMove).toHaveBeenCalledExactlyOnceWith("ses_1", projectId)
})


it.each([
  ["zh", ["重命名", "移动到", "归档", "删除"]],
  ["en", ["Rename", "Move to", "Archive", "Delete"]],
  ["de", ["Umbenennen", "Verschieben nach", "Archivieren", "Löschen"]],
  ["es", ["Cambiar nombre", "Mover a", "Archivar", "Eliminar"]],
  ["fr", ["Renommer", "Déplacer vers", "Archiver", "Supprimer"]],
  ["ja", ["名前を変更", "移動先", "アーカイブ", "削除"]],
  ["ko", ["이름 바꾸기", "이동 위치", "보관", "삭제"]],
  ["pt", ["Renomear", "Mover para", "Arquivar", "Excluir"]],
  ["ru", ["Переименовать", "Переместить в", "Архивировать", "Удалить"]],
] as const)("%s conversation menu uses short localized text and keeps the full aria target", async (locale, labels) => {
  window.localStorage.setItem("kokoro.locale", locale)
  renderRail({ conversations: [{ id: "ses_locale", title: "Target" }], onMoveConversation: vi.fn(), onArchiveConversation: vi.fn() })
  const trigger = screen.getByRole("button", { name: / · Target$/u })
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" })
  const items = within(await screen.findByRole("menu")).getAllByRole("menuitem")
  expect(items.map(item => item.textContent)).toEqual(labels)
  for (const item of items) expect(item.getAttribute("aria-label")).toContain("Target")
})
