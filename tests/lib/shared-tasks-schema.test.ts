import { expect, it } from "vitest";
import { parseSharedTasksJson } from "@/lib/shared-tasks-json";
import {
  validateSharedTasks,
  sharedTasksCursor,
} from "@/lib/shared-tasks.schema";
const item = {
  session_id: "opaque/old",
  title: " \ud800 ",
  shared_at: "2026-10-15T00:00:00.000Z",
  expires_at: null,
};
const encode = (value: unknown) =>
  "sht1_" + Buffer.from(JSON.stringify(value)).toString("base64url");
const facts = {
  kind: "shared_tasks",
  tenantId: "tenant",
  subjectId: "alice",
  limit: 100,
  sharedAt: item.shared_at,
  sessionId: item.session_id,
};
it("preserves opaque IDs and historical title code units in a closed legal page", () =>
  expect(
    validateSharedTasks(
      { data: { items: [item], next_cursor: encode(facts) } },
      "alice",
      100,
      undefined,
      "tenant",
    ).data.items[0],
  ).toEqual(item));
it.each(['{"data":{},"d\\u0061ta":{}}', "\ufeff{}", "{}{}", '{"x":1,}'])(
  "rejects raw JSON evidence %j",
  (raw) => expect(() => parseSharedTasksJson(raw)).toThrow(),
);
it.each([
  { ...facts, tenantId: "foreign" },
  { ...facts, subjectId: "foreign" },
  { ...facts, limit: 25 },
  { ...facts, unknown: true },
])("rejects cursor binding or unknown field %j", (facts) =>
  expect(() =>
    sharedTasksCursor(encode(facts), "alice", 100, "tenant"),
  ).toThrow(),
);
it.each([
  { data: { items: [{ ...item, url: "secret" }], next_cursor: null } },
  { data: { items: [item, item], next_cursor: null } },
  { data: { items: [], next_cursor: encode(facts) } },
  {
    data: {
      items: [item],
      next_cursor: encode({ ...facts, sessionId: "wrong" }),
    },
  },
])("rejects unsafe or inconsistent page %j", (raw) =>
  expect(() =>
    validateSharedTasks(raw, "alice", 100, undefined, "tenant"),
  ).toThrow(),
);
it("enforces PostgreSQL C byte ordering instead of UTF16 order", () => {
  const a = { ...item, session_id: "\ue000" },
    b = { ...item, session_id: "\u{10000}" };
  expect(() =>
    validateSharedTasks(
      { data: { items: [a, b], next_cursor: null } },
      "alice",
      100,
    ),
  ).not.toThrow();
  expect(() =>
    validateSharedTasks(
      { data: { items: [b, a], next_cursor: null } },
      "alice",
      100,
    ),
  ).toThrow();
});
