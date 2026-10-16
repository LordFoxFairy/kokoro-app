import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { StrictMode } from "react"

const pathname = vi.hoisted(() => ({ value: "/app" }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }))

import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { useAppFrameActions } from "@/components/blocks/app-frame/use-app-frame-actions"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import { createSessionClient } from "@/engine/client"
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

  const alpha = await screen.findByRole("link", { name: "研究项目甲" })
  const beta = screen.getByRole("link", { name: "研究项目乙" })
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
  await screen.findByRole("link", { name: "研究项目甲" })
  expect(calls).toBe(1)
  act(() => window.dispatchEvent(new Event("focus")))
  await screen.findByTestId("projects-error")
  expect(calls).toBe(2)
  expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "研究项目乙" })).not.toBeInTheDocument()
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
  await screen.findByRole("link", { name: "研究项目甲" })
  const composer = screen.getByRole("textbox", { name: "对话输入" })
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(calls).toBe(2))
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(checks).toBe(3))
  expect(signals[1]?.aborted).toBe(true)
  expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
  expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
  await act(async () => { resolveOld(projectReadEnvelope()); await Promise.resolve() })
  expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
  await act(async () => { resolveSession(Response.json({ authenticated: true, subject: "project-reader" })) })
  await screen.findByRole("link", { name: "研究项目乙" })
  expect(calls).toBe(3)
  expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
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
  await screen.findByRole("link", { name: "研究项目甲" })
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
  expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
  view.rerender(frame(false))
  await screen.findByRole("link", { name: "研究项目甲" })
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
    expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("projects-empty")).not.toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe("/app/project/project_read_alpha"))
    await waitFor(() => expect(screen.getByRole("textbox", { name: "对话输入" })).toHaveValue("保持创建时的草稿"))
    await act(async () => { resolveRefresh(projectReadEnvelope()) })
    await screen.findByRole("link", { name: "研究项目甲" })
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
  await screen.findByRole("link", { name: "研究项目甲" })
  act(() => window.dispatchEvent(new Event("focus")))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("暂时无法确认登录状态"))
  expect(screen.getByRole("textbox", { name: "对话输入" })).toBeInTheDocument()
  expect(checks).toBe(2)
  expect(reads).toBe(1)
  expect(screen.queryByRole("link", { name: "研究项目甲" })).not.toBeInTheDocument()
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
    await screen.findByRole("link", { name: "研究项目乙" })
    fireEvent.change(screen.getByRole("textbox", { name: "对话输入" }), { target: { value: "创建时A的原草稿" } })
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }))
    const dialog = await screen.findByRole("dialog", { name: "创建项目" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "项目名称" }), { target: { value: "研究项目甲" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }))
    await waitFor(() => expect(writes).toBe(1))
    expect(acknowledge).toBeTypeOf("function")
    fireEvent.click(await screen.findByRole("link", { name: "研究项目乙" }), { detail: 0 })
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
    conversations: { conversations: [], loading: false, loadingMore: false, error: false, refresh: vi.fn(), hasMore: false, loadMore: vi.fn(), selectConversation: vi.fn(), deleteConversation: async () => true, renameConversation: vi.fn(), startNewChat: vi.fn() },
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
    const project = await screen.findByRole("link", { name: alpha.name })
    const projectRow = project.closest("[data-project-id]")
    expect(projectRow?.querySelector('button[aria-label*="展开项目"], button[aria-label*="收起项目"]')).not.toBeNull()
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
    await screen.findByRole("link", { name: "项目Q" })
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
