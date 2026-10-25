import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { createHubClient } from "@/hub/client";
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context";
import { McpCreateDialog } from "@/ui/mcp/mcp-create-dialog";
import { McpTrialProvider } from "@/ui/mcp/mcp-trial-context";
import type { McpPrivateServer, McpConnector } from "@/hub/mcp-connector.schema";
import type { McpProjectPin } from "@/hub/mcp-project-publication.schema";
import * as projectReader from "@/features/app/project-list";
import { createTestPublicationJournal } from "./mcp-publication-journal-fixture";
vi.mock("@/ui/mcp/mcp-project-publication-recovery", () => ({ createBrowserMcpProjectPublicationRecovery: () => createTestPublicationJournal() }));
const boundary = { subject: "publish-actor", admitted: true, generation: 1 };
const server: McpPrivateServer = { availability: "unavailable", server_id: "source-server", display_name: "Saved source", server_url: "https://mcp.example.test/mcp", notes: "", status: "registered", state_version: "2", headers: [], prepare_status: "pending_prepare", declarations: [], declarations_available: false };
const connector: McpConnector = { availability: "unavailable", connector_id: "source-connector", server_id: server.server_id, provider_key: "source-provider", display_name: server.display_name, connector_type: "mcp", status: "pending", enabled: false, state_version: "2", approved_scopes: [] };
const project = { id: "project-canonical", slug: "not-a-canonical-id", name: "My project", description: "", created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z" };
beforeEach(() => { localStorage.setItem("kokoro.locale", "zh"); vi.spyOn(projectReader, "listProjects").mockResolvedValue([project]); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(pins: McpProjectPin[] = []) {
 const publication = { list: vi.fn().mockResolvedValue({ pins, next_cursor: null }), publish: vi.fn(), receipt: vi.fn() };
 const client = { ...createHubClient(), mcpProjectPublication: publication, registerPrivateMcpServer: vi.fn().mockResolvedValue({ server, connector, replayed: false }), getPrivateMcpServer: vi.fn().mockResolvedValue(server), getMcpConnector: vi.fn().mockResolvedValue(connector), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn(), listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }), listMcpConnectors: vi.fn().mockResolvedValue({ items: [connector], next_cursor: null }), listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }) };
 const onDone = vi.fn().mockResolvedValue(undefined);
 const form = (next = boundary) => <LocaleProvider><McpTrialProvider onTry={() => true}><ConnectorCommandProvider client={client} boundary={next}><McpCreateDialog client={client} mode="url" open onOpenChange={vi.fn()} onDone={onDone} /></ConnectorCommandProvider></McpTrialProvider></LocaleProvider>;
 const view = render(form());
 const create = async () => {
 fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称/ }), { target: { value: server.display_name } });
 fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL/ }), { target: { value: server.server_url } });
 await waitFor(() => expect(screen.getByRole("button", { name: "保存并发布" })).toBeEnabled());
 fireEvent.click(screen.getByRole("button", { name: "保存并发布" }));
 return screen.findByRole("dialog", { name: "发布到项目" });
 };
 return { client, publication, create, onDone, view, form };
}
it("create ACK opens observed project picker; cancel preserves the exact newly saved detail and performs no publication/authorization", async () => {
 const { create, client, publication } = setup(); const popup = vi.spyOn(window, "open"); const picker = await create();
 await within(picker).findByRole("checkbox", { name: project.name });
 expect(publication.list).not.toHaveBeenCalled();
 expect(within(picker).getByRole("button", { name: "确认" })).toBeDisabled();
 fireEvent.click(within(picker).getByRole("button", { name: "取消" }));
 await waitFor(() => expect(screen.queryByRole("dialog", { name: "发布到项目" })).not.toBeInTheDocument());
 expect(await screen.findByRole("dialog", { name: server.display_name })).toBeVisible();
 expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled(); expect(publication.publish).not.toHaveBeenCalled(); expect(popup).not.toHaveBeenCalled();
});
it("confirm freezes canonical project and source CAS; acknowledgement says definition only, not connection success", async () => {
 const { create, publication } = setup(); const picker = await create();
 const revision = { revision_id: "revision", server_id: server.server_id, connector_id: connector.connector_id, content_digest: "a".repeat(64), source_state_version: "2", display_name: server.display_name, created_at: "2026-10-25T00:00:00Z" };
 publication.publish.mockResolvedValue({ revision, pins: [{ pin_id: "pin", project_id: project.id, revision, state_version: "1", removed: false, updated_at: "2026-10-25T00:00:00Z", execution_ready: false }], replayed: false });
 fireEvent.click(await within(picker).findByRole("checkbox", { name: project.name })); fireEvent.click(within(picker).getByRole("button", { name: "确认" }));
 await waitFor(() => expect(publication.publish).toHaveBeenCalledOnce());
 expect(publication.publish.mock.calls[0]?.[0]).toEqual({ server_id: server.server_id, connector_id: connector.connector_id, expected_source_state_version: "2", targets: [{ project_id: project.id, expected_pin: { absent: true } }] });
 expect(await within(picker).findByText(/已发布连接器定义/)).toBeVisible(); expect(within(picker).getByText(/项目执行尚未接通/)).toBeVisible();
});
it("a removed pin retains its exact tombstone CAS instead of pretending no pin exists", async () => {
 const revision = { revision_id: "old", server_id: server.server_id, connector_id: connector.connector_id, content_digest: "a".repeat(64), source_state_version: "1", display_name: server.display_name, created_at: "2026-10-24T00:00:00Z" };
 const { create, publication } = setup([{ pin_id: "pin-old", project_id: project.id, revision, state_version: "4", removed: true, updated_at: "2026-10-24T00:00:00Z", execution_ready: false }]);
 publication.publish.mockRejectedValue(Error("bounded fixture failure")); const picker = await create(); fireEvent.click(await within(picker).findByRole("checkbox", { name: project.name })); fireEvent.click(within(picker).getByRole("button", { name: "确认" }));
 await waitFor(() => expect(publication.publish).toHaveBeenCalledOnce()); expect(publication.publish.mock.calls[0]?.[0].targets[0].expected_pin).toEqual({ current: { pin_id: "pin-old", state_version: "4" } });
});
it("project reader failure is not an empty directory; retry performs reads only", async () => {
 vi.mocked(projectReader.listProjects).mockRejectedValueOnce(Error("read failed"));
 const { create, publication } = setup(); const picker = await create();
 expect(await within(picker).findByRole("alert")).toHaveTextContent("读取失败"); expect(within(picker).queryByText("暂无可发布的项目。")).toBeNull();
 fireEvent.click(within(picker).getByRole("button", { name: "重试读取" })); await within(picker).findByRole("checkbox", { name: project.name }); expect(publication.publish).not.toHaveBeenCalled();
});
it("the project list is selectable without scanning unselected projects; only confirm reads the chosen CAS", async () => {
 const other = { ...project, id: "other-project", name: "Other project" }; vi.mocked(projectReader.listProjects).mockResolvedValue([project, other]);
 const { create, publication } = setup(); publication.publish.mockRejectedValue(Error("unknown fixture")); const picker = await create();
 expect(await within(picker).findByRole("checkbox", { name: other.name })).toBeEnabled(); expect(publication.list).not.toHaveBeenCalled();
 fireEvent.click(within(picker).getByRole("checkbox", { name: project.name })); fireEvent.click(within(picker).getByRole("button", { name: "确认" }));
 await waitFor(() => expect(publication.publish).toHaveBeenCalledOnce()); expect(publication.list).toHaveBeenCalledOnce(); expect(publication.list).toHaveBeenCalledWith(project.id, undefined, expect.any(AbortSignal));
});
it("cancel during pin discovery aborts reads and never creates a publication", async () => {
 const { create, publication } = setup(); let finish!: (value: { pins: never[]; next_cursor: null }) => void;
 publication.list.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const picker = await create();
 fireEvent.click(await within(picker).findByRole("checkbox", { name: project.name })); fireEvent.click(within(picker).getByRole("button", { name: "确认" }));
 await waitFor(() => expect(publication.list).toHaveBeenCalledOnce()); const signal = publication.list.mock.calls[0]?.[2];
 fireEvent.click(within(picker).getByRole("button", { name: "取消" })); expect(signal.aborted).toBe(true); finish({ pins: [], next_cursor: null });
 await screen.findByRole("dialog", { name: server.display_name }); expect(publication.publish).not.toHaveBeenCalled();
});
it("a repeated cursor cannot be treated as an absent pin or cause a publish", async () => {
 const { create, publication } = setup(); publication.list.mockResolvedValue({ pins: [], next_cursor: "repeated" }); const picker = await create();
 fireEvent.click(await within(picker).findByRole("checkbox", { name: project.name })); fireEvent.click(within(picker).getByRole("button", { name: "确认" }));
 expect(await within(picker).findByRole("alert")).toHaveTextContent("读取失败"); expect(publication.list).toHaveBeenCalledTimes(2); expect(publication.publish).not.toHaveBeenCalled();
});
