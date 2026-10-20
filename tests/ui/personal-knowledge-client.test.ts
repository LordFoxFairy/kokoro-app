import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listKnowledge,
  getKnowledge,
  replaceKnowledge,
  removeKnowledge,
  readKnowledgeUsage,
  replaceKnowledgeUsage,
} from "@/ui/settings/personal-knowledge-client";

const id = "a1234567-1234-4123-8123-123456789012";
const fields = {
  name: " 规则 🌱 ",
  whenToUse: "写文档时",
  content: "保留原文\n第二行",
};
const item = {
  knowledge_id: id,
  name: fields.name,
  when_to_use: fields.whenToUse,
  content: fields.content,
  revision: 1,
  created_at: "2026-10-18T12:00:00.000Z",
  updated_at: "2026-10-18T12:00:00.000Z",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
const setup = (...responses: Response[]) => {
  const f = vi.fn();
  responses.forEach((r) => f.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());

describe("personal knowledge client", () => {
  it("reads complete bounded results and independent usage without caching or identity selectors", async () => {
    const f = setup(
      reply({ items: [item], max_items: 100 }),
      reply({ enabled: false, revision: 0 }),
    );
    expect(await listKnowledge("% 🌱")).toEqual({
      items: [
        {
          knowledgeId: id,
          ...fields,
          revision: 1,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        },
      ],
      maxItems: 100,
    });
    expect(await readKnowledgeUsage()).toEqual({ enabled: false, revision: 0 });
    expect(f.mock.calls[0]?.[0]).toBe(
      "/api/hub/preferences/knowledge?query=%25+%F0%9F%8C%B1",
    );
    expect(f.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(f.mock.calls[1]?.[0]).toBe("/api/hub/preferences/knowledge-usage");
  });
  it("preserves text and binds creation to exact resource and CAS", async () => {
    const f = setup(reply(item, 201));
    expect(await replaceKnowledge(id, fields, 0)).toMatchObject({
      knowledgeId: id,
      ...fields,
      revision: 1,
    });
    expect(JSON.parse(f.mock.calls[0]?.[1].body)).toEqual({
      name: fields.name,
      when_to_use: fields.whenToUse,
      content: fields.content,
      expected_revision: 0,
    });
    expect(f.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "content-type": "application/json" },
    });
    expect(
      new Headers(f.mock.calls[0]?.[1].headers).has("idempotency-key"),
    ).toBe(false);
  });
  it("keeps DELETE CAS body and accepts only empty 204", async () => {
    const f = setup(new Response(null, { status: 204 }));
    await removeKnowledge(id, 1);
    expect(f.mock.calls[0]?.[1]).toMatchObject({
      method: "DELETE",
      body: JSON.stringify({ expected_revision: 1 }),
    });
    setup(reply({}, 200));
    await expect(removeKnowledge(id, 1)).rejects.toMatchObject({ code: null });
  });
  it.each([
    { ...item, knowledge_id: "b1234567-1234-4123-8123-123456789012" },
    { ...item, revision: 2 },
    { ...item, content: "different" },
    { ...item, tenant_id: "injected" },
  ])("rejects a wrong creation ACK %#", async (data) => {
    setup(reply(data, 201));
    await expect(replaceKnowledge(id, fields, 0)).rejects.toMatchObject({
      code: null,
    });
  });
  it("validates detail selector, update ACK and independent usage CAS", async () => {
    setup(
      reply({ ...item, revision: 2 }),
      reply(item),
      reply({ enabled: true, revision: 1 }),
    );
    expect(await replaceKnowledge(id, fields, 1)).toMatchObject({
      revision: 2,
    });
    expect(await getKnowledge(id)).toMatchObject({ knowledgeId: id });
    expect(await replaceKnowledgeUsage(true, 0)).toEqual({
      enabled: true,
      revision: 1,
    });
    setup(reply({ enabled: false, revision: 1 }));
    await expect(replaceKnowledgeUsage(true, 0)).rejects.toMatchObject({
      code: null,
    });
  });
  it.each([
    { items: [item, item], max_items: 100 },
    { items: [], max_items: 200 },
    { items: [{ ...item, revision: 0 }], max_items: 100 },
    { items: [{ ...item, name: "\ud800" }], max_items: 100 },
    {
      items: [{ ...item, created_at: "2026-10-19T12:00:00.000Z" }],
      max_items: 100,
    },
    { items: [], max_items: 100, next_cursor: "invented" },
  ])("rejects malformed collections %#", async (data) => {
    setup(reply(data));
    await expect(listKnowledge()).rejects.toMatchObject({ code: null });
  });
  it("validates scalar boundaries before I/O without trimming", async () => {
    const f = setup(reply({ ...item, name: "🌱".repeat(500) }, 201));
    await replaceKnowledge(id, { ...fields, name: "🌱".repeat(500) }, 0);
    f.mockClear();
    for (const invalid of ["", "  ", "\u0000", "\ud800", "🌱".repeat(501)])
      await expect(
        replaceKnowledge(id, { ...fields, name: invalid }, 0),
      ).rejects.toMatchObject({ status: 0 });
    await expect(getKnowledge(id.toUpperCase())).rejects.toMatchObject({
      status: 0,
    });
    await expect(removeKnowledge(id, 0)).rejects.toMatchObject({ status: 0 });
    await expect(listKnowledge("x".repeat(501))).rejects.toMatchObject({
      status: 0,
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("surfaces unknown writes once without resending and rejects impossible error tuples", async () => {
    const f = setup(
      new Response(
        JSON.stringify({
          error: {
            code: "knowledge_save_unknown",
            message: "Unconfirmed",
            retryable: false,
          },
        }),
        { status: 503 },
      ),
    );
    await expect(replaceKnowledge(id, fields, 0)).rejects.toMatchObject({
      status: 503,
      code: "knowledge_save_unknown",
    });
    expect(f).toHaveBeenCalledTimes(1);
    setup(
      new Response(
        JSON.stringify({
          error: {
            code: "knowledge_save_unknown",
            message: "bad",
            retryable: true,
          },
        }),
        { status: 503 },
      ),
    );
    await expect(replaceKnowledge(id, fields, 0)).rejects.toMatchObject({
      code: null,
    });
  });
  it("rejects duplicate JSON response keys even when the final value matches", async () => {
    setup(
      new Response(
        JSON.stringify({ data: item }).replace(
          '"revision":1',
          '"revision":99,"revision":1',
        ),
        { status: 201 },
      ),
    );
    await expect(replaceKnowledge(id, fields, 0)).rejects.toMatchObject({
      code: null,
    });
  });
  it("passes cancellation and never treats dependency failure as an empty list", async () => {
    const c = new AbortController();
    const f = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", f);
    await expect(listKnowledge("", c.signal)).rejects.toThrow("offline");
    expect(f.mock.calls[0]?.[1].signal).toBe(c.signal);
  });
});
