import { listOwnedSharedTasks } from "@/generated/bff-shared-tasks/sdk.gen";
import { createClient } from "@/generated/bff-shared-tasks/client";
import { parseSharedTasksJson } from "@/lib/shared-tasks-json";
import {
  sharedTasksErrors,
  validateSharedTasks,
  type SharedTasksPage,
} from "@/lib/shared-tasks.schema";

export async function readSharedTasks(
  subject: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<SharedTasksPage> {
  const controller = new AbortController(),
    deadline = performance.now() + 10_000;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    response: Response | undefined,
    retired = false,
    reject!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_, no) => {
    reject = no;
  });
  const stop = () => {
    controller.abort();
    if (reader) {
      void reader.cancel().catch(() => undefined);
      try {
        reader.releaseLock();
      } catch {}
      reader = undefined;
    }
    if (response?.body && !response.body.locked)
      void response.body.cancel().catch(() => undefined);
  };
  const abort = () => {
    stop();
    reject(Error("shared_tasks_unknown"));
  };
  const timer = setTimeout(abort, 10_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const check = () => {
    if (retired || controller.signal.aborted || performance.now() >= deadline)
      throw Error("shared_tasks_unknown");
  };
  const transport: typeof fetch = async () => {
    check();
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== undefined) query.set("cursor", cursor);
    response = await fetch(`/api/account/shared-tasks?${query}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (retired || controller.signal.aborted) {
      stop();
      check();
    }
    check();
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        response.headers.get("content-type") ?? "",
      ) ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
        response.headers.get("cache-control") ?? "",
      ) ||
      response.headers.has("location") ||
      response.headers.has("set-cookie") ||
      !response.headers.get("x-request-id")?.length ||
      response.headers.get("x-request-id")!.length > 256
    )
      throw Error("shared_tasks_response_invalid");
    let bytes = 0;
    response.headers.forEach((v, k) => {
      bytes += new TextEncoder().encode(`${k}: ${v}\r\n`).length;
    });
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (bytes > 1_048_576) throw Error("shared_tasks_response_invalid");
    if (response.body) {
      reader = response.body.getReader();
      for (;;) {
        const p = await reader.read();
        check();
        if (p.done) break;
        bytes += p.value.length;
        if (bytes > 1_048_576) throw Error("shared_tasks_response_invalid");
        text += decoder.decode(p.value, { stream: true });
      }
      text += decoder.decode();
    }
    const retry = response.headers.get("retry-after");
    if (
      retry !== null &&
      (response.status !== 429 ||
        !/^[1-9]\d{0,4}$/u.test(retry) ||
        Number(retry) > 86400)
    )
      throw Error("shared_tasks_response_invalid");
    const raw = parseSharedTasksJson(text);
    if (response.status !== 200) {
      const error = sharedTasksErrors[response.status]?.parse(raw);
      if (!error) throw Error("shared_tasks_response_invalid");
      throw Error(error.error.code);
    }
    const page = validateSharedTasks(raw, subject, 100, cursor);
    check();
    return Response.json(page, {
      headers: { "content-type": "application/json" },
    });
  };
  const operation = async () => {
    const result = await listOwnedSharedTasks({
      client: createClient({ baseUrl: "http://localhost", fetch: transport }),
      query: { limit: 100, ...(cursor === undefined ? {} : { cursor }) },
    });
    check();
    return validateSharedTasks(result.data, subject, 100, cursor);
  };
  try {
    return await Promise.race([cancelled, operation()]);
  } finally {
    retired = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    stop();
  }
}
