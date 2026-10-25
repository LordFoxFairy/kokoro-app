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
  server: { availability: "unavailable" as const, server_id: target.serverId, server_url: "https://example.test/mcp", display_name: "Prepared", status: "registered" as const, state_version: "2", headers: [], transport: "streamable_http" as const, prepare_status: "ready" as const, declarations: [], declarations_available: true },
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
function setup(initial?: McpPreparationRecord) {
  const recovery = journal(initial), confirmed = vi.fn();
  const client = {
    preparePrivateMcpServer: vi.fn<NonNullable<HubClient["preparePrivateMcpServer"]>>().mockResolvedValue(response()),
    getPrivateMcpServer: vi.fn<NonNullable<HubClient["getPrivateMcpServer"]>>().mockResolvedValue(response().server),
    getMcpConnector: vi.fn<NonNullable<HubClient["getMcpConnector"]>>().mockResolvedValue(response().connector),
  };
  const commands = createMcpPreparationCommands({ recovery, boundary, client, onConfirmed: confirmed, canPrepare: () => true });
  return { commands, client, recovery, confirmed };
}

// Port-level behavior, not native IndexedDB or a normal owner HTTP integration.
describe("restored Prepare inspection and exact replay", () => {
  it("requires explicit fresh reads, then replays only the saved key/CAS and retires only after ACK", async () => {
    const { commands, client, recovery, confirmed } = setup(saved());
    expect(await commands.restore(boundary)).toBe(true);
    expect(await commands.prepare({ ...target, version: "99" }, boundary)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(await commands.inspect(target.serverId, target.connectorId, boundary)).toBe(true);
    expect(client.getPrivateMcpServer).toHaveBeenCalledOnce(); expect(client.getMcpConnector).toHaveBeenCalledOnce();
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
    expect(commands.finish(target.serverId, boundary)).toBe(false);
    expect(await commands.prepare({ ...target, version: "99" }, boundary)).toBe(true);
    expect(client.preparePrivateMcpServer.mock.calls[0]?.slice(0, 3)).toEqual([target.serverId, "1", "original-key"]);
    expect(recovery.complete).toHaveBeenCalledWith(saved()); expect(confirmed).toHaveBeenCalledOnce();
    expect(await recovery.list(boundary.subject)).toEqual([]); expect(commands.finish(target.serverId, boundary)).toBe(true);
  });

  for (const fault of ["wrong_server", "wrong_connector", "wrong_association", "older_version", "read_failure"] as const) {
    it(`does not authorize replay when inspection returns ${fault}`, async () => {
      const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
      if (fault === "wrong_server") client.getPrivateMcpServer.mockResolvedValue({ ...response().server, server_id: "other" });
      if (fault === "wrong_connector") client.getMcpConnector.mockResolvedValue({ ...response().connector, connector_id: "other" });
      if (fault === "wrong_association") client.getMcpConnector.mockResolvedValue({ ...response().connector, server_id: "other" });
      if (fault === "older_version") client.getPrivateMcpServer.mockResolvedValue({ ...response().server, state_version: "0" });
      if (fault === "read_failure") client.getPrivateMcpServer.mockRejectedValue(new Error("read unavailable"));
      expect(await commands.inspect(target.serverId, target.connectorId, boundary)).toBe(false);
      expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
      expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(recovery.complete).not.toHaveBeenCalled();
    });
  }

  it("a closed instance with a transport-unknown intent also needs new inspection, not automatic replay", async () => {
    const { commands, client } = setup(saved(undefined)); await commands.restore(boundary);
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(await commands.inspect(target.serverId, target.connectorId, boundary)).toBe(true);
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(true);
  });

  it("a replay whose ACK is lost consumes its inspection and preserves the prior invalid failure", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    await commands.inspect(target.serverId, target.connectorId, boundary);
    client.preparePrivateMcpServer.mockRejectedValue(new Error("lost ACK"));
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(commands.canResume(target.serverId)).toBe(false);
    expect(commands.getSnapshot()[0]).toMatchObject({ kind: "unknown", failure: "invalid", inspection: "required" });
    expect((await recovery.current(boundary.subject, target.serverId))?.failure).toBe("invalid");
  });

  it("a generation change cancels old inspection and does not reuse it on re-admission", async () => {
    const { commands, client } = setup(saved()); await commands.restore(boundary);
    let finish!: (server: ReturnType<typeof response>["server"]) => void;
    client.getPrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const reading = commands.inspect(target.serverId, target.connectorId, boundary);
    await vi.waitFor(() => expect(client.getPrivateMcpServer).toHaveBeenCalledOnce());
    const next = { ...boundary, generation: 2 }; commands.bind(next); finish(response().server);
    expect(await reading).toBe(false); expect(client.getPrivateMcpServer.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(await commands.resume(target.serverId, target.connectorId, next)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  });

  it("explicitly cancelling inspection grants no replay or completion", async () => {
    const { commands, client, confirmed } = setup(saved()); await commands.restore(boundary);
    const controller = new AbortController();
    client.getMcpConnector.mockImplementationOnce(async () => { controller.abort(); return response().connector; });
    expect(await commands.inspect(target.serverId, target.connectorId, boundary, controller.signal)).toBe(false);
    expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled();
  });

  it("re-admission during recovery loading discards the old read and finishes a new current-generation read", async () => {
    const { commands, recovery, client } = setup(saved());
    let finish!: (records: McpPreparationRecord[]) => void;
    recovery.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const release = commands.retain(boundary);
    await vi.waitFor(() => expect(recovery.list).toHaveBeenCalledOnce());
    const next = { ...boundary, generation: 2 }; commands.bind(next); finish([saved()]);
    await vi.waitFor(() => expect(commands.recoveryReady()).toBe(true));
    expect(recovery.list).toHaveBeenCalledTimes(2); expect(commands.recoveryFailed()).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(commands.getSnapshot()[0]).toMatchObject({ kind: "unknown", inspection: "required" });
    release();
  });

  it("closing the inspected detail retires proof while preserving the durable original command", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    const window = new AbortController();
    expect(await commands.inspect(target.serverId, target.connectorId, boundary, window.signal)).toBe(true);
    window.abort();
    expect(commands.canResume(target.serverId)).toBe(false);
    expect(await commands.resume(target.serverId, target.connectorId, boundary, new AbortController().signal)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(await recovery.list(boundary.subject)).toEqual([saved()]);
  });

  it("a second live detail cannot consume another window's inspection proof", async () => {
    const { commands, client } = setup(saved()); await commands.restore(boundary);
    const first = new AbortController(), second = new AbortController();
    await commands.inspect(target.serverId, target.connectorId, boundary, first.signal);
    expect(await commands.resume(target.serverId, target.connectorId, boundary, second.signal)).toBe(false);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
    expect(await commands.inspect(target.serverId, target.connectorId, boundary, second.signal)).toBe(true);
    first.abort();
    expect(await commands.resume(target.serverId, target.connectorId, boundary, second.signal)).toBe(true);
  });

  it("a late replay ACK after close is explicitly consumed by the next detail without a second POST", async () => {
    const { commands, client, recovery, confirmed } = setup(saved()); await commands.restore(boundary);
    const first = new AbortController(), second = new AbortController();
    await commands.inspect(target.serverId, target.connectorId, boundary, first.signal);
    let finish!: (receipt: ReturnType<typeof response>) => void;
    client.preparePrivateMcpServer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const running = commands.resume(target.serverId, target.connectorId, boundary, first.signal);
    await vi.waitFor(() => expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce());
    first.abort(); finish(response()); expect(await running).toBe(false);
    expect(commands.getSnapshot()[0]?.kind).toBe("completed"); expect(await recovery.list(boundary.subject)).toEqual([]);
    expect(commands.canResume(target.serverId, second.signal)).toBe(true);
    expect(await commands.prepare({ ...target, version: "99" }, boundary, second.signal)).toBe(true);
    expect(client.preparePrivateMcpServer).toHaveBeenCalledOnce(); expect(confirmed).toHaveBeenCalledOnce();
    expect(commands.finish(target.serverId, boundary)).toBe(true);
  });

  it("actor replacement retires RAM but preserves the original actor's durable unknown intent", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    commands.bind({ ...boundary, subject: "other-actor", generation: 2 });
    expect(commands.getSnapshot()).toEqual([]);
    expect(await commands.inspect(target.serverId, target.connectorId, boundary)).toBe(false);
    expect(await recovery.list("other-actor")).toEqual([]);
    expect(await recovery.list(boundary.subject)).toEqual([saved()]);
    expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(recovery.complete).not.toHaveBeenCalled();
  });
});

describe("cross-window Prepare journal fences", () => {
  for (const when of ["before_inspection", "during_inspection", "before_post"] as const) {
    it(`a retired K cannot adopt or delete K2 ${when}`, async () => {
      const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
      const newer = { ...saved(), key: "replacement-key", target: { ...target, version: "3" } };
      if (when === "before_inspection") recovery.replace(newer);
      if (when === "during_inspection") client.getMcpConnector.mockImplementationOnce(async () => { recovery.replace(newer); return response().connector; });
      const inspected = await commands.inspect(target.serverId, target.connectorId, boundary);
      expect(inspected).toBe(when === "before_post");
      if (when === "before_post") recovery.replace(newer);
      expect(await commands.resume(target.serverId, target.connectorId, boundary)).toBe(false);
      expect(client.preparePrivateMcpServer).not.toHaveBeenCalled(); expect(recovery.failure).not.toHaveBeenCalled(); expect(recovery.complete).not.toHaveBeenCalled();
      expect(await recovery.current(boundary.subject, target.serverId)).toEqual(newer);
    });
  }

  it("same-key terminal failures observed in another tab cannot be downgraded by a later read or retry", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    recovery.replace(saved("replay_expired"));
    expect(await commands.inspect(target.serverId, target.connectorId, boundary)).toBe(false);
    recovery.replace(saved(undefined)); await commands.restore(boundary);
    expect(commands.canResume(target.serverId)).toBe(false); expect(commands.canInspect(target.serverId)).toBe(false);
    expect(commands.getSnapshot()[0]?.failure).toBe("replay_expired"); expect(client.preparePrivateMcpServer).not.toHaveBeenCalled();
  });
});

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
    expect(await commands.inspect(target.serverId, target.connectorId, boundary)).toBe(false);
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
    expect(await commands.prepare({ ...target, version: "2" }, boundary)).toBe(true);
    expect(client.preparePrivateMcpServer.mock.calls[1]?.[1]).toBe("2");
    expect(client.preparePrivateMcpServer.mock.calls[1]?.[2]).not.toBe(client.preparePrivateMcpServer.mock.calls[0]?.[2]);
  });

  it("a 400 after unknown never retires the original intent or permits a fresh CAS", async () => {
    const { commands, client, recovery } = setup(saved()); await commands.restore(boundary);
    await commands.inspect(target.serverId, target.connectorId, boundary);
    client.preparePrivateMcpServer.mockRejectedValue(new HubClientError("http", "invalid input", "invalid_mcp_personal_request", 400, false));
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
