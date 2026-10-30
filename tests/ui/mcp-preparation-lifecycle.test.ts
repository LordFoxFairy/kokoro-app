import { describe, expect, it, vi } from "vitest";
import { HubClientError, type HubClient } from "@/hub/client";
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands";
import { createMcpLifecycleCommands } from "@/ui/mcp/mcp-management-commands";
import { retainPreparationFailure, samePreparationRecord, type McpPreparationRecord, type McpPreparationTarget } from "@/ui/mcp/mcp-preparation-recovery";
import type { ConnectorCommandFailure } from "@/ui/mcp/connector-command-failure";

const boundary = { subject: "verified-subject", admitted: true, generation: 1 };
const target = { serverId: "server-one", connectorId: "connector-one", version: "1" };
const saved = (failure: ConnectorCommandFailure | undefined = "invalid"): McpPreparationRecord => ({ subject: boundary.subject, target, key: "original-key", failure });
const response = () => ({
  server: { availability: "unavailable" as const, server_id: target.serverId, server_url: "https://example.test/mcp", display_name: "Prepared", status: "registered" as const, state_version: "2", headers: [], transport: "streamable_http" as const, prepare_status: "ready" as const, declarations: [], declaration_digest: "a".repeat(64), declarations_available: true },
  connector: { availability: "unavailable" as const, connector_id: target.connectorId, connector_type: "mcp" as const, provider_key: "private", server_id: target.serverId, status: "active" as const, approved_scopes: [], enabled: true, state_version: "2" },
  declarations: [], replayed: true,
});
function journal(initial?: McpPreparationRecord) {
  let value = initial;
  return {
    replace: (next?: McpPreparationRecord) => { value = next; },
    list: vi.fn(async (subject: string) => value?.subject === subject ? [structuredClone(value)] : []),
    current: vi.fn(async (subject: string, serverId: string) => value?.subject === subject && value.target.serverId === serverId ? structuredClone(value) : undefined),
    reserve: vi.fn(async (subject: string, input: McpPreparationTarget, key: string) => {
      if (value) return { record: structuredClone(value), created: false };
      value = { subject, target: input, key }; return { record: value, created: true };
    }),
    failure: vi.fn(async (record: McpPreparationRecord, failure: ConnectorCommandFailure | undefined) => {
      if (!value || !samePreparationRecord(value, record)) throw new Error("record replaced");
      value = { ...value, failure: retainPreparationFailure(value.failure, failure) };
    }),
    complete: vi.fn(async (record: McpPreparationRecord) => {
      if (value && !samePreparationRecord(value, record)) throw new Error("record replaced");
      value = undefined;
    }),
  };
}
function setup(initial?: McpPreparationRecord, canPrepare: () => boolean = () => true) {
  const recovery = journal(initial), confirmed = vi.fn();
  const client = {
    getMcpPrepareReceipt: vi.fn<NonNullable<HubClient["getMcpPrepareReceipt"]>>().mockResolvedValue(response()),
    preparePrivateMcpServer: vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>().mockResolvedValue(response()),
    getPrivateMcpServer: vi.fn<NonNullable<HubClient["getPrivateMcpServer"]>>().mockResolvedValue(response().server),
    getMcpConnector: vi.fn<NonNullable<HubClient["getMcpConnector"]>>().mockResolvedValue(response().connector),
  };
  const commands = createMcpPreparationCommands({ recovery, boundary, client, onConfirmed: confirmed, canPrepare });
  return { commands, client, recovery, confirmed };
}

describe("Prepare storage failure and rejection boundaries", () => {
  it("load and reserve failures fail closed, with no POST or memory-only fallback", async () => {
    const { commands, client, recovery } = setup(); recovery.list.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(await commands.prepare(target, boundary)).toBe(false); expect(commands.recoveryFailed()).toBe(true);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(await commands.restore(boundary)).toBe(true); recovery.reserve.mockRejectedValueOnce(new Error("transaction aborted"));
    expect(await commands.prepare(target, boundary)).toBe(false); expect(commands.recoveryFailed()).toBe(true);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  });

  it("a current-record storage read failure also exposes recovery failure and locks replay", async () => {
    const { commands, recovery, client } = setup(saved()); await commands.restore(boundary);
    recovery.current.mockRejectedValueOnce(new Error("storage read failed"));
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(commands.recoveryFailed()).toBe(true); expect(commands.recoveryReady()).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  });

  it("a valid owner ACK whose journal retirement fails remains unknown, never confirmed", async () => {
    const { commands, client, recovery, confirmed } = setup(); recovery.complete.mockRejectedValueOnce(new Error("delete aborted"));
    expect(await commands.prepare(target, boundary)).toBe(false);
    expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(confirmed).not.toHaveBeenCalled();
    expect(commands.finish(target.serverId, boundary)).toBe(false); expect(commands.getSnapshot()[0]?.kind).toBe("unknown");
    expect(await recovery.list(boundary.subject)).toHaveLength(1);
  });

  it("an initial definite 400 rejection retires only that unexecuted intent, so a corrected explicit command can proceed", async () => {
    const { commands, client, recovery } = setup();
    client.preparePrivateMcpServer.mockRejectedValueOnce(new HubClientError("http", "invalid input", "invalid_mcp_personal_request", 400, false));
    expect(await commands.prepare(target, boundary)).toBe(false); expect(commands.getSnapshot()[0]?.kind).toBe("rejected");
    expect(await recovery.list(boundary.subject)).toEqual([]);
    client.preparePrivateMcpServer.mockResolvedValueOnce({ ...response(), server: { ...response().server, state_version: "3" } });
    expect(await commands.prepare({ ...target, version: "2" }, boundary)).toBe(true);
    expect(client.preparePrivateMcpServer.mock.calls[1]?.[1]).toBe("2");
    expect(client.preparePrivateMcpServer.mock.calls[1]?.[2]).not.toBe(client.preparePrivateMcpServer.mock.calls[0]?.[2]);
  });

  it("a 400 after unknown never retires the original intent or permits a fresh CAS", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    client.getMcpPrepareReceipt.mockRejectedValue(new HubClientError("http", "invalid input", "invalid_mcp_personal_request", 400, false));
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(commands.getSnapshot()[0]?.kind).toBe("unknown"); expect(await recovery.list(boundary.subject)).toHaveLength(1);
    expect(recovery.complete).not.toHaveBeenCalled();
  });

  it("management edits remain locked while the journal is unreadable, without blocking explicit cleanup", async () => {
    const recovery = journal(); recovery.list.mockRejectedValue(new Error("storage unavailable"));
    const client = { ...setup().client, updatePrivateMcpServer: vi.fn().mockResolvedValue(response()), deletePrivateMcpServer: vi.fn().mockResolvedValue({ server_id: target.serverId, deleted: true, replayed: false }), updateMcpConnector: vi.fn(), setMcpConnectorEnabled: vi.fn(), removeMcpConnector: vi.fn() };
    const lifecycle = createMcpLifecycleCommands({ recovery, client, boundary, onConfirmed: vi.fn() });
    expect(await lifecycle.preparation.restore(boundary)).toBe(false);
    expect(await lifecycle.management.submit({ operation: "update_server", ...target, input: { expected_state_version: "1", display_name: "Edited" } }, boundary)).toBe(false);
    expect(client.updatePrivateMcpServer).not.toHaveBeenCalled();
    expect(await lifecycle.management.submit({ operation: "delete_server", ...target, input: { expected_state_version: "1" } }, boundary)).toBe(true);
    expect(client.deletePrivateMcpServer).toHaveBeenCalledOnce();
  });
});


describe("Prepare query-only successor", () => {
  it("restored invalid completes in one exact historical query without fresh reads or POST", async () => {
    const { commands, client, recovery, confirmed } = setup(saved());
    await commands.restore(boundary);
    expect(commands.canResume(target.serverId)).toBe(true);
    expect(await commands.prepare({ ...target, version: "99" }, boundary)).toBe(true);
    expect(client.getMcpPrepareReceipt.mock.calls[0]?.slice(0, 3)).toEqual([target.serverId, "1", "original-key"]);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(client.getPrivateMcpServer).not.toHaveBeenCalled(); expect(client.getMcpConnector).not.toHaveBeenCalled();
    expect(recovery.complete).toHaveBeenCalledWith(saved()); expect(confirmed).toHaveBeenCalledOnce();
    expect(commands.getSnapshot()[0]?.kind).toBe("completed");
  });

  it("a first lost POST is never sent again, even if current CAS or the management write gate changes", async () => {
    let mayWrite = true;
    const { commands, client } = setup(undefined, () => mayWrite);
    client.preparePrivateMcpServer.mockRejectedValueOnce(new Error("lost original ACK"));
    expect(await commands.prepare(target, boundary)).toBe(false);
    const original = client.preparePrivateMcpServer.mock.calls[0]!;
    mayWrite = false;
    expect(await commands.prepare({ ...target, version: "99" }, boundary)).toBe(true);
    expect(client.getMcpPrepareReceipt.mock.calls[0]?.slice(0, 3)).toEqual(original.slice(0, 3));
    expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce();
  });

  it("valid completed with failed journal clear stays unknown and retries only the same GET", async () => {
    const { commands, client, recovery, confirmed } = setup(saved()); await commands.restore(boundary);
    recovery.complete.mockRejectedValueOnce(new Error("journal delete aborted"));
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(commands.getSnapshot()[0]?.kind).toBe("unknown"); expect(confirmed).not.toHaveBeenCalled();
    expect(commands.getCompletion(target.serverId, target.connectorId, boundary)).toBeNull();
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(true);
    expect(client.getMcpPrepareReceipt).toHaveBeenCalledTimes(2); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(confirmed).toHaveBeenCalledOnce();
  });

  it.each(["wrong_server", "wrong_connector", "wrong_association", "older_version", "read_failure", "pending_status", "not_replayed", "not_found", "expired", "failed_marker"] as const)("%s lookup is not a completed receipt and never authorizes POST", async fault => {
    const { commands, client, recovery, confirmed } = setup(saved()); await commands.restore(boundary);
    if (fault === "wrong_server") client.getMcpPrepareReceipt.mockResolvedValue({ ...response(), server: { ...response().server, server_id: "other" } });
    else if (fault === "wrong_association") client.getMcpPrepareReceipt.mockResolvedValue({ ...response(), connector: { ...response().connector, server_id: "other" } });
    else if (fault === "older_version") client.getMcpPrepareReceipt.mockResolvedValue({ ...response(), server: { ...response().server, state_version: "1" } });
    else if (fault === "read_failure") client.getMcpPrepareReceipt.mockRejectedValue(new Error("query unavailable"));
    else if (fault === "wrong_connector") client.getMcpPrepareReceipt.mockResolvedValue({ ...response(), connector: { ...response().connector, connector_id: "other" } });
    else if (fault === "pending_status") client.getMcpPrepareReceipt.mockResolvedValue({ ...response(), server: { ...response().server, prepare_status: "pending_prepare" } });
    else if (fault === "not_replayed") client.getMcpPrepareReceipt.mockResolvedValue({ ...response(), replayed: false });
    else client.getMcpPrepareReceipt.mockRejectedValue(new HubClientError("http", "lookup unavailable", fault === "expired" ? "mcp_personal_command_replay_expired" : fault === "not_found" ? "mcp_personal_not_found" : "mcp_personal_command_outcome_unknown", fault === "expired" ? 412 : fault === "not_found" ? 404 : 503, false));
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(client.getMcpPrepareReceipt).toHaveBeenCalledOnce(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(recovery.complete).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled(); expect(commands.getSnapshot()[0]?.kind).toBe("unknown");
  });

  it("a closed window's late lookup cannot clear the journal or complete the next window", async () => {
    const { commands, client, recovery, confirmed } = setup(saved()); await commands.restore(boundary);
    let finish!: (value: ReturnType<typeof response>) => void;
    client.getMcpPrepareReceipt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const window = new AbortController();
    const result = commands.resume(target.serverId, target.connectorId, boundary, window.signal);
    await vi.waitFor(() => expect(client.getMcpPrepareReceipt).toHaveBeenCalledOnce());
    window.abort(); finish(response());
    expect(await result).toBe(false); expect(recovery.complete).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
    expect(commands.getSnapshot()[0]?.kind).toBe("unknown"); expect(await recovery.list(boundary.subject)).toEqual([saved()]);
  });
});


// The old fresh-GET/inspection-proof cases are now original receipt queries.
// They retain binding, cancellation, actor/generation and cross-tab risks, not POST permission.
describe("Prepare lookup journal and lifecycle fences", () => {
  it("restoration/loading and reopening never automatically POST or query", async () => {
    const { commands, client, recovery } = setup(saved(undefined));
    let finish!: (records: McpPreparationRecord[]) => void;
    recovery.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const release = commands.retain(boundary);
    await vi.waitFor(() => expect(recovery.list).toHaveBeenCalledOnce());
    const next = { ...boundary, generation: 2 }; commands.bind(next); finish([saved(undefined)]);
    await vi.waitFor(() => expect(commands.recoveryReady()).toBe(true));
    expect(recovery.list).toHaveBeenCalledTimes(2); expect(commands.recoveryFailed()).toBe(false);
    expect(commands.getSnapshot()[0]?.kind).toBe("unknown");
    expect(client.getMcpPrepareReceipt).not.toHaveBeenCalled(); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    release();
  });

  it.each(["generation", "actor"] as const)("%s retirement cancels a held query and cannot clear its original journal", async change => {
    const { commands, client, recovery, confirmed } = setup(saved()); await commands.restore(boundary);
    let finish!: (value: ReturnType<typeof response>) => void;
    client.getMcpPrepareReceipt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = commands.resume(target.serverId, target.connectorId, boundary);
    await vi.waitFor(() => expect(client.getMcpPrepareReceipt).toHaveBeenCalledOnce());
    commands.bind({ ...boundary, generation: 2, subject: change === "actor" ? "other-actor" : boundary.subject });
    expect(client.getMcpPrepareReceipt.mock.calls[0]?.[3]?.aborted).toBe(true);
    finish(response()); expect(await result).toBe(false);
    expect(recovery.complete).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
    expect(await recovery.list(boundary.subject)).toEqual([saved()]);
    if (change === "actor") { expect(commands.getSnapshot()).toEqual([]); expect(await recovery.list("other-actor")).toEqual([]); }
  });

  it("a second window cannot run concurrently or consume an aborted window's late result", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    const first = new AbortController(), second = new AbortController();
    let finish!: (value: ReturnType<typeof response>) => void;
    client.getMcpPrepareReceipt.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const running = commands.resume(target.serverId, target.connectorId, boundary, first.signal);
    await vi.waitFor(() => expect(client.getMcpPrepareReceipt).toHaveBeenCalledOnce());
    expect(await commands.resume(target.serverId, target.connectorId, boundary, second.signal)).toBe(false);
    first.abort();
    expect(await commands.resume(target.serverId, target.connectorId, boundary, second.signal)).toBe(true);
    finish(response()); expect(await running).toBe(false);
    expect(client.getMcpPrepareReceipt).toHaveBeenCalledTimes(2); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(recovery.complete).toHaveBeenCalledOnce();
  });

  it.each(["before_lookup", "during_lookup", "during_current_record"] as const)("a retired K cannot adopt or delete K2 %s", async when => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    const newer = { ...saved(), key: "replacement-key", target: { ...target, version: "3" } };
    if (when === "before_lookup") recovery.replace(newer);
    if (when === "during_lookup") client.getMcpPrepareReceipt.mockImplementationOnce(async () => { recovery.replace(newer); return response(); });
    if (when === "during_current_record") recovery.current.mockImplementationOnce(async () => structuredClone(saved())).mockImplementationOnce(async () => { recovery.replace(newer); return structuredClone(newer); });
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(recovery.failure).not.toHaveBeenCalled(); expect(recovery.complete).not.toHaveBeenCalled();
    expect(await recovery.current(boundary.subject, target.serverId)).toEqual(newer);
  });

  it("terminal same-key failures never downgrade or grant POST, while explicit lookup remains possible", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    recovery.replace(saved("replay_expired"));
    client.getMcpPrepareReceipt.mockRejectedValue(new HubClientError("http", "expired", "mcp_personal_command_replay_expired", 412, false));
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    recovery.replace(saved(undefined)); await commands.restore(boundary);
    expect(commands.getSnapshot()[0]?.failure).toBe("replay_expired");
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(client.getMcpPrepareReceipt).toHaveBeenCalledTimes(2); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  });

  it("an original first POST's exact late ACK still retires its own journal without a second POST", async () => {
    const { commands, client, recovery, confirmed } = setup(); const first = new AbortController();
    let finish!: (value: ReturnType<typeof response>) => void;
    client.preparePrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const running = commands.prepare(target, boundary, first.signal);
    await vi.waitFor(() => expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce());
    first.abort(); finish(response()); expect(await running).toBe(false);
    expect(commands.getSnapshot()[0]?.kind).toBe("completed"); expect(await recovery.list(boundary.subject)).toEqual([]);
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(true);
    expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(client.getMcpPrepareReceipt).not.toHaveBeenCalled(); expect(confirmed).toHaveBeenCalledOnce();
  });
});


it("a completed lookup exposes only a RAM locator and observing K2 retires it", async () => {
  const { commands, recovery } = setup(saved()); await commands.restore(boundary);
  expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(true);
  expect(commands.getCompletion(target.serverId, target.connectorId, boundary)).toEqual({ serverId: target.serverId, connectorId: target.connectorId, providerKey: "private" });
  const newer = { ...saved(), key: "newer-key", target: { ...target, version: "8" } };
  recovery.replace(newer); await commands.restore(boundary);
  expect(commands.getCompletion(target.serverId, target.connectorId, boundary)).toBeNull();
  expect(commands.finish(target.serverId, boundary)).toBe(false);
  expect(await recovery.current(boundary.subject, target.serverId)).toEqual(newer);
});

it.each(["pending_prepare", "prepare_failed", "wrong_server", "wrong_connector", "wrong_association", "old_cas", "missing_digest", "wrong_declarations"] as const)("an initial %s ACK preserves unknown original intent until exact GET completion", async fault => {
  const { commands, client, recovery, confirmed } = setup();
  const ack = response();
  client.preparePrivateMcpServer.mockResolvedValueOnce({ ...ack, replayed: false,
    declarations: fault === "wrong_declarations" ? [{ kind: "resource", selector: "qa://wrong", display_name: "QA mismatch" }] : ack.declarations,
    server: fault === "pending_prepare" || fault === "prepare_failed" ? { ...ack.server, prepare_status: fault, declarations_available: false, declaration_digest: undefined }
      : fault === "wrong_server" ? { ...ack.server, server_id: "other" }
      : fault === "old_cas" ? { ...ack.server, state_version: target.version }
      : fault === "missing_digest" ? { ...ack.server, declaration_digest: undefined } : ack.server,
    connector: fault === "wrong_connector" ? { ...ack.connector, connector_id: "other" }
      : fault === "wrong_association" ? { ...ack.connector, server_id: "other" } : ack.connector,
  });
  expect(await commands.prepare(target, boundary)).toBe(false);
  const original = client.preparePrivateMcpServer.mock.calls[0]!.slice(0, 3);
  expect(commands.getSnapshot()[0]?.kind).toBe("unknown");
  expect(await recovery.current(boundary.subject, target.serverId)).toMatchObject({ subject: boundary.subject, target, key: original[2] });
  expect(recovery.complete).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
  expect(commands.getCompletion(target.serverId, target.connectorId, boundary)).toBeNull();
  expect(commands.canResume(target.serverId)).toBe(true);
  expect(await commands.prepare({ ...target, version: "9" }, boundary)).toBe(true);
  expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(client.getMcpPrepareReceipt).toHaveBeenCalledOnce();
  expect(client.getMcpPrepareReceipt.mock.calls[0]!.slice(0, 3)).toEqual(original);
  expect(recovery.complete).toHaveBeenCalledOnce(); expect(confirmed).toHaveBeenCalledOnce();
  expect(commands.getSnapshot()[0]?.kind).toBe("completed"); expect(await recovery.current(boundary.subject, target.serverId)).toBeUndefined();
});
