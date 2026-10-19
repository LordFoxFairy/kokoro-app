import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { createHubClient } from "@/hub/client"
import { LocaleProvider } from "@/i18n/context"
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"

afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals() })
it.each(["outside the first page", "when the directory fails"])("opens an installed provider by its exact key %s", async scenario => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: "outside", display_name: "Outside provider", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1" }
  const get = vi.fn().mockResolvedValue(provider)
  const client = { ...createHubClient(), getMcpConnectorProvider: get,
    listMcpConnectorProviders: scenario === "when the directory fails" ? vi.fn().mockRejectedValue(Error("offline")) : vi.fn().mockResolvedValue({ items: [], next_cursor: "more" }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [{ connector_id: "owned-outside", connector_type: "mcp", provider_key: "outside", display_name: "Installed outside", status: "active", approved_scopes: [], enabled: true, state_version: "1" }], next_cursor: null }),
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
  const connection = { connector_id: "active", connector_type: "mcp" as const, provider_key: "oauth", display_name: "Active", status: "active" as const, enabled: true, approved_scopes: [], state_version: "4" }
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
  const connector = { connector_id: "catalog-created", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Catalog connection", status: "pending" as const, enabled: true, approved_scopes: [], state_version: "1" }
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
  expect(client.listMcpConnectors).not.toHaveBeenCalled()
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
  expect(await screen.findByRole("dialog", { name: "Off-page API" })).toBeVisible()
  view.rerender(content(false, 1))
  view.rerender(content(true, 1))
  await waitFor(() => expect(get).toHaveBeenCalledWith(profile.profile_id, expect.any(AbortSignal)))
  expect(await screen.findByRole("dialog", { name: "Off-page API" })).toBeVisible()
})

it("allows manual reconnect for a ready active private OAuth binding but not a non-OAuth server", async () => {
  const { renderHook, act } = await import("@testing-library/react")
  const { usePrivateMcpAuthorization } = await import("@/ui/mcp/use-private-mcp-authorization")
  const connector = { connector_id: "private-active", server_id: "private-server", connector_type: "mcp" as const, provider_key: "private", display_name: "Private", status: "active" as const, enabled: true, approved_scopes: [], state_version: "3" }
  const server = { server_id: "private-server", display_name: "Private", server_url: "https://mcp.example.test", status: "registered" as const, state_version: "4", headers: [], prepare_status: "ready" as const, authorization_status: "approved" as const, declarations: [], declarations_available: true, declaration_digest: "a".repeat(64), oauth_client: { client_id: "public-id", configured: true, origin: "byo" as const, status: "configured" as const, state_version: "1" } }
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
  const connector = { connector_id: "exact", provider_key: "provider", connector_type: "mcp" as const, display_name: "Exact", status: "active" as const, enabled: true, approved_scopes: [], state_version: "1" }
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
  const connection = { connector_id: "first-page-connection", provider_key: provider.provider_key, connector_type: "mcp" as const, display_name: "Initial connection", status: "active" as const, enabled: false, approved_scopes: [], state_version: "1" }
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
  expect(within(dialog).getByRole("button", { name: kind === "api" ? "编辑" : "启用" })).toBeEnabled()
  expect(kind === "api" ? getApi : getMcp).not.toHaveBeenCalled()
  act(() => { if (kind === "api") invalidateCustomApiProjection(client, identity); else invalidateMcpConnectorProjection(client, identity) })
  await waitFor(() => expect(kind === "api" ? getApi : getMcp).toHaveBeenCalledOnce())
  expect(within(dialog).queryByRole("button", { name: kind === "api" ? "编辑" : "启用" })).not.toBeInTheDocument()
  if (kind === "api") {
    await act(async () => finishApi({ ...profile, instructions: "Fresh instructions", state_version: "2" }))
    expect(within(dialog).getByText("Fresh instructions")).toBeVisible()
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
  const connector = { connector_id: "created-once", connector_type: "mcp", provider_key: provider.provider_key, display_name: provider.display_name, description: provider.description, status: "pending", enabled: false, approved_scopes: [], state_version: "1" }
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
  const connector = { connector_id: "single-created", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: provider.display_name, status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" }
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
  const connector = { connector_id: "one-create", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: provider.display_name, status: "pending" as const, enabled: false, approved_scopes: [], state_version: "4" }
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
  const connection = { connector_id: "existing", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Existing", status: "active" as const, enabled: true, approved_scopes: [], state_version: "4" }
  render(<LocaleProvider><McpProviderDetailDialog provider={provider} connection={connection} creationCommand={{ providerKey: provider.provider_key, kind: "unknown" }} actionId={null} admitted managementCommand={undefined} onResumeManagement={vi.fn()} actionError={false} returnFocusRef={{ current: null }} onClose={vi.fn()} onConnect={vi.fn()} onReconnect={vi.fn()} onToggleEnabled={vi.fn()} onRemoveConnection={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "重新连接" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "停用" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "断开连接" })).toBeEnabled()
})

it.each(["binding removed", "already active"])("consumes a stale OAuth Create gesture as ordinary success when %s", async scenario => {
  const { waitFor, within } = await import("@testing-library/react")
  window.localStorage.setItem("kokoro.locale", "zh")
  const provider = { provider_key: "stale-oauth", display_name: "Stale OAuth", directory_type: "app" as const, category_keys: [], example_prompts: [], enabled: true, state_version: "1", connection_server_id: "old-server" }
  const connector = { connector_id: "stale-created", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: provider.display_name, status: scenario === "already active" ? "active" as const : "pending" as const, enabled: false, approved_scopes: [], state_version: "3" }
  const begin = vi.fn(), navigate = vi.fn()
  const client = { ...createHubClient(), createMcpConnector: vi.fn().mockResolvedValue({ ...connector, state_version: "1" }), getMcpConnector: vi.fn().mockResolvedValue(connector), getMcpConnectorProvider: vi.fn().mockResolvedValue({ ...provider, ...(scenario === "binding removed" ? { connection_server_id: undefined } : {}) }), beginMcpConnectorAuthorization: begin,
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [provider], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) }
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
  const connection = { connector_id: `existing-${status}`, connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: `Installed ${status}`, status, enabled: false, approved_scopes: [], state_version: "9" }
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
  const connection = { connector_id: "not-a-proven-locator", connector_type: "mcp" as const, provider_key: provider.provider_key, display_name: "Existing candidate", status: scenario === "revoked" ? "revoked" as const : "active" as const, ...(scenario === "private" ? { server_id: "private-server" } : {}), enabled: true, approved_scopes: [], state_version: "1" }
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
  expect(within(detail).queryByText(connection.connector_id)).not.toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
})
