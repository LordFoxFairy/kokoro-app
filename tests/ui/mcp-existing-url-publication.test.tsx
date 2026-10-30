import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHubClient, HubClientError } from "@/hub/client";
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema";
import type { McpProjectPin } from "@/hub/mcp-project-publication.schema";
import { LocaleProvider } from "@/i18n/context";
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context";
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read";
import { CustomMcpDetailDialog } from "@/ui/mcp/custom-mcp-detail-dialog";
import { StrictMode } from "react";
import * as projectReader from "@/features/app/project-list";

const storage = vi.hoisted(() => ({ pending: null as Promise<void> | null, failed: false }));
// This UI suite replaces only the storage port; native durability has its own suite.
vi.mock("@/ui/mcp/mcp-project-publication-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-project-publication-recovery")>();
  const { createTestPublicationJournal } = await import("./mcp-publication-journal-fixture");
  return { ...actual, createBrowserMcpProjectPublicationRecovery: () => {
    const journal = createTestPublicationJournal();
    return { ...journal, read: async (subject: string) => {
      if (storage.pending) await storage.pending;
      if (storage.failed) throw Error("fixture recovery read failed");
      return journal.read(subject);
    } };
  } };
});
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});

const boundary = { subject: "existing-publication-actor", admitted: true, generation: 1 };
const server: McpPrivateServer = { server_id: "existing-server", display_name: "Existing remote MCP", server_url: "https://mcp.example.test/mcp", availability: "unavailable", status: "registered", state_version: "7", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false };
const connector: McpConnector = { connector_id: "existing-connector", server_id: server.server_id, provider_key: "existing-provider", connector_type: "mcp", display_name: server.display_name, availability: "unavailable", status: "pending", enabled: false, state_version: "3", approved_scopes: [] };
const project = { id: "canonical-project", slug: "not-the-project-id", name: "Existing project", description: "", created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z" };
const revision = { revision_id: "existing-revision", server_id: server.server_id, connector_id: connector.connector_id, content_digest: "a".repeat(64), source_state_version: server.state_version, display_name: server.display_name, created_at: "2026-10-25T00:00:00Z" };
const pin: McpProjectPin = { pin_id: "existing-pin", project_id: project.id, revision, state_version: "4", removed: false, updated_at: "2026-10-25T00:00:00Z", execution_ready: false };

beforeEach(() => {
  storage.pending = null; storage.failed = false;
  localStorage.setItem("kokoro.locale", "zh");
  vi.spyOn(projectReader, "listProjects").mockResolvedValue([project]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(pins: McpProjectPin[] = []) {
  const publication = { list: vi.fn().mockResolvedValue({ pins, next_cursor: null }), publish: vi.fn().mockResolvedValue({ revision, pins: [pin], replayed: false }), receipt: vi.fn().mockResolvedValue({ revision, pins: [pin], replayed: true }) };
  const client = { ...createHubClient(), mcpProjectPublication: publication,
    getPrivateMcpServer: vi.fn().mockResolvedValue(server), getMcpConnector: vi.fn().mockResolvedValue(connector),
    registerPrivateMcpServer: vi.fn(), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn(),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) };
  const form = (next = boundary) => <LocaleProvider><ConnectorCommandProvider client={client} boundary={next}>
    <McpProjectionRead client={client} identity={next.subject} admitted={next.admitted} readGeneration={next.generation} initialView="connections" />
  </ConnectorCommandProvider></LocaleProvider>;
  const view = render(form());
  const detail = async () => {
    fireEvent.click(await screen.findByRole("button", { name: server.display_name }));
    return screen.findByRole("dialog", { name: server.display_name });
  };
  const publicationMenu = async () => {
    const dialog = await screen.findByRole("dialog", { name: server.display_name });
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" });
    return screen.findByRole("menuitem", { name: "发布到项目" });
  };
  const picker = async () => {
    const item = await publicationMenu();
    await waitFor(() => expect(item).not.toHaveAttribute("data-disabled"));
    fireEvent.click(item);
    return screen.findByRole("dialog", { name: "发布到项目" });
  };
  return { client, publication, detail, publicationMenu, picker, view, form };
}

it("the observed existing management entry opens a single project picker and cancel returns to the exact saved detail without creating or preparing", async () => {
  const { client, publication, detail, picker } = setup();
  await detail(); const dialog = await picker();
  await within(dialog).findByRole("checkbox", { name: project.name });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(publication.list).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(await screen.findByRole("dialog", { name: server.display_name })).toBeVisible();
  expect(screen.getByRole("button", { name: server.server_id })).toBeVisible();
  expect(publication.publish).not.toHaveBeenCalled(); expect(publication.receipt).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});

it("republishing uses the existing pin CAS and exact saved source, never a new connector", async () => {
  const { client, publication, detail, picker } = setup([pin]);
  await detail(); const dialog = await picker();
  fireEvent.click(await within(dialog).findByRole("checkbox", { name: project.name }));
  fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
  await waitFor(() => expect(publication.publish).toHaveBeenCalledOnce());
  expect(publication.publish.mock.calls[0]?.[0]).toEqual({ server_id: server.server_id, connector_id: connector.connector_id, expected_source_state_version: "7", targets: [{ project_id: project.id, expected_pin: { current: { pin_id: pin.pin_id, state_version: "4" } } }] });
  expect(await within(dialog).findByText(/已发布连接器定义/)).toBeVisible();
  expect(within(dialog).getByText(/项目执行尚未接通/)).toBeVisible();
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});

it("unknown publication reopens from the same management entry and inspects only the original command", async () => {
  const { publication, detail, picker } = setup();
  publication.publish.mockRejectedValueOnce(new HubClientError("network", "fixture lost ACK", null, null));
  await detail(); let dialog = await picker();
  fireEvent.click(await within(dialog).findByRole("checkbox", { name: project.name }));
  fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
  await within(dialog).findByRole("button", { name: "查询原请求回执" });
  const original = publication.publish.mock.calls[0]?.slice(0, 2);
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  dialog = await picker();
  expect(publication.publish).toHaveBeenCalledOnce(); expect(publication.receipt).not.toHaveBeenCalled();
  expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "查询原请求回执" }));
  await waitFor(() => expect(publication.receipt).toHaveBeenCalledOnce());
  expect(publication.receipt.mock.calls[0]?.slice(0, 2)).toEqual(original);
  expect(publication.publish).toHaveBeenCalledOnce();
});

it.each(["loading", "error"])("existing publication is disabled until the shared recovery journal is ready: %s", async state => {
  let release!: () => void;
  if (state === "loading") storage.pending = new Promise<void>(resolve => { release = resolve; });
  else storage.failed = true;
  const { detail, publicationMenu, publication } = setup();
  await detail(); const item = await publicationMenu();
  expect(item).toHaveAttribute("data-disabled"); fireEvent.click(item);
  expect(screen.queryByRole("dialog", { name: "发布到项目" })).not.toBeInTheDocument();
  expect(publication.list).not.toHaveBeenCalled(); expect(publication.publish).not.toHaveBeenCalled();
  if (state === "loading") {
    await act(async () => { release(); await storage.pending; });
    await waitFor(() => expect(item).not.toHaveAttribute("data-disabled"));
  }
});

it("configuration publication explicitly saves first, waits for the matching fresh source and only opens a picker", async () => {
  const { client, detail, publication } = setup();
  let saved = false, release!: () => void;
  const fresh = new Promise<void>(resolve => { release = resolve; });
  const updated = { ...server, display_name: "Saved publication label", state_version: "8" };
  client.getPrivateMcpServer.mockImplementation(async () => { if (saved) { await fresh; return updated; } return server; });
  const update = vi.fn<NonNullable<typeof client.updatePrivateMcpServer>>(async () => {
    saved = true; return { server: updated, connector, replayed: false };
  });
  client.updatePrivateMcpServer = update;
  const dialog = await detail();
  fireEvent.keyDown(within(dialog).getByRole("button", { name: "管理" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }));
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: updated.display_name } });
  fireEvent.keyDown(screen.getByRole("button", { name: "保存选项" }), { key: "Enter" });
  const entry = await screen.findByRole("menuitem", { name: "发布到项目" });
  await waitFor(() => expect(entry).not.toHaveAttribute("data-disabled"));
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(entry);
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(update.mock.calls[0]?.[1]).toEqual({ expected_state_version: "7", display_name: updated.display_name });
  expect(screen.queryByRole("dialog", { name: "发布到项目" })).toBeNull();
  expect(publication.list).not.toHaveBeenCalled(); expect(publication.publish).not.toHaveBeenCalled();
  await act(async () => { release(); await fresh; });
  const picker = await screen.findByRole("dialog", { name: "发布到项目" });
  await within(picker).findByRole("checkbox", { name: project.name });
  expect(publication.publish).not.toHaveBeenCalled(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  fireEvent.click(within(picker).getByRole("button", { name: "取消" }));
  expect(await screen.findByRole("dialog", { name: updated.display_name })).toBeVisible();
  expect(update).toHaveBeenCalledOnce(); expect(publication.publish).not.toHaveBeenCalled();
});

async function configurationContinuation() {
  const save = vi.fn(), publish = vi.fn();
  let props: Parameters<typeof CustomMcpDetailDialog>[0] = { admitted: true, iconBoundary: boundary, connector, server,
    actionId: null, managementCommand: undefined, onResumeManagement: vi.fn(), actionError: false, deleteId: null,
    returnFocusRef: { current: null }, onClose: vi.fn(), onSaveConfiguration: save, onPrepare: vi.fn(),
    publicationAvailable: true, onPublish: publish, onAuthorize: vi.fn(), onDisconnect: vi.fn(), onDeleteIntent: vi.fn(), onCancelDelete: vi.fn(), onDelete: vi.fn() };
  const content = () => <StrictMode><LocaleProvider><CustomMcpDetailDialog {...props} /></LocaleProvider></StrictMode>;
  const view = render(content());
  fireEvent.keyDown(screen.getByRole("button", { name: "管理" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑配置" }));
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Publication draft" } });
  fireEvent.keyDown(screen.getByRole("button", { name: "保存选项" }), { key: "Enter" });
  const entry = await screen.findByRole("menuitem", { name: "发布到项目" });
  expect(entry).not.toHaveAttribute("data-disabled"); fireEvent.click(entry);
  expect(save).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled();
  return { publish, save, change: (next: Partial<typeof props>) => { props = { ...props, ...next }; view.rerender(content()); } };
}

it("StrictMode Save→unknown→matching ACK waits for fresh paired facts and opens its picker exactly once", async () => {
  const state = await configurationContinuation();
  state.change({ managementCommand: { operation: "update_server", kind: "unknown", serverId: server.server_id, connectorId: connector.connector_id } });
  expect(state.publish).not.toHaveBeenCalled();
  const confirmation = {};
  state.change({ server: null, connector: null, managementCommand: undefined, configurationSaved: confirmation });
  expect(state.publish).not.toHaveBeenCalled();
  state.change({ server: { ...server, display_name: "Publication draft", state_version: "8" }, connector });
  await waitFor(() => expect(state.publish).toHaveBeenCalledOnce());
  state.change({ configurationSaved: confirmation });
  expect(state.publish).toHaveBeenCalledOnce(); expect(state.save).toHaveBeenCalledOnce();
});

it.each(["close", "actor", "generation", "admission", "target", "rejected"] as const)("a configuration publication continuation retires on %s; a late ACK never opens its picker", async retirement => {
  const state = await configurationContinuation();
  if (retirement === "close") fireEvent.keyDown(screen.getByRole("dialog", { name: "MCP 配置" }), { key: "Escape" });
  else state.change(retirement === "actor" ? { iconBoundary: { ...boundary, subject: "other-publisher" } }
    : retirement === "generation" ? { iconBoundary: { ...boundary, generation: 2 } }
    : retirement === "admission" ? { admitted: false }
    : retirement === "target" ? { server: { ...server, server_id: "other-server" } }
    : { managementCommand: { operation: "update_server", kind: "rejected", serverId: server.server_id, connectorId: connector.connector_id } });
  state.change({ admitted: true, iconBoundary: boundary, server: { ...server, display_name: "Publication draft", state_version: "8" }, connector, managementCommand: undefined, configurationSaved: {} });
  expect(state.publish).not.toHaveBeenCalled(); expect(state.save).toHaveBeenCalledOnce();
});

it("a failed recovery read stays visible and explicit retry unlocks publication without changing the saved source or sending a write", async () => {
  storage.failed = true;
  const { client, publication, detail, picker } = setup();
  const dialog = await detail();
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("发布恢复记录读取失败");
  fireEvent.click(within(dialog).getByRole("button", { name: "重试读取" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("发布恢复记录读取失败");
  expect(within(dialog).getByRole("button", { name: server.server_id })).toBeVisible();
  storage.failed = false;
  fireEvent.click(within(dialog).getByRole("button", { name: "重试读取" }));
  await waitFor(() => expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument());
  expect(await picker()).toBeVisible();
  expect(publication.publish).not.toHaveBeenCalled(); expect(publication.receipt).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});

it.each(["connector type", "source binding"])("fresh confirmation rejects a changed %s instead of publishing a different aggregate", async change => {
  const { client, publication, detail, picker } = setup();
  await detail(); const dialog = await picker();
  client.getMcpConnector.mockResolvedValue(change === "connector type" ? { ...connector, connector_type: "byok" } : { ...connector, server_id: "different-server" });
  fireEvent.click(await within(dialog).findByRole("checkbox", { name: project.name }));
  fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("读取失败");
  expect(publication.publish).not.toHaveBeenCalled(); expect(publication.list).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
});

it("an admission change retires the open picker and its pending confirmation without publishing stale selections", async () => {
  const { client, publication, detail, picker, view, form } = setup();
  await detail(); const dialog = await picker();
  let resolve!: (value: McpPrivateServer) => void;
  const read = new Promise<McpPrivateServer>(done => { resolve = done; });
  client.getPrivateMcpServer.mockReturnValueOnce(read);
  fireEvent.click(await within(dialog).findByRole("checkbox", { name: project.name }));
  fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
  await waitFor(() => expect(client.getMcpConnector).toHaveBeenCalledOnce());
  view.rerender(form({ ...boundary, admitted: false, generation: 2 }));
  expect(screen.queryByRole("dialog", { name: "发布到项目" })).not.toBeInTheDocument();
  await act(async () => { resolve(server); await read; });
  expect(publication.publish).not.toHaveBeenCalled(); expect(publication.list).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
});

it("fresh SSE keeps personal details but cannot offer or dispatch HTTP-only project publication", async () => {
  const { client, publication, detail, publicationMenu } = setup();
  client.getPrivateMcpServer.mockResolvedValue({ ...server, transport: "sse_compat" });
  const dialog = await detail();
  const item = await publicationMenu();
  expect(item).toHaveAttribute("data-disabled");
  fireEvent.click(item);
  expect(screen.queryByRole("dialog", { name: "发布到项目" })).not.toBeInTheDocument();
  expect(dialog).toBeVisible();
  expect(publication.list).not.toHaveBeenCalled();
  expect(publication.publish).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
});
