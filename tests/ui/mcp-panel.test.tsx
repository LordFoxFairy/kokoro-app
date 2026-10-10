// 连接面板组件测试：server 池渲染（official 只读 / 自有可启停软删 + enabled 徽标）+ 启停/软删重取 +
// 注册向导（既有 handle / 新建凭据）+ 错误人话化 + 凭据 tab 创建/删除。hub 客户端为注入 fake（不打网络）。
// text 输入按 placeholder 定位；Radix Select 按 aria-label 打开后选择可见选项。
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRef, useState } from "react"

import { createHubClient, HubClientError, type HubClient } from "@/hub/client"
import type { McpSecret, McpServerView } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { McpContent, McpCreateDialog, McpPanel } from "@/ui/mcp/mcp-panel"

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
  it("reads the current person's Connections instead of the global Server projection", async () => {
    const requests: string[] = []
    const connection = {
      connection_id: "connection-one",
      connector_id: "connector-one",
      server_id: "server-one",
      provider_key: "provider-one",
      transport: "streamable_http",
      status: "active",
    }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init
      requests.push(input instanceof Request ? input.url : String(input))
      return new Response(JSON.stringify({ data: { connections: [connection] } }), {
        status: 200,
        headers: {
          "cache-control": "private, no-store",
          "content-type": "application/json",
          "x-request-id": "mcp-connection-read",
        },
      })
    }))

    render(<McpContent client={createHubClient()} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(new URL(requests[0]!, "http://localhost").pathname).toBe("/api/hub/self/mcp/connections")
    const card = await screen.findByTestId("mcp-projection")
    expect(card).toHaveTextContent("provider-one")
    expect(card).toHaveTextContent("Connected")
    expect(card).toHaveTextContent("connection-one")
    expect(card).toHaveTextContent("connector-one")
    expect(card).toHaveTextContent("server-one")
    expect(card).not.toHaveTextContent("declaration")
  })

  it("renders only owner-native MCP projection fields without mutation controls", async () => {
    const connection = { connection_id: "connection-1", connector_id: "connector-1", server_id: "server-1", provider_key: "provider", transport: "streamable_http" as const, status: "active" as const }
    const client = makeClient({ listMcpConnections: vi.fn().mockResolvedValue({ connections: [connection] }) })
    render(<McpContent client={client} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    const row = await screen.findByTestId("mcp-projection")
    expect(row).toHaveTextContent("provider")
    expect(row).toHaveTextContent("streamable_http")
    expect(row).toHaveTextContent("Connected")
    expect(row).toHaveTextContent("connection-1")
    expect(row).toHaveTextContent("connector-1")
    expect(row).toHaveTextContent("server-1")
    expect(screen.queryByRole("button", { name: /Enable|Disable|Delete|Register/ })).toBeNull()
    expect(client.listMcpServers).not.toHaveBeenCalled()
  })
  it("pages opaque Connection cursors and aborts an unmounted read", async () => {
    let observedSignal: AbortSignal | undefined
    const listMcpConnections = vi.fn()
      .mockResolvedValueOnce({ connections: [{ connection_id: "connection-1", connector_id: "connector-1", server_id: "server-shared", provider_key: "provider", transport: "streamable_http", status: "active" }], next_cursor: "opaque-next" })
      .mockResolvedValueOnce({ connections: [{ connection_id: "connection-2", connector_id: "connector-2", server_id: "server-shared", provider_key: "provider", transport: "streamable_http", status: "active" }] })
      .mockImplementationOnce((_query, signal: AbortSignal) => {
        observedSignal = signal
        return new Promise(() => undefined)
      })
    const view = render(<McpContent client={makeClient({ listMcpConnections })} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })
    expect(await screen.findByText("connection-1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(await screen.findByText("connection-2")).toBeInTheDocument()
    expect(listMcpConnections.mock.calls[1]?.[0]).toEqual({ cursor: "opaque-next" })
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }))
    await waitFor(() => expect(listMcpConnections).toHaveBeenCalledTimes(3))
    view.unmount()
    expect(observedSignal?.aborted).toBe(true)
  })
  it("retires the old client page and cursor synchronously when the client changes within one trusted identity", async () => {
    let resolveLateA!: (page: Awaited<ReturnType<HubClient["listMcpConnections"]>>) => void
    const lateA = new Promise<Awaited<ReturnType<HubClient["listMcpConnections"]>>>((resolve) => { resolveLateA = resolve })
    const clientA = makeClient({
      listMcpConnections: vi.fn()
        .mockResolvedValueOnce({ connections: [{ connection_id: "connection-a", connector_id: "connector-a", server_id: "server-a", provider_key: "provider-a", transport: "streamable_http", status: "active" }], next_cursor: "cursor-a" })
        .mockReturnValueOnce(lateA),
    })
    const clientBRead = vi.fn().mockReturnValue(new Promise<Awaited<ReturnType<HubClient["listMcpConnections"]>>>(() => undefined))
    const clientB = makeClient({ listMcpConnections: clientBRead })
    const boundary = { admitted: true, subject: "reader-a", generation: 1 } as const
    const view = render(<McpContent client={clientA} embedded brandName="Acme" readBoundary={boundary} />, { wrapper: LocaleProvider })

    expect(await screen.findByText("provider-a")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    await waitFor(() => expect(clientA.listMcpConnections).toHaveBeenCalledTimes(2))

    view.rerender(<McpContent client={clientB} embedded brandName="Acme" readBoundary={boundary} />)
    expect(screen.queryByText("provider-a")).toBeNull()
    await waitFor(() => expect(clientBRead).toHaveBeenCalledOnce())
    expect(clientBRead.mock.calls[0]?.[0]).toEqual({})

    resolveLateA({ connections: [{ connection_id: "connection-late-a", connector_id: "connector-late-a", server_id: "server-late-a", provider_key: "provider-late-a", transport: "streamable_http", status: "active" }] })
    await waitFor(() => expect(screen.queryByText("provider-late-a")).toBeNull())
  })
  it.each([
    { label: "the current cursor", pages: ["cursor-c", "cursor-c"], calls: 2 },
    { label: "a cursor already present in history", pages: ["cursor-c", "cursor-d", "cursor-c"], calls: 3 },
  ])("rejects $label instead of entering permanent loading", async ({ pages, calls }) => {
    const listMcpConnections = vi.fn()
    for (const [index, next_cursor] of pages.entries()) {
      listMcpConnections.mockResolvedValueOnce({
        connections: [{ connection_id: `connection-${index}`, connector_id: `connector-${index}`, server_id: `server-${index}`, provider_key: `provider-${index}`, transport: "streamable_http", status: "active" }],
        next_cursor,
      })
    }
    listMcpConnections.mockImplementation(() => new Promise(() => undefined))
    render(<McpContent client={makeClient({ listMcpConnections })} embedded brandName="Acme" readBoundary={{ admitted: true, subject: "reader-a", generation: 1 }} />, { wrapper: LocaleProvider })

    for (let index = 0; index < calls - 1; index += 1) {
      expect(await screen.findByText(`provider-${index}`)).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    }
    expect(await screen.findByText(`provider-${calls - 1}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(screen.queryByRole("status")).toBeNull()
    expect(listMcpConnections).toHaveBeenCalledTimes(calls)
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
