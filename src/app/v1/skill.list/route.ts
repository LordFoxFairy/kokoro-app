import { isDeepStrictEqual } from "node:util";
import { NextResponse } from "next/server";
import {
  zListSkillsQuery,
  zListSkillsResponse,
  zSpecificationPublicError,
} from "@/generated/bff-public-skill-list/zod.gen";
import { publicSkillListProvenance } from "@/generated/bff-public-skill-list/provenance";
import { configuredDomain } from "@/lib/server/domain-context";
import {
  iamRelayConfig,
  matchesCanonicalWebRequest,
} from "@/lib/server/iam-relay-config";
import {
  DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES,
  requestWithDomain,
  UpstreamResponseTooLargeError,
} from "@/lib/server/upstream-http";
import { hasHubNoStoreDirective } from "@/hub/client";
import { parsePersonalSkillHistoryJson } from "@/hub/personal-skill-history.schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const jsonType = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/** The one public Skill list entry forwards its native bearer, never a Product Session. */
export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string) =>
    NextResponse.json(
      { ok: false, request_id: requestId, error: { code, message: code } },
      {
        status,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  const config = iamRelayConfig(process.env),
    domain = configuredDomain();
  if (!config || !domain) return fail(503, "Unavailable");
  if (request.method !== "GET") return fail(405, "MethodNotAllowed");
  if (!matchesCanonicalWebRequest(request, config, "GET"))
    return fail(403, "PermissionDenied");
  const url = new URL(request.url);
  if (
    url.pathname !== publicSkillListProvenance.path ||
    request.headers.has("transfer-encoding") ||
    request.headers.has("idempotency-key") ||
    (request.headers.has("content-length") &&
      request.headers.get("content-length") !== "0") ||
    request.body !== null
  )
    return fail(400, "InvalidArgument");
  const entries: Array<[string, string]> = [];
  for (const key of new Set(url.searchParams.keys())) {
    if (url.searchParams.getAll(key).length !== 1)
      return fail(400, "InvalidArgument");
    entries.push([key, url.searchParams.get(key)!]);
  }
  const query = Object.fromEntries(entries);
  const parsedQuery = zListSkillsQuery.safeParse(query);
  if (!parsedQuery.success || !isDeepStrictEqual(parsedQuery.data, query))
    return fail(400, "InvalidArgument");
  const bearer = request.headers.get("authorization");
  if (bearer === null || !/^Bearer [^\s,]+$/iu.test(bearer))
    return fail(401, "skill_list_authentication_required");
  const deadline = new AbortController(),
    joined = AbortSignal.any([request.signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(), 10_000);
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
    upstream = await within(
      requestWithDomain(
        `${config.bffOrigin}${publicSkillListProvenance.path}${url.search}`,
        domain,
        {
          method: "GET",
          headers: {
            authorization: bearer,
            accept: "application/json",
            "x-kokoro-service": "web-bff",
            "x-kokoro-internal-secret": config.secret,
            "x-kokoro-request-id": requestId,
          },
          signal: joined,
          timeoutMs: 10_000,
          maxResponseBytes: DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES,
        },
      ).then((value) => {
        if (joined.aborted) void value.body?.cancel().catch(() => undefined);
        return value;
      }),
    );
    if (upstream === undefined) return fail(503, "Unavailable");
    const ownerId = upstream.headers.get("x-request-id"),
      retryAfter = upstream.headers.get("retry-after");
    if (
      !ownerId ||
      !requestIdPattern.test(ownerId) ||
      !hasHubNoStoreDirective(upstream.headers) ||
      !jsonType.test(upstream.headers.get("content-type") ?? "") ||
      upstream.body === null ||
      !publicSkillListProvenance.statuses.some(
        (status) => status === upstream!.status,
      )
    )
      return fail(502, "InvalidResponse");
    if (
      retryAfter !== null &&
      (upstream.status !== 429 ||
        !/^[1-9][0-9]{0,4}$/u.test(retryAfter) ||
        Number(retryAfter) > 86400)
    )
      return fail(502, "InvalidResponse");
    const declared = upstream.headers.get("content-length");
    if (
      declared !== null &&
      (!/^(0|[1-9][0-9]*)$/u.test(declared) ||
        Number(declared) > DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES)
    )
      return fail(502, "InvalidResponse");
    const reader = upstream.body.getReader(),
      chunks: Uint8Array[] = [];
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
        if (size > DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES)
          return fail(502, "InvalidResponse");
        chunks.push(part.value);
      }
    } finally {
      joined.removeEventListener("abort", cancel);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (declared !== null && Number(declared) !== size)
      return fail(502, "InvalidResponse");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let raw: unknown;
    try {
      raw = parsePersonalSkillHistoryJson(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      return fail(502, "InvalidResponse");
    }
    const parsed = (
      upstream.status === 200 ? zListSkillsResponse : zSpecificationPublicError
    ).safeParse(raw);
    if (
      !parsed.success ||
      !isDeepStrictEqual(parsed.data, raw) ||
      parsed.data.request_id !== ownerId ||
      parsed.data.ok !== (upstream.status === 200)
    )
      return fail(502, "InvalidResponse");
    joined.throwIfAborted();
    return NextResponse.json(raw, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": ownerId,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      },
    });
  } catch (error) {
    return error instanceof UpstreamResponseTooLargeError
      ? fail(502, "InvalidResponse")
      : fail(503, "Unavailable");
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
