import { z } from "zod";
import * as wire from "@/generated/bff-shared-tasks/zod.gen";
import { parseSharedTasksJson } from "./shared-tasks-json";

export const sharedTasksSchema = wire.zSharedTasksResponse
  .extend({
    data: wire.zSharedTasksResponse.shape.data
      .extend({ items: z.array(wire.zSharedTaskItem.strict()).max(100) })
      .strict(),
  })
  .strict();
export const shareAckSchema = wire.zShareReceiptResponse
  .extend({
    data: wire.zShareReceipt.strict(),
    meta: wire.zRequestMeta.strict(),
  })
  .strict();
export const sharedTasksErrors = Object.fromEntries(
  Object.entries({
    400: wire.zSharedTasksError400,
    401: wire.zSharedTasksError401,
    403: wire.zSharedTasksError403,
    429: wire.zSharedTasksError429,
    503: wire.zSharedTasksError503,
  }).map(([status, schema]) => [
    status,
    schema.extend({ error: schema.shape.error.strict() }).strict(),
  ]),
);
export const shareErrorSchema = wire.zErrorEnvelope
  .extend({
    error: wire.zErrorDetail.strict(),
    meta: wire.zRequestMeta.strict(),
  })
  .strict();
export type SharedTask = z.infer<typeof wire.zSharedTaskItem>;
export type SharedTasksPage = z.infer<typeof sharedTasksSchema>;
const cursorSchema = z
  .object({
    kind: z.literal("shared_tasks"),
    tenantId: z.string().min(1),
    subjectId: z.string().min(1),
    limit: z.number().int().min(1).max(100),
    sharedAt: wire.zSharedTaskItem.shape.shared_at,
    sessionId: z.string().min(1),
  })
  .strict();
export function sharedTasksCursor(
  value: string,
  subject: string,
  limit: number,
  tenant?: string,
) {
  if (value.length > 2048 || !/^sht1_[A-Za-z0-9_-]+$/u.test(value))
    throw new Error("Invalid cursor");
  const encoded = value.slice(5);
  const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
  if (
    btoa(binary)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "") !== encoded
  )
    throw new Error("Invalid cursor");
  const text = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  const cursor = cursorSchema.parse(parseSharedTasksJson(text));
  if (
    cursor.subjectId !== subject ||
    cursor.limit !== limit ||
    (tenant !== undefined && cursor.tenantId !== tenant)
  )
    throw new Error("Cursor binding");
  return cursor;
}
export function compareSharedTasks(a: SharedTask, b: SharedTask) {
  if (a.shared_at !== b.shared_at) return a.shared_at > b.shared_at ? -1 : 1;
  const x = new TextEncoder().encode(a.session_id),
    y = new TextEncoder().encode(b.session_id);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}
export function validateSharedTasks(
  raw: unknown,
  subject: string,
  limit: number,
  cursor?: string,
  tenant?: string,
): SharedTasksPage {
  const page = sharedTasksSchema.parse(raw);
  const items = page.data.items;
  if (
    items.some(
      (x) =>
        new Date(x.shared_at).toISOString() !== x.shared_at ||
        (x.expires_at !== null &&
          new Date(x.expires_at).toISOString() !== x.expires_at),
    )
  )
    throw new Error("Invalid timestamp");
  if (
    items.length > limit ||
    new Set(items.map((x) => x.session_id)).size !== items.length ||
    items.some((x, i) => i > 0 && compareSharedTasks(items[i - 1]!, x) >= 0)
  )
    throw new Error("Invalid page");
  const prior =
    cursor === undefined
      ? undefined
      : sharedTasksCursor(cursor, subject, limit, tenant);
  if (
    prior &&
    items.some(
      (x) =>
        compareSharedTasks(
          {
            session_id: prior.sessionId,
            shared_at: prior.sharedAt,
            title: "",
            expires_at: null,
          },
          x,
        ) >= 0,
    )
  )
    throw new Error("Invalid continuation");
  if (page.data.next_cursor !== null) {
    const next = sharedTasksCursor(
      page.data.next_cursor,
      subject,
      limit,
      tenant,
    );
    const last = items.at(-1);
    if (
      !last ||
      page.data.next_cursor === cursor ||
      next.sessionId !== last.session_id ||
      next.sharedAt !== last.shared_at ||
      (prior && next.tenantId !== prior.tenantId)
    )
      throw new Error("Invalid next cursor");
  }
  return page;
}
