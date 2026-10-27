import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"

const connector = { availability: "available", connector_id: "owned-connector", server_id: "owned-server", provider_key: "owned-provider", connector_type: "mcp", display_name: "QA MCP", status: "active", enabled: true, approved_scopes: [], state_version: "2" } satisfies McpConnector
const server = { availability: "available", server_id: "owned-server", display_name: "QA MCP", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "3", headers: [], transport: "streamable_http" as const, prepare_status: "ready", declarations: [], declarations_available: true, connection_id: "exact-runtime-connection" } satisfies McpPrivateServer
function show(overrides: Partial<Parameters<typeof CustomMcpDetailDialog>[0]> = {}) {
  const trial = vi.fn(() => true), prepare = vi.fn()
  const props = { connector, server, preparationCanResume: true, actionId: null, admitted: true, managementCommand: undefined,
    onResumeManagement: vi.fn(), actionError: false, deleteId: null, returnFocusRef: { current: null },
    onClose: vi.fn(), onSaveConfiguration: vi.fn(), onPrepare: prepare, onAuthorize: vi.fn(), onDisconnect: vi.fn(),
    onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn(), onTrial: trial, ...overrides }
  const view = render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  return { trial, prepare, view, update: (next: Partial<Parameters<typeof CustomMcpDetailDialog>[0]>) => {
    Object.assign(props, next)
    view.rerender(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  } }
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
  fireEvent.click(screen.getByRole("button", { name: "查看连接结果" }))
  expect(prepare).toHaveBeenCalledOnce()
  expect(trial).not.toHaveBeenCalled()
})

it.each([
  { failure: "invalid" as const, canResume: true, label: "查看连接结果" },
  { failure: "outcome_unknown" as const, canResume: true, label: "查看连接结果" },
])("Prepare $failure belongs to visible detail guidance and a screen-reader-only configuration status, not a configuration error panel", async ({ failure, canResume, label }) => {
  const shown = show({ preparationState: "unknown", preparationFailure: failure, preparationCanResume: canResume })
  const detailExplanation = screen.getByRole("alert").textContent
  expect(detailExplanation).toBeTruthy()
  expect(shown.prepare).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  const announcement = screen.getByRole("status")
  expect(announcement).toHaveTextContent(detailExplanation!)
  expect(announcement).toHaveClass("sr-only")
  expect(screen.getByRole("button", { name: label })).toBeEnabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  expect(screen.getByRole("textbox", { name: "服务器名称" })).not.toHaveAttribute("readonly")
  expect(shown.prepare).not.toHaveBeenCalled()
  // Configuration's own unknown outcome remains an explicit visible panel.
  shown.update({ managementCommand: { operation: "update_server", connectorId: connector.connector_id,
    serverId: server.server_id, kind: "unknown", failure: "outcome_unknown" } })
  const commandPanel = screen.getAllByRole("status").find(node => node.getAttribute("data-slot") === "alert")
  expect(commandPanel).toBeDefined()
  expect(commandPanel).not.toHaveClass("sr-only")
  expect(commandPanel).toHaveTextContent("原请求结果尚未确认。恢复时将使用同一个请求。")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(shown.prepare).not.toHaveBeenCalled()
  shown.update({ managementCommand: undefined })
  fireEvent.click(screen.getByRole("button", { name: label }))
  expect(shown.prepare).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(screen.getByRole("dialog", { name: "QA MCP" })).toBeVisible()
  expect(screen.getByRole("alert")).toHaveTextContent(detailExplanation!)
  expect(screen.queryByRole("status")).not.toBeInTheDocument()
  expect(shown.prepare).toHaveBeenCalledOnce()
  expect(shown.trial).not.toHaveBeenCalled()
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

it("configuration lists only active configured headers, not retained revocation history", async () => {
  const save = vi.fn()
  show({ onSaveConfiguration: save, server: { ...server, headers: [
    { name: "x-active", configured: true, status: "active", state_version: "1" },
    { name: "x-revoked", configured: false, status: "revoked", state_version: "2" },
  ] } })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.getByText("x-active")).toBeVisible()
  expect(screen.getAllByText("已配置")).toHaveLength(1)
  expect(screen.queryByText("x-revoked")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "移除 x-revoked" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "试用一下" })).toBeEnabled()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "移除 x-active" }))
  expect(screen.getByRole("button", { name: "试用一下" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledExactlyOnceWith({ display_name: "QA MCP", notes: "", server_url: server.server_url,
    header_upserts: [], header_removals: ["x-active"] })
})

it("a revoked header name can be explicitly configured again without a repeated removal", async () => {
  const save = vi.fn()
  show({ onSaveConfiguration: save, server: { ...server, headers: [
    { name: "x-revoked", configured: false, status: "revoked", state_version: "2" },
  ] } })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.queryByText("已配置")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
  fireEvent.change(screen.getByLabelText("Header name"), { target: { value: "x-revoked" } })
  fireEvent.change(screen.getByLabelText("Header value"), { target: { value: "new-fixture-value" } })
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledExactlyOnceWith({ display_name: "QA MCP", notes: "", server_url: server.server_url,
    header_upserts: [{ name: "x-revoked", value: "new-fixture-value" }], header_removals: [] })
})

it("shows the fresh SSE configuration label without an editable transport or fake chevron", async () => {
 show({ server: { ...server, transport: "sse_compat" } });
 fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" });
 fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }));
 const label = screen.getByLabelText("传输类型 SSE"); expect(label).toHaveTextContent("SSE"); expect(label.querySelector("svg")).toBeNull();
 expect(screen.queryByRole("combobox", { name: "传输类型" })).toBeNull();
});

const savedBoundary = { admitted: true, subject: "configuration-actor", generation: 7 }
async function submitConfiguration(transport: McpPrivateServer["transport"] = "streamable_http") {
  const save = vi.fn()
  const shown = show({ iconBoundary: savedBoundary, onSaveConfiguration: save,
    server: { ...server, transport, prepare_status: "pending_prepare", connection_id: undefined } })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Submitted note" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledOnce()
  return { ...shown, save }
}

it.each([
  ["streamable_http", "HTTP"], ["sse_compat", "SSE"],
] as const)("confirmed Save keeps only the exact immutable %s label while fresh facts/actions remain pending", async (transport, label) => {
  const shown = await submitConfiguration(transport)
  const confirmation = {}
  shown.update({ server: null, connector: null, configurationSaved: confirmation })
  expect(screen.getByLabelText(`传输类型 ${label}`)).toHaveTextContent(label)
  expect(screen.queryByText("正在加载…")).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "备注 （可选）" })).toHaveValue("Submitted note")
  expect(screen.getByRole("textbox", { name: "备注 （可选）" })).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "连接" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "复制 UUID" })).toBeDisabled()
  expect(screen.getByRole("textbox", { name: "服务器名称" }).closest("form")).toHaveAttribute("aria-busy", "true")
  fireEvent.click(screen.getByRole("button", { name: "连接" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(shown.prepare).not.toHaveBeenCalled()
  expect(shown.save).toHaveBeenCalledOnce()
  shown.update({ server: { ...server, transport, state_version: "4" }, connector })
  expect(screen.getByLabelText(`传输类型 ${label}`)).toBeInTheDocument()
  shown.update({ server: null, connector: null })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  expect(screen.getByText("正在加载…")).toBeInTheDocument()
})

it.each([
  ["actor", { iconBoundary: { ...savedBoundary, subject: "other-actor" } }],
  ["generation", { iconBoundary: { ...savedBoundary, generation: 8 } }],
  ["admission", { admitted: false }],
  ["read admission", { iconBoundary: { ...savedBoundary, admitted: false } }],
  ["missing trusted boundary", { iconBoundary: undefined }],
  ["server", { server: { ...server, server_id: "other-server" } }],
  ["connector", { connector: { ...connector, connector_id: "other-connector" } }],
  ["confirmation", { configurationSaved: {} }],
  ["read error", { pendingError: true }],
] satisfies Array<[string, Partial<Parameters<typeof CustomMcpDetailDialog>[0]>]>)("confirmed transport display retires synchronously on %s and cannot revive", async (_reason, changed) => {
  const shown = await submitConfiguration("sse_compat")
  const confirmation = {}
  shown.update({ server: null, connector: null, configurationSaved: confirmation })
  expect(screen.getByLabelText("传输类型 SSE")).toBeInTheDocument()
  shown.update(changed)
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  shown.update({ server: null, connector: null, admitted: true, iconBoundary: savedBoundary,
    configurationSaved: confirmation, preparationState: "idle", pendingError: false })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
})

it("an unknown Prepare retains only its own confirmed SSE label, never prior trial/header/icon presentation or permission", async () => {
  const save = vi.fn()
  const expiresAt = Date.now() + 60_000
  const shown = show({ iconBoundary: savedBoundary, onSaveConfiguration: save,
    server: { ...server, transport: "sse_compat", headers: [{ name: "x-observed", configured: true, status: "active", state_version: "2" }],
      icon: { intent_id: "12345678-1234-1234-1234-123456789abc", content_sha256: "a".repeat(64), mime_type: "image/png", size_bytes: "8", width: 24, height: 24,
        preview_reference: { method: "GET", required_headers: {}, url: "https://storage.example.test/confirmed-icon", expires_at: new Date(expiresAt).toISOString() } } } })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.getByRole("button", { name: "试用一下" })).toBeEnabled()
  const image = screen.getByRole("img", { name: "连接器图标" }) as HTMLImageElement
  Object.defineProperties(image, { currentSrc: { configurable: true, value: image.src }, naturalWidth: { configurable: true, value: 24 } })
  fireEvent.load(image)
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Submitted note" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledOnce()
  const confirmation = {}
  shown.update({ server: null, connector: null, configurationSaved: confirmation })
  expect(screen.getByLabelText("传输类型 SSE")).toHaveTextContent("SSE")
  expect(screen.getByRole("button", { name: "试用一下" })).toBeDisabled()
  expect(screen.getByText("x-observed")).toBeVisible()
  expect(screen.getByRole("img", { name: "连接器图标" })).toHaveAttribute("src", image.src)
  shown.update({ preparationState: "unknown" })
  expect(screen.getByLabelText("传输类型 SSE")).toHaveTextContent("SSE")
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(screen.queryByText("x-observed")).not.toBeInTheDocument()
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  const recovery = screen.getByRole("button", { name: "查看连接结果" })
  // Current/ready facts remain retired, but the delegated original receipt
  // lookup is read-only and does not borrow those permissions.
  expect(recovery).toBeEnabled()
  fireEvent.click(recovery)
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(shown.prepare).toHaveBeenCalledOnce()
  expect(shown.trial).not.toHaveBeenCalled()
  expect(save).toHaveBeenCalledOnce()
  shown.update({ preparationState: "idle" })
  expect(screen.getByLabelText("传输类型 SSE")).toHaveTextContent("SSE")
  expect(screen.getByRole("button", { name: "连接" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(screen.queryByText("x-observed")).not.toBeInTheDocument()
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  shown.update({ pendingError: true })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  shown.update({ pendingError: false, preparationState: "unknown", configurationSaved: confirmation })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
})

it("HTTP unknown Prepare permits configuration Save but not either publication entry", async () => {
  const publish = vi.fn(), save = vi.fn()
  const shown = show({ iconBoundary: savedBoundary, preparationState: "unknown", publicationAvailable: true,
    onPublish: publish, onSaveConfiguration: save })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  const publication = await screen.findByRole("menuitem", { name: "发布到项目" })
  expect(publication).toHaveAttribute("aria-disabled", "true")
  fireEvent.click(publication)
  expect(publish).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("menuitem", { name: "编辑配置" }))
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Independent note" } })
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "保存选项" })).toBeDisabled()
  // A menu already opened while eligible also loses publication permission.
  shown.update({ preparationState: "idle" })
  fireEvent.keyDown(screen.getByRole("button", { name: "保存选项" }), { key: "Enter" })
  shown.update({ preparationState: "unknown" })
  const combined = await screen.findByRole("menuitem", { name: "发布到项目" })
  expect(combined).toHaveAttribute("aria-disabled", "true")
  fireEvent.click(combined)
  expect(save).not.toHaveBeenCalled()
  expect(publish).not.toHaveBeenCalled()
  expect(shown.prepare).not.toHaveBeenCalled()
})

it("a previously selected Save-and-publish cannot publish when Prepare becomes unknown before configuration ACK", async () => {
  const publish = vi.fn(), save = vi.fn()
  const shown = show({ iconBoundary: savedBoundary, publicationAvailable: true, onPublish: publish, onSaveConfiguration: save })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Saved before unknown" } })
  fireEvent.keyDown(screen.getByRole("button", { name: "保存选项" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "发布到项目" }))
  expect(save).toHaveBeenCalledOnce()
  shown.update({ preparationState: "unknown", server: null, connector: null, configurationSaved: {} })
  shown.update({ server: { ...server, state_version: "4", notes: "Saved before unknown" }, connector })
  expect(publish).not.toHaveBeenCalled()
  expect(shown.prepare).not.toHaveBeenCalled()
  expect(shown.trial).not.toHaveBeenCalled()
})

it("unconfirmed Save and unrelated loading do not retain transport; a late confirmation after retirement cannot revive it", async () => {
  const shown = await submitConfiguration("sse_compat")
  shown.update({ server: null, connector: null })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  expect(screen.getByText("正在加载…")).toBeInTheDocument()
  shown.update({ iconBoundary: { ...savedBoundary, generation: 8 } })
  shown.update({ iconBoundary: savedBoundary, configurationSaved: {} })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  expect(screen.getByText("正在加载…")).toBeInTheDocument()
})

it("a new editor window cannot adopt another window's confirmed transport or hide its initial loading", async () => {
  const shown = await submitConfiguration("sse_compat")
  const confirmation = {}
  shown.update({ server: null, connector: null, configurationSaved: confirmation })
  expect(screen.getByLabelText("传输类型 SSE")).toBeInTheDocument()
  shown.view.unmount()
  const next = show({ iconBoundary: savedBoundary, configurationSaved: confirmation })
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  next.update({ server: null, connector: null })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  expect(screen.getByText("正在加载…")).toBeInTheDocument()
})


it("an exact in-flight configuration Save announces saving without inserting a loading panel; unknown remains explicit", async () => {
  const shown = await submitConfiguration()
  const command = { operation: "update_server" as const, connectorId: connector.connector_id, serverId: server.server_id }
  shown.update({ managementCommand: { ...command, kind: "running" } })
  expect(screen.getByRole("status")).toHaveTextContent("正在保存…")
  expect(screen.queryByText("正在加载…")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  shown.update({ managementCommand: { ...command, kind: "unknown" } })
  expect(screen.queryByText("正在保存…")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "重试原请求" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(shown.save).toHaveBeenCalledOnce()
})
