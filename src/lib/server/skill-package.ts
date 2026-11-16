import { parsePersonalSkillHistoryJson } from "@/hub/personal-skill-history.schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import { requestWithDomain } from "@/lib/server/upstream-http";
import {
  installationIdSchema,
  catalogPackageResponseSchema,
  catalogPackageErrorSchema,
  catalogPackagePathSchema,
  CATALOG_PACKAGE_ERRORS,
  catalogPackageMatches,
  installationPackageErrorAllowed,
} from "@/hub/schemas";
import { skillDownloadSchema, skillDownloadErrorAllowed } from "@/hub/skill-download.schema";
import {
  type ProjectionFault,
  PROJECTION_FAILURES,
  projectionError,
  PROJECTION_REQUEST_ID,
  JSON_MEDIA_TYPE,
  MCP_CONNECTION_ID,
} from "@/lib/server/hub-projection";

export async function proxySkillPackage(
  request: Request,
  path: string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const installation = path[0] === "skill-installations";
  const managed = path[0] === "self" && path[1] === "skills" && path[2] === "managed";
  const prefix = managed ? "self/skills/managed" : installation ? "skill-installations" : "skills";
  const download = (installation || managed) && path.at(-1) === "download";
  const fail = (fault: ProjectionFault) => {
    if ((!installation && !managed) || download) return projectionError(fault, requestId);
    const base = PROJECTION_FAILURES[fault];
    const code = fault === "invalidSkillRequest" ? "invalid_skill_package_request"
      : fault === "invalidOwnerResponse" ? "skill_package_response_invalid"
      : ["bffUnavailable", "bffNotConfigured"].includes(fault) ? "skill_package_dependency_unavailable" : base.code;
    return NextResponse.json({ error: { code, message: code, retryable: base.status === 503 } }, { status: base.status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  };
  const targetId = path[managed ? 3 : 1] ?? "";
  const url = new URL(request.url);
  if (
    request.method !== (download ? "POST" : "GET") ||
    path.length !== (managed ? 5 : 3) ||
    (!managed && !installation && path[0] !== "skills") ||
    path.at(-1) !== (download ? "download" : "package") ||
    !(installation ? installationIdSchema.safeParse(targetId).success : MCP_CONNECTION_ID.test(targetId)) ||
    url.pathname !==
      `/api/hub/${prefix}/${encodeURIComponent(targetId)}/${download ? "download" : "package"}` ||
    (!download && request.body !== null) ||
    url.hash ||
    (download && url.search !== "") ||
    ((installation || managed) && /%(?![0-9A-Fa-f]{2})/u.test(url.search)) ||
    [...url.searchParams.keys()].some((key) => key !== "file_path") ||
    url.searchParams.getAll("file_path").length > 1 ||
    [...(download ? [] : ["content-length"]), "transfer-encoding", "idempotency-key"].some((header) =>
      request.headers.has(header),
    )
  )
    return fail("invalidSkillRequest");
  if (download && request.headers.has("content-length") && request.headers.get("content-length") !== "0") return fail("invalidSkillRequest");
  const filePath = url.searchParams.get("file_path") ?? undefined;
  if (
    filePath !== undefined &&
    !catalogPackagePathSchema.safeParse(filePath).success
  )
    return fail("invalidSkillRequest");
  const config = productBffConfig();
  if (config === null) return fail("configuration");
  if (
    (download || request.headers.has("origin")) &&
    request.headers.get("origin") !== config.session.webOrigin
  )
    return fail("forbidden");
  const deadline = new AbortController();
  const joined = AbortSignal.any([request.signal, deadline.signal]);
  const expires = Date.now() + 10_000;
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
    if (download && request.body !== null) {
      const reader = request.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      joined.addEventListener("abort", cancel, { once: true });
      try {
        for (;;) { const part = await within(reader.read()); joined.throwIfAborted(); if (part.done) break; if (part.value.byteLength > 0) return fail("invalidSkillRequest"); }
      } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock(); }
    }

    joined.throwIfAborted();
    const headers = productBffHeaders(config, request, requestId);
    headers.set("accept", "application/json");
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/${download ? "browser/v1" : "v1"}/${managed && !download ? "self/skills" : installation ? "skill-installations" : "skills"}/${encodeURIComponent(targetId)}/${download ? "download" : "package"}${filePath === undefined ? "" : `?file_path=${encodeURIComponent(filePath)}`}`;
    upstream = await within(
      requestWithDomain(target, config.domain, {
        method: download ? "POST" : "GET",
        headers: Object.fromEntries(headers),
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
      raw = managed ? parsePersonalSkillHistoryJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      return fail("invalidOwnerResponse");
    }
    joined.throwIfAborted();
    if (upstream.status === 200) {
      if (download) {
        const parsed = z.object({ data: skillDownloadSchema }).strict().safeParse(raw);
        if (!parsed.success || managed && parsed.data.data.source_ref !== `skill:${targetId}` || Date.parse(parsed.data.data.download_info.expires_at) <= Date.now()) return fail("invalidOwnerResponse");
      } else {
        const parsed = catalogPackageResponseSchema.safeParse(raw);
        if (!parsed.success || !(installation
          ? filePath === undefined ? parsed.data.data.selected_file === null : parsed.data.data.selected_file?.path === filePath
          : catalogPackageMatches(parsed.data.data, targetId, filePath))) return fail("invalidOwnerResponse");
      }
    } else {
      const parsed = catalogPackageErrorSchema.safeParse(raw);
      if (
        !parsed.success ||
        !(download ? skillDownloadErrorAllowed(upstream.status, parsed.data.error.code)
          : installation || managed ? installationPackageErrorAllowed(upstream.status, parsed.data.error.code, parsed.data.error.retryable, upstream.headers.get("retry-after"))
          : CATALOG_PACKAGE_ERRORS[upstream.status]?.includes(parsed.data.error.code))
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
    if (download && deadline.signal.aborted) return NextResponse.json({ error: { code: "skill_deadline_exceeded", message: "Skill download deadline exceeded", retryable: true } }, { status: 504, headers: { "cache-control": "private, no-store", "x-request-id": requestId } });
    return fail("bffUnavailable");
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
