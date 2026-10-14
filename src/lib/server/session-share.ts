import { randomUUID } from "node:crypto";
import { parseSharedTasksJson } from "@/lib/shared-tasks-json";
import { shareAckSchema, shareErrorSchema } from "@/lib/shared-tasks.schema";
import { productBffConfig, productBffHeaders } from "./product-bff";
import { currentProductSession } from "./product-session";
import { requestWithDomain } from "./upstream-http";

export async function sessionShare(
  request: Request,
  params: Promise<{ path: string[] }>,
): Promise<Response> {
  const deadline = performance.now() + 10_000,
    requestId = randomUUID(),
    controller = new AbortController();
  const headers = {
    "cache-control": "private, no-store",
    "x-request-id": requestId,
  };
  const fail = (status: number, code: string) =>
    Response.json(
      { error: { code, message: code }, meta: { request_id: requestId } },
      { status, headers },
    );
  const config = productBffConfig();
  if (!config) return fail(503, "session_share_dependency_unavailable");
  const url = new URL(request.url),
    origin = new URL(config.session.webOrigin);
  if (!["POST", "DELETE"].includes(request.method))
    return fail(405, "session_share_method_not_allowed");
  if (
    url.protocol !== origin.protocol ||
    request.headers.get("host") !== origin.host ||
    request.headers.get("origin") !== origin.origin
  )
    return fail(403, "session_share_forbidden_origin");
  const key = request.headers.get("idempotency-key");
  if (
    !key ||
    request.headers.has("content-encoding") ||
    request.headers.has("transfer-encoding")
  )
    return fail(400, "session_share_invalid_request");
  try {
    decodeURIComponent(url.search);
    for (const k of url.searchParams.keys())
      if (
        !["scope", "project_ref"].includes(k) ||
        url.searchParams.getAll(k).length !== 1
      )
        throw Error();
    const scope = url.searchParams.get("scope"),
      project = url.searchParams.get("project_ref");
    if (
      (scope !== null && !["", "direct"].includes(scope)) ||
      (project !== null && !project) ||
      (scope === "direct" && project !== null)
    )
      throw Error();
  } catch {
    return fail(400, "session_share_invalid_request");
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
    const { path } = await params;
    check();
    try {
      const raw = url.pathname.split("/").slice(3).map(decodeURIComponent);
      if (
        path.length !== 3 ||
        path[0] !== "sessions" ||
        !path[1] ||
        path[2] !== "share" ||
        JSON.stringify(raw) !== JSON.stringify(path)
      )
        throw Error();
    } catch {
      return fail(400, "session_share_invalid_request");
    }
    let body = "",
      size = 0;
    const inputDecoder = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    });
    const length = request.headers.get("content-length");
    if (
      length !== null &&
      (!/^\d+$/u.test(length) ||
        Number(length) > (request.method === "DELETE" ? 0 : 16384))
    )
      return fail(400, "session_share_invalid_request");
    try {
      if (request.body) {
        reader = request.body.getReader();
        for (;;) {
          const part = await reader.read();
          check();
          if (part.done) break;
          size += part.value.length;
          if (size > (request.method === "DELETE" ? 0 : 16384))
            return fail(400, "session_share_invalid_request");
          body += inputDecoder.decode(part.value, { stream: true });
        }
        body += inputDecoder.decode();
        reader.releaseLock();
        reader = undefined;
      }
    } catch {
      check();
      return fail(400, "session_share_invalid_request");
    }
    if (request.method === "POST") {
      try {
        const raw = parseSharedTasksJson(body);
        if (
          raw === null ||
          typeof raw !== "object" ||
          Array.isArray(raw) ||
          Object.keys(raw).length !== 0
        )
          throw Error();
      } catch {
        return fail(400, "session_share_invalid_request");
      }
    }
    const session = await currentProductSession(request, config.session);
    check();
    if (
      !session ||
      session.accessExpiresAt <= Date.now() ||
      session.expiresAt <= Date.now()
    )
      return fail(401, "session_invalid");
    const outgoing = productBffHeaders(config, session, requestId);
    outgoing.set("idempotency-key", key);
    if (request.method === "POST")
      outgoing.set("content-type", "application/json");
    response = await requestWithDomain(
      `${config.bffBaseUrl}/v1/sessions/${encodeURIComponent(path[1]!)}/share${url.search}`,
      config.domain,
      {
        method: request.method,
        signal: controller.signal,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
        maxResponseBytes: 1_048_576,
        headers: outgoing,
        ...(request.method === "POST"
          ? { body: new TextEncoder().encode("{}").buffer }
          : {}),
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
      return fail(502, "session_share_response_invalid");
    let bytes = 0;
    response.headers.forEach((v, k) => {
      bytes += new TextEncoder().encode(`${k}: ${v}\r\n`).length;
    });
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (bytes > 1_048_576) return fail(502, "session_share_response_invalid");
    if (response.body) {
      reader = response.body.getReader();
      for (;;) {
        const p = await reader.read();
        check();
        if (p.done) break;
        bytes += p.value.length;
        if (bytes > 1_048_576)
          return fail(502, "session_share_response_invalid");
        text += decoder.decode(p.value, { stream: true });
      }
      text += decoder.decode();
    }
    let output: unknown;
    const status = response.status,
      retry = response.headers.get("retry-after");
    try {
      const raw = parseSharedTasksJson(text);
      if (status === 200) {
        const ack = shareAckSchema.parse(raw);
        if (ack.meta.request_id !== requestId) throw Error();
        output = ack.data;
      } else {
        if (![401, 403, 404, 409, 429, 503].includes(status)) throw Error();
        const e = shareErrorSchema.parse(raw);
        if (e.meta.request_id !== requestId) throw Error();
        output = e;
      }
      if (
        retry !== null &&
        (status !== 429 ||
          !/^[1-9]\d{0,4}$/u.test(retry) ||
          Number(retry) > 86400)
      )
        throw Error();
    } catch {
      return fail(502, "session_share_response_invalid");
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
      const e = output as { error: { code: string } };
      output = {
        error: { code: e.error.code, message: e.error.code },
        meta: { request_id: requestId },
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
    return fail(503, "session_share_dependency_unavailable");
  } finally {
    retired = true;
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    stop();
  }
}
