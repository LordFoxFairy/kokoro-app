import {
  shareSchemas,
  shareIdSchema,
  shareCreateSchema,
  shareErrorSchema,
  shareErrorAllowed,
  shareMatches,
  type ShareOperation,
} from "@/hub/skill-share.schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import { requestWithDomain } from "@/lib/server/upstream-http";
import {
  type ProjectionFault,
  projectionError,
  PROJECTION_REQUEST_ID,
  JSON_MEDIA_TYPE,
  MAX_SKILL_COMMAND_BYTES,
} from "@/lib/server/hub-projection";

export async function proxySkillShare(
  request: Request,
  path: string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (fault: ProjectionFault) => projectionError(fault, requestId);
  const url = new URL(request.url);
  const operation: ShareOperation | undefined =
    path.length === 3 && path[2] === "download" && request.method === "POST"
      ? "download"
      : path.length === 1 && request.method === "POST"
        ? "create"
        : path.length === 2 && request.method === "DELETE"
          ? "revoke"
          : path.length === 2 && request.method === "GET"
            ? "resolve"
            : path.length === 3 && path[2] === "skill" && request.method === "GET"
              ? "summary"
              : undefined;
  if (
    !operation ||
    path[0] !== "skill-shares" ||
    (path.length > 1 && !shareIdSchema.safeParse(path[1]).success) ||
    url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` ||
    url.search ||
    url.hash ||
    request.headers.has("idempotency-key")
  )
    return fail("invalidSkillRequest");
  if (
    operation !== "create" &&
    operation !== "download" &&
    operation !== "revoke" &&
    (request.body !== null ||
      request.headers.has("content-length") ||
      request.headers.has("transfer-encoding"))
  )
    return fail("invalidSkillRequest");
  if (
    (operation === "download" || operation === "revoke") &&
    (request.headers.has("transfer-encoding") ||
      (request.headers.has("content-length") &&
        request.headers.get("content-length") !== "0"))
  )
    return fail("invalidSkillRequest");
  if (
    operation === "create" &&
    !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")
  )
    return fail("invalidSkillRequest");
  const config = productBffConfig();
  if (config === null) return fail("configuration");
  if (!config.bffBaseUrl) return fail("bffNotConfigured");
  if (
    (operation === "create" ||
      operation === "download" ||
      operation === "revoke" ||
      request.headers.has("origin")) &&
    request.headers.get("origin") !== config.session.webOrigin
  )
    return fail("forbidden");
  const deadline = new AbortController();
  const joined = AbortSignal.any([request.signal, deadline.signal]);
  const budget = 10_000;
  const expires = Date.now() + budget;
  const timer = setTimeout(() => deadline.abort(), budget);
  let upstream: Response | undefined;
  const within = <T>(work: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () => reject(joined.reason);
      joined.addEventListener("abort", abort, { once: true });
      void work
        .then(resolve, reject)
        .finally(() => joined.removeEventListener("abort", abort));
      if (joined.aborted) abort();
    });
  try {
    joined.throwIfAborted();
    let body: ArrayBuffer | undefined;
    let parsedBody: unknown;
    if (request.body !== null) {
      const reader = request.body.getReader();
      const cancel = () => {
        void reader.cancel().catch(() => undefined);
      };
      joined.addEventListener("abort", cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let count = 0;
      try {
        for (;;) {
          const part = await within(reader.read());
          joined.throwIfAborted();
          if (part.done) break;
          count += part.value.byteLength;
          if ((operation === "download" || operation === "revoke") && count > 0)
            return fail("invalidSkillRequest");
          if (count > MAX_SKILL_COMMAND_BYTES) return fail("tooLarge");
          chunks.push(part.value);
        }
      } finally {
        joined.removeEventListener("abort", cancel);
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (count) {
        if (operation === "download") return fail("invalidSkillRequest");
        const bytes = new Uint8Array(count);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        body = bytes.buffer;
        try {
          parsedBody = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
        } catch {
          return fail("invalidSkillRequest");
        }
      }
    }
    if (
      operation === "create"
        ? !shareCreateSchema.safeParse(parsedBody).success
        : body !== undefined
    )
      return fail("invalidSkillRequest");

    joined.throwIfAborted();
    const headers = productBffHeaders(config, request, requestId);
    headers.set("accept", "application/json");
    if (body !== undefined) headers.set("content-type", "application/json");
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/${operation === "download" ? "browser/v1" : "v1"}/${path.map(encodeURIComponent).join("/")}`;
    upstream = await within(
      requestWithDomain(target, config.domain, {
        method: request.method,
        headers: Object.fromEntries(headers),
        ...(body === undefined ? {} : { body }),
        signal: joined,
        timeoutMs: Math.max(1, expires - Date.now()),
        maxResponseBytes: 1_048_576,
        maxErrorResponseBytes: 1_048_576,
        strictResponseLength: true,
      }).then((value) => {
        if (joined.aborted) void value.body?.cancel().catch(() => undefined);
        return value;
      }),
    );
    if (upstream === undefined) return fail("bffUnavailable");
    const ownerId = upstream.headers.get("x-request-id");
    if (
      upstream.body === null ||
      !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "") ||
      upstream.headers.get("cache-control") !== "no-store" ||
      !PROJECTION_REQUEST_ID.test(ownerId ?? "")
    )
      return fail("invalidOwnerResponse");
    const declared = upstream.headers.get("content-length");
    if (
      declared !== null &&
      (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)
    )
      return fail("invalidOwnerResponse");
    const reader = upstream.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    joined.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        joined.throwIfAborted();
        const part = await within(reader.read());
        joined.throwIfAborted();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1_048_576) return fail("invalidOwnerResponse");
        chunks.push(part.value);
      }
    } finally {
      joined.removeEventListener("abort", cancel);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (declared !== null && Number(declared) !== size)
      return fail("invalidOwnerResponse");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return fail("invalidOwnerResponse");
    }
    joined.throwIfAborted();
    if (upstream.status === (operation === "create" ? 201 : 200)) {
      const parsed = z
        .object({ data: shareSchemas[operation] })
        .strict()
        .safeParse(raw);
      if (
        !parsed.success ||
        !shareMatches(
          operation,
          parsed.data.data,
          operation === "create"
            ? shareCreateSchema.parse(parsedBody).source_ref
            : path[1]!,
          config.session.webOrigin,
        )
      )
        return fail("invalidOwnerResponse");
    } else {
      const parsed = shareErrorSchema.safeParse(raw);
      if (
        !parsed.success ||
        !shareErrorAllowed(operation, upstream.status, parsed.data.error.code)
      )
        return fail("invalidOwnerResponse");
    }
    const retryAfter = upstream.headers.get("retry-after");
    if (
      retryAfter !== null &&
      (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))
    )
      return fail("invalidOwnerResponse");
    return NextResponse.json(raw, {
      status: upstream.status,
      headers: {
        "cache-control": "private, no-store",
        "x-request-id": ownerId!,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      },
    });
  } catch {
    return operation === "download" && deadline.signal.aborted
      ? NextResponse.json(
          {
            error: {
              code: "skill_deadline_exceeded",
              message: "Skill download deadline exceeded",
              retryable: true,
            },
          },
          {
            status: 504,
            headers: {
              "cache-control": "private, no-store",
              "x-request-id": requestId,
            },
          },
        )
      : fail("bffUnavailable");
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
