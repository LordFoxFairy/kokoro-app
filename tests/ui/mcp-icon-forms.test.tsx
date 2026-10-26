import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createHubClient, type HubClient } from "@/hub/client";
import type { CustomApiProfile } from "@/hub/custom-api.schema";
import type { McpConnector, McpPrivateServer } from "@/hub/mcp-connector.schema";
import type { McpIconClient } from "@/hub/mcp-icon-client";
import type { McpIconIntent } from "@/hub/mcp-icon.schema";
import { LocaleProvider } from "@/i18n/context";
import { CustomApiDetailDialog } from "@/ui/mcp/custom-api-detail-dialog";
import { CustomApiForm } from "@/ui/mcp/custom-api-form";
import { createCustomApiCreateFlow } from "@/ui/mcp/custom-api-create-flow";
import { CustomMcpForm } from "@/ui/mcp/mcp-custom-form";
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context";
import { McpCreateDialog } from "@/ui/mcp/mcp-create-dialog";
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands";
import { createMcpServerCreationFlow } from "@/ui/mcp/mcp-server-creation-flow";

// Real forms/flows and picker menus, following mcp-custom-form-visual and
// connector-creation-command fixtures. Only owner I/O is controlled here.
const boundary = { admitted: true, subject: "icon-form-actor", generation: 1 };
const iconId = "12345678-1234-1234-1234-123456789abc";
const selector = { intent_id: iconId, expected_state_version: "3" };
const imageUrl = "https://images.example.test/icon.png";
const profile: CustomApiProfile = {
  profile_id: "icon-form-api", name: "Original API", state_version: "7",
  created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z", environment: [],
};

function iconFixture() {
  const at = new Date(Date.now() + 60_000).toISOString();
  const intent: McpIconIntent = {
    intent_id: iconId, state: "ready", state_version: "3", filename: "icon.png",
    mime_type: "image/png", content_sha256: "a".repeat(64), size_bytes: "8",
    expires_at: at, expired: false, width: 24, height: 24, created_at: at, updated_at: at,
  };
  const preview = { url: "https://storage.example.test/preview?signature=temporary", method: "GET" as const, required_headers: {}, expires_at: at };
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const client = {
    begin: vi.fn<McpIconClient["begin"]>(), complete: vi.fn<McpIconClient["complete"]>(),
    importUrl: vi.fn<McpIconClient["importUrl"]>(async () => { await pending; return { intent, replayed: false }; }),
    get: vi.fn<McpIconClient["get"]>(async () => ({ intent, preview_reference: preview })),
    cancel: vi.fn<McpIconClient["cancel"]>(async () => ({ intent: { ...intent, state: "released", state_version: "5" }, replayed: false })),
  } satisfies McpIconClient;
  return { client, release, pending };
}

async function chooseUrl(client: ReturnType<typeof iconFixture>["client"]) {
  fireEvent.keyDown(screen.getByRole("button", { name: /^上传$/u }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "粘贴图片 URL" }));
  const dialog = await screen.findByRole("dialog", { name: "通过 URL 添加图片" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "图标 URL" }), { target: { value: imageUrl } });
  fireEvent.click(within(dialog).getByRole("button", { name: /^添加$/u }));
  await waitFor(() => expect(client.importUrl).toHaveBeenCalledOnce());
  expect(client.importUrl.mock.calls[0]?.[0]).toEqual({ image_url: imageUrl });
  expect(client.begin).not.toHaveBeenCalled();
  expect(client.complete).not.toHaveBeenCalled();
}

async function acknowledgeIcon(fixture: ReturnType<typeof iconFixture>) {
  await act(async () => { fixture.release(); await fixture.pending; });
  expect(await screen.findByRole("img", { name: "连接器图标" })).toHaveAttribute("src", "https://storage.example.test/preview?signature=temporary");
  await waitFor(() => expect(screen.getByRole("button", { name: /^上传$/u })).toBeEnabled());
}

function renderCreationDialog(mode: "form" | "custom-api", icon: ReturnType<typeof iconFixture>) {
  const create = vi.fn<NonNullable<HubClient["createCustomApi"]>>(async () => profile);
  const register = vi.fn<NonNullable<HubClient["registerPrivateMcpServer"]>>();
  const done = vi.fn(async () => undefined);
  const client = { ...createHubClient(), mcpIcons: icon.client, createCustomApi: create, registerPrivateMcpServer: register };
  function Harness() {
    const [open, setOpen] = useState(true);
    return <ConnectorCommandProvider client={client} boundary={boundary}>
      {open ? <McpCreateDialog client={client} mode={mode} open onOpenChange={setOpen} onDone={done} /> : null}
    </ConnectorCommandProvider>;
  }
  const view = render(<LocaleProvider><Harness /></LocaleProvider>);
  return { view, create, register, done };
}

beforeEach(() => { localStorage.setItem("kokoro.locale", "zh"); });
afterEach(() => { cleanup(); localStorage.removeItem("kokoro.locale"); });

it("Custom API URL staging never creates a connector until original Save carries the ready selector", async () => {
  const icon = iconFixture();
  const create = vi.fn<NonNullable<HubClient["createCustomApi"]>>(async () => profile);
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary, onConfirmed: vi.fn() });
  const view = render(<LocaleProvider><CustomApiForm flow={flow} iconClient={icon.client} boundary={boundary} onCancel={vi.fn()} onDone={async () => undefined} /></LocaleProvider>);
  fireEvent.change(screen.getByRole("textbox", { name: /^名称$/u }), { target: { value: profile.name } });
  await chooseUrl(icon.client);
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /^保存$/u })).toBeDisabled();
  await acknowledgeIcon(icon);
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(create.mock.calls[0]?.[0]).toEqual({ name: profile.name, environment: [], icon: selector });
  expect(create.mock.calls[0]?.[1]).toMatch(/^[a-f0-9-]{36}$/u);
  view.unmount();
  expect(icon.client.cancel).not.toHaveBeenCalled();
});

it("Custom MCP URL staging never registers a server until its original Save carries the ready selector", async () => {
  const icon = iconFixture();
  const server: McpPrivateServer = { availability: "available", server_id: "icon-form-server", display_name: "Original MCP", server_url: "https://mcp.example.test/mcp", status: "registered", state_version: "4", headers: [], transport: "streamable_http" as const, prepare_status: "ready", declarations: [], declarations_available: true };
  const connector: McpConnector = { availability: "available", connector_id: "icon-form-connector", server_id: server.server_id, provider_key: "icon-form-provider", connector_type: "mcp", status: "active", enabled: true, approved_scopes: [], state_version: "4" };
  const register = vi.fn<NonNullable<HubClient["registerPrivateMcpServer"]>>(async () => ({ server, connector, replayed: false }));
  const client = { registerPrivateMcpServer: register, preparePrivateMcpServer: vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>(), getPrivateMcpServer: vi.fn(async () => server), getMcpConnector: vi.fn(async () => connector), beginMcpConnectorAuthorization: vi.fn<NonNullable<HubClient["beginMcpConnectorAuthorization"]>>() };
  const flow = createMcpServerCreationFlow({ client, boundary, onChanged: vi.fn(), preparation: createMcpPreparationCommands({ client, boundary, canPrepare: () => true, onConfirmed: vi.fn() }) });
  const view = render(<LocaleProvider><Dialog open><DialogContent><CustomMcpForm flow={flow} iconClient={icon.client} boundary={boundary} onCancel={vi.fn()} onDone={async () => undefined} /></DialogContent></Dialog></LocaleProvider>);
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: server.display_name } });
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: server.server_url } });
  await chooseUrl(icon.client);
  expect(register).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /^保存$/u })).toBeDisabled();
  await acknowledgeIcon(icon);
  expect(register).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
  await waitFor(() => expect(register).toHaveBeenCalledOnce());
  expect(register.mock.calls[0]?.[0]).toEqual({ transport: "streamable_http", display_name: server.display_name, server_url: server.server_url, icon: selector });
  expect(register.mock.calls[0]?.[1]).toMatch(/^[a-f0-9-]{36}$/u);
  view.unmount();
  expect(icon.client.cancel).not.toHaveBeenCalled();
});

it("cancelling a ready Custom API draft releases only the staged icon and never creates a connector", async () => {
  const icon = iconFixture(), close = vi.fn();
  const create = vi.fn<NonNullable<HubClient["createCustomApi"]>>(async () => profile);
  const flow = createCustomApiCreateFlow({ client: { createCustomApi: create }, boundary, onConfirmed: vi.fn() });
  const view = render(<LocaleProvider><CustomApiForm flow={flow} iconClient={icon.client} boundary={boundary} onCancel={close} onDone={async () => undefined} /></LocaleProvider>);
  await chooseUrl(icon.client);
  await acknowledgeIcon(icon);
  fireEvent.click(screen.getByRole("button", { name: /^取消$/u }));
  view.unmount();
  expect(close).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
  expect(icon.client.cancel).toHaveBeenCalledOnce();
  expect(icon.client.cancel.mock.calls[0]?.slice(0, 2)).toEqual([iconId, { expected_state_version: "3" }]);
  expect(icon.client.cancel.mock.calls[0]?.[3]?.aborted).toBe(false);
});

it("an icon-only edit enables the original Custom API detail Save without changing its resource CAS", async () => {
  const icon = iconFixture(), save = vi.fn();
  render(<LocaleProvider><CustomApiDetailDialog profile={profile} iconClient={icon.client} iconBoundary={boundary}
    actionError={false} busy={false} admitted command={undefined} canUpdate canRemove onResume={vi.fn()}
    returnFocusRef={{ current: null }} onClose={vi.fn()} onSave={save} onDelete={vi.fn()} /></LocaleProvider>);
  const button = screen.getByRole("button", { name: /^保存$/u });
  expect(button).toBeDisabled();
  await chooseUrl(icon.client);
  expect(save).not.toHaveBeenCalled();
  await acknowledgeIcon(icon);
  expect(button).toBeEnabled();
  expect(screen.getByRole("textbox", { name: /^名称$/u })).toHaveValue(profile.name);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledExactlyOnceWith({ name: profile.name, expected_state_version: "7", clear_instructions: true, icon: selector });
  expect(icon.client.cancel).not.toHaveBeenCalled();
});

it.each([
  ["form", "close-button"],
  ["custom-api", "escape"],
  ["custom-api", "inner-cancel"],
] as const)("the real %s creation dialog %s releases the ready draft exactly once without creating a connector", async (mode, close) => {
  const icon = iconFixture();
  const fixture = renderCreationDialog(mode, icon);
  await chooseUrl(icon.client);
  await acknowledgeIcon(icon);
  const dialog = screen.getByRole("dialog");
  if (close === "escape") fireEvent.keyDown(dialog, { key: "Escape" });
  else {
    const buttons = within(dialog).getAllByRole("button", { name: /^取消$/u });
    const button = buttons.find(candidate => close === "close-button"
      ? candidate.getAttribute("data-slot") === "dialog-close"
      : candidate.getAttribute("data-slot") !== "dialog-close");
    if (!button) throw new Error("Original creation dismissal button missing");
    fireEvent.click(button);
  }
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(fixture.create).not.toHaveBeenCalled();
  expect(fixture.register).not.toHaveBeenCalled();
  expect(icon.client.cancel).toHaveBeenCalledOnce();
  expect(icon.client.cancel.mock.calls[0]?.slice(0, 2)).toEqual([iconId, { expected_state_version: "3" }]);
  expect(icon.client.cancel.mock.calls[0]?.[3]?.aborted).toBe(false);
});

it("the real creation dialog's successful Save dismissal never cancels the handed-off icon", async () => {
  const icon = iconFixture();
  const fixture = renderCreationDialog("custom-api", icon);
  fireEvent.change(screen.getByRole("textbox", { name: /^名称$/u }), { target: { value: profile.name } });
  await chooseUrl(icon.client);
  await acknowledgeIcon(icon);
  fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
  await waitFor(() => expect(fixture.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(fixture.create.mock.calls[0]?.[0]).toEqual({ name: profile.name, environment: [], icon: selector });
  expect(fixture.done).toHaveBeenCalledOnce();
  expect(fixture.register).not.toHaveBeenCalled();
  expect(icon.client.cancel).not.toHaveBeenCalled();
});

// Same explicit jsdom journal port as mcp-configuration-save. It does not claim
// native IndexedDB or live-owner coverage, and leaves recovery rules intact.
vi.mock("@/ui/mcp/mcp-preparation-recovery", async importOriginal => {
  const actual = await importOriginal<typeof import("@/ui/mcp/mcp-preparation-recovery")>();
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  return { ...actual, createBrowserMcpPreparationRecovery: () => createTestPreparationJournal(actual) };
});

it.each([
  ["streamable_http", "HTTP"],
  ["sse_compat", "SSE"],
  [undefined, "—"],
] as const)("reopening the same unknown %s registration displays its frozen transport and retries only the original command", async (transport, label) => {
  const register = vi.fn<NonNullable<HubClient["registerPrivateMcpServer"]>>().mockRejectedValue(new Error("fixture lost ACK"));
  const client = { registerPrivateMcpServer: register, preparePrivateMcpServer: vi.fn(), getPrivateMcpServer: vi.fn(), getMcpConnector: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const preparation = createMcpPreparationCommands({ client, boundary, canPrepare: () => true, onConfirmed: vi.fn() });
  const flow = createMcpServerCreationFlow({ client, boundary, onChanged: vi.fn(), preparation });
  const release = flow.retain(boundary);
  const show = () => render(<LocaleProvider><Dialog open><DialogContent><CustomMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={async () => undefined} /></DialogContent></Dialog></LocaleProvider>);
  try {
    if (transport === undefined) {
      // An already-frozen pre-transport request, not a rewritten new HTTP command.
      const window = {}, scope = { window, boundary };
      const detach = flow.attach(window);
      await act(async () => { await flow.submit({ display_name: "Original MCP", server_url: "https://mcp.example.test/mcp" }, scope, "connect"); });
      detach();
    }
    const first = show();
    if (transport !== undefined) {
      if (transport === "sse_compat") {
        fireEvent.keyDown(screen.getByRole("combobox", { name: "传输类型" }), { key: "ArrowDown" });
        fireEvent.click(await screen.findByRole("option", { name: /^SSE$/u }));
      }
      fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: "Original MCP" } });
      fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: "https://mcp.example.test/mcp" } });
      fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
      await waitFor(() => expect(register).toHaveBeenCalledOnce());
      await waitFor(() => expect(flow.getSnapshot().unknown).toBe("register"));
    }
    expect(register).toHaveBeenCalledOnce();
    const [originalBody, originalKey] = register.mock.calls[0]!;
    expect(Object.hasOwn(originalBody, "transport")).toBe(transport !== undefined);
    expect(originalBody.transport).toBe(transport);
    first.unmount();
    const reopened = show();
    const choice = screen.getByRole("combobox", { name: "传输类型" });
    expect(choice).toBeDisabled();
    expect(choice).toHaveTextContent(label);
    if (transport === undefined) expect(choice).not.toHaveTextContent("HTTP");
    expect(register).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "重试原请求" }));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    expect(register.mock.calls[1]?.[0]).toBe(originalBody);
    expect(register.mock.calls[1]?.[1]).toBe(originalKey);
    expect(Object.hasOwn(register.mock.calls[1]![0], "transport")).toBe(transport !== undefined);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    reopened.unmount();
  } finally { release(); }
});


it.each(["streamable_http", "sse_compat"] as const)("Custom MCP %s Save completes configuration even while the external service is unavailable", async transport => {
  const savedServer: McpPrivateServer = { availability: "unavailable", server_id: "configured-server", display_name: "Configured MCP", server_url: "https://mcp.example.test/configuration", notes: "", status: "registered", state_version: "1", headers: [], transport, prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const savedConnector: McpConnector = { availability: "unavailable", connector_id: "configured-connector", server_id: savedServer.server_id, provider_key: "configured-provider", connector_type: "mcp", status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  const client = { registerPrivateMcpServer: vi.fn().mockResolvedValue({ server: savedServer, connector: savedConnector, replayed: false }), getPrivateMcpServer: vi.fn().mockResolvedValue(savedServer), getMcpConnector: vi.fn().mockResolvedValue(savedConnector), preparePrivateMcpServer: vi.fn().mockRejectedValue(new Error("external unavailable")), beginMcpConnectorAuthorization: vi.fn() };
  const flow = createMcpServerCreationFlow({ client, boundary, onChanged: vi.fn(), preparation: createMcpPreparationCommands({ client, boundary, canPrepare: () => true, onConfirmed: vi.fn() }) });
  const onDone = vi.fn().mockResolvedValue(undefined);
  render(<LocaleProvider><Dialog open><DialogContent><CustomMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={onDone} /></DialogContent></Dialog></LocaleProvider>);
  if (transport === "sse_compat") {
    fireEvent.keyDown(screen.getByRole("combobox", { name: "传输类型" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /^SSE$/u }));
  }
  fireEvent.change(screen.getByRole("textbox", { name: "服务器名称" }), { target: { value: savedServer.display_name } });
  fireEvent.change(screen.getByRole("textbox", { name: "服务器 URL" }), { target: { value: savedServer.server_url } });
  fireEvent.click(screen.getByRole("button", { name: /^保存$/u }));
  await waitFor(() => expect(onDone).toHaveBeenCalledWith({ serverId: savedServer.server_id, connectorId: savedConnector.connector_id, providerKey: savedConnector.provider_key }, expect.any(Function)));
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  expect(client.getPrivateMcpServer).toHaveBeenCalledWith(savedServer.server_id, expect.any(AbortSignal));
  expect(client.getMcpConnector).toHaveBeenCalledWith(savedConnector.connector_id, expect.any(AbortSignal));
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});


it.each(["confirmed", "read-failed"] as const)("Custom MCP configure keeps its original form through ACK, held reads and navigation closing: %s", async mode => {
  const server: McpPrivateServer = { availability: "unavailable", server_id: "pending-custom-server", display_name: "Pending custom", server_url: "https://mcp.example.test/pending-custom", notes: "", status: "registered", state_version: "1", headers: [], transport: "sse_compat", prepare_status: "pending_prepare", declarations: [], declarations_available: false };
  const connector: McpConnector = { availability: "unavailable", connector_id: "pending-custom-connector", server_id: server.server_id, provider_key: "pending-custom-provider", connector_type: "mcp", status: "pending", enabled: false, approved_scopes: [], state_version: "1" };
  let acknowledge!: () => void, read!: () => void, close!: () => void;
  const ack = new Promise<void>(resolve => { acknowledge = resolve; });
  const exact = new Promise<void>(resolve => { read = resolve; });
  const closing = new Promise<void>(resolve => { close = resolve; });
  const client = { registerPrivateMcpServer: vi.fn(async () => { await ack; return { server, connector, replayed: false }; }), getPrivateMcpServer: vi.fn(async () => { await exact; if (mode === "read-failed") throw new Error("exact read failed"); return server; }), getMcpConnector: vi.fn(async () => { await exact; return connector; }), preparePrivateMcpServer: vi.fn(), beginMcpConnectorAuthorization: vi.fn() };
  const flow = createMcpServerCreationFlow({ client, boundary, onChanged: vi.fn(), preparation: createMcpPreparationCommands({ client, boundary, canPrepare: () => true, onConfirmed: vi.fn() }) });
  const onDone = vi.fn(async () => { await closing; });
  render(<LocaleProvider><Dialog open><DialogContent><CustomMcpForm flow={flow} boundary={boundary} onCancel={vi.fn()} onDone={onDone} /></DialogContent></Dialog></LocaleProvider>);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "传输类型" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /^SSE$/u }));
  const name = screen.getByRole("textbox", { name: "服务器名称" }), url = screen.getByRole("textbox", { name: "服务器 URL" });
  fireEvent.change(name, { target: { value: server.display_name } });
  fireEvent.change(url, { target: { value: server.server_url } });
  const save = screen.getByRole("button", { name: /^保存$/u });
  fireEvent.click(save);
  expect(name).toBeInTheDocument();
  await act(async () => { acknowledge(); await ack; });
  await waitFor(() => expect(client.getPrivateMcpServer).toHaveBeenCalledOnce());
  expect(name).toBeInTheDocument();
  expect(url).toBeInTheDocument();
  expect(name).toHaveValue(server.display_name);
  expect(url).toHaveValue(server.server_url);
  expect(screen.getByRole("combobox", { name: "传输类型" })).toHaveTextContent("SSE");
  expect(name).toHaveAttribute("readonly");
  expect(save).toBeDisabled();
  expect(save).toHaveAttribute("aria-busy", "true");
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { read(); await exact; });
  if (mode === "confirmed") {
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(name).toBeInTheDocument();
    expect(url).toBeInTheDocument();
    expect(save).toBeDisabled();
    await act(async () => { close(); await closing; });
  } else {
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
    expect(onDone).not.toHaveBeenCalled();
  }
  expect(client.registerPrivateMcpServer).toHaveBeenCalledOnce();
  expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
});
