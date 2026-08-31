import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

function mountFrame(props: Partial<React.ComponentProps<typeof AppFrame>> = {}) {
  render(
    <ThemeProvider>
      <LocaleProvider>
        <AppFrame engine={engine} chatHref="/app" {...props} />
      </LocaleProvider>
    </ThemeProvider>,
  )
}

function setFinePointerMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes("max-width: 768px") && query.includes("pointer: fine"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  pathname.value = "/app"
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
  vi.restoreAllMocks()
})

it("桌面 shell 发布唯一 300/52 轨道契约和 rail seam", () => {
  mountFrame({ desktopRailCollapsed: false })

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
  expect(shell).not.toBeNull()
  expect(shell).toHaveStyle({
    "--sidebar-width": "300px",
    "--sidebar-width-icon": "52px",
    "--rail-seam-width": "300px",
  })
  expect(shell?.querySelectorAll('[data-seam="rail"]')).toHaveLength(1)
  expect(shell?.querySelectorAll('[data-slot="sidebar-container"]')).toHaveLength(1)
})

it("768px 以下的细指针桌面隐藏 Rail，展开后 seam 和键盘调整入口同步恢复", async () => {
  setFinePointerMedia(true)
  mountFrame()

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "true")
    expect(shell).toHaveAttribute("data-rail-hidden", "true")
    expect(shell).toHaveStyle({ "--rail-seam-width": "52px" })
    expect(shell?.querySelector('[data-seam="rail"]')).toBeNull()
    expect(shell?.querySelectorAll('[data-web-navigation-trigger="true"]')).toHaveLength(1)
  })

  fireEvent.click(shell?.querySelector('[data-web-navigation-trigger="true"]') as HTMLElement)
  await waitFor(() => {
    expect(shell).toHaveAttribute("data-rail-collapsed", "false")
    expect(shell).not.toHaveAttribute("data-rail-hidden")
    expect(shell).toHaveStyle({ "--rail-seam-width": "300px" })
    const separator = shell?.querySelector('[data-seam="rail"]')
    expect(separator).not.toBeNull()
    expect(separator).not.toHaveAttribute("aria-hidden")
    expect(separator).toHaveAttribute("tabindex", "0")
  })
})

it("隐藏共享 Header 的独立 Web 页面仍保留唯一导航入口", async () => {
  setFinePointerMedia(true)
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

it("桌面直接会话使用 scoped inbox，不复制 primary rail stop", () => {
  mountFrame({ desktopRailCollapsed: true })

  const shell = screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')
  expect(screen.queryByTestId("rail-direct-chat")).toBeNull()
  expect(screen.getByRole("navigation", { name: "直接会话" })).toHaveAttribute("data-conversation-list", "direct")

  expect(screen.getByTestId("rail-new-task").closest('[data-slot="sidebar-wrapper"]')).toBe(shell)
  expect(shell).toHaveAttribute("data-rail-collapsed", "true")
  expect(shell?.querySelectorAll('[data-slot="sidebar-container"]')).toHaveLength(1)
})
