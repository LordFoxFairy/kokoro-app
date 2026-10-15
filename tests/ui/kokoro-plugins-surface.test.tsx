import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { EmptyStateProps } from "@/components/blocks/app-frame/app-frame"
import { LocaleProvider } from "@/i18n/context"
import { KokoroPluginsSurface } from "@/features/app/kokoro-plugins-surface"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

const projection = vi.fn(({
  identity,
  initialView,
}: {
  identity: string
  initialView?: "catalog" | "connections"
}) => (
  <section data-testid="mcp-projection-read">
    真实连接器目录：{identity}：{initialView}
  </section>
))
const hub = { listMcpConnectorProviders: vi.fn(), listMcpConnectors: vi.fn() }

vi.mock("@/ui/mcp/mcp-projection-read", () => ({ McpProjectionRead: (props: { identity: string }) => projection(props) }))
vi.mock("@/ui/shell/page-clients", () => ({ browserHubClient: () => hub }))

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.setItem("kokoro.web.auth-index-subject", "user-verified")
  projection.mockClear()
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderPlugins(
  projectReadBoundary: ProjectReadBoundary = {
    admitted: true,
    subject: "user-verified",
    generation: 7,
  },
  onOpenSettings?: EmptyStateProps["onOpenSettings"],
) {
  const view = render(
    <LocaleProvider>
      <KokoroPluginsSurface
        projectReadBoundary={projectReadBoundary}
        {...(onOpenSettings === undefined ? {} : { onOpenSettings })}
      />
    </LocaleProvider>,
  )
  return view
}

it("插件广场以已确认用户的 Provider 目录作为默认入口", () => {
  renderPlugins()

  expect(screen.getByTestId("mcp-projection-read")).toHaveTextContent(
    "user-verified：catalog",
  )
  expect(projection).toHaveBeenCalledWith(expect.objectContaining({
    client: hub,
    embedded: true,
    identity: "user-verified",
    initialView: "catalog",
  }))
  expect(screen.queryByText("Gmail")).toBeNull()
  expect(screen.queryByText("World Bank DataBank")).toBeNull()
})

it("广场的管理动作交给共享的连接器设置面板", () => {
  const onOpenSettings = vi.fn()
  renderPlugins(undefined, onOpenSettings)

  const props = projection.mock.calls[0]?.[0] as {
    onManageConnectors?: (target: HTMLElement) => void
  }
  const trigger = document.createElement("button")
  props.onManageConnectors?.(trigger)

  expect(onOpenSettings).toHaveBeenCalledWith("mcp", trigger)
})

it("会话确认失败时不挂载连接器读取，避免在错误态叠加连接列表失败", () => {
  renderPlugins({ admitted: false, subject: null, generation: 8 })

  expect(screen.getByTestId("plugins-page")).toBeInTheDocument()
  expect(screen.queryByTestId("mcp-projection-read")).toBeNull()
  expect(projection).not.toHaveBeenCalled()
})
