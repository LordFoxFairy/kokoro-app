import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroPluginsSurface } from "@/features/app/kokoro-plugins-surface"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

const projection = vi.fn(({ identity }: { identity: string }) => (
  <section data-testid="mcp-projection-read">真实连接器目录：{identity}</section>
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

function renderPlugins(projectReadBoundary: ProjectReadBoundary = { admitted: true, subject: "user-verified", generation: 7 }) {
  const view = render(
    <LocaleProvider>
      <KokoroPluginsSurface projectReadBoundary={projectReadBoundary} />
    </LocaleProvider>,
  )
  return view
}

it("插件页仅在 shell 已确认用户会话后读取真实连接器投影", () => {
  renderPlugins()

  expect(screen.getByTestId("mcp-projection-read")).toHaveTextContent("user-verified:7")
  expect(projection).toHaveBeenCalledWith(expect.objectContaining({
    client: hub,
    embedded: true,
    identity: "user-verified:7",
  }))
  expect(screen.queryByText("Gmail")).toBeNull()
  expect(screen.queryByText("World Bank DataBank")).toBeNull()
})

it("会话确认失败时不挂载连接器读取，避免在错误态叠加连接列表失败", () => {
  renderPlugins({ admitted: false, subject: null, generation: 8 })

  expect(screen.getByTestId("plugins-page")).toBeInTheDocument()
  expect(screen.queryByTestId("mcp-projection-read")).toBeNull()
  expect(projection).not.toHaveBeenCalled()
})
