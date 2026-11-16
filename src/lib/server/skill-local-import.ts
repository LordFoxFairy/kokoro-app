import {
  localImportBeginRequestSchema,
  localImportCompleteRequestSchema,
  localImportIdSchema,
  localImportKeySchema,
  localImportSchemas,
  localImportErrorSchema,
  localImportErrorAllowed,
  localImportMatches,
  type LocalImportOperation,
} from "@/hub/skill-local-import.schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import { requestWithDomain } from "@/lib/server/upstream-http";
import {
  type ProjectionFault,
  PROJECTION_FAILURES,
  PROJECTION_REQUEST_ID,
  JSON_MEDIA_TYPE,
  MAX_SKILL_COMMAND_BYTES,
} from "@/lib/server/hub-projection";

export async function proxyLocalSkillImport(
  request: Request,
  path: string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const localError = (status: number, code: string, retryable = false) =>
    NextResponse.json(
      { error: { code, message: code, retryable } },
      {
        status,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  const fail = (fault: ProjectionFault) => {
    const base = PROJECTION_FAILURES[fault];
    return localError(
      base.status,
      fault === "invalidSkillRequest"
        ? "invalid_local_skill_import_request"
        : fault === "bffNotConfigured" || fault === "bffUnavailable"
          ? "local_skill_import_dependency_unavailable"
          : fault === "invalidOwnerResponse"
            ? "local_skill_import_response_invalid"
            : base.code,
      base.retryable,
    );
  };
  const url = new URL(request.url);
  const id = path[2];
  const operation: LocalImportOperation | undefined =
    path.length === 2 && request.method === "POST"
      ? "begin"
      : path.length === 3 && request.method === "GET"
        ? "get"
        : path.length === 4 &&
            request.method === "POST" &&
            (path[3] === "complete" || path[3] === "finalize")
          ? path[3]
          : undefined;
  if (
    !operation ||
    path[0] !== "skills" ||
    path[1] !== "local-imports" ||
    (id !== undefined && !localImportIdSchema.safeParse(id).success) ||
    url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` ||
    url.search ||
    url.hash
  )
    return fail("invalidSkillRequest");
  const key = request.headers.get("idempotency-key");
  if (operation === "get" && key !== null) return fail("invalidSkillRequest");
  if (operation !== "get" && !localImportKeySchema.safeParse(key).success)
    return localError(400, "local_skill_import_idempotency_key_required");
  if (
    (operation === "begin" || operation === "complete") &&
    !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")
  )
    return fail("invalidSkillRequest");
  const config = productBffConfig();
  if (config === null) return fail("configuration");
  if (
    (operation !== "get" || request.headers.has("origin")) &&
    request.headers.get("origin") !== config.session.webOrigin
  )
    return fail("forbidden");
  const deadline = new AbortController();
  const joined = AbortSignal.any([request.signal, deadline.signal]);
  const budget = operation === "finalize" ? 20_000 : 10_000;
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
          if (count > MAX_SKILL_COMMAND_BYTES) return fail("tooLarge");
          chunks.push(part.value);
        }
      } finally {
        joined.removeEventListener("abort", cancel);
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if ((operation === "get" || operation === "finalize") && count !== 0)
        return fail("invalidSkillRequest");
      if (count) {
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
      (operation === "begin" &&
        !localImportBeginRequestSchema.safeParse(parsedBody).success) ||
      (operation === "complete" &&
        !localImportCompleteRequestSchema.safeParse(parsedBody).success)
    )
      return fail("invalidSkillRequest");

    joined.throwIfAborted();
    const headers = productBffHeaders(config, request, requestId);
    headers.set("accept", "application/json");
    if (key !== null) headers.set("idempotency-key", key);
    if (body !== undefined) headers.set("content-type", "application/json");
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/browser/v1/${path.map(encodeURIComponent).join("/")}`;
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
    if (upstream.status === (operation === "begin" ? 201 : 200)) {
      const parsed = z
        .object({ data: localImportSchemas[operation] })
        .strict()
        .safeParse(raw);
      if (
        !parsed.success ||
        !localImportMatches(
          operation,
          parsed.data.data,
          id,
          operation === "complete"
            ? localImportCompleteRequestSchema.parse(parsedBody)
            : undefined,
        )
      )
        return fail("invalidOwnerResponse");
    } else {
      const parsed = localImportErrorSchema.safeParse(raw);
      if (
        !parsed.success ||
        !localImportErrorAllowed(
          operation,
          upstream.status,
          parsed.data.error.code,
        )
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
    return fail("bffUnavailable");
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
