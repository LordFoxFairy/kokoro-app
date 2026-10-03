import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const pathname = vi.hoisted(() => ({ value: "/app" }))

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }))

import { AppFrame } from "@/components/blocks/app-frame/app-frame"
import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { createSessionEngine, type SessionEngine } from "@/engine/machine"
import type { ConversationStore } from "@/core/conversations"
import { createFakeClient, createMemoryStorage, type FakeClient } from "../engine/fakes"

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

function setDesktopViewport(width: number) {
  desktopViewportWidth = width
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true })
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const finePointer = query.includes("pointer: fine")
    const coarsePointer = query.includes("pointer: coarse")
    const compactWidth = query.includes("max-width: 768px")
    const mobileWidth = query.includes("max-width: 767px")
    return {
      matches: finePointer
        ? compactWidth && desktopViewportWidth <= 768
        : coarsePointer
          ? mobileWidth && desktopViewportWidth <= 767
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

beforeEach(() => {
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

it("桌面 shell 发布唯一 300/52 轨道契约和 rail seam", () => {
  setDesktopViewport(1280)
  mountFrame({ desktopRailCollapsed: true })

  const shell = screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')
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
  fireEvent.click(screen.getByRole("button", { name: "搜索会话" }), { detail: 0 })
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

  const shell = screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')
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
    const separator = shell?.querySelector('[data-seam="rail"]')
    expect(separator).not.toBeNull()
    expect(separator).toHaveAttribute("data-seam-visible", "true")
    expect(separator).not.toHaveAttribute("aria-hidden")
    expect(separator).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveFocus()
  })
})

it("隐藏共享 Header 的独立 Web 页面仍保留唯一导航入口", async () => {
  setDesktopViewport(768)
  mountFrame({ hideWorkspaceHeader: true, standaloneSurface: true })

  const shell = screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-hidden", "true")
    expect(shell?.querySelectorAll('[data-web-navigation-trigger="true"]')).toHaveLength(1)
  })

  fireEvent.click(shell?.querySelector('[data-web-navigation-trigger="true"]') as HTMLElement)
  await waitFor(() => {
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(shell?.querySelector('[data-web-navigation-trigger="true"][aria-label="收起侧栏"]')).toBeInTheDocument()
  })
})

it("窄桌面临时展开不覆盖宽桌面的 Sidebar cookie 偏好", async () => {
  document.cookie = "sidebar_state=false; path=/"
  expect(document.cookie).toContain("sidebar_state=false")
  setDesktopViewport(768)
  mountFrame({ desktopRailCollapsed: true })

  const shell = screen.getByTestId("rail-new-conversation").closest('[data-slot="sidebar-wrapper"]')
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
    expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveFocus()
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

it("正式壳没有项目身份时不生成默认 kokoro 专案链接", () => {
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
        expires_at: "2027-01-01T00:00:00.000Z",
      })
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
  session: () => Promise<Response> = async () => Response.json({ authenticated: true, subject: "project-reader" }),
) {
  const pageClients = await import("@/ui/shell/page-clients")
  const { AppGate } = await import("@/ui/auth/app-gate")
  vi.spyOn(pageClients, "browserEngine").mockReturnValue(engine)
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, window.location.origin).pathname
    if (path === "/api/auth/session") return session()
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

it("只有成功读取 projects=[] 才呈现专案空态", async () => {
  let calls = 0
  await mountAuthenticatedProjectRail(async () => { calls++; return projectReadEnvelope([]) })
  expect(await screen.findByTestId("projects-empty")).toHaveTextContent("暂无专案。")
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
    const trigger = screen.getByRole("button", { name: "新建专案" })
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("menuitem", { name: "新建专案" }))
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
