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

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
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

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
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

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
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

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
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

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
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

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toHaveAttribute("data-conversation-list", "direct")

  expect(screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')).toBe(shell)
  expect(shell).toHaveAttribute("data-rail-collapsed", "true")
  expect(shell?.querySelectorAll('[data-slot="sidebar-container"]')).toHaveLength(1)
})
