import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import type { McpPreparationRecord, McpPreparationJournal, McpPreparationRetirement } from "@/ui/mcp/mcp-preparation-recovery";

type NativeWindow = Window & {
  JournalFixture: Pick<typeof import("@/ui/mcp/mcp-preparation-recovery"), "createBrowserMcpPreparationRecovery">;
  journal: McpPreparationJournal;
  heldV1?: IDBDatabase;
  lateClosed: number;
};
const database = "kokoro-mcp-preparation";
const original: McpPreparationRecord = { subject: "native-v2-qa", target: { serverId: "native-server", connectorId: "native-connector", version: "7" }, key: "native-original", failure: "invalid" };
// Explicit local QA reference, not a released BFF policy or owner outcome.
const retirement: McpPreparationRetirement = { disposition: "unknown_fenced", policy_ref: { artifact_sha256: "a".repeat(64), profile: "qa.prepare.retirement", version: "qa-local" } };
let browser: Browser, context: BrowserContext, first: Page, second: Page, code: string;
beforeAll(async () => {
  const entry = "virtual:prepare-journal-v2";
  const built = await build({ configFile: false, root: process.cwd(), logLevel: "silent", resolve: { alias: { "@": resolve("src") } },
    plugins: [{ name: "native-prepare-journal-fixture", resolveId: id => id.endsWith(entry) ? `\0${entry}` : undefined,
      load: id => id === `\0${entry}` ? 'export { createBrowserMcpPreparationRecovery } from "@/ui/mcp/mcp-preparation-recovery";' : undefined }],
    build: { write: false, minify: false, lib: { entry, name: "JournalFixture", formats: ["iife"] } } });
  const output = Array.isArray(built) ? built[0] : built;
  if (!output || !("output" in output)) throw new Error("missing native fixture bundle");
  const chunk = output.output.find(item => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("missing native fixture code");
  code = chunk.code; browser = await chromium.launch({ headless: true });
}, 20_000);
beforeEach(async () => {
  context = await browser.newContext();
  await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated native IDB QA</title>" }));
  first = await context.newPage(); second = await context.newPage();
  for (const page of [first, second]) {
    await page.goto("https://prepare-journal-v2.test/"); await page.addScriptTag({ content: code });
    await page.evaluate(() => { const w = window as unknown as NativeWindow; w.journal = w.JournalFixture.createBrowserMcpPreparationRecovery(); });
  }
});
afterEach(async () => { await context?.close(); });
afterAll(async () => { await browser?.close(); });
async function seedV1(page: Page, keepOpen = false) {
  return page.evaluate(async ({ database, record, keepOpen }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("intents").createIndex("subject", "subject");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("intents", "readwrite");
      tx.objectStore("intents").put(record, JSON.stringify([record.subject, record.target.serverId]));
      tx.onabort = () => reject(tx.error); tx.oncomplete = () => {
        if (keepOpen) { (window as unknown as NativeWindow).heldV1 = db; db.onversionchange = () => {}; }
        else db.close();
        resolve();
      };
    };
  }), { database, record: original, keepOpen });
}
async function snapshot(page: Page) {
  return page.evaluate(async ({ database, record }) => new Promise<{ version: number; stores: string[]; active: unknown; retired: unknown[]; indexes: string[] }>((resolve, reject) => {
    const request = indexedDB.open(database); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, stores = [...db.objectStoreNames], tx = db.transaction(stores, "readonly");
      const current = tx.objectStore("intents").get(JSON.stringify([record.subject, record.target.serverId]));
      const retired = stores.includes("retired_intents") ? tx.objectStore("retired_intents").getAll() : undefined;
      const indexes = stores.includes("retired_intents") ? [...tx.objectStore("retired_intents").indexNames] : [];
      tx.onabort = () => reject(tx.error); tx.oncomplete = () => { const result = { version: db.version, stores, active: current.result, retired: retired?.result ?? [], indexes }; db.close(); resolve(result); };
    };
  }), { database, record: original });
}

it("native v1 upgrade adds only history, preserving original active value and subject index", async () => {
  await seedV1(first);
  expect(await first.evaluate(record => (window as unknown as NativeWindow).journal.current(record.subject, record.target.serverId), original)).toEqual(original);
  const state = await snapshot(first);
  expect(state.version).toBe(2); expect(state.stores).toEqual(["intents", "retired_intents"]);
  expect(state.indexes).toEqual(["subject_server"]); expect(JSON.stringify(state.active)).toBe(JSON.stringify(original)); expect(state.retired).toEqual([]);
});

it.each(["unknown_fenced", "definite_rejected"] as const)("native %s retirement commits immutable history and never deletes a successor K2", async disposition => {
  await seedV1(first);
  const saved = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    const retired = await journal.retireWaiting(record, retirement);
    return { retired, current: await journal.current(record.subject, record.target.serverId), history: await journal.getRetired(record) };
  }, { record: original, retirement: { ...retirement, disposition } });
  expect(saved.current).toBeUndefined(); expect(saved.history).toEqual(saved.retired);
  expect(saved.retired).toMatchObject({ schema_version: 2, subject: original.subject, target: original.target, key: original.key, disposition, policy_ref: retirement.policy_ref });
  expect(saved.retired.retired_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/u);
  const next = await second.evaluate(record => (window as unknown as NativeWindow).journal.reserve(record.subject, { ...record.target, version: "9" }, "native-k2"), original);
  expect(next.created).toBe(true);
  const repeated = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    return { retired: await journal.retireWaiting(record, retirement), current: await journal.current(record.subject, record.target.serverId) };
  }, { record: original, retirement: { ...retirement, disposition } });
  expect(repeated.retired).toEqual(saved.retired); expect(repeated.current).toEqual(next.record);
});

it.each(["before_delete", "after_delete"])("native abort %s rolls back both history insertion and active deletion", async phase => {
  await seedV1(first);
  const result = await first.evaluate(async ({ record, retirement, phase }) => {
    const originalDelete = IDBObjectStore.prototype.delete; let reachedDelete = false;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === "intents") reachedDelete = true;
      if (this.name === "intents" && phase === "before_delete") { this.transaction.abort(); throw new Error("QA transaction abort"); }
      const request = originalDelete.call(this, key);
      if (this.name === "intents") request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    try { await (window as unknown as NativeWindow).journal.retireWaiting(record, retirement); return { rejected: false, reachedDelete }; }
    catch { return { rejected: true, reachedDelete }; }
    finally { IDBObjectStore.prototype.delete = originalDelete; }
  }, { record: original, retirement, phase });
  expect(result).toEqual({ rejected: true, reachedDelete: true }); const state = await snapshot(first);
  expect(state.active).toEqual(original); expect(state.retired).toEqual([]);
});

it("native cancellation before and inside retirement preserves unknown original intent", async () => {
  await seedV1(first);
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal, stopped = new AbortController(); stopped.abort();
    const before = await journal.retireWaiting(record, retirement, stopped.signal).then(() => false, () => true);
    const during = new AbortController(), originalDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) { if (this.name === "intents") during.abort(); return originalDelete.call(this, key); };
    try { return { before, during: await journal.retireWaiting(record, retirement, during.signal).then(() => false, () => true) }; }
    finally { IDBObjectStore.prototype.delete = originalDelete; }
  }, { record: original, retirement });
  expect(result).toEqual({ before: true, during: true });
  const state = await snapshot(first); expect(state.active).toEqual(original); expect(state.retired).toEqual([]);
});

it("native bounded keyset pages are unique, scope-bound and use index seek rather than getAll", async () => {
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    for (const key of ["qa-z", "qa-a", "qa-f", "qa-b", "qa-q", "qa-c", "qa-10"]) {
      const active = await journal.reserve(record.subject, record.target, key); await journal.retireWaiting(active.record, retirement);
    }
    const originalGetAll = IDBIndex.prototype.getAll, originalOpen = IDBIndex.prototype.openCursor;
    let reads = 0;
    IDBIndex.prototype.getAll = () => { throw new Error("unbounded history getAll forbidden"); };
    IDBIndex.prototype.openCursor = function (...args) { const request = originalOpen.apply(this, args); request.addEventListener("success", () => { reads++; }); return request; };
    try {
      const firstPage = await journal.listRetired(record.subject, record.target.serverId, { limit: 2 });
      const firstReads = reads, keys = firstPage.items.map(item => item.key), visits = [firstReads];
      let after = firstPage.nextCursor;
      while (after) { reads = 0; const page = await journal.listRetired(record.subject, record.target.serverId, { limit: 2, after }); keys.push(...page.items.map(item => item.key)); visits.push(reads); after = page.nextCursor; }
      const wrongActor = await journal.listRetired("other-subject", record.target.serverId, { after: firstPage.nextCursor! }).then(() => false, () => true);
      const wrongServer = await journal.listRetired(record.subject, "other-server", { after: firstPage.nextCursor! }).then(() => false, () => true);
      return { keys, visits, wrongActor, wrongServer };
    } finally { IDBIndex.prototype.getAll = originalGetAll; IDBIndex.prototype.openCursor = originalOpen; }
  }, { record: original, retirement });
  expect(result.keys).toEqual(["qa-10", "qa-a", "qa-b", "qa-c", "qa-f", "qa-q", "qa-z"]);
  expect(new Set(result.keys).size).toBe(7); expect(result.visits.every(count => count <= 5)).toBe(true);
  expect(result.wrongActor).toBe(true); expect(result.wrongServer).toBe(true);
});

it("blocked upgrade rejects, closes its late success, and old native version1 request cannot downgrade", async () => {
  await seedV1(first, true);
  await second.evaluate(() => { const w = window as unknown as NativeWindow; w.lateClosed = 0; const close = IDBDatabase.prototype.close; IDBDatabase.prototype.close = function () { if (this.name === "kokoro-mcp-preparation" && this.version === 2) w.lateClosed++; return close.call(this); }; });
  const blocked = await second.evaluate(record => (window as unknown as NativeWindow).journal.current(record.subject, record.target.serverId).then(() => false, () => true), original);
  expect(blocked).toBe(true);
  await first.evaluate(() => { (window as unknown as NativeWindow).heldV1!.close(); });
  await second.waitForFunction(() => (window as unknown as NativeWindow).lateClosed > 0, { timeout: 2_000 });
  const priorVersion = await second.evaluate(database => new Promise<string>(resolve => { const request = indexedDB.open(database, 1); request.onerror = event => { event.preventDefault(); resolve(request.error!.name); }; request.onsuccess = () => { request.result.close(); resolve("unexpected success"); }; }), database);
  expect(priorVersion).toBe("VersionError");
  expect(await second.evaluate(record => (window as unknown as NativeWindow).journal.current(record.subject, record.target.serverId), original)).toEqual(original);
});

it("successful v1-compatible complete stays separate and restore ignores retired history", async () => {
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    await journal.reserve(record.subject, record.target, record.key); await journal.complete(record);
    const noHistory = await journal.getRetired(record);
    const again = await journal.reserve(record.subject, record.target, "native-after-success");
    await journal.retireWaiting(again.record, retirement);
    return { noHistory, active: await journal.list(record.subject), history: await journal.getRetired(again.record) };
  }, { record: original, retirement });
  expect(result.noHistory).toBeUndefined(); expect(result.active).toEqual([]); expect(result.history?.disposition).toBe("unknown_fenced");
});

it("missing active, replaced identity and invalid closed metadata never fabricate a retired record", async () => {
  await seedV1(first);
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    const badRecords = [{ ...record, key: "wrong-key" }, { ...record, target: { ...record.target, version: "8" } },
      { ...record, target: { ...record.target, connectorId: "wrong-connector" } }, { ...record, subject: "wrong-subject" }];
    const wrongIdentity = [];
    for (const bad of badRecords) wrongIdentity.push(await journal.retireWaiting(bad, retirement).then(() => false, () => true));
    const invalidMetadata = await Reflect.apply(journal.retireWaiting, journal, [record, { ...retirement, raw_ack: "QA_ONLY" }]).then(() => false, () => true);
    await journal.complete(record);
    const missing = await journal.retireWaiting(record, retirement).then(() => false, () => true);
    return { wrongIdentity, invalidMetadata, missing, history: await journal.getRetired(record) };
  }, { record: original, retirement });
  expect(result).toEqual({ wrongIdentity: [true, true, true, true], invalidMetadata: true, missing: true, history: undefined });
});

it("an existing retired record with the same active K is drift, not idempotent permission to delete", async () => {
  await seedV1(first);
  const saved = await first.evaluate(({ record, retirement }) => (window as unknown as NativeWindow).journal.retireWaiting(record, retirement), { record: original, retirement });
  // Explicit corrupt half-state in this isolated native fixture, not a production write path.
  await second.evaluate(({ database, record }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 2); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction("intents", "readwrite"); tx.objectStore("intents").put(record, JSON.stringify([record.subject, record.target.serverId])); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
  }), { database, record: original });
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    return { rejected: await journal.retireWaiting(record, retirement).then(() => false, () => true), current: await journal.current(record.subject, record.target.serverId), history: await journal.getRetired(record) };
  }, { record: original, retirement });
  expect(result).toEqual({ rejected: true, current: original, history: saved });
});

it("concurrent native archive and another tab reserve serialize without old K deleting K2", async () => {
  await seedV1(first);
  const [retired, reserved] = await Promise.all([
    first.evaluate(({ record, retirement }) => (window as unknown as NativeWindow).journal.retireWaiting(record, retirement), { record: original, retirement }),
    second.evaluate(record => (window as unknown as NativeWindow).journal.reserve(record.subject, { ...record.target, version: "9" }, "concurrent-k2"), original),
  ]);
  const state = await snapshot(first);
  expect(state.retired).toEqual([retired]); expect(state.active).toEqual(reserved.created ? reserved.record : undefined);
  if (!reserved.created) expect(reserved.record).toEqual(original);
});

it("native versionchange closes the current adapter and higher versions fail closed without deletion", async () => {
  await seedV1(first);
  await first.evaluate(record => (window as unknown as NativeWindow).journal.current(record.subject, record.target.serverId), original);
  const version = await second.evaluate(database => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open(database, 3); request.onblocked = () => reject(new Error("adapter did not close on versionchange")); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; db.close(); resolve(db.version); };
  }), database);
  expect(version).toBe(3);
  const result = await first.evaluate(async record => {
    let deletes = 0; const originalDelete = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase = function (...args) { deletes++; return originalDelete.apply(this, args); };
    try { return { rejected: await (window as unknown as NativeWindow).journal.current(record.subject, record.target.serverId).then(() => false, () => true), deletes }; }
    finally { IDBFactory.prototype.deleteDatabase = originalDelete; }
  }, original);
  expect(result).toEqual({ rejected: true, deletes: 0 }); expect((await snapshot(first)).active).toEqual(original);
});

it.each(["closed_shape", "primary_key"])("native corrupt %s history fails closed on exact and paged reads", async fault => {
  await seedV1(first);
  const saved = await first.evaluate(({ record, retirement }) => (window as unknown as NativeWindow).journal.retireWaiting(record, retirement), { record: original, retirement });
  await second.evaluate(({ database, saved, fault }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 2); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("retired_intents", "readwrite");
      tx.objectStore("retired_intents").put(fault === "closed_shape" ? { ...saved, raw_ack: "QA_ONLY" } : { ...saved, key: "wrong-key" }, JSON.stringify([saved.subject, saved.target.serverId, saved.key, saved.target.version]));
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
  }), { database, saved, fault });
  const result = await first.evaluate(async record => {
    const journal = (window as unknown as NativeWindow).journal;
    return { exact: await journal.getRetired(record).then(() => false, () => true), page: await journal.listRetired(record.subject, record.target.serverId).then(() => false, () => true), active: await journal.current(record.subject, record.target.serverId) };
  }, original);
  expect(result).toEqual({ exact: true, page: true, active: undefined });
});

it("a malformed v1 store schema aborts upgrade without silently recreating active storage", async () => {
  await first.evaluate(({ database, record }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(database, 1); request.onupgradeneeded = () => request.result.createObjectStore("intents"); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction("intents", "readwrite"); tx.objectStore("intents").put(record, JSON.stringify([record.subject, record.target.serverId])); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
  }), { database, record: original });
  expect(await first.evaluate(record => (window as unknown as NativeWindow).journal.current(record.subject, record.target.serverId).then(() => false, () => true), original)).toBe(true);
  const state = await snapshot(first); expect(state.version).toBe(1); expect(state.active).toEqual(original); expect(state.stores).toEqual(["intents"]);
});

it("exact history read rejects a different connector even when its subject/server/key/CAS primary key matches", async () => {
  await seedV1(first);
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    const saved = await journal.retireWaiting(record, retirement);
    const wrong = { ...record, target: { ...record.target, connectorId: "other-connector" } };
    return { rejected: await journal.getRetired(wrong).then(() => false, () => true), saved, actual: await journal.getRetired(record) };
  }, { record: original, retirement });
  expect(result.rejected).toBe(true); expect(result.actual).toEqual(result.saved);
});

it("reserve refuses the exact retired key/CAS, including connector substitution, and still coalesces an active K2", async () => {
  await seedV1(first);
  const result = await first.evaluate(async ({ record, retirement }) => {
    const journal = (window as unknown as NativeWindow).journal;
    const saved = await journal.retireWaiting(record, retirement);
    const retiredKey = await journal.reserve(record.subject, record.target, record.key).then(() => false, () => true);
    const substituted = await journal.reserve(record.subject, { ...record.target, connectorId: "substituted-connector" }, record.key).then(() => false, () => true);
    const next = await journal.reserve(record.subject, { ...record.target, version: "9" }, "normal-k2");
    const oldRequest = await journal.reserve(record.subject, record.target, record.key);
    return { retiredKey, substituted, next, oldRequest, current: await journal.current(record.subject, record.target.serverId), history: await journal.getRetired(record), saved };
  }, { record: original, retirement });
  expect(result.retiredKey).toBe(true); expect(result.substituted).toBe(true);
  expect(result.next.created).toBe(true); expect(result.next.record.key).toBe("normal-k2");
  expect(result.oldRequest).toEqual({ record: result.next.record, created: false });
  expect(result.current).toEqual(result.next.record); expect(result.history).toEqual(result.saved);
});
