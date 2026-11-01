import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createHubClient, type HubClient } from "@/hub/client"
import type { McpConnector } from "@/hub/mcp-connector.schema"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"
import { McpPersonalServerGallery, visiblePersonalMcpServers } from "@/ui/mcp/mcp-personal-server-gallery"

const personal = {
  connector_id: "personal-exact", server_id: "personal-server", provider_key: "private-mcp",
  connector_type: "mcp", display_name: "My saved MCP", description: "Personal documentation tools",
  status: "active", enabled: true, availability: "unavailable", approved_scopes: [], state_version: "2",
} satisfies McpConnector
beforeEach(() => { window.localStorage.setItem("kokoro.locale", "en") })
afterEach(() => { cleanup(); window.sessionStorage.clear(); window.localStorage.removeItem("kokoro.locale"); vi.useRealTimers() })
function clientFor(list: HubClient["listMcpConnectors"]) {
  return { ...createHubClient(), listMcpConnectors: list,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    getMcpConnector: vi.fn().mockResolvedValue(personal),
    getPrivateMcpServer: vi.fn().mockResolvedValue({ server_id: personal.server_id, display_name: personal.display_name,
      server_url: "https://mcp.example.test/mcp", status: "registered", availability: "unavailable",
      state_version: "3", headers: [], transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false }),
    createMcpConnector: vi.fn(), preparePrivateMcpServer: vi.fn(), updatePrivateMcpServer: vi.fn(),
  }
}
function plaza(client: HubClient, subject = "personal-gallery", admitted = true, generation = 0) {
  return <LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject, admitted, generation }}>
    <McpProjectionRead client={client} identity={subject} admitted={admitted} readGeneration={generation} embedded initialView="catalog" />
  </ConnectorCommandProvider></LocaleProvider>
}
it("shows a second-page saved MCP in an empty provider plaza and opens only its exact fresh detail", async () => {
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockImplementation(async params => params?.cursor
    ? { items: [personal], next_cursor: null }
    : { items: [{ ...personal, connector_id: "provider-only", server_id: undefined }], next_cursor: "second-page" })
  const client = clientFor(list)
  render(plaza(client))
  const card = await screen.findByRole("button", { name: personal.display_name })
  expect(list).toHaveBeenCalledTimes(2)
  expect(list.mock.calls[1]?.[0]).toEqual({ limit: 100, cursor: "second-page" })
  expect(screen.queryByText("No connector providers are available to add right now.")).not.toBeInTheDocument()
  expect(card).toHaveTextContent("Currently unavailable")
  fireEvent.click(card)
  await waitFor(() => expect(client.getMcpConnector).toHaveBeenCalledWith(personal.connector_id, expect.any(AbortSignal)))
  await waitFor(() => expect(client.getPrivateMcpServer).toHaveBeenCalledWith(personal.server_id, expect.any(AbortSignal)))
  expect(await screen.findByRole("dialog")).toBeInTheDocument()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(client.updatePrivateMcpServer).not.toHaveBeenCalled()
  expect(list).toHaveBeenCalledTimes(2)
})
it("keeps an unread or cyclic personal scan unknown rather than claiming the whole plaza is empty", async () => {
  let resolve!: (value: { items: McpConnector[]; next_cursor: string | null }) => void
  const first = new Promise<{ items: McpConnector[]; next_cursor: string | null }>(done => { resolve = done })
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockImplementationOnce(() => first)
    .mockResolvedValue({ items: [personal], next_cursor: "cycle" })
  render(plaza(clientFor(list), "personal-unknown"))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  expect(screen.queryByText("No connector providers are available to add right now.")).not.toBeInTheDocument()
  await act(async () => { resolve({ items: [personal], next_cursor: "cycle" }) })
  await screen.findByText("Added connections could not load")
  expect(screen.queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  expect(screen.queryByText("No connector providers are available to add right now.")).not.toBeInTheDocument()
  expect(screen.queryByText("No matching connections")).not.toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(2)
})


it("uses only a positive typed server locator and searches owner name/description in All", () => {
  const noServer: McpConnector = { ...personal, connector_id: "missing-server" }; delete noServer.server_id
  const revoked = { ...personal, connector_id: "revoked", status: "revoked" as const }
  const builtin = { ...personal, connector_id: "not-mcp", connector_type: "builtin" as const }
  const props = { connectors: [personal, noServer, revoked, builtin], admitted: true, confirmed: true, query: "DOCUMENTATION", category: "all" }
  expect(visiblePersonalMcpServers(props)).toEqual([personal])
  expect(visiblePersonalMcpServers({ ...props, query: " MY SAVED " })).toEqual([personal])
  for (const gate of [{ admitted: false }, { confirmed: false }, { category: "efficiency" }, { query: personal.connector_id }])
    expect(visiblePersonalMcpServers({ ...props, ...gate })).toEqual([])
})
it("keeps a disabled revoked MCP configuration visible without treating Provider or enabled revoked rows as saved servers", () => {
  const saved = { ...personal, status: "revoked" as const, enabled: false }
  const provider = { ...saved, connector_id: "provider-only", server_id: undefined }
  const builtin = { ...saved, connector_id: "builtin", connector_type: "builtin" as const }
  expect(visiblePersonalMcpServers({ connectors: [saved, provider, builtin, { ...saved, enabled: true }],
    admitted: true, confirmed: true, category: "all", query: "documentation" })).toEqual([saved])
})

it.each(["catalog", "connections"] as const)("opens a saved disconnected configuration through exact private reads only (%s)", async view => {
  const saved = { ...personal, status: "revoked" as const, enabled: false, state_version: "4" }
  const client = clientFor(vi.fn().mockResolvedValue({ items: [saved], next_cursor: null }))
  client.getMcpConnector.mockResolvedValue(saved)
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: `saved-${view}`, admitted: true, generation: 0 }}>
    <McpProjectionRead client={client} identity={`saved-${view}`} embedded initialView={view} />
  </ConnectorCommandProvider></LocaleProvider>)
  const card = await screen.findByRole("button", { name: saved.display_name })
  expect(card).toHaveTextContent("Disconnected")
  expect(within(card).queryByText("Currently unavailable")).toBeNull()
  expect(client.getPrivateMcpServer).not.toHaveBeenCalled()
  fireEvent.click(card)
  const detail = await screen.findByRole("dialog", { name: saved.display_name })
  expect(client.getMcpConnector).toHaveBeenCalledExactlyOnceWith(saved.connector_id, expect.any(AbortSignal))
  expect(client.getPrivateMcpServer).toHaveBeenCalledExactlyOnceWith(saved.server_id, expect.any(AbortSignal))
  expect(within(detail).getByText("https://mcp.example.test/mcp")).toBeVisible()
  expect(within(detail).getByText("Disconnected")).toBeVisible()
  expect(within(detail).getByText("This connection has been disconnected. Saved configuration is read-only. Create a new authorization, then connect again.")).toBeVisible()
  expect(within(detail).queryByText("Currently unavailable")).toBeNull()
  expect(within(detail).queryByRole("button", { name: "管理" })).toBeNull()
  expect(within(detail).queryByRole("button", { name: /Connect|连接|试用/ })).toBeNull()
  expect(client.createMcpConnector).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(client.updatePrivateMcpServer).not.toHaveBeenCalled()
})
it.each([false, true])("creates a separate authorization and requires fresh new identity reads before explicit Connect (lost ACK=%s)", async lost => {
  const saved = { ...personal, status: "revoked" as const, enabled: false, state_version: "4" }
  const next = { ...personal, connector_id: "new-authorization-connector", status: "pending" as const, enabled: false, state_version: "1" }
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockResolvedValue({ items: [saved], next_cursor: null })
  const client = clientFor(list)
  const oldServer = personal.server_id
  const server = { server_id: oldServer, display_name: "New authorization current", server_url: "https://mcp.example.test/mcp", status: "pending" as const,
    availability: "unavailable" as const, state_version: "4", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false }
  let release!: (value: McpConnector) => void
  const fresh = new Promise<McpConnector>(done => { release = done })
  client.getMcpConnector.mockImplementation(async id => id === next.connector_id ? fresh : saved)
  client.getPrivateMcpServer.mockResolvedValue({ ...server, display_name: saved.display_name, state_version: "3", status: "registered" })
  const reauthorize = vi.fn().mockImplementation(async () => {
    if (lost && reauthorize.mock.calls.length === 1) throw new Error("lost new authorization ACK")
    list.mockResolvedValue({ items: [next], next_cursor: null })
    client.getPrivateMcpServer.mockResolvedValue(server)
    return { server, connector: next, replayed: lost }
  })
  const hub = { ...client, reauthorizePrivateMcpServer: reauthorize }
  render(plaza(hub, `new-authorization-${lost}`))
  fireEvent.click(await screen.findByRole("button", { name: saved.display_name }))
  const detail = await screen.findByRole("dialog", { name: saved.display_name })
  const create = within(detail).getByRole("button", { name: "Create new authorization" })
  await waitFor(() => expect(create).toBeEnabled())
  fireEvent.click(create); fireEvent.click(create)
  await waitFor(() => expect(reauthorize).toHaveBeenCalledOnce())
  expect(reauthorize.mock.calls[0]?.slice(0, 2)).toEqual([saved.server_id, { source_connector_id: saved.connector_id, expected_server_state_version: "3", expected_connector_state_version: "4" }])
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
  if (lost) {
    fireEvent.click(await within(detail).findByRole("button", { name: "Retry original request" }))
    await waitFor(() => expect(reauthorize).toHaveBeenCalledTimes(2))
    expect(reauthorize.mock.calls[1]?.slice(0, 3)).toEqual(reauthorize.mock.calls[0]?.slice(0, 3))
  }
  await waitFor(() => expect(client.getMcpConnector).toHaveBeenCalledWith(next.connector_id, expect.any(AbortSignal)))
  expect(screen.queryByRole("button", { name: "Connect" })).toBeNull()
  expect(screen.queryByText(server.display_name)).toBeNull()
  await act(async () => { release(next) })
  const current = await screen.findByRole("dialog", { name: server.display_name })
  expect(client.getPrivateMcpServer).toHaveBeenLastCalledWith(server.server_id, expect.any(AbortSignal))
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(within(current).queryByText("Disconnected")).toBeNull()
  client.preparePrivateMcpServer.mockRejectedValue(new Error("stop after explicit new Connect"))
  fireEvent.click(within(current).getByRole("button", { name: "Connect" }))
  await waitFor(() => expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce())
  expect(client.preparePrivateMcpServer.mock.calls[0]?.slice(0, 2)).toEqual([server.server_id, server.state_version])
})

it("uses exact connector identities for duplicate personal names without turning an empty gallery into an empty-directory assertion", () => {
  const other = { ...personal, connector_id: "other-exact", server_id: "other-server", description: "Other description" }
  const select = vi.fn()
  const props = { connectors: [personal, other], providers: [], admitted: true, confirmed: true, query: "", category: "all", onSelect: select }
  const view = render(<LocaleProvider><McpPersonalServerGallery {...props} /></LocaleProvider>)
  const second = screen.getAllByRole("button", { name: personal.display_name })[1]!
  fireEvent.click(second)
  expect(select).toHaveBeenLastCalledWith(other, second)
  view.rerender(<LocaleProvider><McpPersonalServerGallery {...props} category="efficiency" /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  expect(screen.queryByText("No matching connections")).not.toBeInTheDocument()
})
it.each(["actor", "generation", "admission"] as const)("retires the prior confirmed personal rows at the %s boundary rather than restoring them after failed revalidation", async change => {
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockResolvedValueOnce({ items: [personal], next_cursor: null }).mockRejectedValue(new Error("current read failed"))
  const client = clientFor(list)
  const view = render(plaza(client, "personal-retire"))
  await screen.findByRole("button", { name: personal.display_name })
  if (change === "admission") {
    view.rerender(plaza(client, "personal-retire", false))
    expect(screen.queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  }
  view.rerender(plaza(client, change === "actor" ? "next-personal-actor" : "personal-retire", true, change === "generation" ? 1 : 0))
  await screen.findByText("Added connections could not load")
  expect(screen.queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  expect(screen.queryByText("No connector providers are available to add right now.")).not.toBeInTheDocument()
})
it("keeps exhausted relation pagination unknown without publishing a partial personal collection", async () => {
  let page = 0
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockImplementation(async () => ({ items: [personal], next_cursor: `page-${++page}` }))
  render(plaza(clientFor(list), "personal-page-budget"))
  await screen.findByText("Added connections could not load")
  expect(list).toHaveBeenCalledTimes(50)
  expect(screen.queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  expect(screen.queryByText("No connector providers are available to add right now.")).not.toBeInTheDocument()
})
it("keeps the shared ten-second scan deadline unknown even if its current list promise ignores cancellation", async () => {
  vi.useFakeTimers()
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockImplementation(() => new Promise(() => {}))
  render(plaza(clientFor(list), "personal-deadline"))
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByText("Added connections could not load")).toBeInTheDocument()
  expect(list).toHaveBeenCalledTimes(1)
  expect(list.mock.calls[0]?.[1]?.aborted).toBe(true)
  expect(screen.queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  expect(screen.queryByText("No connector providers are available to add right now.")).not.toBeInTheDocument()
})


it.each(["delete_server", "disconnect", "late_delete_ack"] as const)("a Settings %s confirmation retires the plaza card even if its own relation re-read fails", async scenario => {
  let removed = false
  let current: McpConnector = personal
  let resolveDelete!: (value: { server_id: string; deleted: true; replayed: boolean }) => void
  const pendingDelete = new Promise<{ server_id: string; deleted: true; replayed: boolean }>(done => { resolveDelete = done })
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockImplementation(async () => {
    if (removed) throw new Error("confirmed deletion but fresh projection unavailable")
    return { items: [current], next_cursor: null }
  })
  const client = { ...clientFor(list),
    deletePrivateMcpServer: vi.fn(async () => {
      if (scenario === "late_delete_ack") return pendingDelete
      removed = true
      return { server_id: personal.server_id, deleted: true as const, replayed: false }
    }),
    removeMcpConnector: vi.fn(async () => { removed = true; return { ...personal, status: "revoked" as const, state_version: "3" } }),
  }
  const both = (showSettings: boolean, refreshKey = 0) => <LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "cross-instance-removal", admitted: true, generation: 0 }}>
    <div data-testid="retained-plaza"><McpProjectionRead client={client} identity="cross-instance-removal" embedded initialView="catalog" refreshKey={refreshKey} /></div>
    {showSettings ? <div data-testid="independent-settings"><McpProjectionRead client={client} identity="cross-instance-removal" embedded settingsLayout initialView="connections" /></div> : null}
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(both(true))
  const originalPlaza = await within(screen.getByTestId("retained-plaza")).findByRole("button", { name: personal.display_name })
  const settings = screen.getByTestId("independent-settings")
  fireEvent.click(await within(settings).findByRole("button", { name: personal.display_name }))
  const dialog = await screen.findByRole("dialog")
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "管理" })).toBeEnabled())
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" })
  if (scenario === "disconnect") {
    fireEvent.click(await screen.findByRole("menuitem", { name: "断开连接" }))
    await waitFor(() => expect(client.removeMcpConnector).toHaveBeenCalledOnce())
  } else {
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm removal" }))
    await waitFor(() => expect(client.deletePrivateMcpServer).toHaveBeenCalledOnce())
  }
  if (scenario === "late_delete_ack") {
    view.rerender(both(false))
    await act(async () => { removed = true; resolveDelete({ server_id: personal.server_id, deleted: true as const, replayed: false }) })
  } else {
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    view.rerender(both(false))
  }
  await within(screen.getByTestId("retained-plaza")).findByText("Added connections could not load")
  expect(originalPlaza).not.toBeInTheDocument()
  expect(within(screen.getByTestId("retained-plaza")).queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
  if (scenario === "disconnect") {
    // A stale pre-revocation active row is not restoration; a later connector CAS is.
    removed = false
    view.rerender(both(false, 1))
    await waitFor(() => expect(within(screen.getByTestId("retained-plaza")).queryByText("Added connections could not load")).not.toBeInTheDocument())
    expect(within(screen.getByTestId("retained-plaza")).queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
    current = { ...personal, status: "revoked", enabled: false, state_version: "2" }
    const callsBeforeStaleRevoked = list.mock.calls.length
    await act(async () => { view.rerender(both(false, 2)) })
    expect(list.mock.calls.length).toBeGreaterThan(callsBeforeStaleRevoked)
    expect(within(screen.getByTestId("retained-plaza")).queryByRole("button", { name: personal.display_name })).not.toBeInTheDocument()
    current = { ...personal, status: "revoked", enabled: false, state_version: "3" }
    view.rerender(both(false, 3))
    expect(await within(screen.getByTestId("retained-plaza")).findByRole("button", { name: personal.display_name })).toBeInTheDocument()
    current = { ...personal, state_version: "4" }
    view.rerender(both(false, 4))
    expect(await within(screen.getByTestId("retained-plaza")).findByRole("button", { name: personal.display_name })).toBeInTheDocument()
  }
})

// Native IndexedDB is verified separately; these UI journeys use the existing explicit journal port.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});

it("keeps an old read-only window locked when its exact owner read is active", async () => {
  const saved = { ...personal, status: "revoked" as const, enabled: false, state_version: "4" }
  const client = clientFor(vi.fn().mockResolvedValue({ items: [saved], next_cursor: null }))
  const reauthorize = vi.fn()
  client.getMcpConnector.mockResolvedValue({ ...personal, state_version: "4" })
  render(plaza({ ...client, reauthorizePrivateMcpServer: reauthorize }, "old-readonly-active"))
  fireEvent.click(await screen.findByRole("button", { name: saved.display_name }))
  const dialog = await screen.findByRole("dialog")
  await within(dialog).findByText("Added connectors could not load")
  expect(within(dialog).queryByRole("button", { name: "Create new authorization" })).toBeNull()
  expect(within(dialog).queryByRole("button", { name: /Connect|管理/ })).toBeNull()
  expect(reauthorize).not.toHaveBeenCalled()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
})
it("recovers the original unknown authorization after closing and source404, and refuses to prepare from its ACK when the new exact GET fails", async () => {
  const saved = { ...personal, status: "revoked" as const, enabled: false, state_version: "4" }
  const list = vi.fn<HubClient["listMcpConnectors"]>().mockResolvedValue({ items: [saved], next_cursor: null })
  const client = clientFor(list)
  client.getMcpConnector.mockResolvedValue(saved)
  const server = { server_id: saved.server_id!, display_name: saved.display_name, server_url: "https://mcp.example.test/mcp", status: "pending" as const,
    availability: "unavailable" as const, state_version: "4", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false }
  const next = { ...saved, connector_id: "next-authorization", status: "pending" as const, state_version: "1" }
  const reauthorize = vi.fn().mockRejectedValueOnce(new Error("unknown command outcome"))
    .mockResolvedValue({ server, connector: next, replayed: true })
  const hub = { ...client, reauthorizePrivateMcpServer: reauthorize }
  const page = (refreshKey = 0) => <LocaleProvider><ConnectorCommandProvider client={hub} boundary={{ subject: "unknown-closed", admitted: true, generation: 0 }}>
    <McpProjectionRead client={hub} identity="unknown-closed" embedded initialView="connections" refreshKey={refreshKey} />
  </ConnectorCommandProvider></LocaleProvider>
  const view = render(page())
  fireEvent.click(await screen.findByRole("button", { name: saved.display_name }))
  const detail = await screen.findByRole("dialog", { name: saved.display_name })
  await waitFor(() => expect(within(detail).getByRole("button", { name: "Create new authorization" })).toBeEnabled())
  fireEvent.click(within(detail).getByRole("button", { name: "Create new authorization" }))
  await within(detail).findByRole("button", { name: "Retry original request" })
  fireEvent.keyDown(detail, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  list.mockResolvedValue({ items: [], next_cursor: null })
  client.getMcpConnector.mockRejectedValue(new Error("exact current owner read unavailable"))
  view.rerender(page(1))
  fireEvent.click(await screen.findByRole("button", { name: `Retry original request · ${saved.connector_id}` }))
  const recovery = await screen.findByRole("dialog")
  await within(recovery).findByText("Added connectors could not load")
  fireEvent.click(within(recovery).getByRole("button", { name: "Retry original request" }))
  await waitFor(() => expect(reauthorize).toHaveBeenCalledTimes(2))
  expect(reauthorize.mock.calls[1]?.slice(0,3)).toEqual(reauthorize.mock.calls[0]?.slice(0,3))
  await waitFor(() => expect(client.getMcpConnector).toHaveBeenCalledWith(next.connector_id, expect.any(AbortSignal)))
  expect(screen.queryByRole("button", { name: "Connect" })).toBeNull()
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled()
  expect(client.updatePrivateMcpServer).not.toHaveBeenCalled()
  expect(reauthorize).toHaveBeenCalledTimes(2)
})
