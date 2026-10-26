import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fireEvent.click(screen.getByRole("button", { name: "保存并发布" }));
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
  fireEvent.click(screen.getByRole("button", { name: intent === "configure" ? /^保存$/u : "保存并发布" }));
  await waitFor(() => expect(flow.getSnapshot().unknown).toBe("register"));
  const [body, key] = client.registerPrivateMcpServer.mock.calls[0]!;
  expect(Object.hasOwn(body, "transport")).toBe(false);
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: intent === "configure" ? "保存并发布" : "重试原请求" }));
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
