import type { ComponentProps, ReactNode } from "react"

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { children: ReactNode; prefetch?: boolean | "auto" | null }) => (
    <a {...props} data-next-prefetch={prefetch === false ? "disabled" : "enabled"}>{children}</a>
  ),
}))

import { LocaleProvider } from "@/i18n/context"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { interceptMountedSurfaceNavigation } from "@/ui/navigation/mounted-surface-navigation"

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(cleanup)

it("same-shell rail links disable Next prefetch because clicks are history-projected", () => {
  render(
    <ThemeProvider>
      <LocaleProvider>
        <WorkspaceRail
          collapsed={false}
          onToggleCollapse={() => {}}
          onNewChat={() => {}}
          chatHref="/app"
          projectHref="/app/project/kokoro"
          navigation={[
            { key: "agent", label: "Agent" },
            { key: "skills", label: "技能" },
            { key: "mcp", label: "外挂" },
            { key: "scheduled", label: "已排程" },
            { key: "library", label: "资料库" },
          ]}
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

  const shellLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/app"))
  expect(shellLinks.length).toBeGreaterThan(0)
  for (const link of shellLinks) {
    expect(link).toHaveAttribute("data-next-prefetch", "disabled")
  }
})

it("ordinary same-shell clicks commit one history entry and one projection event", () => {
  window.history.replaceState(null, "", "/app")
  const pushState = vi.spyOn(window.history, "pushState")
  const projection = vi.fn()
  window.addEventListener("kokoro:surface-navigation", projection)
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
  }

  interceptMountedSurfaceNavigation(event, "/app/agents")

  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(pushState).toHaveBeenCalledOnce()
  expect(projection).toHaveBeenCalledOnce()
  expect(window.location.pathname).toBe("/app/agents")
  window.removeEventListener("kokoro:surface-navigation", projection)
  pushState.mockRestore()
})
