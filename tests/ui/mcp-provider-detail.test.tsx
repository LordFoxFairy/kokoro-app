import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createHubClient, HubClientError } from "@/hub/client"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider, useMcpPreparationCommands } from "@/ui/mcp/connector-command-context"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema"
import type { McpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands"
import type { CustomApiProfile, CustomApiUpdateInput } from "@/hub/custom-api.schema"
import { CustomApiDetailDialog } from "@/ui/mcp/custom-api-detail-dialog"

afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals() })

function privateOAuthFixture() {
  const connector = { availability: "reauthorization_required", connector_id: "recover-private", server_id: "recover-server", connector_type: "mcp", provider_key: "recover-provider", display_name: "Recover private OAuth", status: "active", enabled: true, approved_scopes: [], state_version: "3" } satisfies McpConnector
  const server = { availability: "reauthorization_required", server_id: "recover-server", display_name: "Recover private server", server_url: "https://mcp.example.test/recover", status: "registered", state_version: "4", headers: [], prepare_status: "prepare_failed", authorization_status: "approved", declarations: [], declarations_available: false, oauth_client: { client_id: "public-client", configured: true, origin: "byo", status: "configured", state_version: "1" } } satisfies McpPrivateServer
  return { connector, server }
}

it.each(["lost ACK", "replay expired"])("reconnects failed private OAuth alongside an unknown Prepare without replacing its original bytes, key or CAS (%s)", async outcome => {
  const { act, waitFor, within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const { connector, server } = privateOAuthFixture()
  const resumable = outcome === "lost ACK"
  const prepare = vi.fn().mockRejectedValue(resumable ? new Error("Prepare ACK lost")
    : new HubClientError("http", "Inspect original command", "mcp_personal_command_replay_expired", 412, false))
  const reconnect = vi.fn().mockRejectedValueOnce(new Error("AS denied"))
    .mockResolvedValue({ authorization: { authorization_url: "https://oauth.example.test/explicit", expires_at: "2030-01-01T00:00:00Z" } })
  const navigate = vi.fn()
  const client = { ...createHubClient(), preparePrivateMcpServer: prepare, reconnectMcpConnectorAuthorization: reconnect,
    getMcpConnector: vi.fn().mockResolvedValue(connector), getPrivateMcpServer: vi.fn().mockResolvedValue(server),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const boundary = { subject: "private-reconnect-original", admitted: true, generation: 0 }
  let commands!: McpPreparationCommands
  function Probe() { commands = useMcpPreparationCommands(client, boundary.subject); return null }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}><Probe /><McpProjectionRead client={client} identity={boundary.subject} initialView="connections" onAuthorizationNavigate={navigate} /></ConnectorCommandProvider></LocaleProvider>)
  await act(async () => commands.prepare({ serverId: server.server_id, connectorId: connector.connector_id, version: server.state_version }, boundary))
  expect(commands.getSnapshot()[0]?.kind).toBe("unknown")
  const original = JSON.stringify(prepare.mock.calls[0]?.slice(0, 3))
  const open = async () => {
    fireEvent.click(await screen.findByRole("button", { name: connector.display_name }))
    return screen.findByRole("dialog", { name: server.display_name })
  }
  let dialog = await open()
  const recoveryLabel = resumable ? "重试原请求" : "需先核验状态"
  const resume = within(dialog).getByRole("button", { name: recoveryLabel })
  if (resumable) expect(resume).toBeEnabled()
  else expect(resume).toBeDisabled()
  fireEvent.click(within(dialog).getByRole("button", { name: "重新连接" }))
  await waitFor(() => expect(reconnect).toHaveBeenCalledOnce())
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "重新连接" })).toBeEnabled())
  expect(reconnect).toHaveBeenLastCalledWith(connector.connector_id, { server_id: server.server_id, expected_state_version: "3" }, expect.any(AbortSignal))
  expect(prepare).toHaveBeenCalledOnce()
  expect(commands.getSnapshot()[0]?.kind).toBe("unknown")
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  dialog = await open()
  fireEvent.click(within(dialog).getByRole("button", { name: recoveryLabel }))
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(resumable ? 2 : 1))
  if (resumable) expect(JSON.stringify(prepare.mock.calls[1]?.slice(0, 3))).toBe(original)
  expect(commands.getSnapshot()[0]?.kind).toBe("unknown")
  fireEvent.click(within(dialog).getByRole("button", { name: "重新连接" }))
  await waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith("https://oauth.example.test/explicit"))
  expect(prepare).toHaveBeenCalledTimes(resumable ? 2 : 1)
  expect(commands.getSnapshot()[0]?.kind).toBe("unknown")
  expect(JSON.stringify(prepare.mock.calls[0]?.slice(0, 3))).toBe(original)
})

it.each(["running Prepare", "unknown management"])("keeps private OAuth blocked during %s", async pending => {
  const { CustomMcpDetailDialog } = await import("@/ui/mcp/custom-mcp-detail-dialog")
  const { connector, server } = privateOAuthFixture()
  const authorize = vi.fn()
  render(<LocaleProvider><CustomMcpDetailDialog connector={connector} server={server} actionId={null} admitted
    preparationState={pending === "running Prepare" ? "running" : "idle"}
    managementCommand={pending === "unknown management" ? { connectorId: connector.connector_id, serverId: server.server_id, operation: "update_server", kind: "unknown" } : undefined}
    onResumeManagement={vi.fn()} actionError={false} deleteId={null} returnFocusRef={{ current: null }} onClose={vi.fn()}
    onSaveConfiguration={vi.fn()} onPrepare={vi.fn()} onAuthorize={authorize} onDisconnect={vi.fn()} onDeleteIntent={vi.fn()} onCancelDelete={vi.fn()} onDelete={vi.fn()} /></LocaleProvider>)
  const button = screen.getByRole("button", { name: pending === "running Prepare" ? "连接" : "重新连接" })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(authorize).not.toHaveBeenCalled()
})

it.each(["window", "actor", "admission"])("rejects private OAuth without the current admitted exact binding and ignores a retired %s's late ACK", async retired => {
  const { renderHook, act } = await import("@testing-library/react")
  const { usePrivateMcpAuthorization } = await import("@/ui/mcp/use-private-mcp-authorization")
  const { connector, server } = privateOAuthFixture()
  let finish!: (value: unknown) => void
  const reconnect = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const navigate = vi.fn()
  const client = { ...createHubClient(), reconnectMcpConnectorAuthorization: reconnect }
  const intent = { connectorId: connector.connector_id, serverId: server.server_id, window: {} }
  const hook = renderHook(({ admitted, identity, window }) => usePrivateMcpAuthorization({ client, identity, admitted, readGeneration: 0,
    intent: { ...intent, window }, blocked: false, onAuthorizationNavigate: navigate }), { initialProps: { admitted: true, identity: "original-actor", window: intent.window } })
  for (const [currentConnector, currentServer] of [
    [{ ...connector, status: "revoked" as const }, server],
    [connector, { ...server, status: "disabled" as const }],
    [connector, { ...server, server_id: "other-server" }],
    [{ ...connector, server_id: "other-server" }, server],
    [connector, { ...server, oauth_client: undefined }],
    [connector, { ...server, oauth_client: { ...server.oauth_client, status: "revoked" as const, configured: false } }],
  ] as const) await act(async () => hook.result.current.authorize(currentConnector, currentServer))
  expect(reconnect).not.toHaveBeenCalled()
  hook.rerender({ admitted: false, identity: "original-actor", window: intent.window })
  await act(async () => hook.result.current.authorize(connector, server))
  expect(reconnect).not.toHaveBeenCalled()
  hook.rerender({ admitted: true, identity: "original-actor", window: intent.window })
  let waiting!: Promise<void>
  act(() => { waiting = hook.result.current.authorize(connector, server) })
  expect(reconnect).toHaveBeenCalledOnce()
  const signal = reconnect.mock.calls[0]?.[2] as AbortSignal
  hook.rerender({ admitted: retired !== "admission", identity: retired === "actor" ? "successor-actor" : "original-actor", window: retired === "window" ? {} : intent.window })
  expect(signal.aborted).toBe(true)
  await act(async () => { finish({ authorization: { authorization_url: "https://oauth.example.test/late", expires_at: "2030-01-01T00:00:00Z" } }); await waiting })
  expect(navigate).not.toHaveBeenCalled()
  expect(hook.result.current.error).toBe(false)
})
it.each(["outside the first page", "when the directory fails"])("opens an installed provider by its exact key %s", async scenario => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: "outside", display_name: "Outside provider", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const get = vi.fn().mockResolvedValue(provider)
  const client = { ...createHubClient(), getMcpConnectorProvider: get,
    listMcpConnectorProviders: scenario === "when the directory fails" ? vi.fn().mockRejectedValue(Error("offline")) : vi.fn().mockResolvedValue({ items: [], next_cursor: "more" }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [{ availability: "available" as const, connector_id: "owned-outside", connector_type: "mcp", provider_key: "outside", display_name: "Installed outside", status: "active", approved_scopes: [], enabled: true, state_version: "1" }], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "off-page", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="off-page" initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Installed outside" }))
  expect(await screen.findByRole("dialog", { name: "Outside provider" })).toBeVisible()
  expect(get).toHaveBeenCalledWith("outside", expect.any(AbortSignal))
})

it("does not report an unrelated seed failure after filtered owner results succeed", async () => {
  const provider = { provider_key: "match", display_name: "Owner match", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const client = { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockRejectedValueOnce(Error("seed failed")).mockResolvedValue({ items: [provider], next_cursor: null }) }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "filter-recovery", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="filter-recovery" embedded initialView="catalog" /></ConnectorCommandProvider></LocaleProvider>)
  await screen.findByRole("alert")
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "matching" } })
  expect(await screen.findByRole("button", { name: "Owner match" })).toBeVisible()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

it("offers explicit reconnect for an active OAuth binding, never for a plain app connector", async () => {
  const { McpProviderDetailDialog } = await import("@/ui/mcp/mcp-provider-detail-dialog")
  const provider = { provider_key: "oauth", display_name: "OAuth app", connection_server_id: "server", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: "active", connector_type: "mcp" as const, provider_key: "oauth", display_name: "Active", status: "active" as const, enabled: true, approved_scopes: [], state_version: "4" }
  const reconnect = vi.fn()
  const content = (oauth: boolean) => <LocaleProvider><McpProviderDetailDialog provider={oauth ? provider : { ...provider, connection_server_id: undefined }} connection={connection} actionId={null} admitted managementCommand={undefined} onResumeManagement={vi.fn()} actionError={false} returnFocusRef={{ current: null }} onClose={vi.fn()} onConnect={vi.fn()} onReconnect={reconnect} /></LocaleProvider>
  const view = render(content(true))
  fireEvent.click(screen.getByRole("button", { name: "重新连接" }))
  expect(reconnect).toHaveBeenCalledWith(connection, provider)
  view.rerender(content(false))
  expect(screen.queryByRole("button", { name: "重新连接" })).not.toBeInTheDocument()
})

it("retires a pending provider creation when its detail closes before another provider opens", async () => {
  const { act, waitFor, within } = await import("@testing-library/react")
  const first = { provider_key: "first", display_name: "First provider", connection_server_id: "server", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const second = { ...first, provider_key: "second", display_name: "Second provider" }
  let acknowledge!: (value: unknown) => void
  const create = vi.fn().mockImplementation(() => new Promise(resolve => { acknowledge = resolve }))
  const begin = vi.fn()
  const navigate = vi.fn()
  const client = { ...createHubClient(), createMcpConnector: create, beginMcpConnectorAuthorization: begin,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [first, second], next_cursor: null }),
    getMcpConnectorProvider: vi.fn(async (key: string) => key === "first" ? first : second),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "window-test", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="window-test" onAuthorizationNavigate={navigate} /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "First provider" }))
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "连接" }))
  await waitFor(() => expect(create).toHaveBeenCalledOnce())
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }))
  fireEvent.click(screen.getByRole("button", { name: "Second provider" }))
  const successor = await screen.findByRole("dialog", { name: "Second provider" })
  await act(async () => acknowledge({ connector_id: "new-first", status: "pending", state_version: "1" }))
  expect(begin).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  expect(screen.getByRole("dialog")).toBe(successor)
})

it("keeps a catalog OAuth detail readable after issuing a ticket without depending on a connector list page", async () => {
  const { waitFor, within } = await import("@testing-library/react")
  const provider = { provider_key: "catalog-oauth", display_name: "Catalog OAuth", connection_server_id: "catalog-server", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connector = { availability: "unavailable" as const, connector_id: "catalog-created", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Catalog connection", status: "pending" as const, enabled: true, approved_scopes: [], state_version: "1" }
  const navigate = vi.fn(), get = vi.fn().mockResolvedValue(connector)
  const client = { ...createHubClient(), createMcpConnector: vi.fn().mockResolvedValue(connector), getMcpConnector: get, getMcpConnectorProvider: vi.fn().mockResolvedValue(provider),
    beginMcpConnectorAuthorization: vi.fn().mockResolvedValue({ authorization: { authorization_url: "https://oauth.example.test/authorize", expires_at: "2030-01-01T00:00:00Z" } }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "catalog-ticket", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="catalog-ticket" onAuthorizationNavigate={navigate} /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "Catalog OAuth" }))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "连接" }))
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce())
  expect(await screen.findByRole("dialog", { name: "Catalog OAuth" })).toBeVisible()
  await waitFor(() => expect(get).toHaveBeenCalledWith(connector.connector_id, expect.any(AbortSignal)))
  expect(within(screen.getByRole("dialog")).getByText(connector.connector_id)).toBeVisible()
  expect(client.listMcpConnectors).toHaveBeenCalledWith({ limit: 100 }, expect.any(AbortSignal))
})

it("restores an off-page Custom API detail by exact locator after an admission generation retires its page", async () => {
  const { waitFor } = await import("@testing-library/react")
  const profile = { profile_id: "off-page-profile", name: "Off-page API", state_version: "1", created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z", environment: [] }
  const list = vi.fn().mockResolvedValueOnce({ items: [], page: { next_cursor: "two" } })
    .mockResolvedValueOnce({ items: [profile], page: { next_cursor: null } }).mockResolvedValue({ items: [], page: { next_cursor: null } })
  const get = vi.fn().mockResolvedValue(profile)
  const client = { ...createHubClient(), listCustomApis: list, getCustomApi: get,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }) }
  const content = (admitted: boolean, generation: number) => <LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "off-page-api", admitted, generation }}><McpProjectionRead client={client} identity="off-page-api" admitted={admitted} readGeneration={generation} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>
  const view = render(content(true, 0))
  fireEvent.click(await screen.findByRole("button", { name: "加载更多 · API" }))
  fireEvent.click(await screen.findByRole("button", { name: "Off-page API" }))
  expect(await screen.findByRole("dialog", { name: "编辑自定义 API" })).toBeVisible()
  view.rerender(content(false, 1))
  view.rerender(content(true, 1))
  await waitFor(() => expect(get).toHaveBeenCalledWith(profile.profile_id, expect.any(AbortSignal)))
  expect(await screen.findByRole("dialog", { name: "编辑自定义 API" })).toBeVisible()
})

it("allows manual reconnect for a ready active private OAuth binding but not a non-OAuth server", async () => {
  const { renderHook, act } = await import("@testing-library/react")
  const { usePrivateMcpAuthorization } = await import("@/ui/mcp/use-private-mcp-authorization")
  const connector = { availability: "unavailable" as const, connector_id: "private-active", server_id: "private-server", connector_type: "mcp" as const, provider_key: "private", display_name: "Private", status: "active" as const, enabled: true, approved_scopes: [], state_version: "3" }
  const server = { availability: "unavailable" as const, server_id: "private-server", display_name: "Private", server_url: "https://mcp.example.test", status: "registered" as const, state_version: "4", headers: [], prepare_status: "ready" as const, authorization_status: "approved" as const, declarations: [], declarations_available: true, declaration_digest: "a".repeat(64), oauth_client: { client_id: "public-id", configured: true, origin: "byo" as const, status: "configured" as const, state_version: "1" } }
  const reconnect = vi.fn().mockResolvedValue({ authorization: { authorization_url: "https://oauth.example.test/authorize", expires_at: "2030-01-01T00:00:00Z" } })
  const client = { ...createHubClient(), reconnectMcpConnectorAuthorization: reconnect }
  const intent = { connectorId: connector.connector_id, serverId: server.server_id, window: {} }
  const hook = renderHook(() => usePrivateMcpAuthorization({ client, identity: "private-oauth", admitted: true, readGeneration: 0, intent, blocked: false, onAuthorizationNavigate: vi.fn() }))
  await act(async () => hook.result.current.authorize(connector, { ...server, oauth_client: { ...server.oauth_client, configured: false, status: "revoked" } }))
  expect(reconnect).not.toHaveBeenCalled()
  await act(async () => hook.result.current.authorize(connector, server))
  expect(reconnect).toHaveBeenCalledWith(connector.connector_id, { server_id: server.server_id, expected_state_version: "3" }, expect.any(AbortSignal))
})

it.each(["api", "provider"])("retires and rereads an off-page %s detail when a confirmed old-window write invalidates its aggregate", async kind => {
  const { act, renderHook, waitFor } = await import("@testing-library/react")
  const { useCustomApiDetail } = await import("@/ui/mcp/use-custom-api-detail")
  const { useMcpProviderConnection } = await import("@/ui/mcp/use-mcp-provider-connection")
  const { invalidateCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection")
  const profile = { profile_id: "exact", name: "Exact", state_version: "1", created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z", environment: [] }
  const connector = { availability: "unavailable" as const, connector_id: "exact", provider_key: "provider", connector_type: "mcp" as const, display_name: "Exact", status: "active" as const, enabled: true, approved_scopes: [], state_version: "1" }
  const getApi = vi.fn().mockResolvedValueOnce(profile).mockResolvedValue({ ...profile, state_version: "2" })
  const getMcp = vi.fn().mockResolvedValueOnce(connector).mockResolvedValue({ ...connector, state_version: "2" })
  const client = { ...createHubClient(), getCustomApi: getApi, getMcpConnector: getMcp }
  const boundary = { client, identity: "old-window-ack", admitted: true, readGeneration: 0, known: undefined, retry: 0 }
  const hook = renderHook(() => {
    const api = useCustomApiDetail({ ...boundary, profileId: kind === "api" ? "exact" : null })
    const mcp = useMcpProviderConnection({ ...boundary, connectorId: kind === "provider" ? "exact" : null, providerKey: "provider" })
    return kind === "api" ? api.profile : mcp.connection
  })
  await waitFor(() => expect(hook.result.current?.state_version).toBe("1"))
  act(() => { if (kind === "api") invalidateCustomApiProjection(client, boundary.identity); else invalidateMcpConnectorProjection(client, boundary.identity) })
  expect(hook.result.current).toBeNull()
  await waitFor(() => expect(hook.result.current?.state_version).toBe("2"))
})

it.each(["api", "provider"])("revalidates a first-page %s detail without reusing stale list facts after a confirmed write", async kind => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { act, waitFor, within } = await import("@testing-library/react")
  const { invalidateCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection")
  const profile = { profile_id: "first-page-api", name: "Initial API", instructions: "Old instructions", state_version: "1", created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z", environment: [] }
  const provider = { provider_key: "first-page-provider", display_name: "First-page provider", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: "first-page-connection", provider_key: provider.provider_key, connector_type: "mcp" as const, display_name: "Initial connection", status: "active" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const apiPage = { items: kind === "api" ? [profile] : [], page: { next_cursor: null } }
  const connectorPage = { items: kind === "provider" ? [connection] : [], next_cursor: null }
  let finishApi!: (value: typeof profile) => void
  let finishMcp!: (value: typeof connection) => void
  let finishApiList!: (value: typeof apiPage) => void
  let finishMcpList!: (value: typeof connectorPage) => void
  const getApi = vi.fn(() => new Promise<typeof profile>(resolve => { finishApi = resolve }))
  const getMcp = vi.fn(() => new Promise<typeof connection>(resolve => { finishMcp = resolve }))
  const client = { ...createHubClient(), getCustomApi: getApi, getMcpConnector: getMcp,
    listCustomApis: vi.fn().mockResolvedValueOnce(apiPage).mockImplementation(() => new Promise(resolve => { finishApiList = resolve })),
    listMcpConnectors: vi.fn().mockResolvedValueOnce(connectorPage).mockImplementation(() => new Promise(resolve => { finishMcpList = resolve })),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
  }
  const identity = "first-page-" + kind
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: identity, admitted: true, generation: 0 }}><McpProjectionRead client={client} identity={identity} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: kind === "api" ? profile.name : connection.display_name }))
  const dialog = await screen.findByRole("dialog")
  if (kind === "api") expect(within(dialog).getByLabelText("名称")).not.toHaveAttribute("readonly")
  else expect(within(dialog).getByRole("button", { name: "启用" })).toBeEnabled()
  expect(kind === "api" ? getApi : getMcp).not.toHaveBeenCalled()
  act(() => { if (kind === "api") invalidateCustomApiProjection(client, identity); else invalidateMcpConnectorProjection(client, identity) })
  await waitFor(() => expect(kind === "api" ? getApi : getMcp).toHaveBeenCalledOnce())
  if (kind === "api") {
    expect(within(dialog).getByLabelText("名称")).toHaveAttribute("readonly")
    expect(within(dialog).getByLabelText("备注（可选）")).toHaveValue("")
  } else expect(within(dialog).queryByRole("button", { name: "启用" })).not.toBeInTheDocument()
  if (kind === "api") {
    await act(async () => finishApi({ ...profile, instructions: "Fresh instructions", state_version: "2" }))
    expect(within(dialog).getByLabelText("备注（可选）")).toHaveValue("Fresh instructions")
    await act(async () => finishApiList({ ...apiPage, items: [{ ...profile, instructions: "Fresh instructions", state_version: "2" }] }))
  } else {
    await act(async () => finishMcp({ ...connection, enabled: true, state_version: "2" }))
    expect(within(dialog).getByRole("button", { name: "停用" })).toBeEnabled()
    await act(async () => finishMcpList({ ...connectorPage, items: [{ ...connection, enabled: true, state_version: "2" }] }))
  }
})

it("explicitly recovers an unknown provider Create with its original body and idempotency key", async () => {
  const { act, waitFor, within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: "recover-create", display_name: "Recover provider", description: "Original description", directory_type: "app", category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connector = { availability: "unavailable" as const, connector_id: "created-once", connector_type: "mcp", provider_key: provider.provider_key, display_name: provider.display_name, description: provider.description, status: "pending", enabled: false, approved_scopes: [], state_version: "1" }
  const writes: { body: string; key: string | null }[] = []
  const reply = (data: unknown) => Response.json({ data }, { headers: { "cache-control": "no-store", "x-request-id": "fixture" } })
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/hub/mcp/providers")) return reply(path.includes("recover-create") ? { provider } : { items: [provider], next_cursor: null })
    if (path === "/api/hub/mcp/connectors" && init?.method === "POST") {
      writes.push({ body: String(init.body), key: new Headers(init.headers).get("idempotency-key") })
      if (writes.length === 1) throw new TypeError("lost ACK after controlled owner commit")
      return reply({ connector })
    }
    if (path === "/api/hub/mcp/connectors/created-once") return reply({ connector })
    if (path.startsWith("/api/hub/mcp/connectors")) return reply({ items: writes.length ? [{ ...connector, connector_id: "other-existing", display_name: "Other existing", status: "active" }] : [], next_cursor: null })
    if (path.startsWith("/api/hub/connectors/custom-apis")) return reply({ items: [], page: { next_cursor: null } })
    throw new Error("unexpected fixture request")
  }))
  const client = createHubClient()
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "recover-create", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="recover-create" initialView="connections" settingsLayout /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "浏览连接器" }))
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  const dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "连接" }))
  await within(dialog).findByRole("alert")
  expect(writes).toHaveLength(1)
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  fireEvent.click(within(screen.getByRole("dialog", { name: "连接器" })).getByRole("button", { name: "取消" }))
  provider.description = "Directory edited after original request"
  const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection")
  act(() => invalidateMcpConnectorProjection(client, "recover-create"))
  await screen.findByRole("button", { name: "Other existing" })
  fireEvent.click(screen.getByRole("button", { name: "浏览连接器" }))
  fireEvent.click(screen.getByRole("button", { name: provider.display_name }))
  const reopened = await screen.findByRole("dialog")
  expect(writes).toHaveLength(1)
  fireEvent.click(within(reopened).getByRole("button", { name: /^(连接|重试原请求)$/ }))
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toEqual(writes[0])
})

it("resumes a confirmed Provider Create after Begin failure using fresh connector and directory bindings", async () => {
  const { waitFor, within } = await import("@testing-library/react")
  const provider = { provider_key: "begin-recovery", display_name: "Begin recovery", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1", connection_server_id: "old-server" }
  const connector = { availability: "unavailable" as const, connector_id: "single-created", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: provider.display_name, status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  let version = "4", server = "fresh-server"
  const create = vi.fn().mockResolvedValue(connector)
  const get = vi.fn(async () => ({ ...connector, state_version: version }))
  const getProvider = vi.fn(async () => ({ ...provider, connection_server_id: server }))
  const begin = vi.fn().mockRejectedValueOnce(new Error("Begin ACK lost")).mockResolvedValue({ authorization: { authorization_url: "https://oauth.example.test/current", expires_at: "2030-01-01T00:00:00Z" } })
  const navigate = vi.fn()
  const client = { ...createHubClient(), createMcpConnector: create, getMcpConnector: get, getMcpConnectorProvider: getProvider, beginMcpConnectorAuthorization: begin,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "begin-recovery", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="begin-recovery" onAuthorizationNavigate={navigate} /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "连接" }))
  await screen.findByRole("alert")
  expect(begin).toHaveBeenLastCalledWith(connector.connector_id, { server_id: server, expected_state_version: version }, expect.any(AbortSignal))
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }))
  version = "9"; server = "new-server"
  fireEvent.click(screen.getByRole("button", { name: provider.display_name }))
  const dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "继续连接" }))
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce())
  expect(create).toHaveBeenCalledOnce()
  expect(begin).toHaveBeenCalledTimes(2)
  expect(begin).toHaveBeenLastCalledWith(connector.connector_id, { server_id: server, expected_state_version: version }, expect.any(AbortSignal))
})

it("reserves OAuth on the next explicit recovery when a catalog binding changes after Create", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { waitFor, within } = await import("@testing-library/react")
  const provider = { provider_key: "added-oauth", display_name: "Added OAuth", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connector = { availability: "unavailable" as const, connector_id: "one-create", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: provider.display_name, status: "pending" as const, enabled: false, approved_scopes: [], state_version: "4" }
  const create = vi.fn().mockResolvedValue({ ...connector, state_version: "1" })
  const begin = vi.fn().mockResolvedValue({ authorization: { authorization_url: "https://oauth.example.test/new-binding", expires_at: "2030-01-01T00:00:00Z" } })
  const navigate = vi.fn()
  const client = { ...createHubClient(), createMcpConnector: create, getMcpConnector: vi.fn().mockResolvedValue(connector), getMcpConnectorProvider: vi.fn().mockResolvedValue({ ...provider, connection_server_id: "new-binding" }), beginMcpConnectorAuthorization: begin,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "added-oauth", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="added-oauth" onAuthorizationNavigate={navigate} /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "连接" }))
  await screen.findByRole("alert")
  expect(begin).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^(重试|继续连接)$/ }))
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce())
  expect(create).toHaveBeenCalledOnce()
  expect(begin).toHaveBeenCalledWith(connector.connector_id, { server_id: "new-binding", expected_state_version: "4" }, expect.any(AbortSignal))
})

it("keeps exact installed connector management independent of a provider Create recovery", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { McpProviderDetailDialog } = await import("@/ui/mcp/mcp-provider-detail-dialog")
  const provider = { provider_key: "installed", display_name: "Installed provider", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1", connection_server_id: "server" }
  const connection = { availability: "unavailable" as const, connector_id: "existing", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Existing", status: "active" as const, enabled: true, approved_scopes: [], state_version: "4" }
  render(<LocaleProvider><McpProviderDetailDialog provider={provider} connection={connection} creationCommand={{ providerKey: provider.provider_key, kind: "unknown" }} actionId={null} admitted managementCommand={undefined} onResumeManagement={vi.fn()} actionError={false} returnFocusRef={{ current: null }} onClose={vi.fn()} onConnect={vi.fn()} onReconnect={vi.fn()} onToggleEnabled={vi.fn()} onRemoveConnection={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "重新连接" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "停用" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "断开连接" })).toBeEnabled()
})

it.each(["binding removed", "already active"])("consumes a stale OAuth Create gesture as ordinary success when %s", async scenario => {
  const { waitFor, within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: "stale-oauth", display_name: "Stale OAuth", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1", connection_server_id: "old-server" }
  const connector = { availability: "unavailable" as const, connector_id: "stale-created", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: provider.display_name, status: scenario === "already active" ? "active" as const : "pending" as const, enabled: false, approved_scopes: [], state_version: "3" }
  const begin = vi.fn(), navigate = vi.fn()
  let created = false
  const client = { ...createHubClient(), createMcpConnector: vi.fn(async () => { created = true; return { ...connector, state_version: "1" } }), getMcpConnector: vi.fn().mockResolvedValue(connector), getMcpConnectorProvider: vi.fn().mockResolvedValue({ ...provider, ...(scenario === "binding removed" ? { connection_server_id: undefined } : {}) }), beginMcpConnectorAuthorization: begin,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: vi.fn(async () => ({ items: created ? [connector] : [], next_cursor: null })), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "stale-oauth", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="stale-oauth" onAuthorizationNavigate={navigate} /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "连接" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(begin).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  expect(await screen.findByRole("button", { name: provider.display_name })).toBeVisible()
})

it.each(["active", "pending", "error"] as const)("opens the existing %s connector from the catalog instead of offering another Create", async status => {
  const { within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: `added-${status}`, display_name: `Added ${status}`, directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: `existing-${status}`, connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: `Installed ${status}`, status, enabled: false, approved_scopes: [], state_version: "9" }
  const create = vi.fn()
  const get = vi.fn().mockResolvedValue({ ...connection, state_version: "10" })
  const client = { ...createHubClient(), createMcpConnector: create, getMcpConnector: get,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connection], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  }
  const identity = `added-catalog-${status}`
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: identity, admitted: true, generation: 0 }}><McpProjectionRead client={client} identity={identity} settingsLayout initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  await screen.findByRole("button", { name: connection.display_name })
  fireEvent.click(screen.getByRole("button", { name: "浏览连接器" }))
  fireEvent.click(await within(screen.getByRole("dialog", { name: "连接器" })).findByRole("button", { name: provider.display_name }))
  const detail = await screen.findByRole("dialog", { name: provider.display_name })
  expect(within(detail).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  expect(within(detail).getByText(connection.connector_id)).toBeVisible()
  expect(get).toHaveBeenCalledExactlyOnceWith(connection.connector_id, expect.any(AbortSignal))
  expect(create).not.toHaveBeenCalled()
})

it.each(["partial", "multiple", "private", "revoked"] as const)("does not guess an existing provider binding from a %s management read", async scenario => {
  const { within, waitFor } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: `ambiguous-${scenario}`, display_name: `Provider ${scenario}`, directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: "not-a-proven-locator", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Existing candidate", status: scenario === "revoked" ? "revoked" as const : "active" as const, ...(scenario === "private" ? { server_id: "private-server" } : {}), enabled: true, approved_scopes: [], state_version: "1" }
  const get = vi.fn()
  const client = { ...createHubClient(), getMcpConnector: get,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: scenario === "multiple" ? [connection, { ...connection, connector_id: "another" }] : [connection], next_cursor: scenario === "partial" ? "another-page" : null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
  }
  const identity = `catalog-not-guessed-${scenario}`
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: identity, admitted: true, generation: 0 }}><McpProjectionRead client={client} identity={identity} settingsLayout initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  if (scenario === "revoked") await waitFor(() => expect(screen.getByTestId("mcp-projection-read")).not.toHaveAttribute("aria-busy", "true"))
  else await screen.findAllByRole("button", { name: connection.display_name })
  fireEvent.click(screen.getByRole("button", { name: "浏览连接器" }))
  fireEvent.click(await within(screen.getByRole("dialog", { name: "连接器" })).findByRole("button", { name: provider.display_name }))
  const detail = await screen.findByRole("dialog", { name: provider.display_name })
  if (scenario !== "revoked") expect(within(detail).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
})

it("resolves an existing off-page provider connector from the standalone directory before offering Create", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { within } = await import("@testing-library/react")
  const provider = { provider_key: "paged-added", display_name: "Paged added", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connector = { availability: "unavailable" as const, connector_id: "off-page-existing", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Existing account", status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const list = vi.fn().mockResolvedValueOnce({ items: [], next_cursor: "opaque-next" }).mockResolvedValueOnce({ items: [connector], next_cursor: null })
  const get = vi.fn().mockResolvedValue({ ...connector, state_version: "2" }), create = vi.fn(), runtime = vi.fn()
  const client = { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: list, getMcpConnector: get, createMcpConnector: create, listMcpConnections: runtime }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "paged-catalog", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="paged-catalog" embedded /></ConnectorCommandProvider></LocaleProvider>)
  const card = await screen.findByRole("button", { name: provider.display_name })
  fireEvent.click(card)
  const detail = await screen.findByRole("dialog", { name: provider.display_name })
  expect(await within(detail).findByText(connector.connector_id)).toBeVisible()
  expect(card).toHaveAccessibleDescription("已添加")
  expect(within(detail).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  expect(list).toHaveBeenLastCalledWith({ limit: 100, cursor: "opaque-next" }, expect.any(AbortSignal))
  expect(get).toHaveBeenCalledExactlyOnceWith(connector.connector_id, expect.any(AbortSignal))
  expect(create).not.toHaveBeenCalled(); expect(runtime).not.toHaveBeenCalled()
})

it("keeps Create unavailable until every management page has confirmed no existing relation", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { act, waitFor, within } = await import("@testing-library/react")
  const provider = { provider_key: "not-yet-empty", display_name: "Not yet empty", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  let finish!: (value: { items: []; next_cursor: null }) => void
  const list = vi.fn().mockResolvedValueOnce({ items: [], next_cursor: "tail" }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const client = { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: list }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "pending-empty", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="pending-empty" embedded /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  const detail = await screen.findByRole("dialog", { name: provider.display_name })
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect(within(detail).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  await act(async () => finish({ items: [], next_cursor: null }))
  expect(await within(detail).findByRole("button", { name: "连接" })).toBeEnabled()
})

it("requires explicit selection among several provider connections and reads only the chosen locator", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { within } = await import("@testing-library/react")
  const provider = { provider_key: "many-accounts", display_name: "Many accounts", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const first = { availability: "unavailable" as const, connector_id: "account-a", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Account A", status: "active" as const, enabled: true, approved_scopes: [], state_version: "1" }
  const second = { ...first, connector_id: "account-b", connector_type: "byok" as const, display_name: "Account B", status: "error" as const, enabled: false }
  const get = vi.fn().mockResolvedValue({ ...second, state_version: "8" })
  const client = { ...createHubClient(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [first, second], next_cursor: null }), getMcpConnector: get }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "many-catalog", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="many-catalog" embedded /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  const detail = await screen.findByRole("dialog", { name: provider.display_name })
  fireEvent.click(await within(detail).findByRole("button", { name: /Account B/ }))
  expect(await within(detail).findByText(second.connector_id)).toBeVisible()
  expect(get).toHaveBeenCalledExactlyOnceWith(second.connector_id, expect.any(AbortSignal))
  expect(within(detail).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
})


it.each(["revoked", "type", "server"] as const)("keeps a selected connection frozen and reports %s drift instead of offering Create", async drift => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { within } = await import("@testing-library/react")
  const provider = { provider_key: `drift-${drift}`, display_name: `Drift ${drift}`, directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: "frozen-id", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Frozen", status: "active" as const, enabled: true, approved_scopes: [], state_version: "1" }
  const get = vi.fn().mockResolvedValue({ ...connection, ...(drift === "revoked" ? { status: "revoked" } : drift === "type" ? { connector_type: "builtin" } : { server_id: "unexpected-private" }) })
  const client = { ...createHubClient(), getMcpConnector: get,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connection], next_cursor: null }) }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: drift, admitted: true, generation: 0 }}><McpProjectionRead client={client} identity={drift} embedded /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  const dialog = await screen.findByRole("dialog")
  expect(await within(dialog).findByRole("alert")).toBeVisible()
  expect(within(dialog).queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledExactlyOnceWith(connection.connector_id, expect.any(AbortSignal))
})

it.each([false, true])("opens an off-page private connection only after exact connector and server reads (retry: %s)", async retry => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { within } = await import("@testing-library/react")
  const provider = { provider_key: "private-off-page", display_name: "Private directory fixture", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: "private-exact-id", connector_type: "mcp" as const, provider_key: provider.provider_key, server_id: "private-exact-server", display_name: "My private connection", status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: connection.server_id, display_name: "Exact private detail", server_url: "https://mcp.example.test/endpoint", status: "pending" as const, state_version: "2", headers: [], prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false }
  const get = vi.fn().mockResolvedValue({ ...connection, state_version: "3" }), getServer = vi.fn().mockResolvedValue(server)
  if (retry) get.mockRejectedValueOnce(Error("exact read offline"))
  const client = { ...createHubClient(), getMcpConnector: get, getPrivateMcpServer: getServer,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValueOnce({ items: [], next_cursor: "private-tail" }).mockResolvedValueOnce({ items: [connection], next_cursor: null }) }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject: "private-directory", admitted: true, generation: 0 }}><McpProjectionRead client={client} identity="private-directory" embedded /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: /My private connection/ }))
  if (retry) {
    const error = await screen.findByRole("alert")
    expect(getServer).not.toHaveBeenCalled()
    fireEvent.click(within(error).getByRole("button", { name: "重试" }))
  }
  expect(await screen.findByRole("dialog", { name: server.display_name })).toBeVisible()
  expect(get).toHaveBeenCalledTimes(retry ? 2 : 1)
  expect(get).toHaveBeenLastCalledWith(connection.connector_id, expect.any(AbortSignal))
  expect(getServer).toHaveBeenCalledExactlyOnceWith(server.server_id, expect.any(AbortSignal))
})


it.each(["revoked", "fresh-server"])("retires opened private detail through an exact recheck (%s)", async outcome => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { act, waitFor, within } = await import("@testing-library/react")
  const { invalidateMcpConnectorProjection } = await import("@/ui/mcp/use-mcp-projection")
  const provider = { provider_key: `retire-${outcome}`, display_name: "Private recheck", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const connection = { availability: "unavailable" as const, connector_id: "recheck-private", connector_type: "mcp" as const, provider_key: provider.provider_key, server_id: "recheck-server", display_name: "My rechecked connection", status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
  const server = { availability: "unavailable" as const, server_id: connection.server_id, display_name: "Private ready detail", server_url: "https://mcp.example.test/recheck", status: "pending" as const, state_version: "2", headers: [], prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false }
  let finishConnection!: (value: typeof connection | Omit<typeof connection, "status"> & { status: "revoked" }) => void
  let finishServer!: (value: typeof server) => void
  const get = vi.fn().mockResolvedValueOnce(connection).mockImplementationOnce(() => new Promise(resolve => { finishConnection = resolve }))
  const getServer = vi.fn().mockResolvedValueOnce(server).mockImplementationOnce(() => new Promise(resolve => { finishServer = resolve }))
  const client = { ...createHubClient(), getMcpConnector: get, getPrivateMcpServer: getServer,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connection], next_cursor: null }) }
  const subject = `private-recheck-${outcome}`
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={{ subject, admitted: true, generation: 0 }}><McpProjectionRead client={client} identity={subject} embedded /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: provider.display_name }))
  fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: /My rechecked connection/ }))
  const dialog = await screen.findByRole("dialog", { name: server.display_name })
  expect(within(dialog).getByRole("button", { name: "连接" })).toBeEnabled()
  act(() => invalidateMcpConnectorProjection(client, subject))
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "管理" })).not.toBeInTheDocument()
  await act(async () => finishConnection(outcome === "revoked" ? { ...connection, status: "revoked" } : connection))
  if (outcome === "revoked") {
    expect(await screen.findByRole("alert")).toBeVisible()
    expect(getServer).toHaveBeenCalledTimes(1)
  } else {
    await waitFor(() => expect(getServer).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole("button", { name: "连接" })).not.toBeInTheDocument()
    await act(async () => finishServer({ ...server, state_version: "3" }))
    expect(await screen.findByRole("button", { name: "连接" })).toBeEnabled()
  }
})

it("shows current availability instead of an active lifecycle success badge, without dispatching commands", async () => {
  const { McpConnectionList } = await import("@/ui/mcp/mcp-connection-list")
  const { McpProviderDetailDialog } = await import("@/ui/mcp/mcp-provider-detail-dialog")
  const provider = { provider_key: "qualification", display_name: "Qualification", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const action = vi.fn()
  const content = (availability: "available" | "refresh_required" | "refreshing" | "reauthorization_required" | "unavailable") => {
    const connection = { availability, connector_id: "qualified", connector_type: "mcp" as const, provider_key: "qualification", display_name: "Owned qualification", status: "active" as const, approved_scopes: [], enabled: true, state_version: "1" }
    return <LocaleProvider><McpConnectionList connectors={[connection]} customApis={[]} providers={[provider]} query="" brandName="Kokoro" onBrowse={action} onEdit={action} onSelectCustomApi={action} previousEnabled={false} nextEnabled={false} onPrevious={action} onNext={action} /><McpProviderDetailDialog provider={provider} connection={connection} actionId={null} admitted managementCommand={undefined} onResumeManagement={action} actionError={false} returnFocusRef={{ current: null }} onClose={action} onConnect={action} /></LocaleProvider>
  }
  window.localStorage.setItem("kokoro.locale", "zh")
  const view = render(content("refresh_required"))
  for (const [state, label] of [["refresh_required", "使用时续期"], ["refreshing", "正在续期"], ["reauthorization_required", "需要重新授权"], ["unavailable", "暂不可用"], ["available", "已连接"]] as const) {
    view.rerender(content(state))
    expect(await screen.findAllByLabelText(label)).toHaveLength(2)
    if (state !== "available") expect(screen.queryByLabelText("已连接")).not.toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
  }
})

it("keeps the owner next-page action reachable when every connector on this page is revoked", async () => {
  const { McpConnectionList } = await import("@/ui/mcp/mcp-connection-list")
  window.localStorage.setItem("kokoro.locale", "zh")
  const connector = { ...privateOAuthFixture().connector, status: "revoked" as const }
  const onNext = vi.fn(), onPrevious = vi.fn(), action = vi.fn()
  render(<LocaleProvider><McpConnectionList connectors={[connector]} customApis={[]} providers={[]} query="" brandName="Kokoro" onBrowse={action} onEdit={action} onSelectCustomApi={action} previousEnabled={false} nextEnabled onPrevious={onPrevious} onNext={onNext} /></LocaleProvider>)

  expect(screen.queryByRole("button", { name: connector.display_name })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "下一页" }))
  expect(onNext).toHaveBeenCalledOnce()
  expect(onPrevious).not.toHaveBeenCalled()
  expect(action).not.toHaveBeenCalled()
})

it("keeps owner pagination after the last visible connector is removed and clears it only at cursor boundaries", async () => {
  const { McpConnectionList } = await import("@/ui/mcp/mcp-connection-list")
  window.localStorage.setItem("kokoro.locale", "zh")
  const connector = privateOAuthFixture().connector
  const onNext = vi.fn(), onPrevious = vi.fn(), action = vi.fn()
  const content = (connectors: McpConnector[], previousEnabled: boolean, nextEnabled: boolean) =>
    <LocaleProvider><McpConnectionList connectors={connectors} customApis={[]} providers={[]} query="" brandName="Kokoro" onBrowse={action} onEdit={action} onSelectCustomApi={action} previousEnabled={previousEnabled} nextEnabled={nextEnabled} onPrevious={onPrevious} onNext={onNext} /></LocaleProvider>
  const view = render(content([connector], true, true))
  expect(screen.getByRole("button", { name: connector.display_name })).toBeInTheDocument()
  view.rerender(content([], true, true))

  expect(screen.queryByRole("button", { name: connector.display_name })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "上一页" }))
  fireEvent.click(screen.getByRole("button", { name: "下一页" }))
  expect(onPrevious).toHaveBeenCalledOnce()
  expect(onNext).toHaveBeenCalledOnce()
  view.rerender(content([], true, false))
  expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
  view.rerender(content([], false, false))
  expect(screen.queryByRole("navigation", { name: "MCP pages" })).not.toBeInTheDocument()
  expect(action).not.toHaveBeenCalled()
})

function customApiSecretFixture(): CustomApiProfile {
  return { profile_id: "secret-edit-profile", name: "Secret editing API", instructions: "Keep instructions", state_version: "7",
    created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z",
    environment: ["API_TOKEN", "UNUSED_TOKEN"].map(name => ({ name, configured: true, state_version: "2", status: "active" })) }
}

function customApiSecretEditor(onSave: (input: CustomApiUpdateInput) => void, onClose: () => void = vi.fn()) {
  return <LocaleProvider><CustomApiDetailDialog profile={customApiSecretFixture()} actionError={false} busy={false} admitted command={undefined}
    canUpdate canRemove onResume={vi.fn()} returnFocusRef={{ current: null }} onClose={onClose} onSave={onSave} onDelete={vi.fn()} /></LocaleProvider>
}

it("rotates stored Custom API secrets and adds new keys without submitting configured placeholders", () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const save = vi.fn()
  render(customApiSecretEditor(save))
  const replacement = screen.getByRole("textbox", { name: "API_TOKEN 密钥值" })
  expect(replacement).toHaveValue("")
  expect(screen.getByRole("textbox", { name: "API_TOKEN 密钥名称" })).toHaveAttribute("readonly")
  expect(screen.getByRole("textbox", { name: "UNUSED_TOKEN 密钥值" })).toHaveValue("")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  fireEvent.change(replacement, { target: { value: "replacement-fixture" } })
  fireEvent.click(screen.getByRole("button", { name: "添加密钥" }))
  fireEvent.change(screen.getByRole("textbox", { name: "密钥名称" }), { target: { value: "NEW_TOKEN" } })
  fireEvent.change(screen.getByRole("textbox", { name: "密钥值" }), { target: { value: "new-fixture" } })
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledExactlyOnceWith({ expected_state_version: "7", name: "Secret editing API", instructions: "Keep instructions",
    environment_upserts: [{ name: "API_TOKEN", value: "replacement-fixture" }, { name: "NEW_TOKEN", value: "new-fixture" }] })
})

it("stages Custom API secret removal, supports undo, and never combines a removed key with an upsert", () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const save = vi.fn()
  render(customApiSecretEditor(save))
  fireEvent.change(screen.getByRole("textbox", { name: "API_TOKEN 密钥值" }), { target: { value: "discarded-replacement" } })
  fireEvent.click(screen.getByRole("button", { name: "移除密钥 API_TOKEN" }))
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "撤销移除 API_TOKEN" }))
  expect(screen.getByRole("textbox", { name: "API_TOKEN 密钥值" })).toHaveValue("")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "移除密钥 API_TOKEN" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  expect(save).toHaveBeenCalledExactlyOnceWith({ expected_state_version: "7", name: "Secret editing API", instructions: "Keep instructions", environment_removals: ["API_TOKEN"] })
})

it("drops unsaved Custom API replacement and removal drafts on cancel and reopening", () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const save = vi.fn(), close = vi.fn()
  const view = render(customApiSecretEditor(save, close))
  fireEvent.change(screen.getByRole("textbox", { name: "API_TOKEN 密钥值" }), { target: { value: "cancelled-fixture" } })
  fireEvent.click(screen.getByRole("button", { name: "移除密钥 UNUSED_TOKEN" }))
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(close).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
  view.unmount()
  render(customApiSecretEditor(save, close))
  expect(screen.getByRole("textbox", { name: "API_TOKEN 密钥值" })).toHaveValue("")
  expect(screen.getByRole("button", { name: "移除密钥 UNUSED_TOKEN" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
})

it("locks unknown Custom API secret edits and replays the original values, removals, CAS and key after reopening", async () => {
  const { waitFor, within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const profile = customApiSecretFixture()
  const update = vi.fn().mockRejectedValueOnce(Error("ACK lost")).mockResolvedValue({ ...profile, state_version: "8", environment: [profile.environment[0]!] })
  const client = { ...createHubClient(), updateCustomApi: update,
    getCustomApi: vi.fn().mockResolvedValue(profile),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [profile], page: { next_cursor: null } }) }
  const boundary = { subject: "custom-api-secret-unknown", admitted: true, generation: 0 }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}><McpProjectionRead client={client} identity={boundary.subject} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: profile.name }))
  let dialog = await screen.findByRole("dialog", { name: "编辑自定义 API" })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "API_TOKEN 密钥值" }), { target: { value: "original-replacement" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "移除密钥 UNUSED_TOKEN" }))
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await within(dialog).findByRole("button", { name: "重试原请求" })
  const original = update.mock.calls[0]!.slice(0, 3)
  expect(original[1]).toEqual({ expected_state_version: "7", name: profile.name, instructions: profile.instructions,
    environment_upserts: [{ name: "API_TOKEN", value: "original-replacement" }], environment_removals: ["UNUSED_TOKEN"] })
  expect(within(dialog).getByRole("textbox", { name: "API_TOKEN 密钥值" })).toHaveAttribute("readonly")
  expect(within(dialog).getByRole("button", { name: "撤销移除 UNUSED_TOKEN" })).toBeDisabled()
  expect(within(dialog).getByRole("button", { name: "添加密钥" })).toBeDisabled()
  expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled()
  fireEvent.change(within(dialog).getByRole("textbox", { name: "API_TOKEN 密钥值" }), { target: { value: "late-change" } })
  expect(within(dialog).getByRole("textbox", { name: "API_TOKEN 密钥值" })).toHaveValue("original-replacement")
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  fireEvent.click(await screen.findByRole("button", { name: profile.name }))
  dialog = await screen.findByRole("dialog", { name: "编辑自定义 API" })
  expect(within(dialog).getByRole("textbox", { name: "API_TOKEN 密钥值" })).toHaveValue("")
  expect(update).toHaveBeenCalledOnce()
  fireEvent.click(within(dialog).getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
  expect(update.mock.calls[1]!.slice(0, 3)).toEqual(original)
})

// Native storage is covered separately; these jsdom tests retain all original command/UI assertions.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});

it("unknown invalid Prepare uses read-only inspection, retires window proof on close, then explicitly replays the original command", async () => {
  const { act, waitFor, within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const base = privateOAuthFixture()
  const connector = { ...base.connector, availability: "unavailable" as const }
  const server = { ...base.server, oauth_client: undefined, availability: "unavailable" as const, state_version: "5" }
  const prepare = vi.fn().mockRejectedValueOnce(new HubClientError("http", "invalid response", "mcp_personal_response_invalid", 502, false))
    .mockResolvedValue({ server: { ...server, prepare_status: "ready", declarations_available: true }, connector, declarations: [], replayed: true })
  const get = vi.fn().mockResolvedValue(connector), getServer = vi.fn().mockResolvedValue(server)
  const client = { ...createHubClient(), preparePrivateMcpServer: prepare, getMcpConnector: get, getPrivateMcpServer: getServer,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
  const boundary = { subject: "prepare-inspection-actor", admitted: true, generation: 0 }
  let commands!: McpPreparationCommands
  function Probe() { commands = useMcpPreparationCommands(client, boundary.subject); return null }
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}><Probe /><McpProjectionRead client={client} identity={boundary.subject} initialView="connections" /></ConnectorCommandProvider></LocaleProvider>)
  await act(async () => commands.prepare({ serverId: server.server_id, connectorId: connector.connector_id, version: "4" }, boundary))
  const original = prepare.mock.calls[0]?.slice(0, 3)
  const open = async () => {
    fireEvent.click(await screen.findByRole("button", { name: connector.display_name }))
    return screen.findByRole("dialog", { name: server.display_name })
  }
  let dialog = await open()
  const inspect = within(dialog).getByRole("button", { name: "需先核验状态" })
  expect(inspect).toBeEnabled()
  const before = [get.mock.calls.length, getServer.mock.calls.length]
  fireEvent.click(inspect)
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "重试原请求" })).toBeEnabled())
  expect(get).toHaveBeenCalledTimes(before[0]! + 1); expect(getServer).toHaveBeenCalledTimes(before[1]! + 1)
  expect(prepare).toHaveBeenCalledOnce()
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  dialog = await open()
  const inspectAgain = within(dialog).getByRole("button", { name: "需先核验状态" })
  expect(inspectAgain).toBeEnabled(); expect(prepare).toHaveBeenCalledOnce()
  fireEvent.click(inspectAgain)
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "重试原请求" })).toBeEnabled())
  fireEvent.click(within(dialog).getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(prepare).toHaveBeenCalledTimes(2))
  expect(prepare.mock.calls[1]?.slice(0, 3)).toEqual(original)
  expect(prepare.mock.calls[1]?.[1]).toBe("4")
  await waitFor(() => expect(commands.getSnapshot()).toEqual([]))
})
