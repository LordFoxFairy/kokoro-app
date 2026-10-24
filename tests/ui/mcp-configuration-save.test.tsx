import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createHubClient } from "@/hub/client"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpContent } from "@/ui/mcp/mcp-content"
import { McpTrialProvider } from "@/ui/mcp/mcp-trial-context"

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
    prepare_status: "ready", declarations: [], declarations_available: true, declaration_digest: "a".repeat(64), connection_id: "saved-connection" })
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
  render(<LocaleProvider><McpTrialProvider onTry={() => true}><ConnectorCommandProvider client={hub} boundary={boundary}>
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
    fireEvent.click(await within(dialog).findByRole("button", { name: "重试" }))
  }
  await waitFor(() => expect(read).toHaveBeenCalledTimes(mode === "read-failed" ? 3 : 2))
  expect(screen.getByRole("dialog", { name: "MCP 配置" })).toBe(dialog)
  expect(screen.queryByLabelText("Header value")).not.toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveValue("First saved name")
  expect(screen.getByRole("textbox", { name: "服务器名称" })).toHaveAttribute("readonly")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
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
  expect(screen.getByRole("textbox", { name: "服务器 URL" })).toHaveValue("https://mcp.example.test/mcp")
  expect(screen.getByRole("textbox", { name: "备注 （可选）" })).toHaveValue("Saved note")
  expect(update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "3", display_name: "First saved name", header_upserts: [{ name: "x-test-key", value: "fixture-secret" }] })
  expect(update.mock.calls[confirmedCalls]?.[1]).toEqual({ expected_state_version: "4", display_name: "Second saved name" })
  expect(update.mock.calls[confirmedCalls]?.[2]).not.toBe(update.mock.calls[0]?.[2])
  await act(async () => { releaseSecondRead(); await pendingSecondRead })
})
