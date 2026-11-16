import { parsePersonalSkillHistoryJson } from "@/hub/personal-skill-history.schema";
import {
  createPersonalSkillVersionRequestSchema,
  createPersonalSkillVersionSchema,
  deletePersonalSkillSeriesRequestSchema,
  deletePersonalSkillSeriesSchema,
  withdrawPersonalSkillRequestSchema,
  withdrawPersonalSkillSchema,
  personalSkillLifecycleErrors,
  personalSkillLifecycleErrorSchema,
} from "@/hub/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import { requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http";
import { PROJECTION_REQUEST_ID, JSON_MEDIA_TYPE, MAX_SKILL_COMMAND_BYTES } from "@/lib/server/hub-projection";

export async function proxyPersonalSkillLifecycle(
  request: Request,
  path: string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string) =>
    NextResponse.json(
      { error: { code, message: code }, meta: { request_id: requestId } },
      {
        status,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  const id = path[2] ?? "";
  const version = path[3] === "versions";
  const deleting = request.method === "DELETE" && path.length === 3;
  if (
    (!deleting && request.method !== "POST") ||
    (!deleting && path.length !== 4) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id) ||
    (!deleting && !["versions", "withdraw"].includes(path[3] ?? "")) ||
    new URL(request.url).pathname !==
      `/api/hub/self/skills/${encodeURIComponent(id)}${deleting ? "" : `/${path[3]}`}` ||
    new URL(request.url).search ||
    request.headers.has("transfer-encoding") ||
    !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")
  )
    return fail(400, "invalid_skill_request");
  const key = request.headers.get("idempotency-key");
  if (key === null) return fail(400, "idempotency_key_required");
  if (!/^[\x21-\x2B\x2D-\x7E]{1,128}$/u.test(key))
    return fail(400, "invalid_idempotency_key");
  const config = productBffConfig();
  if (!config) return fail(503, "product_tenant_not_configured");
  if (request.headers.get("origin") !== config.session.webOrigin)
    return fail(403, "session_forbidden");
  const deadline = new AbortController();
  const joined = AbortSignal.any([request.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(), 10_000);
  let upstream: Response | undefined;
  const within = <T>(work: Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const abort = () => reject(joined.reason);
      joined.addEventListener("abort", abort, { once: true });
      void work
        .then(resolve, reject)
        .finally(() => joined.removeEventListener("abort", abort));
      if (joined.aborted) abort();
    });
  const read = async (
    body: ReadableStream<Uint8Array> | null,
    max: number,
  ): Promise<Uint8Array> => {
    if (!body) throw new Error("empty body");
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    joined.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        const part = await within(reader.read());
        joined.throwIfAborted();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > max) throw new UpstreamRequestTooLargeError();
        chunks.push(part.value);
      }
    } finally {
      joined.removeEventListener("abort", cancel);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  };
  try {
    joined.throwIfAborted();
    let input: unknown;
    let bytes: Uint8Array;
    try {
      bytes = await read(request.body, MAX_SKILL_COMMAND_BYTES);
      input = parsePersonalSkillHistoryJson(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch (error) {
      if (joined.aborted) return fail(503, "skill_dependency_unavailable");
      return fail(
        error instanceof UpstreamRequestTooLargeError ? 413 : 400,
        error instanceof UpstreamRequestTooLargeError
          ? "request_body_too_large"
          : "invalid_skill_request",
      );
    }
    const parsed = (
      deleting ? deletePersonalSkillSeriesRequestSchema : version
        ? createPersonalSkillVersionRequestSchema
        : withdrawPersonalSkillRequestSchema
    ).safeParse(input);
    if (!parsed.success) return fail(400, "invalid_skill_request");

    const headers = productBffHeaders(config, request, requestId);
    headers.set("content-type", "application/json");
    headers.set("idempotency-key", key);
    headers.set("content-length", String(bytes.byteLength));
    joined.throwIfAborted();
    const response = await within(
      requestWithDomain(
        `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/self/skills/${encodeURIComponent(id)}${deleting ? "" : `/${path[3]}`}`,
        config.domain,
        {
          method: deleting ? "DELETE" : "POST",
          headers: Object.fromEntries(headers),
          body: bytes!.buffer as ArrayBuffer,
          signal: joined,
          timeoutMs: 10_000,
          maxResponseBytes: 1_048_576,
        },
      ).then((value) => {
        if (joined.aborted) void value.body?.cancel().catch(() => undefined);
        return value;
      }),
    );
    upstream = response;
    const ownerId = response.headers.get("x-request-id");
    if (
      !ownerId ||
      !PROJECTION_REQUEST_ID.test(ownerId) ||
      !response.headers
        .get("cache-control")
        ?.split(",")
        .map((value) => value.trim())
        .includes("no-store") ||
      !JSON_MEDIA_TYPE.test(response.headers.get("content-type") ?? "")
    )
      return fail(502, "skill_response_invalid");
    let raw: unknown;
    try {
      raw = parsePersonalSkillHistoryJson(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await read(response.body, 1_048_576),
        ),
      );
    } catch {
      return fail(
        joined.aborted ? 503 : 502,
        joined.aborted
          ? "skill_dependency_unavailable"
          : "skill_response_invalid",
      );
    }
    const success = version ? 201 : 200;
    if (response.status === success) {
      const ack = z
        .object({
          data: deleting ? deletePersonalSkillSeriesSchema : version
            ? createPersonalSkillVersionSchema
            : withdrawPersonalSkillSchema,
          meta: z.object({ request_id: z.literal(ownerId) }).strict(),
        })
        .strict()
        .safeParse(raw);
      if (!ack.success) return fail(502, "skill_response_invalid");
      if (
        deleting
          ? !("skill_id" in ack.data.data) || ack.data.data.skill_id !== id || BigInt(ack.data.data.state_version) !== BigInt(deletePersonalSkillSeriesRequestSchema.parse(input).expected_state_version) + BigInt(1)
          : version
          ? !("skill_id" in ack.data.data) || ack.data.data.skill_id === id
          : !("source_ref" in ack.data.data) ||
            ack.data.data.source_ref !== `skill:${id}` ||
            BigInt(ack.data.data.state_version) <=
              BigInt(
                withdrawPersonalSkillRequestSchema.parse(input)
                  .expected_state_version,
              )
      )
        return fail(502, "skill_response_invalid");
    } else {
      const error = personalSkillLifecycleErrorSchema.safeParse(raw);
      if (
        !error.success ||
        error.data.meta.request_id !== ownerId ||
        !personalSkillLifecycleErrors[response.status]?.includes(
          error.data.error.code,
        )
      )
        return fail(502, "skill_response_invalid");
    }
    const retryAfter = response.headers.get("retry-after");
    if (
      retryAfter !== null &&
      (response.status !== 429 ||
        !/^(?:[1-9][0-9]{0,3}|[1-7][0-9]{4}|8[0-5][0-9]{3}|86[0-3][0-9]{2}|86400)$/u.test(
          retryAfter,
        ))
    )
      return fail(502, "skill_response_invalid");
    joined.throwIfAborted();
    return NextResponse.json(raw, {
      status: response.status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": ownerId,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      },
    });
  } catch {
    return fail(503, "skill_dependency_unavailable");
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
