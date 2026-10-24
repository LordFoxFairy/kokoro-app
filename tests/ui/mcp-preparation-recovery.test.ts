import { describe, expect, it, vi } from "vitest";
import { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands";

const boundary = { subject: "verified-subject", admitted: true, generation: 1 };
const target = { serverId: "server-one", connectorId: "connector-one", version: "1" };
type Record = { subject: string; target: typeof target; key: string; failure?: "invalid" | undefined };
const stored = (): Record => ({ subject: boundary.subject, target: { ...target }, key: "original-key", failure: "invalid" });
const recovery = (record?: Record) => ({
  current: vi.fn<(subject: string, serverId: string) => Promise<Record | undefined>>(async () => record ? structuredClone(record) : undefined),
  list: vi.fn<(subject: string) => Promise<Record[]>>(async () => record ? [structuredClone(record)] : []),
  reserve: vi.fn(async (subject: string, input: typeof target, key: string) => ({ record: record ?? { subject, target: input, key }, created: !record })),
  failure: vi.fn(async () => {}),
  complete: vi.fn(async () => {}),
});

describe("durable non-secret Prepare intent", () => {
  it("waits for the durable reserve before dispatching the first Prepare", async () => {
    let release!: (value: { record: Record; created: boolean }) => void;
    const journal = recovery();
    journal.reserve.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const prepare = vi.fn().mockRejectedValue(new Error("lost ACK"));
    const commands = createMcpPreparationCommands({ recovery: journal, canPrepare: () => true, boundary, client: { preparePrivateMcpServer: prepare }, onConfirmed: vi.fn() });
    const result = commands.prepare(target, boundary);
    await vi.waitFor(() => expect(journal.reserve).toHaveBeenCalledOnce());
    expect(prepare).not.toHaveBeenCalled();
    journal.current.mockResolvedValue({ ...stored(), failure: undefined });
    release({ record: { ...stored(), failure: undefined }, created: true });
    expect(await result).toBe(false);
    expect(prepare.mock.calls[0]?.slice(0, 3)).toEqual([target.serverId, "1", "original-key"]);
  });

  it("restores a closed instance as unknown without dispatch or trusting its new CAS", async () => {
    const prepare = vi.fn(), journal = recovery(stored());
    const commands = createMcpPreparationCommands({ recovery: journal, canPrepare: () => true, boundary, client: { preparePrivateMcpServer: prepare }, onConfirmed: vi.fn() });
    const release = commands.retain(boundary);
    await vi.waitFor(() => expect(commands.getSnapshot()).toEqual([expect.objectContaining({ serverId: target.serverId, connectorId: target.connectorId, kind: "unknown", failure: "invalid" })]));
    expect(prepare).not.toHaveBeenCalled();
    expect(commands.finish(target.serverId, boundary)).toBe(false);
    expect(await commands.prepare({ ...target, version: "99" }, boundary)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    release();
  });
});

// This port fixture checks command policy only. Native IndexedDB is separately exercised in Chromium.
