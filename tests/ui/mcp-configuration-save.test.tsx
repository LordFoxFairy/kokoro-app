import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createHubClient, HubClientError } from "@/hub/client"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpContent } from "@/ui/mcp/mcp-content"
import { McpTrialProvider } from "@/ui/mcp/mcp-trial-context"
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog"
import { ProductReadRecheckProvider, type ProductRead401 } from "@/ui/auth/product-read-recheck-context"

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
  // A new name is not a configured descriptor until the fresh owner read.
  expect(screen.queryByText("x-test-key")).not.toBeInTheDocument()
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
  expect(screen.getByText("x-test-key")).toBeVisible()
  expect(screen.getByRole("button", { name: "移除 x-test-key" })).toBeDisabled()
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


async function confirmedPrimary(connected: boolean, headerDescriptors: McpPrivateServer["headers"] = []) {
  const boundary = { admitted: true, generation: 3, subject: "primary-display-actor" }
  const connector: McpConnector = { availability: "available", connector_id: "primary-connector", server_id: "primary-server",
    provider_key: "primary-provider", connector_type: "mcp", display_name: "Primary MCP", status: "active", enabled: true,
    approved_scopes: [], state_version: "3" }
  const server: McpPrivateServer = { availability: "available", server_id: "primary-server", display_name: "Primary MCP",
    server_url: "https://mcp.example.test/mcp", notes: "Original note", status: "registered", state_version: "3", headers: headerDescriptors,
    transport: "streamable_http", prepare_status: connected ? "ready" : "pending_prepare", declarations: [], declarations_available: true,
    ...(connected ? { connection_id: "primary-connection" } : {}) }
  const trial = vi.fn(() => true), prepare = vi.fn(), save = vi.fn()
  let props: Parameters<typeof CustomMcpDetailDialog>[0] = { connector, server, admitted: true, iconBoundary: boundary,
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
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Submitted primary note" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledOnce()
  const confirmation = {}
  update({ server: null, connector: null, configurationSaved: confirmation })
  const remount = () => { view.unmount(); view = render(<LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider>) }
  return { update, remount, trial, prepare, save, label, icon, boundary, server, connector, confirmation }
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

it.each(["read error", "unknown command", "actor", "generation", "admission", "target", "connector", "window"])("pending primary/header display retires on %s and never revives before fresh facts", async reason => {
  const state = await confirmedPrimary(true, [{ name: "x-confirmed-header", configured: true, status: "active", state_version: "2" }])
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
  expect(screen.queryByText("x-confirmed-header")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  if (reason === "read error") expect(screen.getByRole("alert")).toBeInTheDocument()
  state.update({ server: null, connector: null, iconBoundary: state.boundary, admitted: true, pendingError: false, managementCommand: undefined })
  expect(screen.queryByRole("button", { name: "试用一下" })).not.toBeInTheDocument()
  expect(screen.queryByText("x-confirmed-header")).not.toBeInTheDocument()
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
  fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Saved proof note" } })
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
  expect(await within(state.dialog).findByRole("button", { name: "重试" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(state.report).toHaveBeenCalledTimes(failure === "401" ? 1 : 0)
  expect(state.read).toHaveBeenCalledTimes(2)
  expect(state.patch).toHaveBeenCalledOnce()
  expect({ body: JSON.stringify(state.patch.mock.calls[0]?.[1]), key: state.patch.mock.calls[0]?.[2] }).toEqual(state.original)
})

it.each(["actor", "generation", "close", "unmount"] as const)("a late private-server HTTP401 after %s never requests readmission or replays Save", async retirement => {
  const state = await pendingPrivateServerRead()
  if (retirement === "actor") state.change({ subject: "different-reader" })
  else if (retirement === "generation") state.change({ generation: 8 })
  else if (retirement === "close") {
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
  const server = (): McpPrivateServer => ({ availability: "available", server_id: "header-server", display_name: "Header MCP",
    server_url: "https://mcp.example.test/mcp", notes: "Original note", status: "registered", state_version: String(version),
    headers: [
      { name: "x-present-key", configured: true, status: "active", state_version: String(version) },
      { name: "x-removed-key", configured: version === 1 || operation !== "remove", status: version > 1 && operation === "remove" ? "revoked" : "active", state_version: String(version) },
      { name: "x-revoked-key", configured: false, status: "revoked", state_version: "1" },
    ],
    transport: "streamable_http", prepare_status: "ready", declarations: [], declarations_available: true,
    declaration_digest: "a".repeat(64), connection_id: "header-connection" })
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
  expect(screen.queryByText("x-revoked-key")).not.toBeInTheDocument()
  if (operation === "notes") {
    fireEvent.change(screen.getByRole("textbox", { name: "备注 （可选）" }), { target: { value: "Updated note" } })
  } else if (operation === "rotate") {
    fireEvent.click(screen.getByRole("button", { name: "添加自定义 header" }))
    fireEvent.change(screen.getByLabelText("Header name"), { target: { value: "x-present-key" } })
    fireEvent.change(screen.getByLabelText("Header value"), { target: { value: "write-only-rotation-fixture" } })
  } else {
    fireEvent.click(screen.getByRole("button", { name: "移除 x-removed-key" }))
    expect(screen.queryByText("x-removed-key")).not.toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  expect(patch).toHaveBeenCalledOnce()
  expect(screen.queryByLabelText("Header value")).not.toBeInTheDocument()
  expect(screen.getByText("x-present-key")).toBe(confirmedRow)
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
  expect(screen.queryByLabelText("Header value")).not.toBeInTheDocument()
  if (operation === "remove") expect(screen.queryByText("x-removed-key")).not.toBeInTheDocument()
  expect(patch).toHaveBeenCalledOnce()
})
