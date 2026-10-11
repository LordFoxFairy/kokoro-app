import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroPluginsSurface } from "@/features/app/kokoro-plugins-surface"

const projection = vi.fn(({ identity }: { identity: string }) => (
  <section data-testid="mcp-projection-read">真实连接器目录：{identity}</section>
))
const hub = { listMcpPersonalProviders: vi.fn(), listMcpPersonalConnectors: vi.fn() }

vi.mock("@/ui/mcp/mcp-projection-read", () => ({ McpProjectionRead: (props: { identity: string }) => projection(props) }))
vi.mock("@/ui/shell/page-clients", () => ({ browserHubClient: () => hub, readBrowserAuthIndexSubject: () => window.localStorage.getItem("kokoro.web.auth-index-subject") }))

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.setItem("kokoro.web.auth-index-subject", "user-verified")
  projection.mockClear()
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderPlugins(onOpenSettings = vi.fn()) {
  const view = render(
    <LocaleProvider>
      <KokoroPluginsSurface onOpenSettings={onOpenSettings} />
    </LocaleProvider>,
  )
  return { ...view, onOpenSettings }
}

it("插件页将已认证用户交给真实连接器投影，而不是渲染静态目录", () => {
  renderPlugins()

  expect(screen.getByRole("heading", { name: "外挂", level: 1 })).toBeInTheDocument()
  expect(screen.getByTestId("mcp-projection-read")).toHaveTextContent("user-verified")
  expect(projection).toHaveBeenCalledWith(expect.objectContaining({
    client: hub,
    embedded: true,
    identity: "user-verified",
  }))
  expect(screen.queryByText("Gmail")).toBeNull()
  expect(screen.queryByText("World Bank DataBank")).toBeNull()
})

it("管理连接器保留统一设置入口", () => {
  const { onOpenSettings } = renderPlugins()
  const trigger = screen.getByRole("button", { name: "管理连接器" })

  fireEvent.click(trigger)

  expect(onOpenSettings).toHaveBeenCalledWith("mcp", trigger)
})
