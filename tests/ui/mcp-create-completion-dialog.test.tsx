import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createHubClient } from "@/hub/client";
import { mcpPrivateServerSchema } from "@/hub/mcp-connector.schema";
import { LocaleProvider } from "@/i18n/context";
import { ConnectorCommandProvider } from "@/ui/mcp/connector-command-context";
import { McpCreateDialog } from "@/ui/mcp/mcp-create-dialog";
import { McpProjectionRead } from "@/ui/mcp/mcp-projection-read";
import type { McpCreateMode } from "@/ui/mcp/mcp-panel-model";
import { jsonImportReceipt } from "./fixtures/mcp-json-import-receipt";

const boundary = { subject: "dialog-owner", admitted: true, generation: 1 };
const profile = { profile_id: "created-exact-api", name: "Fresh API detail", instructions: "Fresh owner read", environment: [], state_version: "2",
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture(mode: McpCreateMode, names = ["Imported first", "Imported second"], onDone = vi.fn(async () => {})) {
  localStorage.setItem("kokoro.locale", "zh");
  const receipt = jsonImportReceipt(names);
  const client = { ...createHubClient(),
    createCustomApi: vi.fn().mockResolvedValue({ ...profile, name: "Created API", instructions: undefined, environment: [{ name: "TOKEN", configured: true, state_version: "1", status: "active" }], state_version: "1" }),
    getCustomApi: vi.fn().mockResolvedValue(profile),
    importPrivateMcpJson: vi.fn().mockResolvedValue(receipt),
    getMcpConnector: vi.fn(async (id: string) => receipt.imports.find(entry => entry.connector.connector_id === id)!.connector),
    getPrivateMcpServer: vi.fn(async (id: string) => mcpPrivateServerSchema.parse(receipt.imports.find(entry => entry.server.server_id === id)!.server)),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    preparePrivateMcpServer: vi.fn(),
    removeCustomApi: vi.fn().mockResolvedValue(undefined),
  };
  const onOpenChange = vi.fn();
  const content = (current = boundary, open = true, currentMode = mode, currentClient = client) => <LocaleProvider>
    <ConnectorCommandProvider client={currentClient} boundary={current}>
      <McpCreateDialog client={currentClient} mode={currentMode} open={open} onOpenChange={onOpenChange} onDone={onDone} />
    </ConnectorCommandProvider>
  </LocaleProvider>;
  const view = render(content());
  const submitApi = () => {
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Created API" } });
    fireEvent.change(screen.getByLabelText("密钥名称"), { target: { value: "TOKEN" } });
    fireEvent.change(screen.getByLabelText("值"), { target: { value: "fixture-only-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
  };
  const submitJson = () => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify({ mcpServers: Object.fromEntries(names.map((name, index) =>
      [name, { type: "streamableHttp", url: `https://mcp.example.test/${index}` }])) }) } });
    fireEvent.click(screen.getByRole("button", { name: "导入" }));
  };
  return { view, content, client, receipt, onDone, onOpenChange, submitApi, submitJson };
}

it.each(["retry", "another control"] as const)("retries only the failed created API GET and preserves focus owned by %s", async focusOwner => {
  const f = fixture("custom-api");
  f.client.getCustomApi.mockRejectedValueOnce(Error("detail unavailable"));
  f.submitApi();
  const detail = await screen.findByRole("dialog", { name: "编辑自定义 API" });
  const retry = await within(detail).findByRole("button", { name: "重新加载 API" });
  expect(retry).toBeVisible();
  let fail!: (error: Error) => void;
  f.client.getCustomApi.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  act(() => { retry.focus(); fireEvent.click(retry); fireEvent.click(retry); });
  await waitFor(() => expect(f.client.getCustomApi).toHaveBeenCalledTimes(2));
  expect(retry).toBeDisabled();
  const close = within(detail).getByRole("button", { name: "关闭连接面板" });
  if (focusOwner === "another control") act(() => close.focus());
  await act(async () => { fail(Error("still unavailable")); });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(focusOwner === "retry" ? retry : close).toHaveFocus();
  fireEvent.click(retry);
  expect(await within(detail).findByDisplayValue(profile.name)).toBeVisible();
  expect(f.client.getCustomApi).toHaveBeenCalledTimes(3);
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
  expect(f.onDone).toHaveBeenCalledOnce();
  expect(f.client.listCustomApis).not.toHaveBeenCalled();
  expect(f.client.listMcpConnectors).not.toHaveBeenCalled();
});

it("retires a pending explicit API retry before a new read generation and ignores its late facts", async () => {
  const f = fixture("custom-api");
  f.client.getCustomApi.mockRejectedValueOnce(Error("detail unavailable"));
  f.submitApi();
  const retry = await screen.findByRole("button", { name: "重新加载 API" });
  let finish!: (value: typeof profile) => void;
  f.client.getCustomApi.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(retry);
  await waitFor(() => expect(f.client.getCustomApi).toHaveBeenCalledTimes(2));
  const signal = f.client.getCustomApi.mock.calls[1]![1] as AbortSignal;
  const current = { ...profile, name: "Current generation API", state_version: "3" };
  f.client.getCustomApi.mockResolvedValueOnce(current);
  f.view.rerender(f.content({ ...boundary, generation: 2 }));
  expect(await screen.findByDisplayValue(current.name)).toBeVisible();
  expect(signal.aborted).toBe(true);
  await act(async () => { finish({ ...profile, name: "Retired retry facts" }); });
  expect(screen.queryByDisplayValue("Retired retry facts")).not.toBeInTheDocument();
  expect(screen.getByDisplayValue(current.name)).toBeVisible();
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
  expect(f.client.getCustomApi).toHaveBeenCalledTimes(3);
});

it("recovers the created private connector then its failed server without repeating successful reads or Prepare", async () => {
  const f = fixture("json", ["Owned private"]);
  f.client.getMcpConnector.mockRejectedValueOnce(Error("connection unavailable"));
  f.client.getPrivateMcpServer.mockRejectedValueOnce(Error("server unavailable"));
  f.submitJson();
  const retry = await screen.findByRole("button", { name: "重新加载已添加的连接器" });
  expect(f.client.getPrivateMcpServer).not.toHaveBeenCalled();
  fireEvent.click(retry);
  const serverRetry = await screen.findByRole("button", { name: "重试" });
  const readFeedback = serverRetry.closest('[role="status"]');
  expect(f.client.getMcpConnector).toHaveBeenCalledTimes(2);
  expect(f.client.getPrivateMcpServer).toHaveBeenCalledOnce();
  fireEvent.click(serverRetry);
  const detail = await screen.findByRole("dialog", { name: "Owned private" });
  expect(detail).toBeVisible();
  expect(readFeedback).not.toBeInTheDocument();
  expect(serverRetry).not.toBeInTheDocument();
  expect(detail.querySelector('[aria-busy="true"]')).toBeNull();
  expect(f.client.getPrivateMcpServer).toHaveBeenCalledTimes(2);
  expect(f.client.getMcpConnector).toHaveBeenCalledTimes(2);
  expect(f.client.importPrivateMcpJson).toHaveBeenCalledOnce();
  expect(f.client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(f.client.listMcpConnectors).not.toHaveBeenCalled();
  f.view.rerender(f.content({ ...boundary, generation: 2 }));
  await waitFor(() => expect(f.client.getPrivateMcpServer).toHaveBeenCalledTimes(3));
  expect(await screen.findByRole("dialog", { name: "Owned private" })).toBeVisible();
  expect(readFeedback).not.toBeInTheDocument();
  expect(serverRetry).not.toBeInTheDocument();
  expect(detail.querySelector('[aria-busy="true"]')).toBeNull();
  expect(f.client.importPrivateMcpJson).toHaveBeenCalledOnce();
  expect(f.client.preparePrivateMcpServer).not.toHaveBeenCalled();
});

it("visibly retries an off-page provider detail without refreshing its successful connector list", async () => {
  localStorage.setItem("kokoro.locale", "zh");
  const provider = { provider_key: "owned-provider", display_name: "Recovered provider", directory_type: "app" as const,
    category_keys: [], example_prompts: [], enabled: true, state_version: "1" };
  const connection = { availability: "available" as const, connector_id: "owned-connection", connector_type: "mcp" as const,
    provider_key: provider.provider_key, display_name: "Installed outside catalog", status: "active" as const,
    enabled: true, approved_scopes: [], state_version: "1" };
  const client = { ...createHubClient(), getMcpConnectorProvider: vi.fn().mockRejectedValueOnce(Error("provider unavailable")).mockResolvedValue(provider),
    listMcpConnectors: vi.fn().mockResolvedValue({ items: [connection], next_cursor: null }),
    listMcpConnectorProviders: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    listCustomApis: vi.fn().mockResolvedValue({ items: [], page: { next_cursor: null } }), createMcpConnector: vi.fn() };
  render(<LocaleProvider><ConnectorCommandProvider client={client} boundary={boundary}>
    <McpProjectionRead client={client} identity={boundary.subject} initialView="connections" />
  </ConnectorCommandProvider></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: connection.display_name }));
  const count = client.listMcpConnectors.mock.calls.length;
  const retry = await screen.findByRole("button", { name: "重新加载连接器目录" });
  fireEvent.click(retry);
  expect(await screen.findByRole("dialog", { name: provider.display_name })).toBeVisible();
  expect(client.getMcpConnectorProvider).toHaveBeenCalledTimes(2);
  expect(client.listMcpConnectors).toHaveBeenCalledTimes(count);
  expect(client.createMcpConnector).not.toHaveBeenCalled();
});

it("opens the exact API fresh reader instead of the ACK or a list, and close ends its parent", async () => {
  const f = fixture("custom-api"); f.submitApi();
  const detail = await screen.findByRole("dialog", { name: "编辑自定义 API" });
  expect(await within(detail).findByDisplayValue(profile.name)).toBeVisible();
  expect(within(detail).getByDisplayValue(profile.instructions)).toBeVisible();
  expect(f.client.getCustomApi).toHaveBeenCalledWith(profile.profile_id, expect.any(AbortSignal));
  expect(f.client.listCustomApis).not.toHaveBeenCalled();
  expect(f.client.listMcpConnectors).not.toHaveBeenCalled();
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
  fireEvent.click(within(detail).getByRole("button", { name: "关闭连接面板" }));
  expect(f.onOpenChange).toHaveBeenLastCalledWith(false);
});

it("opens a single JSON exact binding, without preparing it automatically", async () => {
  const f = fixture("json", ["Only imported"]); f.submitJson();
  await waitFor(() => expect(f.client.getMcpConnector).toHaveBeenCalledWith("import-connector-0", expect.any(AbortSignal)));
  await waitFor(() => expect(f.client.getPrivateMcpServer).toHaveBeenCalledWith("import-server-0", expect.any(AbortSignal)));
  expect(f.client.importPrivateMcpJson).toHaveBeenCalledOnce();
  expect(f.client.preparePrivateMcpServer).not.toHaveBeenCalled();
  expect(screen.queryByText("选择一个已导入的连接器查看配置。")).not.toBeInTheDocument();
});

it("keeps all JSON results in original order and opens only an explicitly selected identity", async () => {
  const f = fixture("json", ["Same name", "Same name"]); f.submitJson();
  const chooser = await screen.findByText("选择一个已导入的连接器查看配置。");
  expect(chooser).toBeVisible();
  const buttons = screen.getAllByRole("button", { name: /Same name/ });
  expect(buttons).toHaveLength(2);
  expect(buttons[0]).toHaveTextContent("import-connector-0");
  expect(buttons[1]).toHaveTextContent("import-connector-1");
  await waitFor(() => expect(buttons[0]).toHaveFocus());
  expect(f.client.getMcpConnector).not.toHaveBeenCalled();
  fireEvent.click(buttons[1]!);
  await waitFor(() => expect(f.client.getMcpConnector).toHaveBeenCalledWith("import-connector-1", expect.any(AbortSignal)));
  await waitFor(() => expect(f.client.getPrivateMcpServer).toHaveBeenCalledWith("import-server-1", expect.any(AbortSignal)));
  fireEvent.click(await screen.findByRole("button", { name: "取消" }));
  expect(await screen.findByText("选择一个已导入的连接器查看配置。")).toBeVisible();
  await waitFor(() => expect(screen.getByRole("button", { name: /Same name.*import-connector-1/ })).toHaveFocus());
  expect(f.onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(f.onOpenChange).toHaveBeenLastCalledWith(false);
  expect(f.client.importPrivateMcpJson).toHaveBeenCalledOnce();
});

it("retries failed completion UI with the original locator, never resending a confirmed API command", async () => {
  const onDone = vi.fn().mockRejectedValueOnce(new Error("projection callback failed")).mockResolvedValue(undefined);
  const f = fixture("custom-api", undefined, onDone); f.submitApi();
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("值")).toHaveValue("");
  expect(f.client.getCustomApi).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(await screen.findByDisplayValue(profile.name)).toBeVisible();
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
  expect(onDone).toHaveBeenCalledTimes(2);
});

it("confirmed API deletion ends the creation parent without exposing an empty detail shell", async () => {
  const f = fixture("custom-api"); f.submitApi();
  await screen.findByDisplayValue(profile.name);
  fireEvent.click(screen.getByRole("button", { name: "删除" }));
  fireEvent.click(screen.getByRole("button", { name: "确认移除" }));
  await waitFor(() => expect(f.onOpenChange).toHaveBeenCalledWith(false));
  expect(f.client.removeCustomApi).toHaveBeenCalledWith(profile.profile_id, { expected_state_version: profile.state_version }, expect.any(String), expect.any(AbortSignal));
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
});

it("retries a JSON completion callback without replaying its confirmed import or selecting the first entry", async () => {
  const onDone = vi.fn().mockRejectedValueOnce(new Error("callback failed")).mockResolvedValue(undefined);
  const f = fixture("json", undefined, onDone); f.submitJson();
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(await screen.findByText("选择一个已导入的连接器查看配置。")).toBeVisible();
  expect(f.client.importPrivateMcpJson).toHaveBeenCalledOnce();
  expect(f.client.getMcpConnector).not.toHaveBeenCalled();
});

it("keeps only the API locator across read generations and refuses old detail facts during the new GET", async () => {
  const f = fixture("custom-api"); f.submitApi();
  await screen.findByDisplayValue(profile.name);
  let release!: (value: typeof profile) => void;
  f.client.getCustomApi.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  f.view.rerender(f.content({ ...boundary, generation: 2 }));
  await waitFor(() => expect(f.client.getCustomApi).toHaveBeenCalledTimes(2));
  expect(screen.queryByDisplayValue(profile.name)).not.toBeInTheDocument();
  await act(async () => release({ ...profile, name: "New generation owner fact", state_version: "3" }));
  expect(await screen.findByDisplayValue("New generation owner fact")).toBeVisible();
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
});

it("a new admission generation during completion cannot publish old facts, but retries only the UI", async () => {
  let release!: () => void;
  const onDone = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const f = fixture("custom-api", undefined, onDone); f.submitApi();
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  f.view.rerender(f.content({ ...boundary, generation: 2 }));
  await act(async () => release());
  expect(f.client.getCustomApi).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "完成" }));
  expect(await screen.findByDisplayValue(profile.name)).toBeVisible();
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
});

it.each(["closed", "actor", "client", "mode"])("retires a delayed completion after its %s window changes", async change => {
  let release!: () => void;
  const onDone = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const f = fixture("custom-api", undefined, onDone); f.submitApi();
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  f.view.rerender(f.content(change === "actor" ? { ...boundary, subject: "other-actor" } : boundary,
    change !== "closed", change === "mode" ? "json" : "custom-api", change === "client" ? { ...f.client } : f.client));
  await act(async () => release());
  expect(f.client.getCustomApi).not.toHaveBeenCalled();
  expect(screen.queryByDisplayValue(profile.name)).not.toBeInTheDocument();
  expect(f.client.createCustomApi).toHaveBeenCalledOnce();
});
