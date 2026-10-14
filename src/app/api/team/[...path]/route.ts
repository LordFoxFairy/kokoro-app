// Fixed-tenant Team adapter: one deadline, raw closed wire, no caller-supplied identity.
import { randomUUID } from "node:crypto";
import {
  admittedProductSession,
  productBffConfig,
  productBffHeaders,
} from "@/lib/server/product-bff";
import { currentProductSession } from "@/lib/server/product-session";
import { requestWithDomain } from "@/lib/server/upstream-http";
import { parseTeamJson } from "@/team/json";
import {
  teamCreateInvitationRequestSchema,
  teamReplaceRolesRequestSchema,
  teamResponseSchema,
  teamErrorResponseSchema,
  teamErrorStatuses,
} from "@/team/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
type TeamMethod = "GET" | "POST" | "PUT" | "DELETE";
function validId(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\/%\u0000-\u001f\u007f]/u.test(value)
  );
}

function selectedPath(
  method: TeamMethod,
  path: readonly string[],
): string | null {
  if (
    method === "GET" &&
    path.length === 1 &&
    ["members", "invitations", "roles"].includes(path[0]!)
  ) {
    return path[0]!;
  }
  if (method === "POST" && path.length === 1 && path[0] === "invitations")
    return "invitations";
  if (
    method === "POST" &&
    path.length === 3 &&
    path[0] === "invitations" &&
    validId(path[1]) &&
    path[2] === "resend"
  ) {
    return `invitations/${encodeURIComponent(path[1])}/resend`;
  }
  if (
    method === "DELETE" &&
    path.length === 2 &&
    path[0] === "invitations" &&
    validId(path[1])
  ) {
    return `invitations/${encodeURIComponent(path[1])}`;
  }
  if (
    method === "DELETE" &&
    path.length === 2 &&
    path[0] === "members" &&
    path[1] === "me"
  )
    return "members/me";
  if (path[0] === "members" && validId(path[1]) && path[1] !== "me") {
    if (method === "PUT" && path.length === 3 && path[2] === "roles")
      return `members/${encodeURIComponent(path[1])}/roles`;
    if (method === "DELETE" && path.length === 2)
      return `members/${encodeURIComponent(path[1])}`;
  }
  return null;
}

function validQuery(request: Request, method: TeamMethod): string | null {
  const query = new URL(request.url).search;
  if (method !== "GET") return query === "" ? "" : null;
  if (query.length > 4096) return null;
  const params = new URLSearchParams(query);
  if ([...params.keys()].some((key) => key !== "limit" && key !== "cursor"))
    return null;
  if (params.getAll("limit").length > 1 || params.getAll("cursor").length > 1)
    return null;
  const limit = params.get("limit");
  if (
    limit !== null &&
    (!/^[1-9][0-9]{0,2}$/u.test(limit) || Number(limit) > 100)
  )
    return null;
  const cursor = params.get("cursor");
  if (cursor !== null && (cursor.length === 0 || cursor.length > 2048))
    return null;
  return query;
}

async function proxy(request: Request, context: Context): Promise<Response> {
  const deadline = performance.now() + 10_000;
  const requestId = randomUUID();
  const privateHeaders = {
    "cache-control": "private, no-store",
    "x-request-id": requestId,
  };
  const fail = (status: number, code: string) =>
    Response.json(
      { error: { code, message: code }, meta: { request_id: requestId } },
      { status, headers: privateHeaders },
    );
  const controller = new AbortController();
  let retired = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let upstream: Response | undefined;
  let reject!: (error: unknown) => void;
  const cancellation = new Promise<never>((_, fail) => {
    reject = fail;
  });
  const stop = () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
    if (upstream?.body && !upstream.body.locked)
      void upstream.body.cancel().catch(() => undefined);
  };
  const abort = () => {
    stop();
    reject(new Error("Retired Team operation"));
  };
  const timer = setTimeout(abort, 10_000);
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const check = () => {
    if (retired || controller.signal.aborted || performance.now() >= deadline)
      throw new Error("Retired Team operation");
  };
  const read = async (
    body: ReadableStream<Uint8Array> | null,
    maximum: number,
    initial = 0,
  ) => {
    let bytes = initial;
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    if (bytes > maximum) throw new RangeError("Too large");
    if (body) {
      reader = body.getReader();
      try {
        for (;;) {
          const part = await reader.read();
          check();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > maximum) throw new RangeError("Too large");
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
        reader = undefined;
      }
    }
    check();
    return text;
  };
  const operation = async () => {
    check();
    const method = request.method as TeamMethod;
    const { path } = await context.params;
    check();
    const selected = selectedPath(method, path ?? []);
    if (selected === null) return fail(404, "not_found");
    const query = validQuery(request, method);
    if (query === null || (method !== "GET" && request.url.includes("?")))
      return fail(400, "invalid_query");
    if (request.headers.has("idempotency-key"))
      return fail(400, "invalid_team_request");
    const config = productBffConfig();
    if (!config) return fail(503, "bff_not_configured");
    const canonical = new URL(config.session.webOrigin);
    const origin = request.headers.get("origin");
    if (
      new URL(request.url).protocol !== canonical.protocol ||
      request.headers.get("host") !== canonical.host ||
      (method === "GET"
        ? origin !== null && origin !== canonical.origin
        : origin !== canonical.origin)
    )
      return fail(403, "forbidden_origin");
    if (request.headers.has("content-encoding"))
      return fail(400, "invalid_team_request");
    let body: ArrayBuffer | undefined;
    const expectsJson =
      (method === "POST" && selected === "invitations") || method === "PUT";
    try {
      if (expectsJson) {
        if (
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
            request.headers.get("content-type") ?? "",
          )
        )
          return fail(400, "invalid_team_request");
        const text = await read(request.body, 16_384);
        const value =
          method === "PUT"
            ? teamReplaceRolesRequestSchema.parse(parseTeamJson(text))
            : teamCreateInvitationRequestSchema.parse(parseTeamJson(text));
        body = new TextEncoder().encode(JSON.stringify(value)).buffer;
      } else {
        if (
          request.headers.has("transfer-encoding") ||
          (request.headers.has("content-length") &&
            request.headers.get("content-length") !== "0")
        )
          return fail(400, "invalid_team_request");
        await read(request.body, 0);
      }
    } catch (error) {
      check();
      return fail(
        expectsJson && error instanceof RangeError ? 413 : 400,
        expectsJson && error instanceof RangeError
          ? "request_body_too_large"
          : "invalid_team_request",
      );
    }
    check();
    const session = await admittedProductSession(request, config);
    check();
    if (
      !session ||
      session.accessExpiresAt <= Date.now() ||
      session.expiresAt <= Date.now()
    )
      return fail(401, "unauthenticated");
    const headers = productBffHeaders(config, session, requestId);
    if (body !== undefined) headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    upstream = await requestWithDomain(
      `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/team/${selected}${query}`,
      config.domain,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
        maxRequestBytes: 16_384,
        maxResponseBytes: 2 * 1024 * 1024,
      },
    );
    if (retired || controller.signal.aborted) {
      stop();
      check();
    }
    check();
    const invalid = () => fail(502, "bff_bad_response");
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        upstream.headers.get("content-type") ?? "",
      ) ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
        upstream.headers.get("cache-control") ?? "",
      ) ||
      upstream.headers.has("location") ||
      upstream.headers.has("set-cookie")
    )
      return invalid();
    const retry = upstream.headers.get("retry-after");
    if (
      retry !== null &&
      (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retry))
    )
      return invalid();
    let size = 0;
    upstream.headers.forEach((value, key) => {
      size += new TextEncoder().encode(`${key}: ${value}\r\n`).byteLength;
    });
    let output: unknown;
    try {
      const raw = parseTeamJson(
        await read(upstream.body, 2 * 1024 * 1024, size),
      );
      if (upstream.status === 200)
        output = teamResponseSchema(method, selected).parse(raw);
      else {
        if (
          !teamErrorStatuses.has(upstream.status) ||
          upstream.status === 413 ||
          (method === "GET" && upstream.status === 409)
        )
          return invalid();
        const error = teamErrorResponseSchema.parse(raw);
        output = {
          ...error,
          error: { code: error.error.code, message: error.error.code },
        };
      }
      const meta = (output as { meta: { request_id: string } }).meta;
      if (meta.request_id !== upstream.headers.get("x-request-id"))
        return invalid();
      if (upstream.status === 200 && method !== "GET") {
        const data = (
          output as {
            data: {
              invitation_id?: string;
              member_id?: string;
              roles?: string[];
            };
          }
        ).data;
        if (
          (selected.startsWith("invitations/") &&
            data.invitation_id !== path[1]) ||
          (selected.startsWith("members/") &&
            selected !== "members/me" &&
            data.member_id !== path[1])
        )
          return invalid();
        if (method === "PUT") {
          const expected = teamReplaceRolesRequestSchema.parse(
            parseTeamJson(new TextDecoder().decode(body)),
          ).roles;
          if (
            !data.roles ||
            new Set(data.roles).size !== data.roles.length ||
            data.roles.length !== expected.length ||
            !data.roles.every((role) => expected.includes(role))
          )
            return invalid();
        }
      }
    } catch {
      check();
      return invalid();
    }
    const latest = await currentProductSession(request, config.session);
    check();
    if (
      !latest ||
      latest.id !== session.id ||
      latest.generation !== session.generation ||
      latest.subject !== session.subject ||
      latest.access !== session.access ||
      latest.accessExpiresAt !== session.accessExpiresAt ||
      latest.expiresAt !== session.expiresAt ||
      latest.accessExpiresAt <= Date.now() ||
      latest.expiresAt <= Date.now()
    )
      return fail(401, "unauthenticated");
    const meta = (output as { meta: { request_id: string } }).meta;
    return Response.json(output, {
      status: upstream.status,
      headers: {
        "cache-control": "private, no-store",
        "x-request-id": meta.request_id,
        ...(retry === null ? {} : { "retry-after": retry }),
      },
    });
  };
  try {
    return await Promise.race([cancellation, operation()]);
  } catch {
    return fail(503, "team_unavailable");
  } finally {
    retired = true;
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    stop();
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
