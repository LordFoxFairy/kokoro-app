import { describe, expect, it, vi } from "vitest";
import { createKnowledgeSession } from "@/ui/settings/knowledge/session";
import { KnowledgeClientError } from "@/ui/settings/personal-knowledge-client";
const boundary = { subject: "actor-a", admitted: true, generation: 1 };
const fields = { name: "规则", whenToUse: "写作", content: "原始正文" };
const row = {
  ...fields,
  knowledgeId: "a1234567-1234-4123-8123-123456789012",
  revision: 1,
  createdAt: "2026-10-18T12:00:00.000Z",
  updatedAt: "2026-10-18T12:00:00.000Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const api = {
    listKnowledge: vi.fn().mockResolvedValue({ items: [], maxItems: 100 }),
    readKnowledgeUsage: vi
      .fn()
      .mockResolvedValue({ enabled: false, revision: 0 }),
    getKnowledge: vi.fn().mockResolvedValue(row),
    replaceKnowledge: vi.fn().mockResolvedValue(row),
    removeKnowledge: vi.fn().mockResolvedValue(undefined),
    replaceKnowledgeUsage: vi
      .fn()
      .mockResolvedValue({ enabled: true, revision: 1 }),
  };
  return { api, session: createKnowledgeSession(boundary, api) };
}
describe("actor-scoped knowledge lifecycle", () => {
  it("confirms creation through an exact read and independently saves usage", async () => {
    const { session, api } = fixture();
    await session.load();
    expect(await session.replace(row.knowledgeId, fields, 0)).toBe(true);
    expect(api.getKnowledge).toHaveBeenCalledWith(
      row.knowledgeId,
      expect.any(AbortSignal),
    );
    expect(session.getSnapshot().items).toEqual([row]);
    api.readKnowledgeUsage.mockResolvedValueOnce({
      enabled: true,
      revision: 1,
    });
    expect(await session.setUsage(true)).toBe(true);
    expect(session.getSnapshot().usage).toEqual({ enabled: true, revision: 1 });
  });
  it("does not resend an unknown creation or accept a read older than its possible commit", async () => {
    const { session, api } = fixture();
    await session.load();
    api.replaceKnowledge.mockRejectedValueOnce(new TypeError("ack lost"));
    expect(await session.replace(row.knowledgeId, fields, 0)).toBe(false);
    api.getKnowledge.mockRejectedValueOnce(
      new KnowledgeClientError("not found", 404, "knowledge_not_found"),
    );
    expect(await session.verify()).toBe(false);
    expect(session.getSnapshot().pending?.phase).toBe("unconfirmed");
    expect(await session.replace(row.knowledgeId, fields, 0)).toBe(false);
    expect(api.replaceKnowledge).toHaveBeenCalledTimes(1);
    expect(await session.verify()).toBe(true);
    expect(session.getSnapshot().pending).toBeNull();
  });
  it("preserves an acknowledged command when the confirming read fails", async () => {
    const { session, api } = fixture();
    await session.load();
    api.getKnowledge.mockRejectedValueOnce(new TypeError("offline"));
    expect(await session.replace(row.knowledgeId, fields, 0)).toBe(false);
    expect(session.getSnapshot().pending?.phase).toBe("unconfirmed");
    expect(await session.verify()).toBe(true);
    expect(api.replaceKnowledge).toHaveBeenCalledTimes(1);
  });
  it("keeps conflict drafts frozen until current facts are read and explicitly adopted", async () => {
    const { session, api } = fixture();
    api.listKnowledge.mockResolvedValue({ items: [row], maxItems: 100 });
    await session.load();
    api.replaceKnowledge.mockRejectedValueOnce(
      new KnowledgeClientError("changed", 409, "knowledge_revision_conflict"),
    );
    await session.replace(row.knowledgeId, { ...fields, content: "draft" }, 1);
    const newer = { ...row, content: "other session", revision: 2 };
    api.getKnowledge.mockResolvedValue(newer);
    expect(await session.verify()).toBe(false);
    expect(session.getSnapshot().pending?.phase).toBe("conflict");
    expect(session.getSnapshot().pending?.intent).toMatchObject({
      fields: { content: "draft" },
    });
    expect(session.adoptCurrent()).toBe(true);
    expect(session.getSnapshot().items).toEqual([newer]);
    expect(api.replaceKnowledge).toHaveBeenCalledTimes(1);
  });
  it("allows explicit recovery after a definitive rejection without treating it as a committed write", async () => {
    const { session, api } = fixture();
    await session.load();
    api.replaceKnowledge.mockRejectedValueOnce(
      new KnowledgeClientError("limited", 429, "session_rate_limited"),
    );
    await session.replace(row.knowledgeId, fields, 0);
    api.getKnowledge.mockRejectedValueOnce(
      new KnowledgeClientError("absent", 404, "knowledge_not_found"),
    );
    expect(await session.verify()).toBe(false);
    expect(session.adoptCurrent()).toBe(true);
    expect(api.replaceKnowledge).toHaveBeenCalledTimes(1);
  });
  it("retires in-flight reads and unknown writes across recheck and actor replacement", async () => {
    const { session, api } = fixture();
    await session.load();
    const ack = deferred<typeof row>();
    api.replaceKnowledge.mockReturnValueOnce(ack.promise);
    const write = session.replace(row.knowledgeId, fields, 0);
    session.bind({ ...boundary, admitted: false, generation: 2 });
    ack.resolve(row);
    expect(await write).toBe(false);
    expect(session.getSnapshot().pending?.phase).toBe("unconfirmed");
    session.bind({ ...boundary, generation: 3 });
    expect(await session.replace(row.knowledgeId, fields, 0)).toBe(false);
    await session.load();
    await session.verify();
    session.bind({ subject: "actor-b", admitted: true, generation: 4 });
    expect(session.getSnapshot().items).toBeNull();
    expect(session.getSnapshot().pending).toBeNull();
    expect(await session.replace(row.knowledgeId, fields, 0)).toBe(false);
  });
  it("offers recovery instead of a blank disabled panel when a read times out", async () => {
    vi.useFakeTimers();
    try {
      const { session, api } = fixture();
      api.listKnowledge.mockImplementation(
        (_query, signal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener(
              "abort",
              () => reject(new Error("timeout")),
              { once: true },
            ),
          ),
      );
      const read = session.load();
      await vi.advanceTimersByTimeAsync(15001);
      await read;
      expect(session.getSnapshot()).toMatchObject({
        loading: false,
        itemsReady: false,
        message: "loadFailed",
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps a timed-out late ACK recoverable instead of leaving saving stuck", async () => {
    vi.useFakeTimers();
    try {
      const { session, api } = fixture();
      await session.load();
      const ack = deferred<typeof row>();
      api.replaceKnowledge.mockReturnValueOnce(ack.promise);
      const write = session.replace(row.knowledgeId, fields, 0);
      await vi.advanceTimersByTimeAsync(15001);
      ack.resolve(row);
      expect(await write).toBe(false);
      expect(session.getSnapshot().pending?.phase).toBe("unconfirmed");
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not race a confirming read against a collection refresh", async () => {
    const { session, api } = fixture();
    await session.load();
    api.replaceKnowledge.mockRejectedValueOnce(new TypeError("lost"));
    await session.replace(row.knowledgeId, fields, 0);
    const list = deferred<{ items: (typeof row)[]; maxItems: 100 }>();
    api.listKnowledge.mockReturnValueOnce(list.promise);
    const read = session.load();
    expect(await session.verify()).toBe(false);
    expect(api.getKnowledge).not.toHaveBeenCalled();
    list.resolve({ items: [], maxItems: 100 });
    await read;
    expect(await session.verify()).toBe(true);
    expect(session.getSnapshot().items).toEqual([row]);
  });
  it("treats a confirmed absent delete as complete, never a failed list as empty", async () => {
    const { session, api } = fixture();
    api.listKnowledge.mockResolvedValue({ items: [row], maxItems: 100 });
    await session.load();
    api.removeKnowledge.mockRejectedValueOnce(new TypeError("lost"));
    await session.remove(row);
    api.getKnowledge.mockRejectedValueOnce(
      new KnowledgeClientError("gone", 404, "knowledge_not_found"),
    );
    expect(await session.verify()).toBe(true);
    expect(session.getSnapshot().items).toEqual([]);
    api.listKnowledge.mockRejectedValueOnce(new TypeError("offline"));
    await session.load();
    expect(session.getSnapshot().itemsReady).toBe(false);
    expect(session.getSnapshot().message).toBe("loadFailed");
    expect(api.removeKnowledge).toHaveBeenCalledTimes(1);
  });
});
