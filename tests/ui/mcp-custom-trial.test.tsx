import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"

const connector = { availability: "available", connector_id: "owned-connector", server_id: "owned-server", provider_key: "owned-provider", connector_type: "mcp", display_name: "QA MCP", status: "active", enabled: true, approved_scopes: [], state_version: "2" } satisfies McpConnector
const server = { availability: "available", server_id: "owned-server", display_name: "QA MCP", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "3", headers: [], prepare_status: "ready", declarations: [], declarations_available: true, connection_id: "exact-runtime-connection" } satisfies McpPrivateServer
function show(overrides: Partial<Parameters<typeof CustomMcpDetailDialog>[0]> = {}) {
  const trial = vi.fn(() => true), prepare = vi.fn()
  const props = { connector, server, actionId: null, admitted: true, managementCommand: undefined,
    onResumeManagement: vi.fn(), actionError: false, deleteId: null, returnFocusRef: { current: null },
    onClose: vi.fn(), onSaveConfiguration: vi.fn(), onPrepare: prepare, onAuthorize: vi.fn(), onDisconnect: vi.fn(),
    onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn(), onTrial: trial, ...overrides }
  render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  return { trial, prepare }
}
beforeEach(() => localStorage.setItem("kokoro.locale", "zh"))
afterEach(cleanup)
it("Try hands off an available exact connection rather than invoking Prepare", () => {
  const { trial, prepare } = show()
  fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  expect(trial).toHaveBeenCalledExactlyOnceWith()
  expect(prepare).not.toHaveBeenCalled()
})
it("a refused draft handoff keeps the detail and explains that no trial started", () => {
  const { prepare } = show({ onTrial: () => false })
  fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  expect(screen.getByRole("dialog", { name: "QA MCP" })).toBeVisible()
  expect(screen.getByRole("alert")).toHaveTextContent("试用")
  expect(prepare).not.toHaveBeenCalled()
})
it("an unknown Prepare retains its original recovery action and is not a trial", () => {
  const { trial, prepare } = show({ preparationState: "unknown" })
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  expect(prepare).toHaveBeenCalledOnce()
  expect(trial).not.toHaveBeenCalled()
})

it("a refused trial from configuration keeps the editor with visible feedback", async () => {
  show({ onTrial: () => false })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  expect(screen.getByRole("alert")).toHaveTextContent("试用")
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("QA MCP")
})

it.each([
  ["服务器名称", "Unsaved MCP", "QA MCP"],
  ["备注 （可选）", "Unsaved note", ""],
  ["服务器 URL", "https://other.example.test/mcp", server.server_url],
])("configuration Try protects unsaved %s and re-enables after undo", async (label, edited, original) => {
  const { trial } = show()
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  const action = screen.getByRole("button", { name: "试用一下" })
  expect(action).toBeEnabled()
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: edited } })
  expect(action).toBeDisabled()
  fireEvent.click(action)
  expect(trial).not.toHaveBeenCalled()
  expect(screen.getByRole("textbox", { name: label })).toHaveValue(edited)
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: original } })
  expect(action).toBeEnabled()
})

it("configuration Try protects newly added and removed headers", async () => {
  show({ server: { ...server, headers: [{ name: "x-existing", configured: true, status: "active", state_version: "1" }] } })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  const action = screen.getByRole("button", { name: "试用一下" })
  fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
  expect(action).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "移除新增 Header" }))
  expect(action).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "移除 x-existing" }))
  expect(action).toBeDisabled()
})
