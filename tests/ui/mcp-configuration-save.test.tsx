import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createHubClient } from "@/hub/client"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpContent } from "@/ui/mcp/mcp-content"
import { McpTrialProvider } from "@/ui/mcp/mcp-trial-context"
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"

beforeEach(() => localStorage.setItem("kokoro.locale", "zh"))
afterEach(cleanup)

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
  fireEvent.change(screen.getByLabelText("Header name"), { target: { value: "x-test-key" } })
  fireEvent.change(screen.getByLabelText("Header value"), { target: { value: "fixture-secret" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  if (mode === "unknown-then-replayed") {
    const retry = await screen.findByRole("button", { name: "重试原请求" })
    expect(screen.getByLabelText("Header value")).toHaveValue("fixture-secret")
    expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveAttribute("readonly")
    fireEvent.click(retry)
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1]?.slice(0, 3)).toEqual(update.mock.calls[0]?.slice(0, 3))
  }
  if (mode === "read-failed") {
    await within(dialog).findByRole("button", { name: "重试" })
    expect(screen.getByLabelText("传输类型 —")).toBeInTheDocument()
    fireEvent.click(await within(dialog).findByRole("button", { name: "重试" }))
  }
  await waitFor(() => expect(read).toHaveBeenCalledTimes(mode === "read-failed" ? 3 : 2))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBe(dialog)
  expect(screen.queryByLabelText("Header value")).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("First saved name")
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(screen.getByLabelText("传输类型 HTTP")).toHaveTextContent("HTTP")
  expect(within(dialog).queryByText("正在加载…")).not.toBeInTheDocument()
  const pendingPrimary = screen.getByRole("button", { name: mode === "confirmed" ? "试用一下" : "连接" })
  expect(pendingPrimary).toBeDisabled()
  fireEvent.click(pendingPrimary)
  expect(trial).not.toHaveBeenCalled()
  await act(async () => { releaseRead(); await pendingRead })
  await waitFor(() => expect(screen.getByRole("textbox", { name: "服务器名称" })).not.toHaveAttribute("readonly"))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBe(dialog)
  expect(screen.getByRole("button", { name: "试用一下" })).toBeEnabled()
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
  expect(screen.queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "试用一下" }))
  expect(trial).not.toHaveBeenCalled()
  expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveValue("https://mcp.example.test/mcp")
  expect(screen.getByRole("textbox", { name: "备注 （可选）" })).toHaveValue("Saved note")
  expect(update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "3", display_name: "First saved name", header_upserts: [{ name: "x-test-key", value: "fixture-secret" }] })
  expect(update.mock.calls[confirmedCalls]?.[1]).toEqual({ expected_state_version: "4", display_name: "Second saved name" })
  expect(update.mock.calls[confirmedCalls]?.[2]).not.toBe(update.mock.calls[0]?.[2])
  await act(async () => { releaseSecondRead(); await pendingSecondRead })
})

// Native storage is covered separately; these jsdom tests retain all original command/UI assertions.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});


async function confirmedPrimary(connected: boolean) {
  const boundary = { admitted: true, generation: 3, subject: "primary-display-actor" }
  const connector: McpConnector = { availability: "available", connector_id: "primary-connector", server_id: "primary-server",
    provider_key: "primary-provider", connector_type: "mcp", display_name: "Primary MCP", status: "active", enabled: true,
    approved_scopes: [], state_version: "3" }
  const server: McpPrivateServer = { availability: "available", server_id: "primary-server", display_name: "Primary MCP",
    server_url: "https://mcp.example.test/mcp", notes: "Original note", status: "registered", state_version: "3", headers: [],
    transport: "streamable_http", prepare_status: connected ? "ready" : "pending_prepare", declarations: [], declarations_available: true,
    ...(connected ? { connection_id: "primary-connection" } : {}) }
  const trial = vi.fn(() => true), prepare = vi.fn(), save = vi.fn()
  let props: Parameters<typeof CustomMcpDetailDialog>[0] = { connector, server, admitted: true, iconBoundary: boundary,
    actionId: null, managementCommand: undefined, onResumeManagement: vi.fn(), actionError: false, deleteId: null,
    returnFocusRef: { current: null }, onClose: vi.fn(), onSaveConfiguration: save, onPrepare: prepare, onTrial: trial,
    onAuthorize: vi.fn(), onDisconnect: vi.fn(), onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn() }
  const view = render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>)
  const update = (next: Partial<typeof props>) => { props = { ...props, ...next }; view.rerender(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>) }
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }))
  const label = connected ? "试用一下" : "连接"
  const icon = screen.getByRole("button", { name: label }).querySelector("svg")?.outerHTML
  expect(icon).toBeTruthy()
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Submitted primary note" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledOnce()
  const confirmation = {}
  update({ server: null, connector: null, configurationSaved: confirmation })
  return { update, trial, prepare, save, label, icon, boundary, server, connector, confirmation }
}

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

it.each(["read error", "unknown command", "actor", "generation", "admission", "target"])("pending primary display retires on %s and never revives before fresh facts", async reason => {
  const state = await confirmedPrimary(true)
  expect(screen.getByRole("button", { name: "试用一下" })).toBeDisabled()
  const changed: Partial<Parameters<typeof CustomMcpDetailDialog>[0]> = reason === "read error" ? { pendingError: true }
    : reason === "unknown command" ? { managementCommand: { kind: "unknown", operation: "update_server", connectorId: state.connector.connector_id, serverId: state.server.server_id } }
    : reason === "actor" ? { iconBoundary: { ...state.boundary, subject: "other-actor" } }
    : reason === "generation" ? { iconBoundary: { ...state.boundary, generation: 4 } }
    : reason === "admission" ? { admitted: false }
    : { server: { ...state.server, server_id: "other-server" } }
  state.update(changed)
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  if (reason === "read error") expect(screen.getByRole("alert")).toBeInTheDocument()
  state.update({ server: null, connector: null, iconBoundary: state.boundary, admitted: true, pendingError: false, managementCommand: undefined })
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "连接" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "连接" }))
  expect(state.trial).not.toHaveBeenCalled()
  expect(state.prepare).not.toHaveBeenCalled()
})
