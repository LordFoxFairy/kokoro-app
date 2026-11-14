import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createHubClient, HubClientError } from "@/hub/client"
import { mcpReauthorizationDataSchema } from "@/hub/mcp-reauthorization.schema"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"
import type { McpIconBinding, McpIconIntent } from "@/hub/mcp-icon.schema"
import type { McpIconClient } from "@/hub/mcp-icon-client"
import { McpIconPicker } from "@/ui/mcp/mcp-icon-picker"
import { createMcpIconDraft } from "@/ui/mcp/mcp-icon-draft"
import { LocaleProvider } from "@/i18n/context"
import { LOCALES, zh, type Locale } from "@/i18n/messages"
import { OVERLAYS } from "@/i18n/overlays"
import { resolveMessage } from "@/i18n/resolve"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpContent } from "@/ui/mcp/mcp-content"
import { McpTrialProvider } from "@/ui/mcp/mcp-trial-context"
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"
import { McpConfigurationJsonDialog } from "@/ui/mcp/mcp-configuration-json-dialog"
import { mergeConfigurationJsonHeaders } from "@/ui/mcp/mcp-configuration-json"
import { ProductReadRecheckProvider, type ProductRead401 } from "@/ui/auth/product-read-recheck-context"

beforeEach(() => localStorage.setItem("kokoro.locale", "zh"))
afterEach(() => { cleanup(); vi.useRealTimers() })

it("a disconnected saved detail shows configuration facts with no command controls even when Prepare or management recovery exists", () => {
  const connector: McpConnector = { availability: "unavailable", connector_id: "read-only-connector", server_id: "read-only-server",
    provider_key: "ordinary-name", connector_type: "mcp", status: "revoked", enabled: false, state_version: "4", approved_scopes: [] }
  const server: McpPrivateServer = { availability: "unavailable", server_id: "read-only-server", display_name: "Saved disconnected MCP",
    server_url: "https://mcp.example.test/saved", notes: "Saved note", status: "registered", state_version: "9", transport: "sse_compat",
    headers: [{ name: "x-configured", configured: true, status: "active", state_version: "2" }], prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const command = vi.fn()
  render(<LocaleProvider><CustomMcpDetailDialog connector={connector} server={server} admitted readOnlyConfiguration
    actionId={null} actionError={false} deleteId={connector.connector_id} managementCommand={undefined}
    preparationState="unknown" preparationRecoveryReady={false} preparationRecoveryError
    onRetryPreparationRecovery={command} onResumeManagement={command} onSaveConfiguration={command} onPrepare={command}
    onTrial={command} onPublish={command} publicationAvailable publicationRecoveryError onRetryPublicationRecovery={command}
    onAuthorize={command} onDisconnect={command} onDeleteIntent={command} onDelete={command} onCancelDelete={command}
    returnFocusRef={{ current: null }} onClose={vi.fn()} /></LocaleProvider>)
  const detail = screen.getByRole("dialog", { name: server.display_name })
  expect(within(detail).getByText("已断开")).toBeVisible()
  expect(within(detail).getByText("连接已断开，保存的配置仅供查看。重新连接暂不可用。")).toBeVisible()
  expect(within(detail).queryByText("已停用")).toBeNull()
  expect(within(detail).queryByText("暂不可用")).toBeNull()
  for (const fact of [server.server_url, server.notes!, "x-configured", "SSE"])
    expect(within(detail).getByText(fact)).toBeVisible()
  expect(within(detail).queryByRole("button", { name: /管理|保存|连接|重试|删除|试用|发布|检查/ })).toBeNull()
  expect(within(detail).queryByRole("textbox")).toBeNull()
  expect(command).not.toHaveBeenCalled()
})

it("the coordinator rejects direct command callbacks from a disconnected configuration window", async () => {
  const detailModule = await import("@/ui/mcp/custom-mcp-detail-dialog")
  const OriginalDetail = detailModule.CustomMcpDetailDialog
  let captured: Parameters<typeof CustomMcpDetailDialog>[0] | undefined
  const capture = vi.spyOn(detailModule, "CustomMcpDetailDialog").mockImplementation(props => {
    captured = props
    return <OriginalDetail {...props} />
  })
  try {
    const connector: McpConnector = { availability: "unavailable", connector_id: "callback-connector", server_id: "callback-server",
      provider_key: "callback-provider", connector_type: "mcp", display_name: "Disconnected callbacks", status: "revoked", enabled: false, state_version: "4", approved_scopes: [] }
    const server: McpPrivateServer = { availability: "unavailable", server_id: "callback-server", display_name: connector.display_name!,
      server_url: "https://mcp.example.test/callback", status: "registered", state_version: "8", headers: [], transport: "streamable_http",
      prepare_status: "pending_prepare", declarations: [], declarations_available: false }
    const command = vi.fn()
    const client = { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }),
      listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
      getMcpConnector: vi.fn().mockResolvedValue(connector), getPrivateMcpServer: vi.fn().mockResolvedValue(server),
      updatePrivateMcpServer: command, preparePrivateMcpServer: command, setMcpConnectorEnabled: command,
      removeMcpConnector: command, deletePrivateMcpServer: command, createMcpConnector: command,
      beginMcpConnectorAuthorization: command, reconnectMcpConnectorAuthorization: command, createMcpConnection: command }
    const boundary = { subject: "callback-owner", admitted: true, generation: 0 }
    render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}>
      <McpContent client={client} initialView="connections" readBoundary={boundary} />
    </ConnectorCommandProvider></LocaleProvider>)
    fireEvent.click(await screen.findByRole("button", { name: server.display_name }))
    await screen.findByRole("dialog", { name: server.display_name })
    expect(captured?.readOnlyConfiguration).toBe(true)
    const current = captured!
    await act(async () => {
      current.onSaveConfiguration({ display_name: "Changed", notes: "Changed", server_url: "https://mcp.example.test/changed", header_upserts: [], header_removals: [] })
      current.onPrepare(); current.onAuthorize(); current.onDisconnect(); current.onDeleteIntent(); current.onDelete()
      current.onResumeManagement(); current.onPublish?.(); current.onTrial?.()
      current.onRetryPreparationRecovery?.(); current.onRetryPublicationRecovery?.()
    })
    expect(command).not.toHaveBeenCalled()
    expect(screen.queryByText("确认删除此自定义 MCP？")).toBeNull()
  } finally { capture.mockRestore() }
})

async function jsonConfigurationFixture(unknown = false, icons?: McpIconClient, transport: McpPrivateServer["transport"] = "streamable_http", locale: Locale = "zh") {
  localStorage.setItem("kokoro.locale", locale)
  let version = 3, name = "JSON editor MCP", url = "https://mcp.example.test/mcp", lostAck = false
  const server = (): McpPrivateServer => ({ availability: "available", server_id: "json-editor-server", display_name: name,
    server_url: url, notes: "Keep original note", status: "registered", state_version: String(version),
    headers: [{ name: "x-saved-key", configured: true, status: "active", state_version: "2" }], transport,
    prepare_status: "ready", declarations: [], declarations_available: true, declaration_digest: "a".repeat(64), connection_id: "json-editor-connection" })
  const connector = (): McpConnector => ({ availability: "available", connector_id: "json-editor-connector", server_id: "json-editor-server",
    provider_key: "json-editor-provider", connector_type: "mcp", display_name: name, status: "active", enabled: true, approved_scopes: [], state_version: String(version) })
  const update = vi.fn<NonNullable<ReturnType<typeof createHubClient>["updatePrivateMcpServer"]>>(async (_id, input) => {
    if (unknown && lostAck) return { server: server(), connector: connector(), replayed: true }
    version++; name = input.display_name ?? name; url = input.server_url ?? url
    if (unknown) { lostAck = true; throw Error("lost JSON update ACK") }
    return { server: server(), connector: connector(), replayed: false }
  })
  const prepare = vi.fn(), register = vi.fn(), importJson = vi.fn()
  const hub = { ...createHubClient(), ...(icons ? { mcpIcons: icons } : {}), updatePrivateMcpServer: update, preparePrivateMcpServer: prepare,
    registerPrivateMcpServer: register, importPrivateMcpJson: importJson,
    getPrivateMcpServer: vi.fn(async () => server()), getMcpConnector: vi.fn(async () => connector()),
    listMcpConnectors: vi.fn(async () => ({ items: [connector()], next_cursor: null })),
    listMcpConnectorProviders: vi.fn(async () => ({ items: [], next_cursor: null })),
    listCustomApis: vi.fn(async () => ({ items: [], page: { next_cursor: null } })) }
  let boundary = { admitted: true, generation: 1, subject: "json-editor-actor" }
  const content = () => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={boundary}>
    <McpContent client={hub} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(content())
  fireEvent.click(await screen.findByRole("button", { name }))
  const detail = await screen.findByRole("dialog", { name })
  if (locale === "en") {
    for (const label of ["Details", "Category", "Uncategorized", "Connector type", "Custom MCP", "Give feedback"])
      expect(within(detail).getByText(label)).toBeVisible()
  }
  fireEvent.keyDown(within(detail).getByRole("button", { name: resolveMessage(locale, "settings.manage") }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: resolveMessage(locale, "mcp.configurationEdit") }))
  const openJson = async () => {
    fireEvent.keyDown(screen.getByRole("button", { name: resolveMessage(locale, "settings.manage") }), { key: "Enter" })
    const entry = await screen.findByRole("menuitem", { name: resolveMessage(locale, "mcp.configurationEditJson") })
    expect(entry).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(entry)
    return screen.findByRole("dialog", { name: resolveMessage(locale, "mcp.configurationJsonTitle") })
  }
  return { update, prepare, register, importJson, openJson, change: (value: Partial<typeof boundary>) => {
    boundary = { ...boundary, ...value }; view.rerender(content())
  } }
}

it.each(["cancel", "escape"] as const)("opens the real JSON editor without saved secrets and %s preserves the outer draft with zero writes", async close => {
  const state = await jsonConfigurationFixture()
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （选填）" }), { target: { value: "Keep unsaved note" } })
  const dialog = await state.openJson()
  const text = within(dialog).getByRole("textbox")
  expect(JSON.parse((text as HTMLTextAreaElement).value)).toEqual({ mcpServers: { "JSON editor MCP": { type: "streamableHttp", url: "https://mcp.example.test/mcp" } } })
  expect((text as HTMLTextAreaElement).value).not.toContain("x-saved-key")
  fireEvent.change(text, { target: { value: '{"mcpServers":{}}' } })
  if (close === "cancel") fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  else fireEvent.keyDown(dialog, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑配置 JSON" })).toBeNull())
  expect(screen.getByRole("textbox", { name: "备注 （选填）" })).toHaveValue("Keep unsaved note")
  expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
  expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
})

it("copies the exact current JSON input without saving, importing or connecting, and clears copy feedback when edited", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture()
    const dialog = await state.openJson()
    const original = (within(dialog).getByRole("textbox") as HTMLTextAreaElement).value
    expect(original).not.toContain("x-saved-key")
    const input = '  { "mcpServers": { "User input": { "headers": {"x-explicit": "user-entered-value"} } } }\n'
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: input } })
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到剪贴板" }))
    await within(dialog).findByText("已复制到剪贴板")
    expect(writeText).toHaveBeenCalledExactlyOnceWith(input)
    expect(within(dialog).getByRole("textbox")).toHaveValue(input)
    expect(screen.getByRole("dialog", { name: "编辑配置 JSON" })).toBeVisible()
    expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
    expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: original } })
    expect(within(dialog).queryByText("已复制到剪贴板")).toBeNull()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it("keeps a pending JSON copy live across a same-scope parent render without treating it as save", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  let finish!: () => void
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture()
    const dialog = await state.openJson()
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到剪贴板" }))
    state.change({})
    await act(async () => { finish() })
    expect(await within(dialog).findByText("已复制到剪贴板")).toBeVisible()
    expect(within(dialog).getByRole("button", { name: "复制到剪贴板" })).toBeEnabled()
    expect(state.update).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it("does not label newer JSON as copied when the user edits during an outstanding clipboard write", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  let finish!: () => void
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture()
    const dialog = await state.openJson()
    const original = (within(dialog).getByRole("textbox") as HTMLTextAreaElement).value
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到剪贴板" }))
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "newer user input" } })
    expect(within(dialog).getByRole("button", { name: "复制到剪贴板" })).toBeDisabled()
    await act(async () => { finish() })
    expect(writeText).toHaveBeenCalledExactlyOnceWith(original)
    expect(within(dialog).getByRole("textbox")).toHaveValue("newer user input")
    expect(within(dialog).queryByText("已复制到剪贴板")).toBeNull()
    expect(within(dialog).getByRole("button", { name: "复制到剪贴板" })).toBeEnabled()
    expect(state.update).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it.each(["missing", "rejected"] as const)("keeps clipboard %s failure local without changing JSON or saving it", async failure => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: failure === "missing" ? undefined : { writeText: vi.fn(async () => { throw Error("clipboard denied") }) } })
  try {
    const state = await jsonConfigurationFixture()
    const dialog = await state.openJson()
    const input = (within(dialog).getByRole("textbox") as HTMLTextAreaElement).value
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到剪贴板" }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("复制失败，请重试。")
    expect(within(dialog).getByRole("textbox")).toHaveValue(input)
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeEnabled()
    expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
    expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it("disables JSON copying while its original save is unknown without treating copying as save recovery", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture(true)
    const dialog = await state.openJson()
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: '{"mcpServers":{"Changed":{"type":"streamableHttp","url":"https://mcp.example.test/changed"}}}' } })
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
    await within(dialog).findByRole("button", { name: "重试原请求" })
    expect(within(dialog).getByRole("button", { name: "复制到剪贴板" })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到剪贴板" }))
    expect(writeText).not.toHaveBeenCalled()
    expect(state.update).toHaveBeenCalledOnce()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it.each(["close", "actor", "generation", "admission"] as const)("retires pending JSON clipboard feedback on %s and never writes a business command", async retirement => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  let finish!: () => void
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture()
    const dialog = await state.openJson()
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到剪贴板" }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(within(dialog).getByRole("button", { name: "复制到剪贴板" })).toBeDisabled()
    if (retirement === "close") fireEvent.keyDown(dialog, { key: "Escape" })
    else state.change(retirement === "actor" ? { subject: "next-copy-actor" } : retirement === "generation" ? { generation: 2 } : { admitted: false })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑配置 JSON" })).toBeNull())
    if (retirement === "close") await state.openJson()
    await act(async () => { finish() })
    expect(screen.queryByText("已复制到剪贴板")).toBeNull()
    expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
    expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it.each([false, true])("JSON Save uses one existing Update identity and preserves omitted secrets/notes without Import or Prepare (unknown=%s)", async unknown => {
  const state = await jsonConfigurationFixture(unknown)
  const dialog = await state.openJson()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: JSON.stringify({ mcpServers: { "JSON renamed": { type: "streamableHttp", url: "https://mcp.example.test/changed" } } }) } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
  expect(state.update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "3", display_name: "JSON renamed", server_url: "https://mcp.example.test/changed" })
  if (unknown) {
    expect(within(dialog).getByRole("textbox")).toHaveAttribute("readonly")
    fireEvent.click(await within(dialog).findByRole("button", { name: "重试原请求" }))
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2))
    expect(state.update.mock.calls[1]?.slice(0, 3)).toEqual(state.update.mock.calls[0]?.slice(0, 3))
  }
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑配置 JSON" })).toBeNull())
  expect(screen.getByRole("textbox", { name: "备注 （选填）" })).toHaveValue("Keep original note")
  expect(state.prepare).not.toHaveBeenCalled(); expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
})

it.each([{}, { "x-saved-key": "explicit-new-value" }])("JSON headers are explicit upserts, never omission-based removal (%j)", async headers => {
  const state = await jsonConfigurationFixture()
  const dialog = await state.openJson()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: JSON.stringify({ mcpServers: { "JSON renamed": { type: "streamableHttp", url: "https://mcp.example.test/mcp", headers } } }) } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
  expect(state.update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "3", display_name: "JSON renamed",
    ...(Object.keys(headers).length ? { header_upserts: [{ name: "x-saved-key", value: "explicit-new-value" }] } : {}) })
  expect(state.prepare).not.toHaveBeenCalled()
})

it.each(["cancel", "escape"] as const)("leaving configuration by %s returns to the same detail before closing its list entry", async close => {
  const state = await jsonConfigurationFixture()
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （选填）" }), { target: { value: "discard local draft" } })
  fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
  fireEvent.change(screen.getByLabelText("Header 名称"), { target: { value: "x-unsaved" } })
  fireEvent.change(screen.getByLabelText("Header 值"), { target: { value: "discard-local-value" } })
  const configuration = screen.getByRole("dialog", { name: "MCP 配置" })
  if (close === "cancel") fireEvent.click(within(configuration).getByRole("button", { name: "取消" }))
  else fireEvent.keyDown(configuration, { key: "Escape" })
  const detail = await screen.findByRole("dialog", { name: "JSON editor MCP" })
  expect(within(detail).getByRole("button", { name: "json-editor-server" })).toBeVisible()
  await waitFor(() => expect(within(detail).getByRole("button", { name: "管理" })).toHaveFocus())
  fireEvent.keyDown(within(detail).getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.getByRole("textbox", { name: "备注 （选填）" })).toHaveValue("Keep original note")
  expect(screen.queryByLabelText("Header 值")).toBeNull()
  fireEvent.keyDown(screen.getByRole("dialog", { name: "MCP 配置" }), { key: "Escape" })
  fireEvent.keyDown(screen.getByRole("dialog", { name: "JSON editor MCP" }), { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(await screen.findByRole("button", { name: "JSON editor MCP" })).toBeVisible()
  expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
})

it.each(["actor", "generation", "admission"] as const)("an open JSON editor retires on %s without reusing its raw secret draft", async retirement => {
  const state = await jsonConfigurationFixture()
  const dialog = await state.openJson()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: '{"mcpServers":{"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp","headers":{"x-new":"retired-private-input"}}}}' } })
  state.change(retirement === "actor" ? { subject: "other-json-actor" } : retirement === "generation" ? { generation: 2 } : { admitted: false })
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑配置 JSON" })).toBeNull())
  expect(screen.queryByDisplayValue(/retired-private-input/)).toBeNull()
  expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
})

it("JSON cancellation preserves a staged icon; leaving configuration releases it once without leaving the object's detail", async () => {
  const icons = readyIconClient(configuredIcon(Date.now() + 60_000, "replacement"))
  icons.cancel.mockImplementation(async () => ({ intent: { ...(await icons.get.mock.results[0]!.value).intent, state: "released", state_version: "4" }, replayed: false }))
  const state = await jsonConfigurationFixture(false, icons)
  await chooseReplacementIcon()
  const dialog = await state.openJson()
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  expect(screen.getByRole("img", { name: "连接器图标" })).toHaveAttribute("src", "https://storage.example.test/icon-replacement")
  expect(icons.cancel).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole("dialog", { name: "MCP 配置" }), { key: "Escape" })
  expect(await screen.findByRole("dialog", { name: "JSON editor MCP" })).toBeVisible()
  await waitFor(() => expect(icons.cancel).toHaveBeenCalledOnce())
  expect(icons.cancel.mock.calls[0]?.slice(0, 2)).toEqual(["22345678-1234-1234-1234-123456789abc", { expected_state_version: "3" }])
  expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
})

it("closing JSON and configuration preserves the unknown original update for explicit same-key recovery from detail", async () => {
  const state = await jsonConfigurationFixture(true)
  const dialog = await state.openJson()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: JSON.stringify({ mcpServers: { "JSON renamed": { type: "streamableHttp", url: "https://mcp.example.test/mcp" } } }) } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await within(dialog).findByRole("button", { name: "重试原请求" })
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  fireEvent.keyDown(screen.getByRole("dialog", { name: "MCP 配置" }), { key: "Escape" })
  const detail = screen.getByRole("dialog", { name: "JSON editor MCP" })
  expect(state.update).toHaveBeenCalledOnce()
  fireEvent.click(within(detail).getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2))
  expect(state.update.mock.calls[1]?.slice(0, 3)).toEqual(state.update.mock.calls[0]?.slice(0, 3))
  expect(state.prepare).not.toHaveBeenCalled()
})

it.each([
  '{',
  '{"mcpServers":{}}',
  '{"mcpServers":{"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp","command":"unsupported"}}}',
  '{"mcpServers":{"A":{"type":"sse","url":"https://mcp.example.test/sse"}}}',
  '{"mcpServers":{"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp","headers":{"Authorization":"secret"}}}}',
  '{"mcpServers":{"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp","headers":{"X-Test":"a","x-test":"b"}}}}',
  '{"mcpServers":{"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp"},"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp"}}}',
  '{"mcpServers":{"A":{"type":"streamableHttp","url":"https://mcp.example.test/mcp"},"B":{"type":"streamableHttp","url":"https://mcp.example.test/mcp"}}}',
] as const)("JSON editing rejects unsupported or ambiguous fields without updating: %s", async json => {
  const state = await jsonConfigurationFixture()
  const dialog = await state.openJson()
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: json } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  expect(within(dialog).getByRole("alert")).toBeVisible()
  expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
  expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
})

it("an existing SSE JSON edit preserves SSE and never routes through HTTP import", async () => {
  const state = await jsonConfigurationFixture(false, undefined, "sse_compat")
  const dialog = await state.openJson()
  expect(JSON.parse((within(dialog).getByRole("textbox") as HTMLTextAreaElement).value).mcpServers["JSON editor MCP"].type).toBe("sse")
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: JSON.stringify({ mcpServers: { "SSE renamed": { type: "sse", url: "https://mcp.example.test/sse" } } }) } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
  expect(state.update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "3", display_name: "SSE renamed", server_url: "https://mcp.example.test/sse" })
  expect(state.importJson).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
})

it("copying the configuration UUID writes only the clipboard, not a management command", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture()
    fireEvent.click(screen.getByRole("button", { name: "复制 UUID" }))
    expect(writeText).toHaveBeenCalledWith("json-editor-server")
    expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
    expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it.each(["confirmed", "unknown-then-replayed", "read-failed"])("configuration Save keeps its dialog, secrets/CAS recovery, and fresh second save: %s", async mode => {
  let version = 3, name = "Saved MCP"
  let lostAck = false, failedRead = false
  let releaseRead!: () => void
  const pendingRead = new Promise<void>(resolve => { releaseRead = resolve })
  let releaseSecondRead!: () => void
  const pendingSecondRead = new Promise<void>(resolve => { releaseSecondRead = resolve })
  const connector = (): McpConnector => ({ availability: "available", connector_id: "saved-connector", server_id: "saved-server",
    provider_key: "saved-provider", connector_type: "mcp", display_name: name, status: "active", enabled: true,
    approved_scopes: [], state_version: String(version) })
  const server = (): McpPrivateServer => ({ availability: "available", server_id: "saved-server", display_name: name,
    server_url: "https://mcp.example.test/mcp", notes: "Saved note", status: "registered", state_version: String(version),
    headers: version > 3 ? [{ name: "x-test-key", configured: true, status: "active", state_version: "4" }] : [],
    transport: "streamable_http" as const, prepare_status: "ready", declarations: [], declarations_available: true, declaration_digest: "a".repeat(64), connection_id: "saved-connection" })
  const read = vi.fn(async () => {
    if (version === 4) {
      if (mode === "read-failed" && !failedRead) { failedRead = true; throw Error("fresh read failed") }
      await pendingRead
    }
    if (version === 5) await pendingSecondRead
    return server()
  })
  const update = vi.fn<NonNullable<ReturnType<typeof createHubClient>["updatePrivateMcpServer"]>>().mockImplementation(async (_id, input) => {
    if (mode === "unknown-then-replayed" && lostAck && input.expected_state_version === "3")
      return { server: server(), connector: connector(), replayed: true }
    version++; name = input.display_name ?? name
    if (mode === "unknown-then-replayed" && !lostAck) { lostAck = true; throw Error("lost original ACK") }
    return { server: server(), connector: connector(), replayed: false }
  })
  const hub = { ...createHubClient(), getPrivateMcpServer: read, updatePrivateMcpServer: update,
    getMcpConnector: vi.fn(async () => connector()),
    listMcpConnectors: vi.fn(async () => ({ items: [connector()], next_cursor: null })),
    listMcpConnectorProviders: vi.fn(async () => ({ items: [], next_cursor: null })),
    listCustomApis: vi.fn(async () => ({ items: [], page: { next_cursor: null } })) }
  const boundary = { admitted: true, generation: 1, subject: "save-config-actor" }
  const trial = vi.fn(() => true)
  render(<LocaleProvider><McpTrialProvider onTry={trial}><ConnectorCommandProvider client={hub} boundary={boundary}>
    <McpContent client={hub} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></McpTrialProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Saved MCP" }))
  const dialog = await screen.findByRole("dialog", { name: "Saved MCP" })
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "First saved name" } })
  fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
  fireEvent.change(screen.getByLabelText("Header 名称"), { target: { value: "x-test-key" } })
  fireEvent.change(screen.getByLabelText("Header 值"), { target: { value: "fixture-secret" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  if (mode === "unknown-then-replayed") {
    const retry = await screen.findByRole("button", { name: "重试原请求" })
    expect(screen.getByLabelText("Header 值")).toHaveValue("fixture-secret")
    expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveAttribute("readonly")
    fireEvent.click(retry)
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.slice(0, 3)).toEqual(update.mock.calls[0]?.slice(0, 3))
  }
  if (mode === "read-failed") {
    await within(dialog).findByText("连接列表加载失败")
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
    const retry = within(dialog).getByRole("button", { name: "重试" })
    expect(retry).toBeEnabled()
    expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
    expect(update).toHaveBeenCalledOnce()
    // Recover the failed detail GET in place; never resend Save.
    fireEvent.click(retry)
  }
  await waitFor(() => expect(read).toHaveBeenCalledTimes(mode === "read-failed" ? 3 : 2))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBe(dialog)
  expect(screen.queryByLabelText("Header 值")).not.toBeInTheDocument()
  // A new name is not a configured descriptor until the fresh owner read.
  expect(screen.queryByText("x-test-key")).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("First saved name")
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  if (mode === "read-failed") {
    // A genuine read failure retired the confirmed descriptor. Starting a new
    // read does not revive it; only that read's fresh owner facts may do so.
    expect(screen.getByLabelText("传输类型 —")).toHaveTextContent("—")
    const loadingAnnouncement = within(dialog).getByRole("status")
    expect(loadingAnnouncement).toHaveTextContent("连接列表加载失败")
    expect(loadingAnnouncement).toBeVisible()
    expect(loadingAnnouncement).toHaveAttribute("aria-busy", "true")
    expect(within(loadingAnnouncement).getByRole("button", { name: "重试" })).toBeDisabled()
  } else {
    expect(screen.getByLabelText("传输类型 HTTP")).toHaveTextContent("HTTP")
    expect(within(dialog).queryByText("正在加载…")).not.toBeInTheDocument()
  }
  const pendingPrimary = screen.getByRole("button", { name: mode === "confirmed" ? "试用一下" : "连接" })
  expect(pendingPrimary).toBeDisabled()
  fireEvent.click(pendingPrimary)
  expect(trial).not.toHaveBeenCalled()
  await act(async () => { releaseRead(); await pendingRead })
  await waitFor(() => expect(screen.getByRole("textbox", { name: "服务器名称" })).not.toHaveAttribute("readonly"))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBe(dialog)
  expect(screen.getByRole("button", { name: "试用一下" })).toBeEnabled()
  expect(screen.getByLabelText("传输类型 HTTP")).toHaveTextContent("HTTP")
  expect(screen.getByText("x-test-key")).toBeVisible()
  const confirmedCalls = mode === "unknown-then-replayed" ? 2 : 1
  expect(update).toHaveBeenCalledTimes(confirmedCalls)
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Second saved name" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(confirmedCalls + 1))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(mode === "read-failed" ? 4 : 3))
  expect(screen.getByLabelText("传输类型 HTTP")).toHaveTextContent("HTTP")
  expect(within(dialog).queryByText("正在加载…")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "试用一下" })).toBeDisabled()
  expect(screen.getByText("x-test-key")).toBeVisible()
  expect(screen.getByRole("button", { name: "移除 x-test-key" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  expect(trial).not.toHaveBeenCalled()
  expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveValue("https://mcp.example.test/mcp")
  expect(screen.getByRole("textbox", { name: "备注 （选填）" })).toHaveValue("Saved note")
  expect(update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "3", display_name: "First saved name", header_upserts: [{ name: "x-test-key", value: "fixture-secret" }] })
  expect(update.mock.calls[confirmedCalls]?.[1]).toEqual({ expected_state_version: "4", display_name: "Second saved name" })
  expect(update.mock.calls[confirmedCalls]?.[2]).not.toBe(update.mock.calls[0]?.[2])
  await act(async () => { releaseSecondRead(); await pendingSecondRead })
})

it("an unresolved queried Prepare allows an independent fresh-CAS SSE Save without completing or replaying Prepare", async () => {
  let version = 3, name = "Independent SSE"
  let releaseRead!: () => void
  const pendingRead = new Promise<void>(resolve => { releaseRead = resolve })
  const server = (): McpPrivateServer => ({ availability: "available", server_id: "independent-server", display_name: name,
    server_url: "https://mcp.example.test/sse", notes: "Original note", status: "registered", state_version: String(version),
    headers: [{ name: "x-existing", configured: true, status: "active", state_version: "2" }],
    transport: "sse_compat", prepare_status: "pending_prepare", declarations: [], declarations_available: false })
  const connector = (): McpConnector => ({ availability: "available", connector_id: "independent-connector", server_id: "independent-server",
    provider_key: "independent-provider", connector_type: "mcp", display_name: name, status: "active", enabled: true,
    approved_scopes: [], state_version: String(version) })
  const read = vi.fn(async () => { if (version === 4) await pendingRead; return server() })
  const prepare = vi.fn<NonNullable<ReturnType<typeof createHubClient>["preparePrivateMcpServer"]>>()
    .mockRejectedValue(new HubClientError("http", "Unconfirmed Prepare", "mcp_personal_response_invalid", 502, false))
  const lookup = vi.fn().mockRejectedValue(new HubClientError("http", "Unknown receipt", "mcp_personal_command_outcome_unknown", 503, false))
  const update = vi.fn<NonNullable<ReturnType<typeof createHubClient>["updatePrivateMcpServer"]>>(async (_id, input) => {
    version++; name = input.display_name ?? name
    return { server: server(), connector: connector(), replayed: false }
  })
  const hub = { ...createHubClient(), getPrivateMcpServer: read, updatePrivateMcpServer: update, preparePrivateMcpServer: prepare, getMcpPrepareReceipt: lookup,
    getMcpConnector: vi.fn(async () => connector()),
    listMcpConnectors: vi.fn(async () => ({ items: [connector()], next_cursor: null })),
    listMcpConnectorProviders: vi.fn(async () => ({ items: [], next_cursor: null })),
    listCustomApis: vi.fn(async () => ({ items: [], page: { next_cursor: null } })) }
  const boundary = { admitted: true, generation: 1, subject: "independent-save-actor" }
  render(<LocaleProvider><ConnectorCommandProvider client={hub} boundary={boundary}>
    <McpContent client={hub} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name }))
  const dialog = await screen.findByRole("dialog", { name })
  fireEvent.click(await within(dialog).findByRole("button", { name: "连接" }))
  fireEvent.click(await screen.findByRole("button", { name: "查看连接结果" }))
  await waitFor(() => expect(lookup).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole("button", { name: "查看连接结果" })).toBeEnabled())
  const originalPrepare = prepare.mock.calls[0]?.slice(0, 3)
  expect(originalPrepare?.slice(0, 2)).toEqual(["independent-server", "3"])
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  expect(screen.getByRole("textbox", { name: "服务器名称" })).not.toHaveAttribute("readonly")
  expect(screen.getByRole("textbox", { name: "备注 （选填）" })).not.toHaveAttribute("readonly")
  expect(screen.getByRole("textbox", { name: "服务器 URL" })).not.toHaveAttribute("readonly")
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Saved independently" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  expect(update.mock.calls[0]?.slice(0, 2)).toEqual(["independent-server", { expected_state_version: "3", display_name: "Saved independently" }])
  await waitFor(() => expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("Saved independently"))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBe(dialog)
  expect(screen.getByLabelText("传输类型 SSE")).toHaveTextContent("SSE")
  expect(screen.queryByText("x-existing")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(prepare).toHaveBeenCalledOnce()
  await act(async () => { releaseRead(); await pendingRead })
  await waitFor(() => expect(screen.getByRole("textbox", { name: "服务器名称" })).not.toHaveAttribute("readonly"))
  // Save retires the old window, not the original unknown query/key/CAS.
  // Its connection recovery stays in detail, not the independent configuration.
  expect(screen.queryByRole("button", { name: "查看连接结果" })).not.toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.queryByRole("button", { name: "重试原请求" })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  fireEvent.click(await screen.findByRole("button", { name: "Saved independently" }))
  expect(await screen.findByRole("button", { name: "查看连接结果" })).toBeEnabled()
  expect(prepare).toHaveBeenCalledOnce()
  expect(lookup).toHaveBeenCalledOnce()
  expect(lookup.mock.calls[0]?.slice(0, 3)).toEqual(originalPrepare)
  expect(prepare.mock.calls[0]?.slice(0, 3)).toEqual(originalPrepare)
})

// Native storage is covered separately; these jsdom tests retain all original command/UI assertions.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});


function configuredIcon(expiresAt = Date.now() + 60_000, label = "bound"): McpIconBinding {
  return { intent_id: label === "replacement" ? "22345678-1234-1234-1234-123456789abc" : "12345678-1234-1234-1234-123456789abc", content_sha256: "a".repeat(64), mime_type: "image/png", size_bytes: "8", width: 24, height: 24,
    preview_reference: { method: "GET", required_headers: {}, url: `https://storage.example.test/icon-${label}`, expires_at: new Date(expiresAt).toISOString() } }
}

function loadImage(image: HTMLElement, currentSrc = (image as HTMLImageElement).src) {
  // jsdom does not load image bytes; model the browser load facts explicitly.
  Object.defineProperties(image, { currentSrc: { configurable: true, value: currentSrc }, naturalWidth: { configurable: true, value: 24 } })
  fireEvent.load(image)
}

function readyIconClient(binding: McpIconBinding) {
  const at = new Date(Date.now() + 60_000).toISOString()
  const intent: McpIconIntent = { intent_id: binding.intent_id, content_sha256: binding.content_sha256, mime_type: binding.mime_type, size_bytes: binding.size_bytes,
    width: binding.width, height: binding.height, state: "ready", state_version: "3", filename: "replacement.png", expires_at: at, expired: false, created_at: at, updated_at: at }
  return { begin: vi.fn<McpIconClient["begin"]>(), complete: vi.fn<McpIconClient["complete"]>(), cancel: vi.fn<McpIconClient["cancel"]>(),
    importUrl: vi.fn<McpIconClient["importUrl"]>(async () => ({ intent, replayed: false })),
    get: vi.fn<McpIconClient["get"]>(async () => ({ intent, preview_reference: binding.preview_reference! })) } satisfies McpIconClient
}

async function chooseReplacementIcon() {
  fireEvent.keyDown(screen.getByRole("button", { name: /^上传$/u }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "粘贴图片 URL" }))
  const dialog = await screen.findByRole("dialog", { name: "通过 URL 添加图片" })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "图标 URL" }), { target: { value: "https://images.example.test/replacement.png" } })
  fireEvent.click(within(dialog).getByRole("button", { name: /^添加$/u }))
  await waitFor(() => expect(screen.getByRole("img", { name: "连接器图标" })).toHaveAttribute("src", "https://storage.example.test/icon-replacement"))
}

async function confirmedPrimary(connected: boolean, headerDescriptors: McpPrivateServer["headers"] = [], iconOptions?: {
  binding: McpIconBinding; client?: McpIconClient; loaded?: boolean; loadSource?: string; edit?: () => Promise<void>;
}) {
  const boundary = { admitted: true, generation: 3, subject: "primary-display-actor" }
  const connector: McpConnector = { availability: "available", connector_id: "primary-connector", server_id: "primary-server",
    provider_key: "primary-provider", connector_type: "mcp", display_name: "Primary MCP", status: "active", enabled: true,
    approved_scopes: [], state_version: "3" }
  const server: McpPrivateServer = { availability: "available", server_id: "primary-server", display_name: "Primary MCP",
    server_url: "https://mcp.example.test/mcp", notes: "Original note", status: "registered", state_version: "3", headers: headerDescriptors,
    transport: "streamable_http", prepare_status: connected ? "ready" : "pending_prepare", declarations: [], declarations_available: true,
    ...(connected ? { connection_id: "primary-connection" } : {}), ...(iconOptions ? { icon: iconOptions.binding } : {}) }
  const trial = vi.fn(() => true), prepare = vi.fn(), save = vi.fn()
  let props: Parameters<typeof CustomMcpDetailDialog>[0] = { connector, server, admitted: true, iconBoundary: boundary, iconClient: iconOptions?.client,
    actionId: null, managementCommand: undefined, onResumeManagement: vi.fn(), actionError: false, deleteId: null,
    returnFocusRef: { current: null }, onClose: vi.fn(), onSaveConfiguration: save, onPrepare: prepare, onTrial: trial,
    onAuthorize: vi.fn(), onDisconnect: vi.fn(), onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn() }
  let view = render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  const update = (next: Partial<typeof props>) => { props = { ...props, ...next }; view.rerender(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>) }
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  const label = connected ? "试用一下" : "连接"
  const icon = screen.getByRole("button", { name: label }).querySelector("svg")?.outerHTML
  expect(icon).toBeTruthy()
  if (iconOptions?.edit) await iconOptions.edit()
  const shownImage = screen.queryByRole("img", { name: "连接器图标" })
  if (shownImage && iconOptions?.loaded !== false) loadImage(shownImage, iconOptions?.loadSource)
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （选填）" }), { target: { value: "Submitted primary note" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledOnce()
  const confirmation = {}
  update({ server: null, connector: null, configurationSaved: confirmation })
  const remount = () => { view.unmount(); view = render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>) }
  return { update, remount, trial, prepare, save, shownImage, label, icon, boundary, server, connector, confirmation }
}

it.each(["Prepare running", "Prepare completed", "lookup running", "journal unreadable", "Update unknown"] as const)("unknown Prepare does not relax the configuration protection for %s", async reason => {
  const state = await confirmedPrimary(false)
  state.update({ server: state.server, connector: state.connector, preparationState: "unknown" })
  expect(screen.getByRole("textbox", { name: "服务器名称" })).not.toHaveAttribute("readonly")
  state.update(reason === "Prepare running" ? { preparationState: "running" }
    : reason === "Prepare completed" ? { preparationState: "completed" }
    : reason === "lookup running" ? { actionId: state.connector.connector_id }
    : reason === "journal unreadable" ? { preparationRecoveryReady: false }
    : { managementCommand: { kind: "unknown", operation: "update_server", connectorId: state.connector.connector_id, serverId: state.server.server_id } })
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(state.save).toHaveBeenCalledOnce()
  expect(state.prepare).not.toHaveBeenCalled()
})

it.each(["read error", "actor", "generation"] as const)("unknown Prepare keeps only the confirmed transport label during its own Save read gap, then retires on %s", async reason => {
  const state = await confirmedPrimary(true, [{ name: "x-old-header", configured: true, status: "active", state_version: "2" }])
  state.update({ preparationState: "unknown", preparationCanResume: false })
  expect(screen.getByLabelText("传输类型 HTTP")).toHaveTextContent("HTTP")
  expect(screen.queryByText("x-old-header")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "查看连接结果" })).toBeDisabled()
  state.update(reason === "read error" ? { pendingError: true } : { iconBoundary: { ...state.boundary,
    ...(reason === "actor" ? { subject: "different-actor" } : { generation: state.boundary.generation + 1 }) } })
  expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
  expect(state.prepare).not.toHaveBeenCalled()
})

it.each([true, false])("confirmed own Save preserves the observed primary label/icon without granting a pending action: connected=%s", async connected => {
  const state = await confirmedPrimary(connected)
  const primary = screen.getByRole("button", { name: state.label })
  expect(primary).toBeDisabled()
  expect(primary.querySelector("svg")?.outerHTML).toBe(state.icon)
  expect(screen.queryByRole("button", { name: connected ? "连接" : "试用一下" })).not.toBeInTheDocument()
  fireEvent.click(primary)
  expect(state.trial).not.toHaveBeenCalled()
  expect(state.prepare).not.toHaveBeenCalled()
  expect(state.save).toHaveBeenCalledOnce()
  state.update({ server: state.server, connector: state.connector })
  expect(screen.getByRole("button", { name: state.label })).toBeEnabled()
})

it.each(["read error", "unknown command", "actor", "generation", "admission", "target", "connector", "window"])("pending primary/header display retires on %s and never revives before fresh facts", async reason => {
  const state = await confirmedPrimary(true, [{ name: "x-confirmed-header", configured: true, status: "active", state_version: "2" }], { binding: configuredIcon() })
  expect(screen.getByRole("img", { name: "连接器图标" })).toBe(state.shownImage)
  expect(screen.getByText("x-confirmed-header")).toBeVisible()
  expect(screen.getByRole("button", { name: "试用一下" })).toBeDisabled()
  const changed: Partial<Parameters<typeof CustomMcpDetailDialog>[0]> = reason === "read error" ? { pendingError: true }
    : reason === "unknown command" ? { managementCommand: { kind: "unknown", operation: "update_server", connectorId: state.connector.connector_id, serverId: state.server.server_id } }
    : reason === "actor" ? { iconBoundary: { ...state.boundary, subject: "other-actor" } }
    : reason === "generation" ? { iconBoundary: { ...state.boundary, generation: 4 } }
    : reason === "admission" ? { admitted: false }
    : reason === "connector" ? { connector: { ...state.connector, connector_id: "other-connector" } }
    : reason === "window" ? {}
    : { server: { ...state.server, server_id: "other-server" } }
  if (reason === "window") state.remount()
  else state.update(changed)
  if (state.shownImage) fireEvent.load(state.shownImage)
  expect(screen.queryByText("x-confirmed-header")).not.toBeInTheDocument()
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  if (reason === "read error") {
    expect(screen.getByText("连接列表加载失败")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  }
  state.update({ server: null, connector: null, iconBoundary: state.boundary, admitted: true, pendingError: false, managementCommand: undefined })
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(screen.queryByText("x-confirmed-header")).not.toBeInTheDocument()
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  if (reason === "window") {
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument()
    expect(state.trial).not.toHaveBeenCalled()
    expect(state.prepare).not.toHaveBeenCalled()
    return
  }
  expect(screen.getByRole("button", { name: "连接" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "连接" }))
  expect(state.trial).not.toHaveBeenCalled()
  expect(state.prepare).not.toHaveBeenCalled()
})


async function pendingPrivateServerRead() {
  let version = 3, notes = "Original note", held = false
  let rejectRead!: (error: unknown) => void
  const pending = new Promise<never>((_resolve, reject) => { rejectRead = reject })
  let readSignal: AbortSignal | undefined
  const connector = (): McpConnector => ({ availability: "available", connector_id: "proof-connector", server_id: "proof-server",
    provider_key: "proof-provider", connector_type: "mcp", display_name: "Proof MCP", status: "active", enabled: true,
    approved_scopes: [], state_version: String(version) })
  const server = (): McpPrivateServer => ({ availability: "available", server_id: "proof-server", display_name: "Proof MCP",
    server_url: "https://mcp.example.test/mcp", notes, status: "registered", state_version: String(version), headers: [],
    transport: "streamable_http", prepare_status: "ready", declarations: [], declarations_available: true, connection_id: "proof-connection" })
  const read = vi.fn(async (_id: string, signal?: AbortSignal) => {
    if (version === 4 && !held) { held = true; readSignal = signal; return pending }
    return server()
  })
  const patch = vi.fn<NonNullable<ReturnType<typeof createHubClient>["updatePrivateMcpServer"]>>().mockImplementation(async (_id, input) => {
    version++; notes = input.notes ?? notes
    return { server: server(), connector: connector(), replayed: false }
  })
  const client = { ...createHubClient(), getPrivateMcpServer: read, updatePrivateMcpServer: patch,
    getMcpConnector: vi.fn(async () => connector()), listMcpConnectors: vi.fn(async () => ({ items: [connector()], next_cursor: null })),
    listMcpConnectorProviders: vi.fn(async () => ({ items: [], next_cursor: null })), listCustomApis: vi.fn(async () => ({ items: [], page: { next_cursor: null } })) }
  const report = vi.fn((proof: ProductRead401) => {
    expect(proof).toMatchObject({ subject: "private-read-actor", generation: 7 })
    expect(proof.signal).toBe(readSignal)
    expect(proof.signal.aborted).toBe(false)
  })
  let boundary = { admitted: true, subject: "private-read-actor", generation: 7 }
  const surface = () => <LocaleProvider><ProductReadRecheckProvider value={report}><ConnectorCommandProvider client={client} boundary={boundary}>
    <McpContent client={client} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></ProductReadRecheckProvider></LocaleProvider>
  const view = render(surface())
  fireEvent.click(await screen.findByRole("button", { name: "Proof MCP" }))
  const dialog = await screen.findByRole("dialog", { name: "Proof MCP" })
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （选填）" }), { target: { value: "Saved proof note" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  expect(patch).toHaveBeenCalledOnce()
  const original = { body: JSON.stringify(patch.mock.calls[0]?.[1]), key: patch.mock.calls[0]?.[2] }
  return { view, dialog, read, patch, report, original, rejectRead,
    signal: () => readSignal!,
    change: (next: Partial<typeof boundary>) => { boundary = { ...boundary, ...next }; view.rerender(surface()) } }
}

it.each(["401", "403", "parse401", "network", "aborted"] as const)("the real saved private-server GET reports only its current typed HTTP401: %s", async failure => {
  const state = await pendingPrivateServerRead()
  const error = new HubClientError(failure === "401" || failure === "403" ? "http" : failure === "parse401" ? "parse" : failure,
    "controlled private-server read", null, failure === "403" ? 403 : 401)
  await act(async () => { state.rejectRead(error) })
  expect(await within(state.dialog).findByText("连接列表加载失败")).toBeInTheDocument()
  const retry = within(state.dialog).getByRole("button", { name: "重试" })
  expect(retry).toBeEnabled()
  expect(within(state.dialog).queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(state.report).toHaveBeenCalledTimes(failure === "401" ? 1 : 0)
  expect(state.read).toHaveBeenCalledTimes(2)
  expect(state.patch).toHaveBeenCalledOnce()
  expect({ body: JSON.stringify(state.patch.mock.calls[0]?.[1]), key: state.patch.mock.calls[0]?.[2] }).toEqual(state.original)
  fireEvent.click(retry)
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled())
  expect(state.patch).toHaveBeenCalledOnce()
  expect(state.report).toHaveBeenCalledTimes(failure === "401" ? 1 : 0)
})

it.each(["actor", "generation", "close", "unmount"] as const)("a late private-server HTTP401 after %s never requests readmission or replays Save", async retirement => {
  const state = await pendingPrivateServerRead()
  if (retirement === "actor") state.change({ subject: "different-reader" })
  else if (retirement === "generation") state.change({ generation: 8 })
  else if (retirement === "close") {
    fireEvent.keyDown(state.dialog, { key: "Escape" })
    // Configuration closes back to its retained detail; only the next Escape
    // leaves the target window and retires its still-pending exact read.
    expect(state.dialog).toHaveAttribute("data-variant", "detail")
    fireEvent.keyDown(state.dialog, { key: "Escape" })
    await waitFor(() => expect(state.dialog).not.toBeInTheDocument())
  } else state.view.unmount()
  expect(state.signal().aborted).toBe(true)
  await act(async () => { state.rejectRead(new HubClientError("http", "late private read", null, 401)) })
  expect(state.report).not.toHaveBeenCalled()
  expect(state.patch).toHaveBeenCalledOnce()
  expect({ body: JSON.stringify(state.patch.mock.calls[0]?.[1]), key: state.patch.mock.calls[0]?.[2] }).toEqual(state.original)
})


it.each(["notes", "rotate", "remove"] as const)("confirmed Header names keep their rows across Save ACK and the held exact read, without retaining secrets or fresh qualification: %s", async operation => {
  let version = 1
  let releaseRead!: () => void
  const pendingRead = new Promise<void>(resolve => { releaseRead = resolve })
  const connector = (): McpConnector => ({ availability: "available", connector_id: "header-connector", server_id: "header-server",
    provider_key: "header-provider", connector_type: "mcp", display_name: "Header MCP", status: "active", enabled: true,
    approved_scopes: [], state_version: String(version) })
  const boundIcon = configuredIcon()
  const server = (): McpPrivateServer => ({ availability: "available", server_id: "header-server", display_name: "Header MCP",
    server_url: "https://mcp.example.test/mcp", notes: "Original note", status: "registered", state_version: String(version),
    headers: [
      { name: "x-present-key", configured: true, status: "active", state_version: String(version) },
      { name: "x-removed-key", configured: version === 1 || operation !== "remove", status: version > 1 && operation === "remove" ? "revoked" : "active", state_version: String(version) },
      { name: "x-revoked-key", configured: false, status: "revoked", state_version: "1" },
    ],
    transport: "streamable_http", prepare_status: "ready", declarations: [], declarations_available: true,
    declaration_digest: "a".repeat(64), connection_id: "header-connection", icon: boundIcon })
  const read = vi.fn(async () => { if (version > 1) await pendingRead; return server() })
  const patch = vi.fn<NonNullable<ReturnType<typeof createHubClient>["updatePrivateMcpServer"]>>().mockImplementation(async () => {
    version++
    return { server: server(), connector: connector(), replayed: false }
  })
  const trial = vi.fn(() => true)
  const client = { ...createHubClient(), getPrivateMcpServer: read, updatePrivateMcpServer: patch,
    getMcpConnector: vi.fn(async () => connector()), listMcpConnectors: vi.fn(async () => ({ items: [connector()], next_cursor: null })),
    listMcpConnectorProviders: vi.fn(async () => ({ items: [], next_cursor: null })), listCustomApis: vi.fn(async () => ({ items: [], page: { next_cursor: null } })) }
  const boundary = { admitted: true, subject: "header-save-actor", generation: 3 }
  render(<LocaleProvider><McpTrialProvider onTry={trial}><ConnectorCommandProvider client={client} boundary={boundary}>
    <McpContent client={client} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></McpTrialProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Header MCP" }))
  const dialog = await screen.findByRole("dialog", { name: "Header MCP" })
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  const confirmedRow = screen.getByText("x-present-key")
  const confirmedImage = screen.getByRole("img", { name: "连接器图标" })
  loadImage(confirmedImage)
  expect(screen.queryByText("x-revoked-key")).not.toBeInTheDocument()
  if (operation === "notes") {
    fireEvent.change(screen.getByRole("textbox", { name: "备注 （选填）" }), { target: { value: "Updated note" } })
  } else if (operation === "rotate") {
    fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
    fireEvent.change(screen.getByLabelText("Header 名称"), { target: { value: "x-present-key" } })
    fireEvent.change(screen.getByLabelText("Header 值"), { target: { value: "write-only-rotation-fixture" } })
  } else {
    fireEvent.click(screen.getByRole("button", { name: "移除 x-removed-key" }))
    expect(screen.queryByText("x-removed-key")).not.toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  expect(patch).toHaveBeenCalledOnce()
  expect(screen.queryByLabelText("Header 值")).not.toBeInTheDocument()
  expect(screen.getByText("x-present-key")).toBe(confirmedRow)
  expect(screen.getByRole("img", { name: "连接器图标" })).toBe(confirmedImage)
  expect(confirmedImage).toHaveAttribute("src", boundIcon.preview_reference!.url)
  expect(screen.getByRole("button", { name: "移除 x-present-key" })).toBeDisabled()
  expect(screen.queryByText("x-revoked-key")).not.toBeInTheDocument()
  if (operation === "remove") expect(screen.queryByText("x-removed-key")).not.toBeInTheDocument()
  else expect(screen.getByText("x-removed-key")).toBeVisible()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "添加自定义 header" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "试用一下" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  expect(trial).not.toHaveBeenCalled()
  expect(patch.mock.calls[0]?.[1]).toEqual({ expected_state_version: "1",
    ...(operation === "notes" ? { notes: "Updated note" } : operation === "rotate"
      ? { header_upserts: [{ name: "x-present-key", value: "write-only-rotation-fixture" }] } : { header_removals: ["x-removed-key"] }) })
  await act(async () => { releaseRead(); await pendingRead })
  await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeEnabled())
  expect(screen.getByRole("button", { name: "移除 x-present-key" })).toBeEnabled()
  expect(screen.queryByLabelText("Header 值")).not.toBeInTheDocument()
  if (operation === "remove") expect(screen.queryByText("x-removed-key")).not.toBeInTheDocument()
  expect(patch).toHaveBeenCalledOnce()
})


it.each(["clear", "replace"] as const)("confirmed icon %s preserves only its actual saved presentation across the fresh-read gap", async operation => {
  const original = configuredIcon(), replacement = configuredIcon(Date.now() + 60_000, "replacement")
  const client = readyIconClient(replacement)
  const state = await confirmedPrimary(true, [], { binding: original, client, edit: operation === "replace" ? chooseReplacementIcon : async () => {
    fireEvent.keyDown(screen.getByRole("button", { name: /^上传$/u }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "移除图片" }))
    await waitFor(() => expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument())
  } })
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByRole("button", { name: /^上传$/u })).toBeDisabled()
  expect(state.save.mock.calls[0]?.[0]).toEqual({ display_name: "Primary MCP", notes: "Submitted primary note", server_url: state.server.server_url,
    header_upserts: [], header_removals: [], ...(operation === "clear" ? { clear_icon: true } : { icon: { intent_id: replacement.intent_id, expected_state_version: "3" } }) })
  if (operation === "clear") expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  else {
    expect(screen.getByRole("img", { name: "连接器图标" })).toBe(state.shownImage)
    expect(state.shownImage).toHaveAttribute("src", replacement.preview_reference!.url)
    state.update({ pendingError: true })
    expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
    state.update({ pendingError: false })
    expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  }
  const fresh = { ...state.server }; if (operation === "clear") delete fresh.icon; else fresh.icon = replacement
  state.update({ server: fresh, connector: state.connector })
  if (operation === "clear") expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  else expect(screen.getByRole("img", { name: "连接器图标" })).toHaveAttribute("src", replacement.preview_reference!.url)
  expect(state.save).toHaveBeenCalledOnce()
  expect(client.cancel).not.toHaveBeenCalled()
})

it.each(["not loaded", "expired", "stale source"] as const)("a %s bound icon is never retained as a post-ACK presentation", async reason => {
  await confirmedPrimary(true, [], { binding: configuredIcon(reason === "expired" ? Date.now() - 1 : Date.now() + 60_000), loaded: reason !== "not loaded",
    ...(reason === "stale source" ? { loadSource: "https://storage.example.test/previous-source" } : {}) })
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
})

it("pending icon presentation expires at the original URL deadline without refreshing it", () => {
  vi.useFakeTimers()
  const draft = createMcpIconDraft(undefined, "preview-only-actor")
  const view = render(<LocaleProvider><McpIconPicker draft={draft} state={draft.getSnapshot()} disabled
    displayFallback={{ url: "https://storage.example.test/icon-bound", expiresAt: Date.now() + 1000 }} /></LocaleProvider>)
  expect(screen.getByRole("img", { name: "连接器图标" })).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(1000) })
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  view.rerender(<LocaleProvider><McpIconPicker draft={draft} state={draft.getSnapshot()} disabled
    displayFallback={{ url: "https://storage.example.test/icon-bound", expiresAt: Date.now() }} /></LocaleProvider>)
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  expect(vi.getTimerCount()).toBe(0)
})

it("an already mounted picker never creates an image for a newly supplied expired reference", () => {
  vi.useFakeTimers()
  const draft = createMcpIconDraft(undefined, "expired-replacement-actor")
  const started = Date.now()
  const view = render(<LocaleProvider><McpIconPicker draft={draft} state={draft.getSnapshot()} disabled
    current={configuredIcon(started + 10_000, "future")} /></LocaleProvider>)
  expect(screen.getByRole("img", { name: "连接器图标" })).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(1000) })
  view.rerender(<LocaleProvider><McpIconPicker draft={draft} state={draft.getSnapshot()} disabled
    current={configuredIcon(started + 500, "already-expired")} /></LocaleProvider>)
  // Observe before any 0ms expiry timer: a stale component clock must not issue this src.
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  expect(vi.getTimerCount()).toBe(0)
})

it("an old reference's late error cannot hide or clear the newly loaded preview", () => {
  const draft = createMcpIconDraft(undefined, "late-image-error-actor"), onPreviewLoaded = vi.fn()
  const first = { url: "https://storage.example.test/icon-first", expiresAt: Date.now() + 60_000 }
  const second = { url: "https://storage.example.test/icon-second", expiresAt: Date.now() + 60_000 }
  const view = render(<LocaleProvider><McpIconPicker draft={draft} state={draft.getSnapshot()} disabled displayFallback={first} onPreviewLoaded={onPreviewLoaded} /></LocaleProvider>)
  const oldImage = screen.getByRole("img", { name: "连接器图标" }); loadImage(oldImage)
  view.rerender(<LocaleProvider><McpIconPicker draft={draft} state={draft.getSnapshot()} disabled displayFallback={second} onPreviewLoaded={onPreviewLoaded} /></LocaleProvider>)
  const newImage = screen.getByRole("img", { name: "连接器图标" }); loadImage(newImage)
  const loadedCalls = onPreviewLoaded.mock.calls.length
  fireEvent.error(oldImage)
  expect(screen.getByRole("img", { name: "连接器图标" })).toBe(newImage)
  expect(onPreviewLoaded).toHaveBeenCalledTimes(loadedCalls)
  expect(onPreviewLoaded).toHaveBeenLastCalledWith(second, true)
  fireEvent.error(newImage)
  expect(screen.queryByRole("img", { name: "连接器图标" })).not.toBeInTheDocument()
  expect(onPreviewLoaded).toHaveBeenLastCalledWith(second, false)
})


it.each(["advanced", "failed_current"] as const)("the original detail completes one read-only receipt lookup with %s Current facts", async current => {
  const pendingServer: McpPrivateServer = { availability: "unavailable", server_id: "lookup-detail-server", display_name: "Lookup detail MCP", server_url: "https://mcp.example.test/lookup-detail", status: "registered", state_version: "1", headers: [], transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const pendingConnector: McpConnector = { availability: "unavailable", connector_id: "lookup-detail-connector", server_id: pendingServer.server_id, provider_key: "lookup-detail-provider", connector_type: "mcp", display_name: pendingServer.display_name, status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  const historical = { server: { ...pendingServer, state_version: "2", prepare_status: "ready" as const, declarations_available: true, declaration_digest: "a".repeat(64) }, connector: { ...pendingConnector, state_version: "2", status: "active" as const, enabled: true }, declarations: [], replayed: true };
  const prepare = vi.fn().mockRejectedValue(new HubClientError("http", "lost ACK", "mcp_personal_response_invalid", 502, false));
  const lookup = vi.fn<NonNullable<ReturnType<typeof createHubClient>["getMcpPrepareReceipt"]>>().mockResolvedValue(historical);
  const read = vi.fn().mockResolvedValue(pendingServer);
  const authorize = vi.fn();
  const hub = { ...createHubClient(), preparePrivateMcpServer: prepare, getMcpPrepareReceipt: lookup, beginMcpConnectorAuthorization: authorize,
    getPrivateMcpServer: read, getMcpConnector: vi.fn().mockResolvedValue(pendingConnector),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [pendingConnector], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) };
  const boundary = { admitted: true, generation: 1, subject: `lookup-detail-${current}` };
  const content = (generation: number) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ ...boundary, generation }}><McpContent client={hub} initialView="connections" readBoundary={{ ...boundary, generation }} /></ConnectorCommandProvider></LocaleProvider>;
  const view = render(content(1));
  fireEvent.click(await screen.findByRole("button", { name: pendingServer.display_name }));
  const dialog = await screen.findByRole("dialog", { name: pendingServer.display_name });
  fireEvent.click(await within(dialog).findByRole("button", { name: "连接" }));
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  const original = prepare.mock.calls[0]!.slice(0, 3);
  if (current === "failed_current") read.mockRejectedValue(new Error("Current read unavailable"));
  else read.mockResolvedValue({ ...pendingServer, state_version: "9" });
  const previousReads = read.mock.calls.length;
  view.rerender(content(2));
  await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(previousReads));
  const recover = await within(dialog).findByRole("button", { name: "查看连接结果" });
  await waitFor(() => expect(recover).toBeEnabled());
  fireEvent.click(recover);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(lookup).toHaveBeenCalledOnce(); expect(lookup.mock.calls[0]!.slice(0, 3)).toEqual(original);
  expect(prepare).toHaveBeenCalledOnce(); expect(authorize).not.toHaveBeenCalled();
});


it.each(["ready","needs_oauth"] as const)("stale disconnected detail adopts fresh %s Current without reserving or sending Prepare",async status=>{
 let current=false;
 const pendingServer:McpPrivateServer={availability:"unavailable",server_id:"fresh-detail-server",display_name:"Fresh Current MCP",server_url:"https://qa.example.test/mcp",status:"registered",state_version:"1",headers:[],transport:"streamable_http",prepare_status:"pending_prepare",declarations:[],declarations_available:false};
 const pendingConnector:McpConnector={availability:"unavailable",connector_id:"fresh-detail-connector",server_id:pendingServer.server_id,provider_key:"fresh-detail-provider",connector_type:"mcp",display_name:pendingServer.display_name,status:"pending",enabled:false,approved_scopes:[],state_version:"1"};
 const freshServer:McpPrivateServer={...pendingServer,state_version:"9",prepare_status:status,...(status==="ready"?{availability:"available",connection_id:"fresh-connection",declarations_available:true,declaration_digest:"a".repeat(64)}:{})};
 const freshConnector:McpConnector={...pendingConnector,state_version:"9",status:"active",enabled:true,...(status==="ready"?{availability:"available"}:{})};
 const prepare=vi.fn(),authorize=vi.fn();
 const hub={...createHubClient(),preparePrivateMcpServer:prepare,beginMcpConnectorAuthorization:authorize,getPrivateMcpServer:vi.fn(async()=>current?freshServer:pendingServer),getMcpConnector:vi.fn(async()=>current?freshConnector:pendingConnector),
 listMcpConnectors:vi.fn(async()=>({items:[pendingConnector],next_cursor:null})),listMcpConnectorProviders:vi.fn(async()=>({items:[],next_cursor:null})),listCustomApis:vi.fn(async()=>({items:[],page:{next_cursor:null}}))};
 const boundary={subject:"fresh-current-detail",admitted:true,generation:1};
 render(<LocaleProvider><ConnectorCommandProvider client={hub} boundary={boundary}><McpContent client={hub} initialView="connections" readBoundary={boundary}/></ConnectorCommandProvider></LocaleProvider>);
 fireEvent.click(await screen.findByRole("button",{name:pendingServer.display_name}));const dialog=await screen.findByRole("dialog",{name:pendingServer.display_name});
 const connect=await within(dialog).findByRole("button",{name:"连接"});current=true;fireEvent.click(connect);
 await within(dialog).findByRole("button",{name:status==="ready"?"试用一下":"重新连接"});
 expect(prepare).not.toHaveBeenCalled();expect(authorize).not.toHaveBeenCalled();expect(dialog).toBeVisible();expect(within(dialog).queryByRole("button",{name:"完成"})).toBeNull();
});


it("English configuration labels and JSON errors/copy feedback stay localized without exposing secret input or writing", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const state = await jsonConfigurationFixture(false, undefined, "streamable_http", "en")
    const configuration = screen.getByRole("dialog", { name: "MCP settings" })
    expect(within(configuration).getByRole("textbox", { name: "Server name" })).toHaveValue("JSON editor MCP")
    expect(within(configuration).getByRole("textbox", { name: "Notes (optional)" })).toHaveValue("Keep original note")
    expect(within(configuration).getByText("Configured")).toBeVisible()
    expect(within(configuration).getByRole("button", { name: "Copy UUID" })).toBeEnabled()
    const dialog = await state.openJson()
    const input = within(dialog).getByRole("textbox", { name: "MCP configuration JSON" })
    fireEvent.change(input, { target: { value: '{"mcpServers":{"A":{"type":"sse","url":"https://mcp.example.test","headers":{"x-secret":"private-error-sentinel"}}}}' } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The transport type of this connector cannot be changed.")
    expect(within(dialog).getByRole("alert")).not.toHaveTextContent("private-error-sentinel")
    const malformed = 'private-error-sentinel: malformed JSON'
    fireEvent.change(input, { target: { value: malformed } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a valid configuration containing exactly one MCP server. Only type, url and valid headers are supported.")
    expect(within(dialog).getByRole("alert")).not.toHaveTextContent("private-error-sentinel")
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy to clipboard" }))
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Copied to clipboard")
    expect(writeText).toHaveBeenCalledExactlyOnceWith(malformed)
    writeText.mockRejectedValueOnce(Error("private-clipboard-error"))
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy to clipboard" }))
    expect(await within(dialog).findByText("Copy failed. Try again.")).toBeVisible()
    expect(dialog).not.toHaveTextContent("private-clipboard-error")
    expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
    expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(navigator, "clipboard", previous)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

it("the MCP detail/configuration slice has explicit messages in all nine runtime locales", () => {
  const keys = [
    "mcp.active", "mcp.availability.refreshRequired", "mcp.availability.refreshing",
    "mcp.availability.reauthorizationRequired", "mcp.availability.unavailable", "settings.connect",
    "mcp.iconLabel", "mcp.iconHint",
    "mcp.registerDialogTitle", "connectorCatalog.copyUuid", "mcp.customName", "mcp.customTransport",
    "mcp.customInstructions", "mcp.optional", "mcp.customInstructionsPlaceholder", "mcp.customServerUrl",
    "mcp.customHeaders", "mcp.customHeaderNamePlaceholder", "mcp.customHeaderValuePlaceholder",
    "mcp.customAddHeader", "mcp.customSaveOptions", "mcp.save", "mcp.cancel", "mcp.delete",
    "mcp.details", "mcp.detailCategory", "mcp.detailConnectorType", "mcp.disconnectConnection", "mcp.publishTitle",
    "mcp.jsonImportDescription", "connectorCatalog.customMcp", "settings.manage", "mcp.actionFailed",
    "mcp.saveChanges", "mcp.deleteConfirm", "mcp.description", "mcp.edit", "mcp.publishRecoveryError",
    "mcp.publishRetryRead", "mcp.errHeaderName", "mcp.tryAction", "mcp.configurationEdit", "mcp.configurationEditJson",
    "mcp.configurationJsonTitle", "mcp.configurationJsonLabel", "mcp.configurationJsonHelp", "mcp.configurationJsonInvalid",
    "mcp.configurationTransportImmutable", "mcp.configurationHeadersDuplicate", "mcp.configurationHeadersInvalid",
    "mcp.configurationCopy", "mcp.configurationCopied", "mcp.configurationCopyFailed", "mcp.headerConfigured",
    "mcp.removeNamedHeader", "mcp.removeNewHeader", "mcp.uncategorized", "mcp.customDeleteConfirm", "mcp.provideFeedback",
  ] as const
  const localizedDefaults = new Set<string>([
    "mcp.active", "mcp.availability.refreshRequired", "mcp.availability.refreshing",
    "mcp.availability.reauthorizationRequired", "mcp.availability.unavailable", "settings.connect",
    "mcp.registerDialogTitle", "mcp.save", "mcp.iconLabel", "mcp.iconHint",
  ])
  for (const locale of LOCALES) for (const key of keys) {
    const source: Readonly<Record<string, string | undefined>> = locale === "zh" ? zh : OVERLAYS[locale]
    expect.soft(source[key]?.trim(), `${locale}:${key}`).toBeTruthy()
    const resolved = resolveMessage(locale, key as keyof typeof zh, { name: "x-fixture" })
    expect.soft(resolved, `${locale}:${key}`).not.toBe(key)
    if (locale !== "zh" && locale !== "en" && localizedDefaults.has(key))
      expect.soft(resolved, `${locale}:${key} English placeholder`).not.toBe(resolveMessage("en", key as keyof typeof zh))
    if (locale !== "zh" && locale !== "ja") expect.soft(resolved, `${locale}:${key}`).not.toMatch(/[\u3400-\u9fff]/u)
  }
})


it.each([
  { kind: "duplicate", expected: "Custom header names must be unique." },
  { kind: "invalid", expected: "Custom headers are invalid or exceed the allowed count or size." },
  { kind: "unexpected", expected: "Enter a valid configuration containing exactly one MCP server. Only type, url and valid headers are supported." },
] as const)("JSON local $kind save validation maps a safe error category, never the thrown secret", ({ kind, expected }) => {
  localStorage.setItem("kokoro.locale", "en")
  const onSave = vi.fn(() => {
    if (kind === "unexpected") throw Error("private-thrown-sentinel")
    const headers = kind === "duplicate"
      ? [{ name: "x-one", value: "private-thrown-sentinel" }, { name: "X-One", value: "private-thrown-sentinel" }]
      : [{ name: "Authorization", value: "private-thrown-sentinel" }]
    mergeConfigurationJsonHeaders(headers, [])
  })
  render(<LocaleProvider><McpConfigurationJsonDialog
    initialJson={JSON.stringify({ mcpServers: { Local: { type: "streamableHttp", url: "https://mcp.example.test/mcp" } } })}
    transport="streamable_http" locked={false} status={null} isCurrent={() => true}
    onSave={onSave} onClose={vi.fn()} returnFocusRef={{ current: null }} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(onSave).toHaveBeenCalledOnce()
  expect(screen.getByRole("alert")).toHaveTextContent(expected)
  expect(screen.getByRole("alert")).not.toHaveTextContent("private-thrown-sentinel")
})


it("French MCP detail translates unavailable qualification and the connection action without starting it", () => {
  localStorage.setItem("kokoro.locale", "fr")
  const connector: McpConnector = { availability: "unavailable", connector_id: "french-connector", server_id: "french-server",
    provider_key: "french-provider", connector_type: "mcp", status: "active", enabled: true, state_version: "1", approved_scopes: [] }
  const server: McpPrivateServer = { availability: "unavailable", server_id: "french-server", display_name: "French MCP",
    server_url: "https://mcp.example.test/french", status: "registered", state_version: "1", transport: "streamable_http",
    headers: [], prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const command = vi.fn()
  render(<LocaleProvider><CustomMcpDetailDialog connector={connector} server={server} admitted
    actionId={null} actionError={false} deleteId={null} managementCommand={undefined}
    onResumeManagement={command} onSaveConfiguration={command} onPrepare={command}
    onAuthorize={command} onDisconnect={command} onDeleteIntent={command} onDelete={command} onCancelDelete={command}
    returnFocusRef={{ current: null }} onClose={command} /></LocaleProvider>)
  const detail = screen.getByRole("dialog", { name: server.display_name })
  expect(within(detail).getByLabelText("Actuellement indisponible")).toHaveTextContent("Actuellement indisponible")
  expect(within(detail).getByRole("button", { name: "Connecter" })).toBeEnabled()
  expect(within(detail).queryByText("暂不可用")).toBeNull()
  expect(within(detail).queryByRole("button", { name: "Connect" })).toBeNull()
  expect(command).not.toHaveBeenCalled()
})


it("French MCP configuration localizes its default title, save action and icon guidance without uploading", async () => {
  const state = await jsonConfigurationFixture(false, undefined, "streamable_http", "fr")
  const configuration = screen.getByRole("dialog", { name: "Paramètres MCP" })
  expect(within(configuration).getByRole("button", { name: "Enregistrer" })).toBeEnabled()
  expect(within(configuration).getByText("Icône")).toBeVisible()
  expect(within(configuration).getByText("PNG ou JPG, 1 Mo maximum. Taille recommandée : 256×256 pixels.")).toBeVisible()
  expect(state.update).not.toHaveBeenCalled(); expect(state.prepare).not.toHaveBeenCalled()
  expect(state.register).not.toHaveBeenCalled(); expect(state.importJson).not.toHaveBeenCalled()
})

it.each([{ failedRead: false, badProvider: false }, { failedRead: true, badProvider: false }, { failedRead: false, badProvider: true }])("explicit New Authorization uses exact pending reads (read failure $failedRead, bad provider $badProvider), never Prepare or OAuth", async ({ failedRead, badProvider }) => {
  localStorage.setItem("kokoro.locale", "en")
  const removed: McpConnector = { availability: "unavailable", connector_id: "removed-source", server_id: "saved-server", provider_key: "private-saved-server",
    connector_type: "mcp", display_name: "Removed configuration", status: "revoked", enabled: false, state_version: "7", approved_scopes: [] }
  const saved: McpPrivateServer = { availability: "unavailable", server_id: "saved-server", display_name: "Removed configuration",
    server_url: "https://mcp.example.test/saved", status: "registered", state_version: "4", headers: [], transport: "streamable_http",
    prepare_status: "pending_prepare", declarations: [], declarations_available: false }
  const pendingConnector: McpConnector = { ...removed, connector_id: "new-pending", status: "pending", state_version: "1" }
  const pendingServer: McpPrivateServer = { ...saved, status: "pending", state_version: "5" }
  let confirmed = false, failedOnce = false
  const reauthorize = vi.fn(async () => { confirmed = true; return mcpReauthorizationDataSchema.parse({ server: pendingServer, connector: badProvider ? { ...pendingConnector, provider_key: "private-other-server" } : pendingConnector, replayed: false }) })
  const prepare = vi.fn(), oauth = vi.fn(), enable = vi.fn()
  const client = { ...createHubClient(), reauthorizePrivateMcpServer: reauthorize, preparePrivateMcpServer: prepare,
    beginMcpConnectorAuthorization: oauth, reconnectMcpConnectorAuthorization: oauth, setMcpConnectorEnabled: enable,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [removed], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    getMcpConnector: vi.fn(async (id: string) => {
      if (id === pendingConnector.connector_id && failedRead && !failedOnce) { failedOnce = true; throw Error("fresh read unavailable") }
      return id === pendingConnector.connector_id ? pendingConnector : removed
    }),
    getPrivateMcpServer: vi.fn(async () => confirmed ? pendingServer : saved) }
  const boundary = { subject: "removed-owner", admitted: true, generation: 1 }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}>
    <McpContent client={client} initialView="connections" readBoundary={boundary} />
  </ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: saved.display_name }))
  const action = await screen.findByRole("button", { name: "Create new authorization" })
  await waitFor(() => expect(action).toBeEnabled())
  expect(reauthorize).not.toHaveBeenCalled()
  fireEvent.click(action)
  await waitFor(() => expect(reauthorize).toHaveBeenCalledOnce())
  expect(reauthorize).toHaveBeenCalledWith(saved.server_id, { source_connector_id: removed.connector_id,
    expected_server_state_version: "4", expected_connector_state_version: "7" }, expect.any(String), expect.any(AbortSignal))
  if (badProvider) {
    await screen.findByRole("button", { name: "Retry original request" })
    expect(client.getMcpConnector.mock.calls.some(([id]) => id === pendingConnector.connector_id)).toBe(false)
    expect(client.getPrivateMcpServer).toHaveBeenCalledOnce()
    expect(prepare).not.toHaveBeenCalled(); expect(oauth).not.toHaveBeenCalled(); expect(enable).not.toHaveBeenCalled()
    return
  }
  await waitFor(() => expect(client.getMcpConnector).toHaveBeenCalledWith(pendingConnector.connector_id, expect.any(AbortSignal)))
  if (failedRead) {
    fireEvent.click(await screen.findByRole("button", { name: "Reload added connectors" }))
    await waitFor(() => expect(client.getMcpConnector.mock.calls.filter(([id]) => id === pendingConnector.connector_id).length).toBe(2))
    expect(reauthorize).toHaveBeenCalledOnce()
  }
  await waitFor(() => expect(client.getPrivateMcpServer.mock.calls.length).toBeGreaterThan(1))
  expect(prepare).not.toHaveBeenCalled(); expect(oauth).not.toHaveBeenCalled(); expect(enable).not.toHaveBeenCalled()
})
