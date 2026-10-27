import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HubClientError } from "@/hub/client";
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands";
import { createMcpServerCreationFlow } from "@/ui/mcp/mcp-server-creation-flow";
import { useMcpServerCreation } from "@/ui/mcp/use-mcp-server-creation";
import { readCreatedMcpDetail } from "@/ui/mcp/mcp-created-detail-handoff";

const boundary = { admitted: true, subject: "receipt-creation-actor", generation: 1 };
const server = { availability: "unavailable" as const, server_id: "receipt-server", display_name: "Original MCP", server_url: "https://mcp.example.test/receipt", status: "registered" as const, state_version: "1", headers: [], transport: "streamable_http" as const, prepare_status: "pending_prepare" as const, declarations: [], declarations_available: false };
const connector = { availability: "unavailable" as const, connector_id: "receipt-connector", server_id: server.server_id, provider_key: "original-provider", connector_type: "mcp" as const, status: "pending" as const, enabled: false, approved_scopes: [], state_version: "1" };
const receipt = () => ({ server: { ...server, state_version: "2", prepare_status: "ready" as const, declarations_available: true, declaration_digest: "a".repeat(64) }, connector: { ...connector, state_version: "2", status: "active" as const, enabled: true }, declarations: [], replayed: true });
function fixture(recovery?: import("@/ui/mcp/mcp-preparation-recovery").McpPreparationRecovery) {
  const client = {
    registerPrivateMcpServer: vi.fn().mockResolvedValue({ server, connector, replayed: false }),
    preparePrivateMcpServer: vi.fn().mockRejectedValue(new HubClientError("http", "invalid original ACK", "mcp_personal_response_invalid", 502, false)),
    getMcpPrepareReceipt: vi.fn().mockResolvedValue(receipt()),
    getPrivateMcpServer: vi.fn().mockResolvedValue(server), getMcpConnector: vi.fn().mockResolvedValue(connector), beginMcpConnectorAuthorization: vi.fn(),
  };
  const preparation = createMcpPreparationCommands({ client, boundary, onConfirmed: vi.fn(), canPrepare: () => true, ...(recovery ? { recovery } : {}) });
  const flow = createMcpServerCreationFlow({ client, boundary, preparation, onChanged: vi.fn() });
  const release = flow.retain(boundary), scope = { boundary, window: {} };
  flow.attach(scope.window);
  const start = async () => {
    expect(await flow.submit({ display_name: server.display_name, server_url: server.server_url }, scope, "connect")).toBe(false);
    expect(flow.getSnapshot().unknown).toBe("prepare");
    expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce();
  };
  return { client, preparation, flow, scope, release, start };
}
afterEach(cleanup);

it.each(["advanced_current", "fresh_read_failed"] as const)("one query completes original creation without borrowing receipt Current facts: %s", async current => {
  const f = fixture();
  try {
    await f.start();
    if (current === "fresh_read_failed") f.client.getPrivateMcpServer.mockRejectedValue(new Error("current read unavailable"));
    else f.client.getPrivateMcpServer.mockResolvedValue({ ...server, state_version: "8" });
    expect(await f.flow.retry(f.scope)).toBe(true);
    expect(f.client.getMcpPrepareReceipt.mock.calls[0]?.slice(0, 3)).toEqual(f.client.preparePrivateMcpServer.mock.calls[0]?.slice(0, 3));
    expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce();
    expect(f.flow.getPreparationCompletion(f.scope)).toEqual({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key });
    expect(f.flow.getSnapshot().facts?.server.prepare_status).not.toBe("ready");
    if (current === "fresh_read_failed") expect(f.flow.getSnapshot().facts).toBeNull();
    expect(f.flow.finish(f.scope)).toBe(true);
    expect(f.preparation.getCompletion(server.server_id, connector.connector_id, boundary)).toBeNull();
  } finally { f.release(); }
});

it("the actual creation hook bypasses generic inspect_owner gating only for a Prepare lookup and navigates by safe locator", async () => {
  const f = fixture();
  try {
    await f.start(); f.client.getPrivateMcpServer.mockRejectedValue(new Error("current read unavailable"));
    const onDone = vi.fn<(target: { serverId: string; connectorId: string; providerKey: string }, current: () => boolean) => Promise<void>>().mockResolvedValue(undefined), onCancel = vi.fn();
    const hook = renderHook(() => useMcpServerCreation(f.flow, boundary, onCancel, onDone, vi.fn()));
    expect(hook.result.current.mayResume).toBe(true);
    await waitFor(() => expect(hook.result.current.state.busy).toBe(false));
    await act(async () => { await hook.result.current.saveConfiguration(); });
    expect(onDone).toHaveBeenCalledOnce();
    const completion = onDone.mock.calls[0]?.[0];
    expect(completion).toEqual({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key });
    expect(readCreatedMcpDetail(completion!, f.client, boundary)).toBeNull();
    expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(f.client.getMcpPrepareReceipt).toHaveBeenCalledOnce();
    expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled(); expect(onCancel).not.toHaveBeenCalled();
    hook.unmount();
  } finally { f.release(); }
});

it("a fresh provider binding conflict never permits completion navigation", async () => {
  const f = fixture();
  try {
    await f.start(); f.client.getMcpConnector.mockResolvedValue({ ...connector, provider_key: "different-current-provider" });
    expect(await f.flow.retry(f.scope)).toBe(false);
    expect(f.flow.getPreparationCompletion(f.scope)).toBeNull(); expect(f.flow.finish(f.scope)).toBe(false);
    expect(f.flow.getSnapshot().facts?.connector.provider_key).toBe("different-current-provider");
    f.client.getPrivateMcpServer.mockRejectedValue(new Error("later read failed"));
    await f.flow.refresh(f.scope, true);
    expect(f.flow.getSnapshot().facts).toBeNull();
    expect(f.flow.getPreparationCompletion(f.scope)).toBeNull();
    expect(f.flow.finish(f.scope)).toBe(false);
    expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce();
  } finally { f.release(); }
});

it.each(["fresh_read_failed", "current_changed"] as const)("a strict first POST ACK can finish by locator after %s without requiring another query", async current => {
  const f = fixture();
  try {
    f.client.preparePrivateMcpServer.mockResolvedValue({ ...receipt(), replayed: false });
    if (current === "fresh_read_failed") f.client.getPrivateMcpServer.mockResolvedValueOnce(server).mockRejectedValue(new Error("read after ACK failed"));
    else f.client.getPrivateMcpServer.mockResolvedValueOnce(server).mockResolvedValue({ ...server, state_version: "9" });
    expect(await f.flow.submit({ display_name: server.display_name, server_url: server.server_url }, f.scope, "connect")).toBe(true);
    expect(f.flow.getPreparationCompletion(f.scope)).toEqual({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key });
    expect(f.flow.getSnapshot().facts?.server.prepare_status).not.toBe("ready");
    expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(f.client.getMcpPrepareReceipt).not.toHaveBeenCalled();
    expect(f.flow.finish(f.scope)).toBe(true);
  } finally { f.release(); }
});

it("a strict late first POST ACK never auto-navigates a successor window; explicit Done consumes only its locator", async () => {
  const f = fixture();
  try {
    let acknowledge!: (value: ReturnType<typeof receipt>) => void;
    f.client.preparePrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
    const pending = f.flow.submit({ display_name: server.display_name, server_url: server.server_url }, f.scope, "connect");
    await vi.waitFor(() => expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce());
    f.client.getPrivateMcpServer.mockRejectedValue(new Error("new window Current unavailable"));
    const onDone = vi.fn<(target: { serverId: string; connectorId: string; providerKey: string }, current: () => boolean) => Promise<void>>().mockResolvedValue(undefined);
    const hook = renderHook(() => useMcpServerCreation(f.flow, boundary, vi.fn(), onDone, vi.fn()));
    await act(async () => { acknowledge({ ...receipt(), replayed: false }); await pending; });
    expect(f.flow.getPreparationCompletion(f.scope)).toBeNull(); expect(onDone).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { await hook.result.current.done(); });
    expect(onDone).toHaveBeenCalledOnce(); expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(f.client.getMcpPrepareReceipt).not.toHaveBeenCalled();
    expect(readCreatedMcpDetail(onDone.mock.calls[0]![0], f.client, boundary)).toBeNull();
    hook.unmount();
  } finally { f.release(); }
});

it.each(["pending_prepare", "prepare_failed"] as const)("an initial %s ACK never becomes a completed navigation locator", async status => {
  const f = fixture();
  try {
    f.client.preparePrivateMcpServer.mockResolvedValue({ ...receipt(), replayed: false, connector: { ...connector }, server: { ...server, state_version: "2", prepare_status: status } });
    f.client.getPrivateMcpServer.mockResolvedValueOnce(server).mockRejectedValue(new Error("Current read unavailable"));
    expect(await f.flow.submit({ display_name: server.display_name, server_url: server.server_url }, f.scope, "connect")).toBe(false);
    expect(f.flow.getPreparationCompletion(f.scope)).toBeNull(); expect(f.flow.finish(f.scope)).toBe(false);
    expect(f.client.getMcpPrepareReceipt).not.toHaveBeenCalled(); expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
  } finally { f.release(); }
});

it("a normal first needs_oauth ACK preserves the existing explicit OAuth path instead of auto-finishing by locator", async () => {
  const f = fixture();
  try {
    const needsOAuth = { ...server, state_version: "2", prepare_status: "needs_oauth" as const };
    f.client.preparePrivateMcpServer.mockResolvedValue({ server: needsOAuth, connector, declarations: [], replayed: false });
    f.client.getPrivateMcpServer.mockResolvedValueOnce(server).mockResolvedValue(needsOAuth);
    expect(await f.flow.submit({ display_name: server.display_name, server_url: server.server_url }, f.scope, "connect")).toBe(false);
    const onDone = vi.fn();
    const hook = renderHook(() => useMcpServerCreation(f.flow, boundary, vi.fn(), onDone, vi.fn()));
    await waitFor(() => expect(hook.result.current.state.facts?.server.prepare_status).toBe("needs_oauth"));
    expect(hook.result.current.ready).toBe(false); expect(hook.result.current.needsOAuth).toBe(true);
    expect(f.flow.getPreparationCompletion(f.scope)).toBeNull(); expect(onDone).not.toHaveBeenCalled();
    expect(f.client.getMcpPrepareReceipt).not.toHaveBeenCalled(); expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
    hook.unmount();
  } finally { f.release(); }
});

it("explicit historical needs_oauth lookup completes by locator without automatically starting authorization", async () => {
  const f = fixture();
  try {
    await f.start();
    const needsOAuth = { ...server, state_version: "2", prepare_status: "needs_oauth" as const };
    f.client.getPrivateMcpServer.mockResolvedValue(needsOAuth);
    f.client.getMcpPrepareReceipt.mockResolvedValue({ server: needsOAuth, connector, declarations: [], replayed: true });
    expect(await f.flow.retry(f.scope)).toBe(true);
    expect(f.flow.getSnapshot().facts?.server.prepare_status).toBe("needs_oauth");
    expect(f.flow.getSnapshot().facts?.connector.enabled).toBe(false);
    expect(f.flow.getPreparationCompletion(f.scope)).toEqual({ serverId: server.server_id, connectorId: connector.connector_id, providerKey: connector.provider_key });
    expect(f.flow.finish(f.scope)).toBe(true);
    expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled(); expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce();
  } finally { f.release(); }
});

it("a late first POST keeps fresh needs_oauth authorization reachable in the successor window", async () => {
  const f = fixture();
  try {
    const needsOAuth = { ...server, state_version: "2", prepare_status: "needs_oauth" as const };
    let acknowledge!: (value: { server: typeof needsOAuth; connector: typeof connector; declarations: never[]; replayed: boolean }) => void;
    f.client.preparePrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
    const pending = f.flow.submit({ display_name: server.display_name, server_url: server.server_url }, f.scope, "connect");
    await vi.waitFor(() => expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce());
    f.client.getPrivateMcpServer.mockResolvedValue(needsOAuth);
    const onDone = vi.fn();
    const hook = renderHook(() => useMcpServerCreation(f.flow, boundary, vi.fn(), onDone, vi.fn()));
    await act(async () => { acknowledge({ server: needsOAuth, connector, declarations: [], replayed: false }); await pending; });
    await waitFor(() => expect(hook.result.current.state.facts?.server.prepare_status).toBe("needs_oauth"));
    expect(hook.result.current.ready).toBe(false); expect(hook.result.current.needsOAuth).toBe(true);
    expect(onDone).not.toHaveBeenCalled(); expect(f.client.getMcpPrepareReceipt).not.toHaveBeenCalled();
    expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled(); hook.unmount();
  } finally { f.release(); }
});

it.each(["unknown", "pending_prepare", "prepare_failed", "missing_current", "disabled_current"] as const)("the initial-path source flag never grants OAuth from %s", async fault => {
  const f = fixture();
  try {
    const needsOAuth = { ...server, state_version: "2", prepare_status: "needs_oauth" as const };
    if (fault !== "unknown") f.client.preparePrivateMcpServer.mockResolvedValue(fault === "missing_current" || fault === "disabled_current" ? { server: needsOAuth, connector, declarations: [], replayed: false }
      : { ...receipt(), replayed: false, connector, server: { ...server, state_version: "2", prepare_status: fault } });
    f.client.getPrivateMcpServer.mockResolvedValueOnce(server);
    if (fault === "missing_current") f.client.getPrivateMcpServer.mockRejectedValue(new Error("Current unavailable"));
    else f.client.getPrivateMcpServer.mockResolvedValue(fault === "disabled_current" ? { ...needsOAuth, status: "disabled" } : needsOAuth);
    await f.flow.submit({ display_name: server.display_name, server_url: server.server_url }, f.scope, "connect");
    const hook = renderHook(() => useMcpServerCreation(f.flow, boundary, vi.fn(), vi.fn(), vi.fn()));
    await waitFor(() => expect(hook.result.current.state.busy).toBe(false));
    expect(hook.result.current.needsOAuth).toBe(false);
    await act(async () => { await hook.result.current.authorize(); });
    expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled(); expect(f.client.getMcpPrepareReceipt).not.toHaveBeenCalled();
    hook.unmount();
  } finally { f.release(); }
});

it("a historical GET clearing after window retirement remains lookup-origin and exposes only safe Done", async () => {
  const rules = await import("@/ui/mcp/mcp-preparation-recovery");
  const { createTestPreparationJournal } = await import("./fixtures/mcp-preparation-journal");
  const journal = createTestPreparationJournal(rules);
  let clearStarted = false, finishClear!: () => void;
  const clear = new Promise<void>(resolve => { finishClear = resolve; });
  const recovery = { ...journal, complete: async (record: import("@/ui/mcp/mcp-preparation-recovery").McpPreparationRecord) => {
    clearStarted = true; await clear; await journal.complete(record);
  } };
  const f = fixture(recovery);
  try {
    await f.start();
    const needsOAuth = { ...server, state_version: "2", prepare_status: "needs_oauth" as const };
    f.client.getPrivateMcpServer.mockResolvedValue(needsOAuth);
    f.client.getMcpPrepareReceipt.mockResolvedValue({ server: needsOAuth, connector, declarations: [], replayed: true });
    const pending = f.flow.retry(f.scope);
    await vi.waitFor(() => expect(clearStarted).toBe(true));
    const onDone = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(() => useMcpServerCreation(f.flow, boundary, vi.fn(), onDone, vi.fn()));
    await act(async () => { finishClear(); await pending; });
    await waitFor(() => expect(hook.result.current.state.facts?.server.prepare_status).toBe("needs_oauth"));
    expect(hook.result.current.ready).toBe(true); expect(hook.result.current.needsOAuth).toBe(false);
    expect(onDone).not.toHaveBeenCalled(); expect(f.client.beginMcpConnectorAuthorization).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.done(); });
    expect(onDone).toHaveBeenCalledOnce(); expect(f.client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(f.client.getMcpPrepareReceipt).toHaveBeenCalledOnce();
    expect(await journal.current(boundary.subject, server.server_id)).toBeUndefined(); hook.unmount();
  } finally { finishClear(); f.release(); }
});
