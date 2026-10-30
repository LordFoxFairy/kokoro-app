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

it("native IndexedDB commits original GET completion and preserves another tab's successor key", async () => {
  const { build } = await import("vite");
  const { chromium } = await import("@playwright/test");
  const { resolve } = await import("node:path");
  const entry = "virtual:prepare-native-journal";
  const bundle = await build({ configFile: false, root: process.cwd(), logLevel: "silent", resolve: { alias: { "@": resolve("src") } },
    plugins: [{ name: "prepare-native-journal-fixture", resolveId: id => id.endsWith(entry) ? `\0${entry}` : undefined,
      load: id => id === `\0${entry}` ? 'export { createMcpPreparationCommands } from "@/ui/mcp/mcp-preparation-commands"; export { createBrowserMcpPreparationRecovery } from "@/ui/mcp/mcp-preparation-recovery";' : undefined }],
    build: { write: false, minify: false, lib: { entry, name: "PrepareNativeFixture", formats: ["iife"] } } });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  if (!output || !("output" in output)) throw new Error("unexpected fixture bundle");
  const chunk = output.output.find(output => output.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("missing fixture bundle");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated IDB fixture</title>" }));
    const first = await context.newPage(), second = await context.newPage();
    for (const page of [first, second]) { await page.goto("https://prepare-journal.test/"); await page.addScriptTag({ content: chunk.code }); }
    type Fixture = Pick<typeof import("@/ui/mcp/mcp-preparation-commands"), "createMcpPreparationCommands"> & Pick<typeof import("@/ui/mcp/mcp-preparation-recovery"), "createBrowserMcpPreparationRecovery">;
    const initial = await first.evaluate(async ({ boundary, target }) => {
      const fixture = (window as unknown as { PrepareNativeFixture: Fixture }).PrepareNativeFixture;
      return fixture.createBrowserMcpPreparationRecovery().reserve(boundary.subject, target, "native-original-key");
    }, { boundary, target });
    expect(initial.created).toBe(true);
    const concurrent = await second.evaluate(async ({ boundary, target }) => {
      const fixture = (window as unknown as { PrepareNativeFixture: Fixture }).PrepareNativeFixture;
      return fixture.createBrowserMcpPreparationRecovery().reserve(boundary.subject, { ...target, version: "9" }, "native-competing-key");
    }, { boundary, target });
    expect(concurrent).toEqual({ record: initial.record, created: false });
    const completed = await first.evaluate(async ({ boundary, target }) => {
      const fixture = (window as unknown as { PrepareNativeFixture: Fixture }).PrepareNativeFixture;
      const recovery = fixture.createBrowserMcpPreparationRecovery(), calls: unknown[] = [];
      const commands = fixture.createMcpPreparationCommands({ boundary, recovery, canPrepare: () => false, onConfirmed: () => {}, client: {
        preparePrivateMcpServer: async () => { throw new Error("POST forbidden in restored entry"); },
        getMcpPrepareReceipt: async (...args) => {
          calls.push(args.slice(0, 3));
          return { server: { availability: "unavailable", server_id: target.serverId, server_url: "https://example.test/mcp", display_name: "Native QA", status: "registered", state_version: "2", headers: [], transport: "sse_compat", prepare_status: "ready", declarations: [], declarations_available: true, declaration_digest: "a".repeat(64) },
            connector: { availability: "unavailable", connector_id: target.connectorId, server_id: target.serverId, provider_key: "native-qa", connector_type: "mcp", status: "active", enabled: true, approved_scopes: [], state_version: "2" }, declarations: [], replayed: true };
        },
      } });
      await commands.restore(boundary);
      const success = await commands.prepare({ ...target, version: "9" }, boundary);
      return { success, calls, kind: commands.getSnapshot()[0]?.kind, current: await recovery.current(boundary.subject, target.serverId), locator: commands.getCompletion(target.serverId, target.connectorId, boundary) };
    }, { boundary, target });
    expect(completed).toEqual({ success: true, calls: [[target.serverId, "1", "native-original-key"]], kind: "completed", current: undefined,
      locator: { serverId: target.serverId, connectorId: target.connectorId, providerKey: "native-qa" } });
    const successor = await second.evaluate(async ({ boundary, target }) => {
      const fixture = (window as unknown as { PrepareNativeFixture: Fixture }).PrepareNativeFixture;
      return fixture.createBrowserMcpPreparationRecovery().reserve(boundary.subject, { ...target, version: "9" }, "native-successor-key");
    }, { boundary, target });
    expect(successor.created).toBe(true);
    const protectedRecord = await first.evaluate(async original => {
      const fixture = (window as unknown as { PrepareNativeFixture: Fixture }).PrepareNativeFixture;
      const journal = fixture.createBrowserMcpPreparationRecovery();
      const rejected = await journal.complete(original).then(() => false, () => true);
      return { rejected, current: await journal.current(original.subject, original.target.serverId) };
    }, initial.record);
    expect(protectedRecord).toEqual({ rejected: true, current: successor.record });
    await context.close();
  } finally { await browser.close(); }
}, 20_000);
