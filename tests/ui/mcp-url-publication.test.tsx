import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UrlMcpForm } from "@/ui/mcp/mcp-url-form";
import { createMcpServerCreationFlow } from "@/ui/mcp/mcp-server-creation-flow";
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands";
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema";
beforeEach(() => localStorage.setItem("kokoro.locale", "zh"));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("URL Save and publish confirms only registration, then hands the exact entity to the project picker without Prepare or OAuth", async () => {
  const server: McpPrivateServer = { availability: "unavailable", server_id: "server-publish", display_name: "Publication", server_url: "https://mcp.example.test/mcp", notes: "", status: "registered", state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const connector: McpConnector = { availability: "unavailable", connector_id: "connector-publish", server_id: server.server_id, provider_key: "provider-publish", connector_type: "mcp", display_name: "Publication", status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  const client = { registerPrivateMcpServer: vi.fn().mockResolvedValue({ server, connector, replayed: false }), getPrivateMcpServer: vi.fn().mockResolvedValue(server), getMcpConnector: vi.fn().mockResolvedValue(connector), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const boundary = { subject: "actor", generation: 1, admitted: true };
  const flow = createMcpServerCreationFlow({ client, preparation: createMcpPreparationCommands({ client, boundary, onConfirmed: vi.fn(), canPrepare: () => true }), boundary, onChanged: vi.fn() });
  const onPublish = vi.fn().mockResolvedValue(undefined), onDone = vi.fn();
  const popup = vi.spyOn(window, "open").mockReturnValue(null);
  render(<LocaleProvider><Dialog open><DialogContent><UrlMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={onDone} onPublish={onPublish} /></DialogContent></Dialog></LocaleProvider>);
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称/ }), { target: { value: "Publication" } });
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL/ }), { target: { value: server.server_url } });
  await selectPublicationOption();
  await waitFor(() => expect(onPublish).toHaveBeenCalledWith({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key }, expect.any(Function)));
  expect(popup).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
});


it.each(["configure", "publish"] as const)("unknown URL %s keeps its original intent, body and key when the other Save action is clicked", async intent => {
  const server: McpPrivateServer = { availability: "unavailable", server_id: "unknown-intent-server", display_name: "Original intent", server_url: "https://mcp.example.test/original-intent", notes: "", status: "registered", state_version: "1", headers: [], transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const connector: McpConnector = { availability: "unavailable", connector_id: "unknown-intent-connector", server_id: server.server_id, provider_key: "unknown-intent-provider", connector_type: "mcp", status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  const client = { registerPrivateMcpServer: vi.fn().mockRejectedValueOnce(new Error("lost original ACK")).mockResolvedValue({ server, connector, replayed: true }), getPrivateMcpServer: vi.fn().mockResolvedValue(server), getMcpConnector: vi.fn().mockResolvedValue(connector), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const boundary = { subject: "original-intent-actor", generation: 1, admitted: true };
  const flow = createMcpServerCreationFlow({ client, preparation: createMcpPreparationCommands({ client, boundary, onConfirmed: vi.fn(), canPrepare: () => true }), boundary, onChanged: vi.fn() });
  const onPublish = vi.fn().mockResolvedValue(undefined), onDone = vi.fn().mockResolvedValue(undefined);
  render(<LocaleProvider><Dialog open><DialogContent><UrlMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={onDone} onPublish={onPublish} /></DialogContent></Dialog></LocaleProvider>);
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器名称/ }), { target: { value: server.display_name } });
  fireEvent.change(screen.getByRole("textbox", { name: /^服务器 URL/ }), { target: { value: server.server_url } });
  if (intent === "publish") await selectPublicationOption();
  else fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
  await waitFor(() => expect(flow.getSnapshot().unknown).toBe("register"));
  const [body, key] = client.registerPrivateMcpServer.mock.calls[0]!;
  expect(Object.hasOwn(body, "transport")).toBe(false);
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  if (intent === "configure") await selectPublicationOption();
  else fireEvent.click(screen.getByRole("button", { name: "重试原请求" }));
  const expected = intent === "configure" ? onDone : onPublish;
  await waitFor(() => expect(expected).toHaveBeenCalledOnce());
  expect(intent === "configure" ? onPublish : onDone).not.toHaveBeenCalled();
  expect(client.registerPrivateMcpServer).toHaveBeenCalledTimes(2);
  expect(client.registerPrivateMcpServer.mock.calls[1]?.[0]).toBe(body);
  expect(client.registerPrivateMcpServer.mock.calls[1]?.[1]).toBe(key);
  expect(Object.hasOwn(client.registerPrivateMcpServer.mock.calls[1]![0], "transport")).toBe(false);
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});

it("a retained publish registration does not dispatch through plain Retry while its picker callback is unavailable", async () => {
  const client = { registerPrivateMcpServer: vi.fn().mockRejectedValue(new Error("lost ACK")), getPrivateMcpServer: vi.fn(), getMcpConnector: vi.fn(), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const boundary = { subject: "publication-availability-actor", generation: 1, admitted: true };
  const flow = createMcpServerCreationFlow({ client, preparation: createMcpPreparationCommands({ client, boundary, onConfirmed: vi.fn(), canPrepare: () => true }), boundary, onChanged: vi.fn() });
  const window = {}, detach = flow.attach(window);
  await flow.submit({ display_name: "Retained publish", server_url: "https://mcp.example.test/retained-publish" }, { window, boundary }, "publish");
  detach();
  render(<LocaleProvider><Dialog open><DialogContent><UrlMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={vi.fn()} /></DialogContent></Dialog></LocaleProvider>);
  expect(screen.getByRole("button", { name: "保存并发布" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }));
  await waitFor(() => expect(flow.getSnapshot().busy).toBe(false));
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  expect(flow.getSnapshot()).toMatchObject({ unknown: "register", intent: "publish" });
});

async function selectPublicationOption(): Promise<void> {
  fireEvent.keyDown(screen.getByRole("button", { name: "保存并发布" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "发布到项目" }));
}

type PublishCallback = NonNullable<Parameters<typeof UrlMcpForm>[0]["onPublish"]>;
function menuFixture(onPublish: PublishCallback | null = vi.fn<PublishCallback>().mockResolvedValue(undefined)) {
  const server: McpPrivateServer = { availability: "unavailable", server_id: "menu-server", display_name: "Menu MCP", server_url: "https://mcp.example.test/menu", notes: "", status: "registered", state_version: "1", headers: [], transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const connector: McpConnector = { availability: "unavailable", connector_id: "menu-connector", server_id: server.server_id, provider_key: "menu-provider", connector_type: "mcp", status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  const client = { registerPrivateMcpServer: vi.fn().mockResolvedValue({ server, connector, replayed: false }), getPrivateMcpServer: vi.fn().mockResolvedValue(server), getMcpConnector: vi.fn().mockResolvedValue(connector), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const boundary = { subject: "menu-actor", generation: 1, admitted: true };
  const flow = createMcpServerCreationFlow({ client, preparation: createMcpPreparationCommands({ client, boundary, onConfirmed: vi.fn(), canPrepare: () => true }), boundary, onChanged: vi.fn() });
  const dismissed = vi.fn();
  const renderForm = () => <LocaleProvider><Dialog open onOpenChange={dismissed}><DialogContent><UrlMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={vi.fn()} {...(onPublish ? { onPublish } : {})} /></DialogContent></Dialog></LocaleProvider>;
  const view = render(renderForm());
  const name = screen.getByRole("textbox", { name: /^服务器名称/ });
  const url = screen.getByRole("textbox", { name: /^服务器 URL/ });
  fireEvent.change(name, { target: { value: server.display_name } });
  fireEvent.change(url, { target: { value: server.server_url } });
  return { client, flow, boundary, view, renderForm, name, url, onPublish, dismissed };
}

it("URL publication trigger opens a real menu without registering; Escape preserves the draft and only item selection publishes", async () => {
  const { client, name, url, onPublish, dismissed } = menuFixture();
  const trigger = screen.getByRole("button", { name: "保存并发布" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const item = await screen.findByRole("menuitem", { name: "发布到项目" });
  fireEvent.keyDown(item, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  expect(dismissed).not.toHaveBeenCalled();
  expect(name).toHaveValue("Menu MCP");
  expect(url).toHaveValue("https://mcp.example.test/menu");
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.keyDown(trigger, { key: "Enter" });
  const reopened = await screen.findByRole("menuitem", { name: "发布到项目" });
  fireEvent.keyDown(reopened, { key: "ArrowDown" });
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
  fireEvent.keyDown(reopened, { key: "Enter" });
  await waitFor(() => expect(onPublish).toHaveBeenCalledOnce());
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});

it("a currently open publication menu cannot dispatch after admission retires", async () => {
  const { client, flow, boundary } = menuFixture();
  fireEvent.keyDown(screen.getByRole("button", { name: "保存并发布" }), { key: "ArrowDown" });
  const item = await screen.findByRole("menuitem", { name: "发布到项目" });
  act(() => flow.bind({ ...boundary, admitted: false, generation: 2 }));
  expect(item).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(item);
  expect(client.registerPrivateMcpServer).not.toHaveBeenCalled();
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
});

it.each(["missing-picker", "invalid-input"] as const)("publication menu remains disabled with %s", mode => {
  const fixture = menuFixture(mode === "missing-picker" ? null : vi.fn<PublishCallback>());
  if (mode === "invalid-input") fireEvent.change(fixture.url, { target: { value: "invalid" } });
  const trigger = screen.getByRole("button", { name: "保存并发布" });
  expect(trigger).toBeDisabled();
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: "Enter" });
  expect(screen.queryByRole("menuitem", { name: "发布到项目" })).not.toBeInTheDocument();
  expect(fixture.client.registerPrivateMcpServer).not.toHaveBeenCalled();
});


it.each(["confirmed", "read-failed", "publish"] as const)("URL definition keeps its exact original form through ACK, held reads and navigation closing: %s", async mode => {
  const server: McpPrivateServer = { availability: "unavailable", server_id: "pending-url-server", display_name: "Pending URL", server_url: "https://mcp.example.test/pending-url", notes: "", status: "registered", state_version: "1", headers: [], transport: "streamable_http", prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const connector: McpConnector = { availability: "unavailable", connector_id: "pending-url-connector", server_id: server.server_id, provider_key: "pending-url-provider", connector_type: "mcp", status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  let acknowledge!: () => void, read!: () => void, close!: () => void;
  const ack = new Promise<void>(resolve => { acknowledge = resolve; });
  const exact = new Promise<void>(resolve => { read = resolve; });
  const closing = new Promise<void>(resolve => { close = resolve; });
  const client = { registerPrivateMcpServer: vi.fn(async () => { await ack; return { server, connector, replayed: false }; }), getPrivateMcpServer: vi.fn(async () => { await exact; if (mode === "read-failed") throw new Error("exact read failed"); return server; }), getMcpConnector: vi.fn(async () => { await exact; return connector; }), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const boundary = { subject: "pending-url-actor", generation: 1, admitted: true };
  const flow = createMcpServerCreationFlow({ client, preparation: createMcpPreparationCommands({ client, boundary, onConfirmed: vi.fn(), canPrepare: () => true }), boundary, onChanged: vi.fn() });
  const onDone = vi.fn(async () => { await closing; });
  render(<LocaleProvider><Dialog open><DialogContent><UrlMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={mode === "publish" ? vi.fn() : onDone} {...(mode === "publish" ? { onPublish: onDone } : {})} /></DialogContent></Dialog></LocaleProvider>);
  const name = screen.getByRole("textbox", { name: /^服务器名称/ }), url = screen.getByRole("textbox", { name: /^服务器 URL/ });
  fireEvent.change(name, { target: { value: server.display_name } });
  fireEvent.change(url, { target: { value: server.server_url } });
  const save = screen.getByRole("button", { name: /^保存$/u });
  if (mode === "publish") await selectPublicationOption();
  else fireEvent.click(save);
  expect(name).toBeInTheDocument();
  await act(async () => { acknowledge(); await ack; });
  await waitFor(() => expect(client.getPrivateMcpServer).toHaveBeenCalledOnce());
  expect(name).toBeInTheDocument();
  expect(url).toBeInTheDocument();
  expect(name).toHaveValue(server.display_name);
  expect(url).toHaveValue(server.server_url);
  expect(name).toHaveAttribute("readonly");
  expect(save).toBeDisabled();
  expect(save).toHaveAttribute("aria-busy", "true");
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { read(); await exact; });
  if (mode !== "read-failed") {
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(name).toBeInTheDocument();
    expect(url).toBeInTheDocument();
    expect(save).toBeDisabled();
    await act(async () => { close(); await closing; });
  } else {
    expect(await screen.findByRole("alert")).toBeVisible();
    const retry = screen.getByRole("button", { name: /^保存$/u });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(client.getPrivateMcpServer).toHaveBeenCalledTimes(2));
    expect(onDone).not.toHaveBeenCalled();
  }
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});
