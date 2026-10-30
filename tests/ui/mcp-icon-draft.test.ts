import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createMcpIconDraft } from "@/ui/mcp/mcp-icon-draft";
import { HubClientError } from "@/hub/client";
import type { McpIconClient } from "@/hub/mcp-icon-client";

const id = "12345678-1234-1234-1234-123456789abc";
const at = new Date(Date.now() + 60_000).toISOString();
const intent = { intent_id: id, state: "ready" as const, state_version: "3", filename: "icon.png", mime_type: "image/png" as const, content_sha256: "a".repeat(64), size_bytes: "8", expires_at: at, expired: false, width: 24, height: 24, created_at: at, updated_at: at };
const preview = { url: "https://storage.example/preview?signature=ephemeral", method: "GET" as const, required_headers: {}, expires_at: at };
const boundary = { subject: "actor-one", admitted: true, generation: 1 };
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
function fixture() {
  vi.stubGlobal("crypto", webcrypto);
  const client = {
    begin: vi.fn(async () => ({ intent: { ...intent, state: "staged" as const, state_version: "1", width: undefined, height: undefined }, replayed: false, upload_reference: { ...preview, method: "PUT" as const, url: "https://storage.example/upload?signature=ephemeral" } })),
    complete: vi.fn(async () => ({ intent, replayed: false })), get: vi.fn<McpIconClient["get"]>(async () => ({ intent, preview_reference: preview })),
    importUrl: vi.fn(async () => ({ intent, replayed: false })), cancel: vi.fn(async () => ({ intent: { ...intent, state: "released" as const, state_version: "5" }, replayed: false })),
  } satisfies McpIconClient;
  let n = 0; const draft = createMcpIconDraft(client, boundary.subject, () => `key-${++n}`); draft.setBoundary(boundary);
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200, headers: { "x-amz-version-id": "fixed-object-version" } })); vi.stubGlobal("fetch", fetch);
  return { client, draft, fetch, file: { name: "icon.png", type: "image/png", size: png.byteLength, arrayBuffer: async () => Uint8Array.from(png).buffer } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("rejects invalid local metadata before retiring the current draft or starting I/O", async () => {
  const f = fixture(); await f.draft.chooseUrl("https://images.example/first.png");
  expect(await f.draft.chooseFile({ ...f.file, name: " x.png" })).toBe(false);
  expect(f.draft.getSnapshot().kind).toBe("error");
  expect(f.client.cancel).not.toHaveBeenCalled(); expect(f.client.begin).not.toHaveBeenCalled();
  expect(await f.draft.chooseFile(f.file)).toBe(true);
});

it("selecting a file stages only an icon, uploads exact bytes without credentials, and exposes only a ready selector", async () => {
  const f = fixture();
  expect(await f.draft.chooseFile(f.file)).toBe(true);
  expect(f.client.begin).toHaveBeenCalledTimes(1); expect(f.client.complete).toHaveBeenCalledTimes(1);
  const init = f.fetch.mock.calls[0]![1] as RequestInit;
  expect(init.credentials).toBe("omit"); expect(init.redirect).toBe("error"); expect(init.method).toBe("PUT");
  expect(f.draft.change()).toEqual({ icon: { intent_id: id, expected_state_version: "3" } });
  expect(f.draft.getSnapshot().preview).toEqual(preview);
  expect(f.draft.canSave()).toBe(true);
});

it("unknown Complete resumes the same key/body/CAS, never uploads a second version or clears uncertainty on later 400", async () => {
  const f = fixture();
  f.client.complete.mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null));
  expect(await f.draft.chooseFile(f.file)).toBe(false);
  expect(f.draft.getSnapshot().kind).toBe("unknown");
  f.client.complete.mockRejectedValueOnce(new HubClientError("http", "rejected", "invalid_mcp_personal_request", 400));
  expect(await f.draft.retry()).toBe(false);
  expect(f.draft.getSnapshot().kind).toBe("unknown");
  expect(await f.draft.chooseUrl("https://images.example/replacement.png")).toBe(false);
  expect(await f.draft.retry()).toBe(true);
  expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.client.begin).toHaveBeenCalledTimes(1);
  const calls = f.client.complete.mock.calls as unknown as unknown[][];
  expect(calls).toHaveLength(3); expect(calls[1]!.slice(0, 3)).toEqual(calls[0]!.slice(0, 3)); expect(calls[2]!.slice(0, 3)).toEqual(calls[0]!.slice(0, 3));
});

it("known ready close issues one Cancel that survives form cleanup, while a submitted save never gets cancelled", async () => {
  const f = fixture(); await f.draft.chooseUrl("https://images.example/icon.png");
  f.draft.cancel(); f.draft.suspend();
  expect(f.client.cancel).toHaveBeenCalledTimes(1);
  const signal = (f.client.cancel.mock.calls as unknown as unknown[][])[0]![3] as AbortSignal;
  expect(signal.aborted).toBe(false);
  const g = fixture(); await g.draft.chooseUrl("https://images.example/icon.png"); g.draft.protectForSave(); g.draft.cancel(); g.draft.suspend();
  expect(g.client.cancel).not.toHaveBeenCalled();
});

it("read failure after a confirmed import retries only Get; an invalid write ACK remains inspect-owner", async () => {
  const f = fixture(); f.client.get.mockRejectedValueOnce(new HubClientError("parse", "bad read", null, 200));
  expect(await f.draft.chooseUrl("https://images.example/icon.png")).toBe(false);
  expect(await f.draft.retry()).toBe(true); expect(f.client.importUrl).toHaveBeenCalledTimes(1); expect(f.client.get).toHaveBeenCalledTimes(2);
  const g = fixture(); g.client.importUrl.mockRejectedValueOnce(new HubClientError("parse", "bad ACK", null, 200));
  expect(await g.draft.chooseUrl("https://images.example/icon.png")).toBe(false); expect(g.draft.getSnapshot().mayRetry).toBe(false);
  expect(await g.draft.retry()).toBe(false); expect(g.client.importUrl).toHaveBeenCalledTimes(1);
});

it("same-actor admission change masks late ACK and forbids cross-actor new I/O; explicit resume preserves the original URL key", async () => {
  const f = fixture(); let release!: (v: { intent: typeof intent; replayed: boolean }) => void;
  f.client.importUrl.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.draft.chooseUrl("https://images.example/icon.png");
  await vi.waitFor(() => expect(f.client.importUrl).toHaveBeenCalledTimes(1));
  f.draft.setBoundary({ ...boundary, admitted: false, generation: 2 }); release({ intent, replayed: false });
  expect(await pending).toBe(false); expect(f.client.get).not.toHaveBeenCalled();
  f.draft.setBoundary({ subject: "other-actor", admitted: true, generation: 3 }); expect(await f.draft.retry()).toBe(false);
  f.draft.setBoundary({ ...boundary, generation: 4 }); expect(await f.draft.retry()).toBe(true);
  const calls = f.client.importUrl.mock.calls as unknown as unknown[][];
  expect(calls).toHaveLength(2); expect(calls[1]!.slice(0, 2)).toEqual(calls[0]!.slice(0, 2));
});

it("replacement releases the old unbound icon before importing the new one; confirmed binding is never cancelled", async () => {
  const f = fixture(); await f.draft.chooseUrl("https://images.example/first.png");
  await f.draft.chooseUrl("https://images.example/second.png");
  expect(f.client.cancel).toHaveBeenCalledTimes(1); expect(f.client.importUrl).toHaveBeenCalledTimes(2);
  f.draft.protectForSave(); f.draft.confirmed(); f.draft.projected();
  expect(f.draft.change()).toEqual({}); await f.draft.remove(); expect(f.client.cancel).toHaveBeenCalledTimes(1); expect(f.draft.change()).toEqual({ clear_icon: true });
});

it("owner-retiring drafts do not send a new cancel and do not prevent replacement", async () => {
  const f = fixture(); await f.draft.chooseUrl("https://images.example/first.png");
  f.client.get.mockResolvedValueOnce({ intent: { ...intent, state: "retiring" } });
  expect(await f.draft.chooseUrl("https://images.example/second.png")).toBe(true);
  expect(f.client.cancel).not.toHaveBeenCalled(); expect(f.client.importUrl).toHaveBeenCalledTimes(2);
});

it("confirmed import followed by known expiry releases the local selection and permits a fresh choice", async () => {
  const f = fixture(); f.client.get.mockResolvedValueOnce({ intent: { ...intent, expired: true } });
  expect(await f.draft.chooseUrl("https://images.example/first.png")).toBe(false);
  expect(f.draft.getSnapshot()).toMatchObject({ kind: "error", mayRetry: false, dirty: false });
  expect(await f.draft.chooseUrl("https://images.example/second.png")).toBe(true);
  expect(f.client.importUrl).toHaveBeenCalledTimes(2);
});

it("confirmed ready expiry notifies the editor without I/O and permits a fresh selection", async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse(at) - 1000);
  const f = fixture(); await f.draft.chooseUrl("https://images.example/first.png");
  const notify = vi.fn(); f.draft.subscribe(notify);
  await vi.advanceTimersByTimeAsync(1001);
  expect(f.draft.getSnapshot()).toMatchObject({ kind: "error", failure: "expired", dirty: false, mayRetry: false });
  expect(notify).toHaveBeenCalled();
  expect(f.draft.change()).toEqual({}); expect(f.draft.canSave()).toBe(false);
  expect(f.client.importUrl).toHaveBeenCalledTimes(1); expect(f.client.get).toHaveBeenCalledTimes(1);
  expect(f.client.cancel).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  const expires = new Date(Date.now() + 60_000).toISOString();
  const fresh = { ...intent, intent_id: "22345678-1234-1234-1234-123456789abc", expires_at: expires };
  f.client.importUrl.mockResolvedValueOnce({ intent: fresh, replayed: false });
  f.client.get.mockResolvedValueOnce({ intent: fresh, preview_reference: { ...preview, expires_at: expires } });
  expect(await f.draft.chooseUrl("https://images.example/second.png")).toBe(true);
  expect(f.draft.canSave()).toBe(true);
  f.draft.suspend();
});

it.each(["suspend", "generation", "subject"] as const)("ready expiry stops with %s retirement and reevaluates on admission", async reason => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse(at) - 1000);
  const f = fixture(); await f.draft.chooseUrl("https://images.example/icon.png");
  const notify = vi.fn(); f.draft.subscribe(notify);
  if (reason === "suspend") f.draft.suspend();
  else f.draft.setBoundary({ subject: reason === "subject" ? "another-actor" : boundary.subject, admitted: false, generation: 2 });
  await vi.advanceTimersByTimeAsync(1001);
  expect(notify).not.toHaveBeenCalled();
  expect(f.draft.getSnapshot().kind).toBe("ready");
  f.draft.setBoundary({ ...boundary, generation: 3 });
  expect(f.draft.getSnapshot()).toMatchObject({ kind: "error", failure: "expired", dirty: false });
  expect(f.client.cancel).not.toHaveBeenCalled(); expect(f.client.get).toHaveBeenCalledTimes(1);
});

it("ready expiry never retires the original selector handed to an unknown save, and confirmation clears its timer", async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse(at) - 1000);
  const f = fixture(); await f.draft.chooseUrl("https://images.example/icon.png");
  const original = f.draft.change();
  f.draft.protectForSave(); f.draft.setSaveLocked(true);
  const notify = vi.fn(); f.draft.subscribe(notify);
  await vi.advanceTimersByTimeAsync(1001);
  expect(f.draft.getSnapshot().kind).toBe("ready"); expect(f.draft.change()).toEqual(original);
  expect(notify).not.toHaveBeenCalled(); f.draft.cancel(); expect(f.client.cancel).not.toHaveBeenCalled();
  f.draft.confirmed(); notify.mockClear();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.draft.getSnapshot()).toMatchObject({ kind: "idle", dirty: false });
  expect(f.draft.change()).toEqual({}); expect(notify).not.toHaveBeenCalled();
});

it("only a rejected save unlock reevaluates the handed-off ready deadline", async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse(at) - 1000);
  const f = fixture(); await f.draft.chooseUrl("https://images.example/icon.png");
  f.draft.protectForSave(); f.draft.setSaveLocked(true);
  await vi.advanceTimersByTimeAsync(1001);
  expect(f.draft.getSnapshot().kind).toBe("ready");
  f.draft.setSaveLocked(false);
  expect(f.draft.getSnapshot()).toMatchObject({ kind: "error", failure: "expired", dirty: false });
  expect(f.draft.change()).toEqual({}); expect(f.client.cancel).not.toHaveBeenCalled();
});
