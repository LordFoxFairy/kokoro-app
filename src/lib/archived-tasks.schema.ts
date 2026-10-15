import { z } from "zod";
import * as wire from "@/generated/bff-archived-tasks/zod.gen";
import { parseArchivedTasksJson } from "./archived-tasks-json";

export const archivedTasksSchema = wire.zArchivedTasksResponse
  .extend({
    data: wire.zArchivedTasksResponse.shape.data
      .extend({ items: z.array(wire.zArchivedTaskItem.strict()).max(100) })
      .strict(),
  })
  .strict();
export const archiveStateSchema = wire.zArchiveStateResponse.extend({data: wire.zArchiveStateResponse.shape.data.strict()}).strict();
export const archiveErrors = Object.fromEntries(Object.entries({400:wire.zArchiveError400,401:wire.zArchiveError401,403:wire.zArchiveError403,404:wire.zArchiveError404,409:wire.zArchiveError409,413:wire.zArchiveError413,415:wire.zArchiveError415,429:wire.zArchiveError429,500:wire.zArchiveError500,503:wire.zArchiveError503}).map(([status,schema])=>[status,schema.extend({error:schema.shape.error.strict()}).strict()]));
export type ArchiveState = z.infer<typeof archiveStateSchema>["data"];
export function archiveIdAvailable(id: string): boolean {
  if (!id || id === "." || id === "..") return false;
  try { return decodeURIComponent(encodeURIComponent(id)) === id; } catch { return false; }
}
export type ValidateArchiveStateInput = Readonly<{raw:unknown;id:string;action?:"archive"|"restore"}>;
export function validateArchiveState({raw,id,action}:ValidateArchiveStateInput): ArchiveState {
 const {data}=archiveStateSchema.parse(raw);
 if(data.session_id!==id || (data.archived_at!==null && new Date(data.archived_at).toISOString()!==data.archived_at) || (action==="archive" && data.archived_at===null) || (action==="restore" && data.archived_at!==null)) throw Error("Invalid archive binding");
 return data;
}
export type ArchivedTask = z.infer<typeof wire.zArchivedTaskItem>;
export type ArchivedTasksPage = z.infer<typeof archivedTasksSchema>;
const cursorSchema = z
  .object({
    kind: z.literal("archived_tasks"),
    tenantId: z.string().min(1),
    subjectId: z.string().min(1),
    limit: z.number().int().min(1).max(100),
    archivedAt: wire.zArchivedTaskItem.shape.archived_at,
    sessionId: z.string().min(1),
  })
  .strict();
export type ArchivedTasksCursorInput=Readonly<{value:string;subject:string;limit:number;tenant?:string}>;
export function archivedTasksCursor({value,subject,limit,tenant}:ArchivedTasksCursorInput) {
  if (value.length > 2048 || !/^arc1_[A-Za-z0-9_-]+$/u.test(value))
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
  const cursor = cursorSchema.parse(parseArchivedTasksJson(text));
  if (
    cursor.subjectId !== subject ||
    cursor.limit !== limit ||
    (tenant !== undefined && cursor.tenantId !== tenant)
  )
    throw new Error("Cursor binding");
  return cursor;
}
export function compareArchivedTasks(a: ArchivedTask, b: ArchivedTask) {
  if (a.archived_at !== b.archived_at) return a.archived_at > b.archived_at ? -1 : 1;
  const x = new TextEncoder().encode(a.session_id),
    y = new TextEncoder().encode(b.session_id);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}
export type ValidateArchivedTasksInput=Readonly<{raw:unknown;subject:string;limit:number;cursor?:string;tenant?:string}>;
export function validateArchivedTasks({raw,subject,limit,cursor,tenant}:ValidateArchivedTasksInput):ArchivedTasksPage {
  const page = archivedTasksSchema.parse(raw);
  const items = page.data.items;
  if (
    items.some(
      (x) =>
        new Date(x.archived_at).toISOString() !== x.archived_at,
    )
  )
    throw new Error("Invalid timestamp");
  if (
    items.length > limit ||
    new Set(items.map((x) => x.session_id)).size !== items.length ||
    items.some((x, i) => i > 0 && compareArchivedTasks(items[i - 1]!, x) >= 0)
  )
    throw new Error("Invalid page");
  const prior =
    cursor === undefined
      ? undefined
      : archivedTasksCursor({value:cursor,subject:subject,limit:limit,...(tenant===undefined?{}:{tenant:tenant})});
  if (
    prior &&
    items.some(
      (x) =>
        compareArchivedTasks(
          {
            session_id: prior.sessionId,
            archived_at: prior.archivedAt,
            title: "",
            project_ref: null,
          },
          x,
        ) >= 0,
    )
  )
    throw new Error("Invalid continuation");
  if (page.data.next_cursor !== null) {
    const next = archivedTasksCursor({value:page.data.next_cursor,subject:subject,limit:limit,...(tenant===undefined?{}:{tenant:tenant})});
    const last = items.at(-1);
    if (
      !last ||
      page.data.next_cursor === cursor ||
      next.sessionId !== last.session_id ||
      next.archivedAt !== last.archived_at ||
      (prior && next.tenantId !== prior.tenantId)
    )
      throw new Error("Invalid next cursor");
  }
  return page;
}
