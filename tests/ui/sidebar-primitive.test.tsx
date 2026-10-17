import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar"
import { WorkspaceNavigationTrigger } from "@/components/blocks/workspace-header/workspace-header"
import { LocaleProvider } from "@/i18n/context"

const originalInnerWidth = window.innerWidth
const originalMatchMedia = window.matchMedia

function setViewport(width: number) {
  const listeners = new Set<() => void>()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true })
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(width < 768px)" && window.innerWidth < 768,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    }),
  })
  return listeners
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth })
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia })
})

it("can keep compact desktop toggles out of the wide-layout preference cookie", () => {
  document.cookie = "sidebar_state=; Max-Age=0; path=/"
  render(
    <SidebarProvider persistOpenState={false}>
      <SidebarTrigger aria-label="打开导航" />
      <Sidebar><div>导航内容</div></Sidebar>
    </SidebarProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "打开导航" }))

  expect(document.cookie).not.toContain("sidebar_state=")
})

it("SidebarRail 继承调用方标签并同步 tooltip title", () => {
  render(
    <SidebarProvider>
      <Sidebar>
        <SidebarRail aria-label="调整侧栏宽度" />
      </Sidebar>
    </SidebarProvider>,
  )

  const rail = screen.getByRole("button", { name: "调整侧栏宽度" })
  expect(rail).toHaveAttribute("title", "调整侧栏宽度")
  expect(rail).toHaveAttribute("type", "button")
})

it.each([false, true])("mobile navigation reports drawer state instead of desktop expansion (expanded=%s)", async (expanded) => {
  setViewport(412)
  render(
    <LocaleProvider>
      <SidebarProvider defaultOpen={expanded}>
        <WorkspaceNavigationTrigger expanded={expanded} />
        <Sidebar><div>Mobile navigation</div></Sidebar>
      </SidebarProvider>
    </LocaleProvider>,
  )

  const trigger = screen.getByRole("button")
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  const openLabel = trigger.getAttribute("aria-label")
  fireEvent.click(trigger)
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  expect(trigger.getAttribute("aria-label")).not.toBe(openLabel)

  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  expect(trigger).toHaveAttribute("aria-label", openLabel)
})

it("跨越移动断点后不会在返回移动端时重新打开旧导航抽屉", async () => {
  const listeners = setViewport(700)

  render(
    <SidebarProvider>
      <SidebarTrigger aria-label="打开导航" />
      <Sidebar><div>导航内容</div></Sidebar>
    </SidebarProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "打开导航" }))
  expect(screen.getByRole("dialog")).toBeInTheDocument()

  window.innerWidth = 800
  listeners.forEach((listener) => listener())
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

  window.innerWidth = 700
  listeners.forEach((listener) => listener())
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
})
