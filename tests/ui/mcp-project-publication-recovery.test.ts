import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserMcpProjectPublicationRecovery, type PublicationRecoveryRecord } from "@/ui/mcp/mcp-project-publication-recovery";

const record = (): PublicationRecoveryRecord => ({
  subject: "verified-subject",
  target: { serverId: "server-one", connectorId: "connector-one", providerKey: "custom-mcp" },
  original: { server_id: "server-one", connector_id: "connector-one", expected_source_state_version: "7", targets: [
    { project_id: "project-one", expected_pin: { absent: true } },
    { project_id: "project-two", expected_pin: { current: { pin_id: "pin-two", state_version: "4" } } },
  ] },
  key: "original-command-key",
});
const retry = { status: 409, code: "mcp_project_publication_in_progress", retryable: true };
const inspect = { status: 502, code: "mcp_project_publication_response_invalid", retryable: false };

/** Event-port fixture only: native IndexedDB durability/cross-tab scheduling belongs to browser QA. */
function databaseFixture() {
  const rows = new Map<IDBValidKey, unknown>();
  const controls = { abortCommit: false, delayCommit: false, unavailable: false, releaseCommit: undefined as (() => void) | undefined };
  let tail = Promise.resolve();
  let initialized = false;
  const database = {
    close: vi.fn(), createObjectStore: vi.fn(), onversionchange: null,
    transaction: vi.fn(() => {
      let active = false, pending = 0, ended = false;
      let finish!: () => void;
      const ready = tail;
      tail = new Promise<void>(resolve => { finish = resolve; });
      let draft: Map<IDBValidKey, unknown>;
      const tx = {
        onabort: null as null | (() => void), onerror: null as null | (() => void), oncomplete: null as null | (() => void),
        abort: () => { if (ended) return; ended = true; tx.onabort?.(); finish(); },
        objectStore: () => store,
      };
      const complete = () => {
        if (ended || !active || pending > 0) return;
        const commit = () => {
          if (ended) return;
          if (controls.abortCommit) { tx.abort(); return; }
          ended = true; rows.clear(); draft.forEach((value, key) => rows.set(key, value)); tx.oncomplete?.(); finish();
        };
        if (controls.delayCommit) controls.releaseCommit = commit; else commit();
      };
      const request = (action: () => unknown) => {
        pending++;
        const req = { result: undefined as unknown, onsuccess: null as null | (() => void) };
        void ready.then(() => queueMicrotask(() => {
          if (ended) return;
          if (!active) { draft = new Map(rows); active = true; }
          try { req.result = action(); req.onsuccess?.(); } catch { tx.abort(); }
          pending--; queueMicrotask(complete);
        }));
        return req;
      };
      const store = {
        transaction: tx,
        get: (key: IDBValidKey) => request(() => structuredClone(draft.get(key))),
        add: (value: unknown, key: IDBValidKey) => request(() => {
          if (draft.has(key)) throw new Error("duplicate key");
          draft.set(key, structuredClone(value));
        }),
        put: (value: unknown, key: IDBValidKey) => request(() => { draft.set(key, structuredClone(value)); }),
        delete: (key: IDBValidKey) => request(() => draft.delete(key)),
      };
      return tx;
    }),
  };
  const open = vi.fn(() => {
    if (controls.unavailable) throw new Error("storage unavailable");
    const request = { result: database, onupgradeneeded: null as null | (() => void), onsuccess: null as null | (() => void) };
    queueMicrotask(() => { if (!initialized) { initialized = true; request.onupgradeneeded?.(); } request.onsuccess?.(); });
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  return { rows, controls, database, open };
}

afterEach(() => vi.unstubAllGlobals());

describe("publication refresh journal", () => {
  it("keeps the original command across instances without a network or key allocation", async () => {
    databaseFixture();
    const fetch = vi.fn(), uuid = vi.spyOn(crypto, "randomUUID"); vi.stubGlobal("fetch", fetch);
    const journal = createBrowserMcpProjectPublicationRecovery();
    expect(await journal.read(record().subject)).toBeNull();
    expect(await journal.reserve(record())).toEqual(record());
    const restored = await createBrowserMcpProjectPublicationRecovery().read(record().subject);
    expect(restored).toEqual(record());
    expect(fetch).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled(); uuid.mockRestore();
    expect(Object.isFrozen(restored?.original.targets[1]?.expected_pin)).toBe(true);
  });

  it("isolates actors and preserves the first record when another instance reserves a replacement", async () => {
    databaseFixture();
    const first = createBrowserMcpProjectPublicationRecovery(), other = createBrowserMcpProjectPublicationRecovery();
    const replacement = { ...record(), key: "new-key", original: { ...record().original, expected_source_state_version: "99" } };
    expect(await Promise.all([first.reserve(record()), other.reserve(replacement)])).toEqual([record(), record()]);
    expect(await other.read("other-subject")).toBeNull();
    const actor = { ...record(), subject: "other-subject", key: "actor-key" };
    expect(await other.reserve(actor)).toEqual(actor);
    expect(await first.read(record().subject)).toEqual(record());
  });

  it("resolves reserve only after commit, not after the successful add request", async () => {
    const fixture = databaseFixture(); fixture.controls.delayCommit = true;
    const resolved = vi.fn();
    const pending = createBrowserMcpProjectPublicationRecovery().reserve(record()).then(resolved);
    void pending.catch(() => {});
    await vi.waitFor(() => expect(fixture.controls.releaseCommit).toEqual(expect.any(Function)));
    expect(resolved).not.toHaveBeenCalled(); expect(fixture.rows.size).toBe(0);
    fixture.controls.releaseCommit!(); await pending;
    expect(resolved).toHaveBeenCalledWith(record());
  });

  it("rejects a failed reserve commit without keeping an in-memory replacement", async () => {
    const fixture = databaseFixture(); fixture.controls.abortCommit = true;
    const journal = createBrowserMcpProjectPublicationRecovery();
    await expect(journal.reserve(record())).rejects.toThrow();
    expect(fixture.rows.size).toBe(0); fixture.controls.abortCommit = false;
    expect(await journal.read(record().subject)).toBeNull();
  });

  it("fails closed when browser storage is unavailable and allows a later explicit read", async () => {
    const fixture = databaseFixture(); fixture.controls.unavailable = true;
    const journal = createBrowserMcpProjectPublicationRecovery();
    await expect(journal.read(record().subject)).rejects.toThrow();
    await expect(journal.reserve(record())).rejects.toThrow();
    fixture.controls.unavailable = false;
    expect(await journal.read(record().subject)).toBeNull();
  });

  it.each([
    ["unknown field", (value: PublicationRecoveryRecord) => ({ ...value, token: "not-persistable" })],
    ["secret target", (value: PublicationRecoveryRecord) => ({ ...value, target: { ...value.target, headers: [] } })],
    ["secret original", (value: PublicationRecoveryRecord) => ({ ...value, original: { ...value.original, url: "https://invalid.test" } })],
    ["mismatched binding", (value: PublicationRecoveryRecord) => ({ ...value, target: { ...value.target, connectorId: "different" } })],
    ["duplicate project", (value: PublicationRecoveryRecord) => ({ ...value, original: { ...value.original, targets: [value.original.targets[0], value.original.targets[0]] } })],
    ["invalid CAS", (value: PublicationRecoveryRecord) => ({ ...value, original: { ...value.original, expected_source_state_version: "2147483648" } })],
    ["unknown failure", (value: PublicationRecoveryRecord) => ({ ...value, failure: { ...retry, status: 400 } })],
  ])("rejects %s instead of silently stripping it", async (_label, change) => {
    const fixture = databaseFixture();
    await expect(createBrowserMcpProjectPublicationRecovery().reserve(change(record()) as PublicationRecoveryRecord)).rejects.toThrow();
    expect(fixture.rows.size).toBe(0);
  });

  it.each(["version", "binding", "unknown field", "malformed"]) ("keeps corrupt storage closed: %s", async kind => {
    const fixture = databaseFixture(), journal = createBrowserMcpProjectPublicationRecovery();
    await journal.reserve(record());
    const key = [...fixture.rows.keys()][0]!;
    const value = fixture.rows.get(key) as { version: number; record: { subject: string } };
    if (kind === "version") value.version = 99;
    else if (kind === "binding") value.record.subject = "other-subject";
    else if (kind === "unknown field") Object.assign(value, { authorization: "not-persistable" });
    else fixture.rows.set(key, null);
    await expect(journal.read(record().subject)).rejects.toThrow();
    await expect(journal.reserve({ ...record(), key: "replacement-key" })).rejects.toThrow();
    expect(fixture.rows.size).toBe(1);
  });

  it("only clears an exact original and leaves replacement, other-actor and changed-CAS commands intact", async () => {
    databaseFixture();
    const journal = createBrowserMcpProjectPublicationRecovery();
    await journal.reserve(record());
    const variants = [
      { ...record(), subject: "other-subject" },
      { ...record(), key: "late-key" },
      { ...record(), target: { ...record().target, providerKey: "other-provider" } },
      { ...record(), original: { ...record().original, expected_source_state_version: "8" } },
      { ...record(), original: { ...record().original, targets: [...record().original.targets].reverse() } },
    ];
    for (const variant of variants) {
      expect(await journal.compareClear(variant)).toBe(false);
      expect(await journal.markFailure(variant, inspect)).toBeNull();
      expect(await journal.read(record().subject)).toEqual(record());
    }
    expect(await journal.compareClear(record())).toBe(true);
    expect(await journal.compareClear(record())).toBe(false);
    const replacement = { ...record(), key: "new-key" }; await journal.reserve(replacement);
    expect(await journal.compareClear(record())).toBe(false);
    expect(await journal.read(record().subject)).toEqual(replacement);
  });

  it("compares object fields canonically without relying on their insertion order", async () => {
    databaseFixture();
    const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
    const original = record().original;
    expect(await journal.compareClear({ ...record(), original: { targets: original.targets, expected_source_state_version: original.expected_source_state_version, connector_id: original.connector_id, server_id: original.server_id } })).toBe(true);
  });

  it("retains inspection over a late same-command response", async () => {
    databaseFixture();
    const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
    expect((await journal.markFailure(record(), retry))?.failure).toEqual(retry);
    expect((await journal.markFailure(record(), inspect))?.failure).toEqual(inspect);
    expect((await journal.markFailure(record(), retry))?.failure).toEqual(inspect);
    expect((await journal.markFailure(record()))?.failure).toEqual(inspect);
    expect((await createBrowserMcpProjectPublicationRecovery().read(record().subject))?.failure).toEqual(inspect);
  });

  it("keeps an unclassified failure inspection-only even after reload and a late retryable tuple", async () => {
    databaseFixture();
    const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
    await journal.markFailure(record(), retry);
    expect((await journal.markFailure(record()))?.failure).toBeUndefined();
    expect((await createBrowserMcpProjectPublicationRecovery().markFailure(record(), retry))?.failure).toBeUndefined();
  });

  it("accepts only exact generated failure tuples and preserves the record on failure", async () => {
    databaseFixture();
    const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
    await expect(journal.markFailure(record(), { ...retry, retryable: false })).rejects.toThrow();
    expect(await journal.read(record().subject)).toEqual(record());
    const admission = { status: 401, code: "session_invalid", retryable: false };
    expect((await journal.markFailure(record(), admission))?.failure).toEqual(admission);
  });

  it("retains the command if deletion fails to commit", async () => {
    const fixture = databaseFixture(), journal = createBrowserMcpProjectPublicationRecovery();
    await journal.reserve(record()); fixture.controls.abortCommit = true;
    await expect(journal.compareClear(record())).rejects.toThrow();
    fixture.controls.abortCommit = false;
    expect(await journal.read(record().subject)).toEqual(record());
  });
  describe("first-known rejection retirement", () => {
    const rejections = [
      { status: 400, code: "mcp_project_publication_request_invalid", retryable: false },
      { status: 412, code: "mcp_project_publication_precondition_failed", retryable: false },
    ];
    const firstRejectionOnly = { firstRejectionOnly: true } as const;

    it.each(rejections)("atomically blocks stale $status retirement after another instance records unknown", async rejection => {
      databaseFixture();
      const first = createBrowserMcpProjectPublicationRecovery(), other = createBrowserMcpProjectPublicationRecovery();
      await first.reserve(record());
      const rejected = (await first.markFailure(record(), rejection))!;
      await other.read(record().subject);
      const unknown = other.markFailure(record());
      const staleClear = first.compareClear(rejected, firstRejectionOnly);
      const [updated, cleared] = await Promise.all([unknown, staleClear]);
      expect(cleared).toBe(false);
      expect(updated?.failure).toBeUndefined();
      expect(await first.read(record().subject)).toEqual(record());
      // Exact owner ACK still retires this command, independent of failure-policy tightening.
      expect(await first.compareClear(rejected)).toBe(true);
    });

    it.each(rejections)("never upgrades historical unknown to a first-known $status rejection", async rejection => {
      databaseFixture();
      const first = createBrowserMcpProjectPublicationRecovery(), other = createBrowserMcpProjectPublicationRecovery();
      await first.reserve(record());
      await other.markFailure(record());
      expect((await first.markFailure(record(), rejection))?.failure).toBeUndefined();
      expect(await first.compareClear({ ...record(), failure: rejection }, firstRejectionOnly)).toBe(false);
      expect(await first.read(record().subject)).toEqual(record());
    });

    it.each([retry, { status: 503, code: "mcp_project_publication_dependency_unavailable", retryable: true }])(
      "never upgrades a recorded $status uncertainty to a later explicit rejection", async uncertainty => {
        databaseFixture();
        const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
        await journal.markFailure(record(), uncertainty);
        expect((await journal.markFailure(record(), rejections[0]))?.failure).toBeUndefined();
        expect(await journal.compareClear({ ...record(), failure: rejections[0] }, firstRejectionOnly)).toBe(false);
      },
    );

    it.each([undefined, retry, inspect, rejections[1]])("tightens a first-known rejection when another outcome arrives: %j", async outcome => {
      databaseFixture();
      const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
      const rejected = (await journal.markFailure(record(), rejections[0]))!;
      await journal.markFailure(record(), outcome);
      expect(await journal.compareClear(rejected, firstRejectionOnly)).toBe(false);
      // Replaying the old failure callback must not recover the discarded first-attempt qualification.
      await journal.markFailure(record(), rejections[0]);
      expect(await journal.compareClear(rejected, firstRejectionOnly)).toBe(false);
    });

    it.each(rejections)("clears only the exact unchanged first-known $status tuple", async rejection => {
      databaseFixture();
      const journal = createBrowserMcpProjectPublicationRecovery(); await journal.reserve(record());
      const rejected = (await journal.markFailure(record(), rejection))!;
      expect(await journal.compareClear(record(), firstRejectionOnly)).toBe(false);
      const different = rejections.find(value => value.status !== rejection.status)!;
      expect(await journal.compareClear({ ...record(), failure: different }, firstRejectionOnly)).toBe(false);
      expect(await journal.compareClear(rejected, firstRejectionOnly)).toBe(true);
    });

    it("never resurrects a retired exact rejection from a queued stale unknown callback", async () => {
      databaseFixture();
      const first = createBrowserMcpProjectPublicationRecovery(), other = createBrowserMcpProjectPublicationRecovery();
      await first.reserve(record());
      const rejected = (await first.markFailure(record(), rejections[0]))!;
      await other.read(record().subject);
      expect(await Promise.all([first.compareClear(rejected, firstRejectionOnly), other.markFailure(record())])).toEqual([true, null]);
      expect(await first.read(record().subject)).toBeNull();
    });
  });

});
