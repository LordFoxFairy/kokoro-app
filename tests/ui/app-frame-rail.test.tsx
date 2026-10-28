import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { StrictMode, useRef, useState } from "react"

const pathname = vi.hoisted(() => ({ value: "/app" }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }))

import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { AppFrameOverlaySurfaces as RawAppFrameOverlaySurfaces } from "@/components/blocks/app-frame/app-frame-overlay-surfaces"
import { useCatalogSkillInstallation } from "@/features/app/use-catalog-skill-installation"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { skillTrialSourceRef } from "@/ui/skills/skills-card-model"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { SkillsSettingsSection } from "@/ui/settings/sections/skills-settings-section"
import { createHubClient, HubClientError } from "@/hub/client"
import { McpProjectionRead as RawMcpProjectionRead } from "@/ui/mcp/mcp-projection-read"
import { browserHubClient } from "@/ui/shell/page-clients"
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { SkillCatalogDialog, type CatalogDetailProjection } from "@/ui/skills/skills-catalog-dialog"
import { createManusSkillHubClient } from "@/ui/skills/manus-skill-client"
import { useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { createSessionClient, SessionClientError } from "@/engine/client"
import { addConversation, type ConversationStore } from "@/core/conversations"
import { AGENT_FAILURE_PROFILES, makeAgentFailureEvent, makeEvent, makeSnapshot } from "../core/fixtures"
import { closeCanvas, openCanvas } from "@/ui/canvas/canvas-store"
import { createFakeClient, createMemoryStorage, makeReceipt, settle, type FakeClient } from "../engine/fakes"

// Isolated surfaces use the same explicit actor/client owner as AppFrameRuntime.
function AppFrameOverlaySurfaces(props: React.ComponentProps<typeof RawAppFrameOverlaySurfaces>) {
  const boundary = props.preview ? { admitted: true, subject: "preview", generation: 0 } : props.readBoundary ?? { admitted: false, subject: null, generation: 0 }
  return <ConnectorCommandProvider client={browserHubClient({ preview: props.preview })} boundary={boundary}><RawAppFrameOverlaySurfaces {...props} /></ConnectorCommandProvider>
}
function McpProjectionRead(props: React.ComponentProps<typeof RawMcpProjectionRead>) {
  return <ConnectorCommandProvider client={props.client} boundary={{ admitted: props.admitted ?? true, subject: props.identity, generation: props.readGeneration ?? 0 }}><RawMcpProjectionRead {...props} /></ConnectorCommandProvider>
}
function withMcpCommandOwner(Content: typeof import("@/ui/mcp/mcp-content").McpContent) {
  return function ScopedContent(props: React.ComponentProps<typeof Content>) {
    const boundary = props.preview ? { admitted: true, subject: "preview", generation: 0 } : props.readBoundary ?? { admitted: false, subject: null, generation: 0 }
    return <ConnectorCommandProvider client={props.client} boundary={boundary}><Content {...props} /></ConnectorCommandProvider>
  }
}

let client: FakeClient
let engine: SessionEngine
const originalInnerWidth = window.innerWidth
const originalMatchMedia = window.matchMedia
const mediaListeners = new Set<() => void>()
let desktopViewportWidth = originalInnerWidth

function mountFrame(props: Partial<React.ComponentProps<typeof AppFrame>> = {}) {
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" {...props} />
      </LocaleProvider>
    </ThemeProvider>,
  )
}

function setDesktopViewport(width: number, pointer: "fine" | "coarse" = "fine") {
  desktopViewportWidth = width
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true })
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const finePointer = query.includes("pointer: fine")
    const coarsePointer = query.includes("pointer: coarse")
    const maximumWidth = /max-width:\s*(\d+)px/u.exec(query)?.[1]
    const desktopMinimum = /width\s*<\s*(\d+)px/u.exec(query)?.[1]
    const withinWidth = desktopMinimum !== undefined
      ? desktopViewportWidth < Number(desktopMinimum)
      : maximumWidth !== undefined && desktopViewportWidth <= Number(maximumWidth)
    return {
      matches: finePointer
        ? pointer === "fine" && withinWidth
        : coarsePointer
          ? pointer === "coarse" && withinWidth
          : withinWidth,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
      addListener: (listener: () => void) => mediaListeners.add(listener),
      removeListener: (listener: () => void) => mediaListeners.delete(listener),
      dispatchEvent: () => false,
    }
  })
}

function resizeDesktopViewport(width: number) {
  desktopViewportWidth = width
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true })
  for (const listener of mediaListeners) listener()
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
  pathname.value = "/app"
  mediaListeners.clear()
  setDesktopViewport(1280)
  document.cookie = "sidebar_state=; Max-Age=0; path=/"
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
  client = createFakeClient()
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(null),
    now: () => 1_000,
  })
})

afterEach(() => {
  engine.dispose()
  cleanup()
  mediaListeners.clear()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth })
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("live Project cold start never advertises unknown capabilities and only resolved flags enable cards; preview stays explicit", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserEngine").mockReturnValue(engine)
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "project-reader")
  window.history.replaceState({}, "", "/app/project/project_read_alpha")
  pathname.value = window.location.pathname
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname
    if (path === "/api/hub/projects") return projectReadEnvelope()
    if (path === "/api/hub/projects/project_read_alpha") return Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_project" } })
    return Response.json({}, { status: 503 })
  })
  const frame = (flags: React.ComponentProps<typeof AppFrame>["featureFlags"], preview = false) => (
    <ThemeProvider><LocaleProvider><AppFrame chatHref="/app" preview={preview} projectWorkspace projectRef="project_read_alpha"
      projectReadBoundary={{ admitted: true, subject: "project-reader", generation: 1 }} emptyState={KokoroProjectWorkspace}
      {...(flags === undefined ? {} : { featureFlags: flags })} /></LocaleProvider></ThemeProvider>
  )
  const expectUnadvertised = () => {
    expect(screen.queryByText("网站", { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText("定时任务", { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "连接器" })).not.toBeInTheDocument()
  }
  const view = render(frame(undefined))
  try {
    expectUnadvertised()
    await screen.findByRole("heading", { name: "研究项目甲" })
    expectUnadvertised()
    view.rerender(frame([]))
    expectUnadvertised()
    view.rerender(frame([{ key: "workspace.connectors", enabled: true }]))
    expect(screen.getByRole("region", { name: "连接器" })).toBeInTheDocument()
    expect(screen.queryByText("网站", { exact: true })).not.toBeInTheDocument()
    expect(screen.queryByText("定时任务", { exact: true })).not.toBeInTheDocument()
    view.rerender(frame([{ key: "project.connectors", enabled: true }]))
    expect(screen.getByRole("region", { name: "连接器" })).toBeInTheDocument()
    view.rerender(frame(undefined))
    expectUnadvertised()
    view.rerender(frame(undefined, true))
    expect(screen.getByText("网站", { exact: true })).toBeInTheDocument()
    expect(screen.getByText("定时任务", { exact: true })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "连接器" })).toBeInTheDocument()
  } finally {
    view.unmount()
    window.history.replaceState({}, "", "/app")
  }
})

it.each([
  { label: "direct chat", standaloneSurface: false, hideWorkspaceHeader: false, composer: true, header: true },
  { label: "standalone catalog", standaloneSurface: true, hideWorkspaceHeader: true, composer: false, header: false },
  { label: "standalone with header", standaloneSurface: true, hideWorkspaceHeader: false, composer: false, header: true },
  { label: "chat without header", standaloneSurface: false, hideWorkspaceHeader: true, composer: true, header: false },
])("cold admission shell respects $label presentation without mounting private content", async ({ standaloneSurface, hideWorkspaceHeader, composer, header }) => {
  const privateSurface = vi.fn(() => <div>private catalog content</div>)
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.spyOn(globalThis, "fetch").mockImplementation(fetch)
  mountFrame({ booting: true, standaloneSurface, hideWorkspaceHeader, emptyState: privateSurface })
  await act(async () => { await Promise.resolve() })

  const input = screen.queryByRole("textbox", { name: "对话输入" })
  if (composer) expect(input).toBeDisabled()
  else expect(input).not.toBeInTheDocument()
  expect(document.querySelector("header") !== null).toBe(header)
  expect(privateSurface).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(client.snapshotCalls).toEqual([])
  expect(client.streams).toEqual([])
})

it.each([
  { label: "saved expanded", cookie: "true", defaultCollapsed: true, expectedCollapsed: false },
  { label: "saved collapsed", cookie: "false", defaultCollapsed: false, expectedCollapsed: true },
  { label: "missing cookie / collapsed default", cookie: null, defaultCollapsed: true, expectedCollapsed: true },
  { label: "missing cookie / expanded default", cookie: null, defaultCollapsed: false, expectedCollapsed: false },
] as const)("R255 StrictMode rail reconciles $label after mount replay", async ({ cookie, defaultCollapsed, expectedCollapsed }) => {
  setDesktopViewport(1200)
  if (cookie !== null) document.cookie = `sidebar_state=${cookie}; path=/`
  const cookieBeforeMount = document.cookie
  render(
    <StrictMode>
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame engine={engine} chatHref="/app" desktopRailCollapsed={defaultCollapsed} />
        </LocaleProvider>
      </ThemeProvider>
    </StrictMode>,
  )

  // Flush the real queued reconciliation after StrictMode setup/cleanup/setup.
  // Neither the layout hook nor its cookie reader is mocked.
  await act(async () => { await Promise.resolve() })
  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", String(expectedCollapsed))
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(screen.getByRole("button", { name: expectedCollapsed ? "展开侧栏" : "收起侧栏" })).toBeInTheDocument()
  })
  expect(document.cookie).toBe(cookieBeforeMount)
})

it("catalog controls survive the background conversation engine changing identity", async () => {
  window.history.replaceState(null, "", "/app/plugins")
  const Catalog = () => <input aria-label="Catalog query" defaultValue="" />
  render(<ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" standaloneSurface emptyState={Catalog} /></LocaleProvider></ThemeProvider>)
  const query = await screen.findByRole("textbox", { name: "Catalog query" })
  fireEvent.change(query, { target: { value: "retained query" } })
  act(() => { engine.newConversation() })
  expect(screen.getByRole("textbox", { name: "Catalog query" })).toHaveValue("retained query")
})

it("R255 StrictMode rail keeps mounted navigation state without rereading a changed cookie or route default", async () => {
  setDesktopViewport(1200)
  const DestinationSurface = () => <div>mounted rail destination</div>
  const frame = (desktopRailCollapsed: boolean, standaloneSurface: boolean) => (
    <StrictMode>
      <ThemeProvider>
        <LocaleProvider>
          <AppFrame
            engine={engine}
            chatHref="/app"
            desktopRailCollapsed={desktopRailCollapsed}
            standaloneSurface={standaloneSurface}
            emptyState={DestinationSurface}
          />
        </LocaleProvider>
      </ThemeProvider>
    </StrictMode>
  )
  const view = render(frame(true, false))
  await act(async () => { await Promise.resolve() })
  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  expect(shell).toHaveAttribute("data-rail-collapsed", "true")
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }), { detail: 0 })
  await waitFor(() => expect(shell).toHaveAttribute("data-rail-collapsed", "false"))
  expect(document.cookie).toContain("sidebar_state=true")

  // An external preference change must not overwrite this mounted shell's choice.
  document.cookie = "sidebar_state=false; path=/"
  pathname.value = "/app/agents"
  view.rerender(frame(false, true))
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText("mounted rail destination")).toBeInTheDocument()
  expect(screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')).toBe(shell)
  expect(shell).toHaveAttribute("data-rail-collapsed", "false")
  expect(document.cookie).toContain("sidebar_state=false")

  pathname.value = "/app"
  view.rerender(frame(true, false))
  await act(async () => { await Promise.resolve() })
  expect(screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')).toBe(shell)
  expect(shell).toHaveAttribute("data-rail-collapsed", "false")
  expect(document.cookie).toContain("sidebar_state=false")
})

it("桌面 shell 发布唯一 300/52 轨道契约和 rail seam", () => {
  setDesktopViewport(1280)
  mountFrame({ desktopRailCollapsed: true })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  expect(shell).not.toBeNull()
  expect(shell).toHaveStyle({
    "--sidebar-width": "300px",
    "--sidebar-width-icon": "52px",
    "--rail-seam-width": "52px",
  })
  const seam = shell?.querySelector('[data-seam="rail"]')
  expect(shell?.querySelectorAll('[data-seam="rail"]')).toHaveLength(1)
  expect(seam).toHaveAttribute("data-seam-visible", "true")
  expect(seam).toHaveAttribute("data-collapsed", "true")
  expect(seam).toHaveAttribute("tabindex", "-1")
  expect(seam).toHaveAttribute("aria-hidden", "true")
  expect(shell?.querySelectorAll('[data-slot="sidebar-container"]')).toHaveLength(1)
})

it("800px 仍是宽桌面收起轨道，展开收起的焦点都留在实际可见控制", async () => {
  setDesktopViewport(800)
  mountFrame({ desktopRailCollapsed: true })

  const shell = screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "true")
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(shell?.querySelector('[data-slot="sidebar"]')).toBeInTheDocument()
    expect(shell?.querySelector('[data-slot="sidebar-gap"]')).toBeInTheDocument()
    expect(shell?.querySelector('[data-seam="rail"]')).toHaveAttribute("data-seam-visible", "true")
  })

  const collapsedBrand = shell?.querySelector<HTMLButtonElement>('[data-collapsed-brand="true"]')
  expect(collapsedBrand).toHaveAttribute("aria-label", "展开侧栏")
  expect(shell?.querySelector('[data-collapsed-search="true"]')).toBeNull()
  fireEvent.click(collapsedBrand as HTMLButtonElement, { detail: 0 })
  await waitFor(() => expect(shell).toHaveAttribute("data-rail-collapsed", "false"))
  fireEvent.click(await screen.findByRole("button", { name: "搜索会话" }), { detail: 0 })
  const searchInput = () => document.querySelector<HTMLInputElement>('input[type="search"]')
  await waitFor(() => expect(searchInput()).toHaveFocus())

  fireEvent.keyDown(searchInput()!, { key: "Escape" })
  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }), { detail: 0 })
  await waitFor(() => expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveFocus())

  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }), { detail: 0 })
  await waitFor(() => expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveFocus())
})

it("含767.5px缩放的768边界往返保持桌面偏好，不残留抽屉", async () => {
  setDesktopViewport(768)
  mountFrame({ desktopRailCollapsed: true })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "true")
    expect(shell).not.toHaveAttribute("data-rail-hidden")
  })

  resizeDesktopViewport(767.5)
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "true")
    expect(shell).toHaveAttribute("data-rail-hidden", "true")
    expect(shell).toHaveStyle({ "--rail-seam-width": "52px" })
    expect(shell?.querySelector('[data-seam="rail"]')).toBeNull()
    expect(shell?.querySelectorAll('[data-web-navigation-trigger="true"]')).toHaveLength(1)
  })

  const compactTrigger = shell?.querySelector('[data-web-navigation-trigger="true"]') as HTMLElement
  compactTrigger.focus()
  fireEvent.click(compactTrigger, { detail: 0 })
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "false")
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(shell).toHaveStyle({ "--rail-seam-width": "300px" })
    expect(shell?.querySelector('[data-seam="rail"]')).toBeNull()
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement)
  })

  resizeDesktopViewport(768)
  await waitFor(() => {
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(shell).toHaveAttribute("data-rail-collapsed", "true")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
  resizeDesktopViewport(767)
  await waitFor(() => expect(shell).toHaveAttribute("data-rail-hidden", "true"))
})

it.each(["fine", "coarse"] as const)("%s 窄屏导航焦点在恢复展开桌面侧栏后交给可见折叠按钮", async (pointer) => {
  setDesktopViewport(800, pointer)
  mountFrame({ desktopRailCollapsed: false })
  await screen.findByRole("button", { name: "收起侧栏" })
  resizeDesktopViewport(600)
  const trigger = await screen.findByRole("button", { name: "展开侧栏" })
  act(() => trigger.focus())
  resizeDesktopViewport(800)
  await waitFor(() => expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveFocus())
})

it("触屏导航抽屉的打开和关闭不改变桌面侧栏偏好", async () => {
  setDesktopViewport(412, "coarse")
  mountFrame({ desktopRailCollapsed: false })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  const trigger = await screen.findByRole("button", { name: "展开侧栏" })
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(shell).toHaveAttribute("data-rail-collapsed", "false")
  fireEvent.click(trigger)
  const drawer = await screen.findByRole("dialog")
  expect(shell).toHaveAttribute("data-rail-collapsed", "false")
  fireEvent.keyDown(drawer, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(shell).toHaveAttribute("data-rail-collapsed", "false")
})

it("隐藏共享 Header 的独立 Web 页面仍保留唯一导航入口", async () => {
  setDesktopViewport(767)
  mountFrame({ hideWorkspaceHeader: true, standaloneSurface: true })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-hidden", "true")
    expect(shell?.querySelectorAll('[data-web-navigation-trigger="true"]')).toHaveLength(1)
  })

  fireEvent.click(shell?.querySelector('[data-web-navigation-trigger="true"]') as HTMLElement)
  await waitFor(() => {
    expect(shell).not.toHaveAttribute("data-rail-hidden")
  })
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
})

it("触屏独立目录仍可打开和关闭导航抽屉", async () => {
  setDesktopViewport(390, "coarse")
  mountFrame({ hideWorkspaceHeader: true, standaloneSurface: true })
  const trigger = await screen.findByRole("button", { name: "展开侧栏" })
  fireEvent.click(trigger)
  const drawer = await screen.findByRole("dialog")
  fireEvent.keyDown(drawer, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(trigger).toHaveAttribute("aria-expanded", "false")
})

it("窄桌面临时展开不覆盖宽桌面的 Sidebar cookie 偏好", async () => {
  document.cookie = "sidebar_state=false; path=/"
  expect(document.cookie).toContain("sidebar_state=false")
  setDesktopViewport(767)
  mountFrame({ desktopRailCollapsed: true })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  const compactTrigger = await waitFor(() => {
    const target = shell?.querySelector<HTMLButtonElement>('[data-web-navigation-trigger="true"]')
    expect(target).not.toBeNull()
    return target as HTMLButtonElement
  })
  expect(shell).toHaveAttribute("data-rail-hidden", "true")
  await act(async () => {
    await Promise.resolve()
  })

  compactTrigger.focus()
  fireEvent.click(compactTrigger, { detail: 0 })
  await waitFor(() => {
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement)
  })
  expect(document.cookie).toContain("sidebar_state=false")

  resizeDesktopViewport(800)
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "true")
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveFocus()
  })
  expect(document.cookie).toContain("sidebar_state=false")
})

it("桌面直接会话使用 scoped inbox，不复制 primary rail stop", () => {
  mountFrame({ desktopRailCollapsed: true })

  const shell = screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')
  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toHaveAttribute("data-conversation-list", "direct")

  expect(screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')).toBe(shell)
  expect(shell).toHaveAttribute("data-rail-collapsed", "true")
  expect(shell?.querySelectorAll('[data-slot="sidebar-container"]')).toHaveLength(1)
})

it("正式壳没有项目身份时不生成默认 kokoro 项目链接", () => {
  mountFrame({ preview: false })
  expect(document.querySelector('a[href="/app/project/kokoro"]')).not.toBeInTheDocument()
})

it("已登录正式壳从同源 Project 列表显示两个独立项目，而非品牌或当前项目占位", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const { AppGate } = await import("@/ui/auth/app-gate")
  const engineFactory = vi.spyOn(pageClients, "browserEngine").mockReturnValue(engine)
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  const projects = [
    {
      id: "project_read_alpha",
      name: "研究项目甲",
      slug: "research-alpha",
      description: "甲的独立项目",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "project_read_beta",
      name: "研究项目乙",
      slug: "research-beta",
      description: "乙的独立项目",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    },
  ]
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, window.location.origin).pathname
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    if (path === "/api/auth/session" && method === "GET") {
      return Response.json({
        authenticated: true,
        subject: "project-reader",
        expires_at: Date.now() + 3_600_000,
      })
    }
    if (path === "/api/auth/csrf" && method === "GET") {
      return Response.json({ csrfToken: "a".repeat(64) })
    }
    if (path === "/api/auth/session" && method === "POST") {
      expect(init?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" })
      expect(init?.body?.toString()).toBe(`csrfToken=${"a".repeat(64)}`)
      return Response.json({ authenticated: true, subject: "project-reader", expires_at: Date.now() + 3_600_000 })
    }
    if (path === "/api/hub/projects" && method === "GET") {
      return Response.json({ data: { projects }, meta: { request_id: "req_project_read_r40" } })
    }
    // Optional presentation is unavailable; it must not select preview data.
    return Response.json({ error: { code: "unavailable" } }, { status: 503 })
  })

  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppGate brandName="站点品牌" />
      </LocaleProvider>
    </ThemeProvider>,
  )
  await screen.findByRole("textbox", { name: "对话输入" })
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({
    cache: "no-store", signal: expect.any(AbortSignal),
  }))
  const authRequests = (path: string, method: string) => fetchMock.mock.calls.filter(([input, init]) => {
    const url = input instanceof Request ? input.url : String(input)
    return new URL(url, window.location.origin).pathname === path &&
      (init?.method ?? (input instanceof Request ? input.method : "GET")) === method
  })
  expect(authRequests("/api/auth/session", "GET")).toHaveLength(1)
  expect(authRequests("/api/auth/csrf", "GET")).toHaveLength(1)
  expect(authRequests("/api/auth/session", "POST")).toHaveLength(1)
  expect(authRequests("/api/auth/session", "POST")[0]?.[1]?.signal)
    .toBe(authRequests("/api/auth/session", "GET")[0]?.[1]?.signal)
  expect(engineFactory).toHaveBeenCalledWith(expect.objectContaining({ preview: false }))
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }), { detail: 0 })

  const alpha = await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  const beta = screen.getByRole("link", { name: "新对话 · 研究项目乙" })
  expect(alpha).toHaveAttribute("href", "/app/project/project_read_alpha")
  expect(beta).toHaveAttribute("href", "/app/project/project_read_beta")
  expect(alpha.closest("[data-project-id]")).toHaveAttribute("data-project-id", "project_read_alpha")
  expect(beta.closest("[data-project-id]")).toHaveAttribute("data-project-id", "project_read_beta")
  expect(document.querySelectorAll("[data-project-list] [data-project-id]")).toHaveLength(2)
  expect(document.querySelector('a[href="/app/project/kokoro"]')).not.toBeInTheDocument()
  expect(document.querySelector('[data-project-list] a[aria-label="站点品牌"]')).not.toBeInTheDocument()
})

const projectReadFixtures = [
  { id: "project_read_alpha", name: "研究项目甲", slug: "alpha", description: "", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
  { id: "project_read_beta", name: "研究项目乙", slug: "beta", description: "", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
]

function projectReadEnvelope(projects = projectReadFixtures) {
  return Response.json({ data: { projects }, meta: { request_id: "req_project_read_lifecycle" } })
}

async function mountAuthenticatedProjectRail(
  read: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  readSession: () => Promise<Response> = async () => Response.json({ authenticated: true, subject: "project-reader", expires_at: Date.now() + 3_600_000 }),
) {
  const pageClients = await import("@/ui/shell/page-clients")
  const { AppGate } = await import("@/ui/auth/app-gate")
  vi.spyOn(pageClients, "browserEngine").mockReturnValue(engine)
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, window.location.origin).pathname
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    // Recheck counters count readonly GETs, never the credential rotation POST.
    if (path === "/api/auth/session" && method === "GET") return readSession()
    if (path === "/api/auth/csrf" && method === "GET") {
      return Response.json({ csrfToken: "a".repeat(64) })
    }
    if (path === "/api/auth/session" && method === "POST") {
      expect(init?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" })
      expect(init?.body?.toString()).toBe(`csrfToken=${"a".repeat(64)}`)
      return Response.json({ authenticated: true, subject: "project-reader", expires_at: Date.now() + 3_600_000 })
    }
    if (path === "/api/hub/projects") return read(input, init)
    return Response.json({ error: { code: "unavailable" } }, { status: 503 })
  })
  const view = render(<ThemeProvider><LocaleProvider><AppGate brandName="站点品牌" /></LocaleProvider></ThemeProvider>)
  await screen.findByRole("textbox", { name: "对话输入" })
  fireEvent.click(await screen.findByRole("button", { name: "展开侧栏" }), { detail: 0 })
  return { ...view, fetchMock }
}

it.each(["401", "bad-shape"])("身份重新准入后列表返回 %s，清旧项目且不伪装为空集合", async (failure) => {
  let calls = 0
  await mountAuthenticatedProjectRail(async () => {
    calls++
    return calls === 1 ? projectReadEnvelope() : failure === "401"
      ? Response.json({ error: { code: "unauthenticated" } }, { status: 401 })
      : Response.json({ data: { projects: [{ id: "broken" }] }, meta: { request_id: "req_broken" } })
  })
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  expect(calls).toBe(1)
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
  act(() => window.dispatchEvent(new Event("focus")))
  if (failure === "401") {
    // One automatic re-admission/read is allowed; its second 401 withdraws
    // admission and exposes the gate's explicit independent recovery action.
    const status = await screen.findByRole("status", { name: "连接暂时中断" })
    expect(status.querySelector("button")).toBeEnabled()
    expect(calls).toBe(3)
  } else {
    await waitFor(() => expect(calls).toBe(2))
    await act(async () => {})
    expect(screen.queryByTestId("projects-error")).not.toBeInTheDocument()
  }
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目乙" })).not.toBeInTheDocument()
  expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
  expect(document.querySelectorAll("[data-project-list] [data-project-id]")).toHaveLength(0)
})

it("只有成功读取 projects=[] 才呈现项目空态", async () => {
  let calls = 0
  await mountAuthenticatedProjectRail(async () => { calls++; return projectReadEnvelope([]) })
  expect(await screen.findByTestId("projects-empty")).toHaveTextContent("暂无项目。")
  expect(calls).toBe(1)
  expect(screen.queryByTestId("projects-error")).not.toBeInTheDocument()
  expect(document.querySelectorAll("[data-project-list] [data-project-id]")).toHaveLength(0)
})

it("同账号焦点核验保留项目、会话和草稿，不重新请求业务列表", async () => {
  const sessionReads = vi.spyOn(client, "listSessions").mockResolvedValue({
    sessions: [{ session_id: "conv_stable_rail", title: "保留的会话", updated_at: "2026-10-23T00:00:00Z" }], next_cursor: null,
  })
  let finishCheck!: (response: Response) => void
  let checks = 0
  let projectReads = 0
  await mountAuthenticatedProjectRail(async () => { projectReads++; return projectReadEnvelope() }, async () => {
    checks++
    if (checks === 2) return new Promise<Response>((resolve) => { finishCheck = resolve })
    return Response.json({ authenticated: true, subject: "project-reader" })
  })
  const projectLink = await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  const conversation = await screen.findByRole("button", { name: "保留的会话" })
  const sessionReadCount = sessionReads.mock.calls.length
  const composer = screen.getByRole("textbox", { name: "对话输入" })
  fireEvent.change(composer, { target: { value: "核验期间保留的草稿" } })
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(checks).toBe(2))
  expect(projectReads).toBe(1)
  expect(screen.queryByText("项目不可用")).not.toBeInTheDocument()
  expect(screen.queryByText("不可用", { exact: true })).not.toBeInTheDocument()
  expect(screen.queryByTestId("projects-error")).not.toBeInTheDocument()
  expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
  expect(screen.getByRole("link", { name: "新对话 · 研究项目甲" })).toBe(projectLink)
  expect(screen.getByRole("button", { name: "保留的会话" })).toBe(conversation)
  expect(screen.queryByTestId("projects-loading")).not.toBeInTheDocument()
  expect(screen.queryByTestId("conversations-loading")).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "对话输入" })).toBe(composer)
  expect(composer).toHaveValue("核验期间保留的草稿")
  await act(async () => { finishCheck(Response.json({ authenticated: true, subject: "project-reader" })) })
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  expect(projectReads).toBe(1)
  expect(sessionReads).toHaveBeenCalledTimes(sessionReadCount)
  expect(screen.getByRole("button", { name: "保留的会话" })).toBe(conversation)
  expect(screen.getByRole("textbox", { name: "对话输入" })).toBe(composer)
  expect(composer).toHaveValue("核验期间保留的草稿")
})

it("身份标记退休后清空并取消旧读取，迟到响应不能复活项目或重挂 Chat", async () => {
  let resolveOld: (response: Response) => void = () => { throw new Error("old read not pending") }
  let resolveSession: (response: Response) => void = () => { throw new Error("session not pending") }
  let calls = 0
  let checks = 0
  const signals: (AbortSignal | null | undefined)[] = []
  const disposal = vi.spyOn(engine, "dispose")
  await mountAuthenticatedProjectRail(async (_input, init) => {
    signals.push(init?.signal)
    calls++
    if (calls === 2) return new Promise<Response>((resolve) => { resolveOld = resolve })
    return projectReadEnvelope(calls === 1 ? projectReadFixtures : projectReadFixtures.slice(1))
  }, async () => {
    checks++
    if (checks === 3) return new Promise<Response>((resolve) => { resolveSession = resolve })
    return Response.json({ authenticated: true, subject: "project-reader" })
  })
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  const composer = screen.getByRole("textbox", { name: "对话输入" })
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(calls).toBe(2))
  window.localStorage.removeItem("kokoro.web.auth-index-subject")
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(checks).toBe(3))
  expect(signals[1]?.aborted).toBe(true)
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
  await act(async () => { resolveOld(projectReadEnvelope()); await Promise.resolve() })
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  await act(async () => { resolveSession(Response.json({ authenticated: true, subject: "project-reader" })) })
  await screen.findByRole("link", { name: "新对话 · 研究项目乙" })
  expect(calls).toBe(3)
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "对话输入" })).toBe(composer)
  expect(disposal).not.toHaveBeenCalled()
})

it("正式健康集合切入显式 preview 后取消旧代际，不请求正式集合也不复用旧项目", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  let resolvePending: (response: Response) => void = () => { throw new Error("no pending read") }
  let calls = 0
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) !== "/api/hub/projects") return Response.json({}, { status: 503 })
    calls++
    return calls === 2 ? new Promise<Response>((resolve) => { resolvePending = resolve }) : projectReadEnvelope()
  })
  let boundary = { admitted: true, subject: "preview-isolation-reader", generation: 1 }
  const frame = (preview: boolean) => <ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" preview={preview} projectReadBoundary={boundary} /></LocaleProvider></ThemeProvider>
  const view = render(frame(false))
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  const reads = () => fetchMock.mock.calls.filter(([input]) => String(input) === "/api/hub/projects")
  expect(reads()).toHaveLength(1)
  boundary = { ...boundary, generation: 2 }
  view.rerender(frame(false))
  await waitFor(() => expect(reads()).toHaveLength(2))
  const signal = reads()[1]?.[1]?.signal
  view.rerender(frame(true))
  await act(async () => { await Promise.resolve() })
  expect(signal?.aborted).toBe(true)
  expect(reads()).toHaveLength(2)
  await act(async () => { resolvePending(projectReadEnvelope()); await Promise.resolve() })
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  view.rerender(frame(false))
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  expect(reads()).toHaveLength(3)
})

it("创建成功只触发正式 GET 刷新，不把 ACK 当全集，原草稿仍一次承接", async () => {
  let reads = 0
  let writes = 0
  let resolveRefresh: (response: Response) => void = () => { throw new Error("no pending refresh") }
  const view = await mountAuthenticatedProjectRail(async (_input, init) => {
    if (init?.method === "POST") {
      writes++
      expect(init.headers).toEqual({ "content-type": "application/json", "Idempotency-Key": expect.any(String) })
      return Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_create" } })
    }
    reads++
    if (reads === 1) return projectReadEnvelope([])
    return new Promise<Response>((resolve) => { resolveRefresh = resolve })
  })
  try {
    await screen.findByTestId("projects-empty")
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "保持创建时的草稿" } })
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }))
    const dialog = await screen.findByRole("dialog", { name: "创建项目" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "项目名称" }), { target: { value: "研究项目甲" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }))
    await waitFor(() => expect(reads).toBe(2))
    expect(writes).toBe(1)
    expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_read_alpha"))
    await waitFor(() => expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveValue("保持创建时的草稿"))
    await act(async () => { resolveRefresh(projectReadEnvelope()) })
    await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
    expect(screen.getByRole("heading", { name: "研究项目甲" })).toBeInTheDocument()
    expect(writes).toBe(1)
    expect(reads).toBe(2)
  } finally {
    view.unmount()
    window.history.replaceState(window.history.state, "", "/")
  }
})

it("健康正式列表在 session 401 服务异常后撤销，但保留 Chat 且不改为 preview", async () => {
  let reads = 0
  let checks = 0
  await mountAuthenticatedProjectRail(async () => { reads++; return projectReadEnvelope() }, async () => {
    checks++
    return checks === 1 ? Response.json({ authenticated: true, subject: "project-reader" }) : Response.json({ authenticated: false }, { status: 401 })
  })
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(screen.getByText("重连中…")).toBeInTheDocument())
  expect(screen.queryByText("暂时无法确认登录状态。请重试。")).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "对话输入" })).toBeInTheDocument()
  expect(checks).toBe(2)
  expect(reads).toBe(1)
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  expect(document.querySelector('a[href*="preview-project"]')).toBeNull()
})


it.each([false, true])("创建项目的迟到合法 ACK 不抢回用户已切换的项目或覆盖新草稿（返回来源=%s）", async (returnToSource) => {
  window.history.replaceState(window.history.state, "", "/app")
  let writes = 0
  let reads = 0
  let acknowledge!: (response: Response) => void
  const view = await mountAuthenticatedProjectRail(async (_input, init) => {
    if (init?.method === "POST") {
      writes++
      expect(init.headers).toEqual({ "content-type": "application/json", "Idempotency-Key": expect.any(String) })
      return new Promise<Response>((resolve) => { acknowledge = resolve })
    }
    reads++
    return projectReadEnvelope()
  })
  try {
    await screen.findByRole("link", { name: "新对话 · 研究项目乙" })
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "创建时A的原草稿" } })
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }))
    const dialog = await screen.findByRole("dialog", { name: "创建项目" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "项目名称" }), { target: { value: "研究项目甲" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }))
    await waitFor(() => expect(writes).toBe(1))
    expect(acknowledge).toBeTypeOf("function")
    fireEvent.click(await screen.findByRole("link", { name: "新对话 · 研究项目乙" }), { detail: 0 })
    await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_read_beta"))
    await screen.findByRole("heading", { name: "研究项目乙" })
    const composer = screen.getByRole("textbox", { name: "对话输入" })
    fireEvent.change(composer, { target: { value: "切到Q后的新草稿" } })
    expect(composer).toHaveValue("切到Q后的新草稿")
    if (returnToSource) {
      act(() => window.history.back())
      await waitFor(() => expect(window.location.pathname).toBe("/app"))
      fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "返回A后的新草稿" } })
    }
    const readsBeforeAck = reads
    await act(async () => {
      acknowledge(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r250_create" } }))
    })
    await waitFor(() => expect(reads).toBeGreaterThan(readsBeforeAck))
    expect(writes).toBe(1)
    expect(window.location.pathname).toBe(returnToSource ? "/app" : "/app/project/project_read_beta")
    expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveValue(returnToSource ? "返回A后的新草稿" : "切到Q后的新草稿")
    if (!returnToSource) expect(screen.getByRole("heading", { name: "研究项目乙" })).toBeInTheDocument()
  } finally {
    view.unmount()
    window.history.replaceState(window.history.state, "", "/")
  }
})


async function mountCreationBoundary() {
  const { useAppFrameProject } = await import("@/components/blocks/app-frame/use-app-frame-project")
  const refresh = vi.fn()
  const navigate = vi.fn()
  const options = {
    projectRef: undefined, projectWorkspace: false, preview: false, mounted: true, draft: "source draft",
    updateDraft: vi.fn(), clearDraft: vi.fn(), projectDetail: { status: "blocked" as const },
    instructionHistory: { status: "blocked" as const }, instructionContext: {}, refreshProject: vi.fn(),
    onProjectCreated: refresh, onOpenProject: navigate,
  }
  const view = renderHook<ReturnType<typeof useAppFrameProject>, { subject: string; routeKey: string; admitted?: boolean }>(({ subject, routeKey, admitted = true }) => useAppFrameProject({ ...options,
    renameBoundary: { admitted, subject, generation: 1 }, renameRouteKey: routeKey,
  }), { initialProps: { subject: "reader-a", routeKey: "A" },
    wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
  })
  return { ...view, refresh, navigate }
}

it("创建ACK在账号变化后不刷新或导航旧主体事实", async () => {
  let acknowledge!: (response: Response) => void
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { acknowledge = resolve }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    view.rerender({ subject: "reader-b", routeKey: "A" })
    await act(async () => { acknowledge(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_actor_change" } })) })
    expect(view.refresh).not.toHaveBeenCalled()
    expect(view.navigate).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  } finally { view.unmount() }
})

it("创建ACK在卸载后没有导航或集合写权", async () => {
  let acknowledge!: (response: Response) => void
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { acknowledge = resolve }))
  const view = await mountCreationBoundary()
  act(() => view.result.current.createProject())
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  view.unmount()
  await act(async () => { acknowledge(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_disposed_create" } })) })
  expect(view.refresh).not.toHaveBeenCalled()
  expect(view.navigate).not.toHaveBeenCalled()
})

it("创建unknown显式恢复沿原key/body且不抢同主体已变选择", async () => {
  const request = vi.spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("owner outcome unknown"))
    .mockResolvedValueOnce(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_recovered_create" } }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(view.result.current.projectCreation.error).toBe(true))
    const first = request.mock.calls[0]?.[1]
    view.rerender({ subject: "reader-a", routeKey: "B" })
    act(() => view.result.current.retryProjectCreation())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(1))
    const recovered = request.mock.calls[1]?.[1]
    expect(recovered?.headers).toEqual(first?.headers)
    expect(recovered?.body).toBe(first?.body)
    expect(view.navigate).not.toHaveBeenCalled()
  } finally { view.unmount() }
})

it("创建已确认后导航失败仅重用返回ID，不第二次POST或刷新", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_navigation_failed" } }))
  const view = await mountCreationBoundary()
  view.navigate.mockImplementationOnce(() => { throw new Error("navigation unavailable") })
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(view.result.current.projectCreation.error).toBe(true))
    expect(view.refresh).toHaveBeenCalledTimes(1)
    act(() => view.result.current.retryProjectCreation())
    await waitFor(() => expect(view.result.current.projectCreation.error).toBe(false))
    expect(view.navigate).toHaveBeenCalledTimes(2)
    expect(view.navigate.mock.calls.map((call) => call[0])).toEqual(["project_read_alpha", "project_read_alpha"])
    expect(request).toHaveBeenCalledTimes(1)
    expect(view.refresh).toHaveBeenCalledTimes(1)
  } finally { view.unmount() }
})


it("账号变化退役旧unknown且旧失败finally不抢新主体在途创建", async () => {
  const replies: Array<(response: Response) => void> = []
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { replies.push(resolve) }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    const first = request.mock.calls[0]?.[1]
    view.rerender({ subject: "reader-b", routeKey: "A" })
    act(() => view.result.current.retryProjectCreation())
    expect(request).toHaveBeenCalledTimes(1)
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(request.mock.calls[1]?.[1]?.headers).not.toEqual(first?.headers)
    await act(async () => { replies[0]?.(Response.json({ error: { code: "forbidden" } }, { status: 403 })) })
    expect(view.result.current.projectCreation).toEqual({ pending: true, error: false, retryable: false })
    act(() => view.result.current.createProject())
    expect(request).toHaveBeenCalledTimes(2)
    await act(async () => { replies[1]?.(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_new_actor" } })) })
    expect(view.refresh).toHaveBeenCalledTimes(1)
    expect(view.navigate).toHaveBeenCalledTimes(1)
    expect(view.result.current.projectCreation).toEqual({ pending: false, error: false, retryable: false })
  } finally { view.unmount() }
})

it("账号变化后已完成unknown不会阻挡新主体创建或重放旧key", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("unknown"))
    .mockResolvedValueOnce(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_new_actor_after_unknown" } }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(view.result.current.projectCreation.error).toBe(true))
    const first = request.mock.calls[0]?.[1]
    view.rerender({ subject: "reader-b", routeKey: "A" })
    act(() => view.result.current.retryProjectCreation())
    expect(request).toHaveBeenCalledTimes(1)
    act(() => view.result.current.createProject())
    await waitFor(() => expect(view.navigate).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[1]?.headers).not.toEqual(first?.headers)
  } finally { view.unmount() }
})


it("R251 同主体暂撤准入期间settle解除pending，恢复只允许明确原key重试", async () => {
  let fail!: (error: unknown) => void
  const request = vi.spyOn(globalThis, "fetch")
    .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { fail = reject }))
    .mockResolvedValueOnce(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_same_actor_recovery" } }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    const first = request.mock.calls[0]?.[1]
    view.rerender({ subject: "reader-a", routeKey: "A", admitted: false })
    await act(async () => { fail(new Error("unknown during same-subject probe")) })
    expect(view.result.current.projectCreation).toEqual({ pending: false, error: true, retryable: true })
    act(() => view.result.current.retryProjectCreation())
    expect(request).toHaveBeenCalledTimes(1)
    view.rerender({ subject: "reader-a", routeKey: "A", admitted: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(view.refresh).not.toHaveBeenCalled()
    expect(view.navigate).not.toHaveBeenCalled()
    act(() => view.result.current.retryProjectCreation())
    await waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[1]?.headers).toEqual(first?.headers)
    expect(request.mock.calls[1]?.[1]?.body).toBe(first?.body)
    expect(view.navigate).not.toHaveBeenCalled()
  } finally { view.unmount() }
})

it.each(["subject", "dispose"] as const)("R251 %s retirement aborts only its old creation attempt", async (retirement) => {
  const acknowledge: Array<(response: Response) => void> = []
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { acknowledge.push(resolve) }))
  const view = await mountCreationBoundary()
  let unmounted = false
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    const oldSignal = request.mock.calls[0]?.[1]?.signal
    expect(oldSignal).toBeInstanceOf(AbortSignal)
    expect(oldSignal?.aborted).toBe(false)
    if (retirement === "subject") view.rerender({ subject: "reader-b", routeKey: "A" })
    else { view.unmount(); unmounted = true }
    expect(oldSignal?.aborted).toBe(true)
    if (retirement === "subject") {
      act(() => view.result.current.createProject())
      await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
      const newSignal = request.mock.calls[1]?.[1]?.signal
      expect(newSignal?.aborted).toBe(false)
      await act(async () => { acknowledge[0]?.(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_old_actor" } })) })
      expect(view.result.current.projectCreation.pending).toBe(true)
      expect(newSignal?.aborted).toBe(false)
      expect(view.refresh).not.toHaveBeenCalled()
      expect(view.navigate).not.toHaveBeenCalled()
      await act(async () => { acknowledge[1]?.(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_new_actor" } })) })
      expect(view.refresh).toHaveBeenCalledTimes(1)
      expect(view.navigate).toHaveBeenCalledTimes(1)
    } else {
      await act(async () => { acknowledge[0]?.(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_disposed" } })) })
      expect(view.refresh).not.toHaveBeenCalled()
      expect(view.navigate).not.toHaveBeenCalled()
    }
  } finally { if (!unmounted) view.unmount() }
})

it("R251 same-actor route change does not abort the owner result but permanently revokes its navigation", async () => {
  let acknowledge!: (response: Response) => void
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { acknowledge = resolve }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    const signal = request.mock.calls[0]?.[1]?.signal
    expect(signal).toBeInstanceOf(AbortSignal)
    view.rerender({ subject: "reader-a", routeKey: "Q" })
    expect(signal?.aborted).toBe(false)
    await act(async () => { acknowledge(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_route" } })) })
    expect(view.refresh).toHaveBeenCalledTimes(1)
    expect(view.navigate).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
  } finally { view.unmount() }
})


it("R251 real create deadline releases local pending and explicit recovery preserves the old key after a route change", async () => {
  vi.useFakeTimers()
  let acknowledge!: (response: Response) => void
  const request = vi.spyOn(globalThis, "fetch")
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { acknowledge = resolve }))
    .mockResolvedValueOnce(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_deadline_recovery" } }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    expect(request).toHaveBeenCalledTimes(1)
    const first = request.mock.calls[0]?.[1]
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(view.result.current.projectCreation).toEqual({ pending: false, error: true, retryable: true })
    expect(first?.signal?.aborted).toBe(true)
    expect(view.refresh).not.toHaveBeenCalled()
    expect(view.navigate).not.toHaveBeenCalled()
    view.rerender({ subject: "reader-a", routeKey: "Q" })
    await act(async () => { acknowledge(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_expired_ack" } })) })
    expect(view.refresh).not.toHaveBeenCalled()
    expect(view.navigate).not.toHaveBeenCalled()
    await act(async () => { view.result.current.retryProjectCreation() })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[1]?.headers).toEqual(first?.headers)
    expect(request.mock.calls[1]?.[1]?.body).toBe(first?.body)
    expect(view.refresh).toHaveBeenCalledTimes(1)
    expect(view.navigate).not.toHaveBeenCalled()
    expect(view.result.current.projectCreation).toEqual({ pending: false, error: false, retryable: false })
  } finally { view.unmount(); vi.useRealTimers() }
})

it("R251 legal ACK during same-subject suspension conservatively retains its key without publishing or automatic recovery", async () => {
  let acknowledge!: (response: Response) => void
  const request = vi.spyOn(globalThis, "fetch")
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { acknowledge = resolve }))
    .mockResolvedValueOnce(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_ack_confirmation" } }))
  const view = await mountCreationBoundary()
  try {
    act(() => view.result.current.createProject())
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    const first = request.mock.calls[0]?.[1]
    view.rerender({ subject: "reader-a", routeKey: "A", admitted: false })
    await act(async () => { acknowledge(Response.json({ data: { project: projectReadFixtures[0] }, meta: { request_id: "req_r251_suspended_ack" } })) })
    expect(view.result.current.projectCreation).toEqual({ pending: false, error: true, retryable: true })
    expect(view.refresh).not.toHaveBeenCalled()
    expect(view.navigate).not.toHaveBeenCalled()
    view.rerender({ subject: "reader-a", routeKey: "A", admitted: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(view.refresh).not.toHaveBeenCalled()
    act(() => view.result.current.retryProjectCreation())
    await waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]?.[1]?.headers).toEqual(first?.headers)
    expect(request.mock.calls[1]?.[1]?.body).toBe(first?.body)
    expect(view.navigate).not.toHaveBeenCalled()
  } finally { view.unmount() }
})


// Actual AppFrame + actual scoped engines: URL projection must not silently
// adopt the scoped index's remembered activeId as the project-root draft.
it.each(["idle", "streaming", "reattach-running", "reattach-completed"])("direct rail preserves loaded pages across project switches but retires them on identity change (%s)", async (runState) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000851"
  const projectEngine = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef } })
  if (runState !== "idle") {
    engine.submit("keep running across navigation")
    await waitFor(() => expect(client.streams).toHaveLength(1))
  }
  let directEngine: SessionEngine | null = engine
  let reattachedEngine: SessionEngine | null = null
  let directReads = 0
  const listSessions = vi.fn<typeof client.listSessions>(async (_cursor, scope) => {
    if (scope?.kind === "project") return { sessions: [], next_cursor: null }
    if (_cursor === "next-direct") return { sessions: [{ session_id: "conv-direct-page-two", title: "第二页直接会话", updated_at: "2026-10-15T00:00:00Z" }], next_cursor: null }
    if (++directReads > 1) return new Promise(() => {})
    return { sessions: [{ session_id: "conv-stable-direct", title: "稳定直接会话", updated_at: "2026-10-15T00:00:00Z" }], next_cursor: "next-direct" }
  })
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserListClient").mockReturnValue({ ...client, listSessions })
  stubBusinessFetch(vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    data: { projects: [{ id: projectRef, name: "稳定项目", slug: "stable", description: "", created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z" }] },
    meta: { request_id: "req-stable-rail" },
  })))
  const frame = (project: boolean, subject = "stable-rail-reader") => <ThemeProvider><LocaleProvider><AppFrame
    engine={project ? projectEngine : directEngine} chatHref="/app" desktopRailCollapsed={false}
    projectWorkspace={project} {...(project ? { projectRef } : {})}
    projectReadBoundary={{ admitted: true, subject, generation: 1 }}
  /></LocaleProvider></ThemeProvider>
  window.history.replaceState({}, "", "/app")
  const view = render(frame(false))
  try {
    const direct = () => within(screen.getByRole("navigation", { name: "直接会话" }))
    await direct().findByRole("button", { name: "稳定直接会话" })
    fireEvent.click(direct().getByRole("button", { name: "加载更多" }))
    await direct().findByRole("button", { name: "第二页直接会话" })
    act(() => window.history.pushState({}, "", `/app/project/${projectRef}`))
    view.rerender(frame(true))
    expect(direct().getByRole("button", { name: "稳定直接会话" })).toBeVisible()
    expect(direct().getByRole("button", { name: "第二页直接会话" })).toBeVisible()
    expect(direct().queryByRole("status", { name: "正在加载会话…" })).toBeNull()
    act(() => window.history.pushState({}, "", "/app"))
    let settleSnapshot: (() => void) | undefined
    if (runState.startsWith("reattach-")) {
      directEngine = null
      view.rerender(frame(false))
      expect(directReads).toBe(1)
      const retainedStore = engine.getSnapshot().store
      if (retainedStore === null || retainedStore.activeId === null) throw new Error("streaming fixture has no retained conversation")
      const restored = createFakeClient()
      restored.nextSnapshot = () => new Promise((resolve) => {
        settleSnapshot = () => resolve(makeSnapshot({
          sessionId: retainedStore.activeId!,
          ...(runState === "reattach-running" ? { activeRun: { run_id: "run_restored", status: "running" } } : {}),
        }))
      })
      reattachedEngine = createSessionEngine({ client: restored, storage: createMemoryStorage<ConversationStore>(retainedStore) })
      directEngine = reattachedEngine
      expect(reattachedEngine.getSnapshot().hydrating).toBe(true)
    }
    view.rerender(frame(false))
    expect(direct().getByRole("button", { name: "稳定直接会话" })).toBeVisible()
    expect(directReads).toBe(1)
    if (reattachedEngine !== null) {
      await waitFor(() => expect(settleSnapshot).toBeTypeOf("function"))
      await act(async () => { settleSnapshot!() })
      await waitFor(() => expect(reattachedEngine?.getSnapshot().hydrating).toBe(false))
    }
    const settledReads = runState === "reattach-completed" ? 2 : 1
    await waitFor(() => expect(directReads).toBe(settledReads))
    view.rerender(frame(false, "different-rail-reader"))
    expect(direct().queryByRole("button", { name: "稳定直接会话" })).toBeNull()
    expect(direct().queryByRole("button", { name: "第二页直接会话" })).toBeNull()
    await waitFor(() => expect(directReads).toBe(settledReads + 1))
  } finally { view.unmount(); projectEngine.dispose(); reattachedEngine?.dispose(); window.history.replaceState({}, "", "/app") }
})

it.each(["pages", "pending rename"] as const)("a project keeps its own reader across folder and route transitions (%s)", async (scenario) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000852"
  const projectScope = { kind: "project", projectRef } as const
  const projectEngine = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null), scope: projectScope })
  let ownerTitle = "项目原题"
  let acknowledgeRename: (() => void) | undefined
  const listSessions = vi.fn<typeof client.listSessions>(async (cursor, scope) => scope?.kind === "project" ? {
    sessions: [{ session_id: cursor === "project-page-two" ? "conv-project-page-two" : "conv-project-first", title: cursor === "project-page-two" ? "项目第二页" : ownerTitle, updated_at: "2026-10-15T00:00:00Z" }],
    next_cursor: cursor === "project-page-two" ? null : "project-page-two",
  } : { sessions: [], next_cursor: null })
  const renameSession = vi.fn<typeof client.renameSession>((_id, title) => new Promise((resolve) => {
    acknowledgeRename = () => { ownerTitle = title; resolve({ ok: true }) }
  }))
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserListClient").mockReturnValue({ ...client, listSessions, renameSession })
  stubBusinessFetch(vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
    data: { projects: [{ id: projectRef, name: "项目生命周期", slug: "reader", description: "", created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z" }] },
    meta: { request_id: "req-project-reader" },
  })))
  const frame = (project: boolean) => <StrictMode><ThemeProvider><LocaleProvider><AppFrame
    engine={project ? projectEngine : engine} chatHref="/app" desktopRailCollapsed={false}
    projectWorkspace={project} {...(project ? { projectRef } : {})}
    projectReadBoundary={{ admitted: true, subject: "project-reader", generation: 1 }}
  /></LocaleProvider></ThemeProvider></StrictMode>
  const projectReads = () => listSessions.mock.calls.filter(([, scope]) => scope?.kind === "project")
  const group = () => within(screen.getByRole("navigation", { name: "项目会话" }))
  window.history.replaceState({}, "", "/app")
  const view = render(frame(false))
  try {
    const expand = await screen.findByRole("button", { name: "项目生命周期" })
    expect(projectReads()).toHaveLength(0) // unopened folders do not prefetch
    fireEvent.click(expand)
    await group().findByRole("button", { name: ownerTitle })
    if (scenario === "pages") {
      fireEvent.click(group().getByRole("button", { name: "加载更多" }))
      await group().findByRole("button", { name: "项目第二页" })
    } else {
      fireEvent.keyDown(group().getByRole("button", { name: "更多 · 项目原题" }), { key: "Enter", code: "Enter" })
      fireEvent.click(await screen.findByRole("menuitem", { name: "重命名会话 项目原题" }))
      const input = await group().findByRole("textbox")
      fireEvent.change(input, { target: { value: "已确认的新题" } })
      fireEvent.keyDown(input, { key: "Enter" })
      await waitFor(() => expect(renameSession).toHaveBeenCalledOnce())
    }
    const readsBeforeNavigation = projectReads().length
    act(() => window.history.pushState({}, "", `/app/project/${projectRef}`))
    view.rerender(frame(true))
    expect(group().getByRole("button", { name: scenario === "pages" ? "项目第二页" : "已确认的新题" })).toBeVisible()
    expect(projectReads()).toHaveLength(readsBeforeNavigation)
    act(() => window.history.pushState({}, "", "/app"))
    view.rerender(frame(false))
    fireEvent.click(screen.getByRole("button", { name: "项目生命周期" }))
    expect(screen.queryByRole("navigation", { name: "项目会话" })).toBeNull()
    if (scenario === "pending rename") {
      await act(async () => { acknowledgeRename!() })
      await waitFor(() => expect(projectReads()).toHaveLength(readsBeforeNavigation + 1))
    }
    fireEvent.click(screen.getByRole("button", { name: "项目生命周期" }))
    expect(group().getByRole("button", { name: scenario === "pages" ? "项目第二页" : "已确认的新题" })).toBeVisible()
    expect(projectReads()).toHaveLength(readsBeforeNavigation + (scenario === "pending rename" ? 1 : 0))
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})

it("global New task leaves the project untouched and resets only the admitted direct target", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const direct = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const projectRef = "project_00000000-0000-4000-8000-000000000888"
  const project = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef } })
  const projectReset = vi.spyOn(project, "newConversation")
  const directReset = vi.spyOn(direct, "newConversation")
  const factory = vi.spyOn(pageClients, "browserEngine").mockReturnValue(direct)
  const release = vi.fn()
  vi.spyOn(pageClients, "retainBrowserEngine").mockReturnValue(release)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "global-new-reader")
  window.history.replaceState({}, "", `/app/project/${projectRef}?conversation=old-project-task`)
  const clearDraft = vi.fn()
  const view = renderHook(() => useAppFrameActions({
    engine: project, projectWorkspace: true, projectRef,
    readBoundary: { admitted: true, subject: "global-new-reader", generation: 1 },
    standaloneSurface: false, chatHref: "/app", activeId: null, draft: "project draft", clearDraft,
    updateDraft: vi.fn(), setDeploymentIntent: vi.fn(), syncConversationUrl: vi.fn(),
    setConversationRouteId: vi.fn(), focusComposer: vi.fn(), closeSettings: vi.fn(),
    brandName: "Kokoro", commandNewChatTimerRef: { current: null },
  }), { wrapper: LocaleProvider })
  try {
    act(() => view.result.current.startNewChatWithUrl())
    expect(window.location.pathname + window.location.search).toBe("/app")
    expect(directReset).toHaveBeenCalledTimes(1)
    expect(projectReset).not.toHaveBeenCalled()
    expect(clearDraft).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
    factory.mockClear()
    window.history.replaceState({}, "", `/app/project/${projectRef}`)
    window.localStorage.setItem("kokoro.web.auth-index-subject", "another-reader")
    act(() => view.result.current.startNewChatWithUrl())
    expect(window.location.pathname).toBe(`/app/project/${projectRef}`)
    expect(factory).not.toHaveBeenCalled()
    expect(directReset).toHaveBeenCalledTimes(1)
  } finally {
    view.unmount(); direct.dispose(); project.dispose(); vi.restoreAllMocks()
    window.history.replaceState({}, "", "/app")
  }
})

it("project overview draft and explicit new-conversation draft remain distinct after Home and project entry", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000801"
  const projectPath = `/app/project/${projectRef}`
  const draftsKey = "kokoro.web.drafts"
  const rootKey = `__project__:${encodeURIComponent(projectRef)}`
  window.localStorage.setItem("kokoro.web.auth-index-subject", "project-draft-reader")
  window.history.replaceState({}, "", projectPath)
  const projectClient = createFakeClient()
  const projectStorage = createMemoryStorage<ConversationStore>(null)
  const projectEngine = createSessionEngine({ client: projectClient, storage: projectStorage, scope: { kind: "project", projectRef } })
  const frame = (project: boolean) => <ThemeProvider><LocaleProvider><AppFrame engine={project ? projectEngine : engine} chatHref="/app" projectWorkspace={project} {...(project ? { projectRef } : {})} /></LocaleProvider></ThemeProvider>
  const view = render(frame(true))
  try {
    const composer = () => screen.getByRole("textbox", { name: "对话输入" })
    const rootDraft = "root overview first\nroot overview second"
    fireEvent.change(composer(), { target: { value: rootDraft } })
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? "{}")[rootKey]).toBe(rootDraft))
    act(() => {
      projectEngine.newConversation()
      const id = projectEngine.getSnapshot().store?.activeId
      window.history.pushState({}, "", `${projectPath}?conversation=${encodeURIComponent(id!)}`)
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    const convB = projectEngine.getSnapshot().store?.activeId
    expect(convB).toMatch(/^conv_/u)
    expect(new URL(window.location.href).searchParams.get("conversation")).toBe(convB)
    expect(composer()).toHaveValue("")
    const convDraft = "new project conversation B"
    fireEvent.change(composer(), { target: { value: convDraft } })
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? "{}")[convB!]).toBe(convDraft))
    act(() => window.history.pushState({}, "", "/app"))
    view.rerender(frame(false))
    fireEvent.change(composer(), { target: { value: "independent Home draft" } })
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? "{}").__pending__).toBe("independent Home draft"))
    act(() => window.history.pushState({}, "", projectPath))
    view.rerender(frame(true))
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
    expect(new URL(window.location.href).searchParams.has("conversation")).toBe(false)
    expect(composer()).toHaveValue(rootDraft)
    expect(JSON.parse(window.localStorage.getItem(draftsKey) ?? "{}")[convB!]).toBe(convDraft)
    expect(projectClient.createCalls).toHaveLength(0)
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})

it.each([false, true])("missing conversation deep link does not render an editable new task; retry reads only its ID (project=%s)", async (project) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000802"
  const id = "conv_00000000-0000-4000-8000-000000000803"
  const path = project ? `/app/project/${projectRef}` : "/app"
  window.history.replaceState({}, "", `${path}?conversation=${id}`)
  mountFrame({ ...(project ? { projectWorkspace: true, projectRef } : {}),
    emptyState: () => <div>workspace overview</div>,
  })
  await waitFor(() => expect(screen.getByRole("heading", { name: "未找到该会话" })).toBeInTheDocument())
  expect(screen.queryByText("workspace overview")).not.toBeInTheDocument()
  expect(screen.queryByRole("textbox", { name: "对话输入" })).not.toBeInTheDocument()
  expect(window.location.pathname + window.location.search).toBe(`${path}?conversation=${id}`)
  const knownIds = engine.getSnapshot().store?.conversations.map(entry => entry.id)
  client.nextSnapshot = sessionId => Promise.resolve(makeSnapshot({ sessionId }))
  fireEvent.click(screen.getByRole("button", { name: /^重试$/ }))
  await waitFor(() => expect(screen.queryByRole("heading", { name: "未找到该会话" })).not.toBeInTheDocument())
  expect(client.snapshotCalls).toEqual([id, id])
  expect(engine.getSnapshot().store?.conversations.map(entry => entry.id)).toEqual(knownIds)
  expect(client.createCalls).toEqual([])
  expect(window.location.pathname + window.location.search).toBe(`${path}?conversation=${id}`)
  expect(screen.getByRole("textbox", { name: "对话输入" })).toBeInTheDocument()
})

it("explicit project conversation hydration owns only its requested draft, never the remembered task while pending", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000802"
  const convA = "conv_00000000-0000-4000-8000-000000000803"
  const convB = "conv_00000000-0000-4000-8000-000000000804"
  const projectClient = createFakeClient()
  let resolveA!: (value: ReturnType<typeof makeSnapshot>) => void
  projectClient.nextSnapshot = (id) => id === convA ? new Promise((resolve) => { resolveA = resolve }) : Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "remembered B", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "project-draft-reader")
  window.localStorage.setItem("kokoro.web.drafts", JSON.stringify({ [convA]: "explicit A draft", [convB]: "remembered B draft" }))
  window.history.replaceState({}, "", `/app/project/${projectRef}?conversation=${convA}`)
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>)
  try {
    await waitFor(() => expect(resolveA).toBeTypeOf("function"))
    expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveValue("explicit A draft")
    expect(projectClient.createCalls).toHaveLength(0)
    await act(async () => { resolveA(makeSnapshot({ sessionId: convA })); await Promise.resolve() })
    await waitFor(() => expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveValue("explicit A draft"))
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convA)
    expect(projectClient.createCalls).toHaveLength(0)
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})

it("project overview rail does not synthesize the engine's remembered active conversation as a selected row", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000807"
  const remembered = "conv_00000000-0000-4000-8000-000000000808"
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = (id) => Promise.resolve(makeSnapshot({ sessionId: id, title: "remembered direct-looking row" }))
  const projectEngine = createSessionEngine({
    client: projectClient,
    storage: createMemoryStorage<ConversationStore>({
      activeId: remembered,
      conversations: [{ id: remembered, title: "remembered direct-looking row", mode: "fast", updatedAt: 1000 }],
    }),
    scope: { kind: "project", projectRef },
  })
  projectEngine.openConversation(remembered)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserListClient").mockReturnValue({
    ...projectClient,
    listSessions: vi.fn().mockResolvedValue({ sessions: [], next_cursor: null }),
  })
  stubBusinessFetch(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    data: { projects: [{ id: projectRef, name: "Overview project", slug: "overview-project", description: "",
      created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z" }] },
    meta: { request_id: "req-overview-project" },
  }), { status: 200, headers: { "content-type": "application/json" } })))
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app"
    desktopRailCollapsed={false} projectWorkspace projectRef={projectRef}
    projectReadBoundary={{ admitted: true, subject: "overview-reader", generation: 1 }} />
  </LocaleProvider></ThemeProvider>)
  try {
    await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
    expect(document.querySelector('[aria-label="会话导航"]')).toBeInTheDocument()
    expect(new URL(window.location.href).searchParams.get("conversation")).toBeNull()
    expect(screen.queryByRole("button", { name: "remembered direct-looking row" })).toBeNull()
  } finally {
    view.unmount()
    projectEngine.dispose()
  }
})

it("an explicit project overview submission creates a fresh target instead of posting to its hidden remembered conversation", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000805"
  const convB = "conv_00000000-0000-4000-8000-000000000806"
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = (id) => Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "hidden old task", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "project-draft-reader")
  window.localStorage.setItem("kokoro.web.drafts", JSON.stringify({ [`__project__:${encodeURIComponent(projectRef)}`]: "root overview submission" }))
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>)
  try {
    await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
    const composer = screen.getByRole("textbox", { name: "对话输入" })
    fireEvent.change(composer, { target: { value: "root overview submission" } })
    fireEvent.keyDown(composer, { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(projectClient.createCalls[0]?.sessionId).not.toBe(convB)
    expect(new URL(window.location.href).searchParams.get("conversation")).toBe(projectClient.createCalls[0]?.sessionId)
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})


function mountProjectSubmitBoundary(projectEngine: SessionEngine, projectRef: string, conversation: string | null = null, projectWorkspace = true) {
  const clearDraft = vi.fn()
  const syncConversationUrl = vi.fn()
  const setConversationRouteId = vi.fn()
  const options = {
    engine: projectEngine, projectWorkspace, projectRef, routedConversationId: conversation,
    standaloneSurface: false, chatHref: "/app", activeId: projectEngine.getSnapshot().store?.activeId ?? null,
    draft: "new root intent", clearDraft, updateDraft: vi.fn(), setDeploymentIntent: vi.fn(),
    syncConversationUrl, setConversationRouteId,
    focusComposer: vi.fn(), closeSettings: vi.fn(), brandName: "Kokoro", commandNewChatTimerRef: { current: null },
  }
  const view = renderHook(() => useAppFrameActions(options), { wrapper: LocaleProvider })
  return { ...view, clearDraft, syncConversationUrl, setConversationRouteId }
}

it.each([false, true])("a retained submit handler cannot send a hydrating or missing explicit task (project=%s)", async projectWorkspace => {
  const projectRef = "project_missing-submit"
  const id = "conv_missing-submit"
  window.history.replaceState({}, "", `${projectWorkspace ? `/app/project/${projectRef}` : "/app"}?conversation=${id}`)
  let read!: (value: null) => void
  client.nextSnapshot = () => new Promise(resolve => { read = resolve })
  engine.openConversation(id)
  const view = mountProjectSubmitBoundary(engine, projectRef, id, projectWorkspace)
  const submit = () => view.result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>)
  act(submit)
  expect(client.createCalls).toEqual([])
  await act(async () => { read(null); await settle() })
  act(submit)
  expect(client.createCalls).toEqual([])
  expect(view.clearDraft).not.toHaveBeenCalled()
  expect(engine.getSnapshot().store?.activeId).toBe(id)
  view.unmount()
})

it.each(["pending", "unknown", "active", "reconnecting", "disposed"] as const)("project overview preserves hidden %s state instead of resetting it for a new submission", async (state) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000811"
  const convB = "conv_00000000-0000-4000-8000-000000000812"
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "boundary-actor")
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "existing intent", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  let release!: (receipt: ReturnType<typeof makeReceipt>) => void
  if (state === "unknown") projectClient.nextCreate = () => Promise.reject(new Error("unknown transport outcome"))
  if (state === "pending") projectClient.nextCreate = () => new Promise(resolve => { release = resolve })
  await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
  if (state === "disposed") projectEngine.dispose()
  else {
    expect(projectEngine.submit("original hidden intent")).toBe(true)
    if (state === "unknown") await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
    if (state === "active" || state === "reconnecting") {
      await waitFor(() => expect(projectClient.streams).toHaveLength(1))
      if (state === "reconnecting") projectClient.lastStream().reconnecting()
    }
  }
  const before = projectEngine.getSnapshot()
  const calls = structuredClone(projectClient.createCalls)
  const reset = vi.spyOn(projectEngine, "newConversation")
  const view = mountProjectSubmitBoundary(projectEngine, projectRef)
  try {
    act(() => view.result.current.submitDraft())
    expect(reset).not.toHaveBeenCalled()
    expect(projectClient.createCalls).toEqual(calls)
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
    expect(projectEngine.getSnapshot().machine).toEqual(before.machine)
    expect(projectEngine.getSnapshot().thread.messages).toEqual(before.thread.messages)
    expect(view.clearDraft).not.toHaveBeenCalled()
    expect(view.syncConversationUrl).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
    if (state === "unknown") {
      projectClient.nextCreate = () => Promise.resolve(makeReceipt("run_explicit_retry"))
      act(() => projectEngine.retry())
      expect(projectClient.createCalls).toHaveLength(2)
      expect(projectClient.createCalls[1]).toEqual(calls[0])
      await waitFor(() => expect(projectClient.streams).toHaveLength(1))
    }
    if (state === "pending") {
      await act(async () => { release(makeReceipt("run_original_pending")); await Promise.resolve() })
      expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
      expect(projectClient.createCalls).toEqual(calls)
    }
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})

it.each(["route", "actor", "explicit-mismatch"] as const)("a late project submit callback rejects %s changes without mutating the hidden engine", async (change) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000813"
  const convB = "conv_00000000-0000-4000-8000-000000000814"
  const convA = "conv_00000000-0000-4000-8000-000000000815"
  window.history.replaceState({}, "", `/app/project/${projectRef}${change === "explicit-mismatch" ? `?conversation=${convA}` : ""}`)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor-A")
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "hidden B", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
  const view = mountProjectSubmitBoundary(projectEngine, projectRef, change === "explicit-mismatch" ? convA : null)
  const callback = view.result.current.submitDraft
  const reset = vi.spyOn(projectEngine, "newConversation")
  try {
    if (change === "route") window.history.pushState({}, "", `/app/project/${projectRef}?conversation=${convB}`)
    if (change === "actor") window.localStorage.setItem("kokoro.web.auth-index-subject", "actor-B")
    act(() => callback())
    expect(projectClient.createCalls).toHaveLength(0)
    expect(reset).not.toHaveBeenCalled()
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
    expect(view.clearDraft).not.toHaveBeenCalled()
    expect(view.syncConversationUrl).not.toHaveBeenCalled()
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})


it("fresh overview admission keeps original text and retry identity after an unknown receipt, without revisiting or clearing a newer route", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000817"
  const convB = "conv_00000000-0000-4000-8000-000000000818"
  const convQ = "conv_00000000-0000-4000-8000-000000000819"
  const rootKey = `__project__:${encodeURIComponent(projectRef)}`
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  projectClient.nextCreate = () => Promise.reject(new Error("unknown create receipt"))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "old idle task", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "fresh-overview-actor")
  window.localStorage.setItem("kokoro.web.drafts", JSON.stringify({ [rootKey]: "fresh original overview text", [convB]: "private old B" }))
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const frame = () => <ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>
  const view = render(frame())
  try {
    await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
    const composer = screen.getByRole("textbox", { name: "对话输入" })
    expect(composer).toHaveValue("fresh original overview text")
    fireEvent.keyDown(composer, { key: "Enter" })
    await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
    const original = structuredClone(projectClient.createCalls[0])
    expect(original?.sessionId).not.toBe(convB)
    expect(new URL(window.location.href).searchParams.get("conversation")).toBe(original?.sessionId)
    expect(JSON.stringify(projectEngine.getSnapshot().thread.messages)).toContain("fresh original overview text")
    const drafts = JSON.parse(window.localStorage.getItem("kokoro.web.drafts") ?? "{}")
    expect(drafts[rootKey]).toBeUndefined()
    expect(drafts[convB]).toBe("private old B")
    let acknowledge!: (receipt: ReturnType<typeof makeReceipt>) => void
    projectClient.nextCreate = () => new Promise(resolve => { acknowledge = resolve })
    act(() => projectEngine.retry())
    expect(projectClient.createCalls).toHaveLength(2)
    expect(projectClient.createCalls[1]).toEqual(original)
    act(() => {
      window.history.pushState({}, "", `/app/project/${projectRef}?conversation=${convQ}`)
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    view.rerender(frame())
    await waitFor(() => expect(projectEngine.getSnapshot().store?.activeId).toBe(convQ))
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "newer Q draft" } })
    await act(async () => { acknowledge(makeReceipt("run_late_original")); await Promise.resolve() })
    expect(window.location.search).toBe(`?conversation=${convQ}`)
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convQ)
    expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveValue("newer Q draft")
    expect(projectClient.createCalls).toHaveLength(2)
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("kokoro.web.drafts") ?? "{}")[convQ]).toBe("newer Q draft"))
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})


it("an explicit overview send carries the user's thinking mode into its fresh conversation", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000821"
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "thinking-actor")
  const projectClient = createFakeClient()
  const remembered = "conv_00000000-0000-4000-8000-000000000822"
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: remembered, conversations: [{ id: remembered, title: "blank remembered task", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>)
  try {
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模式/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /深度思考/ }))
    expect(projectEngine.getSnapshot().store?.conversations.find(entry => entry.id === remembered)?.mode).toBe("fast")
    const composer = screen.getByRole("textbox", { name: "对话输入" })
    fireEvent.change(composer, { target: { value: "explicit thinking overview" } })
    fireEvent.keyDown(composer, { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(projectClient.createCalls[0]?.body.thinking).toBe(true)
    expect(new URL(window.location.href).searchParams.get("conversation")).toBe(projectClient.createCalls[0]?.sessionId)
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})

it.each(["pending", "unknown", "active"] as const)("project history returning to overview retains the original %s conversation without a ghost or RESET", async (state) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000823"
  const convB = "conv_00000000-0000-4000-8000-000000000824"
  window.history.replaceState({}, "", `/app/project/${projectRef}?conversation=${convB}`)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "history-actor")
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "original history task", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>)
  let release!: (receipt: ReturnType<typeof makeReceipt>) => void
  try {
    await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
    if (state === "pending") projectClient.nextCreate = () => new Promise(resolve => { release = resolve })
    if (state === "unknown") projectClient.nextCreate = () => Promise.reject(new Error("unknown history receipt"))
    act(() => { expect(projectEngine.submit("original query intent")).toBe(true) })
    if (state === "unknown") await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
    if (state === "active") await waitFor(() => expect(projectClient.streams).toHaveLength(1))
    const before = projectEngine.getSnapshot()
    const original = structuredClone(projectClient.createCalls[0])
    const reset = vi.spyOn(projectEngine, "newConversation")
    act(() => {
      window.history.pushState({}, "", `/app/project/${projectRef}`)
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(reset).not.toHaveBeenCalled()
    expect(window.location.search).toBe("")
    expect(projectEngine.getSnapshot().store).toEqual(before.store)
    expect(projectEngine.getSnapshot().machine).toEqual(before.machine)
    expect(projectEngine.getSnapshot().thread.messages).toEqual(before.thread.messages)
    expect(projectClient.createCalls).toHaveLength(1)
    if (state === "unknown") {
      expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true)
      projectClient.nextCreate = () => Promise.resolve(makeReceipt("run_history_retry"))
      act(() => projectEngine.retry())
      expect(projectClient.createCalls[1]).toEqual(original)
      await waitFor(() => expect(projectClient.streams).toHaveLength(1))
    }
    if (state === "pending") {
      await act(async () => { release(makeReceipt("run_history_pending")); await Promise.resolve() })
      expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
      expect(projectClient.createCalls).toHaveLength(1)
    }
    if (state === "active") expect(projectClient.lastStream().closed).toBe(false)
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})


it.each(["unknown", "active"] as const)("project overview Send visibly disables hidden %s state instead of accepting a click its action rejects", async (state) => {
  const projectRef = "project_00000000-0000-4000-8000-000000000825"
  const convB = "conv_00000000-0000-4000-8000-000000000826"
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "send-admission-actor")
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>({ activeId: convB, conversations: [{ id: convB, title: "hidden original task", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "project", projectRef } })
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>)
  try {
    await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
    if (state === "unknown") projectClient.nextCreate = () => Promise.reject(new Error("unknown original receipt"))
    act(() => { expect(projectEngine.submit("original hidden task")).toBe(true) })
    if (state === "unknown") await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
    if (state === "active") await waitFor(() => expect(projectClient.streams).toHaveLength(1))
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "root cannot reset this task" } })
    expect(screen.getByRole("button", { name: /发送消息|发送插话/ })).toBeDisabled()
    expect(projectClient.createCalls).toHaveLength(1)
    expect(projectEngine.getSnapshot().store?.activeId).toBe(convB)
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})

it("R254 项目会话嵌套在项目行，直接会话仍独立并只更新直接路由", async () => {
  const alpha = projectReadFixtures[0]!
  const directId = "conv_flat_direct"
  const projectEngine = createSessionEngine({
    client: createFakeClient(),
    storage: createMemoryStorage<ConversationStore>(null),
    scope: { kind: "project", projectRef: alpha.id },
  })
  window.history.replaceState({}, "", `/app/project/${alpha.id}`)
  pathname.value = window.location.pathname
  window.localStorage.setItem("kokoro.web.auth-index-subject", "flat-rail-reader")
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    if (url.pathname === "/api/hub/projects") return projectReadEnvelope()
    if (url.pathname.endsWith("/instruction-revisions")) {
      return Response.json({ data: { items: [] }, meta: { request_id: "req_flat_rail_instructions" } })
    }
    if (url.pathname === "/sessions") {
      return Response.json({
        sessions: [{ session_id: directId, title: "外部普通持久会话", updated_at: "2026-10-01T00:00:00.000Z" }],
        next_cursor: null,
      })
    }
    return Response.json({ error: { code: "unavailable" } }, { status: 503 })
  })
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(createSessionClient({ baseUrl: "http://s.local" }))
  const view = render(<ThemeProvider><LocaleProvider><AppFrame
    engine={projectEngine} chatHref="/app" desktopRailCollapsed={false}
    projectWorkspace projectRef={alpha.id}
    projectReadBoundary={{ admitted: true, subject: "flat-rail-reader", generation: 1 }}
  /></LocaleProvider></ThemeProvider>)
  try {
    const project = await screen.findByRole("link", { name: `新对话 · ${alpha.name}` })
    const projectRow = project.closest("[data-project-id]")
    expect(within(projectRow as HTMLElement).getByRole("button", { name: alpha.name })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("navigation", { name: "项目会话" })).toHaveAttribute("data-conversation-list", "project-conversation")
    const direct = screen.getByRole("navigation", { name: "直接会话" })
    const row = await within(direct).findByRole("button", { name: "外部普通持久会话" })
    fireEvent.click(row)
    expect(`${window.location.pathname}${window.location.search}`).toBe(`/app?conversation=${directId}`)
  } finally {
    view.unmount()
    projectEngine.dispose()
    fetchMock.mockRestore()
  }
})

it.each(["library", "leave"] as const)("R254 Move %s只改owner绑定并刷新所属清单，不把隐藏记忆ID或迟到ACK当当前叶抢导航", async (surface) => {
  const p = "project_00000000-0000-4000-8000-000000000901"
  const q = "project_00000000-0000-4000-8000-000000000902"
  const remembered = "conv_00000000-0000-4000-8000-000000000903"
  const target = p
  const originalRoute = surface === "library" ? "/app/library" : `/app?conversation=${remembered}`
  window.history.replaceState({}, "", originalRoute)
  pathname.value = window.location.pathname
  window.localStorage.setItem("kokoro.web.auth-index-subject", "move-route-reader")
  const execution = createFakeClient()
  execution.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id }))
  const rememberedEngine = createSessionEngine({ client: execution, storage: createMemoryStorage<ConversationStore>({ activeId: remembered, conversations: [{ id: remembered, title: "记忆会话", mode: "fast", updatedAt: 1000 }] }), scope: { kind: "direct" } })
  let acknowledge!: (response: Response) => void
  let confirmed = false
  const moveRequests: { key: string | null; body: string | undefined }[] = []
  const reads: string[] = []
  const ownerProjects = [p, q].map((id, index) => ({ id, name: index === 0 ? "项目P" : "项目Q", slug: `p${index}`, description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }))
  const response = () => Response.json({ session_id: remembered, project_ref: target })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    if (url.pathname === "/api/hub/projects") return Response.json({ data: { projects: ownerProjects }, meta: { request_id: "req_move_route" } })
    if (url.pathname.endsWith("/move")) {
      moveRequests.push({ key: new Headers(init?.headers).get("idempotency-key"), body: typeof init?.body === "string" ? init.body : undefined })
      return new Promise<Response>(resolve => { acknowledge = resolve })
    }
    if (url.pathname === "/sessions") {
      const own = url.searchParams.get("project_ref")
      const source = null
      reads.push(own ?? "direct")
      return Response.json({ sessions: (!confirmed && own === source) || (confirmed && own === target) ? [{ session_id: remembered, title: "记忆会话", updated_at: "2026-10-01T00:00:00Z" }] : [], next_cursor: null })
    }
    return Response.json({}, { status: 503 })
  })
  vi.spyOn((await import("@/ui/shell/page-clients")), "browserListClient").mockReturnValue(createSessionClient({ baseUrl: "http://s.local" }))
  const LibraryProbe = () => <div data-testid="move-library-content">资料库内容保持</div>
  const frame = (catalog = surface === "library") => <ThemeProvider><LocaleProvider><AppFrame engine={rememberedEngine} chatHref="/app" desktopRailCollapsed={false} projectWorkspace={false} projectReadBoundary={{ admitted: true, subject: "move-route-reader", generation: 1 }} {...(catalog ? { standaloneSurface: true, emptyState: LibraryProbe, emptyStateOwnsComposer: true } : {})} /></LocaleProvider></ThemeProvider>
  const view = render(frame())
  try {
    await waitFor(() => expect(rememberedEngine.getSnapshot().hydrating).toBe(false))
    await screen.findByRole("link", { name: "新对话 · 项目Q" })
    const row = await screen.findByRole("button", { name: "更多 · 记忆会话" })
    fireEvent.keyDown(row, { key: "Enter", code: "Enter" })
    const move = await screen.findByRole("menuitem", { name: "移动会话 记忆会话" })
    move.focus()
    fireEvent.keyDown(move, { key: "ArrowRight" })
    fireEvent.click(await screen.findByRole("menuitem", { name: target === p ? "项目P" : "项目Q" }))
    await waitFor(() => expect(moveRequests).toHaveLength(1))
    if (surface === "leave") {
      act(() => {
        window.history.pushState({}, "", "/app/library")
        window.dispatchEvent(new Event("kokoro:surface-navigation"))
      })
      pathname.value = "/app/library"
      view.rerender(frame(true))
      expect(screen.getByTestId("move-library-content")).toBeInTheDocument()
    }
    const visibleRoute = `${window.location.pathname}${window.location.search}`
    const sourceReads = reads.filter(scope => scope === "direct").length
    confirmed = true
    await act(async () => { acknowledge(response()); await Promise.resolve() })
    await waitFor(() => expect(reads.filter(scope => scope === "direct").length).toBeGreaterThan(sourceReads))
    expect(`${window.location.pathname}${window.location.search}`).toBe(visibleRoute)
    if (surface === "library" || surface === "leave") expect(screen.getByTestId("move-library-content")).toBeInTheDocument()
    expect(moveRequests).toHaveLength(1)
    expect(execution.createCalls).toEqual([])
  } finally { if (acknowledge) acknowledge(response()); view.unmount(); rememberedEngine.dispose() }
})

it("ordinary account capability read uses its own exact endpoint and exposes no Admin entry", async () => {
  stubBusinessFetch(vi.fn<typeof fetch>(async () => Response.json({ sessions: [], next_cursor: null })))
  mountFrame({ desktopRailCollapsed: false })
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

import * as pageClients from "@/ui/shell/page-clients";
function set36StubSuccessfulSessionList() {
  const listClient = { ...client, listSessions: vi.fn().mockResolvedValue({ sessions: [], next_cursor: null }) };
  return vi.spyOn(pageClients, "browserListClient").mockReturnValue(listClient);
}
function set36BuildEngine(initial: ConversationStore | null = null) {
  engine.dispose();
  client = createFakeClient();
  let idCounter = 0;
  engine = createSessionEngine({
    client,
    storage: createMemoryStorage<ConversationStore>(initial),
    now: () => 1_000,
    createId: (prefix) => `${prefix}_${(idCounter += 1)}`,
  });
}

// SET36-BEGIN: copy-current-persisted-task-link
const set36TaskId = "ses_copy_current";
const set36Boundary = { admitted: true, subject: "local-user", generation: 1 };
async function set36PrepareTask(persisted = true) {
  engine.dispose();
  client = createFakeClient();
  client.nextSnapshot = async () => persisted ? makeSnapshot({
    sessionId: set36TaskId,
    messages: [{ message_id: "copy-message", role: "assistant", run_id: "copy-run", content: "current persisted task", status: "completed", created_at: "2026-07-02T00:00:01Z" }],
  }) : null;
  engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(addConversation(null, set36TaskId, 500)), now: () => 1_000, createId: (prefix) => `${prefix}_copy` });
  await settle();
  if (persisted) expect(engine.getSnapshot().thread.meta).not.toBeNull();
  window.localStorage.setItem("kokoro.web.auth-index-subject", "local-user");
}
function set36Frame(props: Partial<Parameters<typeof AppFrame>[0]> = {}) {
  return <ThemeProvider><LocaleProvider><AppFrame engine={engine} chatHref="/app" projectReadBoundary={set36Boundary} {...props} /></LocaleProvider></ThemeProvider>;
}
function set36Route(url = `/app?conversation=${set36TaskId}&unrelated=discard`) {
  window.history.replaceState(null, "", url);
  pathname.value = new URL(window.location.href).pathname;
}
function set36Press(options: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key: "L", ctrlKey: true, shiftKey: true, ...options });
}
function set36Clipboard(writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined)) {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return { writeText, restore: () => { if (previous) Object.defineProperty(navigator, "clipboard", previous); else Reflect.deleteProperty(navigator, "clipboard"); } };
}
it.each([false, true])("SET36 copies canonical same-origin %s project task URL once without shares", async (project) => {
  await set36PrepareTask();
  const path = project ? "/app/project/project-copy" : "/app";
  set36Route(`${path}?conversation=${set36TaskId}&unrelated=discard`);
  const clipboard = set36Clipboard();
  const createShare = vi.spyOn(client, "createShare");
  const revokeShare = vi.spyOn(client, "revokeShare");
  const lists = set36StubSuccessfulSessionList();
  try {
    render(set36Frame(project ? { projectWorkspace: true, projectRef: "project-copy" } : { chatHref: `${window.location.origin}/app` }));
    set36Press();
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}${path}?conversation=${set36TaskId}`));
    const copied = await screen.findByText("任务链接已复制", { exact: true });
    expect(copied.closest('[role="status"]')).toBeVisible();
    expect(createShare).not.toHaveBeenCalled();
    expect(revokeShare).not.toHaveBeenCalled();
  } finally { cleanup(); lists.mockRestore(); createShare.mockRestore(); revokeShare.mockRestore(); clipboard.restore(); }
});
it.each([
  { label: "missing boundary", props: { projectReadBoundary: undefined } },
  { label: "withdrawn", props: { projectReadBoundary: { ...set36Boundary, admitted: false } } },
  { label: "blank subject", props: { projectReadBoundary: { ...set36Boundary, subject: " " } } },
  { label: "invalid generation", props: { projectReadBoundary: { ...set36Boundary, generation: -1 } } },
  { label: "foreign chatHref", props: { chatHref: "https://foreign.invalid/app" } },
  { label: "standalone", props: { standaloneSurface: true } },
])("SET36 $label has zero clipboard calls", async ({ props }) => {
  await set36PrepareTask(); set36Route();
  const clipboard = set36Clipboard(); const lists = set36StubSuccessfulSessionList();
  try { render(set36Frame(props as Partial<Parameters<typeof AppFrame>[0]>)); set36Press(); await act(async () => settle()); expect(clipboard.writeText).not.toHaveBeenCalled(); }
  finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it.each([
  `/app?conversation=${set36TaskId}&conversation=${set36TaskId}`,
  "/app?conversation=another-task",
  "/app",
  `/app/project/wrong?conversation=${set36TaskId}`,
])("SET36 wrong or ambiguous visible route %s has zero clipboard calls", async (route) => {
  await set36PrepareTask(); set36Route(route);
  const clipboard = set36Clipboard(); const lists = set36StubSuccessfulSessionList();
  try { render(set36Frame()); set36Route(route); set36Press(); await act(async () => settle()); expect(clipboard.writeText).not.toHaveBeenCalled(); }
  finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 an unsaved local placeholder never grants task-link copying", async () => {
  set36BuildEngine(addConversation(null, set36TaskId, 500)); await settle(); set36Route();
  expect(engine.getSnapshot().thread.meta).toBeNull();
  const clipboard = set36Clipboard(); const lists = set36StubSuccessfulSessionList();
  try { render(set36Frame({ preview: true })); set36Press(); await act(async () => settle()); expect(clipboard.writeText).not.toHaveBeenCalled(); }
  finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 marker mismatch cannot grant task copying", async () => {
  await set36PrepareTask(); set36Route(); localStorage.setItem("kokoro.web.auth-index-subject", "other-user");
  const clipboard = set36Clipboard(); const lists = set36StubSuccessfulSessionList();
  try { render(set36Frame()); set36Press(); await act(async () => settle()); expect(clipboard.writeText).not.toHaveBeenCalled(); }
  finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 actual keyboard guards reject typing dialogs repeats IME and prevented events", async () => {
  await set36PrepareTask(); set36Route();
  const clipboard = set36Clipboard(); const lists = set36StubSuccessfulSessionList();
  const input = document.createElement("textarea"); const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(input, dialog);
  try {
    render(set36Frame());
    for (const target of [input, dialog]) fireEvent.keyDown(target, { key: "L", ctrlKey: true, shiftKey: true });
    set36Press({ repeat: true }); set36Press({ isComposing: true }); set36Press({ shiftKey: false });
    const prevented = new KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true, cancelable: true }); prevented.preventDefault(); window.dispatchEvent(prevented);
    await act(async () => settle()); expect(clipboard.writeText).not.toHaveBeenCalled();
  } finally { input.remove(); dialog.remove(); cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 clipboard rejection reports failure rather than copied success", async () => {
  await set36PrepareTask(); set36Route();
  const clipboard = set36Clipboard(vi.fn<(value: string) => Promise<void>>().mockRejectedValue(new Error("permission denied"))); const lists = set36StubSuccessfulSessionList();
  try {
    render(set36Frame()); set36Press();
    const copyFailure = await screen.findByText(/^无法复制任务链接/u);
    expect(copyFailure.closest('[role="alert"]')).toBeVisible();
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("任务链接已复制")).toBeNull();
  } finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 in-flight duplicate suppression and identity retirement prevent late copied feedback", async () => {
  await set36PrepareTask(); set36Route();
  let resolve!: () => void;
  const clipboard = set36Clipboard(vi.fn<(value: string) => Promise<void>>(() => new Promise<void>((done) => { resolve = done; }))); const lists = set36StubSuccessfulSessionList();
  try {
    const view = render(set36Frame()); set36Press(); set36Press();
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    view.rerender(set36Frame({ projectReadBoundary: { ...set36Boundary, generation: 2, admitted: false } }));
    await act(async () => { resolve(); await settle(); });
    expect(screen.queryByText("任务链接已复制")).toBeNull();
    set36Press(); expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  } finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 navigation retirement prevents late clipboard failure from resurfacing", async () => {
  await set36PrepareTask(); set36Route();
  let reject!: (error: Error) => void;
  const clipboard = set36Clipboard(vi.fn<(value: string) => Promise<void>>(() => new Promise<void>((_, fail) => { reject = fail; }))); const lists = set36StubSuccessfulSessionList();
  try {
    const view = render(set36Frame()); set36Press(); expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    set36Route("/app"); act(() => window.dispatchEvent(new Event("popstate"))); view.rerender(set36Frame());
    await act(async () => { reject(new Error("late denied")); await settle(); });
    expect(screen.queryByText(/无法复制任务链接/u)).toBeNull();
  } finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 missing clipboard support reports an explicit failure", async () => {
  await set36PrepareTask(); set36Route();
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  const lists = set36StubSuccessfulSessionList();
  try {
    render(set36Frame()); set36Press();
    const copyFailure = await screen.findByText(/^无法复制任务链接/u);
    expect(copyFailure.closest('[role="alert"]')).toBeVisible();
    expect(screen.queryByText("任务链接已复制")).toBeNull();
  } finally { cleanup(); lists.mockRestore(); if (previous) Object.defineProperty(navigator, "clipboard", previous); else Reflect.deleteProperty(navigator, "clipboard"); }
});
it("SET36 pending owner hydration is not a persisted visible task", async () => {
  await set36PrepareTask(); set36Route();
  let finish!: (snapshot: ReturnType<typeof makeSnapshot>) => void;
  client.nextSnapshot = () => new Promise((resolve) => { finish = resolve; });
  engine.openConversation("ses_other_pending");
  set36Route("/app?conversation=ses_other_pending");
  expect(engine.getSnapshot().hydrating).toBe(true);
  const clipboard = set36Clipboard(); const lists = set36StubSuccessfulSessionList();
  try { render(set36Frame()); set36Press(); await act(async () => settle()); expect(clipboard.writeText).not.toHaveBeenCalled(); }
  finally { cleanup(); finish(makeSnapshot({ sessionId: "ses_other_pending" })); await settle(); lists.mockRestore(); clipboard.restore(); }
});
it("SET36 unmount retires a clipboard promise that ignores the view lifetime", async () => {
  await set36PrepareTask(); set36Route();
  let resolve!: () => void;
  const clipboard = set36Clipboard(vi.fn<(value: string) => Promise<void>>(() => new Promise<void>((done) => { resolve = done; }))); const lists = set36StubSuccessfulSessionList();
  try {
    const view = render(set36Frame()); set36Press(); expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    view.unmount(); await act(async () => { resolve(); await settle(); });
    expect(screen.queryByText("任务链接已复制")).toBeNull();
    expect(screen.queryByText(/无法复制任务链接/u)).toBeNull();
  } finally { cleanup(); lists.mockRestore(); clipboard.restore(); }
});
// SET36-END: copy-current-persisted-task-link

const executableTrial = {
  skill_id: "trial-series", revision_skill_id: "trial-version", source_ref: "skill:trial-version",
  installed_source_ref: "skill:trial-version", installation_id: "trial-installation",
  name: "Owner trial", description: "Owner description", content_hash: "digest", scope: "personal", enabled: true,
}

function trialActions(trialEngine = engine, preview = false, projectRef?: string, strict = false) {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "trial-actor")
  const updateDraft = vi.fn()
  const closeSettings = vi.fn()
  const syncConversationUrl = vi.fn()
  const view = renderHook(({ admitted, generation }) => useAppFrameActions({
    engine: trialEngine, preview, readBoundary: { admitted, subject: "trial-actor", generation },
    projectWorkspace: projectRef !== undefined, ...(projectRef === undefined ? {} : { projectRef }),
    standaloneSurface: !projectRef && window.location.pathname === "/app/skills", chatHref: "/app",
    activeId: trialEngine.getSnapshot().store?.activeId ?? null, draft: "", clearDraft: vi.fn(), updateDraft,
    setDeploymentIntent: vi.fn(), syncConversationUrl, setConversationRouteId: vi.fn(), focusComposer: vi.fn(),
    closeSettings, brandName: "Kokoro", commandNewChatTimerRef: { current: null },
  }), { wrapper: strict ? ({ children }) => <StrictMode><LocaleProvider>{children}</LocaleProvider></StrictMode> : LocaleProvider, initialProps: { admitted: true, generation: 1 } })
  return { ...view, updateDraft, closeSettings, syncConversationUrl }
}

it("skill trial stages an exact selected version on the new direct conversation and removes it explicitly", async () => {
  window.history.replaceState({}, "", "/app/skills")
  const view = trialActions()
  let accepted: boolean | undefined
  act(() => { accepted = view.result.current.startSkillUseFromSettings(executableTrial, "editable example") })
  expect(accepted).toBe(true)
  expect(window.location.pathname).toBe("/app")
  expect(view.result.current.selectedSkill).toMatchObject({ name: "Owner trial", sourceRef: "skill:trial-version" })
  await act(async () => { engine.submit("edited example") })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual(["skill:trial-version"])
  act(() => view.result.current.clearSelectedSkill())
  view.rerender({ admitted: true, generation: 1 })
  expect(view.result.current.selectedSkill).toBeNull()
})

it("skill trial preserves the project workspace instead of reusing a direct engine", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000901"
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const projectClient = createFakeClient()
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef } })
  const view = trialActions(projectEngine, false, projectRef)
  try {
    act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
    expect(window.location.pathname).toBe(`/app/project/${projectRef}`)
    await act(async () => { projectEngine.submit("project example") })
    expect(projectClient.createCalls[0]?.body).toMatchObject({ project_ref: projectRef, selected_skill_source_refs: ["skill:trial-version"] })
    expect(client.createCalls).toEqual([])
  } finally { view.unmount(); projectEngine.dispose() }
})

it("skill trial blocks mismatched installation and revoked handlers before changing the conversation", () => {
  const view = trialActions()
  const create = vi.spyOn(engine, "newConversation")
  act(() => { view.result.current.startSkillUseFromSettings({ ...executableTrial, installed_source_ref: "skill:older" }) })
  expect(create).not.toHaveBeenCalled()
  const old = view.result.current.startSkillUseFromSettings
  view.rerender({ admitted: false, generation: 2 })
  act(() => { old(executableTrial) })
  expect(create).not.toHaveBeenCalled()
  expect(view.closeSettings).not.toHaveBeenCalled()
  expect(view.updateDraft).not.toHaveBeenCalled()
})

it("skill trial selection permanently retires on conversation A to B to A", () => {
  const view = trialActions()
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
  const a = engine.getSnapshot().store!.activeId!
  act(() => { engine.newConversation(); engine.selectConversation(a) })
  view.rerender({ admitted: true, generation: 1 })
  expect(view.result.current.selectedSkill).toBeNull()
})

it("preview skill trial remains editable text and never selects an execution source", async () => {
  const view = trialActions(engine, true)
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial, "preview text") })
  expect(view.result.current.selectedSkill).toBeNull()
  await act(async () => { engine.submit("preview text") })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
})

it("a departed route's skill handler stays retired after route A to B to A", () => {
  const view = trialActions()
  const old = view.result.current.startSkillUseFromSettings
  const create = vi.spyOn(engine, "newConversation")
  act(() => {
    window.history.replaceState({}, "", "/app/library")
    window.dispatchEvent(new PopStateEvent("popstate"))
    window.history.replaceState({}, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
    old(executableTrial)
  })
  expect(create).not.toHaveBeenCalled()
  expect(view.closeSettings).not.toHaveBeenCalled()
})

it("Strict Mode and route cleanup preserve the new trial but an old remove action does not clear its replacement", () => {
  const view = trialActions(engine, false, undefined, true)
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
  const oldRemove = view.result.current.clearSelectedSkill
  act(() => { view.result.current.startSkillUseFromSettings({ ...executableTrial, name: "Replacement" }) })
  act(() => oldRemove())
  expect(view.result.current.selectedSkill?.name).toBe("Replacement")
  view.rerender({ admitted: true, generation: 2 })
  expect(view.result.current.selectedSkill).toBeNull()
})

it("removing a trial cannot rewrite the frozen unknown request on retry", async () => {
  const view = trialActions()
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
  client.nextCreate = () => Promise.reject(new SessionClientError("network", "unknown commit"))
  await act(async () => { engine.submit("frozen example") })
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
  act(() => view.result.current.clearSelectedSkill())
  client.nextCreate = () => Promise.resolve(makeReceipt("run_trial_retry"))
  await act(async () => { engine.retry() })
  expect(client.createCalls).toHaveLength(2)
  expect(client.createCalls[1]).toEqual(client.createCalls[0])
  expect(client.createCalls[1]?.body.selected_skill_source_refs).toEqual(["skill:trial-version"])
  expect(view.result.current.selectedSkill).toBeNull()
})

it("trial cleanup clears only future selection and leaves no hidden source in a later conversation", async () => {
  const view = trialActions()
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
  view.unmount()
  await act(async () => { engine.submit("ordinary message") })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
})


it("trial selection retires when another tab changes actor before an old admission rerenders", async () => {
  const view = trialActions()
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
  window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
  view.rerender({ admitted: true, generation: 1 })
  expect(view.result.current.selectedSkill).toBeNull()
  const create = vi.spyOn(engine, "newConversation")
  let accepted: boolean | undefined
  act(() => { accepted = view.result.current.startSkillUseFromSettings(executableTrial) })
  expect(accepted).toBe(false)
  expect(create).not.toHaveBeenCalled()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "trial-actor")
  view.rerender({ admitted: true, generation: 1 })
  expect(view.result.current.selectedSkill).toBeNull()
  await act(async () => { engine.submit("ordinary message") })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
})

it("a storage actor change retires trial sources before another render", async () => {
  const view = trialActions()
  act(() => { view.result.current.startSkillUseFromSettings(executableTrial) })
  act(() => {
    window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "other-actor" }))
  })
  expect(view.result.current.selectedSkill).toBeNull()
  await act(async () => { engine.submit("ordinary message") })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
})

it("trial action requires the marker to match its admitted subject, not a new render snapshot", () => {
  const view = trialActions()
  const create = vi.spyOn(engine, "newConversation")
  window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
  view.rerender({ admitted: true, generation: 1 })
  let accepted: boolean | undefined
  act(() => { accepted = view.result.current.startSkillUseFromSettings(executableTrial) })
  expect(accepted).toBe(false)
  expect(create).not.toHaveBeenCalled()
  expect(view.updateDraft).not.toHaveBeenCalled()
  expect(view.closeSettings).not.toHaveBeenCalled()
})

it("project trial survives the actual URL handoff and Composer submit action", async () => {
  const projectRef = "project_00000000-0000-4000-8000-000000000902"
  window.localStorage.setItem("kokoro.web.auth-index-subject", "trial-actor")
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const projectClient = createFakeClient()
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef } })
  const view = renderHook(() => {
    const [routedConversationId, setConversationRouteId] = useState<string | null>(null)
    return useAppFrameActions({
      engine: projectEngine, preview: false, readBoundary: { admitted: true, subject: "trial-actor", generation: 1 },
      projectWorkspace: true, projectRef, routedConversationId, standaloneSurface: false, chatHref: "/app",
      activeId: projectEngine.getSnapshot().store?.activeId ?? null, draft: "edited project example", clearDraft: vi.fn(), updateDraft: vi.fn(),
      setDeploymentIntent: vi.fn(), setConversationRouteId, focusComposer: vi.fn(), closeSettings: vi.fn(),
      syncConversationUrl: id => window.history.replaceState({}, "", `/app/project/${projectRef}?conversation=${encodeURIComponent(id!)}`),
      brandName: "Kokoro", commandNewChatTimerRef: { current: null },
    })
  }, { wrapper: LocaleProvider })
  try {
    act(() => { expect(view.result.current.startSkillUseFromSettings(executableTrial, "project example")).toBe(true) })
    const conversationId = new URL(window.location.href).searchParams.get("conversation")
    expect(conversationId).toBe(projectEngine.getSnapshot().store?.activeId)
    await act(async () => { view.result.current.submitDraft() })
    expect(projectClient.createCalls).toHaveLength(1)
    expect(projectClient.createCalls[0]).toMatchObject({ sessionId: conversationId, body: { project_ref: projectRef, selected_skill_source_refs: ["skill:trial-version"] } })
    expect(client.createCalls).toEqual([])
    act(() => { projectEngine.newConversation() })
    await act(async () => { projectEngine.submit("new project conversation") })
    expect(projectClient.createCalls.at(-1)?.body).not.toHaveProperty("selected_skill_source_refs")
  } finally { view.unmount(); projectEngine.dispose(); window.history.replaceState({}, "", "/app") }
})


it("keeps plugin page management in its page header and hands off to Settings without replacing the directory", async () => {
  const onManage = vi.fn(), onCreate = vi.fn()
  const hub = { ...createHubClient(),
    listMcpConnectorProviders: vi.fn(async () => ({ items: [], next_cursor: null })),
    listMcpConnectors: vi.fn(async () => ({ items: [], next_cursor: null })),
    listCustomApis: vi.fn(async () => ({ items: [], page: { next_cursor: null } })),
  }
  render(<LocaleProvider><McpProjectionRead client={hub} identity="plugin-layout-reader" embedded initialView="catalog" onManageConnectors={onManage} onCreateMcp={onCreate} /></LocaleProvider>)
  await screen.findByRole("heading", { name: "插件", level: 1 })
  await screen.findByRole("searchbox", { name: "搜索连接器" })
  const manage = screen.getByRole("button", { name: "管理连接器" })
  fireEvent.click(manage)
  expect(onManage).toHaveBeenCalledExactlyOnceWith(manage)
  expect(screen.getByRole("heading", { name: "插件", level: 1 })).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "通过 JSON 导入 MCP" }))
  expect(onCreate).toHaveBeenCalledExactlyOnceWith("json", expect.any(HTMLButtonElement))
})

function observeSettingsCatalogPages() {
  const observers = new Set<IntersectionObserverCallback>()
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe() { observers.add(this.callback) }
    disconnect() { observers.delete(this.callback) }
  })
  return Object.assign(() => act(() => {
    expect(observers.size).toBeGreaterThan(0)
    for (const callback of observers) callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
  }), { capture: () => [...observers] })
}

function mountSettingsCatalog() {
  return render(<LocaleProvider><SkillsSettingsSection
    readBoundary={{ admitted: true, subject: "settings-catalog-reader", generation: 1 }}
    hubClient={createHubClient()} preview={false} brandName="Kokoro"
    embeddedCatalogOpen onEmbeddedCatalogOpenChange={vi.fn()} catalogTriggerRef={{ current: null }}
  /></LocaleProvider>)
}

it("restores Explore from its Settings hash and returns to All without replacing the dialog", async () => {
  const originalLocation = window.location.pathname + window.location.search + window.location.hash
  window.history.replaceState(null, "", "/app#/account/settings/skills/personal")
  const frame = () => (
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" preview />
      </LocaleProvider>
    </ThemeProvider>
  )
  let view = render(frame())
  try {
    const historyLength = window.history.length
    fireEvent.click(await screen.findByRole("button", { name: "探索技能" }))
    expect(window.location.hash).toBe("#/account/settings/skills/explore")
    expect(window.history.length).toBe(historyLength)
    view.unmount()
    view = render(frame())
    await screen.findByRole("region", { name: "探索技能" })
    const dialog = screen.getByRole("dialog")
    fireEvent.click(screen.getByRole("button", { name: "已添加的技能" }))
    expect(window.location.hash).toBe("#/account/settings/skills")
    expect(screen.getByRole("radio", { name: "全部" })).toHaveAttribute("data-state", "on")
    await waitFor(() => expect(screen.getByRole("button", { name: "探索技能" })).toHaveFocus())
    expect(screen.getByRole("dialog")).toBe(dialog)
    fireEvent.click(screen.getByRole("radio", { name: "个人" }))
    expect(window.location.hash).toBe("#/account/settings/skills/personal")
    fireEvent.click(screen.getByRole("button", { name: "探索技能" }))
    fireEvent.click(screen.getByRole("button", { name: "已添加的技能" }))
    expect(screen.getByRole("radio", { name: "全部" })).toHaveAttribute("data-state", "on")
    expect(window.location.hash).toBe("#/account/settings/skills")
    act(() => {
      window.history.replaceState(null, "", "/app#/account/settings/skills/explore")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    await screen.findByRole("region", { name: "探索技能" })
    fireEvent.click(screen.getByRole("tab", { name: "技能" }))
    expect(screen.queryByRole("region", { name: "探索技能" })).toBeNull()
    expect(window.location.hash).toBe("#/account/settings/skills")
    expect(screen.getByRole("dialog")).toBe(dialog)
    act(() => {
      window.history.replaceState(null, "", "/app#/account/settings/mcp")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    await screen.findByRole("heading", { name: "已添加的连接器" })
    act(() => {
      window.history.replaceState(null, "", "/app#/account/settings/skills/explore")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    await screen.findByRole("region", { name: "探索技能" })
    expect(screen.getByRole("dialog")).toBe(dialog)
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(window.location.hash).toBe(""))
    expect(window.location.pathname).toBe("/app")
  } finally {
    view.unmount()
    window.history.replaceState(null, "", originalLocation)
  }
})

it("keeps the selected Explore category and keyboard focus when its measured controls change layout", async () => {
  let availableWidth = 755
  const observers = new Set<ResizeObserverCallback>()
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => availableWidth)
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(520)
  const originalObserver = window.ResizeObserver
  window.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() {
      observers.add(this.callback)
    }
    unobserve() {}
    disconnect() {
      observers.delete(this.callback)
    }
  }
  try {
    const calls: Record<string, unknown>[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("ListSkills")) return Response.json({ userAddedSkills: [], officialSkills: [] })
      if (String(input).endsWith("ListHubSkills")) {
        calls.push(JSON.parse(String(init?.body)))
        return Response.json({ skills: [], tagOptions: {} })
      }
      throw Error("Unexpected responsive catalog request")
    })
    mountSettingsCatalog()
    const coding = await screen.findByRole("button", { name: "编程" })
    fireEvent.click(coding)
    coding.focus()
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ tag: "SKILL_HUB_TAG_CODING" }))
    const count = calls.length
    act(() => {
      availableWidth = 351
      for (const callback of observers) callback([], {} as ResizeObserver)
    })
    const menu = screen.getByRole("button", { name: "技能分类" })
    expect(menu).toHaveTextContent("编程")
    expect(menu).toHaveFocus()
    expect(screen.queryByRole("button", { name: "编程" })).toBeNull()
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    const codingItem = await screen.findByRole("menuitem", { name: "编程" })
    codingItem.focus()
    act(() => {
      availableWidth = 755
      for (const callback of observers) callback([], {} as ResizeObserver)
    })
    expect(screen.getByRole("button", { name: "编程" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "编程" })).toHaveFocus()
    expect(screen.queryByRole("menu")).toBeNull()
    expect(calls).toHaveLength(count)
  } finally {
    window.ResizeObserver = originalObserver
  }
})

it("retires a previously published Settings retry callback instead of borrowing the new client's fetcher", async () => {
  let reads = 0
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "settings-retired-retry" } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (String(input).endsWith("ListHubSkills")) {
      reads++
      if (reads === 1) throw Error("Original read failed")
      return response({ skills: [{ skillId: "retry-series", displayName: "Fresh retry item", currentVersion: { versionUid: "retry-revision" } }], tagOptions: {} })
    }
    throw Error("Unexpected retired retry request")
  })
  const hub = createHubClient()
  const projections: CatalogDetailProjection[] = []
  const onDetailProjection = (value: CatalogDetailProjection) => projections.push(value)
  const content = (generation: number) => <LocaleProvider><SkillCatalogDialog inline open client={createManusSkillHubClient(hub, { admitted: true, subject: "retry-actor", generation })} enabledOverrides={new Map()} installedOverrides={new Map()} busy={null} errorName={null} onOpenChange={vi.fn()} onCloseAutoFocus={vi.fn()} onOpenUpload={vi.fn()} onOpenGithub={vi.fn()} onSetEnabled={vi.fn()} onOpenDetail={vi.fn()} selectedDetailKey={JSON.stringify(["retry-series", "retry-revision"])} onDetailProjection={onDetailProjection} /></LocaleProvider>
  const view = render(content(1))
  await waitFor(() => expect(projections.at(-1)?.failed).toBe(true))
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  const retiredRetry = projections.at(-1)!.retry
  view.rerender(content(2))
  await screen.findByRole("button", { name: "查看详情 Fresh retry item" })
  const confirmedReads = reads
  await act(async () => { retiredRetry(); await Promise.resolve() })
  expect(reads).toBe(confirmedReads)
})

it("keeps Settings Explore intent and its detail shell across same-actor rechecks without retaining private facts", async () => {
  let round = 1
  let failFreshRead = true
  const calls: Record<string, unknown>[] = []
  const packageReads: string[] = []
  const documents = { "SKILL.md": "# Verified reader root", "references/notes.md": "# Verified selected document\n\n" + "Reader paragraph.\n\n".repeat(40) }
  const files = Object.entries(documents).map(([path, text]) => ({ path, size_bytes: String(new TextEncoder().encode(text).byteLength) }))
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "settings-intent-recheck" } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) return response({ data: [] })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      calls.push(JSON.parse(String(init?.body)))
      if (round === 2 && failFreshRead) { failFreshRead = false; throw Error("Temporary new-generation read failure") }
      return response({ skills: [{ skillId: "settings-intent-series", displayName: "Intent match", userDescription: round === 1 ? "Retired catalog facts" : "New catalog facts", currentVersion: { versionUid: "settings-intent-revision" } }], tagOptions: {} })
    }
    if (path.includes("/package")) {
      packageReads.push(path)
      const selected = new URL(path, "http://local.test").searchParams.get("file_path") as keyof typeof documents | null
      return response({ data: { source_ref: "skill:settings-intent-revision", revision: "1", files, selected_file: selected === null ? null : { path: selected, text: documents[selected] } } })
    }
    if (path.endsWith("GetSkill")) return response({ skill: { id: "settings-intent-series", version: "settings-intent-revision", displayName: "Intent match", description: round === 1 ? "Retired detail facts" : "New detail facts" } })
    throw Error("Unexpected settings recheck request")
  })
  const hubClient = createHubClient()
  const content = (admitted: boolean, subject: string, generation: number) => <LocaleProvider><SkillsSettingsSection readBoundary={{ admitted, subject, generation }} hubClient={hubClient} preview={false} brandName="Kokoro" embeddedCatalogOpen onEmbeddedCatalogOpenChange={vi.fn()} catalogTriggerRef={{ current: null }} /></LocaleProvider>
  const view = render(content(true, "settings-intent-actor", 1))
  await screen.findByRole("button", { name: "查看详情 Intent match" })
  const search = screen.getByRole("searchbox", { name: "搜索技能" })
  fireEvent.change(search, { target: { value: "needle" } })
  await waitFor(() => expect(calls.at(-1)).toMatchObject({ query: "needle" }))
  fireEvent.keyDown(screen.getByRole("button", { name: "技能分类" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编程" }))
  fireEvent.click(await screen.findByRole("button", { name: "查看详情 Intent match" }))
  const dialog = screen.getByRole("dialog")
  await within(dialog).findByText("Retired detail facts")
  fireEvent.click(within(dialog).getByRole("button", { name: "查看详情" }))
  await within(dialog).findByRole("heading", { name: "Verified reader root", level: 1 })
  fireEvent.click(within(dialog).getByRole("button", { name: "references" }))
  fireEvent.click(within(dialog).getByRole("button", { name: "references/notes.md" }))
  await within(dialog).findByRole("heading", { name: "Verified selected document", level: 1 })
  const readerPane = within(dialog).getByRole("heading", { name: "Verified selected document", level: 1 }).closest<HTMLElement>("[aria-busy]")!
  fireEvent.scroll(readerPane, { target: { scrollTop: 240 } })
  const readCount = packageReads.length
  const count = calls.length
  round = 2
  view.rerender(content(false, "settings-intent-actor", 2))
  expect(screen.getByRole("searchbox", { hidden: true, name: "搜索技能" })).toBe(search)
  expect(search).toHaveValue("needle")
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByText("Retired detail facts")).toBeNull()
  expect(screen.queryByText("Retired catalog facts")).toBeNull()
  expect(screen.queryByRole("heading", { name: "Verified selected document" })).toBeNull()
  expect(within(dialog).getByRole("button", { name: "技能详情" })).toBeVisible()
  expect(packageReads).toHaveLength(readCount)
  await act(async () => { await Promise.resolve() })
  expect(calls).toHaveLength(count)
  view.rerender(content(true, "settings-intent-actor", 2))
  await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"))
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(within(dialog).queryByRole("button", { name: "重试" })).toBeNull()
  expect(screen.queryByText("Retired detail facts")).toBeNull()
  expect(screen.queryByText("Retired catalog facts")).toBeNull()
  expect(within(dialog).queryByRole("heading", { name: "Verified selected document" })).toBeNull()
  expect(packageReads).toHaveLength(readCount)
  // A normal same-actor admission recheck reads the current filter again;
  // a failed passive read no longer owns a visible Retry panel.
  view.rerender(content(false, "settings-intent-actor", 3))
  view.rerender(content(true, "settings-intent-actor", 3))
  await within(dialog).findByRole("heading", { name: "Verified selected document", level: 1 })
  expect(within(dialog).getByRole("heading", { name: "Verified selected document", level: 1 }).closest("[aria-busy]")).toHaveProperty("scrollTop", 240)
  expect(within(dialog).getByRole("button", { name: "references" })).toHaveAttribute("aria-expanded", "true")
  expect(packageReads.slice(readCount)).toEqual([
    "/api/hub/skills/settings-intent-revision/package",
    "/api/hub/skills/settings-intent-revision/package?file_path=references%2Fnotes.md",
  ])
  fireEvent.click(within(dialog).getByRole("button", { name: "技能详情" }))
  await within(dialog).findByText("New detail facts")
  expect(calls.at(-1)).toMatchObject({ query: "needle", tag: "SKILL_HUB_TAG_CODING" })
  expect(screen.getByRole("dialog")).toBe(dialog)
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  await waitFor(() => expect(search).toHaveFocus())
  fireEvent.click(screen.getByRole("button", { name: "查看详情 Intent match" }))
  await within(screen.getByRole("dialog")).findByText("New detail facts")
  view.rerender(content(true, "settings-other-actor", 4))
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("")
  view.rerender(content(true, "settings-intent-actor", 4))
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("")
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("re-establishes the exact Settings detail revision on new cursor pages rather than substituting the latest revision", async () => {
  const intersect = observeSettingsCatalogPages()
  let round = 1
  const details: string[] = []
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "settings-exact-revision" } })
  const card = (revision: string) => ({ skillId: "exact-settings-series", displayName: revision, currentVersion: { versionUid: revision } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) return response({ data: [] })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body))
      return response(body.pageToken ? { skills: [card("chosen-revision")], tagOptions: {} } : { skills: [card(round === 1 ? "initial-revision" : "newest-revision")], tagOptions: {}, nextPageToken: `exact-next-${round}` })
    }
    if (path.endsWith("GetSkill")) {
      details.push(String(init?.body))
      return response({ skill: { id: "exact-settings-series", version: "chosen-revision", displayName: "chosen-revision", description: `Exact facts ${round}` } })
    }
    throw Error("Unexpected exact revision request")
  })
  const hubClient = createHubClient()
  const content = (admitted: boolean, generation: number) => <LocaleProvider><SkillsSettingsSection readBoundary={{ admitted, subject: "settings-exact-actor", generation }} hubClient={hubClient} preview={false} brandName="Kokoro" embeddedCatalogOpen onEmbeddedCatalogOpenChange={vi.fn()} catalogTriggerRef={{ current: null }} /></LocaleProvider>
  const view = render(content(true, 1))
  await screen.findByRole("button", { name: "查看详情 initial-revision" })
  intersect()
  fireEvent.click(await screen.findByRole("button", { name: "查看详情 chosen-revision" }))
  const dialog = screen.getByRole("dialog")
  await within(dialog).findByText("Exact facts 1")
  round = 2
  view.rerender(content(false, 2))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByText("Exact facts 1")).toBeNull()
  view.rerender(content(true, 2))
  const more = await within(dialog).findByRole("button", { name: "加载更多" })
  expect(within(dialog).queryByRole("heading", { name: "newest-revision" })).toBeNull()
  expect(details).toHaveLength(1)
  fireEvent.click(more)
  await within(dialog).findByText("Exact facts 2")
  expect(details).toHaveLength(2)
  expect(screen.getByRole("dialog")).toBe(dialog)
})

it("retires Settings installation slots and stale actions without applying a late ACK to the new generation", async () => {
  let releaseOld!: (reply: Response) => void
  let writes = 0
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "settings-install-recheck" } })
  const receipt = () => response({ data: { installation: {
    installation_id: "settings-installation", source_ref: "skill:settings-install-revision", series_id: "settings-install-series", revision: "1", installed: true, enabled: true,
    installed_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", display_name: "Current install", summary: "Owner description", source_status: "active", skill_updated_at: "2026-10-16T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "1" }, tags: [],
  }, change: "installed", event_id: "settings-install-event", replayed: false } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) {
      if (init?.method !== "POST") return response({ data: [] })
      writes++
      return writes === 1 ? new Promise<Response>(resolve => { releaseOld = resolve }) : receipt()
    }
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) return response({ skills: [{ skillId: "settings-install-series", displayName: "Current install", currentVersion: { versionUid: "settings-install-revision" } }], tagOptions: {} })
    throw Error("Unexpected installation recheck request")
  })
  const hubClient = createHubClient()
  const content = (admitted: boolean, generation: number) => <LocaleProvider><SkillsSettingsSection readBoundary={{ admitted, subject: "settings-install-actor", generation }} hubClient={hubClient} preview={false} brandName="Kokoro" embeddedCatalogOpen onEmbeddedCatalogOpenChange={vi.fn()} catalogTriggerRef={{ current: null }} /></LocaleProvider>
  const view = render(content(true, 1))
  const retired = await screen.findByRole("button", { name: "添加 Current install" })
  fireEvent.click(retired)
  await waitFor(() => expect(writes).toBe(1))
  view.rerender(content(false, 2))
  view.rerender(content(true, 2))
  const current = await screen.findByRole("button", { name: "添加 Current install" })
  expect(current).toBeEnabled()
  fireEvent.click(retired)
  expect(writes).toBe(1)
  fireEvent.click(current)
  await screen.findByRole("button", { name: "已添加 Current install" })
  expect(writes).toBe(2)
  await act(async () => { releaseOld(receipt()) })
  expect(screen.getByRole("button", { name: "已添加 Current install" })).toBeDisabled()
  expect(screen.queryByRole("alert")).toBeNull()
})

it("queries Settings Explore through the owner and preserves its nine-item filters on every cursor", async () => {
  const intersect = observeSettingsCatalogPages()
  const calls: Record<string, unknown>[] = []
  const response = (data: unknown) => Response.json(data, { headers: { "cache-control": "private, no-store", "x-request-id": "req-settings-catalog" } })
  const card = (id: string, name: string) => ({ skillId: id, displayName: name, userDescription: "Server indexed metadata", tags: { values: ["SKILL_HUB_TAG_CODING"] }, currentVersion: { versionUid: `${id}-revision` } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) return response({ data: [] })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body)); calls.push(body)
      if (body.pageToken) return response({ skills: [card("remote-page", "Remote second result")], tagOptions: {} })
      if (body.query) return response({ skills: [card("semantic-match", "Indexed document match")], tagOptions: {}, nextPageToken: "settings-query-next" })
      if (body.tag) return response({ skills: [card("coding-match", "Remote coding result")], tagOptions: {} })
      return response({ skills: [card("initial", "Initial settings item")], tagOptions: {}, nextPageToken: "settings-default-next" })
    }
    throw Error("Unexpected settings request")
  })
  mountSettingsCatalog()
  await screen.findByRole("button", { name: "查看详情 Initial settings item" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, shuffle: true, includeOfficialSkills: true })
  const completedPageObserver = intersect.capture()[0]!
  intersect()
  await screen.findByRole("button", { name: "查看详情 Remote second result" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, pageToken: "settings-default-next" })
  await act(async () => { completedPageObserver([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver) })
  expect(calls).toHaveLength(2)
  fireEvent.keyDown(screen.getByRole("button", { name: "技能分类" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编程" }))
  await screen.findByRole("button", { name: "查看详情 Remote coding result" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, tag: "SKILL_HUB_TAG_CODING" })
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "needle" } })
  await screen.findByRole("button", { name: "查看详情 Indexed document match" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "needle", tag: "SKILL_HUB_TAG_CODING" })
  intersect()
  await screen.findByRole("button", { name: "查看详情 Remote second result" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "needle", tag: "SKILL_HUB_TAG_CODING", pageToken: "settings-query-next" })
})

it("retires Settings cursor reads on filter changes and continues the failed current page without late results", async () => {
  const intersect = observeSettingsCatalogPages()
  let releaseOld!: (response: Response) => void
  let oldSignal: AbortSignal | null | undefined
  let codingAttempts = 0
  let oldRequests = 0
  const response = (data: unknown) => Response.json(data, { headers: { "cache-control": "private, no-store", "x-request-id": "req-settings-retirement" } })
  const card = (id: string) => ({ skillId: id, displayName: id, currentVersion: { versionUid: `${id}-revision` }, tags: { values: ["SKILL_HUB_TAG_CODING"] } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) return response({ data: [] })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body))
      if (body.pageToken === "old-next") {
        oldRequests++
        oldSignal = init?.signal
        return new Promise<Response>(resolve => { releaseOld = resolve })
      }
      if (body.pageToken === "coding-next") {
        if (++codingAttempts === 1) throw Error("Transient page read failure")
        return response({ skills: [card("coding-second")], tagOptions: {} })
      }
      return response({ skills: [card(body.query ? "coding-first" : "old-first")], tagOptions: {}, nextPageToken: body.query ? "coding-next" : "old-next" })
    }
    throw Error("Unexpected settings request")
  })
  mountSettingsCatalog()
  await screen.findByRole("button", { name: "查看详情 old-first" })
  const queuedOldObserver = intersect.capture()[0]!
  intersect()
  await waitFor(() => expect(oldSignal).toBeDefined())
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "coding" } })
  await waitFor(() => expect(oldSignal?.aborted).toBe(true))
  await screen.findByRole("button", { name: "查看详情 coding-first" })
  await act(async () => { queuedOldObserver([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver) })
  expect(oldRequests).toBe(1)
  intersect()
  await waitFor(() => expect(codingAttempts).toBe(1))
  const more = screen.getByRole("button", { name: "加载更多" })
  await waitFor(() => expect(more).toBeEnabled())
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  fireEvent.click(more)
  await screen.findByRole("button", { name: "查看详情 coding-second" })
  await act(async () => { releaseOld(response({ skills: [card("late-old-page")], tagOptions: {} })) })
  expect(screen.queryByRole("button", { name: "查看详情 late-old-page" })).toBeNull()
  expect(codingAttempts).toBe(2)
})

it("keeps a failed Settings filter read quiet and recovers through normal filter re-entry without claiming empty", async () => {
  observeSettingsCatalogPages()
  let attempts = 0
  let defaultReads = 0
  const response = (data: unknown) => Response.json(data, { headers: { "cache-control": "private, no-store", "x-request-id": "req-settings-retry" } })
  const card = (id: string) => ({ skillId: id, displayName: id, currentVersion: { versionUid: `${id}-revision` } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) return response({ data: [] })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body))
      if (!body.query) defaultReads++
      if (body.query === "offline" && ++attempts === 1) throw Error("Transient catalog read failure")
      return response({ skills: [card(body.query ? "Recovered indexed match" : "Initial retained page")], tagOptions: {} })
    }
    throw Error("Unexpected settings request")
  })
  mountSettingsCatalog()
  await screen.findByRole("button", { name: "查看详情 Initial retained page" })
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "offline" } })
  await waitFor(() => expect(attempts).toBe(1))
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByText("没有匹配的技能")).not.toBeInTheDocument()
  const search = screen.getByRole("searchbox", { name: "搜索技能" })
  fireEvent.change(search, { target: { value: "" } })
  await waitFor(() => expect(defaultReads).toBe(2))
  await screen.findByRole("button", { name: "查看详情 Initial retained page" })
  fireEvent.change(search, { target: { value: "offline" } })
  await screen.findByRole("button", { name: "查看详情 Recovered indexed match" })
  expect(screen.queryByRole("alert")).toBeNull()
  expect(attempts).toBe(2)
})

it.each([false, true])("keeps a confirmed matching card mounted while search revalidates and preserves its single-click detail intent (cursor page: %s)", async (cursorPage) => {
  let releaseSearch!: (response: Response) => void
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "catalog-search-click" } })
  const card = { skillId: "search-click-series", displayName: "Search click match", currentVersion: { versionUid: "search-click-revision" } }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      if (JSON.parse(String(init?.body)).query) return new Promise<Response>(resolve => { releaseSearch = resolve })
      if (JSON.parse(String(init?.body)).pageToken) return response({ skills: [card], tagOptions: {} })
      return response({ skills: cursorPage ? [{ ...card, skillId: "initial-series", displayName: "Other initial card" }] : [card], tagOptions: {}, ...(cursorPage ? { nextPageToken: "search-click-next" } : {}) })
    }
    if (path.endsWith("GetSkill")) return response({ skill: { id: card.skillId, version: "search-click-revision", displayName: card.displayName, description: "Confirmed exact revision" } })
    throw Error("Unexpected search-click request")
  })
  const boundary = { admitted: true, subject: "search-click-actor", generation: 1 }
  const view = render(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={boundary} onPrompt={vi.fn()} /></LocaleProvider>)
  if (cursorPage) fireEvent.click(await screen.findByRole("button", { name: "加载更多" }))
  const trigger = await screen.findByRole("button", { name: "Search click match" })
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "Search click" } })
  await waitFor(() => expect(releaseSearch).toBeTypeOf("function"))
  expect(screen.getByRole("button", { name: "Search click match" })).toBe(trigger)
  expect(screen.queryByTestId("skills-loading")).toBeNull()
  expect(screen.getByRole("button", { name: "添加 Search click match" })).toBeDisabled()
  fireEvent.click(trigger)
  const dialog = await screen.findByRole("dialog")
  await act(async () => { releaseSearch(response({ skills: [card], tagOptions: {} })) })
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(await within(dialog).findByRole("heading", { name: card.displayName })).toBeVisible()
  expect(await within(dialog).findByText("Confirmed exact revision")).toBeVisible()
  view.rerender(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ ...boundary, admitted: false, generation: 2 }} onPrompt={vi.fn()} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: "Search click match", hidden: true })).toBeNull()
  expect(screen.queryByText("Confirmed exact revision")).toBeNull()
})

it("queries the complete owner catalog and keeps search/category bound to every cursor page", async () => {
  const calls: Record<string, unknown>[] = []
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "req-catalog-search" } })
  const card = (id: string, name: string) => ({ skillId: id, displayName: name, userDescription: "needle in the full directory", tags: { values: ["SKILL_HUB_TAG_CODING"] }, currentVersion: { versionUid: `${id}-revision` } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (String(input).endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      calls.push(body)
      if (body.pageToken === "default-next") return response({ skills: [card("default-second", "Default second page")], tagOptions: {} })
      if (body.query !== "needle") return response({ skills: [card("first", "Initial page")], tagOptions: {}, ...(body.tag ? {} : { nextPageToken: "default-next" }) })
      if (body.tag !== "SKILL_HUB_TAG_CODING") return response({ skills: [card("search", "Previously unloaded result")], tagOptions: {}, nextPageToken: "query-next" })
      if (body.pageToken) return response({ skills: [card("second", "Filtered second page")], tagOptions: {} })
      return response({ skills: [card("coding", "Filtered first page")], tagOptions: {}, nextPageToken: "query-coding-next" })
    }
    throw Error("Unexpected catalog request")
  })
  render(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "catalog-search-reader", generation: 1 }} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "Initial page" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, shuffle: true, includeOfficialSkills: true })
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByRole("button", { name: "Default second page" })
  await waitFor(() => expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, pageToken: "default-next" }))
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "needle" } })
  await screen.findByRole("button", { name: "Previously unloaded result" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "needle" })
  fireEvent.click(screen.getByRole("button", { name: "编程" }))
  await screen.findByRole("button", { name: "Filtered first page" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "needle", tag: "SKILL_HUB_TAG_CODING" })
  expect(calls.at(-1)).not.toHaveProperty("pageToken")
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByRole("button", { name: "Filtered second page" })
  expect(calls.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "needle", tag: "SKILL_HUB_TAG_CODING", pageToken: "query-coding-next" })
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }))
  await waitFor(() => expect(calls.at(-1)).toMatchObject({ tag: "SKILL_HUB_TAG_CODING" }))
  await waitFor(() => expect(calls.at(-1)).not.toHaveProperty("query"))
  expect(calls.at(-1)).not.toHaveProperty("pageToken")
  expect(screen.queryByRole("button", { name: "Filtered second page" })).toBeNull()
})

it("retires a pending cursor when the category changes without blocking the new category page", async () => {
  let releaseOld!: (response: Response) => void
  let oldSignal: AbortSignal | null | undefined
  const cursors: string[] = []
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "req-catalog-filter-retirement" } })
  const card = (id: string) => ({ skillId: id, displayName: id, currentVersion: { versionUid: `${id}-revision` }, tags: { values: ["SKILL_HUB_TAG_CODING"] } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (String(input).endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body))
      if (body.pageToken) {
        cursors.push(body.pageToken)
        if (body.pageToken === "old-filter-next") {
          oldSignal = init?.signal
          return new Promise<Response>((resolve) => { releaseOld = resolve })
        }
        return response({ skills: [card("current-filter-second")], tagOptions: {} })
      }
      return response({ skills: [card(body.tag ? "current-filter-first" : "old-filter-first")], nextPageToken: body.tag ? "current-filter-next" : "old-filter-next", tagOptions: {} })
    }
    throw Error("Unexpected catalog request")
  })
  render(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "catalog-filter-retirement-reader", generation: 1 }} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "old-filter-first" })
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await waitFor(() => expect(cursors).toEqual(["old-filter-next"]))
  fireEvent.click(screen.getByRole("button", { name: "编程" }))
  await screen.findByRole("button", { name: "current-filter-first" })
  expect(oldSignal?.aborted).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "全部" }))
  await screen.findByRole("button", { name: "old-filter-first" })
  expect(screen.getByRole("button", { name: "加载更多" })).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "编程" }))
  await screen.findByRole("button", { name: "current-filter-first" })
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByRole("button", { name: "current-filter-second" })
  await act(async () => { releaseOld(response({ skills: [card("late-old-filter")], tagOptions: {} })) })
  expect(screen.queryByRole("button", { name: "late-old-filter" })).toBeNull()
  expect(cursors).toEqual(["old-filter-next", "current-filter-next"])
})

it("refreshes all cached catalog filters after a confirmed installation", async () => {
  let installed = false
  const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-request-id": "req-catalog-filter-install" } })
  const card = { skillId: "filter-install-series", displayName: "Filter install", currentVersion: { versionUid: "filter-install-revision" }, tags: { values: ["SKILL_HUB_TAG_CODING"] } }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input)
    if (path.endsWith("ListHubSkills")) return response({ skills: [card], tagOptions: {} })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: installed ? [{ id: card.skillId, version: "filter-install-revision", installationId: "filter-installation", added: true, enabled: true }] : [], officialSkills: [] })
    if (path === "/api/hub/self/skill-installations") {
      installed = true
      return response({ data: { installation: {
        installation_id: "filter-installation", source_ref: "skill:filter-install-revision", series_id: card.skillId, revision: "1", installed: true, enabled: true,
        installed_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", display_name: card.displayName, summary: "Owner description", source_status: "active", skill_updated_at: "2026-10-16T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "1" }, tags: [],
      }, change: "installed", event_id: "filter-install-event", replayed: false } })
    }
    throw Error("Unexpected catalog request")
  })
  render(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "catalog-filter-install-reader", generation: 1 }} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "添加 Filter install" })
  fireEvent.click(screen.getByRole("button", { name: "编程" }))
  fireEvent.click(await screen.findByRole("button", { name: "添加 Filter install" }))
  expect(await screen.findByRole("button", { name: "已添加 Filter install" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "全部" }))
  expect(await screen.findByRole("button", { name: "已添加 Filter install" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "添加 Filter install" })).toBeNull()
})

it("same actor recheck preserves catalog search and detail chrome while retiring private facts", async () => {
  let round = 1
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "req-catalog-recheck" } })
  const card = { skillId: "series-recheck", displayName: "Private title", userDescription: "Private facts", currentVersion: { versionUid: "revision-recheck" } }
  const reads = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const path = String(input)
    if (path.endsWith("ListHubSkills")) return response({ skills: [card], tagOptions: {} })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("GetSkill")) return response({ skill: { id: "series-recheck", version: "revision-recheck", displayName: "Private title", description: round === 1 ? "Private facts" : "Fresh facts" } })
    throw Error("Unexpected catalog request")
  })
  const view = render(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "catalog-recheck-actor", generation: 1 }} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "Private title" })
  const search = screen.getByRole("searchbox", { name: "搜索技能" })
  fireEvent.change(search, { target: { value: "Private" } })
  fireEvent.click(screen.getByRole("button", { name: "Private title" }))
  await screen.findByRole("button", { name: "查看详情" })
  const dialog = screen.getByRole("dialog")
  const beforeRecheck = reads.mock.calls.length
  round = 2
  view.rerender(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: false, subject: "catalog-recheck-actor", generation: 2 }} onPrompt={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("searchbox", { hidden: true, name: "搜索技能" })).toBe(search)
  expect(search).toHaveValue("Private")
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByText("Private facts")).toBeNull()
  await act(async () => { await Promise.resolve() })
  expect(reads).toHaveBeenCalledTimes(beforeRecheck)
  view.rerender(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "catalog-recheck-actor", generation: 2 }} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("heading", { name: "Private title" })
  await within(dialog).findByText("Fresh facts")
  expect(screen.getByRole("dialog")).toBe(dialog)
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Private title" })).toHaveFocus())
  view.rerender(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "other-catalog-actor", generation: 3 }} onPrompt={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("")
  view.rerender(<LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted: true, subject: "catalog-recheck-actor", generation: 4 }} onPrompt={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("")
  expect(screen.queryByRole("dialog")).toBeNull()
})


it("catalog installation recheck rejects old callbacks and retries only the frozen source and key", async () => {
  const resolvers: Array<(response: Response) => void> = []
  const calls: RequestInit[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    calls.push(init!)
    return new Promise<Response>(resolve => resolvers.push(resolve))
  })
  const card = { ...executableTrial, installed: false, enabled: false }
  const identify = (value: import("@/hub/schemas").SkillCatalogCard) => `${value.skill_id}:${value.revision_skill_id}`
  const view = renderHook(({ generation }) => useCatalogSkillInstallation({ admitted: true, subject: "installation-reader", generation }, undefined, "test-catalog-scope", identify), { initialProps: { generation: 1 } })
  let first!: Promise<void>, retry!: Promise<void>
  act(() => { first = view.result.current.setEnabled(card) })
  await waitFor(() => expect(calls).toHaveLength(1))
  const old = view.result.current.setEnabled
  view.rerender({ generation: 2 })
  await act(async () => { await old(card) })
  expect(calls).toHaveLength(1)
  act(() => { void view.result.current.setEnabled({ ...card, revision_skill_id: "new-revision", source_ref: "skill:new-revision" }) })
  expect(calls).toHaveLength(1)
  act(() => { retry = view.result.current.setEnabled(card) })
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[1]?.body).toBe(calls[0]?.body)
  expect(new Headers(calls[1]?.headers).get("idempotency-key")).toBe(new Headers(calls[0]?.headers).get("idempotency-key"))
  const receipt = () => Response.json({ data: { installation: {
    installation_id: "trial-installation", source_ref: "skill:trial-version", series_id: "trial-series", revision: "1", installed: true, enabled: true,
    installed_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", display_name: "Owner trial", summary: "Owner description", source_status: "active", skill_updated_at: "2026-10-16T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "1" }, tags: [],
  }, change: "installed", event_id: "trial-event", replayed: false } }, { headers: { "cache-control": "private, no-store", "x-request-id": "req-installation-recheck" } })
  await act(async () => { resolvers[0]!(receipt()); await first })
  expect(view.result.current.busy).toBe(identify(card))
  expect(view.result.current.installationFacts).toEqual({})
  await act(async () => { resolvers[1]!(receipt()); await retry })
  expect(view.result.current.busy).toBeNull()
  expect(view.result.current.installationFacts[card.skill_id]).toMatchObject({ installed_source_ref: "skill:trial-version", enabled: true })
})


it.each([false, true])("catalog detail recheck uses the current cursor and never substitutes a later revision (%s)", async (changed) => {
  let round = 1
  const cursorCalls: string[] = []
  let failCurrentPage = true
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "req-catalog-paging" } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body))
      if (!body.pageToken) return response({ skills: [{ skillId: "first-series", displayName: "First card", currentVersion: { versionUid: "first-revision" } }], nextPageToken: round === 1 ? "old-next" : "current-next", tagOptions: {} })
      cursorCalls.push(body.pageToken)
      if (round === 2 && failCurrentPage) { failCurrentPage = false; throw Error("current page failed") }
      return response({ skills: [{ skillId: "paged-series", displayName: "Paged skill", currentVersion: { versionUid: round === 2 && changed ? "newer-revision" : "paged-revision" } }], tagOptions: {} })
    }
    if (path.endsWith("GetSkill")) return response({ skill: { id: "paged-series", version: "paged-revision", displayName: "Paged skill", description: "Private page-two detail" } })
    throw Error("Unexpected catalog request")
  })
  const surface = (admitted: boolean, generation: number) => <LocaleProvider><KokoroSkillsSurface preview={false} projectReadBoundary={{ admitted, subject: `paged-actor-${changed}`, generation }} onPrompt={vi.fn()} /></LocaleProvider>
  const view = render(surface(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }))
  fireEvent.click(await screen.findByRole("button", { name: "Paged skill" }))
  await screen.findByText("Private page-two detail")
  const dialog = screen.getByRole("dialog")
  round = 2
  view.rerender(surface(false, 2))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(within(dialog).queryByText("Private page-two detail")).toBeNull()
  view.rerender(surface(true, 2))
  fireEvent.click(await screen.findByRole("button", { name: "加载更多" }))
  await waitFor(() => expect(cursorCalls).toEqual(["old-next", "current-next"]))
  await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"))
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(within(dialog).queryByRole("button", { name: "重试" })).toBeNull()
  const loadMore = within(dialog).getByRole("button", { name: "加载更多" })
  await waitFor(() => expect(loadMore).toBeEnabled())
  fireEvent.click(loadMore)
  await waitFor(() => expect(cursorCalls).toEqual(["old-next", "current-next", "current-next"]))
  if (changed) {
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"))
    expect(within(dialog).queryByRole("alert")).toBeNull()
    expect(within(dialog).queryByRole("heading", { name: "Paged skill" })).toBeNull()
    expect(within(dialog).queryByText("Private page-two detail")).toBeNull()
  } else await within(dialog).findByRole("heading", { name: "Paged skill" })
  expect(vi.mocked(globalThis.fetch).mock.calls.filter(([path]) => String(path).endsWith("GetSkill"))).toHaveLength(changed ? 1 : 2)
  expect(screen.getByRole("dialog")).toBe(dialog)
})


it.each(["network", "retired"])("unknown share survives same actor recheck without an implicit second command (%s)", async kind => {
  const writes = vi.fn(async () => {
    if (kind === "network") throw Error("unknown network result")
    return new Promise<Response>(() => undefined)
  })
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("/skill-shares")) return writes()
    return Response.json({ skill: { id: "trial-series", version: "trial-version", displayName: "Owner trial", description: "Owner facts" } })
  })
  const dialog = (admitted: boolean, generation: number) => <LocaleProvider><ManusSkillDetailDialog readBoundary={{ admitted, subject: `share-recheck-${kind}`, generation }} skill={{ ...executableTrial, installed: true }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={() => false} /></LocaleProvider>
  const view = render(dialog(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: "分享技能" }))
  await waitFor(() => expect(writes).toHaveBeenCalledTimes(1))
  if (kind === "network") await screen.findByRole("button", { name: "创建新的分享" })
  view.rerender(dialog(false, 2))
  view.rerender(dialog(true, 2))
  const newShare = await screen.findByRole("button", { name: "创建新的分享" })
  expect(screen.getByRole("button", { name: "分享技能" })).toBeDisabled()
  expect(writes).toHaveBeenCalledTimes(1)
  fireEvent.click(newShare)
  await waitFor(() => expect(writes).toHaveBeenCalledTimes(2))
})

it.each([403, 412])("a confirmed installation rejection permits a new revision intent (%s)", async status => {
  const writes = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: status === 403 ? "skill_forbidden" : "skill_installation_precondition_failed", message: "Rejected", retryable: false } }, { status, headers: { "cache-control": "private, no-store", "x-request-id": "req-known-rejection" } }))
  const card = { ...executableTrial, installed: false, enabled: false }
  const identify = (value: import("@/hub/schemas").SkillCatalogCard) => `${value.skill_id}:${value.revision_skill_id}`
  const view = renderHook(({ generation }) => useCatalogSkillInstallation({ admitted: true, subject: `rejected-${status}`, generation }, undefined, "known-rejection", identify), { initialProps: { generation: 1 } })
  await act(async () => { await view.result.current.setEnabled(card) })
  expect(writes).toHaveBeenCalledTimes(1)
  view.rerender({ generation: 2 })
  await act(async () => { await view.result.current.setEnabled({ ...card, revision_skill_id: "replacement-revision" }) })
  expect(writes).toHaveBeenCalledTimes(2)
  expect(JSON.parse(String(writes.mock.calls[1]?.[1]?.body))).toEqual({ source_ref: "skill:replacement-revision" })
})


it("catalog GitHub recheck retires private preview choices without losing typed repository input", async () => {
  const reads = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: { selection_required: true, repository_url: "https://github.com/acme/skills", commit: "a".repeat(40), paths: ["private-one", "private-two"] } }, { headers: { "cache-control": "private, no-store", "x-request-id": "req-github-recheck" } }))
  const dialog = (admitted: boolean, generation: number) => <LocaleProvider><GithubImportDialog readBoundary={{ admitted, subject: "github-recheck", generation }} open onOpenChange={vi.fn()} /></LocaleProvider>
  const view = render(dialog(true, 1))
  fireEvent.change(screen.getByTestId("github-repository-input"), { target: { value: "acme/skills" } })
  fireEvent.click(screen.getByTestId("github-import-submit"))
  await screen.findByRole("button", { name: "private-one" })
  view.rerender(dialog(false, 2))
  expect(screen.queryByRole("button", { name: "private-one" })).toBeNull()
  expect(screen.getByTestId("github-repository-input")).toHaveValue("acme/skills")
  view.rerender(dialog(true, 2))
  expect(screen.queryByRole("button", { name: "private-one" })).toBeNull()
  expect(reads).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId("github-import-submit"))
  await screen.findByRole("button", { name: "private-one" })
  expect(reads).toHaveBeenCalledTimes(2)
})

it("catalog local import recheck retires an acknowledged result rather than redisplaying private metadata", async () => {
  const expiry = "2999-01-01T00:00:00Z"
  window.sessionStorage.setItem("kokoro.skills.local-import.v1", JSON.stringify({ subject: "upload-recheck", intent_id: "own-intent", expires_at: expiry }))
  const reads = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {
    intent_id: "own-intent", skill_id: "own-series", phase: "completed", expires_at: expiry,
    upload_proof: { upload_id: "own-upload", asset_id: "own-asset", source_version_id: "own-version", size_bytes: "3", content_sha256: "a".repeat(64) },
    skill: { skill_id: "own-revision", source_ref: "skill:own-revision", series_id: "own-series", revision: "1", status: "active", name: "Private imported name", summary: "Owner description", tags: [], example_prompts: [], category_keys: [], skill_updated_at: "2026-10-10T00:00:00Z", product: { publication_audience: "owner", state_version: "4", source_kind: "personal" }, package_phase: "valid" },
  } }, { headers: { "cache-control": "private, no-store", "x-request-id": "req-upload-recheck" } }))
  const completed = vi.fn()
  const dialog = (admitted: boolean, generation: number) => <LocaleProvider><SkillUploadDialog readBoundary={{ admitted, subject: "upload-recheck", generation }} open onOpenChange={vi.fn()} onPublished={completed} /></LocaleProvider>
  const view = render(dialog(true, 1))
  fireEvent.click(screen.getByRole("button", { name: "查询导入状态" }))
  await screen.findByText("Private imported name")
  expect(completed).toHaveBeenCalledTimes(1)
  view.rerender(dialog(false, 2))
  expect(screen.queryByText("Private imported name")).toBeNull()
  view.rerender(dialog(true, 2))
  expect(screen.queryByText("Private imported name")).toBeNull()
  expect(reads).toHaveBeenCalledTimes(1)
  expect(completed).toHaveBeenCalledTimes(1)
})


it.each([false, true])("a global MCP import invalidates Settings before it opens (old warm pending: %s)", async (pendingWarm) => {
  const pageClients = await import("@/ui/shell/page-clients")
  const { warmMcpProjection, useMcpProjection } = await import("@/ui/mcp/use-mcp-projection")
  const empty = { items: [], next_cursor: null }
  const imported = { availability: "unavailable" as const, connector_id: "global-import-connector", connector_type: "mcp" as const,
    provider_key: "private-global-import", server_id: "global-import-server", display_name: "New global MCP",
    status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }
  let resolveOld!: (value: typeof empty) => void
  const oldWarm = new Promise<typeof empty>(resolve => { resolveOld = resolve })
  const list = vi.fn().mockImplementationOnce(() => pendingWarm ? oldWarm : Promise.resolve(empty))
    .mockResolvedValue({ items: [imported], next_cursor: null })
  const hub = { ...createHubClient(), listMcpConnectors: list,
    listMcpConnectorProviders: vi.fn().mockResolvedValue(empty),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    listSkills: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    importPrivateMcpJson: vi.fn().mockResolvedValue({ imports: [], replayed: false }),
  }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  // Another identity on an independent client must keep its own warmed facts.
  const otherHub = { ...hub, listMcpConnectors: vi.fn().mockResolvedValue(empty) }
  const otherRelease = warmMcpProjection({ client: otherHub, identity: "other-actor" })
  const other = renderHook(() => useMcpProjection({ client: otherHub, identity: "other-actor", cursor: null, view: "connections" }))
  const settingsClosed = vi.fn()
  function Shell() {
    const [mode, setMode] = useState<import("@/ui/mcp/mcp-panel-model").McpCreateMode | null>(null)
    const [settings, setSettings] = useState<"mcp" | null>(null)
    const shell = useRef<HTMLDivElement | null>(null), trigger = useRef<HTMLElement | null>(null)
    return <div ref={shell}>
      <button onClick={() => setMode("json")}>Global JSON import</button>
      <button onClick={() => setSettings("mcp")}>Manage connectors</button>
      <AppFrameOverlaySurfaces mounted settingsTab={settings} preview readBoundary={{ admitted: true, subject: "global-actor", generation: 1 }}
        brandName="Kokoro" onCloseSettings={() => { setSettings(null); settingsClosed() }} onTabChange={tab => setSettings(tab === "mcp" ? "mcp" : null)}
        onCreateSkillWithAi={vi.fn()} onTrySkill={() => false} settingsReturnFocusRef={trigger} shellRef={shell}
        mcpCreateMode={mode} setMcpCreateMode={setMode} mcpCreateReturnFocusRef={trigger}
        commandMenu={() => null} commandProps={{ onNewChat: vi.fn(), onOpenSettings: vi.fn() }}
        commandOpen={false} onCommandOpenChange={vi.fn()} />
    </div>
  }
  render(<StrictMode><LocaleProvider><Shell /></LocaleProvider></StrictMode>)
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  await act(async () => { await Promise.resolve() })
  fireEvent.click(screen.getByRole("button", { name: "Global JSON import" }))
  fireEvent.change(await screen.findByRole("textbox", { name: "请粘贴您的配置 JSON" }), { target: { value: '{"mcpServers":{"New global MCP":{"type":"streamableHttp","url":"https://mcp.example.test/import"}}}' } })
  fireEvent.click(screen.getByRole("button", { name: "导入" }))
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "通过 JSON 导入" })).toBeNull())
  fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  await act(async () => { await Promise.resolve() })
  expect(await screen.findByRole("button", { name: "New global MCP" })).toBeVisible()
  if (pendingWarm) await act(async () => { resolveOld(empty); await oldWarm })
  fireEvent.click(screen.getByRole("button", { name: "关闭设置" }))
  await waitFor(() => expect(settingsClosed).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
  expect(await screen.findByRole("button", { name: "New global MCP" })).toBeVisible()
  expect(list).toHaveBeenCalledTimes(2)
  expect(other.result.current.connectorProjection?.items).toEqual([])
  expect(otherHub.listMcpConnectors).toHaveBeenCalledTimes(1)
  otherRelease(); other.unmount()
})


it.each([
  { entry: "global", pendingWarm: false }, { entry: "global", pendingWarm: true },
  { entry: "settings", pendingWarm: false }, { entry: "settings", pendingWarm: true },
])("$entry API creation refreshes shared readers only after ACK (old warm pending: $pendingWarm)", async ({ entry, pendingWarm }) => {
  const pageClients = await import("@/ui/shell/page-clients")
  const { ConnectorsSettingsSection } = await import("@/ui/settings/sections/connectors-settings-section")
  const { warmCustomApiProjection, useCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  const empty = { items: [], page: { next_cursor: null } }
  const profile = { profile_id: "created-api", name: "New shared API", state_version: "1",
    created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] }
  let resolveOld!: (value: typeof empty) => void, acknowledge!: () => void
  const oldWarm = new Promise<typeof empty>(resolve => { resolveOld = resolve })
  const acknowledgement = new Promise<void>(resolve => { acknowledge = resolve })
  let created = false
  const list = vi.fn().mockImplementationOnce(() => pendingWarm ? oldWarm : Promise.resolve(empty))
    .mockImplementation(async () => ({ ...empty, items: created ? [profile] : [] }))
  const hub = { ...createHubClient(), listCustomApis: list,
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listSkills: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createCustomApi: vi.fn(async () => { await acknowledgement; created = true; return profile }),
  }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const release = warmCustomApiProjection({ client: hub, identity: "preview" })
  const reader = entry === "settings"
    ? renderHook(() => useCustomApiProjection({ client: hub, identity: "preview", refreshKey: 0 })) : null
  // Both the same client's other actor and another client are outside this write.
  const otherRelease = warmCustomApiProjection({ client: hub, identity: "preview-other" })
  const other = renderHook(() => useCustomApiProjection({ client: hub, identity: "preview-other", refreshKey: 0 }))
  const otherHub = { ...hub, listCustomApis: vi.fn().mockResolvedValue(empty) }
  const independent = renderHook(() => useCustomApiProjection({ client: otherHub, identity: "preview", refreshKey: 0 }))
  await waitFor(() => expect(other.result.current.loading).toBe(false))
  await waitFor(() => expect(independent.result.current.loading).toBe(false))
  function Shell() {
    const [mode, setMode] = useState<import("@/ui/mcp/mcp-panel-model").McpCreateMode | null>(null)
    const [settings, setSettings] = useState<"mcp" | null>(null)
    const shell = useRef<HTMLDivElement | null>(null), trigger = useRef<HTMLElement | null>(null)
    return <div ref={shell}>
      <button onClick={() => setMode("custom-api")}>Global API create</button>
      <button onClick={() => setSettings("mcp")}>Manage connectors</button>
      <AppFrameOverlaySurfaces mounted settingsTab={settings} preview brandName="Kokoro"
        onCloseSettings={() => setSettings(null)} onTabChange={tab => setSettings(tab === "mcp" ? "mcp" : null)}
        onCreateSkillWithAi={vi.fn()} onTrySkill={() => false} settingsReturnFocusRef={trigger} shellRef={shell}
        mcpCreateMode={mode} setMcpCreateMode={setMode} mcpCreateReturnFocusRef={trigger}
        commandMenu={() => null} commandProps={{ onNewChat: vi.fn(), onOpenSettings: vi.fn() }}
        commandOpen={false} onCommandOpenChange={vi.fn()} />
    </div>
  }
  render(<StrictMode><LocaleProvider>{entry === "global" ? <Shell /> :
    <ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: "preview", generation: 0 }}><ConnectorsSettingsSection client={hub} preview brandName="Kokoro" /></ConnectorCommandProvider>}</LocaleProvider></StrictMode>)
  await act(async () => { await Promise.resolve() })
  if (entry === "global") fireEvent.click(screen.getByRole("button", { name: "Global API create" }))
  else {
    fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "自定义 API" }))
  }
  const input = await screen.findByRole("textbox", { name: "名称" })
  fireEvent.change(input, { target: { value: profile.name } })
  fillApiCreationSecretFixture()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(hub.createCustomApi).toHaveBeenCalledOnce())
  expect(list).toHaveBeenCalledTimes(2)
  const connectorReads = hub.listMcpConnectors.mock.calls.length
  const providerReads = hub.listMcpConnectorProviders.mock.calls.length
  await act(async () => { acknowledge(); await acknowledgement })
  await waitFor(() => expect(input.isConnected).toBe(false))
  if (entry === "global") fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
  if (reader) await waitFor(() => expect(reader.result.current.data.items).toEqual([profile]))
  expect(await screen.findByRole("button", { name: "New shared API" })).toBeVisible()
  expect(list).toHaveBeenCalledTimes(3)
  expect(hub.listMcpConnectors).toHaveBeenCalledTimes(connectorReads)
  expect(hub.listMcpConnectorProviders).toHaveBeenCalledTimes(providerReads)
  if (pendingWarm) await act(async () => { resolveOld(empty); await oldWarm })
  reader?.unmount()
  const reopened = renderHook(() => useCustomApiProjection({ client: hub, identity: "preview", refreshKey: 0 }))
  expect(reopened.result.current.data.items).toEqual([profile])
  expect(list).toHaveBeenCalledTimes(3)
  expect(other.result.current.data.items).toEqual([])
  expect(independent.result.current.data.items).toEqual([])
  expect(otherHub.listCustomApis).toHaveBeenCalledOnce()
  release(); otherRelease(); reopened.unmount(); other.unmount(); independent.unmount()
})

it.each(["global", "settings"] as const)("%s creation ACK cannot close a newer creation window", async (entry) => {
  const pageClients = await import("@/ui/shell/page-clients")
  const { ConnectorsSettingsSection } = await import("@/ui/settings/sections/connectors-settings-section")
  const { useCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const profile = { profile_id: "closed-window-api", name: "Previously submitted API", state_version: "1",
    created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] }
  let created = false
  const hub = { ...createHubClient(),
    listCustomApis: vi.fn(async () => ({ items: created ? [profile] : [], page: { next_cursor: null } })),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listSkills: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createCustomApi: vi.fn(async () => { await pending; created = true; return profile }),
  }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const shared = renderHook(() => useCustomApiProjection({ client: hub, identity: "preview", refreshKey: 0 }))
  function Shell() {
    const [mode, setMode] = useState<import("@/ui/mcp/mcp-panel-model").McpCreateMode | null>(null)
    const shell = useRef<HTMLDivElement | null>(null), trigger = useRef<HTMLElement | null>(null)
    return <div ref={shell}>
      <button onClick={() => setMode("custom-api")}>Global API create</button>
      <button onClick={() => setMode("json")}>Global JSON create</button>
      <AppFrameOverlaySurfaces mounted settingsTab={null} preview brandName="Kokoro" onCloseSettings={vi.fn()} onTabChange={vi.fn()}
        onCreateSkillWithAi={vi.fn()} onTrySkill={() => false} settingsReturnFocusRef={trigger} shellRef={shell}
        mcpCreateMode={mode} setMcpCreateMode={setMode} mcpCreateReturnFocusRef={trigger}
        commandMenu={() => null} commandProps={{ onNewChat: vi.fn(), onOpenSettings: vi.fn() }} commandOpen={false} onCommandOpenChange={vi.fn()} />
    </div>
  }
  render(<StrictMode><LocaleProvider>{entry === "global" ? <Shell /> : <ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: "preview", generation: 0 }}><ConnectorsSettingsSection client={hub} preview brandName="Kokoro" /></ConnectorCommandProvider>}</LocaleProvider></StrictMode>)
  const open = async (kind: "api" | "json") => {
    if (entry === "global") fireEvent.click(screen.getByRole("button", { name: kind === "api" ? "Global API create" : "Global JSON create" }))
    else {
      fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "ArrowDown" })
      fireEvent.click(await screen.findByRole("menuitem", { name: kind === "api" ? "自定义 API" : "通过 JSON 导入 MCP" }))
    }
  }
  await waitFor(() => expect(shared.result.current.loading).toBe(false))
  await open("api")
  fireEvent.change(await screen.findByRole("textbox", { name: "名称" }), { target: { value: profile.name } })
  fillApiCreationSecretFixture()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(hub.createCustomApi).toHaveBeenCalledOnce())
  // The Dialog's close button remains available even while the footer is busy.
  fireEvent.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!)
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "名称" })).toBeNull())
  await open("json")
  const draft = await screen.findByRole("textbox", { name: "请粘贴您的配置 JSON" })
  fireEvent.change(draft, { target: { value: "new window draft" } })
  await act(async () => { acknowledge(); await pending })
  await waitFor(() => expect(shared.result.current.data.items).toEqual([profile]))
  expect(draft.isConnected).toBe(true)
  expect(draft).toHaveValue("new window draft")
  expect(screen.getByRole("dialog", { name: "通过 JSON 导入" })).toBeVisible()
  expect(hub.createCustomApi).toHaveBeenCalledOnce()
  shared.unmount()
})

it.each(["mode", "visibility"] as const)("a retained creation host fences old completion after its %s changes", async (transition) => {
  const { McpCreateDialog } = await import("@/ui/mcp/mcp-create-dialog")
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const hub = { ...createHubClient(), createCustomApi: vi.fn().mockResolvedValue({ profile_id: "retained-host-api", name: "Old API", state_version: "1", environment: [], created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z" }) }
  const close = vi.fn(), confirmed = vi.fn(async () => { await pending })
  const dialog = (mode: "custom-api" | "json", open = true) => <StrictMode><LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: "preview", generation: 0 }}><McpCreateDialog client={hub} mode={mode} open={open} onOpenChange={close} onDone={confirmed} /></ConnectorCommandProvider></LocaleProvider></StrictMode>
  const view = render(dialog("custom-api"))
  fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "Old API" } })
  fillApiCreationSecretFixture()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(hub.createCustomApi).toHaveBeenCalledOnce())
  await waitFor(() => expect(confirmed).toHaveBeenCalledOnce())
  if (transition === "visibility") view.rerender(dialog("custom-api", false))
  view.rerender(dialog(transition === "mode" ? "json" : "custom-api"))
  const draft = transition === "mode" ? screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" }) : screen.getByRole("textbox", { name: "名称" })
  fireEvent.change(draft, { target: { value: "new window draft" } })
  await act(async () => { acknowledge(); await pending })
  await waitFor(() => expect(confirmed).toHaveBeenCalledOnce())
  expect(close).not.toHaveBeenCalled()
  expect(draft).toHaveValue("new window draft")
  expect(draft.isConnected).toBe(true)
})

function apiCreationOverlay(boundary: import("@/ui/auth/use-session-state").ProjectReadBoundary, mode: import("@/ui/mcp/mcp-panel-model").McpCreateMode | null = "custom-api", settingsTab: "mcp" | null = null) {
  return <LocaleProvider><AppFrameOverlaySurfaces mounted settingsTab={settingsTab} preview={false} readBoundary={boundary}
    brandName="Kokoro" onCloseSettings={vi.fn()} onTabChange={vi.fn()} onCreateSkillWithAi={vi.fn()} onTrySkill={() => false}
    settingsReturnFocusRef={{ current: null }} shellRef={{ current: null }} mcpCreateMode={mode} setMcpCreateMode={vi.fn()}
    mcpCreateReturnFocusRef={{ current: null }} commandMenu={() => null} commandProps={{ onNewChat: vi.fn(), onOpenSettings: vi.fn() }}
    commandOpen={false} onCommandOpenChange={vi.fn()} /></LocaleProvider>
}

function fillApiCreationSecretFixture() {
  fireEvent.change(screen.getByRole("textbox", { name: "密钥名称" }), { target: { value: "QA_API_KEY" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^值$/u }), { target: { value: "qa-public-fixture-value" } })
}

function apiCreationHub() {
  return { ...createHubClient(),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listSkills: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  }
}

function mcpCreationRegistration() {
  return { server: { availability: "unavailable" as const, server_id: "creation-server", display_name: "Creation MCP", server_url: "https://mcp.example.test/creation", status: "pending" as const, state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false },
    connector: { availability: "unavailable" as const, connector_id: "creation-connector", connector_type: "mcp" as const, provider_key: "private-creation", server_id: "creation-server", display_name: "Creation MCP", status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }, replayed: false }
}

it.each(["form", "url"] as const)("%s MCP creation pauses its retained inputs during admission recheck", async mode => {
  const pageClients = await import("@/ui/shell/page-clients")
  const hub = { ...apiCreationHub(), registerPrivateMcpServer: vi.fn() }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "server-create-actor", generation: 1 }
  const view = render(apiCreationOverlay(boundary, mode))
  const name = screen.getByRole("textbox", { name: /^服务器名称\*?$/ })
  const url = screen.getByRole("textbox", { name: /^服务器 URL\*?$/ })
  await waitFor(() => expect(name).toHaveFocus())
  fireEvent.change(name, { target: { value: "Retained draft" } })
  fireEvent.change(url, { target: { value: "https://mcp.example.test/creation" } })
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, mode))
  expect(name.isConnected).toBe(true)
  expect(name).toHaveAttribute("readonly")
  expect(url).toHaveAttribute("readonly")
  fireEvent.submit(name.closest("form")!)
  expect(hub.registerPrivateMcpServer).not.toHaveBeenCalled()
  view.rerender(apiCreationOverlay({ ...boundary, generation: 2 }, mode))
  expect(name).toHaveValue("Retained draft")
  expect(screen.getByRole("textbox", { name: /^服务器名称\*?$/ })).toBe(name)
  view.rerender(apiCreationOverlay({ ...boundary, subject: "replacement-server-actor", generation: 3 }, mode))
  expect(screen.getByRole("textbox", { name: /^服务器名称\*?$/ })).toHaveValue("")
})

it.each(["form", "url"] as const)("%s MCP registration ACK after recheck never starts remote Prepare with a retired continuation", async mode => {
  const pageClients = await import("@/ui/shell/page-clients")
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const hub = { ...apiCreationHub(), registerPrivateMcpServer: vi.fn(async () => { await pending; return mcpCreationRegistration() }),
    preparePrivateMcpServer: vi.fn().mockResolvedValue({ ...mcpCreationRegistration(), declarations: [] }) }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "server-old-register", generation: 1 }
  const view = render(apiCreationOverlay(boundary, mode))
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/ }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/ }), { target: { value: "https://mcp.example.test/creation" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce())
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, mode))
  await act(async () => { acknowledge(); await pending })
  expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(screen.getByRole("dialog")).toBeVisible()
})

it("an unknown private registration is recovered across Custom and URL windows using its original request", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const register = vi.fn().mockRejectedValue(new Error("lost registration ACK"))
  const hub = { ...apiCreationHub(), registerPrivateMcpServer: register }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "server-cross-mode", generation: 1 }
  const view = render(apiCreationOverlay(boundary, "form"))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://mcp.example.test/creation" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await screen.findByRole("alert")
  view.rerender(apiCreationOverlay(boundary, null))
  view.rerender(apiCreationOverlay({ ...boundary, generation: 2 }, "url"))
  expect(screen.getByRole("textbox", { name: /^服务器名称\*?$/ })).toHaveValue("")
  expect(screen.getByRole("textbox", { name: /^服务器名称\*?$/ })).toHaveAttribute("readonly")
  expect(register).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(register).toHaveBeenCalledTimes(2))
  expect(register.mock.calls[1]?.slice(0, 2)).toEqual(register.mock.calls[0]?.slice(0, 2))
})

it.each(["form", "url"] as const)("%s creation OAuth recheck closes its popup and rejects a late authorization URL", async mode => {
  const pageClients = await import("@/ui/shell/page-clients")
  const popup = { closed: false, opener: null, location: { replace: vi.fn() }, close: vi.fn(function () { popup.closed = true }) }
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window)
  const registration = mcpCreationRegistration()
  type Started = Awaited<ReturnType<import("@/hub/client").HubClient["reconnectMcpConnectorAuthorization"]>>
  let acknowledge!: (value: Started) => void
  const pending = new Promise<Started>(resolve => { acknowledge = resolve })
  const reconnect = vi.fn<import("@/hub/client").HubClient["reconnectMcpConnectorAuthorization"]>(() => pending)
  const list = vi.fn().mockResolvedValue({ items: [], next_cursor: null })
  const hub = { ...apiCreationHub(), listMcpConnectors: list,
    registerPrivateMcpServer: vi.fn().mockResolvedValue(registration),
    getPrivateMcpServer: vi.fn().mockResolvedValue({ ...registration.server, transport: "streamable_http" as const, prepare_status: "needs_oauth", state_version: "7" }),
    getMcpConnector: vi.fn().mockResolvedValue({ ...registration.connector, state_version: "7" }), beginMcpConnectorAuthorization: vi.fn(), reconnectMcpConnectorAuthorization: reconnect }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: `server-oauth-${mode}`, generation: 1 }
  const view = render(apiCreationOverlay(boundary, mode))
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/ }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/ }), { target: { value: "https://mcp.example.test/creation" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await screen.findByRole("button", { name: "管理" })
  expect(hub.beginMcpConnectorAuthorization).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole("button", { name: "连接" }))
  await waitFor(() => expect(reconnect).toHaveBeenCalledOnce())
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, mode))
  expect(popup.close).toHaveBeenCalledOnce()
  expect(reconnect.mock.calls[0]?.[2]?.aborted).toBe(true)
  await act(async () => { acknowledge({ authorization: { authorization_id: "late-creation-auth", authorization_url: "https://oauth.example.test/late", expires_at: "2999-01-01T00:00:00Z" }, connector: registration.connector }); await pending })
  expect(popup.location.replace).not.toHaveBeenCalled()
  expect(screen.getByRole("dialog")).toBeVisible()
  expect(reconnect).toHaveBeenCalledOnce()
})

const atomicMcpDocument = JSON.stringify({ mcpServers: { "Original import": { type: "streamableHttp", url: "https://mcp.example.test/original", headers: { "x-acceptance-check": "fixture-only" } } } })

it("JSON creation pauses for the current actor recheck without losing the editor and clears another actor's draft", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const hub = { ...apiCreationHub(), importPrivateMcpJson: vi.fn() }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "json-actor", generation: 1 }
  const view = render(apiCreationOverlay(boundary, "json"))
  const editor = screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })
  fireEvent.change(editor, { target: { value: atomicMcpDocument } })
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, "json"))
  expect(editor.isConnected).toBe(true)
  expect(editor).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "导入" })).toBeDisabled()
  fireEvent.submit(editor.closest("form")!)
  expect(hub.importPrivateMcpJson).not.toHaveBeenCalled()
  view.rerender(apiCreationOverlay({ ...boundary, generation: 2 }, "json"))
  expect(screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })).toBe(editor)
  expect(editor).toHaveValue(atomicMcpDocument)
  expect(screen.getByRole("button", { name: "导入" })).toBeEnabled()
  view.rerender(apiCreationOverlay({ ...boundary, subject: "other-actor", generation: 3 }, "json"))
  expect(screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })).toHaveValue("")
  view.rerender(apiCreationOverlay({ ...boundary, generation: 4 }, "json"))
  expect(screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })).toHaveValue("")
})

it("JSON unknown creation survives closing and recheck and only retries its original key and complete document", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const write = vi.fn().mockRejectedValue(new Error("lost ACK"))
  const hub = { ...apiCreationHub(), importPrivateMcpJson: write }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "json-unknown", generation: 1 }
  const view = render(apiCreationOverlay(boundary, "json"))
  const editor = screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })
  fireEvent.change(editor, { target: { value: atomicMcpDocument } })
  fireEvent.click(screen.getByRole("button", { name: "导入" }))
  await screen.findByRole("alert")
  expect(editor).toHaveAttribute("readonly")
  expect(write).toHaveBeenCalledOnce()
  expect(write.mock.calls[0]?.[1]).toEqual(expect.any(String))
  view.rerender(apiCreationOverlay(boundary, null))
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, "json"))
  expect(screen.getByRole("button", { name: "重试原请求" })).toBeDisabled()
  view.rerender(apiCreationOverlay({ ...boundary, generation: 2 }, "json"))
  expect(write).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(write.mock.calls[1]?.slice(0, 2)).toEqual(write.mock.calls[0]?.slice(0, 2))
  expect(write.mock.calls[1]?.[0]).toBe(atomicMcpDocument)
})

it("JSON unknown creation is shared between global and Settings windows without replay on navigation", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const write = vi.fn().mockRejectedValue(new Error("lost ACK"))
  const hub = { ...apiCreationHub(), importPrivateMcpJson: write }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "json-cross-entry", generation: 1 }
  const view = render(apiCreationOverlay(boundary, "json"))
  fireEvent.change(screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" }), { target: { value: atomicMcpDocument } })
  fireEvent.click(screen.getByRole("button", { name: "导入" }))
  await screen.findByRole("alert")
  view.rerender(apiCreationOverlay(boundary, null, "mcp"))
  await screen.findByRole("heading", { name: "已添加的连接器" })
  fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "通过 JSON 导入 MCP" }))
  expect(screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })).toHaveValue("")
  expect(screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })).toHaveAttribute("readonly")
  expect(write).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  expect(write.mock.calls[1]?.slice(0, 2)).toEqual(write.mock.calls[0]?.slice(0, 2))
})

it("a late JSON creation ACK clears the raw document and requires current Done rather than closing through a retired boundary", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const write = vi.fn<NonNullable<import("@/hub/client").HubClient["importPrivateMcpJson"]>>(async () => { await pending; return { imports: [], replayed: false } })
  const hub = { ...apiCreationHub(), importPrivateMcpJson: write }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "json-late-ack", generation: 1 }
  const view = render(apiCreationOverlay(boundary, "json"))
  const editor = screen.getByRole("textbox", { name: "请粘贴您的配置 JSON" })
  fireEvent.change(editor, { target: { value: atomicMcpDocument } })
  fireEvent.click(screen.getByRole("button", { name: "导入" }))
  await waitFor(() => expect(write).toHaveBeenCalledOnce())
  const signal = write.mock.calls[0]?.[2] as AbortSignal | undefined
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, "json"))
  expect(signal?.aborted).toBe(true)
  await act(async () => { acknowledge(); await pending })
  expect(editor).toHaveValue("")
  expect(editor).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "完成" })).toBeDisabled()
  view.rerender(apiCreationOverlay({ ...boundary, generation: 2 }, "json"))
  expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
  expect(screen.getByRole("dialog", { name: "通过 JSON 导入" })).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "完成" }))
  expect(write).toHaveBeenCalledOnce()
})

it("API creation pauses during same-actor recheck and clears drafts on actor replacement", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const hub = { ...apiCreationHub(), createCustomApi: vi.fn() }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const view = render(apiCreationOverlay({ admitted: true, subject: "create-actor", generation: 1 }))
  const name = screen.getByRole("textbox", { name: "名称" })
  fireEvent.change(name, { target: { value: "Actor draft" } })
  fireEvent.change(screen.getByRole("textbox", { name: "密钥名称" }), { target: { value: "DUMMY_SECRET" } })
  fireEvent.change(screen.getByRole("textbox", { name: "值" }), { target: { value: "dummy-fixture-only" } })
  view.rerender(apiCreationOverlay({ admitted: false, subject: "create-actor", generation: 2 }))
  expect(name.isConnected).toBe(true)
  expect(name).toHaveValue("Actor draft")
  expect(name).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  fireEvent.submit(name.closest("form")!)
  expect(hub.createCustomApi).not.toHaveBeenCalled()
  view.rerender(apiCreationOverlay({ admitted: true, subject: "create-actor", generation: 2 }))
  expect(screen.getByRole("textbox", { name: "名称" })).toBe(name)
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  view.rerender(apiCreationOverlay({ admitted: true, subject: "replacement-actor", generation: 3 }))
  expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue("")
  expect(screen.getByRole("textbox", { name: "值" })).toHaveValue("")
  view.rerender(apiCreationOverlay({ admitted: true, subject: "create-actor", generation: 4 }))
  expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue("")
})

it("API creation preserves one frozen command after a lost acknowledgement", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const create = vi.fn().mockRejectedValueOnce(new Error("lost response"))
  const hub = { ...apiCreationHub(), createCustomApi: create }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  render(apiCreationOverlay({ admitted: true, subject: "unknown-create-actor", generation: 1 }))
  const name = screen.getByRole("textbox", { name: "名称" })
  fireEvent.change(name, { target: { value: "Original API" } })
  fillApiCreationSecretFixture()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await screen.findByRole("alert")
  expect(name).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "重试原请求" })).toBeEnabled()
  expect(create).toHaveBeenCalledOnce()
  expect(create.mock.calls[0]?.[1]).toEqual(expect.any(String))
})

it("API creation resumes the original request after closing the window and rechecking its actor", async () => {
  const pageClients = await import("@/ui/shell/page-clients")
  const profile = { profile_id: "resumed-api", name: "Original API", state_version: "1", environment: [], created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z" }
  const create = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValue(profile)
  const hub = { ...apiCreationHub(), createCustomApi: create }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "resuming-actor", generation: 1 }
  const view = render(apiCreationOverlay(boundary))
  fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: profile.name } })
  fillApiCreationSecretFixture()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await screen.findByRole("alert")
  view.rerender(apiCreationOverlay(boundary, null))
  expect(screen.queryByRole("textbox", { name: "名称" })).toBeNull()
  view.rerender(apiCreationOverlay(boundary))
  expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue("")
  view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }))
  expect(screen.getByRole("button", { name: "重试原请求" })).toBeDisabled()
  view.rerender(apiCreationOverlay({ ...boundary, generation: 2 }))
  expect(create).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
  expect(create.mock.calls[1]?.slice(0, 2)).toEqual(create.mock.calls[0]?.slice(0, 2))
  expect(create.mock.calls[1]?.[0]).toEqual({ name: profile.name, environment: [{ name: "QA_API_KEY", value: "qa-public-fixture-value" }] })
})

it.each([false, true])("an acknowledged API secret stays cleared and Done can recover a close failure (recheck: %s)", async recheckClosing => {
  const { CustomApiForm } = await import("@/ui/mcp/custom-api-form")
  const { createCustomApiCreateFlow } = await import("@/ui/mcp/custom-api-create-flow")
  let acknowledge!: () => void, rejectClosing!: (cause: Error) => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const closing = new Promise<void>((_resolve, reject) => { rejectClosing = reject })
  const create = vi.fn(async () => { await pending; return { profile_id: "secret-ack-api", name: "Secret API", state_version: "1", environment: [], created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z" } })
  const boundary = { admitted: true, subject: "secret-ack-actor", generation: 1 }
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary, onConfirmed: vi.fn() })
  const onDone = vi.fn().mockImplementationOnce(async () => { await closing }).mockResolvedValue(undefined)
  const form = (generation: number) => <LocaleProvider><CustomApiForm flow={flow} boundary={{ ...boundary, generation }} onCancel={vi.fn()} onDone={onDone} /></LocaleProvider>
  const view = render(form(1))
  fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "Secret API" } })
  fireEvent.change(screen.getByRole("textbox", { name: "密钥名称" }), { target: { value: "DUMMY_KEY" } })
  const secret = screen.getByRole("textbox", { name: "值" })
  fireEvent.change(secret, { target: { value: "fixture-only" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  act(() => flow.bind({ ...boundary, generation: 2 }))
  view.rerender(form(2))
  await act(async () => { acknowledge(); await pending })
  await screen.findByText("已添加自定义 API。")
  expect(secret).toHaveValue("")
  fireEvent.click(screen.getByRole("button", { name: "完成" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  expect(secret).toHaveValue("")
  expect(secret).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "完成" })).toBeDisabled()
  fireEvent.submit(secret.closest("form")!)
  expect(create).toHaveBeenCalledOnce()
  if (recheckClosing) {
    act(() => flow.bind({ ...boundary, admitted: false, generation: 3 }))
    view.rerender(form(3))
    act(() => flow.bind({ ...boundary, generation: 3 }))
  }
  await act(async () => { rejectClosing(new Error("close failed")); await closing.catch(() => undefined) })
  expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
  expect(secret).toHaveValue("")
  fireEvent.click(screen.getByRole("button", { name: "完成" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2))
  expect(create).toHaveBeenCalledOnce()
})

it("connector invalidation preserves another actor and retries a failed mounted read without a remount", async () => {
  const { invalidateMcpConnectorProjection, useMcpProjection } = await import("@/ui/mcp/use-mcp-projection")
  const page = (name: string) => ({ items: [{ availability: "unavailable" as const, connector_id: name, connector_type: "mcp" as const,
    provider_key: "private-check", status: "pending" as const, approved_scopes: [], enabled: false,
    state_version: "1", display_name: name }], next_cursor: null })
  const list = vi.fn().mockResolvedValueOnce(page("old-a")).mockResolvedValueOnce(page("other-b"))
    .mockRejectedValueOnce(new Error("temporary read failure")).mockResolvedValue(page("fresh-a"))
  const providers = vi.fn().mockResolvedValue({ items: [], next_cursor: null })
  const hub = { ...createHubClient(), listMcpConnectors: list, listMcpConnectorProviders: providers }
  const a = renderHook(() => useMcpProjection({ client: hub, identity: "actor", cursor: null, view: "connections" }))
  await waitFor(() => expect(a.result.current.connectorProjection?.items[0]?.display_name).toBe("old-a"))
  const b = renderHook(() => useMcpProjection({ client: hub, identity: "actor-long", cursor: null, view: "connections" }))
  await waitFor(() => expect(b.result.current.connectorProjection?.items[0]?.display_name).toBe("other-b"))
  const providerReads = providers.mock.calls.length
  act(() => invalidateMcpConnectorProjection(hub, "actor"))
  await waitFor(() => expect(a.result.current.connectorState.error).toBe(true))
  expect(a.result.current.connectorState.loading).toBe(false)
  expect(b.result.current.connectorProjection?.items[0]?.display_name).toBe("other-b")
  expect(list).toHaveBeenCalledTimes(3)
  act(() => a.result.current.reload("connectors"))
  await waitFor(() => expect(a.result.current.connectorProjection?.items[0]?.display_name).toBe("fresh-a"))
  expect(a.result.current.connectorState.error).toBe(false)
  expect(providers).toHaveBeenCalledTimes(providerReads)
  expect(b.result.current.connectorProjection?.items[0]?.display_name).toBe("other-b")
  a.unmount()
  const reopened = renderHook(() => useMcpProjection({ client: hub, identity: "actor", cursor: null, view: "connections" }))
  await waitFor(() => expect(reopened.result.current.connectorProjection?.items[0]?.display_name).toBe("fresh-a"))
  expect(list).toHaveBeenCalledTimes(4)
  reopened.unmount(); b.unmount()
})


it("Settings revalidates a registered MCP again after remote Prepare completes", async () => {
  const { ConnectorsSettingsSection } = await import("@/ui/settings/sections/connectors-settings-section")
  let finish!: () => void
  const remote = new Promise<void>(resolve => { finish = resolve })
  let registered = false, ready = false
  const connector = () => ({ availability: ready ? "available" as const : "unavailable" as const, connector_id: "prepared-connector", connector_type: "mcp" as const,
    provider_key: "private-prepared", server_id: "prepared-server", display_name: "Prepared MCP",
    status: ready ? "active" as const : "pending" as const, approved_scopes: [], enabled: ready, state_version: ready ? "2" : "1" })
  const registration = () => ({ server: { availability: ready ? "available" as const : "unavailable" as const, server_id: "prepared-server", display_name: "Prepared MCP", server_url: "https://mcp.example.test/prepare",
    status: ready ? "registered" as const : "pending" as const, state_version: ready ? "2" : "1", headers: [],
    transport: "streamable_http" as const, prepare_status: ready ? "ready" as const : "pending_prepare" as const, declarations: [], declaration_digest: ready ? "a".repeat(64) : undefined, declarations_available: ready }, connector: connector(), replayed: false })
  const list = vi.fn(async () => ({ items: registered ? [connector()] : [], next_cursor: null }))
  const hub = { ...createHubClient(), listMcpConnectors: list,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    getPrivateMcpServer: vi.fn(async () => registration().server),
    getMcpConnector: vi.fn(async () => connector()),
    registerPrivateMcpServer: vi.fn(async () => { registered = true; return registration() }),
    preparePrivateMcpServer: vi.fn(async () => { await remote; ready = true; return { ...registration(), declarations: [] } }),
  }
  render(<LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: "preview", generation: 0 }}><ConnectorsSettingsSection client={hub} preview brandName="Kokoro" /></ConnectorCommandProvider></LocaleProvider>)
  await waitFor(() => expect(list).toHaveBeenCalledOnce())
  const query = screen.getByRole("searchbox", { name: "搜索连接器" })
  fireEvent.change(query, { target: { value: "Prepared" } })
  fireEvent.keyDown(screen.getByRole("button", { name: "创建" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "自定义 MCP" }))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Prepared MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://mcp.example.test/prepare" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  await screen.findByRole("button", { name: "管理" })
  const configuredDetail = screen.getByRole("dialog", { name: "Prepared MCP" })
  expect(within(configuredDetail).queryByLabelText("已连接")).not.toBeInTheDocument()
  expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
  fireEvent.click(await within(configuredDetail).findByRole("button", { name: "连接" }))
  await waitFor(() => expect(hub.preparePrivateMcpServer).toHaveBeenCalledOnce())
  await act(async () => { await Promise.resolve() })
  await act(async () => { finish(); await remote })
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
  // The existing explicit Connect success closes its detail; reopen the same resource.
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Prepared MCP" })).not.toBeInTheDocument())
  fireEvent.click(await screen.findByRole("button", { name: "Prepared MCP" }))
  const createdDetail = await screen.findByRole("dialog", { name: "Prepared MCP" })
  expect(await within(createdDetail).findByLabelText("已连接")).toBeVisible()
  fireEvent.keyDown(createdDetail, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Prepared MCP" })).not.toBeInTheDocument())
  expect(await screen.findByLabelText("已连接")).toBeVisible()
  expect(screen.getByRole("searchbox", { name: "搜索连接器" })).toBe(query)
  expect(query).toHaveValue("Prepared")
})

it("MCP same-actor recheck keeps search and the private detail shell but retires facts until a fresh read", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  let finish!: (value: unknown) => void
  const nextServer = new Promise(resolve => { finish = resolve })
  const connector = () => ({ availability: "unavailable" as const, connector_id: "recheck-connector", connector_type: "mcp" as const,
    provider_key: "private-recheck", server_id: "recheck-server", display_name: "Private MCP",
    status: "pending" as const, approved_scopes: [], enabled: false, state_version: String(round) })
  const server = () => ({ availability: "unavailable" as const, server_id: "recheck-server", display_name: round === 1 ? "Private MCP" : "Fresh MCP",
    server_url: "https://mcp.example.test/recheck", notes: "Private note", status: "pending" as const,
    state_version: String(round), headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const,
    declarations: [], declarations_available: false })
  const list = vi.fn(async () => ({ items: [connector()], next_cursor: null }))
  const read = vi.fn().mockImplementation(() => round === 1 ? Promise.resolve(server()) : nextServer)
  const hub = { ...createHubClient(), listMcpConnectors: list, getPrivateMcpServer: read,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (admitted: boolean, generation: number, subject = "mcp-recheck") =>
    <LocaleProvider><McpContent client={hub} embedded settingsLayout initialView="connections" readBoundary={{ admitted, subject, generation }} /></LocaleProvider>
  const view = render(content(true, 1))
  const query = screen.getByRole("searchbox", { name: "搜索连接器" })
  fireEvent.change(query, { target: { value: "Private" } })
  fireEvent.click(await screen.findByRole("button", { name: "Private MCP" }))
  const dialog = await screen.findByRole("dialog", { name: "Private MCP" })
  round = 2
  view.rerender(content(false, 2))
  expect(query.isConnected).toBe(true)
  expect(query).toHaveValue("Private")
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByText("recheck-server")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  expect(read).toHaveBeenCalledOnce()
  view.rerender(content(true, 2))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  expect(screen.getByRole("dialog")).toBe(dialog)
  await act(async () => { finish(server()); await nextServer })
  expect(await screen.findByRole("dialog", { name: "Fresh MCP" })).toBe(dialog)
  expect(list).toHaveBeenCalledTimes(2)
  view.rerender(content(true, 3, "other-mcp-actor"))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.getByRole("searchbox", { name: "搜索连接器" })).toHaveValue("")
  view.rerender(content(true, 4))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.getByRole("searchbox", { name: "搜索连接器" })).toHaveValue("")
})

it("MCP recheck restores typed configuration against fresh facts/CAS and an old command cannot close the current detail", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  let acknowledge!: () => void
  const ack = new Promise<void>(resolve => { acknowledge = resolve })
  const server = () => ({ availability: "unavailable" as const, server_id: "draft-server", display_name: `Server ${round}`, notes: `Owner note ${round}`,
    server_url: `https://mcp.example.test/v${round}`, status: "pending" as const, state_version: String(round),
    headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false })
  const read = vi.fn(async () => server())
  const update = vi.fn(async () => { await ack; return { server: server(), connector: { availability: "unavailable" as const, connector_id: "draft-connector", connector_type: "mcp" as const,
    provider_key: "private-draft", server_id: "draft-server", display_name: `Server ${round}`, status: "pending" as const,
    approved_scopes: [], enabled: false, state_version: String(round) }, replayed: false } })
  const hub = { ...createHubClient(), getPrivateMcpServer: read, updatePrivateMcpServer: update,
    listMcpConnectors: vi.fn(async () => ({ items: [{ availability: "unavailable" as const, connector_id: "draft-connector", connector_type: "mcp" as const,
      provider_key: "private-draft", server_id: "draft-server", display_name: `Server ${round}`, status: "pending" as const,
      approved_scopes: [], enabled: false, state_version: String(round) }], next_cursor: null })),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} embedded settingsLayout initialView="connections" readBoundary={{ admitted, subject: "draft-actor", generation }} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: "Server 1" }))
  const dialog = await screen.findByRole("dialog", { name: "Server 1" })
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "My explicit edit" } })
  round = 2
  view.rerender(content(false, 2))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveValue("")
  expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveAttribute("readonly")
  expect(screen.queryByText("Owner note 1")).not.toBeInTheDocument()
  view.rerender(content(true, 2))
  await waitFor(() => expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveValue("https://mcp.example.test/v2"))
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("My explicit edit")
  expect(screen.getByRole("textbox", { name: "备注 （可选）" })).toHaveValue("Owner note 2")
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledWith("draft-server", { expected_state_version: "2", display_name: "My explicit edit" }, expect.any(String), expect.any(AbortSignal)))
  round = 3
  view.rerender(content(false, 3))
  view.rerender(content(true, 3))
  await waitFor(() => expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveValue("https://mcp.example.test/v3"))
  await act(async () => { acknowledge(); await ack })
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("My explicit edit")
  expect(update).toHaveBeenCalledOnce()
})

it.each(["failure", "missing"])("MCP recheck keeps a recoverable detail when the new exact resource is %s", async kind => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  const connector = { availability: "unavailable" as const, connector_id: "retry-connector", connector_type: "mcp" as const, provider_key: "private-retry",
    server_id: "retry-server", display_name: "Retry server", status: "pending" as const,
    approved_scopes: [], enabled: false, state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: "retry-server", display_name: "Retry server", server_url: "https://mcp.example.test/retry",
    status: "pending" as const, state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const,
    declarations: [], declarations_available: false }
  const read = vi.fn(async (serverId: string) => {
    if (serverId !== "retry-server") throw Error("wrong resource");
    if (round === 2 && kind === "failure") throw Error("temporary detail read failure")
    return server
  })
  const hub = { ...createHubClient(), getPrivateMcpServer: read,
    listMcpConnectors: vi.fn(async () => ({ items: round === 2 && kind === "missing" ? [] : [connector], next_cursor: null })),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} embedded settingsLayout initialView="connections" readBoundary={{ admitted, subject: `retry-actor-${kind}`, generation }} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: "Retry server" }))
  const dialog = await screen.findByRole("dialog", { name: "Retry server" })
  round = 2
  view.rerender(content(false, 2))
  view.rerender(content(true, 2))
  await within(dialog).findByText("连接列表加载失败")
  expect(within(dialog).queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  // A fresh admission while the resource is still missing must stay locked.
  view.rerender(content(false, 3)); view.rerender(content(true, 3))
  await within(dialog).findByText("连接列表加载失败")
  expect(within(dialog).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  round = 3
  view.rerender(content(false, 4)); view.rerender(content(true, 4))
  expect(await screen.findByRole("dialog", { name: "Retry server" })).toBe(dialog)
  expect(read.mock.calls.every(args => args[0] === "retry-server")).toBe(true)
})

it("MCP initial private read failure stays quiet and opening the same card reads again", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const connector = { availability: "unavailable" as const, connector_id: "first-failure", connector_type: "mcp" as const, provider_key: "private-first",
    server_id: "first-server", display_name: "First read", status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }
  const read = vi.fn().mockRejectedValueOnce(Error("temporary first read")).mockResolvedValue({ availability: "unavailable" as const, server_id: "first-server",
    display_name: "First read", server_url: "https://mcp.example.test/first", status: "pending", state_version: "1",
    headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false })
  const hub = { ...createHubClient(), getPrivateMcpServer: read,
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  render(<LocaleProvider><McpContent client={hub} preview initialView="connections" /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "First read" }))
  await screen.findByText("连接列表加载失败")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "First read" }))
  expect(await screen.findByRole("dialog", { name: "First read" })).toBeVisible()
  expect(read).toHaveBeenCalledTimes(2)
})

it("MCP catalog recheck reports an absent exact provider without waiting for an unrelated connector read", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  const provider = { provider_key: "provider-recheck", display_name: "Provider detail", directory_type: "app" as const,
    category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const list = vi.fn(async () => ({ items: round === 1 ? [provider] : [], next_cursor: null }))
  const hub = { ...createHubClient(), listMcpConnectorProviders: list,
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} initialView="catalog" readBoundary={{ admitted, generation, subject: "absent-provider" }} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: /Provider detail/ }))
  const dialog = await screen.findByRole("dialog", { name: "Provider detail" })
  round = 2
  view.rerender(content(false, 2)); view.rerender(content(true, 2))
  await within(dialog).findByText("连接列表加载失败")
  expect(within(dialog).queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  round = 1
  view.rerender(content(false, 3)); view.rerender(content(true, 3))
  expect(await screen.findByRole("dialog", { name: "Provider detail" })).toBe(dialog)
})

it("MCP OAuth admission retirement closes its popup and blocks a late old authorization URL", async () => {
  const { useMcpOAuthPopup } = await import("@/ui/mcp/use-mcp-oauth-popup")
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  const navigate = vi.fn(), close = vi.fn()
  const popup = { opener: null, closed: false, close, location: { replace: navigate } }
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window)
  let signal!: AbortSignal
  const onReload = vi.fn()
  const initial = { admitted: true }
  const view = renderHook(({ lifecycle }) => useMcpOAuthPopup({ lifecycle, onReload }), { initialProps: { lifecycle: initial } })
  let result!: Promise<unknown>
  act(() => { result = view.result.current(async value => { signal = value; await pending; return {
    connectorId: "old-connector", authorizationUrl: "https://oauth.example.test/old", expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } }).catch(error => error) })
  view.rerender({ lifecycle: { admitted: false } })
  expect(signal.aborted).toBe(true)
  expect(close).toHaveBeenCalledOnce()
  view.rerender({ lifecycle: { admitted: true } })
  await act(async () => { finish(); await result })
  expect(navigate).not.toHaveBeenCalled()
  expect(onReload).not.toHaveBeenCalled()
})

it("MCP retired OAuth Create still invalidates a confirmed new connector without continuing authorization", async () => {
  const { useMcpProjection } = await import("@/ui/mcp/use-mcp-projection")
  let finish!: () => void
  let created = false
  const pending = new Promise<void>(resolve => { finish = resolve })
  const provider = { provider_key: "late-create", display_name: "Late create provider", directory_type: "app" as const,
    category_keys: [], example_prompts: [], enabled: true, state_version: "1", connection_server_id: "oauth-server" }
  const connector = { availability: "unavailable" as const, connector_id: "late-created", connector_type: "mcp" as const, provider_key: provider.provider_key,
    status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }
  const begin = vi.fn()
  const create = vi.fn(async () => { await pending; created = true; return connector })
  const hub = { ...createHubClient(), createMcpConnector: create, beginMcpConnectorAuthorization: begin,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn(async () => ({ items: created ? [connector] : [], next_cursor: null })),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const navigate = vi.fn()
  const content = (admitted: boolean, readGeneration: number) => <LocaleProvider><McpProjectionRead client={hub} identity="late-create-actor" admitted={admitted} readGeneration={readGeneration} initialView="catalog" onAuthorizationNavigate={navigate} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: /Late create provider/ }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "连接" }))
  await waitFor(() => expect(create).toHaveBeenCalledOnce())
  view.rerender(content(false, 2)); view.rerender(content(true, 2))
  const reader = renderHook(() => useMcpProjection({ client: hub, identity: "late-create-actor", cursor: null, view: "connections", readGeneration: 2 }))
  await waitFor(() => expect(reader.result.current.connectorProjection?.items).toEqual([]))
  await act(async () => { finish(); await pending })
  await waitFor(() => expect(reader.result.current.connectorProjection?.items[0]?.connector_id).toBe("late-created"))
  expect(begin).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  reader.unmount()
})

it("MCP plaza recheck keeps the directory search and category controls mounted without retaining old cards", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  const provider = { provider_key: "stable-controls", display_name: "Stable directory provider", directory_type: "app" as const,
    category_keys: ["finance" as const], example_prompts: [], enabled: true, state_version: "1" }
  const hub = { ...createHubClient(), listMcpConnectorProviders: vi.fn(async () => ({ items: round === 1 ? [provider] : [], next_cursor: null })),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} embedded initialView="catalog" readBoundary={{ admitted, generation, subject: "stable-directory" }} /></LocaleProvider>
  const view = render(content(true, 1))
  await screen.findByRole("button", { name: "Stable directory provider" })
  const query = screen.getByRole("searchbox", { name: "搜索连接器" })
  fireEvent.change(query, { target: { value: "Stable" } })
  const category = screen.getByRole("button", { name: "财经" })
  fireEvent.click(category)
  round = 2
  view.rerender(content(false, 2))
  expect(query.isConnected).toBe(true)
  expect(category.isConnected).toBe(true)
  expect(category).toHaveAttribute("aria-pressed", "true")
  expect(screen.queryByRole("button", { name: "Stable directory provider" })).not.toBeInTheDocument()
  expect(screen.queryByText("当前没有可添加的连接器提供方。")).not.toBeInTheDocument()
  view.rerender(content(true, 2))
  await waitFor(() => expect(hub.listMcpConnectorProviders).toHaveBeenCalledTimes(2))
  expect(query).toHaveValue("Stable")
})

it("MCP suspended prewarms cannot overwrite a fresh generation or be reused on reopening", async () => {
  const { warmMcpProjection, useMcpProjection } = await import("@/ui/mcp/use-mcp-projection")
  const { warmCustomApiProjection, useCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  let finishProviders!: (value: unknown) => void, finishConnectors!: (value: unknown) => void, finishApis!: (value: unknown) => void
  const oldProviders = new Promise(resolve => { finishProviders = resolve })
  const oldConnectors = new Promise(resolve => { finishConnectors = resolve })
  const oldApis = new Promise(resolve => { finishApis = resolve })
  const provider = (label: string) => ({ provider_key: "generation-provider", display_name: label, directory_type: "app" as const,
    category_keys: [], example_prompts: [], enabled: true, state_version: "1" })
  const connector = (label: string) => ({ availability: "unavailable" as const, connector_id: label, connector_type: "mcp" as const, provider_key: "generation-provider",
    status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" })
  const providers = vi.fn().mockReturnValueOnce(oldProviders).mockResolvedValue({ items: [provider("Fresh provider")], next_cursor: null })
  const connectors = vi.fn().mockReturnValueOnce(oldConnectors).mockResolvedValue({ items: [connector("fresh-connector")], next_cursor: null })
  const apis = vi.fn().mockReturnValueOnce(oldApis).mockResolvedValue({ items: [], page: { next_cursor: null } })
  const hub = { ...createHubClient(), listMcpConnectorProviders: providers, listMcpConnectors: connectors, listCustomApis: apis }
  const releaseMcp = warmMcpProjection({ client: hub, identity: "generation-actor", readGeneration: 1 })
  const releaseApi = warmCustomApiProjection({ client: hub, identity: "generation-actor", readGeneration: 1 })
  releaseMcp(); releaseApi()
  const useReads = () => ({ mcp: useMcpProjection({ client: hub, identity: "generation-actor", cursor: null, view: "connections", readGeneration: 2 }),
    api: useCustomApiProjection({ client: hub, identity: "generation-actor", refreshKey: 0, readGeneration: 2 }) })
  const view = renderHook(useReads)
  await waitFor(() => expect(view.result.current.mcp.providerProjection?.items[0]?.display_name).toBe("Fresh provider"))
  await act(async () => {
    finishProviders({ items: [provider("Retired provider")], next_cursor: null })
    finishConnectors({ items: [connector("retired-connector")], next_cursor: null })
    finishApis({ items: [{ profile_id: "retired-profile" }], page: { next_cursor: null } })
    await Promise.all([oldProviders, oldConnectors, oldApis])
  })
  view.unmount()
  const reopened = renderHook(useReads)
  expect(reopened.result.current.mcp.providerProjection?.items[0]?.display_name).toBe("Fresh provider")
  expect(reopened.result.current.mcp.connectorProjection?.items[0]?.connector_id).toBe("fresh-connector")
  expect(reopened.result.current.api.data.items).toEqual([])
  expect(providers).toHaveBeenCalledTimes(2); expect(connectors).toHaveBeenCalledTimes(2); expect(apis).toHaveBeenCalledTimes(2)
  reopened.unmount()
})

it("Custom API same-actor recheck keeps its detail through a failed read and restores only current fields", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  const profile = () => ({ profile_id: "recheck-api", name: `API ${round}`, instructions: `Instructions ${round}`, state_version: String(round),
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", environment: [] })
  const apis = vi.fn(async () => { if (round === 2) throw Error("temporary API read failure"); return { items: [profile()], page: { next_cursor: null } } })
  const hub = { ...createHubClient(), listCustomApis: apis,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted, generation, subject: "api-recheck-actor" }} /></LocaleProvider>
  const view = render(content(true, 1))
  const savedApi = await screen.findByRole("button", { name: "API 1" })
  // A persisted API profile has no connection-status fact.
  expect(within(savedApi).queryByLabelText("已连接")).not.toBeInTheDocument()
  expect(within(savedApi).getByLabelText("已添加")).toBeVisible()
  fireEvent.click(savedApi)
  const dialog = screen.getByRole("dialog", { name: "编辑自定义 API" })
  round = 2
  view.rerender(content(false, 2))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(within(dialog).getByLabelText("备注（可选）")).toHaveValue("")
  view.rerender(content(true, 2))
  await within(dialog).findByText("连接列表加载失败")
  expect(within(dialog).queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  round = 3
  view.rerender(content(false, 3)); view.rerender(content(true, 3))
  await waitFor(() => expect(within(dialog).getByLabelText("名称")).toHaveValue("API 3"))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(within(dialog).getByLabelText("备注（可选）")).toHaveValue("Instructions 3")
})

it("Custom API late confirmed update invalidates its own current projection without closing the rechecked detail", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const { useCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  let finish!: () => void
  let updated = false
  const pending = new Promise<void>(resolve => { finish = resolve })
  const profile = () => ({ profile_id: "late-api", name: updated ? "Confirmed API" : "Old API", instructions: "Owner instructions", state_version: updated ? "2" : "1",
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", environment: [] })
  const update = vi.fn(async () => { await pending; updated = true; return profile() })
  const hub = { ...createHubClient(), updateCustomApi: update,
    listCustomApis: vi.fn(async () => ({ items: [profile()], page: { next_cursor: null } })),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted, generation, subject: "late-api-actor" }} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: "Old API" }))
  const dialog = screen.getByRole("dialog", { name: "编辑自定义 API" })
  fireEvent.change(within(dialog).getByLabelText("名称"), { target: { value: "Confirmed API" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  view.rerender(content(false, 2)); view.rerender(content(true, 2))
  const reader = renderHook(() => useCustomApiProjection({ client: hub, identity: "late-api-actor", refreshKey: 0, readGeneration: 2 }))
  await waitFor(() => expect(reader.result.current.data.items[0]?.name).toBe("Old API"))
  await act(async () => { finish(); await pending })
  await waitFor(() => expect(reader.result.current.data.items[0]?.name).toBe("Confirmed API"))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(update).toHaveBeenCalledOnce()
  reader.unmount()
})

it("MCP first-open locator recovers its missing row after a new admission recheck", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let round = 1
  let finish!: (value: unknown) => void
  const old = new Promise(resolve => { finish = resolve })
  const connector = { availability: "unavailable" as const, connector_id: "initial-missing", connector_type: "mcp" as const, provider_key: "initial-missing",
    server_id: "initial-missing-server", display_name: "Initial missing", status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: "initial-missing-server", display_name: "Initial missing", server_url: "https://mcp.example.test/initial-missing",
    status: "pending", state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const hub = { ...createHubClient(), getPrivateMcpServer: vi.fn().mockReturnValueOnce(old).mockResolvedValue(server),
    listMcpConnectors: vi.fn(async () => ({ items: round === 2 ? [] : [connector], next_cursor: null })),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted, generation, subject: "initial-missing-actor" }} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: "Initial missing" }))
  await waitFor(() => expect(hub.getPrivateMcpServer).toHaveBeenCalledOnce())
  round = 2
  view.rerender(content(false, 2)); view.rerender(content(true, 2))
  await screen.findByText("连接列表加载失败")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  round = 3
  view.rerender(content(false, 3)); view.rerender(content(true, 3))
  expect(await screen.findByRole("dialog", { name: "Initial missing" })).toBeVisible()
  await act(async () => { finish({ ...server, display_name: "Retired initial result" }); await old })
  expect(screen.queryByText("Retired initial result")).not.toBeInTheDocument()
})

it.each([
  { kind: "mcp", dirty: false, target: "name" }, { kind: "mcp", dirty: true, target: "name" },
  { kind: "api", dirty: false, target: "name" }, { kind: "api", dirty: true, target: "name" },
  { kind: "mcp", dirty: true, target: "secret" }, { kind: "api", dirty: true, target: "secret" },
])("$kind configuration keeps its focused field and selection through admission recheck (dirty: $dirty; field: $target)", async ({ kind, dirty, target }) => {
  const { CustomMcpDetailDialog } = await import("@/ui/mcp/custom-mcp-detail-dialog")
  const { CustomApiDetailDialog } = await import("@/ui/mcp/custom-api-detail-dialog")
  const close = vi.fn(), save = vi.fn(), prepare = vi.fn()
  const connector = { availability: "unavailable" as const, connector_id: "selection-connector", connector_type: "mcp" as const, provider_key: "selection",
    server_id: "selection-server", display_name: "Original server", status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }
  const server = (fresh: boolean) => ({ availability: "unavailable" as const, server_id: "selection-server", display_name: fresh ? "Updated server" : "Original server",
    notes: fresh ? "Fresh owner note" : "Retired owner note", server_url: "https://mcp.example.test/selection",
    status: "pending" as const, state_version: fresh ? "2" : "1", headers: [{ name: "x-existing", configured: true, state_version: "1", status: "active" as const }],
    transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false })
  const profile = (fresh: boolean) => ({ profile_id: "selection-api", name: fresh ? "Updated server" : "Original server",
    instructions: fresh ? "Fresh owner note" : "Retired owner note", state_version: fresh ? "2" : "1",
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", environment: [] })
  const content = (ready: boolean, fresh = false, partial = false) => <LocaleProvider>{kind === "mcp" ?
    <CustomMcpDetailDialog admitted={ready} managementCommand={undefined} onResumeManagement={() => {}} connector={ready ? connector : null} server={ready || partial ? server(fresh) : null}
      actionId={null} actionError={false} deleteId={null} returnFocusRef={{ current: null }} onClose={close}
      onSaveConfiguration={save} onPrepare={prepare} onAuthorize={vi.fn()} onDisconnect={vi.fn()} onDeleteIntent={vi.fn()} onCancelDelete={vi.fn()} onDelete={vi.fn()} /> :
    <CustomApiDetailDialog admitted={ready} command={undefined} canUpdate canRemove onResume={() => {}} profile={ready ? profile(fresh) : null} busy={false} actionError={false}
      returnFocusRef={{ current: null }} onClose={close} onSave={save} onDelete={vi.fn()} />}</LocaleProvider>
  const view = render(content(true))
  if (kind === "mcp") {
    fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  }
  const label = kind === "mcp" ? "服务器名称" : "名称"
  if (target === "secret") fireEvent.click(screen.getByRole("button", { name: kind === "mcp" ? "添加自定义 header" : "添加密钥" }))
  const control = () => target === "secret" ? screen.getByLabelText(kind === "mcp" ? "Header value" : "密钥值") : screen.getByRole("textbox", { name: label })
  const field = control() as HTMLInputElement
  if (dirty) fireEvent.change(field, { target: { value: "Explicit user text" } })
  act(() => { field.focus(); field.setSelectionRange(2, 6, "backward"); fireEvent.select(field) })
  expect(field).toHaveFocus()
  view.rerender(content(false))
  expect(control()).toBe(field)
  expect(field).toHaveFocus()
  expect(field).toHaveAttribute("readonly")
  expect(field).toHaveValue(dirty ? "Explicit user text" : "")
  if (kind === "mcp") {
    view.rerender(content(false, false, true))
    expect(field).toHaveValue(dirty ? "Explicit user text" : "")
    expect(screen.getByRole("textbox", { name: "备注 （可选）" })).toHaveValue("")
  }
  expect(screen.queryByText("Retired owner note")).not.toBeInTheDocument()
  if (kind === "mcp") {
    expect(screen.queryByText("x-existing")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "连接" })).toBeDisabled()
  }
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  if (dirty) act(() => { field.setSelectionRange(0, field.value.length, "forward"); fireEvent.select(field) })
  else fireEvent.select(field)
  view.rerender(content(true, true))
  expect(control()).toBe(field)
  expect(field).toHaveFocus()
  expect(field).not.toHaveAttribute("readonly")
  expect(field).toHaveValue(dirty ? "Explicit user text" : "Updated server")
  expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual(dirty ? [0, "Explicit user text".length, "forward"] : [2, 6, "backward"])
  expect(save).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled()
})

it.each(["mcp", "api"])("%s configuration restores a bounded range without stealing a focus choice made during recheck", async kind => {
  const { CustomMcpDetailDialog } = await import("@/ui/mcp/custom-mcp-detail-dialog")
  const { CustomApiDetailDialog } = await import("@/ui/mcp/custom-api-detail-dialog")
  const connector = { availability: "unavailable" as const, connector_id: "focus-choice", connector_type: "mcp" as const, provider_key: "focus-choice",
    server_id: "focus-choice-server", status: "pending" as const, approved_scopes: [], enabled: false, state_version: "1" }
  const server = (name: string) => ({ availability: "unavailable" as const, server_id: "focus-choice-server", display_name: name, notes: "Fresh note paragraph", server_url: "https://mcp.example.test/focus-choice",
    status: "pending" as const, state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false })
  const profile = (name: string) => ({ profile_id: "focus-choice-api", name, instructions: "Fresh note paragraph", state_version: "1",
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", environment: [] })
  const content = (name: string | null, pendingError = false) => <LocaleProvider>{kind === "mcp" ?
    <CustomMcpDetailDialog admitted={name !== null} managementCommand={undefined} onResumeManagement={() => {}} connector={name === null ? null : connector} server={name === null ? null : server(name)}
      actionId={null} actionError={false} deleteId={null} returnFocusRef={{ current: null }} onClose={vi.fn()} pendingError={pendingError}
      onSaveConfiguration={vi.fn()} onPrepare={vi.fn()} onAuthorize={vi.fn()} onDisconnect={vi.fn()} onDeleteIntent={vi.fn()} onCancelDelete={vi.fn()} onDelete={vi.fn()} /> :
    <CustomApiDetailDialog admitted={name !== null} command={undefined} canUpdate canRemove onResume={() => {}} profile={name === null ? null : profile(name)} busy={false} actionError={false}
      returnFocusRef={{ current: null }} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} pendingError={pendingError} />}</LocaleProvider>
  const view = render(content("Long original name"))
  if (kind === "mcp") {
    fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  }
  const field = screen.getByRole("textbox", { name: kind === "mcp" ? "服务器名称" : "名称" }) as HTMLInputElement
  act(() => { field.focus(); field.setSelectionRange(5, 9); fireEvent.select(field) })
  view.rerender(content(null))
  view.rerender(content("Hi"))
  expect(field).toHaveFocus()
  expect([field.selectionStart, field.selectionEnd]).toEqual([2, 2])
  view.rerender(content(null))
  view.rerender(content("Longer fresh name"))
  expect([field.selectionStart, field.selectionEnd]).toEqual([2, 2])
  view.rerender(content(null))
  fireEvent.keyDown(field, { key: "a", ctrlKey: true })
  fireEvent.select(field)
  view.rerender(content("Owner returns after selection"))
  expect(field).toHaveFocus()
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 0])
  view.rerender(content(null))
  const note = screen.getByRole("textbox", { name: kind === "mcp" ? "备注 （可选）" : "备注（可选）" }) as HTMLTextAreaElement
  act(() => { note.focus(); note.setSelectionRange(0, 0); fireEvent.select(note) })
  view.rerender(content("Recovered paragraph"))
  expect(note).toHaveFocus()
  expect(note).toHaveValue("Fresh note paragraph")
  expect([note.selectionStart, note.selectionEnd]).toEqual([0, 0])
  act(() => { note.scrollTop = 8; note.scrollLeft = 4; fireEvent.scroll(note) })
  view.rerender(content(null))
  act(() => { note.scrollTop = 0; note.scrollLeft = 0; fireEvent.scroll(note) })
  view.rerender(content("Restored field scroll"))
  expect([note.scrollTop, note.scrollLeft]).toEqual([8, 4])
  view.rerender(content(null, true))
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  // A focused Close button remains mounted through failed and fresh reads.
  const close = screen.getAllByRole("button", { name: "取消" }).find(button => !button.hasAttribute("disabled"))!
  act(() => close.focus())
  view.rerender(content("Recovered name"))
  expect(close).toHaveFocus()
  expect(field).not.toHaveFocus()
})

it.each(["form", "url"] as const)("%s MCP completion failure remains named and only retries closing after recheck", async mode => {
  const { Dialog, DialogContent } = await import("@/components/ui/dialog")
  const { CustomMcpForm } = await import("@/ui/mcp/mcp-custom-form")
  const { UrlMcpForm } = await import("@/ui/mcp/mcp-url-form")
  const { createMcpServerCreationFlow } = await import("@/ui/mcp/mcp-server-creation-flow")
  const registration = mcpCreationRegistration()
  let prepared = false
  const hub = { registerPrivateMcpServer: vi.fn().mockResolvedValue(registration),
    beginMcpConnectorAuthorization: vi.fn(),
    getPrivateMcpServer: vi.fn(async () => ({ ...registration.server, state_version: prepared ? "3" : "2", transport: "streamable_http" as const, prepare_status: prepared ? "ready" as const : "pending_prepare" as const })),
    getMcpConnector: vi.fn(async () => ({ ...registration.connector, status: prepared ? "active" as const : "pending" as const, enabled: prepared })),
    preparePrivateMcpServer: vi.fn(async () => { prepared = true; return { ...registration, declarations: [] } }) }
  const boundary = { admitted: true, subject: `completion-${mode}`, generation: 1 }
  const flow = createMcpServerCreationFlow({ client: hub, preparation: createMcpPreparationCommands({ canPrepare: () => true, client: hub, boundary, onConfirmed: vi.fn() }), boundary, onChanged: vi.fn() })
  const onDone = vi.fn().mockRejectedValueOnce(new Error("close failed")).mockResolvedValue(undefined)
  const Form = mode === "form" ? CustomMcpForm : UrlMcpForm
  const form = (generation: number) => <LocaleProvider><Dialog open><DialogContent><Form flow={flow} boundary={{ ...boundary, generation }} onCancel={vi.fn()} onDone={onDone} /></DialogContent></Dialog></LocaleProvider>
  const view = render(form(1))
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/ }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/ }), { target: { value: registration.server.server_url } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  const completion = { serverId: registration.server.server_id, connectorId: registration.connector.connector_id, providerKey: registration.connector.provider_key }
  expect(onDone).toHaveBeenLastCalledWith(completion, expect.any(Function))
  expect(await screen.findByRole("alert")).toBeVisible()
  expect(screen.getByRole("heading", { name: "Creation MCP" })).toBeVisible()
  act(() => flow.bind({ ...boundary, admitted: false, generation: 2 }))
  view.rerender(form(2))
  act(() => flow.bind({ ...boundary, generation: 2 }))
  view.rerender(form(2))
  fireEvent.click(screen.getByRole("button", { name: "完成" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2))
  expect(onDone).toHaveBeenLastCalledWith(completion, expect.any(Function))
  expect(onDone.mock.calls[1]?.[0]).toBe(onDone.mock.calls[0]?.[0])
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
})

it.each(["recheck", "dialog-close"] as const)("URL Save-and-publish registers without an OAuth popup and retires picker handoff on %s", async retirement => {
  const publicationRecovery = await import("@/ui/mcp/mcp-project-publication-recovery")
  const { createTestPublicationJournal } = await import("./mcp-publication-journal-fixture")
  vi.spyOn(publicationRecovery, "createBrowserMcpProjectPublicationRecovery").mockImplementation(createTestPublicationJournal)
  const pageClients = await import("@/ui/shell/page-clients")
  const open = vi.spyOn(window, "open").mockReturnValue(null)
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const registration = mcpCreationRegistration()
  const hub = { ...apiCreationHub(), registerPrivateMcpServer: vi.fn<NonNullable<import("@/hub/client").HubClient["registerPrivateMcpServer"]>>(async () => { await pending; return registration }),
    getPrivateMcpServer: vi.fn().mockResolvedValue(registration.server), getMcpConnector: vi.fn().mockResolvedValue(registration.connector),
    preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  const boundary = { admitted: true, subject: "publish-gesture-actor", generation: 1 }
  const view = render(apiCreationOverlay(boundary, "url"))
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/ }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/ }), { target: { value: registration.server.server_url } })
  await waitFor(() => expect(screen.getByRole("button", { name: "保存并发布" })).toBeEnabled())
  fireEvent.keyDown(screen.getByRole("button", { name: "保存并发布" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "发布到项目" }))
  expect(open).not.toHaveBeenCalled()
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  if (retirement === "recheck") view.rerender(apiCreationOverlay({ ...boundary, admitted: false, generation: 2 }, "url"))
  else view.rerender(apiCreationOverlay(boundary, null))
  await waitFor(() => expect(hub.registerPrivateMcpServer.mock.calls[0]?.[2]?.aborted).toBe(true))
  await act(async () => { acknowledge(); await pending })
  expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(hub.beginMcpConnectorAuthorization).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog", { name: "发布到项目" })).not.toBeInTheDocument()
})

it("a blocked browser popup cannot prevent URL registration and project selection", async () => {
  const publicationRecovery = await import("@/ui/mcp/mcp-project-publication-recovery")
  const { createTestPublicationJournal } = await import("./mcp-publication-journal-fixture")
  vi.spyOn(publicationRecovery, "createBrowserMcpProjectPublicationRecovery").mockImplementation(createTestPublicationJournal)
  const pageClients = await import("@/ui/shell/page-clients")
  const open = vi.spyOn(window, "open").mockReturnValue(null)
  const registration = mcpCreationRegistration()
  const hub = { ...apiCreationHub(), registerPrivateMcpServer: vi.fn().mockResolvedValue(registration),
    getPrivateMcpServer: vi.fn().mockResolvedValue(registration.server), getMcpConnector: vi.fn().mockResolvedValue(registration.connector) }
  vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
  render(apiCreationOverlay({ admitted: true, subject: "blocked-publish-actor", generation: 1 }, "url"))
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/ }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/ }), { target: { value: "https://mcp.example.test/creation" } })
  await waitFor(() => expect(screen.getByRole("button", { name: "保存并发布" })).toBeEnabled())
  fireEvent.keyDown(screen.getByRole("button", { name: "保存并发布" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "发布到项目" }))
  expect(await screen.findByRole("dialog", { name: "发布到项目" })).toBeVisible()
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  expect(open).not.toHaveBeenCalled()
  const picker = screen.getByRole("dialog", { name: "发布到项目" })
  fireEvent.click(within(picker).getByRole("button", { name: "取消" }))
  const detail = await screen.findByRole("dialog", { name: "Creation MCP" })
  expect(detail).toBeVisible()
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  expect(hub.getPrivateMcpServer).toHaveBeenCalledWith(registration.server.server_id, expect.any(AbortSignal))
})

it("URL definition publication does not run discovery or OAuth before handing off its registered entity", async () => {
  const { Dialog, DialogContent } = await import("@/components/ui/dialog")
  const { UrlMcpForm } = await import("@/ui/mcp/mcp-url-form")
  const { createMcpServerCreationFlow } = await import("@/ui/mcp/mcp-server-creation-flow")
  const open = vi.spyOn(window, "open").mockReturnValue(null)
  const registration = mcpCreationRegistration()
  const hub = { registerPrivateMcpServer: vi.fn().mockResolvedValue(registration), beginMcpConnectorAuthorization: vi.fn(),
    getPrivateMcpServer: vi.fn().mockResolvedValue(registration.server), getMcpConnector: vi.fn().mockResolvedValue(registration.connector), preparePrivateMcpServer: vi.fn() }
  const boundary = { admitted: true, subject: "publish-no-oauth", generation: 1 }
  const flow = createMcpServerCreationFlow({ client: hub, preparation: createMcpPreparationCommands({ canPrepare: () => true, client: hub, boundary, onConfirmed: vi.fn() }), boundary, onChanged: vi.fn() })
  const onDone = vi.fn().mockResolvedValue(undefined), onPublish = vi.fn().mockResolvedValue(undefined)
  render(<LocaleProvider><Dialog open><DialogContent><UrlMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={onDone} onPublish={onPublish} /></DialogContent></Dialog></LocaleProvider>)
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/ }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/ }), { target: { value: registration.server.server_url } })
  await waitFor(() => expect(screen.getByRole("button", { name: "保存并发布" })).toBeEnabled())
  fireEvent.keyDown(screen.getByRole("button", { name: "保存并发布" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "发布到项目" }))
  await waitFor(() => expect(onPublish).toHaveBeenCalledOnce())
  expect(onDone).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
  expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(hub.beginMcpConnectorAuthorization).not.toHaveBeenCalled()
})

it.each([false, true])("private detail Prepare restores the same original command after reopening (recheck: %s)", async recheck => {
  const { McpContent } = await import("@/ui/mcp/mcp-content")
  const registration = mcpCreationRegistration()
  let version = "1"
  const prepare = vi.fn<NonNullable<import("@/hub/client").HubClient["preparePrivateMcpServer"]>>().mockRejectedValue(new Error("lost prepare ACK"))
  const lookup = vi.fn().mockRejectedValue(new HubClientError("http", "Unresolved lookup", "mcp_personal_command_outcome_unknown", 503, false))
  const hub = { ...apiCreationHub(), getMcpPrepareReceipt: lookup, preparePrivateMcpServer: prepare,
    listMcpConnectors: vi.fn(async () => ({ items: [{ ...registration.connector, state_version: version }], next_cursor: null })),
    getPrivateMcpServer: vi.fn(async () => ({ ...registration.server, state_version: version })),
    getMcpConnector: vi.fn(async () => ({ ...registration.connector, state_version: version })) }
  const boundary = { admitted: true, subject: "detail-original-prepare", generation: 1 }
  const content = (admitted = true, generation = 1) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ ...boundary, admitted, generation }}><McpContent client={hub} initialView="connections" readBoundary={{ ...boundary, admitted, generation }} /></ConnectorCommandProvider></LocaleProvider>
  const view = render(content())
  fireEvent.click(await screen.findByRole("button", { name: "Creation MCP" }))
  fireEvent.click(await screen.findByRole("button", { name: "连接" }))
  await screen.findByRole("alert")
  expect(prepare).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  if (recheck) { view.rerender(content(false, 2)); version = "9"; view.rerender(content(true, 2)) }
  fireEvent.click(await screen.findByRole("button", { name: "Creation MCP" }))
  const button = await screen.findByRole("button", { name: /^(连接|查看连接结果)$/ })
  fireEvent.click(button)
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce())
  expect(lookup.mock.calls[0]?.slice(0, 3)).toEqual(prepare.mock.calls[0]?.slice(0, 3))
  expect(lookup.mock.calls[0]?.[1]).toBe("1")
})

it("global creation and Settings detail restore one Prepare, and confirmed disconnect releases the closed creation intent", async () => {
  const { McpCreateDialog } = await import("@/ui/mcp/mcp-create-dialog")
  const { McpContent } = await import("@/ui/mcp/mcp-content")
  const registration = mcpCreationRegistration()
  let version = "1", removed = false
  const prepare = vi.fn<NonNullable<import("@/hub/client").HubClient["preparePrivateMcpServer"]>>().mockRejectedValue(new Error("lost Prepare ACK"))
  const remove = vi.fn(async () => { removed = true; return { ...registration.connector, status: "revoked" as const } })
  const lookup = vi.fn().mockRejectedValue(new HubClientError("http", "Unresolved lookup", "mcp_personal_command_outcome_unknown", 503, false))
  const hub = { ...apiCreationHub(), getMcpPrepareReceipt: lookup, preparePrivateMcpServer: prepare, removeMcpConnector: remove,
    registerPrivateMcpServer: vi.fn().mockResolvedValue(registration),
    getPrivateMcpServer: vi.fn(async () => ({ ...registration.server, state_version: version })),
    getMcpConnector: vi.fn(async () => registration.connector),
    listMcpConnectors: vi.fn(async () => ({ items: removed ? [] : [registration.connector], next_cursor: null })) }
  const boundary = { admitted: true, subject: "cross-entry-preparation", generation: 1 }
  // One production owner spans both consumers; neither isolated-surface helper is used.
  const content = (creation: boolean) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={boundary}>
    {creation ? <McpCreateDialog client={hub} mode="form" open onOpenChange={vi.fn()} /> :
      <McpContent client={hub} initialView="connections" settingsLayout readBoundary={boundary} />}
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(content(true))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: registration.server.server_url } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await screen.findByRole("button", { name: "管理" })
  const configuredDetail = screen.getByRole("dialog", { name: "Creation MCP" })
  expect(prepare).not.toHaveBeenCalled()
  fireEvent.click(await within(configuredDetail).findByRole("button", { name: "连接" }))
  await screen.findByRole("button", { name: "查看连接结果" })
  expect(prepare).toHaveBeenCalledOnce()
  version = "9"
  view.rerender(content(false))
  fireEvent.click(await screen.findByRole("button", { name: "Creation MCP" }))
  const retry = await screen.findByRole("button", { name: "查看连接结果" })
  expect(prepare).toHaveBeenCalledOnce()
  fireEvent.click(retry)
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce())
  expect(lookup.mock.calls[0]?.slice(0, 3)).toEqual(prepare.mock.calls[0]?.slice(0, 3))
  expect(lookup.mock.calls[0]?.[1]).toBe("1")
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "断开连接" }))
  await waitFor(() => expect(remove).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  view.rerender(content(true))
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  expect(prepare).toHaveBeenCalledOnce()
})

it("closing a preparing detail aborts its wait; a late ACK cannot close the successor window", async () => {
  const { McpContent } = await import("@/ui/mcp/mcp-content")
  const registration = mcpCreationRegistration()
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const prepare = vi.fn<NonNullable<import("@/hub/client").HubClient["preparePrivateMcpServer"]>>(async () => {
    await pending; return { ...registration, declarations: [],
      server: { ...registration.server, status: "registered" as const, state_version: "2", prepare_status: "ready" as const, declarations_available: true, declaration_digest: "a".repeat(64) },
      connector: { ...registration.connector, status: "active" as const, enabled: true, state_version: "2" } }
  })
  const hub = { ...apiCreationHub(), preparePrivateMcpServer: prepare,
    getPrivateMcpServer: vi.fn(async () => registration.server),
    getMcpConnector: vi.fn(async () => registration.connector),
    listMcpConnectors: vi.fn(async () => ({ items: [registration.connector], next_cursor: null })) }
  const boundary = { admitted: true, subject: "detail-window-prepare", generation: 1 }
  render(<LocaleProvider><ConnectorCommandProvider client={hub} boundary={boundary}>
    <McpContent client={hub} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Creation MCP" }))
  fireEvent.click(await screen.findByRole("button", { name: "连接" }))
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(prepare.mock.calls[0]?.[3]?.aborted).toBe(true)
  fireEvent.click(await screen.findByRole("button", { name: "Creation MCP" }))
  await screen.findByRole("button", { name: "查看连接结果" })
  await act(async () => { acknowledge(); await pending })
  expect(screen.getByRole("dialog", { name: "Creation MCP" })).toBeVisible()
  fireEvent.click(await screen.findByRole("button", { name: "完成" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(prepare).toHaveBeenCalledOnce()
})

it("an unconfirmed Custom API edit keeps its draft read-only and exposes original-request recovery", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const profile = { profile_id: "unknown-api-edit", name: "Editable API", state_version: "1", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] }
  const update = vi.fn().mockRejectedValue(new Error("lost management ACK"))
  const hub = { ...createHubClient(), updateCustomApi: update,
    listCustomApis: vi.fn().mockResolvedValue({ items: [profile], page: { next_cursor: null } }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) }
  render(<LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation: 1, subject: "api-management-actor" }} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Editable API" }))
  const name = screen.getByLabelText("名称")
  fireEvent.change(name, { target: { value: "Original edit" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  expect(await screen.findByRole("button", { name: "重试原请求" })).toBeEnabled()
  expect(name).toHaveAttribute("readonly")
});

it("an API deletion remains recoverable when the row disappears, without treating the list as its ACK", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const profile = { profile_id: "missing-api-command", name: "Delete API", state_version: "1", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] }
  let listed = true
  const remove = vi.fn().mockRejectedValueOnce(new Error("lost deletion ACK")).mockResolvedValue(undefined)
  const hub = { ...createHubClient(), removeCustomApi: remove,
    listCustomApis: vi.fn(async () => ({ items: listed ? [profile] : [], page: { next_cursor: null } })),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) }
  const content = (generation: number) => <LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation, subject: "api-delete-actor" }} /></LocaleProvider>
  const view = render(content(1))
  fireEvent.click(await screen.findByRole("button", { name: "Delete API" }))
  fireEvent.click(screen.getByRole("button", { name: "删除" }))
  fireEvent.click(screen.getByRole("button", { name: "确认移除" }))
  await screen.findByRole("button", { name: "重试原请求" })
  fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "取消" }).at(-1)!)
  listed = false; view.rerender(content(2))
  const recovery = await screen.findByRole("button", { name: "重试原请求 · missing-api-command" })
  expect(remove).toHaveBeenCalledOnce()
  fireEvent.click(recovery)
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(remove).toHaveBeenCalledTimes(2)
  expect(remove.mock.calls[0]?.slice(0, 3)).toEqual(remove.mock.calls[1]?.slice(0, 3))
  expect(screen.queryByRole("button", { name: "重试原请求 · missing-api-command" })).not.toBeInTheDocument()
})

it("a late API edit ACK clears actual secret drafts without closing a successor window", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const profile = { profile_id: "late-managed-api", name: "Late managed API", state_version: "1", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] }
  const other = { ...profile, profile_id: "other-managed-api", name: "Other managed API" }
  let acknowledge!: () => void
  const pending = new Promise<void>(resolve => { acknowledge = resolve })
  const update = vi.fn().mockReturnValue(pending)
  const hub = { ...createHubClient(), updateCustomApi: update,
    listCustomApis: vi.fn().mockResolvedValue({ items: [profile, other], page: { next_cursor: null } }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) }
  render(<LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation: 1, subject: "api-late-window-actor" }} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Late managed API" }))
  fireEvent.click(screen.getByRole("button", { name: "添加密钥" }))
  fireEvent.change(screen.getByLabelText("密钥名称"), { target: { value: "SECRET" } })
  fireEvent.change(screen.getByLabelText("密钥值"), { target: { value: "private-draft" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "取消" }).at(-1)!)
  expect(update.mock.calls[0]?.[3].aborted).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Other managed API" }))
  const successor = screen.getByRole("dialog")
  await act(async () => { acknowledge(); await pending })
  expect(screen.getByRole("dialog")).toBe(successor)
  fireEvent.click(within(successor).getByRole("button", { name: "取消" }))
  fireEvent.click(await screen.findByRole("button", { name: "Late managed API" }))
  fireEvent.click(screen.getByRole("button", { name: "完成" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole("button", { name: "Late managed API" }))
  expect(screen.queryByLabelText("密钥值")).not.toBeInTheDocument()
  expect(screen.getByLabelText("名称")).not.toHaveAttribute("readonly")
  expect(update).toHaveBeenCalledOnce()
})

it("a mounted API editor clears secret values on ACK and rejects submitted edits while unknown", async () => {
  const { CustomApiDetailDialog } = await import("@/ui/mcp/custom-api-detail-dialog")
  const profile = { profile_id: "mounted-api", name: "Mounted API", state_version: "1", created_at: "2026-10-16T12:00:00Z", updated_at: "2026-10-16T12:00:00Z", environment: [] }
  const save = vi.fn(), resume = vi.fn()
  const content = (kind?: "unknown" | "completed") => <LocaleProvider><CustomApiDetailDialog profile={profile} admitted busy={false} actionError={false} canUpdate canRemove
    command={kind ? { profileId: profile.profile_id, operation: "update", kind } : undefined}
    onResume={resume} onSave={save} onDelete={vi.fn()} onClose={vi.fn()} returnFocusRef={{ current: null }} /></LocaleProvider>
  const view = render(content())
  fireEvent.click(screen.getByRole("button", { name: "添加密钥" }))
  fireEvent.change(screen.getByLabelText("密钥名称"), { target: { value: "SECRET" } })
  fireEvent.change(screen.getByLabelText("密钥值"), { target: { value: "mounted-secret" } })
  const name = screen.getByLabelText("名称") as HTMLInputElement
  view.rerender(content("unknown"))
  fireEvent.change(name, { target: { value: "Forbidden change" } })
  expect(name.value).toBe("Mounted API")
  fireEvent.submit(name.closest("form")!)
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByLabelText("密钥值")).toHaveValue("mounted-secret")
  view.rerender(content("completed"))
  expect(screen.queryByLabelText("密钥值")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
})

it("an unknown private MCP edit is read-only and offers the original management request instead of a new save", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const connector = { availability: "unavailable" as const, connector_id: "managed-mcp", server_id: "managed-server", connector_type: "mcp" as const, provider_key: "fixture", display_name: "Managed MCP", status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: "managed-server", display_name: "Managed MCP", server_url: "https://mcp.example.test/", status: "pending", state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const update = vi.fn().mockRejectedValue(new Error("lost edit ACK"))
  const hub = { ...createHubClient(), updatePrivateMcpServer: update, getPrivateMcpServer: vi.fn().mockResolvedValue(server), listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  render(<LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation: 1, subject: "managed-mcp-actor" }} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Managed MCP" }))
  fireEvent.keyDown(await screen.findByRole("button", { name: "管理" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  const name = screen.getByLabelText("服务器名称")
  fireEvent.change(name, { target: { value: "Original MCP edit" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  expect(await screen.findByRole("button", { name: "重试原请求" })).toBeEnabled()
  expect(name).toHaveAttribute("readonly")
})

it.each(["toggle", "disconnect"] as const)("provider %s resumes its original command after closing and re-reading a changed CAS", async (operation) => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let version = "1"
  const provider = { provider_key: "managed-provider", display_name: "Managed provider", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const row = () => ({ availability: "unavailable" as const, connector_id: "provider-managed", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Provider row", status: "active" as const, enabled: true, approved_scopes: [], state_version: version })
  const command = vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockImplementation(async () => ({ ...row(), ...(operation === "disconnect" ? { status: "revoked" as const, enabled: false } : { enabled: false }) }))
  const hub = { ...createHubClient(), ...(operation === "toggle" ? { setMcpConnectorEnabled: command } : { removeMcpConnector: command }),
    listMcpConnectors: vi.fn(async () => ({ items: [row()], next_cursor: null })), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (generation: number) => <LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation, subject: `provider-${operation}-actor` }} /></LocaleProvider>
  const view = render(content(1))
  fireEvent.click(await screen.findByRole("button", { name: "Provider row" }))
  await screen.findByRole("dialog", { name: "Managed provider" })
  fireEvent.click(screen.getByRole("button", { name: operation === "toggle" ? "停用" : "断开连接" }))
  if (operation === "disconnect") fireEvent.click(screen.getByRole("button", { name: "确认断开" }))
  await screen.findByRole("button", { name: "重试原请求" })
  fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "取消" }).at(-1)!)
  version = "9"; view.rerender(content(2))
  fireEvent.click(await screen.findByRole("button", { name: "Provider row" }))
  fireEvent.click(await screen.findByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(command).toHaveBeenCalledTimes(2)
  expect(command.mock.calls[0]?.slice(0, 3)).toEqual(command.mock.calls[1]?.slice(0, 3))
  expect(command.mock.calls[1]?.[1].expected_state_version).toBe("1")
})

it("a mounted MCP editor clears header secrets on management ACK but preserves non-secret edits while waiting for Done", async () => {
  const { CustomMcpDetailDialog } = await import("@/ui/mcp/custom-mcp-detail-dialog")
  const connector = { availability: "unavailable" as const, connector_id: "mounted-mcp", server_id: "mounted-server", connector_type: "mcp" as const, provider_key: "fixture", status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: "mounted-server", display_name: "Mounted MCP", server_url: "https://mcp.example.test/", status: "pending" as const, state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false }
  const save = vi.fn()
  const content = (kind?: "unknown" | "completed") => <LocaleProvider><CustomMcpDetailDialog connector={connector} server={server} admitted
    managementCommand={kind ? { connectorId: connector.connector_id, serverId: server.server_id, operation: "update_server", kind } : undefined}
    onResumeManagement={vi.fn()} actionId={null} actionError={false} deleteId={null} returnFocusRef={{ current: null }}
    onClose={vi.fn()} onSaveConfiguration={save} onPrepare={vi.fn()} onAuthorize={vi.fn()} onDisconnect={vi.fn()} onDeleteIntent={vi.fn()} onCancelDelete={vi.fn()} onDelete={vi.fn()} /></LocaleProvider>
  const view = render(content())
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
  fireEvent.change(screen.getByLabelText("Header name"), { target: { value: "x-test" } })
  fireEvent.change(screen.getByLabelText("Header value"), { target: { value: "mounted-header" } })
  const name = screen.getByLabelText("服务器名称") as HTMLInputElement
  fireEvent.change(name, { target: { value: "My draft" } })
  view.rerender(content("unknown"))
  expect(name).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "连接" })).toBeDisabled()
  fireEvent.submit(name.closest("form")!); expect(save).not.toHaveBeenCalled()
  view.rerender(content("completed"))
  expect(screen.queryByLabelText("Header value")).not.toBeInTheDocument()
  expect(name.value).toBe("My draft")
  expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
})

it("a lost private MCP deletion ACK remains reachable after its row disappears and replays only the confirmed original intent", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  let listed = true
  const connector = { availability: "unavailable" as const, connector_id: "missing-managed-mcp", server_id: "missing-managed-server", connector_type: "mcp" as const, provider_key: "fixture", display_name: "Missing managed MCP", status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: "missing-managed-server", display_name: "Missing managed MCP", server_url: "https://mcp.example.test/", status: "pending", state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const remove = vi.fn().mockRejectedValueOnce(new Error("lost deletion ACK")).mockResolvedValue({ server_id: server.server_id, deleted: true, replayed: true })
  const hub = { ...createHubClient(), deletePrivateMcpServer: remove, getPrivateMcpServer: vi.fn().mockResolvedValue(server), listMcpConnectors: vi.fn(async () => ({ items: listed ? [connector] : [], next_cursor: null })), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const content = (generation: number) => <LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation, subject: "missing-mcp-management-actor" }} /></LocaleProvider>
  const view = render(content(1))
  fireEvent.click(await screen.findByRole("button", { name: "Missing managed MCP" }))
  fireEvent.keyDown(await screen.findByRole("button", { name: "管理" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
  fireEvent.click(screen.getByRole("button", { name: "确认移除" }))
  await screen.findByRole("button", { name: "重试原请求" })
  fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: "取消" }).at(-1)!)
  listed = false; view.rerender(content(2))
  fireEvent.click(await screen.findByRole("button", { name: "重试原请求 · missing-managed-mcp" }))
  expect(remove).toHaveBeenCalledOnce()
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(remove.mock.calls[0]?.slice(0, 3)).toEqual(remove.mock.calls[1]?.slice(0, 3))
  expect(remove).toHaveBeenCalledTimes(2)
})

it("a late provider toggle ACK does not close a successor provider window", async () => {
  const { McpContent: Content } = await import("@/ui/mcp/mcp-content")
  const McpContent = withMcpCommandOwner(Content)
  const provider = { provider_key: "late-provider", display_name: "Late provider", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const otherProvider = { ...provider, provider_key: "successor-provider", display_name: "Successor provider" }
  const connector = { availability: "unavailable" as const, connector_id: "late-provider-connection", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Late provider row", status: "active" as const, enabled: true, approved_scopes: [], state_version: "1" }
  const other = { ...connector, connector_id: "successor-connection", provider_key: otherProvider.provider_key, display_name: "Successor row" }
  let acknowledge!: (value: typeof connector) => void
  const pending = new Promise<typeof connector>(resolve => { acknowledge = resolve })
  const toggle = vi.fn().mockReturnValue(pending)
  const hub = { ...createHubClient(), setMcpConnectorEnabled: toggle, listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector, other], next_cursor: null }), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider, otherProvider], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  render(<LocaleProvider><McpContent client={hub} initialView="connections" readBoundary={{ admitted: true, generation: 1, subject: "late-provider-management-actor" }} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Late provider row" }))
  fireEvent.click(await screen.findByRole("button", { name: "停用" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }))
  expect(toggle.mock.calls[0]?.[3].aborted).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Successor row" }))
  const successor = await screen.findByRole("dialog", { name: "Successor provider" })
  await act(async () => { acknowledge({ ...connector, enabled: false }); await pending })
  expect(screen.getByRole("dialog")).toBe(successor)
  expect(toggle).toHaveBeenCalledOnce()
})

it.each(["forbidden", "not-found", "network"])("installation detail keeps pin A metadata and reader when the catalog current revision is B (%s download)", async downloadFailure => {
  const requests: string[] = []
  let sourceStatus: "active" | "withdrawn" = "withdrawn"
  const onAdd = vi.fn()
  const text = "# Installed A"
  const fileTexts = { "SKILL.md": text, "references/notes.md": "# Reader notes", "scripts/nested/check.py": "print(\"reader-check\")" }
  const files = Object.entries(fileTexts).map(([path, value]) => ({ path, size_bytes: String(new TextEncoder().encode(value).byteLength) }))
  let holdSelectedFile = false
  let heldSignal: AbortSignal | null | undefined
  let settleHeld: (() => void) | undefined
  let heldResponse: Promise<Response> | undefined
  const lateText = fileTexts["scripts/nested/check.py"].replace("reader-check", "retired-code")
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input); requests.push(path)
    const headers = { "cache-control": "private, no-store", "x-request-id": "pin-detail" }
    if (path.endsWith("GetSkill")) return Response.json({ skill: { id: "pin-series", version: "pin-B", displayName: "Catalog B", description: "B summary" } }, { headers })
    if (path.endsWith("/download")) { if (downloadFailure === "network") throw new TypeError("network interrupted"); return Response.json({ error: { code: downloadFailure === "not-found" ? "skill_not_found" : "skill_download_forbidden", message: "Download denied independently", retryable: false } }, { status: downloadFailure === "not-found" ? 404 : 403, headers }) }
    if (path.includes("/package")) {
      const selected = new URL(path, "http://local.test").searchParams.get("file_path") as keyof typeof fileTexts | null
      if (holdSelectedFile && selected === "scripts/nested/check.py") {
        holdSelectedFile = false
        heldSignal = init?.signal
        heldResponse = new Promise(resolve => { settleHeld = () => resolve(Response.json({ data: { source_ref: "skill:pin-A", revision: "1", files, selected_file: { path: selected, text: lateText } } }, { headers })) })
        return heldResponse
      }
      return Response.json({ data: { source_ref: "skill:pin-A", revision: "1", files, selected_file: selected === null ? null : { path: selected, text: fileTexts[selected] } } }, { headers })
    }
    return Response.json({ data: { installation_id: "pin-install", series_id: "pin-series", source_ref: "skill:pin-A", revision: "1", installed: true, enabled: false, display_name: "Installed A", summary: "A summary", source_status: sourceStatus, installed_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", skill_updated_at: "2026-10-14T00:00:00Z", example_prompts: ["A example"], category_keys: [], tags: [], product: { publication_audience: "catalog", state_version: "1", source_kind: "personal" } } }, { headers })
  })
  const content = (admitted = true, generation = 1, pending = false) => <LocaleProvider><ManusSkillDetailDialog detailSource="installation" readBoundary={{ admitted, subject: "pin-reader", generation }} skill={pending ? null : { skill_id: "pin-series", revision_skill_id: "pin-A", source_ref: "skill:pin-A", installed_source_ref: "skill:pin-A", installation_id: "pin-install", name: "Installed A", description: "Card A", content_hash: "pin-series", scope: "personal", source_status: "disabled", installed: true, enabled: false }} pending={pending} open onOpenChange={vi.fn()} onAdd={onAdd} onTry={() => false} /></LocaleProvider>
  const view = render(content())
  await screen.findByText("A summary")
  expect(screen.getByRole("button", { name: "启用" })).toBeDisabled()
  expect(screen.getByText("此技能版本当前不可用。")).toBeVisible()
  expect(screen.queryByText("B summary")).toBeNull()
  expect(screen.queryByRole("heading", { name: "Catalog B" })).toBeNull()
  const reader = screen.getByRole("button", { name: "查看详情" })
  expect(reader).toBeEnabled()
  fireEvent.click(reader)
  await screen.findByRole("heading", { name: "Installed A", level: 1 })
  expect(requests).toContain("/api/hub/skill-installations/pin-install/package?file_path=SKILL.md")
  expect(requests.some(path => path.endsWith("GetSkill") || path.includes("/skills/pin-A/package"))).toBe(false)
  if (downloadFailure === "forbidden") {
    // Folder disclosure is presentation only. File bytes still use the exact
    // admitted installation pin, and a new reader starts with closed folders.
    const filesToggle = screen.getByRole("button", { name: /^文件$/ })
    const beforeSameSelection = requests.length
    fireEvent.click(filesToggle)
    expect(filesToggle).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: /^SKILL\.md$/ }))
    expect(filesToggle).toHaveAttribute("aria-expanded", "false")
    expect(filesToggle).toHaveFocus()
    expect(requests).toHaveLength(beforeSameSelection)
    const scripts = screen.getByRole("button", { name: /^scripts$/ })
    expect(scripts).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("button", { name: /^references$/ })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "scripts/nested/check.py" })).not.toBeInTheDocument()
    const reads = requests.filter(path => path.includes("/package")).length
    fireEvent.click(scripts)
    const nested = screen.getByRole("button", { name: /^nested$/ })
    expect(nested).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(nested)
    expect(requests.filter(path => path.includes("/package"))).toHaveLength(reads)
    fireEvent.click(screen.getByRole("button", { name: "scripts/nested/check.py" }))
    await screen.findByText(fileTexts["scripts/nested/check.py"])
    expect(requests).toContain("/api/hub/skill-installations/pin-install/package?file_path=scripts%2Fnested%2Fcheck.py")
    holdSelectedFile = true
    view.rerender(content(false, 2, true))
    expect(screen.queryByText(fileTexts["scripts/nested/check.py"])).toBeNull()
    expect(screen.queryByRole("button", { name: "下载技能" })).toBeNull()
    view.rerender(content(true, 2))
    await waitFor(() => expect(settleHeld).toBeTypeOf("function"))
    expect(screen.queryByText(fileTexts["scripts/nested/check.py"])).toBeNull()
    view.rerender(content(false, 3, true))
    expect(heldSignal?.aborted).toBe(true)
    view.rerender(content(true, 3))
    await screen.findByText(fileTexts["scripts/nested/check.py"])
    expect(screen.getByRole("button", { name: /^scripts$/ })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: /^nested$/ })).toHaveAttribute("aria-expanded", "true")
    await act(async () => { settleHeld!(); await heldResponse; await Promise.resolve() })
    expect(screen.queryByText(lateText)).toBeNull()
    expect(screen.getByText(fileTexts["scripts/nested/check.py"])).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: /^SKILL\.md$/ }))
    await screen.findByRole("heading", { name: "Installed A", level: 1 })
    expect(screen.getByRole("button", { name: /^scripts$/ })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: /^nested$/ })).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: /^技能详情$/ }))
    fireEvent.click(await screen.findByRole("button", { name: /^查看详情$/ }))
    await screen.findByRole("heading", { name: "Installed A", level: 1 })
    expect(screen.getByRole("button", { name: /^scripts$/ })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "scripts/nested/check.py" })).not.toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole("button", { name: "下载技能" }))
  await screen.findByRole("alert")
  expect(screen.getByText(downloadFailure === "network" ? "下载未完成，请重试。" : "此技能当前未开放下载。")).toBeVisible()
  expect(screen.queryByText("技能详情暂时不可用")).toBeNull()
  expect(screen.getByRole("heading", { name: "Installed A", level: 1 })).toBeVisible()
  if (downloadFailure === "network") {
    fireEvent.click(screen.getByRole("button", { name: /^技能详情$/ }))
    sourceStatus = "active"
    view.rerender(content(true, 2))
    await waitFor(() => expect(screen.getByRole("button", { name: "启用" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "启用" }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ source_status: "active", source_ref: "skill:pin-A", installation_id: "pin-install" }))
  }
})


it.each([
  { poolEnabled: true, freshEnabled: false, priorAck: "none" },
  { poolEnabled: false, freshEnabled: true, priorAck: "none" },
  { poolEnabled: true, freshEnabled: true, priorAck: "none" },
  { poolEnabled: false, freshEnabled: true, priorAck: "pool" },
  { poolEnabled: false, freshEnabled: false, priorAck: "retired-detail" },
])("installation trial hands off fresh availability and enabled state rather than the old pool %j", async ({ poolEnabled, freshEnabled, priorAck }) => {
  let currentEnabled = freshEnabled
  let listedEnabled = priorAck === "pool" ? true : poolEnabled
  let releaseAck: (() => void) | undefined
  const pendingAck = new Promise<void>(resolve => { releaseAck = resolve })
  let writes = 0
  let listReads = 0
  const installed = {
    installation_id: "trial-restore-install", series_id: "trial-restore-series", source_ref: "skill:trial-restore-version", revision: "1",
    installed: true, enabled: freshEnabled, source_status: "active", display_name: "Recovered source", summary: "Fresh current availability",
    installed_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", skill_updated_at: "2026-10-15T00:00:00Z",
    example_prompts: ["Use fresh availability"], category_keys: [], tags: [], product: { publication_audience: "owner", state_version: "2", source_kind: "personal" },
  }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (init?.method === "POST" && path === "/api/skill.v1.SkillOptionalService/SetSkillInstallationEnabled") {
      writes += 1
      const enabled = (JSON.parse(String(init.body)) as { enabled: boolean }).enabled
      currentEnabled = enabled
      listedEnabled = enabled
      if (priorAck === "retired-detail" && writes === 1) await pendingAck
      return Response.json({ data: { installation: { ...installed, enabled }, change: enabled ? "enabled" : "disabled", event_id: "enabled-current", replayed: false } }, { headers: { "cache-control": "no-store", "x-request-id": "fresh-trial" } })
    }
    if (path.includes("?installed=true")) listReads += 1
    const data = path.includes("?installed=true") ? [{ ...installed, enabled: listedEnabled, source_status: "disabled" }]
      : path.endsWith("/trial-restore-install") ? { ...installed, enabled: currentEnabled } : []
    return Response.json({ data }, { headers: { "cache-control": "no-store", "x-request-id": "fresh-trial" } })
  })
  const onTrySkill = vi.fn((skill: import("@/hub/schemas").SkillCard) => skillTrialSourceRef(skill) !== null)
  render(<LocaleProvider><SkillsSettingsSection readBoundary={{ admitted: true, subject: "fresh-trial-reader", generation: 1 }} hubClient={createHubClient()} preview={false} brandName="Kokoro" onTrySkill={onTrySkill} embeddedCatalogOpen={false} onEmbeddedCatalogOpenChange={vi.fn()} catalogTriggerRef={{ current: null }} /></LocaleProvider>)
  if (priorAck === "pool") {
    fireEvent.click(await screen.findByRole("switch", { name: "停用 Recovered source" }))
    await waitFor(() => expect(screen.getByRole("switch", { name: "启用 Recovered source" })).toBeDisabled())
    currentEnabled = freshEnabled // Another window changes the owner after the pool ACK.
  }
  fireEvent.click(await screen.findByRole("button", { name: "Recovered source" }))
  if (priorAck === "retired-detail") {
    await waitFor(() => expect(screen.getByRole("button", { name: /^启用$/ })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: /^启用$/ }))
    await waitFor(() => expect(writes).toBe(1))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }))
    currentEnabled = false // Owner changes again before the old ACK reaches this window.
    listedEnabled = false
    fireEvent.click(screen.getByRole("button", { name: "Recovered source" }))
    expect(await screen.findByRole("button", { name: "Use fresh availability" })).toBeDisabled()
    const readsBeforeAck = listReads
    await act(async () => { releaseAck!(); await pendingAck })
    await waitFor(() => expect(listReads).toBeGreaterThan(readsBeforeAck))
    expect(screen.getByRole("button", { name: "Use fresh availability" })).toBeDisabled()
    expect(onTrySkill).not.toHaveBeenCalled()
    return
  }
  const trial = await screen.findByRole("button", { name: "Use fresh availability" })
  if (!freshEnabled) {
    expect(trial).toBeDisabled()
    const enable = screen.getByRole("button", { name: /^启用$/ })
    expect(enable).toBeEnabled()
    fireEvent.click(enable)
    await waitFor(() => expect(screen.getByRole("button", { name: "Use fresh availability" })).toBeEnabled())
    // A local ACK can supersede the earlier read, but not the next open's fresh GET.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }))
    currentEnabled = false
    fireEvent.click(screen.getByRole("button", { name: "Recovered source" }))
    await waitFor(() => expect(screen.getByRole("button", { name: /^启用$/ })).toBeEnabled())
    expect(screen.getByRole("button", { name: "Use fresh availability" })).toBeDisabled()
    expect(onTrySkill).not.toHaveBeenCalled()
  } else {
    expect(trial).toBeEnabled()
    fireEvent.click(trial)
    expect(onTrySkill).toHaveBeenCalledWith(expect.objectContaining({ source_status: "active", enabled: true, source_ref: installed.source_ref, installed_source_ref: installed.source_ref }), "Use fresh availability")
    expect(screen.queryByRole("dialog")).toBeNull()
  }
})

it("catalog detail still reads current B even when its card also carries installation A", async () => {
  const requests: string[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    requests.push(String(input))
    return Response.json({ skill: { id: "separate-series", version: "current-B", displayName: "Catalog current B", description: "Catalog B metadata" } })
  })
  render(<LocaleProvider><ManusSkillDetailDialog readBoundary={{ admitted: true, subject: "catalog-pin-reader", generation: 1 }} skill={{ skill_id: "separate-series", revision_skill_id: "current-B", source_ref: "skill:current-B", installed_source_ref: "skill:installed-A", installation_id: "installed-A-id", name: "Catalog card", description: "Current card", content_hash: "series", scope: "official", installed: true, enabled: true }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={() => false} /></LocaleProvider>)
  await screen.findByText("Catalog B metadata")
  expect(screen.getByRole("button", { name: "查看详情" })).toBeEnabled()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toContain("GetSkill")
})

it.each(["pin-changed", "series-changed", "removed"])("installation detail rejects %s without using a catalog fallback", async scenario => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {
    installation_id: "reject-install", series_id: scenario === "series-changed" ? "another-series" : "reject-series", source_ref: scenario === "pin-changed" ? "skill:new-B" : "skill:old-A", revision: "1", installed: scenario !== "removed", enabled: false,
    ...(scenario === "removed" ? { removed_at: "2026-10-16T00:00:00Z" } : {}),
    installed_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", skill_updated_at: "2026-10-15T00:00:00Z", display_name: "Untrusted replacement", summary: "Never display replacement facts", source_status: "active", example_prompts: [], category_keys: [], tags: [], product: { publication_audience: "catalog", state_version: "1" },
  } }, { headers: { "cache-control": "no-store", "x-request-id": "rejected-pin" } }))
  render(<LocaleProvider><ManusSkillDetailDialog detailSource="installation" readBoundary={{ admitted: true, subject: `rejected-pin-${scenario}`, generation: 1 }} skill={{ installation_id: "reject-install", skill_id: "reject-series", revision_skill_id: "old-A", source_ref: "skill:old-A", installed_source_ref: "skill:old-A", name: "Selected A", description: "Selected A facts", content_hash: "series", scope: "personal", installed: true, enabled: false }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={() => false} /></LocaleProvider>)
  await screen.findByText("技能详情暂时不可用")
  expect(screen.queryByText("Never display replacement facts")).toBeNull()
  expect(screen.getByRole("button", { name: "查看详情" })).toBeDisabled()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/self/skill-installations/reject-install")
})


function privateOAuthDetailFixture() {
  const base = mcpCreationRegistration()
  const connector = { ...base.connector, state_version: "7" }
  const server = { ...base.server, transport: "streamable_http" as const, prepare_status: "needs_oauth" as const, authorization_status: "pending" as const }
  const prepare = vi.fn()
  const response = { connector, authorization: { authorization_id: "private-detail-attempt", authorization_url: "https://oauth.example.test/private-detail", expires_at: new Date(Date.now() + 60_000).toISOString() } }
  const reconnect = vi.fn<(id: string, input: unknown, signal?: AbortSignal) => Promise<typeof response>>().mockResolvedValue(response)
  const hub = { ...apiCreationHub(), getPrivateMcpServer: vi.fn().mockResolvedValue(server),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }),
    preparePrivateMcpServer: prepare, reconnectMcpConnectorAuthorization: reconnect }
  return { connector, server, hub, reconnect, prepare, response }
}

it.each(["detail", "configuration"] as const)("private OAuth %s reconnects after the creation window is gone without running Prepare", async mode => {
  const f = privateOAuthDetailFixture(), navigate = vi.fn()
  let acknowledge!: () => void
  const gate = new Promise<void>(resolve => { acknowledge = resolve })
  const response = f.response
  f.reconnect.mockImplementation(async () => { await gate; return response })
  render(<LocaleProvider><McpProjectionRead client={f.hub} identity={`private-detail-${mode}`} initialView="connections" onAuthorizationNavigate={navigate} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: /Creation MCP/ }))
  const dialog = await screen.findByRole("dialog", { name: "Creation MCP" })
  if (mode === "configuration") {
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
    await screen.findByRole("dialog", { name: "MCP 配置" })
  }
  const connect = within(dialog).getByRole("button", { name: "连接" })
  fireEvent.click(connect); fireEvent.click(connect)
  await waitFor(() => expect(f.reconnect).toHaveBeenCalledExactlyOnceWith(f.connector.connector_id,
    { server_id: f.server.server_id, expected_state_version: "7" }, expect.any(AbortSignal)))
  expect(connect).toBeDisabled()
  await act(async () => { acknowledge(); await gate })
  await waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith(response.authorization.authorization_url))
  expect(dialog).toBeVisible()
  expect(f.prepare).not.toHaveBeenCalled()
})

it.each(["close", "recheck"] as const)("private OAuth retires %s without blocking the next window or navigating a late ACK", async retirement => {
  const f = privateOAuthDetailFixture(), navigate = vi.fn()
  let acknowledge!: () => void, signal!: AbortSignal
  const gate = new Promise<void>(resolve => { acknowledge = resolve })
  let acknowledgeFresh!: () => void, attempt = 0
  const freshGate = new Promise<void>(resolve => { acknowledgeFresh = resolve })
  const response = f.response
  f.reconnect.mockImplementation(async (_id, _input, requestSignal) => {
    if (++attempt === 1) { signal = requestSignal!; await gate } else await freshGate
    return response
  })
  const content = (admitted: boolean, readGeneration: number) => <LocaleProvider><McpProjectionRead client={f.hub} identity={`private-detail-${retirement}`} admitted={admitted} readGeneration={readGeneration} initialView="connections" onAuthorizationNavigate={navigate} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: /Creation MCP/ }))
  const old = await screen.findByRole("dialog", { name: "Creation MCP" })
  fireEvent.click(within(old).getByRole("button", { name: "连接" }))
  await waitFor(() => expect(f.reconnect).toHaveBeenCalledOnce())
  if (retirement === "close") {
    fireEvent.click(within(old).getByRole("button", { name: "取消" }))
    expect(signal.aborted).toBe(true)
    fireEvent.click(await screen.findByRole("button", { name: /Creation MCP/ }))
  } else {
    view.rerender(content(false, 2))
    expect(signal.aborted).toBe(true)
    expect(f.reconnect).toHaveBeenCalledOnce()
    view.rerender(content(true, 2))
  }
  const reopened = await screen.findByRole("dialog", { name: "Creation MCP" })
  fireEvent.click(within(reopened).getByRole("button", { name: "连接" }))
  await waitFor(() => expect(f.reconnect).toHaveBeenCalledTimes(2))
  await act(async () => { acknowledge(); await gate })
  await waitFor(() => expect(reopened).toBeVisible())
  expect(navigate).not.toHaveBeenCalled()
  expect(f.reconnect).toHaveBeenCalledTimes(2)
  view.unmount()
  await act(async () => { acknowledgeFresh(); await freshGate })
  expect(navigate).not.toHaveBeenCalled()
})

it("Custom API card opens its editor directly, keeps unchanged save disabled and closes on cancel", async () => {
  const { CustomApiDetailDialog } = await import("@/ui/mcp/custom-api-detail-dialog")
  const close = vi.fn(), save = vi.fn(), remove = vi.fn()
  const profile = { profile_id: "direct-api", name: "Direct API", instructions: "Original instruction", state_version: "1", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", environment: [] }
  render(<LocaleProvider><CustomApiDetailDialog profile={profile} admitted busy={false} actionError={false} command={undefined}
    canUpdate canRemove onResume={vi.fn()} returnFocusRef={{ current: null }} onClose={close} onSave={save} onDelete={remove} /></LocaleProvider>)
  const dialog = screen.getByRole("dialog", { name: "编辑自定义 API" })
  expect(within(dialog).getByRole("textbox", { name: "名称" })).toHaveValue("Direct API")
  expect(within(dialog).getByRole("textbox", { name: "名称" })).toHaveFocus()
  expect(within(dialog).getByRole("button", { name: "复制 UUID" })).toBeEnabled()
  expect(within(dialog).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument()
  const submit = within(dialog).getByRole("button", { name: "保存" })
  expect(submit).toBeDisabled()
  fireEvent.change(within(dialog).getByRole("textbox", { name: "名称" }), { target: { value: "Updated API" } })
  expect(submit).toBeEnabled()
  fireEvent.click(submit)
  expect(save).toHaveBeenCalledWith({ expected_state_version: "1", name: "Updated API", instructions: "Original instruction" })
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  expect(close).toHaveBeenCalledTimes(1)
})

it("opening a Custom API with legal owner whitespace does not enable or submit a normalized rewrite", async () => {
  const { CustomApiDetailDialog } = await import("@/ui/mcp/custom-api-detail-dialog")
  const save = vi.fn()
  const profile = { profile_id: "whitespace-api", name: " API ", instructions: " note\n", state_version: "1", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", environment: [] }
  render(<LocaleProvider><CustomApiDetailDialog profile={profile} admitted busy={false} actionError={false} command={undefined}
    canUpdate canRemove onResume={vi.fn()} returnFocusRef={{ current: null }} onClose={vi.fn()} onSave={save} onDelete={vi.fn()} /></LocaleProvider>)
  const field = screen.getByRole("textbox", { name: "名称" })
  expect(field).toHaveValue(" API ")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  fireEvent.submit(field.closest("form")!)
  expect(save).not.toHaveBeenCalled()
})

it("a pending Custom API save reports form busy without inserting a loading banner above its fields", async () => {
  const { CustomApiDetailDialog } = await import("@/ui/mcp/custom-api-detail-dialog")
  const profile = { profile_id: "pending-api-layout", name: "Pending API", state_version: "1", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", environment: [] }
  render(<LocaleProvider><CustomApiDetailDialog profile={profile} admitted busy actionError={false} command={{ profileId: profile.profile_id, operation: "update", kind: "running" }}
    canUpdate canRemove onResume={vi.fn()} returnFocusRef={{ current: null }} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} /></LocaleProvider>)
  expect(screen.getByLabelText("名称").closest("form")).toHaveAttribute("aria-busy", "true")
  expect(screen.queryByText("正在加载…")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
})

it("a failed draft retirement shows a send error and retains the composer input", async () => {
  engine.dispose()
  client = createFakeClient()
  engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null), draftLifecycle: { isUnsubmitted: () => true, retire: () => false } })
  engine.newConversation()
  mountFrame()
  const composer = screen.getByRole("textbox", { name: "对话输入" })
  fireEvent.change(composer, { target: { value: "preserve this unsent draft" } })
  fireEvent.submit(composer.closest("form")!)
  expect(await screen.findByRole("alert")).toHaveTextContent("消息尚未发送")
  expect(composer).toHaveValue("preserve this unsent draft")
  expect(client.createCalls).toEqual([])
})

it.each(["custom", "url"] as const)("a known duplicate private MCP URL explains the rejection and preserves editable fields without retrying automatically (%s)", async mode => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { Dialog, DialogContent } = await import("@/components/ui/dialog")
  const { CustomMcpForm } = await import("@/ui/mcp/mcp-custom-form")
  const { createMcpServerCreationFlow } = await import("@/ui/mcp/mcp-server-creation-flow")
  const { HubClientError } = await import("@/hub/client")
  const { UrlMcpForm } = await import("@/ui/mcp/mcp-url-form")
  const boundary = { admitted: true, subject: "duplicate-url-ui", generation: 1 }
  const registration = mcpCreationRegistration()
  const hub = { registerPrivateMcpServer: vi.fn().mockRejectedValue(new HubClientError("http", "duplicate", "mcp_personal_server_url_conflict", 409, false)),
    preparePrivateMcpServer: vi.fn(), getPrivateMcpServer: vi.fn(), getMcpConnector: vi.fn(), beginMcpConnectorAuthorization: vi.fn() }
  const flow = createMcpServerCreationFlow({ client: hub, boundary, onChanged: vi.fn(), preparation: createMcpPreparationCommands({ client: hub, boundary, canPrepare: () => true, onConfirmed: vi.fn() }) })
  const Form = mode === "custom" ? CustomMcpForm : UrlMcpForm
  render(<LocaleProvider><Dialog open><DialogContent><Form flow={flow} boundary={boundary} onDone={async () => undefined} onCancel={vi.fn()} /></DialogContent></Dialog></LocaleProvider>)
  const name = screen.getByRole("textbox", { name: /^服务器名称\*?$/ })
  const url = screen.getByRole("textbox", { name: /^服务器 URL\*?$/ })
  fireEvent.change(name, { target: { value: "Keep QA name" } })
  fireEvent.change(url, { target: { value: registration.server.server_url } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("此服务器 URL 已添加")
  expect(name).toHaveValue("Keep QA name")
  expect(url).toHaveValue(registration.server.server_url)
  expect(name).not.toHaveAttribute("readonly")
  expect(url).not.toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  expect(screen.queryByRole("button", { name: "重试原请求" })).not.toBeInTheDocument()
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
})

// Native storage is covered separately; these jsdom tests retain all original command/UI assertions.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});


function exactCreationHub() {
  const registered = mcpCreationRegistration()
  const server = { ...registered.server, availability: "available" as const, status: "registered" as const, transport: "streamable_http" as const, prepare_status: "ready" as const, declarations_available: true }
  const connector = { ...registered.connector, availability: "available" as const, status: "active" as const, enabled: true }
  // Same display name intentionally points to a different row; ACK identity wins.
  const other = { ...connector, connector_id: "different-connector", server_id: "different-server", provider_key: "different-provider" }
  return { ...apiCreationHub(),
    listMcpConnectors: vi.fn(async () => ({ items: [other], next_cursor: null })),
    registerPrivateMcpServer: vi.fn(async () => ({ server, connector, replayed: false })),
    getPrivateMcpServer: vi.fn<NonNullable<import("@/hub/client").HubClient["getPrivateMcpServer"]>>(async () => server), getMcpConnector: vi.fn<NonNullable<import("@/hub/client").HubClient["getMcpConnector"]>>(async () => connector),
    preparePrivateMcpServer: vi.fn(),
  }
}

it.each([ ["global", "form"], ["global", "url"], ["settings", "form"], ["settings", "url"] ] as const)(
  "%s %s creation opens the exact acknowledged detail without a matching list row", async (entry, mode) => {
    const { ConnectorsSettingsSection } = await import("@/ui/settings/sections/connectors-settings-section")
    const pageClients = await import("@/ui/shell/page-clients")
    const hub = exactCreationHub()
    vi.spyOn(pageClients, "browserHubClient").mockReturnValue(hub)
    const boundary = { admitted: true, subject: `exact-${entry}-${mode}`, generation: 1 }
    render(entry === "global" ? apiCreationOverlay(boundary, mode) :
      <LocaleProvider><ConnectorCommandProvider client={hub} boundary={boundary}><ConnectorsSettingsSection client={hub} preview={false} brandName="Kokoro" readBoundary={boundary} /></ConnectorCommandProvider></LocaleProvider>)
    if (entry === "settings") {
      fireEvent.keyDown(await screen.findByRole("button", { name: "创建" }), { key: "ArrowDown" })
      fireEvent.click(await screen.findByRole("menuitem", { name: mode === "form" ? "自定义 MCP" : /通过 URL 添加 MCP/u }))
    }
    fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称\*?$/u }), { target: { value: "Creation MCP" } })
    fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL\*?$/u }), { target: { value: "https://mcp.example.test/creation" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(await screen.findByRole("button", { name: "管理" })).toBeVisible()
    expect(screen.getByRole("dialog", { name: "Creation MCP" })).toBeVisible()
    expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
    expect(hub.preparePrivateMcpServer).not.toHaveBeenCalled()
    expect(hub.getMcpConnector.mock.calls.every(([id]) => id === "creation-connector")).toBe(true)
    expect(hub.getPrivateMcpServer.mock.calls.every(([id]) => id === "creation-server")).toBe(true)
    // Creation read + fresh detail read; no list scan is accepted as detail facts.
    expect(hub.getMcpConnector.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(hub.getPrivateMcpServer.mock.calls.length).toBeGreaterThanOrEqual(2)
  },
)

it.each(["window", "subject"] as const)("a successful completion callback after %s retirement never opens the old ACK detail", async retirement => {
  const { McpCreateDialog } = await import("@/ui/mcp/mcp-create-dialog")
  const hub = exactCreationHub()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const onDone = vi.fn(async () => pending)
  const dialog = (subject: string, open = true) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject, generation: 1 }}>
    <McpCreateDialog client={hub} mode="form" open={open} onOpenChange={vi.fn()} onDone={onDone} />
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(dialog("original-actor"))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://mcp.example.test/creation" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  if (retirement === "window") view.rerender(dialog("original-actor", false))
  view.rerender(dialog(retirement === "subject" ? "next-actor" : "original-actor"))
  const name = await screen.findByRole("textbox", { name: "服务器名称" })
  fireEvent.change(name, { target: { value: "New window draft" } })
  await act(async () => { release(); await pending })
  expect(screen.queryByRole("button", { name: "管理" })).not.toBeInTheDocument()
  expect(name).toHaveValue("New window draft")
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
})

it("an admitted completion retry keeps its exact locator after a pending callback loses its generation", async () => {
  const { McpCreateDialog } = await import("@/ui/mcp/mcp-create-dialog")
  const hub = exactCreationHub()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const onDone = vi.fn().mockImplementationOnce(async () => pending).mockResolvedValue(undefined)
  const dialog = (admitted: boolean, generation: number) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted, subject: "completion-recheck", generation }}>
    <McpCreateDialog client={hub} mode="form" open onOpenChange={vi.fn()} onDone={onDone} />
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(dialog(true, 1))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://mcp.example.test/creation" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  view.rerender(dialog(false, 2))
  await act(async () => { release(); await pending })
  expect(screen.queryByRole("button", { name: "管理" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "完成" })).toBeDisabled()
  view.rerender(dialog(true, 2))
  fireEvent.click(screen.getByRole("button", { name: "完成" }))
  expect(await screen.findByRole("button", { name: "管理" })).toBeVisible()
  expect(onDone).toHaveBeenCalledTimes(2)
  expect(onDone.mock.calls[1]?.[0]).toBe(onDone.mock.calls[0]?.[0])
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
})

it("created detail rejects a mismatched fresh server and recovers only the acknowledged entity on readmission", async () => {
  const { McpCreateDialog } = await import("@/ui/mcp/mcp-create-dialog")
  const hub = exactCreationHub()
  const server = { ...mcpCreationRegistration().server, availability: "available" as const, status: "registered" as const, transport: "streamable_http" as const, prepare_status: "ready" as const, declarations_available: true }
  let mismatched = false
  hub.getPrivateMcpServer.mockImplementation(async () => mismatched ? { ...server, server_id: "different-server", display_name: "Wrong private server" } : server)
  const content = (generation: number) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: "exact-binding-check", generation }}>
    <McpCreateDialog client={hub} mode="form" open onOpenChange={vi.fn()} onDone={async () => { mismatched = true }} />
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(content(1))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: server.server_url } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(await screen.findByText("连接列表加载失败")).toHaveClass("sr-only")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByText("Wrong private server")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "管理" })).not.toBeInTheDocument()
  mismatched = false
  view.rerender(content(2))
  expect(await screen.findByRole("button", { name: "管理" })).toBeVisible()
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
  expect(hub.getPrivateMcpServer.mock.calls.every(([id]) => id === "creation-server")).toBe(true)
  expect(hub.getMcpConnector.mock.calls.every(([id]) => id === "creation-connector")).toBe(true)
})

it("a newer creation window retires the older pending exact-detail handoff", async () => {
  const { McpCreateDialog } = await import("@/ui/mcp/mcp-create-dialog")
  const hub = exactCreationHub()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const onDone = vi.fn(async () => pending)
  const windows = (newer: boolean) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: "two-window-actor", generation: 1 }}>
    <McpCreateDialog key="older" client={hub} mode="form" open onOpenChange={vi.fn()} onDone={onDone} />
    {newer ? <McpCreateDialog key="newer" client={hub} mode="url" open onOpenChange={vi.fn()} /> : null}
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(windows(false))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Creation MCP" } })
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://mcp.example.test/creation" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  view.rerender(windows(true))
  await act(async () => { release(); await pending })
  expect(screen.queryByRole("button", { name: "管理", hidden: true })).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: /^服务器名称\*?$/u })).toHaveValue("")
  expect(hub.registerPrivateMcpServer).toHaveBeenCalledOnce()
})

it.each(["pending", "failed"] as const)("independent confirmed API cards stay usable when the initial MCP list is %s", async mode => {
  const profile = { profile_id: `independent-api-${mode}`, name: `Independent API ${mode}`, state_version: "1", environment: [], created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z" }
  const hub = { ...createHubClient(), listMcpConnectors: vi.fn().mockImplementationOnce(async () => { if (mode === "failed") throw new Error("temporary MCP read failure"); return new Promise<never>(() => {}) }).mockResolvedValue({ items: [{ availability: "unavailable", connector_id: "recovered-mcp", connector_type: "mcp", provider_key: "private-recovered", status: "pending", approved_scopes: [], enabled: false, state_version: "1", display_name: "Recovered MCP" }], next_cursor: "recovered-owner-cursor" }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [profile], page: { next_cursor: null } }), getCustomApi: vi.fn().mockResolvedValue(profile),
  }
  const identity = `independent-api-reader-${mode}`
  render(<LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: identity, generation: 1 }}><RawMcpProjectionRead client={hub} identity={identity} admitted readGeneration={1} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  await waitFor(() => expect(hub.listCustomApis).toHaveBeenCalledOnce())
  const card = await screen.findByRole("button", { name: profile.name })
  expect(card).toBeVisible()
  if (mode === "failed") {
    expect(screen.getByText("连接列表加载失败")).toHaveClass("sr-only")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  }
  expect(screen.queryByRole("navigation", { name: "MCP pages" })).toBeNull()
  fireEvent.click(card)
  const dialog = await screen.findByRole("dialog", { name: "编辑自定义 API" })
  expect(within(dialog).getByRole("textbox", { name: "名称" })).toHaveValue(profile.name)
  expect(hub.listMcpConnectors).toHaveBeenCalledOnce()
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭连接面板" }))
  expect(screen.queryByText("还没有连接器。")).not.toBeInTheDocument()
  if (mode === "failed") {
    const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection")
    act(() => invalidateMcpConnectorProjection(hub, identity))
    expect(await screen.findByRole("button", { name: "Recovered MCP" })).toBeVisible()
    expect(screen.getByRole("button", { name: profile.name })).toBeVisible()
    expect(screen.queryByText("连接列表加载失败")).not.toBeInTheDocument()
    expect(within(screen.getByRole("navigation", { name: "MCP pages" })).getByRole("button", { name: "下一页" })).toBeEnabled()
    expect(hub.listMcpConnectors).toHaveBeenCalledTimes(2)
    expect(hub.listCustomApis).toHaveBeenCalledOnce()
  }
})

it("empty API data does not turn a pending or failed MCP read into an all-empty success", async () => {
  let reject!: (reason: Error) => void
  const pending = new Promise<never>((_, fail) => { reject = fail })
  const hub = { ...createHubClient(), listMcpConnectors: vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  }
  const identity = "independent-confirmed-empty-reader"
  render(<LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ admitted: true, subject: identity, generation: 1 }}><RawMcpProjectionRead client={hub} identity={identity} admitted readGeneration={1} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  await waitFor(() => expect(hub.listCustomApis).toHaveBeenCalledOnce())
  expect(screen.queryByText("还没有连接器。")).not.toBeInTheDocument()
  await act(async () => { reject(new Error("temporary MCP read failure")) })
  expect(await screen.findByText("连接列表加载失败")).toHaveClass("sr-only")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByText("还没有连接器。")).not.toBeInTheDocument()
  const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection")
  act(() => invalidateMcpConnectorProjection(hub, identity))
  expect(await screen.findByText("还没有连接器。")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "添加连接器" })).toBeVisible()
  expect(screen.queryByText("连接列表加载失败")).not.toBeInTheDocument()
  expect(screen.queryByRole("navigation", { name: "MCP pages" })).not.toBeInTheDocument()
  expect(hub.listMcpConnectors).toHaveBeenCalledTimes(2)
})

// Current-draft selection is deliberately separate from Settings' prompt/new-chat trial.
function currentSkillDraftActions(draft = "original editable text", trialEngine = engine, projectRef?: string) {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "draft-actor")
  const updateDraft = vi.fn(), clearDraft = vi.fn(), closeSettings = vi.fn()
  const view = renderHook(({ currentEngine, admitted, subject, generation }) => useAppFrameActions({
    engine: currentEngine, readBoundary: { admitted, subject, generation },
    projectWorkspace: projectRef !== undefined, ...(projectRef === undefined ? {} : { projectRef }),
    routedConversationId: null, standaloneSurface: false, chatHref: "/app",
    activeId: currentEngine.getSnapshot().store?.activeId ?? null, draft, clearDraft, updateDraft,
    setDeploymentIntent: vi.fn(), syncConversationUrl: vi.fn(), setConversationRouteId: vi.fn(), focusComposer: vi.fn(),
    closeSettings, brandName: "Kokoro", commandNewChatTimerRef: { current: null },
  }), { wrapper: LocaleProvider, initialProps: { currentEngine: trialEngine, admitted: true, subject: "draft-actor", generation: 1 } })
  return { ...view, updateDraft, clearDraft, closeSettings }
}

it("composer skill selection keeps a no-example current Direct null draft and sends its exact ref only on Send", async () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  const create = vi.spyOn(engine, "newConversation")
  let accepted: boolean | undefined
  act(() => { accepted = view.result.current.selectSkillForCurrentDraft(executableTrial) })
  expect(accepted).toBe(true)
  expect(engine.getSnapshot().store).toBeNull()
  expect(create).not.toHaveBeenCalled()
  expect(view.result.current.selectedSkill).toEqual({ name: "Owner trial", sourceRef: "skill:trial-version" })
  expect(view.updateDraft).not.toHaveBeenCalled()
  expect(view.clearDraft).not.toHaveBeenCalled()
  expect(view.closeSettings).not.toHaveBeenCalled()
  expect(client.createCalls).toEqual([])
  await act(async () => { view.result.current.submitDraft(); await settle() })
  expect(client.createCalls).toHaveLength(1)
  expect(client.createCalls[0]?.body).toMatchObject({ content: "original editable text", selected_skill_source_refs: ["skill:trial-version"] })
  expect(view.result.current.selectedSkill?.sourceRef).toBe("skill:trial-version")
  expect(view.clearDraft).toHaveBeenCalledOnce()
})

it("composer skill selection preserves an existing task and ordinary draft text without reset or send", async () => {
  window.history.replaceState({}, "", "/app")
  engine.newConversation()
  const id = engine.getSnapshot().store!.activeId
  const view = currentSkillDraftActions("text before / and after")
  const create = vi.spyOn(engine, "newConversation")
  act(() => { view.result.current.selectSkillForCurrentDraft(executableTrial) })
  expect(engine.getSnapshot().store?.activeId).toBe(id)
  expect(create).not.toHaveBeenCalled()
  expect(client.createCalls).toEqual([])
  expect(view.updateDraft).not.toHaveBeenCalled()
  act(() => view.result.current.clearSelectedSkill())
  await act(async () => { view.result.current.submitDraft(); await settle() })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
})

it.each([false, true])("composer skill selection transfers the Project overview draft only inside its explicit first Send (remembered=%s)", async remembered => {
  const projectRef = "project_00000000-0000-4000-8000-000000000901"
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const projectClient = createFakeClient()
  const projectEngine = createSessionEngine({ client: projectClient, storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef } })
  if (remembered) projectEngine.newConversation()
  const originalId = projectEngine.getSnapshot().store?.activeId ?? null
  const view = currentSkillDraftActions("project original", projectEngine, projectRef)
  try {
    act(() => { view.result.current.selectSkillForCurrentDraft(executableTrial) })
    expect(projectEngine.getSnapshot().store?.activeId ?? null).toBe(originalId)
    expect(projectClient.createCalls).toEqual([])
    await act(async () => { view.result.current.submitDraft(); await settle() })
    expect(projectClient.createCalls[0]?.body).toMatchObject({ project_ref: projectRef, content: "project original", selected_skill_source_refs: ["skill:trial-version"] })
    expect(view.result.current.selectedSkill?.sourceRef).toBe("skill:trial-version")
    expect(client.createCalls).toEqual([])
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each([
  { enabled: false }, { source_status: "withdrawn" as const }, { installed_source_ref: "skill:another" }, { revision_skill_id: "another" },
])("composer skill selection rejects a non-executable or mismatched pin %j", patch => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  let accepted: boolean | undefined
  act(() => { accepted = view.result.current.selectSkillForCurrentDraft({ ...executableTrial, ...patch }) })
  expect(accepted).toBe(false)
  expect(view.result.current.selectedSkill).toBeNull()
  expect(engine.getSnapshot().store).toBeNull()
  expect(client.createCalls).toEqual([])
})

it("composer skill selection retires both current and retained callbacks across a departed route A to B to A", async () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  const oldSelect = view.result.current.selectSkillForCurrentDraft
  act(() => { oldSelect(executableTrial) })
  act(() => {
    window.history.replaceState({}, "", "/app/library")
    window.dispatchEvent(new PopStateEvent("popstate"))
    window.history.replaceState({}, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  expect(view.result.current.selectedSkill).toBeNull()
  let accepted: boolean | undefined
  act(() => { accepted = oldSelect(executableTrial) })
  expect(accepted).toBe(false)
  await act(async () => { engine.submit("ordinary message"); await settle() })
  expect(client.createCalls[0]?.body.selected_skill_source_refs).toEqual([])
})

it("composer skill selection retires on actor admission and engine/scope replacement without old remove clearing a replacement", async () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  act(() => { view.result.current.selectSkillForCurrentDraft(executableTrial) })
  const oldSelect = view.result.current.selectSkillForCurrentDraft, oldRemove = view.result.current.clearSelectedSkill
  view.rerender({ currentEngine: engine, admitted: false, subject: "draft-actor", generation: 2 })
  expect(view.result.current.selectedSkill).toBeNull()
  act(() => { expect(oldSelect(executableTrial)).toBe(false) })
  const replacementClient = createFakeClient()
  const replacement = createSessionEngine({ client: replacementClient, storage: createMemoryStorage<ConversationStore>(null), scope: { kind: "project", projectRef: "project:replacement" } })
  try {
    view.rerender({ currentEngine: replacement, admitted: true, subject: "draft-actor", generation: 3 })
    act(() => { view.result.current.selectSkillForCurrentDraft({ ...executableTrial, name: "Replacement" }); oldRemove() })
    expect(view.result.current.selectedSkill?.name).toBe("Replacement")
    act(() => {
      window.localStorage.setItem("kokoro.web.auth-index-subject", "other-actor")
      window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "other-actor" }))
    })
    expect(view.result.current.selectedSkill).toBeNull()
    await act(async () => { replacement.submit("ordinary"); await settle() })
    expect(replacementClient.createCalls[0]?.body.selected_skill_source_refs).toBeUndefined()
  } finally { view.unmount(); replacement.dispose() }
})

it("composer skill selection preserves frozen unknown submission after clear and rejects a new source until resolved", async () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  act(() => { view.result.current.selectSkillForCurrentDraft(executableTrial) })
  client.nextCreate = () => Promise.reject(new SessionClientError("network", "unknown commit"))
  await act(async () => { view.result.current.submitDraft(); await settle() })
  const first = client.createCalls[0]
  expect(engine.getSnapshot().canRetryPendingSubmission).toBe(true)
  act(() => {
    view.result.current.clearSelectedSkill()
    expect(view.result.current.selectSkillForCurrentDraft(executableTrial)).toBe(false)
  })
  client.nextCreate = () => Promise.resolve(makeReceipt("run_current_draft_retry"))
  await act(async () => { engine.retry(); await settle() })
  expect(client.createCalls).toEqual([first, first])
  expect(first?.body.selected_skill_source_refs).toEqual(["skill:trial-version"])
})

it("composer skill selection survives only its own first-Send canonical URL publication, not a later route change", async () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  act(() => { view.result.current.selectSkillForCurrentDraft(executableTrial) })
  await act(async () => { view.result.current.submitDraft(); await settle() })
  const id = engine.getSnapshot().store!.activeId
  act(() => {
    window.history.replaceState({}, "", `/app?conversation=${id}`)
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  expect(view.result.current.selectedSkill?.sourceRef).toBe("skill:trial-version")
})

it("composer skill selection retires a draft on a rendered route change even without a browser history event", () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  act(() => { view.result.current.selectSkillForCurrentDraft(executableTrial) })
  window.history.replaceState({}, "", "/app/library")
  view.rerender({ currentEngine: engine, admitted: true, subject: "draft-actor", generation: 1 })
  expect(view.result.current.selectedSkill).toBeNull()
})

it("composer skill selection admits a fresh callback after same-batch route A to B to A without reviving a retained callback", () => {
  window.history.replaceState({}, "", "/app")
  const view = currentSkillDraftActions()
  const retiredSelect = view.result.current.selectSkillForCurrentDraft
  act(() => { retiredSelect(executableTrial) })
  act(() => {
    window.history.pushState({}, "", "/app?settings=skills")
    window.dispatchEvent(new PopStateEvent("popstate"))
    window.history.replaceState({}, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  expect(view.result.current.selectedSkill).toBeNull()
  act(() => { expect(retiredSelect(executableTrial)).toBe(false) })
  act(() => { expect(view.result.current.selectSkillForCurrentDraft(executableTrial)).toBe(true) })
  expect(view.result.current.selectedSkill?.sourceRef).toBe("skill:trial-version")
  expect(engine.getSnapshot().store).toBeNull()
  expect(client.createCalls).toEqual([])
})


it.each(["completed", "failed", "cancelled"] as const)("current task progress retires both live hosts on exact %s terminal without completing the original todos", async terminal => {
  const sessionId = `conv_progress_${terminal}`
  const runId = `run_progress_${terminal}`
  const todos = [{ content: "original plan one", status: "in_progress" as const }, { content: "original plan two", status: "pending" as const }]
  window.history.replaceState({}, "", `/app?conversation=${sessionId}`)
  let snapshot = makeSnapshot({ sessionId, activeRun: { run_id: runId, status: "running" } })
  client.nextSnapshot = async () => snapshot
  await act(async () => { engine.openConversation(sessionId); await settle() })
  mountFrame({ preview: true })
  await waitFor(() => expect(client.streams.length).toBeGreaterThan(0))
  const stream = client.lastStream()
  await act(async () => {
    stream.emit([
      makeEvent("run.created", { run_id: runId }, { run_id: runId, session_id: sessionId }),
      makeEvent("todo.updated", { todos }, { run_id: runId, session_id: sessionId }),
    ])
    openCanvas(sessionId, { kind: "node", title: "retained result", node: <p>delivered result stays visible</p> })
    await settle()
  })
  expect(screen.getByRole("progressbar", { name: "任务进度" })).toHaveAttribute("aria-valuenow", "0")
  expect(document.querySelector('[data-slot="canvas-task-footer"]')).toHaveTextContent("0 / 2")
  snapshot = makeSnapshot({ sessionId })
  try {
    await act(async () => {
      stream.emit([terminal === "failed"
        ? makeAgentFailureEvent(AGENT_FAILURE_PROFILES[0]!, { run_id: runId, session_id: sessionId })
        : makeEvent("run.completed", { status: terminal, token_usage: null }, { run_id: runId, session_id: sessionId })])
      await settle()
    })
    expect(screen.queryByRole("progressbar", { name: "任务进度" })).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="canvas-task-footer"]')).not.toBeInTheDocument()
    expect(screen.getByText("delivered result stays visible")).toBeInTheDocument()
    expect(engine.getSnapshot().thread.todos).toEqual(todos)
    expect(engine.getSnapshot().thread.executionProcess?.todos).toEqual(todos)
    expect(engine.getSnapshot().thread.executionHead).toBeNull()
    if (terminal === "failed") expect(engine.getSnapshot().thread.runFailuresById[runId]).toBeDefined()
  } finally { closeCanvas(sessionId) }
})

async function mountRememberedProjectComposer(options: { workspace?: boolean; featureFlags?: React.ComponentProps<typeof AppFrame>["featureFlags"]; beforeRender?: (value: { projectEngine: SessionEngine; projectClient: FakeClient }) => void | Promise<void> } = {}) {
  const projectRef = "project_composer-draft"
  const remembered = "conv_composer-history"
  const projectClient = createFakeClient()
  projectClient.nextSnapshot = id => Promise.resolve(makeSnapshot({ sessionId: id,
    messages: [{ message_id: "history-message", role: "assistant", run_id: "history-run", content: "completed hidden task", status: "completed", created_at: "2026-07-02T00:00:01Z" }],
  }))
  projectClient.listModels = async () => ({ models: [
    { provider: "fixture", name: "draft-default", is_default: true, display_name: "Draft default", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "draft-default" },
    { provider: "fixture", name: "draft-choice", is_default: false, display_name: "Draft choice", model_id: "11111111-1111-4111-8111-111111111112", revision_id: "22222222-2222-4222-8222-222222222223", provider_id: "33333333-3333-4333-8333-333333333334", feature_key: "chat", request_model: "draft-choice" },
  ], next_cursor: null })
  const projectEngine = createSessionEngine({ client: projectClient,
    storage: createMemoryStorage<ConversationStore>({ activeId: remembered, conversations: [{ id: remembered, title: "hidden history", mode: "thinking", updatedAt: 1000 }] }),
    scope: { kind: "project", projectRef },
  })
  const pageClients = await import("@/ui/shell/page-clients")
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(projectClient)
  window.localStorage.setItem("kokoro.web.auth-index-subject", "composer-draft-actor")
  window.history.replaceState({}, "", `/app/project/${projectRef}`)
  const props = { engine: projectEngine, chatHref: "/app", projectWorkspace: true, projectRef,
    projectReadBoundary: { admitted: true, subject: "composer-draft-actor", generation: 1 },
    ...(options.featureFlags === undefined ? {} : { featureFlags: options.featureFlags, navigation: [{ key: "mcp", label: "连接器" }] }),
    ...(options.workspace ? { emptyState: KokoroProjectWorkspace, workspaceCapabilities: { instructions: false, connectors: true, resources: false, skills: false, projectConversations: false } } : {}),
  }
  const frame = (next = props) => <ThemeProvider><LocaleProvider><AppFrame {...next} /></LocaleProvider></ThemeProvider>
  await waitFor(() => expect(projectEngine.getSnapshot().hydrating).toBe(false))
  await options.beforeRender?.({ projectEngine, projectClient })
  const view = render(frame())
  await waitFor(() => expect(document.querySelector('[data-composer-control="model"]')).toBeInTheDocument())
  return { projectEngine, projectClient, remembered, props, frame, view }
}

async function projectDraftMcpDirectory() {
  const clients = await import("@/ui/shell/page-clients")
  const hub = { ...createHubClient(),
    listMcpConnections: vi.fn().mockResolvedValue({ connections: ["a", "b"].map(id => ({
      connection_id: `connection:${id}`, connector_id: `connector:${id}`, server_id: `server:${id}`,
      provider_key: "project-draft", transport: "streamable_http", status: "active",
    })) }),
    getMcpConnector: vi.fn().mockImplementation(async id => ({ connector_id: id,
      server_id: `server:${id.slice("connector:".length)}`, provider_key: "project-draft", connector_type: "mcp",
      status: "active", enabled: true, availability: "available", state_version: "1", approved_scopes: [], display_name: `MCP ${id}`,
    })),
  }
  vi.spyOn(clients, "browserHubClient").mockReturnValue(hub)
  return hub
}

async function projectRecommendationFixture(hold = false) {
  const hub = await projectDraftMcpDirectory()
  hub.listMcpConnections.mockReset().mockImplementation(async (query: { cursor?: string }) => ({ connections: [query.cursor ? "b" : "a"].map(id => ({
    connection_id: `connection:${id}`, connector_id: `connector:${id}`, server_id: `server:${id}`,
    provider_key: id === "a" ? "alpha" : "beta", transport: "streamable_http", status: "active",
  })), ...(query.cursor ? {} : { next_cursor: "second" }) }))
  hub.getMcpConnector.mockImplementation(async (id: string) => ({ connector_id: id, server_id: `server:${id.slice("connector:".length)}`,
    provider_key: id.endsWith(":a") ? "alpha" : "beta", connector_type: "mcp", status: "active", enabled: true,
    availability: "available", state_version: "1", approved_scopes: [], display_name: `MCP ${id}` }))
  Object.assign(hub, { listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [
    { provider_key: "alpha", display_name: "Provider Alpha" }, { provider_key: "beta", display_name: "Provider Beta" },
  ], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) })
  const project = { id: "project_composer-draft", name: "Draft project", slug: "draft", description: "", created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" }
  const configuration = { project_id: project.id, recommendations: [{ kind: "provider", provider_key: "beta" }], state_version: "1" }
  const response = () => Response.json({ data: configuration }, { headers: { "cache-control": "no-store", "x-request-id": "recommendation-fixture" } })
  let finish!: (value: Response) => void
  const request = stubBusinessFetch(vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname
    if (path.endsWith("/mcp-recommendations")) {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { recommendations: typeof configuration.recommendations; expected_state_version: string }
        expect(body.expected_state_version).toBe(configuration.state_version)
        configuration.recommendations = body.recommendations; configuration.state_version = String(Number(configuration.state_version) + 1)
        return response()
      }
      return hold ? await new Promise<Response>(resolve => { finish = resolve }) : response()
    }
    if (path.endsWith("/instruction-revisions")) return Response.json({ data: { items: [] }, meta: { request_id: "read-fixture" } })
    return Response.json({ data: path === "/api/hub/projects" ? { projects: [project] } : { project }, meta: { request_id: "read-fixture" } })
  }))
  return { hub, request, finish: () => finish(response()) }
}

it("Project recommendations seed only the pristine root from the complete Connection directory before exact first Send", async () => {
  const { hub } = await projectRecommendationFixture()
  const { projectEngine, projectClient, view } = await mountRememberedProjectComposer({ featureFlags: [{ key: "workspace.connectors", enabled: true }] })
  try {
    await waitFor(() => expect(screen.getByRole("button", { name: "连接器 (1)" })).toBeVisible())
    expect(hub.listMcpConnections.mock.calls.some(call => call[0]?.cursor === "second")).toBe(true)
    expect(projectEngine.getSnapshot().selectedMcpConnectionIds).toEqual([])
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "send recommended beta" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(projectClient.createCalls[0]?.body.selected_mcp_connection_ids).toEqual(["connection:b"])
  } finally { view.unmount(); projectEngine.dispose() }
})

it("explicit manual empty Project MCP selection wins over a late recommendation response", async () => {
  const fixture = await projectRecommendationFixture(true)
  const { projectEngine, projectClient, view } = await mountRememberedProjectComposer({ featureFlags: [{ key: "workspace.connectors", enabled: true }] })
  try {
    await toggleProjectDraftMcp()
    await toggleProjectDraftMcp()
    await waitFor(() => expect(fixture.request.mock.calls.some(call => String(call[0]).endsWith("/mcp-recommendations"))).toBe(true))
    await act(async () => { fixture.finish(); await settle() })
    expect(screen.getByRole("button", { name: "连接器 (0)" })).toBeVisible()
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "explicitly no connector" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(projectClient.createCalls[0]?.body).not.toHaveProperty("selected_mcp_connection_ids")
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each([false, true])("saving actual Project recommendations updates only pristine root defaults (manually touched=%s)", async touched => {
  const fixture = await projectRecommendationFixture()
  const { projectEngine, projectClient, view } = await mountRememberedProjectComposer({ workspace: true })
  try {
    await waitFor(() => expect(screen.getByRole("button", { name: "连接器 (1)" })).toBeVisible())
    if (touched) await toggleProjectDraftMcp("b")
    const section = screen.getByRole("region", { name: "连接器" })
    fireEvent.click(within(section).getByRole("button", { name: "新增" }))
    const dialog = await screen.findByRole("dialog", { name: "推荐连接器" })
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Provider Beta" }))
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Provider Alpha" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "推荐连接器" })).toBeNull())
    expect(fixture.request.mock.calls.filter(call => String(call[0]).endsWith("/mcp-recommendations") && call[1]?.method === "PUT")).toHaveLength(1)
    expect(fixture.request.mock.calls.filter(call => String(call[0]).endsWith("/mcp-recommendations") && call[1]?.method === "GET")).toHaveLength(2)
    expect(within(section).getByText("Provider Alpha")).toBeVisible()
    expect(screen.getByRole("button", { name: `连接器 (${touched ? 0 : 1})` })).toBeVisible()
    expect(projectEngine.getSnapshot().selectedMcpConnectionIds).toEqual([])
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "send updated project default" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    if (touched) expect(projectClient.createCalls[0]?.body).not.toHaveProperty("selected_mcp_connection_ids")
    else expect(projectClient.createCalls[0]?.body.selected_mcp_connection_ids).toEqual(["connection:a"])
  } finally { view.unmount(); projectEngine.dispose() }
})

async function toggleProjectDraftMcp(id = "a") {
  fireEvent.click(screen.getByRole("button", { name: /^连接器 \(\d+\)$/ }))
  const choice = await screen.findByRole("switch", { name: `MCP connector:${id}` })
  fireEvent.click(choice)
  fireEvent.keyDown(choice, { key: "Escape" })
}

it.each([false, true])("project overview hands its exact local MCP IDs only to the fresh allocated message (unknown=%s)", async unknown => {
  await projectDraftMcpDirectory()
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer()
  const applications: { id: string | undefined; ids: readonly string[] }[] = []
  const original = projectEngine.setSelectedMcpConnectionIds
  const selection = vi.spyOn(projectEngine, "setSelectedMcpConnectionIds").mockImplementation(ids => {
    applications.push({ id: projectEngine.getSnapshot().store?.activeId, ids: [...ids] }); original(ids)
  })
  if (unknown) projectClient.nextCreate = () => Promise.reject(Error("unknown project MCP receipt"))
  try {
    await toggleProjectDraftMcp()
    const applicationsBeforeSend = selection.mock.calls.length
    expect(screen.getByRole("button", { name: "连接器 (1)" })).toBeVisible()
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "send exact project MCP draft" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    const first = structuredClone(projectClient.createCalls[0])
    expect(first?.sessionId).not.toBe(remembered)
    expect(first?.body.selected_mcp_connection_ids).toEqual(["connection:a"])
    expect(applicationsBeforeSend).toBe(0)
    expect(applications).toEqual([{ id: first?.sessionId, ids: ["connection:a"] }])
    if (unknown) {
      await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
      projectClient.nextCreate = () => Promise.resolve(makeReceipt("run_project_mcp_retry"))
      act(() => projectEngine.retry())
      await waitFor(() => expect(projectClient.createCalls).toHaveLength(2))
      expect(projectClient.createCalls[1]).toEqual(first)
    }
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each(["idle", "pending", "unknown", "active"] as const)("project overview MCP choices leave hidden %s selection and execution untouched", async state => {
  await projectDraftMcpDirectory()
  let selection: ReturnType<typeof vi.spyOn>
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer({ beforeRender: async ({ projectEngine, projectClient }) => {
    projectEngine.setSelectedMcpConnectionIds(["connection:b"])
    if (state === "pending") projectClient.nextCreate = () => new Promise(() => {})
    if (state === "unknown") projectClient.nextCreate = () => Promise.reject(Error("hidden MCP unknown"))
    if (state !== "idle") {
      projectEngine.submit("retained hidden MCP task")
      if (state === "unknown") await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
      if (state === "active") await waitFor(() => expect(projectClient.streams).toHaveLength(1))
    }
    selection = vi.spyOn(projectEngine, "setSelectedMcpConnectionIds")
  } })
  try {
    const before = projectEngine.getSnapshot(), calls = structuredClone(projectClient.createCalls)
    expect(screen.getByRole("button", { name: "连接器 (0)" })).toBeVisible()
    await toggleProjectDraftMcp()
    expect(selection!).not.toHaveBeenCalled()
    expect(projectEngine.getSnapshot().selectedMcpConnectionIds).toEqual(["connection:b"])
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(projectEngine.getSnapshot().machine).toEqual(before.machine)
    expect(projectEngine.getSnapshot().thread.messages).toEqual(before.thread.messages)
    expect(projectClient.createCalls).toEqual(calls)
  } finally { view.unmount(); projectEngine.dispose() }
})

it("project overview MCP draft survives rejected allocation and explicitly hands off a later cleared selection", async () => {
  await projectDraftMcpDirectory()
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer()
  const reset = vi.spyOn(projectEngine, "newConversation").mockImplementation(() => {})
  const original = projectEngine.setSelectedMcpConnectionIds
  const applications: { id: string | undefined; ids: readonly string[] }[] = []
  vi.spyOn(projectEngine, "setSelectedMcpConnectionIds").mockImplementation(ids => {
    applications.push({ id: projectEngine.getSnapshot().store?.activeId, ids: [...ids] }); original(ids)
  })
  try {
    await toggleProjectDraftMcp()
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "preserve MCP allocation intent" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    expect(projectClient.createCalls).toEqual([])
    expect(applications).toEqual([])
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(screen.getByRole("button", { name: "连接器 (1)" })).toBeVisible()
    await toggleProjectDraftMcp()
    reset.mockRestore()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(applications).toEqual([{ id: projectClient.createCalls[0]?.sessionId, ids: [] }])
    expect(projectClient.createCalls[0]?.body).not.toHaveProperty("selected_mcp_connection_ids")
  } finally { view.unmount(); projectEngine.dispose() }
})

it("project overview never hands MCP IDs to a draft whose route retires during fresh allocation", async () => {
  await projectDraftMcpDirectory()
  const { projectEngine, projectClient, view } = await mountRememberedProjectComposer()
  const allocate = projectEngine.newConversation
  vi.spyOn(projectEngine, "newConversation").mockImplementation(() => {
    allocate()
    window.history.pushState({}, "", "/app")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  const selection = vi.spyOn(projectEngine, "setSelectedMcpConnectionIds")
  try {
    await toggleProjectDraftMcp()
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "departed root intent" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await act(async () => { await settle() })
    expect(projectClient.createCalls).toEqual([])
    expect(selection).not.toHaveBeenCalled()
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each(["route", "actor", "generation", "project"] as const)("project overview local MCP draft retires on %s without allocating a conversation", async change => {
  await projectDraftMcpDirectory()
  const { projectEngine, projectClient, props, frame, view } = await mountRememberedProjectComposer()
  const reset = vi.spyOn(projectEngine, "newConversation")
  try {
    await toggleProjectDraftMcp()
    expect(screen.getByRole("button", { name: "连接器 (1)" })).toBeVisible()
    if (change === "route") {
      act(() => {
        window.history.pushState({}, "", "/app")
        window.dispatchEvent(new PopStateEvent("popstate"))
        window.history.pushState({}, "", `/app/project/${props.projectRef}`)
        window.dispatchEvent(new PopStateEvent("popstate"))
      })
    } else if (change === "project") {
      window.history.replaceState({}, "", "/app/project/project_next-draft")
      view.rerender(frame({ ...props, projectRef: "project_next-draft" }))
    } else {
      if (change === "actor") {
        window.localStorage.setItem("kokoro.web.auth-index-subject", "next-mcp-draft-actor")
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject" })))
      }
      view.rerender(frame({ ...props, projectReadBoundary: { admitted: true,
        subject: change === "actor" ? "next-mcp-draft-actor" : props.projectReadBoundary.subject, generation: 2 } }))
    }
    expect(screen.getByRole("button", { name: "连接器 (0)" })).toBeVisible()
    expect(reset).not.toHaveBeenCalled()
    expect(projectClient.createCalls).toEqual([])
  } finally { view.unmount(); projectEngine.dispose() }
})

it("project overview keeps its model draft local until its fresh conversation exists", async () => {
  const writes: { id: string | undefined; model: string | null }[] = []
  let model: ReturnType<typeof vi.spyOn>
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer({
    beforeRender: ({ projectEngine }) => {
      const setModel = projectEngine.setModel
      model = vi.spyOn(projectEngine, "setModel").mockImplementation(value => {
        writes.push({ id: projectEngine.getSnapshot().store?.activeId, model: value })
        setModel(value)
      })
    },
  })
  try {
    expect(model!).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模式/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /快速/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模型/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Draft choice/ }))
    expect(model!).not.toHaveBeenCalled()
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "allocate before applying draft model" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    const freshId = projectClient.createCalls[0]?.sessionId
    expect(freshId).toBeDefined()
    expect(writes[0]).toEqual({ id: freshId, model: "draft-choice" })
    expect(writes.every(write => write.id === freshId && write.model === "draft-choice")).toBe(true)
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each(["unknown", "active"] as const)("project overview model draft does not mutate hidden %s state on mount or choice", async state => {
  const writes: { id: string | undefined; model: string | null }[] = []
  let model: ReturnType<typeof vi.spyOn>
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer({
    beforeRender: async ({ projectEngine, projectClient }) => {
      if (state === "unknown") projectClient.nextCreate = () => Promise.reject(new Error("hidden unknown receipt"))
      expect(projectEngine.submit(`hidden ${state} execution`)).toBe(true)
      if (state === "unknown") await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
      else await waitFor(() => expect(projectClient.streams).toHaveLength(1))
      const setModel = projectEngine.setModel
      model = vi.spyOn(projectEngine, "setModel").mockImplementation(value => {
        writes.push({ id: projectEngine.getSnapshot().store?.activeId, model: value })
        setModel(value)
      })
    },
  })
  try {
    const before = projectEngine.getSnapshot()
    expect(model!).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模式/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /快速/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模型/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Draft choice/ }))
    expect(model!).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(projectEngine.getSnapshot().machine).toEqual(before.machine)
    expect(projectEngine.getSnapshot().thread.messages).toEqual(before.thread.messages)
    expect(projectClient.createCalls).toHaveLength(1)
  } finally { view.unmount(); projectEngine.dispose() }
})

it("project overview draft selectors are not locked by completed hidden history", async () => {
  const { projectEngine, view, remembered } = await mountRememberedProjectComposer()
  try {
    expect(projectEngine.getSnapshot().thread.messages).toHaveLength(1)
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(document.querySelector('[data-composer-control="model"]')).toBeEnabled()
    expect(document.querySelector('[data-composer-control="mode"]')).toBeEnabled()
    expect(screen.getByRole("button", { name: /切换模式/ })).toHaveTextContent("快速")
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each([false, true])("project overview draft choices do not mutate history and apply only after fresh allocation (unknown=%s)", async unknown => {
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer()
  const applications: (string | undefined)[] = []
  const setMode = projectEngine.setMode, setModel = projectEngine.setModel
  const mode = vi.spyOn(projectEngine, "setMode").mockImplementation(value => { applications.push(projectEngine.getSnapshot().store?.activeId); setMode(value) })
  const model = vi.spyOn(projectEngine, "setModel").mockImplementation(value => { applications.push(projectEngine.getSnapshot().store?.activeId); setModel(value) })
  const reset = vi.spyOn(projectEngine, "newConversation")
  if (unknown) projectClient.nextCreate = () => Promise.reject(new Error("unknown receipt"))
  try {
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模式/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /快速/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模型/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Draft choice/ }))
    expect(mode).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    const old = structuredClone(projectEngine.getSnapshot().store?.conversations.find(row => row.id === remembered))
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "new independent draft" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "对话输入" }), { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(projectClient.createCalls[0]).toMatchObject({ body: { thinking: false, model: "draft-choice" } })
    expect(projectEngine.getSnapshot().store?.conversations.find(row => row.id === projectClient.createCalls[0]?.sessionId)?.mode).toBe("fast")
    expect(screen.getByRole("button", { name: "模型：Draft choice（本轮锁定）" })).toBeDisabled()
    expect(projectClient.createCalls[0]?.sessionId).not.toBe(remembered)
    expect(projectEngine.getSnapshot().store?.conversations.find(row => row.id === remembered)).toEqual(old)
    expect(new URL(window.location.href).searchParams.get("conversation")).toBe(projectClient.createCalls[0]?.sessionId)
    expect(applications.length).toBeGreaterThanOrEqual(2)
    expect(applications.every(id => id === projectClient.createCalls[0]?.sessionId)).toBe(true)
    if (unknown) {
      await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
      const intent = structuredClone(projectClient.createCalls[0])
      projectClient.nextCreate = () => Promise.resolve(makeReceipt("run_draft_retry"))
      act(() => projectEngine.retry())
      await waitFor(() => expect(projectClient.createCalls).toHaveLength(2))
      expect(projectClient.createCalls[1]).toEqual(intent)
      expect(reset).toHaveBeenCalledOnce()
    }
  } finally { view.unmount(); projectEngine.dispose() }
})


it.each(["route", "actor", "generation"] as const)("project overview draft choices retire on %s without resetting hidden history", async change => {
  const { projectEngine, projectClient, remembered, props, frame, view } = await mountRememberedProjectComposer()
  const reset = vi.spyOn(projectEngine, "newConversation")
  try {
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模式/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /深度思考/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模型/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Draft choice/ }))
    expect(screen.getByRole("button", { name: /切换模型/ })).toHaveTextContent("Draft choice")
    if (change === "route") {
      act(() => {
        window.history.pushState({}, "", "/app")
        window.dispatchEvent(new PopStateEvent("popstate"))
        window.history.pushState({}, "", `/app/project/${props.projectRef}`)
        window.dispatchEvent(new PopStateEvent("popstate"))
      })
    } else {
      if (change === "actor") {
        window.localStorage.setItem("kokoro.web.auth-index-subject", "next-draft-actor")
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject" })))
      }
      view.rerender(frame({ ...props, projectReadBoundary: { admitted: true,
        subject: change === "actor" ? "next-draft-actor" : props.projectReadBoundary.subject, generation: 2 } }))
    }
    await waitFor(() => expect(screen.getByRole("button", { name: /切换模型/ })).toHaveTextContent("Draft default"))
    expect(screen.getByRole("button", { name: /切换模式/ })).toHaveTextContent("快速")
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(projectEngine.getSnapshot().store?.conversations.find(row => row.id === remembered)?.mode).toBe("thinking")
    expect(projectClient.createCalls).toEqual([])
    expect(reset).not.toHaveBeenCalled()
  } finally { view.unmount(); projectEngine.dispose() }
})

it.each(["pending", "unknown", "active"] as const)("project overview draft choices leave hidden %s execution untouched", async state => {
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer()
  if (state === "pending") projectClient.nextCreate = () => new Promise(() => {})
  if (state === "unknown") projectClient.nextCreate = () => Promise.reject(new Error("hidden unknown receipt"))
  try {
    act(() => { projectEngine.submit("original hidden execution") })
    if (state === "unknown") await waitFor(() => expect(projectEngine.getSnapshot().canRetryPendingSubmission).toBe(true))
    if (state === "active") await waitFor(() => expect(projectClient.streams).toHaveLength(1))
    const before = projectEngine.getSnapshot()
    const calls = structuredClone(projectClient.createCalls)
    const mode = vi.spyOn(projectEngine, "setMode"), model = vi.spyOn(projectEngine, "setModel")
    const reset = vi.spyOn(projectEngine, "newConversation"), cancel = vi.spyOn(projectEngine, "cancelRun")
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模式/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /快速/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模型/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Draft choice/ }))
    expect(mode).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(projectEngine.getSnapshot().machine).toEqual(before.machine)
    expect(projectEngine.getSnapshot().thread.messages).toEqual(before.thread.messages)
    expect(projectClient.createCalls).toEqual(calls)
    expect(window.location.search).toBe("")
  } finally { view.unmount(); projectEngine.dispose() }
})

it("project overview rejected fresh allocation preserves its draft choices and hidden history", async () => {
  const { projectEngine, projectClient, remembered, view } = await mountRememberedProjectComposer()
  const reset = vi.spyOn(projectEngine, "newConversation").mockImplementation(() => {})
  try {
    fireEvent.pointerDown(screen.getByRole("button", { name: /切换模型/ }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Draft choice/ }))
    const mode = vi.spyOn(projectEngine, "setMode"), model = vi.spyOn(projectEngine, "setModel")
    const composer = screen.getByRole("textbox", { name: "对话输入" })
    fireEvent.change(composer, { target: { value: "preserve this draft" } })
    fireEvent.keyDown(composer, { key: "Enter" })
    expect(projectClient.createCalls).toEqual([])
    expect(mode).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
    expect(composer).toHaveValue("preserve this draft")
    expect(screen.getByRole("button", { name: /切换模型/ })).toHaveTextContent("Draft choice")
    expect(projectEngine.getSnapshot().store?.activeId).toBe(remembered)
    expect(window.location.search).toBe("")
    reset.mockRestore()
    fireEvent.keyDown(composer, { key: "Enter" })
    await waitFor(() => expect(projectClient.createCalls).toHaveLength(1))
    expect(projectClient.createCalls[0]?.body.model).toBe("draft-choice")
    expect(projectClient.createCalls[0]?.sessionId).not.toBe(remembered)
  } finally { view.unmount(); projectEngine.dispose() }
})

it("visible parts committed engine hook binds exact Project route and synchronously aborts on leaving", async () => {
  const { useAppFrameEngine } = await import("@/components/blocks/app-frame/use-app-frame-engine")
  const projectRef = "hook-visible-parts", scope = { kind: "project" as const, projectRef }, local = createFakeClient()
  local.nextSnapshot = async () => makeSnapshot({ sessionId: "s", messages: [{ message_id: "m", role: "assistant", run_id: "r", content: null, status: "completed", created_at: "now", rendering: { mode: "ordered", format_version: 1, revision: "1", event_watermark: null, parts_cursor: "initial" } }] })
  let late!: (page: Awaited<ReturnType<typeof local.fetchMessageParts>>) => void
  local.nextParts = () => new Promise(resolve => { late = resolve })
  const actual = createSessionEngine({ client: local, scope, storage: createMemoryStorage<ConversationStore>(addConversation(null, "s", 1)), messagePartsReadTarget: null })
  window.history.replaceState(null, "", `/app/project/${projectRef}`)
  const view = renderHook(() => useAppFrameEngine({ injectedEngine: actual, preview: false, projectRef }))
  try {
    await settle()
    expect(local.partsCalls).toHaveLength(0)
    act(() => { window.history.pushState(null, "", `/app/project/${projectRef}?conversation=s`); window.dispatchEvent(new PopStateEvent("popstate")) })
    await waitFor(() => expect(local.partsCalls).toHaveLength(1))
    act(() => {
      window.history.pushState(null, "", `/app/project/${projectRef}`); window.dispatchEvent(new Event("kokoro:surface-navigation"))
      expect(local.partsCalls[0]?.signal.aborted).toBe(true)
    })
    await act(async () => { late({ session_id: "s", message_id: "m", run_id: "r", format_version: 1, revision: "1", event_watermark: null, next_cursor: null, items: [] }) })
    expect(actual.getSnapshot().thread.messageParts?.m?.status).not.toBe("complete")
    act(() => { window.history.pushState(null, "", "/app/project/other?conversation=s"); window.dispatchEvent(new PopStateEvent("popstate")) })
    await settle()
    expect(local.partsCalls).toHaveLength(1)
    expect(actual.getSnapshot().store?.activeId).toBe("s")
    expect(local.createCalls).toHaveLength(0)
    expect(local.controlCalls).toHaveLength(0)
  } finally { view.unmount(); actual.dispose(); window.history.replaceState(null, "", "/app") }
})

it("the mounted frame only reads models when its trusted Composer becomes active", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "catalog-frame")
  const calls: string[] = []
  stubBusinessFetch(vi.fn(async input => {
    const path = new URL(String(input), window.location.origin).pathname
    calls.push(path)
    if (path.endsWith("/models")) return Response.json({ models: [], next_cursor: null })
    return Response.json({ sessions: [], next_cursor: null })
  }))
  const frame = (standaloneSurface: boolean, admitted: boolean) => <ThemeProvider><LocaleProvider><AppFrame
    engine={engine} chatHref="/app" standaloneSurface={standaloneSurface}
    projectReadBoundary={{ admitted, subject: "catalog-frame", generation: 1 }}
  /></LocaleProvider></ThemeProvider>
  const view = render(frame(true, true))
  await act(async () => { await settle() })
  expect(calls.filter(path => path.endsWith("/models"))).toHaveLength(0)
  view.rerender(frame(false, false))
  await act(async () => { await settle() })
  expect(calls.filter(path => path.endsWith("/models"))).toHaveLength(0)
  view.rerender(frame(false, true))
  await act(async () => { await settle() })
  expect(calls.filter(path => path.endsWith("/models"))).toHaveLength(1)
})

it("desktop action inspection carries the admitted reader through the actual AppFrame shell", async () => {
  const sessionId = "conv_action_inspection", runId = "run_action_inspection"
  const activityId = `act_${"a".repeat(64)}`
  window.localStorage.setItem("kokoro.web.auth-index-subject", "inspection-actor")
  window.history.replaceState({}, "", `/app?conversation=${sessionId}`)
  pathname.value = "/app"
  client.nextSnapshot = async () => makeSnapshot({ sessionId, activeRun: { run_id: runId, status: "running" }, messages: [{ message_id: "inspect-user", role: "user", content: "inspect original tool", status: "completed", created_at: "2026-07-02T00:00:00Z" }] })
  const readDisplay = vi.fn((url: string) => {
    expect(url).toBe(`http://s.local/sessions/${sessionId}/runs/${runId}/display`)
    return Response.json({ run_id: runId, display_skills: [], tool_paths: [], tool_facts: [], activity_details: [{
    activity_id: activityId, tool_name: "mcp_call", target: { kind: "mcp_tool", name: "ask_wiki_question" },
    input_preview: { text: "original request arguments", truncated: false, redacted: false },
    output_preview: { text: "original response evidence", truncated: false, redacted: false },
  }] }) })
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input)
    return url.endsWith(`/runs/${runId}/display`) ? readDisplay(url) : Response.json({}, { status: 503 })
  })
  await act(async () => { engine.openConversation(sessionId); await settle() })
  mountFrame({ preview: false, projectReadBoundary: { admitted: true, subject: "inspection-actor", generation: 1 } })
  await waitFor(() => expect(client.streams.length).toBeGreaterThan(0))
  await act(async () => {
    client.lastStream().emit([
      makeEvent("run.created", { run_id: runId }, { run_id: runId, session_id: sessionId }),
      makeEvent("activity.updated", { activity: "tool", activity_id: activityId, segment_id: `seg_${"b".repeat(64)}`, display_code: "tool.mcp.call", status: "completed" }, { run_id: runId, session_id: sessionId }),
    ])
    await settle()
  })
  fireEvent.click(await screen.findByRole("button", { name: /调用 MCP 工具/ }))
  const inspector = await screen.findByRole("heading", { name: "动作详情" })
  expect(inspector).toBeVisible()
  expect(await screen.findByText("original request arguments")).toBeVisible()
  expect(screen.getByText("original response evidence")).toBeVisible()
  expect(readDisplay).toHaveBeenCalledOnce()
})
