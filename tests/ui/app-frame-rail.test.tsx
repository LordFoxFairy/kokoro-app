import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { StrictMode, useState } from "react"

const pathname = vi.hoisted(() => ({ value: "/app" }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }))

import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { useCatalogSkillInstallation } from "@/features/app/use-catalog-skill-installation"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { SkillsSettingsSection } from "@/ui/settings/sections/skills-settings-section"
import { createHubClient } from "@/hub/client"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"
import { SkillCatalogDialog, type CatalogDetailProjection } from "@/ui/skills/skills-catalog-dialog"
import { createManusSkillHubClient } from "@/ui/skills/manus-skill-client"
import { useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { createSessionClient, SessionClientError } from "@/engine/client"
import type { ConversationStore } from "@/core/conversations"
import { makeSnapshot } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, makeReceipt, type FakeClient } from "../engine/fakes"

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
    const compactWidth = query.includes("max-width: 768px")
    const mobileWidth = query.includes("max-width: 767px")
    return {
      matches: finePointer
        ? pointer === "fine" && compactWidth && desktopViewportWidth <= 768
        : coarsePointer
          ? pointer === "coarse" && mobileWidth && desktopViewportWidth <= 767
          : false,
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

it("桌面 shell 发布唯一 280/52 轨道契约和 rail seam", () => {
  setDesktopViewport(1280)
  mountFrame({ desktopRailCollapsed: true })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
  expect(shell).not.toBeNull()
  expect(shell).toHaveStyle({
    "--sidebar-width": "280px",
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

it("768px 细指针桌面隐藏 Rail，展开后 seam 和焦点入口同步恢复", async () => {
  setDesktopViewport(768)
  mountFrame({ desktopRailCollapsed: true })

  const shell = document.querySelector('[data-slot="sidebar-wrapper"]')
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
    expect(shell).toHaveStyle({ "--rail-seam-width": "280px" })
    expect(shell?.querySelector('[data-seam="rail"]')).toBeNull()
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement)
  })
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
  setDesktopViewport(768)
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
  setDesktopViewport(768)
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
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }), { detail: 0 })
  return { ...view, fetchMock }
}

it.each(["401", "bad-shape"])("正式列表先健康再刷新至 %s，清旧项目且不伪装为空集合", async (failure) => {
  let calls = 0
  await mountAuthenticatedProjectRail(async () => {
    calls++
    return calls === 1 ? projectReadEnvelope() : failure === "401"
      ? Response.json({ error: { code: "unauthenticated" } }, { status: 401 })
      : Response.json({ data: { projects: [{ id: "broken" }] }, meta: { request_id: "req_broken" } })
  })
  await screen.findByRole("link", { name: "新对话 · 研究项目甲" })
  expect(calls).toBe(1)
  act(() => window.dispatchEvent(new Event("focus")))
  await screen.findByTestId("projects-error")
  expect(calls).toBe(2)
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目甲" })).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "新对话 · 研究项目乙" })).not.toBeInTheDocument()
  expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
  expect(document.querySelectorAll("[data-project-list] [data-project-id]")).toHaveLength(0)
  const retry = screen.getByTestId("projects-error").querySelector("button")
  if (failure === "401") expect(retry).toBeDisabled()
  else expect(retry).toBeEnabled()
})

it("只有成功读取 projects=[] 才呈现项目空态", async () => {
  let calls = 0
  await mountAuthenticatedProjectRail(async () => { calls++; return projectReadEnvelope([]) })
  expect(await screen.findByTestId("projects-empty")).toHaveTextContent("暂无项目。")
  expect(calls).toBe(1)
  expect(screen.queryByTestId("projects-error")).not.toBeInTheDocument()
  expect(document.querySelectorAll("[data-project-list] [data-project-id]")).toHaveLength(0)
})

it("同 subject 重核验开始就清空并取消旧读取，迟到响应不能复活项目或重挂 Chat", async () => {
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
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(calls).toBe(2))
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
      fireEvent.click(group().getByRole("button", { name: "重命名会话 项目原题" }))
      const input = group().getByRole("textbox")
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
    fireEvent.click(screen.getByTestId("rail-new-conversation"))
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


function mountProjectSubmitBoundary(projectEngine: SessionEngine, projectRef: string, conversation: string | null = null) {
  const clearDraft = vi.fn()
  const syncConversationUrl = vi.fn()
  const setConversationRouteId = vi.fn()
  const options = {
    engine: projectEngine, projectWorkspace: true, projectRef, routedConversationId: conversation,
    standaloneSurface: false, chatHref: "/app", activeId: projectEngine.getSnapshot().store?.activeId ?? null,
    draft: "new root intent", clearDraft, updateDraft: vi.fn(), setDeploymentIntent: vi.fn(),
    syncConversationUrl, setConversationRouteId,
    focusComposer: vi.fn(), closeSettings: vi.fn(), brandName: "Kokoro", commandNewChatTimerRef: { current: null },
  }
  const view = renderHook(() => useAppFrameActions(options), { wrapper: LocaleProvider })
  return { ...view, clearDraft, syncConversationUrl, setConversationRouteId }
}

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
  projectEngine.setMode("thinking")
  const view = render(<ThemeProvider><LocaleProvider><AppFrame engine={projectEngine} chatHref="/app" projectWorkspace projectRef={projectRef} /></LocaleProvider></ThemeProvider>)
  try {
    expect(projectEngine.getSnapshot().store?.conversations.find(entry => entry.id === remembered)?.mode).toBe("thinking")
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
    const row = await screen.findByRole("button", { name: "移动会话 记忆会话" })
    fireEvent.click(row)
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
  await screen.findByRole("button", { name: "重试" })
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
    if (path.endsWith("GetSkill")) return response({ skill: { id: "settings-intent-series", version: "settings-intent-revision", displayName: "Intent match", description: round === 1 ? "Retired detail facts" : "New detail facts" }, downloadInfo: { downloadUrl: "/api/skill-downloads/settings-intent", filename: "fixture.zip", expiresAt: "2028-01-01T00:00:00Z" } })
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
  const count = calls.length
  round = 2
  view.rerender(content(false, "settings-intent-actor", 2))
  expect(screen.getByRole("searchbox", { hidden: true, name: "搜索技能" })).toBe(search)
  expect(search).toHaveValue("needle")
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByText("Retired detail facts")).toBeNull()
  expect(screen.queryByText("Retired catalog facts")).toBeNull()
  await act(async () => { await Promise.resolve() })
  expect(calls).toHaveLength(count)
  view.rerender(content(true, "settings-intent-actor", 2))
  await within(dialog).findByRole("alert")
  expect(screen.queryByText("Retired detail facts")).toBeNull()
  fireEvent.click(within(dialog).getByRole("button", { name: "重试" }))
  await within(dialog).findByText("New detail facts")
  expect(calls.at(-1)).toMatchObject({ query: "needle", tag: "SKILL_HUB_TAG_CODING" })
  expect(screen.getByRole("dialog")).toBe(dialog)
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  await waitFor(() => expect(search).toHaveFocus())
  fireEvent.click(screen.getByRole("button", { name: "查看详情 Intent match" }))
  await within(screen.getByRole("dialog")).findByText("New detail facts")
  view.rerender(content(true, "settings-other-actor", 3))
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
      return response({ skill: { id: "exact-settings-series", version: "chosen-revision", displayName: "chosen-revision", description: `Exact facts ${round}` }, downloadInfo: { downloadUrl: "/api/skill-downloads/settings-exact", filename: "fixture.zip", expiresAt: "2028-01-01T00:00:00Z" } })
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

it("retires Settings cursor reads on filter changes and can retry the current page without late results", async () => {
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
  fireEvent.click(await screen.findByRole("button", { name: "重试" }))
  await screen.findByRole("button", { name: "查看详情 coding-second" })
  await act(async () => { releaseOld(response({ skills: [card("late-old-page")], tagOptions: {} })) })
  expect(screen.queryByRole("button", { name: "查看详情 late-old-page" })).toBeNull()
  expect(codingAttempts).toBe(2)
})

it("shows a failed Settings filter read and retries it instead of turning the previous page into a successful empty result", async () => {
  observeSettingsCatalogPages()
  let attempts = 0
  const response = (data: unknown) => Response.json(data, { headers: { "cache-control": "private, no-store", "x-request-id": "req-settings-retry" } })
  const card = (id: string) => ({ skillId: id, displayName: id, currentVersion: { versionUid: `${id}-revision` } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.includes("/self/skill-installations")) return response({ data: [] })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      const body = JSON.parse(String(init?.body))
      if (body.query === "offline" && ++attempts === 1) throw Error("Transient catalog read failure")
      return response({ skills: [card(body.query ? "Recovered indexed match" : "Initial retained page")], tagOptions: {} })
    }
    throw Error("Unexpected settings request")
  })
  mountSettingsCatalog()
  await screen.findByRole("button", { name: "查看详情 Initial retained page" })
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "offline" } })
  await screen.findByRole("alert")
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  await screen.findByRole("button", { name: "查看详情 Recovered indexed match" })
  expect(screen.queryByRole("alert")).toBeNull()
  expect(attempts).toBe(2)
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
    if (path.endsWith("GetSkill")) return response({ skill: { id: "series-recheck", version: "revision-recheck", displayName: "Private title", description: round === 1 ? "Private facts" : "Fresh facts" }, downloadInfo: { downloadUrl: "/api/skill-downloads/recheck", filename: "fixture.zip", expiresAt: "2028-01-01T00:00:00Z" } })
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
    if (path.endsWith("GetSkill")) return response({ skill: { id: "paged-series", version: "paged-revision", displayName: "Paged skill", description: "Private page-two detail" }, downloadInfo: { downloadUrl: "/api/skill-downloads/paged", filename: "paged.zip", expiresAt: "2028-01-01T00:00:00Z" } })
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
  await within(dialog).findByRole("alert")
  fireEvent.click(within(dialog).getByRole("button", { name: "加载更多" }))
  await waitFor(() => expect(cursorCalls).toEqual(["old-next", "current-next", "current-next"]))
  if (changed) {
    await within(dialog).findByRole("alert")
    expect(within(dialog).queryByRole("heading", { name: "Paged skill" })).toBeNull()
    expect(within(dialog).queryByText("Private page-two detail")).toBeNull()
  } else await within(dialog).findByRole("heading", { name: "Paged skill" })
  expect(screen.getByRole("dialog")).toBe(dialog)
})


it.each(["network", "retired"])("unknown share survives same actor recheck without an implicit second command (%s)", async kind => {
  const writes = vi.fn(async () => {
    if (kind === "network") throw Error("unknown network result")
    return new Promise<Response>(() => undefined)
  })
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("/skill-shares")) return writes()
    return Response.json({ skill: { id: "trial-series", version: "trial-version", displayName: "Owner trial", description: "Owner facts" }, downloadInfo: { downloadUrl: "/api/skill-downloads/trial", filename: "fixture.zip", expiresAt: "2028-01-01T00:00:00Z" } })
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
