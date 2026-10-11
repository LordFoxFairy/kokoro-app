// 连接面板组件测试：server 池渲染（official 只读 / 自有可启停软删 + enabled 徽标）+ 启停/软删重取 +
// 注册向导（既有 handle / 新建凭据）+ 错误人话化 + 凭据 tab 创建/删除。hub 客户端为注入 fake（不打网络）。
// text 输入按 placeholder 定位；Radix Select 按 aria-label 打开后选择可见选项。
import { readFileSync } from "node:fs"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { StrictMode, useRef, useState } from "react"

import { createHubClient, HubClientError, type HubClient } from "@/hub/client"
import type { McpSecret, McpServerView } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { McpContent, McpCreateDialog, McpPanel } from "@/ui/mcp/mcp-panel"
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read"

const OFFICIAL: McpServerView = {
  scope: "official",
  name: "official-search",
  revision: 3,
  transport: "streamable_http",
  url: "https://official.example.com/mcp",
  allowed_tools: ["search"],
  secret_ref: null,
  enabled: true,
}
const OWN: McpServerView = {
  scope: "team_1",
  name: "my-tools",
  revision: 1,
  transport: "http",
  url: "https://own.example.com/mcp",
  allowed_tools: [],
  secret_ref: "handle:srt_00000000000000000000000000000001",
  enabled: true,
}
const SECRET: McpSecret = {
  handle: "srt_00000000000000000000000000000001",
  name: "search-key",
  createdAt: 1_700_000_000_000,
}

function makeClient(overrides: Partial<HubClient> = {}): HubClient {
  return {
    listPersonalSkills: vi.fn().mockResolvedValue({ skills: [], next_cursor: null }),
    getPublishedPersonalSkill: vi.fn(),
    listMcpConnections: vi.fn().mockResolvedValue({ connections: [] }),
    listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createMcpPersonalConnector: vi.fn(),
    updateMcpPersonalConnector: vi.fn(),
    setMcpPersonalConnectorEnabled: vi.fn(),
    removeMcpPersonalConnector: vi.fn(),
    listSkillPool: vi.fn(),
    listSkillCatalog: vi.fn(),
    skillQuota: vi.fn(),
    skillRevisions: vi.fn(),
    setSkillEnabled: vi.fn(),
    listMcpServers: vi.fn().mockResolvedValue([OFFICIAL, OWN]),
    registerMcpServer: vi.fn().mockResolvedValue(OWN),
    setMcpEnabled: vi.fn().mockResolvedValue(undefined),
    deleteMcpServer: vi.fn().mockResolvedValue(undefined),
    listMcpSecrets: vi.fn().mockResolvedValue([SECRET]),
    createMcpSecret: vi.fn().mockResolvedValue("srt_000000000000000000000000000000ff"),
    deleteMcpSecret: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderPanel(client: HubClient, onClose = vi.fn()) {
  return render(<McpPanel preview client={client} onClose={onClose} />, { wrapper: LocaleProvider })
}

function openRegister(nameValue: string, urlValue: string) {
  fireEvent.click(screen.getByText("Register connection"))
  fireEvent.change(screen.getByPlaceholderText("e.g. my-search"), { target: { value: nameValue } })
  fireEvent.change(screen.getByPlaceholderText("https://…"), { target: { value: urlValue } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("McpPanel", () => {
  const PROVIDER = { provider_key: "provider-one", display_name: "Provider One", description: "A real provider", directory_type: "app" as const, category_keys: ["development" as const], example_prompts: ["Connect me"], website: "https://provider.example.com", privacy_url: "https://provider.example.com/privacy", enabled: true, state_version: "1" }
  const CONNECTOR = { connector_id: "connector-one", connector_type: "mcp" as const, provider_key: "provider-one", status: "active" as const, approved_scopes: ["tools.read"], enabled: true, state_version: "2", display_name: "Workspace search", description: "Search the workspace" }

  it("keeps the provider directory separate from managed connectors until the user switches views", async () => {
    const client = makeClient({
      listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [CONNECTOR], next_cursor: null }),
      listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null }),
    })

    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    expect(await screen.findByTestId("mcp-provider-card-provider-one")).toBeInTheDocument()
    expect(screen.queryByText("Workspace search")).toBeNull()
    expect(client.listMcpPersonalProviders).toHaveBeenCalledTimes(1)
    expect(client.listMcpPersonalConnectors).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
    expect(await screen.findByText("Workspace search")).toBeInTheDocument()
    expect(client.listMcpPersonalConnectors).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "Browse connectors" }))
    expect(screen.queryByText("Workspace search")).toBeNull()
    await waitFor(() => expect(screen.getByTestId("mcp-projection-read")).not.toHaveAttribute("aria-busy", "true"))
  })

  it("matches the Manus connector directory hierarchy with real local provider logos", async () => {
    const providers = [
      { ...PROVIDER, provider_key: "gmail", display_name: "Gmail", description: "Search and summarize email." },
      { ...PROVIDER, provider_key: "github", display_name: "GitHub", description: "Manage repositories." },
    ]
    const client = makeClient({ listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: providers, next_cursor: null }) })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    expect(await screen.findByRole("heading", { name: "Plugins" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Manage connectors" })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Search connectors and data sources")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Connector provider: All" })).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.getByTestId("mcp-provider-card-gmail").querySelector('img[src="/assets/connectors/gmail.webp"]')).not.toBeNull()
    expect(screen.getByTestId("mcp-provider-card-github").querySelector('img[src="/assets/connectors/github.webp"]')).not.toBeNull()
  })

  it("reads personal connectors and provider metadata through the formal owner routes", async () => {
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = input instanceof Request ? input.url : String(input)
      requests.push(path)
      const data = new URL(path, "http://localhost").pathname.endsWith("/providers")
        ? { items: [PROVIDER], next_cursor: null }
        : { items: [CONNECTOR], next_cursor: null }
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "cache-control": "private, no-store", "content-type": "application/json", "x-request-id": "mcp-personal-read" } })
    }))

    render(<McpContent client={createHubClient()} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
    const card = await screen.findByTestId("mcp-projection")
    expect(card).toHaveTextContent("Workspace search")
    expect(card).toHaveTextContent("Provider One")
    expect(card).toHaveTextContent("Connected")
    expect(card).not.toHaveTextContent("connector-one")
    expect(requests.map((value) => new URL(value, "http://localhost").pathname)).toEqual([
      "/api/hub/self/mcp/providers",
      "/api/hub/self/mcp/connectors",
    ])
  })

  it("shares a single initial owner projection across StrictMode effect replay", async () => {
    const listMcpPersonalConnectors = vi.fn().mockResolvedValue({ items: [CONNECTOR], next_cursor: null })
    const listMcpPersonalProviders = vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null })
    const client = makeClient({ listMcpPersonalConnectors, listMcpPersonalProviders })

    render(<StrictMode><LocaleProvider><McpProjectionRead client={client} embedded identity="reader-a:1" /></LocaleProvider></StrictMode>)

    await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
    await screen.findByText("Workspace search")
    expect(listMcpPersonalConnectors).toHaveBeenCalledTimes(1)
    expect(listMcpPersonalProviders).toHaveBeenCalledTimes(1)
  })

  it("revoking read admission aborts the stale projection without duplicating the next identity read", async () => {
    let providerSignal: AbortSignal | undefined
    let resolveStale!: (value: { items: typeof CONNECTOR[]; next_cursor: null }) => void
    const stale = new Promise<{ items: typeof CONNECTOR[]; next_cursor: null }>((resolve) => { resolveStale = resolve })
    const listMcpPersonalProviders = vi.fn()
      .mockImplementationOnce((_query?: unknown, signal?: AbortSignal) => { providerSignal = signal; return stale.then(() => ({ items: [PROVIDER], next_cursor: null })) })
      .mockResolvedValueOnce({ items: [PROVIDER], next_cursor: null })
    const client = makeClient({ listMcpPersonalProviders })
    const renderContent = (boundary: { admitted: boolean; subject: string | null; generation: number }) => (
      <LocaleProvider><McpContent client={client} embedded brandName="Acme" readBoundary={boundary} /></LocaleProvider>
    )
    const view = render(renderContent({ admitted: true, subject: "reader-a", generation: 1 }))

    await waitFor(() => expect(listMcpPersonalProviders).toHaveBeenCalledOnce())
    view.rerender(renderContent({ admitted: false, subject: "reader-a", generation: 2 }))
    await waitFor(() => expect(providerSignal?.aborted).toBe(true))
    expect(screen.queryByTestId("mcp-projection-read")).toBeNull()

    resolveStale({ items: [CONNECTOR], next_cursor: null })
    await Promise.resolve()
    expect(screen.queryByText("Workspace search")).toBeNull()

    view.rerender(renderContent({ admitted: true, subject: "reader-b", generation: 3 }))
    await waitFor(() => expect(listMcpPersonalProviders).toHaveBeenCalledTimes(2))
    await screen.findByTestId("mcp-provider-card-provider-one")
  })

  it("does not present revoked connector audit records as active user connections", async () => {
    const revoked = { ...CONNECTOR, status: "revoked" as const, enabled: false }
    const client = makeClient({
      listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [revoked], next_cursor: null }),
      listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null }),
    })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
    expect(await screen.findByText("No connectors yet.")).toBeInTheDocument()
    expect(screen.queryByText("Workspace search")).toBeNull()
    expect(screen.queryByText("Removed")).toBeNull()
  })

  it("uses formal create, CAS update, enable, and remove commands then reloads owner truth", async () => {
    const listMcpPersonalConnectors = vi.fn().mockResolvedValue({ items: [CONNECTOR], next_cursor: null })
    const listMcpPersonalProviders = vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null })
    const createMcpPersonalConnector = vi.fn().mockResolvedValue({ ...CONNECTOR, connector_id: "connector-created", status: "pending", enabled: false, state_version: "1" })
    const updateMcpPersonalConnector = vi.fn().mockResolvedValue({ ...CONNECTOR, display_name: "Edited connector", state_version: "3" })
    const setMcpPersonalConnectorEnabled = vi.fn().mockResolvedValue({ ...CONNECTOR, enabled: false, state_version: "3" })
    const removeMcpPersonalConnector = vi.fn().mockResolvedValue({ ...CONNECTOR, enabled: false, status: "revoked", state_version: "3" })
    const client = makeClient({ listMcpPersonalConnectors, listMcpPersonalProviders, createMcpPersonalConnector, updateMcpPersonalConnector, setMcpPersonalConnectorEnabled, removeMcpPersonalConnector })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    const provider = await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.click(within(provider).getByRole("button", { name: "Add Provider One" }))
    await waitFor(() => expect(createMcpPersonalConnector).toHaveBeenCalledWith({ provider_key: "provider-one", connector_type: "mcp", display_name: "Provider One", description: "A real provider" }))
    await screen.findByText("Workspace search")

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Edited connector" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(updateMcpPersonalConnector).toHaveBeenCalledWith("connector-one", { display_name: "Edited connector", description: "Search the workspace", expected_state_version: "2" }))

    fireEvent.click(screen.getByRole("button", { name: "Disable" }))
    await waitFor(() => expect(setMcpPersonalConnectorEnabled).toHaveBeenCalledWith("connector-one", { enabled: false, expected_state_version: "2" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }))
    await waitFor(() => expect(removeMcpPersonalConnector).toHaveBeenCalledWith("connector-one", { expected_state_version: "2" }))
    expect(listMcpPersonalConnectors.mock.calls.length).toBeGreaterThan(1)
  })

  it("connects a provider from its card without replacing the live connector list", async () => {
    const createMcpPersonalConnector = vi.fn().mockResolvedValue({ ...CONNECTOR, connector_id: "connector-created", status: "pending", enabled: false, state_version: "1" })
    const client = makeClient({
      listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [CONNECTOR], next_cursor: null }),
      listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null }),
      createMcpPersonalConnector,
    })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    const provider = await screen.findByTestId("mcp-provider-card-provider-one")
    expect(provider).toHaveTextContent("Provider One")
    expect(provider).toHaveTextContent("A real provider")

    fireEvent.click(within(provider).getByRole("button", { name: "Add Provider One" }))

    await waitFor(() => expect(createMcpPersonalConnector).toHaveBeenCalledWith({ provider_key: "provider-one", connector_type: "mcp", display_name: "Provider One", description: "A real provider" }))
    expect(screen.queryByRole("dialog", { name: "Add connector" })).toBeNull()
    expect(await screen.findByText("Workspace search")).toBeInTheDocument()
  })

  it("opens a Manus-style provider detail dialog with only supported actions", async () => {
    const client = makeClient({
      listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [CONNECTOR], next_cursor: null }),
      listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null }),
    })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.click(screen.getByRole("button", { name: "Provider One" }))

    const detail = await screen.findByRole("dialog", { name: "Provider One" })
    expect(detail).toHaveAttribute("data-detail-layout", "manus")
    expect(within(detail).getByText("A real provider")).toBeInTheDocument()
    expect(within(detail).getByText("Connect me")).toBeInTheDocument()
    expect(within(detail).getByTestId("mcp-provider-detail-logo")).toBeInTheDocument()
    expect(within(detail).getByText("Example prompts")).toBeInTheDocument()
    expect(within(detail).getByRole("button", { name: "Add Provider One" })).toBeInTheDocument()
    expect(within(detail).queryByRole("button", { name: "Manage connectors" })).toBeNull()
    expect(screen.queryByText("Workspace search")).toBeNull()
  })

  it("uses the Manus directory hierarchy and keeps provider artwork tied to owner data", () => {
    const css = readFileSync("src/ui/mcp/mcp-projection-read.module.css", "utf8")
    const source = readFileSync("src/ui/mcp/mcp-projection-read.tsx", "utf8")
    expect(css).toMatch(/\.headerTools\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/u)
    expect(css).toMatch(/\.headerActions\s*\{[^}]*justify-self: end;/u)
    expect(css).toMatch(/\.providerArtwork\s*\{[^}]*height: 12rem;/u)
    expect(css).toMatch(/\.providerDetailDialog\[data-slot="dialog-content"\]\s*\{[^}]*width: min\(88rem,calc\(100vw - 2rem\)\);/u)
    expect(css).toMatch(/\.providerDetailHeader\s*\{[^}]*grid-template-columns: minmax\(0,1fr\) 15rem;[^}]*padding: 4\.5rem 3rem 1\.5rem;/u)
    expect(css).toMatch(/\.providerDetailCopy\s*\{[^}]*align-items: flex-start;/u)
    expect(css).toMatch(/\.providerDetailLogo\s*\{[^}]*width: 12rem;[^}]*height: 12rem;/u)
    expect(css).toMatch(/\.examplePromptList li\s*\{[^}]*min-height: 5rem;[^}]*padding: 1rem 1\.2rem;/u)
    expect(source).toMatch(/providerLogoAssets/u)
    expect(source).not.toMatch(/providers\.slice\(0, 4\)/u)
    expect(source).not.toMatch(/featuredProvider/u)
    expect(css).not.toMatch(/\.featuredRail\s*\{/u)
    expect(css).toMatch(/\.providerGrid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u)
  })

  it("filters the provider directory without replacing the connector projection", async () => {
    const secondProvider = { ...PROVIDER, provider_key: "provider-two", display_name: "Calendar One", description: "Calendar provider" }
    const client = makeClient({
      listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [CONNECTOR], next_cursor: null }),
      listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [PROVIDER, secondProvider], next_cursor: null }),
    })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.change(screen.getByRole("searchbox", { name: /search connectors/i }), { target: { value: "calendar" } })

    expect(screen.getByTestId("mcp-provider-card-provider-two")).toHaveTextContent("Calendar One")
    expect(screen.queryByTestId("mcp-provider-card-provider-one")).toBeNull()
    expect(screen.queryByText("Workspace search")).toBeNull()
  })

  it("retains the rendered list during a refresh and retires a late prior identity response", async () => {
    let resolveSecond!: (value: { items: typeof CONNECTOR[]; next_cursor: string | null }) => void
    const listA = vi.fn()
      .mockResolvedValueOnce({ items: [CONNECTOR], next_cursor: "next" })
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))
    const providersA = vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null })
    const clientA = makeClient({ listMcpPersonalConnectors: listA, listMcpPersonalProviders: providersA })
    const clientB = makeClient({ listMcpPersonalConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [PROVIDER], next_cursor: null }) })
    const boundary = { admitted: true, subject: "reader-a", generation: 1 } as const
    const view = render(<McpContent client={clientA} embedded brandName="Acme" readBoundary={boundary} />, { wrapper: LocaleProvider })

    await screen.findByTestId("mcp-provider-card-provider-one")
    fireEvent.click(screen.getByRole("button", { name: "Manage connectors" }))
    await screen.findByText("Workspace search")
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("Workspace search")).toBeInTheDocument()
    view.rerender(<McpContent client={clientB} embedded brandName="Acme" readBoundary={boundary} />)
    await waitFor(() => expect(screen.queryByText("Workspace search")).toBeNull())
    resolveSecond({ items: [{ ...CONNECTOR, display_name: "Stale connector" }], next_cursor: null })
    await waitFor(() => expect(screen.queryByText("Stale connector")).toBeNull())
  })
  it("direct MCP creator selects each reference layout and restores trigger focus", async () => {
    const client = makeClient()
    function Harness() {
      const [open, setOpen] = useState(true)
      const triggerRef = useRef<HTMLButtonElement | null>(null)
      return <>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Create direct MCP</button>
        <McpCreateDialog client={client} mode="form" open={open} onOpenChange={setOpen} returnFocusRef={triggerRef} />
      </>
    }
    const view = render(<Harness />, { wrapper: LocaleProvider })

    expect(await screen.findByRole("dialog", { name: "MCP settings" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Server name" })).toHaveFocus())
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "MCP settings" })).toBeNull())
    expect(screen.getByRole("button", { name: "Create direct MCP" })).toHaveFocus()

    view.unmount()
    const noop = () => undefined
    const emptyRef = { current: null }
    const json = render(<LocaleProvider><McpCreateDialog client={client} mode="json" open onOpenChange={noop} returnFocusRef={emptyRef} /></LocaleProvider>)
    expect(await screen.findByRole("dialog", { name: "Import via JSON" })).toBeInTheDocument()

    json.unmount()
    render(<LocaleProvider><McpCreateDialog client={client} mode="url" open onOpenChange={noop} returnFocusRef={emptyRef} /></LocaleProvider>)
    expect(await screen.findByRole("dialog", { name: /Add MCP via URL/ })).toBeInTheDocument()
  })

  it("imports SSE JSON with headers and rejects unsupported STDIO without closing", async () => {
    const registerCustomMcp = vi.fn().mockResolvedValue({})
    const client = makeClient({ registerCustomMcp })
    const onDone = vi.fn().mockResolvedValue(undefined)
    const view = render(
      <McpCreateDialog client={client} mode="json" open onOpenChange={vi.fn()} onDone={onDone} />,
      { wrapper: LocaleProvider },
    )
    const editor = await screen.findByRole("textbox", { name: "Paste your configuration JSON" })
    fireEvent.change(editor, { target: { value: JSON.stringify({
      mcpServers: {
        events: {
          type: "sse",
          url: "https://sse.example.test/mcp",
          headers: { Authorization: "Bearer TOKEN" },
        },
      },
    }) } })
    fireEvent.click(screen.getByRole("button", { name: "Import" }))

    await waitFor(() => expect(registerCustomMcp).toHaveBeenCalledWith({
      name: "events",
      transport: "http",
      endpoint_url: "https://sse.example.test/mcp",
      icon_asset_id: null,
      instructions: null,
      headers: [{ name: "Authorization", value: "Bearer TOKEN" }],
      enabled: true,
    }))
    expect(onDone).toHaveBeenCalledTimes(1)

    view.unmount()
    registerCustomMcp.mockClear()
    onDone.mockClear()
    render(
      <McpCreateDialog client={client} mode="json" open onOpenChange={vi.fn()} onDone={onDone} />,
      { wrapper: LocaleProvider },
    )
    const stdioEditor = await screen.findByRole("textbox", { name: "Paste your configuration JSON" })
    fireEvent.change(stdioEditor, { target: { value: JSON.stringify({
      mcpServers: { local: { command: "npx", args: ["-y", "mcp-server-example"] } },
    }) } })
    fireEvent.click(screen.getByRole("button", { name: "Import" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("The JSON is invalid or does not contain an mcpServers configuration.")
    expect(registerCustomMcp).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog", { name: "Import via JSON" })).toBeInTheDocument()
  })

  it("embedded connector empty state follows the Manus connector hierarchy", async () => {
    const client = makeClient({
      listMcpServers: vi.fn().mockResolvedValue([]),
      listMcpSecrets: vi.fn().mockResolvedValue([]),
    })
    render(<McpContent preview client={client} embedded brandName="Acme" />, { wrapper: LocaleProvider })

    const empty = await screen.findByTestId("mcp-empty")
    expect(empty.querySelector("svg")).toHaveClass("lucide-cable")
    expect(screen.getByText("Connect Acme to your everyday apps, APIs, and MCPs")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add connector" })).toBeInTheDocument()
    expect(screen.queryByText("Register connection")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Browse connectors" }))
    expect(await screen.findByRole("dialog", { name: "Connectors" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search connectors" })).toHaveFocus())
    expect(screen.getByRole("tab", { name: "Apps" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Custom API" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Custom MCP" })).toBeInTheDocument()
    expect(screen.getByText("Gmail")).toBeInTheDocument()
    expect(screen.getByText("GitHub")).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole("tab", { name: "Custom MCP" }), { key: "Enter" })
    expect(await screen.findByText("No custom MCPs have been added yet.")).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Custom MCP" }))
    expect(await screen.findByRole("dialog", { name: "MCP settings" })).toBeInTheDocument()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2)
  })

  it("submits the Settings custom MCP composer through the write-only connector contract", async () => {
    const registerCustomMcp = vi.fn().mockResolvedValue({})
    const client = makeClient({
      listMcpServers: vi.fn().mockResolvedValue([]),
      listMcpSecrets: vi.fn().mockResolvedValue([]),
      registerCustomMcp,
    })
    render(<McpContent preview client={client} embedded brandName="Acme" />, { wrapper: LocaleProvider })
    await screen.findByTestId("mcp-empty")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Register connection" }))
    const dialog = await screen.findByRole("dialog", { name: "MCP settings" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Server name" }), { target: { value: "custom-search" } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Notes/ }), { target: { value: "Use for research" } })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Server URL" }), { target: { value: "https://mcp.example.test/mcp" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add custom header" }))
    const headerName = within(dialog).getByRole("textbox", { name: "Header 1 name" })
    const headerValue = within(dialog).getByLabelText("Header 1 value")
    expect(headerName).toHaveAttribute("autocomplete", "off")
    expect(headerValue).toHaveAttribute("autocomplete", "new-password")
    fireEvent.change(headerName, { target: { value: "Authorization" } })
    fireEvent.change(headerValue, { target: { value: "Bearer TOKEN" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))

    await waitFor(() => expect(registerCustomMcp).toHaveBeenCalledWith({
      name: "custom-search",
      transport: "http",
      endpoint_url: "https://mcp.example.test/mcp",
      icon_asset_id: null,
      instructions: "Use for research",
      headers: [{ name: "Authorization", value: "Bearer TOKEN" }],
      enabled: true,
    }))
    expect(registerCustomMcp.mock.calls[0]?.[0]).not.toHaveProperty("tenant_id")
  })

  it("renders the server pool with official (read-only) and own (actionable)", async () => {
    renderPanel(makeClient())
    await screen.findByText("official-search")
    expect(screen.getByText("my-tools")).toBeTruthy()
    expect(screen.getByText("Official")).toBeTruthy()
    expect(screen.getByText("Own")).toBeTruthy()
    // official 只读：无启停/删除按钮；自有项两枚动作按钮都在（各恰一枚）。
    expect(screen.getByText("Disable")).toBeTruthy()
    expect(screen.getByText("Delete")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Disable my-tools" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete my-tools" })).toBeInTheDocument()
    // 两条都 enabled → 两枚 Enabled 徽标。
    expect(screen.getAllByText("Enabled").length).toBe(2)
  })

  it("toggles an own server and refetches", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("my-tools")
    fireEvent.click(screen.getByText("Disable"))
    await waitFor(() => expect(client.setMcpEnabled).toHaveBeenCalledWith("my-tools", false))
    await waitFor(() => expect((client.listMcpServers as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2))
  })

  it("locks every server mutation while one toggle is pending", async () => {
    let resolve!: () => void
    const client = makeClient({
      setMcpEnabled: vi.fn(() => new Promise<void>((done) => { resolve = done })),
    })
    renderPanel(client)
    await screen.findByText("my-tools")

    fireEvent.click(screen.getByText("Disable"))
    await waitFor(() => expect(client.setMcpEnabled).toHaveBeenCalledTimes(1))
    expect(screen.getByText("Delete")).toBeDisabled()

    resolve()
    await waitFor(() => expect(screen.getByText("Delete")).not.toBeDisabled())
  })

  it("deletes an own server and refetches", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("my-tools")
    // 删除两步:点「删除」入确认态,再点「确认删除」才真删(破坏性软删前置确认)。
    fireEvent.click(screen.getByText("Delete"))
    await waitFor(() => expect(screen.getByText("Confirm delete")).toHaveFocus())
    fireEvent.click(screen.getByText("Confirm delete"))
    await waitFor(() => expect(client.deleteMcpServer).toHaveBeenCalledWith("my-tools"))
    await waitFor(() => expect((client.listMcpServers as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2))
    await waitFor(() => expect(screen.getByPlaceholderText("Search connections")).toHaveFocus())
  })

  it("shows field-level required feedback before registering", async () => {
    renderPanel(makeClient())
    await screen.findByText("my-tools")
    fireEvent.click(screen.getByText("Register connection"))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus())
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("URL")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Transport").closest('[data-slot="field"]')).not.toHaveAttribute("data-invalid")
    expect(screen.getByLabelText("URL").closest('[data-slot="field"]')).toHaveAttribute("data-invalid", "true")
    expect(screen.getAllByText("This field is required").length).toBe(2)
  })

  it("registers a server with an existing secret handle", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("my-tools")
    openRegister("new-server", "https://new.example.com/mcp")
    fireEvent.click(screen.getByLabelText("Credential"))
    fireEvent.click((await screen.findAllByText("search-key")).find((node) => node.closest('[role="option"]'))!)
    fireEvent.click(screen.getByText("Save"))
    await waitFor(() =>
      expect(client.registerMcpServer).toHaveBeenCalledWith({
        name: "new-server",
        transport: "streamable_http",
        url: "https://new.example.com/mcp",
        allowed_tools: [],
        secret_ref: "handle:srt_00000000000000000000000000000001",
      }),
    )
  })

  it("creates a new secret inline then registers with its handle", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("my-tools")
    openRegister("svc", "https://svc.example.com/mcp")
    fireEvent.click(screen.getByLabelText("Credential"))
    fireEvent.click((await screen.findAllByText("New credential…")).find((node) => node.closest('[role="option"]'))!)
    fireEvent.change(screen.getByPlaceholderText("e.g. search-api-key"), { target: { value: "svc-key" } })
    fireEvent.change(screen.getByPlaceholderText("Paste a token or key"), { target: { value: "super-secret" } })
    fireEvent.click(screen.getByText("Save"))
    await waitFor(() => expect(client.createMcpSecret).toHaveBeenCalledWith("svc-key", "super-secret"))
    await waitFor(() =>
      expect(client.registerMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({ secret_ref: "handle:srt_000000000000000000000000000000ff" }),
      ),
    )
  })

  it("humanizes a private-url rejection on register", async () => {
    const client = makeClient({
      registerMcpServer: vi
        .fn()
        .mockRejectedValue(new HubClientError("http", "forbidden", "hub.mcp_url_forbidden", 400)),
    })
    renderPanel(client)
    await screen.findByText("my-tools")
    openRegister("bad", "http://10.0.0.1/mcp")
    fireEvent.click(screen.getByText("Save"))
    await screen.findByText(
      "URL didn't pass validation: it must be https, not private, and must not embed credentials.",
    )
  })

  it("humanizes the mutation-disabled gate on register", async () => {
    const client = makeClient({
      registerMcpServer: vi
        .fn()
        .mockRejectedValue(new HubClientError("http", "disabled", "capability_registration_disabled", 503)),
    })
    renderPanel(client)
    await screen.findByText("my-tools")
    openRegister("x", "https://x.example.com/mcp")
    fireEvent.click(screen.getByText("Save"))
    await screen.findByText("MCP connection registration isn't available yet.")
  })

  it("creates a secret in the secrets tab", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("my-tools")
    fireEvent.click(screen.getByRole("tab", { name: "Credentials" }))
    await screen.findByText("search-key")
    fireEvent.change(screen.getByPlaceholderText("e.g. search-api-key"), { target: { value: "another" } })
    fireEvent.change(screen.getByPlaceholderText("Paste a token or key"), { target: { value: "val" } })
    fireEvent.click(screen.getByText("Save credential"))
    await waitFor(() => expect(client.createMcpSecret).toHaveBeenCalledWith("another", "val"))
  })

  it("deletes a secret and refetches", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("my-tools")
    fireEvent.click(screen.getByRole("tab", { name: "Credentials" }))
    await screen.findByText("search-key")
    fireEvent.click(screen.getByText("Delete"))
    await waitFor(() => expect(screen.getByText("Confirm deletion")).toHaveFocus())
    fireEvent.click(await screen.findByText("Confirm deletion"))
    await waitFor(() => expect(client.deleteMcpSecret).toHaveBeenCalledWith(SECRET.handle))
    await waitFor(() => expect(screen.getByText("Save credential")).toHaveFocus())
  })
})

it("uses the same two-column card directory proportions as the Manus skills catalog", () => {
  const css = readFileSync("src/ui/mcp/mcp-projection-read.module.css", "utf8")
  expect(css).toMatch(/\.providerGrid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: 1rem;/u)
  expect(css).toMatch(/\.providerCard\s*\{[^}]*min-height: 25rem;/u)
  expect(css).toMatch(/\.header h2\s*\{[^}]*font-size: 1\.75rem;/u)
  expect(css).toMatch(/@media \(max-width: 42rem\) \{[\s\S]*?\.connectorGrid\s*\{[\s\S]*?grid-template-columns: 1fr;/u)
})

it("keeps the Manus category choices in one filter menu even when the current owner catalog is sparse", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const sparseProvider = { provider_key: "provider-development", display_name: "Development", description: "Real provider", directory_type: "app" as const, category_keys: ["development" as const], example_prompts: [], website: undefined, privacy_url: undefined, enabled: true, state_version: "1" }
  const client = makeClient({ listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [sparseProvider], next_cursor: null }) })
  render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

  fireEvent.keyDown(await screen.findByRole("button", { name: "连接器提供方: 全部" }), { key: "ArrowDown" })
  for (const name of ["全部", "效率", "创作", "商业", "开发", "财经", "出行", "健康"]) {
    expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument()
  }
})

it("uses the observed Manus Chinese connector category labels", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const providers = (["efficiency", "creation", "business", "development", "finance", "travel", "health"] as const).map((category) => ({
    provider_key: `provider-${category}`,
    display_name: category,
    description: `${category} provider`,
    directory_type: "app" as const,
    category_keys: [category],
    example_prompts: [],
    website: undefined,
    privacy_url: undefined,
    enabled: true,
    state_version: "1",
  }))
  const client = makeClient({ listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: providers, next_cursor: null }) })
  render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })
  fireEvent.keyDown(await screen.findByRole("button", { name: "连接器提供方: 全部" }), { key: "ArrowDown" })
  for (const name of ["全部", "效率", "创作", "商业", "开发", "财经", "出行", "健康"]) {
    expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument()
  }
})

it("exposes Manus-style connector creation from the directory header", async () => {
  const onCreateMcp = vi.fn()
  const client = makeClient({
    listMcpPersonalProviders: vi.fn().mockResolvedValue({ items: [{
      provider_key: "provider-one", display_name: "Provider One", description: "A real provider", directory_type: "app" as const,
      category_keys: ["development" as const], example_prompts: ["Connect me"], website: "https://provider.example.com",
      privacy_url: "https://provider.example.com/privacy", enabled: true, state_version: "1",
    }], next_cursor: null }),
  })
  render(<McpProjectionRead client={client} identity="reader-a:1" onCreateMcp={onCreateMcp} />, { wrapper: LocaleProvider })

  await screen.findByTestId("mcp-provider-card-provider-one")
  window.localStorage.setItem("kokoro.locale", "zh")
  fireEvent.pointerDown(screen.getByRole("button", { name: "创建" }), { button: 0, ctrlKey: false })
  const menu = await screen.findByRole("menu")
  fireEvent.click(within(menu).getByRole("menuitem", { name: "透过 URL 添加 MCP" }))
  expect(onCreateMcp).toHaveBeenCalledWith("url", expect.any(HTMLButtonElement))
})
