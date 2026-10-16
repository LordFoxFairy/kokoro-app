import { createClient } from "@/generated/bff-archived-tasks/client";
import * as sdk from "@/generated/bff-archived-tasks/sdk.gen";
import { parseArchivedTasksJson } from "@/lib/archived-tasks-json";
import { archiveErrors, archiveIdAvailable, validateArchiveState, validateArchivedTasks } from "@/lib/archived-tasks.schema";

type Command = Readonly<{ id: string; action: "archive" | "restore"; key: string }>;
type ArchiveRequestInput=Readonly<{subject:string;cursor?:string;command?:Command;id?:string;signal?:AbortSignal}>;
export type ReadArchivedTasksInput=Readonly<{subject:string;cursor?:string;signal?:AbortSignal}>;
export type ReadArchiveStateInput=Readonly<{id:string;signal?:AbortSignal}>;
export type WriteArchiveStateInput=Readonly<{id:string;action:"archive"|"restore";signal?:AbortSignal}>;
async function requestArchive({subject,cursor,command,id,signal}:ArchiveRequestInput) {
  const controller = new AbortController(), deadline = performance.now() + 10_000;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, response: Response | undefined, retired = false, reject!: (error: unknown) => void;
  const cancelled = new Promise<never>((_, no) => { reject = no; });
  const stop = () => {
    controller.abort();
    if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch {} reader = undefined; }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined);
  };
  const abort = () => { stop(); reject(Error("archive_unknown")); };
  const timer = setTimeout(abort, 10_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const check = () => { if (retired || controller.signal.aborted || performance.now() >= deadline) throw Error("archive_unknown"); };
  const target = command?.id ?? id;
  const transport: typeof fetch = async () => {
    check();
    if (target !== undefined && !archiveIdAvailable(target)) throw Error("archive_id_unavailable");
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    const url = target === undefined ? `/api/account/archived-tasks?${query}` : `/api/session/sessions/${encodeURIComponent(target)}/${command?.action ?? "archive"}`;
    response = await fetch(url, { method: command ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      ...(command ? { headers: { "content-type": "application/json", "idempotency-key": command.key }, body: "{}" } : {}) });
    if (retired || controller.signal.aborted) { stop(); check(); }
    check();
    if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "") || !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(response.headers.get("cache-control") ?? "") || response.headers.has("location") || response.headers.has("set-cookie") || !response.headers.get("x-request-id") || response.headers.get("x-request-id")!.length > 256) throw Error("archive_response_invalid");
    let bytes = 0, text = "";
    response.headers.forEach((v, k) => { bytes += new TextEncoder().encode(`${k}: ${v}\r\n`).length; });
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (bytes > 1_048_576) throw Error("archive_response_invalid");
    if (response.body) {
      reader = response.body.getReader();
      for (;;) { const part = await reader.read(); check(); if (part.done) break; bytes += part.value.length; if (bytes > 1_048_576) throw Error("archive_response_invalid"); text += decoder.decode(part.value, { stream: true }); }
      text += decoder.decode(); reader.releaseLock(); reader = undefined;
    }
    const retry = response.headers.get("retry-after");
    if (retry !== null && (response.status !== 429 || !/^[1-9]\d{0,4}$/u.test(retry) || Number(retry) > 86400)) throw Error("archive_response_invalid");
    const raw = parseArchivedTasksJson(text);
    if (response.status !== 200) {
      const allowed=target===undefined?[400,401,403,429,500,503]:command?[400,401,403,404,409,413,415,429,500,503]:[400,401,403,404,429,500,503];
      if(!allowed.includes(response.status))throw Error("archive_response_invalid");
      const error = archiveErrors[response.status]?.parse(raw);
      if (!error) throw Error("archive_response_invalid");
      throw Object.assign(Error(error.error.code), { status: response.status });
    }
    const output = target === undefined ? validateArchivedTasks({raw:raw,subject:subject,limit:100,...(cursor===undefined?{}:{cursor:cursor})}) : { data: validateArchiveState({raw,id:target,...(command?{action:command.action}:{})}) };
    check();
    return Response.json(output);
  };
  const operation = async () => {
    const client = createClient({ baseUrl: "http://localhost", fetch: transport });
    const result = command ? await (command.action === "archive" ? sdk.archiveSession : sdk.restoreSession)({ client, path: { session_id: command.id }, body: {}, headers: { "Idempotency-Key": command.key } }) : id !== undefined ? await sdk.getSessionArchiveState({ client, path: { session_id: id } }) : await sdk.listOwnedArchivedTasks({ client, query: { limit: 100, ...(cursor === undefined ? {} : { cursor }) } });
    check();
    // The SDK's normal transport may return an error field instead of throwing.
    if (!result.data) throw result.error ?? Error("archive_unknown");
    return result.data;
  };
  try { return await Promise.race([cancelled, operation()]); }
  finally { retired = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); stop(); }
}
export async function readArchivedTasks(input:ReadArchivedTasksInput) {
  const {subject,cursor}=input;
  return validateArchivedTasks({raw:await requestArchive(input),subject:subject,limit:100,...(cursor===undefined?{}:{cursor:cursor})});
}
export async function readArchiveState(input:ReadArchiveStateInput) {
  return validateArchiveState({raw:await requestArchive({subject:"",...input}),id:input.id});
}
export async function writeArchiveState({id,action,signal}:WriteArchiveStateInput) {
  return validateArchiveState({raw:await requestArchive({subject:"",command:{id,action,key:`archive_${crypto.randomUUID()}`},...(signal?{signal}:{})}),id,action});
}
