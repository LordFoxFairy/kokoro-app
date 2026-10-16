import { randomUUID } from "node:crypto";
import { parseSharedTasksJson } from "@/lib/shared-tasks-json";
import {
  sharedTasksErrors,
  sharedTasksCursor,
  validateSharedTasks,
} from "@/lib/shared-tasks.schema";
import { productBffConfig, productBffHeaders } from "./product-bff";
import { oidcRpConfig } from "./oidc-provider";
import { currentProductSession } from "./product-session";
import { requestWithDomain } from "./upstream-http";

export async function sharedTasks(request: Request): Promise<Response> {
  const deadline = performance.now() + 10_000,
    requestId = randomUUID(),
    controller = new AbortController();
  const headers = {
    "cache-control": "private, no-store",
    "x-request-id": requestId,
  };
  const fail = (status: number, code: string) =>
    Response.json(
      { error: { code, message: code, retryable: status >= 500 } },
      { status, headers },
    );
  const config = productBffConfig(),
    rp = oidcRpConfig(process.env);
  if (!config || !rp) return fail(503, "shared_tasks_dependency_unavailable");
  const url = new URL(request.url),
    origin = new URL(config.session.webOrigin);
  if (request.method !== "GET")
    return new Response(null, {
      status: 405,
      headers: { ...headers, allow: "GET" },
    });
  if (
    url.protocol !== origin.protocol ||
    request.headers.get("host") !== origin.host ||
    (request.headers.has("origin") &&
      request.headers.get("origin") !== origin.origin)
  )
    return fail(403, "shared_tasks_forbidden_origin");
  if (
    url.pathname !== "/api/account/shared-tasks" ||
    request.body !== null ||
    [
      "content-length",
      "transfer-encoding",
      "content-encoding",
      "idempotency-key",
    ].some((k) => request.headers.has(k))
  )
    return fail(400, "shared_tasks_invalid_request");
  let limit = 20,
    cursor: string | undefined;
  try {
    decodeURIComponent(url.search);
    for (const k of url.searchParams.keys())
      if (
        !["limit", "cursor"].includes(k) ||
        url.searchParams.getAll(k).length !== 1
      )
        throw Error();
    const raw = url.searchParams.get("limit");
    if (raw !== null) {
      if (!/^[1-9]\d{0,2}$/u.test(raw) || Number(raw) > 100) throw Error();
      limit = Number(raw);
    }
    cursor = url.searchParams.get("cursor") ?? undefined;
    if (cursor !== undefined && (!cursor || cursor.length > 2048))
      throw Error();
  } catch {
    return fail(400, "shared_tasks_invalid_request");
  }
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
      reject(Error("retired"));
    },
    timer = setTimeout(abort, Math.max(0, deadline - performance.now()));
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const check = () => {
    if (retired || controller.signal.aborted || performance.now() >= deadline)
      throw Error("retired");
  };
  const operation = async () => {
    check();
    const session = await currentProductSession(request, config.session);
    check();
    if (
      !session ||
      session.accessExpiresAt <= Date.now() ||
      session.expiresAt <= Date.now()
    )
      return fail(401, "session_invalid");
    try {
      if (cursor !== undefined)
        sharedTasksCursor(cursor, session.subject, limit, rp.tenantId);
    } catch {
      return fail(400, "shared_tasks_invalid_request");
    }
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) query.set("cursor", cursor);
    response = await requestWithDomain(
      `${config.bffBaseUrl}/v1/account/shared-tasks?${query}`,
      config.domain,
      {
        method: "GET",
        signal: controller.signal,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
        maxResponseBytes: 1_048_576,
        headers: productBffHeaders(config, session, requestId),
      },
    );
    if (retired || controller.signal.aborted) {
      stop();
      check();
    }
    check();
    if (
      response.headers.get("x-request-id") !== requestId ||
      !/^application\/json(?:\s*;|$)/iu.test(
        response.headers.get("content-type") ?? "",
      ) ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
        response.headers.get("cache-control") ?? "",
      ) ||
      response.headers.has("location") ||
      response.headers.has("set-cookie")
    )
      return fail(502, "shared_tasks_response_invalid");
    let bytes = 0;
    response.headers.forEach((v, k) => {
      bytes += new TextEncoder().encode(`${k}: ${v}\r\n`).length;
    });
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (bytes > 1_048_576) return fail(502, "shared_tasks_response_invalid");
    if (response.body) {
      reader = response.body.getReader();
      for (;;) {
        const p = await reader.read();
        check();
        if (p.done) break;
        bytes += p.value.length;
        if (bytes > 1_048_576)
          return fail(502, "shared_tasks_response_invalid");
        text += decoder.decode(p.value, { stream: true });
      }
      text += decoder.decode();
    }
    let output: unknown;
    const status = response.status,
      retry = response.headers.get("retry-after");
    try {
      const raw = parseSharedTasksJson(text);
      output =
        status === 200
          ? validateSharedTasks(
              raw,
              session.subject,
              limit,
              cursor,
              rp.tenantId,
            )
          : sharedTasksErrors[status]?.parse(raw);
      if (
        !output ||
        (retry !== null &&
          (status !== 429 ||
            !/^[1-9]\d{0,4}$/u.test(retry) ||
            Number(retry) > 86400))
      )
        throw Error();
    } catch {
      return fail(502, "shared_tasks_response_invalid");
    }
    const latest = await currentProductSession(request, config.session);
    check();
    if (
      !latest ||
      [
        "id",
        "generation",
        "subject",
        "access",
        "accessExpiresAt",
        "expiresAt",
      ].some(
        (k) =>
          latest[k as keyof typeof latest] !==
          session[k as keyof typeof session],
      ) ||
      latest.accessExpiresAt <= Date.now() ||
      latest.expiresAt <= Date.now()
    )
      return fail(401, "session_invalid");
    if (status !== 200) {
      const e = output as { error: { code: string; retryable: boolean } };
      output = {
        error: {
          code: e.error.code,
          message: e.error.code,
          retryable: e.error.retryable,
        },
      };
    }
    return Response.json(output, {
      status,
      headers: {
        ...headers,
        ...(retry === null ? {} : { "retry-after": retry }),
      },
    });
  };
  try {
    return await Promise.race([cancelled, operation()]);
  } catch {
    return fail(503, "shared_tasks_dependency_unavailable");
  } finally {
    retired = true;
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    stop();
  }
}
