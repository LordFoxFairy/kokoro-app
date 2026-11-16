// Existing terminal BFF forwarding profile. Closed operation checks retain their original order.
// Native admission headers come only from productBffHeaders; additional headers remain allowlisted.
import {
  parsePersonalSkillHistoryJson,
  personalSkillHistoryResponseSchema,
  personalSkillHistoryErrorSchema,
  personalSkillHistoryErrorAllowed,
} from "@/hub/personal-skill-history.schema";
import {
  updateSkillDraftRequestSchema,
  mcpConnectionPageSchema,
  mcpConnectionReadErrorSchema,
  mcpConnectionErrorAllowed,
  skillPublishRequestSchema,
} from "@/hub/schemas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOriginOk } from "@/lib/server/same-origin";
import { InvalidBrowserCookieError, productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import {
  readBoundedRequestBody,
  requestWithDomain,
  UpstreamRequestTooLargeError,
  UpstreamTimeoutError,
} from "@/lib/server/upstream-http";
import {
  type ProjectionFault,
  PROJECTION_FAILURES,
  projectionError,
  connectionProjectionError,
  PROJECTION_REQUEST_ID,
  JSON_MEDIA_TYPE,
  MAX_SKILL_COMMAND_BYTES,
  MCP_CONNECTION_ID,
} from "@/lib/server/hub-projection";
import {
  MAX_PERSONAL_DOWNLOAD_BYTES,
  MAX_ARTIFACT_DOWNLOAD_BYTES,
  personalDownloadHeaders,
  artifactDownloadHeaders,
  invalidPersonalDownloadResponse,
  invalidArtifactDownloadResponse,
  boundedArtifactBody,
} from "@/lib/server/hub-download";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const FORWARD_HEADERS = ["accept", "content-type", "idempotency-key"] as const;

function bffBusinessPath(path: string[]): string[] {
  // Preserve the browser-facing Hub namespace and translate it only at the
  // Web-to-BFF boundary. The BFF owns the business path after this point.
  if (path[0] === "self" && path[1] !== undefined) return path.slice(1);
  return path;
}

export async function proxyHubBff(request: Request, path: string[]): Promise<Response> {
  const search = new URL(request.url).search;
  const businessPath = bffBusinessPath(path ?? []);
  if (path[0] !== "self" && businessPath[0] === "skills") {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  const managedSkillPath =
    path[0] === "self" && path[1] === "skills" && path[2] === "managed";
  const managedHistoryRead = managedSkillPath && path.length === 5 && path[4] === "versions";
  const managedSkillRead =
    managedSkillPath &&
    request.method === "GET" &&
    (path.length === 3 || path.length === 4 || managedHistoryRead);
  if (managedSkillPath && !managedSkillRead)
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  if (
    request.method === "GET" &&
    path[0] === "self" &&
    businessPath[0] === "skills" &&
    (businessPath.length === 1 ||
      (businessPath.length === 2 && !managedSkillRead))
  )
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  const mcpConnectionRead =
    request.method === "GET" &&
    path[0] === "mcp" &&
    businessPath.length === 2 &&
    businessPath[0] === "mcp" &&
    businessPath[1] === "connections";
  const publicProjectionRead = mcpConnectionRead;
  const formalSkillId = businessPath[1] ?? "";
  const skillUploadGet =
    request.method === "GET" &&
    path[0] === "self" &&
    businessPath.length === 3 &&
    businessPath[0] === "skills" &&
    businessPath[2] === "package-upload";
  const skillDraftPost =
    request.method === "POST" &&
    path[0] === "self" &&
    businessPath.length === 2 &&
    businessPath[0] === "skills" &&
    businessPath[1] === "drafts";
  const skillDraftPatch =
    request.method === "PATCH" &&
    path[0] === "self" &&
    businessPath.length === 3 &&
    businessPath[0] === "skills" &&
    businessPath[2] === "draft";
  const skillWritePost =
    request.method === "POST" &&
    path[0] === "self" &&
    businessPath[0] === "skills" &&
    ((businessPath.length === 3 &&
      ["package-upload", "validate", "publish"].includes(
        businessPath[2] ?? "",
      )) ||
      (businessPath.length === 4 &&
        businessPath[2] === "package-upload" &&
        businessPath[3] === "complete"));
  const publicSkillBoundary =
    managedSkillRead ||
    publicProjectionRead ||
    skillUploadGet ||
    skillDraftPost ||
    skillDraftPatch ||
    skillWritePost;
  const incomingRequestId = request.headers.get("x-kokoro-request-id");
  const requestId = publicSkillBoundary
    ? incomingRequestId !== null &&
      PROJECTION_REQUEST_ID.test(incomingRequestId)
      ? incomingRequestId
      : crypto.randomUUID()
    : incomingRequestId || crypto.randomUUID();
  const localSkillError = (fault: ProjectionFault, id: string): Response => {
    if (!managedSkillRead) return projectionError(fault, id);
    const { status, code } = PROJECTION_FAILURES[fault];
    const managedCode =
      code === "invalid_query_parameter" ? "invalid_skill_request" : code;
    return NextResponse.json(
      {
        error: { code: managedCode, message: managedCode },
        meta: { request_id: id },
      },
      { status, headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  };
  const config = productBffConfig();
  if (config === null) {
    if (publicSkillBoundary)
      return mcpConnectionRead
        ? connectionProjectionError("configuration", requestId)
        : localSkillError("configuration", requestId);
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }
  if (config.bffBaseUrl == null) {
    // 未接 hub 节点（预览档）：能力面不可用，展示层据此降级。
    if (publicSkillBoundary)
      return mcpConnectionRead
        ? connectionProjectionError("bffNotConfigured", requestId)
        : localSkillError("bffNotConfigured", requestId);
    return NextResponse.json({ error: "hub_not_configured" }, { status: 503 });
  }
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) {
    if (publicSkillBoundary)
      return mcpConnectionRead
        ? connectionProjectionError("forbidden", requestId)
        : localSkillError("forbidden", requestId);
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  // The multipart preview/confirm and GitHub pseudo-publish routes belong to
  // explicit local fixtures only; they are not a production publish fallback.
  if (
    path[0] === "self" &&
    businessPath[0] === "skills" &&
    ["upload", "github"].includes(businessPath[1] ?? "")
  ) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  if (
    request.method === "GET" &&
    path[0] === "self" &&
    ((businessPath[0] === "skills" &&
      ["pool", "catalog", "quota"].includes(businessPath[1] ?? "")) ||
      (businessPath[0] === "mcp" &&
        ["servers", "secrets"].includes(businessPath[1] ?? "")))
  )
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  if (managedSkillRead) {
    const query = new URLSearchParams(search);
    if (managedHistoryRead && ([...query.keys()].some(key => !["limit", "cursor"].includes(key) || query.getAll(key).length !== 1) || (query.has("limit") && !/^(?:[1-9][0-9]?|100)$/u.test(query.get("limit") ?? "")) || (query.has("cursor") && (!query.get("cursor") || query.get("cursor")!.length > 2048)))) return localSkillError("invalidQuery",requestId);
    if (
      (path.length === 4 || managedHistoryRead) &&
      (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(path[3] ?? "") ||
        (!managedHistoryRead && search !== ""))
    )
      return localSkillError("invalidQuery", requestId);
    if (
      path.length === 3 &&
      ([...query.keys()].some(
        (key) =>
          !["status", "limit", "cursor"].includes(key) ||
          query.getAll(key).length !== 1,
      ) ||
        !["draft", "active"].includes(query.get("status") ?? "") ||
        (query.has("limit") &&
          !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(query.get("limit") ?? "")) ||
        (query.has("cursor") &&
          (!query.get("cursor") || query.get("cursor")!.length > 2048)))
    )
      return localSkillError("invalidQuery", requestId);
    if (
      request.headers.has("idempotency-key") ||
      request.headers.has("transfer-encoding") ||
      (request.headers.has("content-length") &&
        request.headers.get("content-length") !== "0")
    )
      return localSkillError("invalidQuery", requestId);
  }
  if (publicProjectionRead) {
    if (
      mcpConnectionRead &&
      ((request.headers.get("content-length") !== null &&
        request.headers.get("content-length") !== "0") ||
        request.headers.has("transfer-encoding") ||
        request.headers.has("idempotency-key"))
    ) {
      return connectionProjectionError("invalidQuery", requestId);
    }
    const query = new URLSearchParams(search);
    const allowed = mcpConnectionRead
      ? ["connection_id", "provider_key", "limit", "cursor"]
      : [];
    const invalidQuery =
      [...query.keys()].some(
        (key) => !allowed.includes(key) || query.getAll(key).length !== 1,
      ) ||
      (query.has("cursor") &&
        (query.get("cursor") === "" ||
          [...(query.get("cursor") ?? "")].length >
            (mcpConnectionRead ? 2048 : 4096))) ||
      (mcpConnectionRead &&
        query.has("connection_id") &&
        !MCP_CONNECTION_ID.test(query.get("connection_id") ?? "")) ||
      (mcpConnectionRead &&
        query.has("provider_key") &&
        (query.get("provider_key") === "" ||
          [...(query.get("provider_key") ?? "")].length > 191)) ||
      (mcpConnectionRead &&
        query.has("limit") &&
        !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(query.get("limit") ?? ""));
    if (invalidQuery)
      return mcpConnectionRead
        ? connectionProjectionError("invalidQuery", requestId)
        : localSkillError("invalidQuery", requestId);
  }
  if (skillUploadGet || skillDraftPost || skillDraftPatch || skillWritePost) {
    if (
      search !== "" ||
      ((skillUploadGet || skillDraftPatch || skillWritePost) &&
        !PROJECTION_REQUEST_ID.test(formalSkillId))
    )
      return localSkillError("invalidSkillRequest", requestId);
    if (
      (skillDraftPost || skillDraftPatch || skillWritePost) &&
      !/^[\x21-\x2B\x2D-\x7E]{1,128}$/u.test(
        request.headers.get("idempotency-key") ?? "",
      )
    )
      return localSkillError("invalidSkillRequest", requestId);
  }
  const personalDownload =
    request.method === "GET" &&
    businessPath.length === 4 &&
    businessPath[0] === "library" &&
    businessPath[1] === "files" &&
    businessPath[3] === "content";
  const artifactDownload =
    request.method === "GET" &&
    businessPath.length === 5 &&
    businessPath[0] === "library" &&
    businessPath[1] === "artifacts" &&
    businessPath[4] === "content";
  if (personalDownload && path[0] === "self")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (artifactDownload && path[0] === "self")
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (
    personalDownload &&
    (search !== "" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(businessPath[2] ?? ""))
  ) {
    return NextResponse.json(
      { error: "invalid_library_file" },
      { status: 400 },
    );
  }
  if (
    artifactDownload &&
    (search !== "" ||
      ![businessPath[2], businessPath[3]].every((id) =>
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id ?? ""),
      ))
  ) {
    return NextResponse.json(
      { error: "invalid_library_artifact" },
      { status: 400 },
    );
  }
  // Project item operations retain their own Project authorization at BFF. Only
  // the existing verified attachment byte transport is shared with Artifact.
  const projectResourceItem = businessPath[0] === "projects" && businessPath[2] === "resources" && businessPath.length >= 4;
  const projectResourceDownload = projectResourceItem && businessPath.length === 5 && businessPath[4] === "download" && request.method === "GET";
  if (projectResourceItem && (path[0] === "self" || search !== "" || ![businessPath[1], businessPath[3]].every(id => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id ?? ""))
    || !(businessPath.length === 4 && ["GET", "DELETE"].includes(request.method) || projectResourceDownload)
    || request.method === "GET" && request.body !== null || request.headers.has("content-type") || request.headers.has("transfer-encoding") || request.headers.has("content-encoding")
    || request.headers.has("content-length") && (request.method === "GET" || request.headers.get("content-length") !== "0")
    || request.method === "GET" && request.headers.has("idempotency-key")
    || request.method === "DELETE" && !/^[\x21-\x7e]{1,191}$/u.test(request.headers.get("idempotency-key") ?? ""))) {
    return NextResponse.json({ error: "invalid_project_resource" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  }
  if (projectResourceItem && request.method === "DELETE") {
    // Next may represent an empty DELETE as a non-null stream. Require real
    // zero-byte EOF, not a null-body assumption, before any owner mutation.
    const deadline = new AbortController();
    const signal = AbortSignal.any([request.signal, deadline.signal]);
    const timer = setTimeout(() => deadline.abort(new UpstreamTimeoutError()), 10_000);
    let stop = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      stop = () => reject(signal.reason ?? new DOMException("Request aborted", "AbortError"));
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
    });
    try {
      signal.throwIfAborted();
      await Promise.race([readBoundedRequestBody(request, 0, signal), interrupted]);
      signal.throwIfAborted();
    } catch {
      return NextResponse.json({ error: "invalid_project_resource" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    }
  }
  const verifiedAttachmentDownload = artifactDownload || projectResourceDownload;
  const boundedFileUpload =
    request.method === "POST" &&
    ((businessPath.length === 3 &&
      businessPath[0] === "projects" &&
      businessPath[2] === "resources") ||
      (businessPath.length === 2 &&
        businessPath[0] === "library" &&
        businessPath[1] === "files"));
  const encodedBusinessPath = businessPath
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const target = `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${managedSkillRead ? `self/skills${path.length >= 4 ? `/${encodeURIComponent(path[3]!)}${managedHistoryRead ? "/versions" : ""}` : ""}` : encodedBusinessPath}${search}`;

  let body: ArrayBuffer | undefined;
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "DELETE"
  ) {
    try {
      body = await readBoundedRequestBody(
        request,
        boundedFileUpload
          ? 1024 * 1024
          : publicSkillBoundary
            ? MAX_SKILL_COMMAND_BYTES
            : undefined,
      );
      if (skillDraftPatch || (skillWritePost && businessPath[2] === "publish")) {
        if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? ""))
          return localSkillError("invalidSkillRequest", requestId);
        let raw: unknown;
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
          raw = skillDraftPatch
            ? parsePersonalSkillHistoryJson(text)
            : JSON.parse(text) as unknown;
        } catch {
          return localSkillError("invalidSkillRequest", requestId);
        }
        const schema = skillDraftPatch
          ? updateSkillDraftRequestSchema
          : skillPublishRequestSchema;
        if (!schema.safeParse(raw).success)
          return localSkillError("invalidSkillRequest", requestId);
      }
    } catch (error) {
      if (publicSkillBoundary)
        return localSkillError(
          error instanceof UpstreamRequestTooLargeError
            ? "tooLarge"
            : "invalidSkillRequest",
          requestId,
        );
      return NextResponse.json(
        {
          error:
            error instanceof UpstreamRequestTooLargeError
              ? "request_body_too_large"
              : "request_body_unreadable",
        },
        {
          status: error instanceof UpstreamRequestTooLargeError ? 413 : 400,
          // Web-owned provenance: this branch has not sent anything to BFF.
          // Generic upstream response forwarding deliberately excludes it.
          headers: boundedFileUpload && error instanceof UpstreamRequestTooLargeError
            ? { "x-kokoro-local-upload-validation": "request-body-too-large" } : {},
        },
      );
    }
  }

  let upstream: Response;
  try {
    const headers = productBffHeaders(config, request, requestId);
    for (const name of FORWARD_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    upstream = await requestWithDomain(target, config.domain, {
      method: request.method,
      headers: Object.fromEntries(headers.entries()),
      ...(body !== undefined ? { body } : {}),
      signal: request.signal,
      ...(personalDownload
        ? { maxResponseBytes: MAX_PERSONAL_DOWNLOAD_BYTES }
        : {}),
      ...(verifiedAttachmentDownload
        ? {
            maxResponseBytes: MAX_ARTIFACT_DOWNLOAD_BYTES,
            maxErrorResponseBytes: 16 * 1024 * 1024,
            timeoutMs: 600_000,
            streamTotalTimeoutMs: 1_800_000,
            streamIdleTimeoutMs: 30_000,
            errorResponseTimeoutMs: 15_000,
            strictResponseLength: true,
          }
        : {}),
      ...(boundedFileUpload
        ? { timeoutMs: 50_000, maxRequestBytes: 1024 * 1024 }
        : {}),
      ...(publicSkillBoundary
        ? { timeoutMs: 10_000, maxResponseBytes: 1024 * 1024 }
        : {}),
    });
  } catch (error) {
    if (error instanceof InvalidBrowserCookieError) {
      if (publicSkillBoundary)
        return mcpConnectionRead
          ? connectionProjectionError("invalidQuery", requestId)
          : localSkillError("invalidQuery", requestId);
      return NextResponse.json({ error: "invalid_browser_cookie" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    }
    if (publicSkillBoundary)
      return mcpConnectionRead
        ? connectionProjectionError("bffUnavailable", requestId)
        : localSkillError("bffUnavailable", requestId);
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 });
  }

  if (personalDownload) {
    if (upstream.status >= 300 && upstream.status < 400)
      return invalidPersonalDownloadResponse();
    if (upstream.status === 200) {
      const safeHeaders = personalDownloadHeaders(upstream.headers);
      if (safeHeaders === null) {
        await upstream.body?.cancel();
        return invalidPersonalDownloadResponse();
      }
      try {
        const bytes = new Uint8Array(await upstream.arrayBuffer());
        if (
          request.signal.aborted ||
          bytes.byteLength !== Number(safeHeaders.get("content-length"))
        )
          return invalidPersonalDownloadResponse();
        return new Response(bytes, { status: 200, headers: safeHeaders });
      } catch {
        return invalidPersonalDownloadResponse();
      }
    }
  }

  if (verifiedAttachmentDownload) {
    const invalidDownload = () => projectResourceDownload
      ? NextResponse.json({ error: "project_resource_invalid_response" }, { status: 502, headers: { "cache-control": "private, no-store" } })
      : invalidArtifactDownloadResponse();
    if (upstream.status < 400 && upstream.status !== 200) {
      await upstream.body?.cancel();
      return invalidDownload();
    }
    if (upstream.status === 200) {
      const safeHeaders = artifactDownloadHeaders(upstream.headers, artifactDownload);
      if (safeHeaders === null || upstream.body === null) {
        await upstream.body?.cancel();
        return invalidDownload();
      }
      return new Response(
        boundedArtifactBody(
          upstream.body,
          Number(safeHeaders.get("content-length")),
          request.signal,
        ),
        { status: 200, headers: safeHeaders },
      );
    }
    const errorHeaders = new Headers({
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    const contentType = upstream.headers.get("content-type");
    if (
      contentType !== null &&
      /^application\/json(?:;\s*charset=utf-8)?$/iu.test(contentType)
    )
      errorHeaders.set("content-type", contentType);
    const ownerRequestId = upstream.headers.get("x-request-id");
    if (
      ownerRequestId !== null &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(ownerRequestId)
    )
      errorHeaders.set("x-request-id", ownerRequestId);
    const retryAfter = upstream.headers.get("retry-after");
    if (
      upstream.status === 429 &&
      retryAfter !== null &&
      /^[1-9][0-9]{0,4}$/u.test(retryAfter)
    )
      errorHeaders.set("retry-after", retryAfter);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: errorHeaders,
    });
  }

  if (publicSkillBoundary) {
    const upstreamRequestId = upstream.headers.get("x-request-id");
    const upstreamContentType = upstream.headers.get("content-type");
    const expectedSuccess =
      skillDraftPost ||
      (skillWritePost &&
        businessPath[2] === "package-upload" &&
        businessPath.length === 3)
        ? 201
        : 200;
    const allowedSkillErrors = managedSkillRead
      ? [400, 401, 403, 404, 429, 502, 503]
      : skillDraftPost
        ? [400, 401, 403, 409, 412, 413, 429, 502, 503]
        : skillUploadGet
          ? [400, 401, 403, 404, 412, 429, 502, 503]
          : [400, 401, 403, 404, 409, 412, 413, 429, 502, 503];
    if (
      (upstream.status >= 200 &&
        upstream.status < 300 &&
        upstream.status !== expectedSuccess) ||
      (upstream.status >= 300 && upstream.status < 400) ||
      ((managedSkillRead ||
        skillDraftPost ||
        skillDraftPatch ||
        skillUploadGet ||
        skillWritePost) &&
        upstream.status >= 400 &&
        !allowedSkillErrors.includes(upstream.status)) ||
      upstream.headers.get("cache-control") !== "no-store" ||
      upstreamRequestId === null ||
      !PROJECTION_REQUEST_ID.test(upstreamRequestId) ||
      upstreamContentType === null ||
      !JSON_MEDIA_TYPE.test(upstreamContentType)
    ) {
      await upstream.body?.cancel();
      return mcpConnectionRead
        ? connectionProjectionError("invalidOwnerResponse", requestId)
        : localSkillError("invalidOwnerResponse", requestId);
    }
    if (mcpConnectionRead) {
      let raw: unknown;
      try {
        raw = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await upstream.arrayBuffer(),
          ),
        );
      } catch (error) {
        return connectionProjectionError(
          error instanceof UpstreamTimeoutError
            ? "bffUnavailable"
            : "invalidOwnerResponse",
          requestId,
        );
      }
      const error = mcpConnectionReadErrorSchema.safeParse(raw);
      const valid =
        upstream.status === 200
          ? z.object({ data: mcpConnectionPageSchema }).strict().safeParse(raw)
              .success
          : error.success &&
            mcpConnectionErrorAllowed(upstream.status, error.data.error.code);
      if (!valid)
        return connectionProjectionError("invalidOwnerResponse", requestId);
      const retryAfter =
        upstream.status === 429 ? upstream.headers.get("retry-after") : null;
      const validRetryAfter =
        retryAfter !== null &&
        /^[1-9][0-9]{0,4}(?![\s\S])/u.test(retryAfter) &&
        Number(retryAfter) <= 86400;
      return NextResponse.json(raw, {
        status: upstream.status,
        headers: {
          "cache-control": "no-store",
          "x-request-id": upstreamRequestId,
          ...(validRetryAfter ? { "retry-after": retryAfter } : {}),
        },
      });
    }
    if (managedHistoryRead) {
      let raw:unknown;
      try { raw=parsePersonalSkillHistoryJson(new TextDecoder("utf-8",{fatal:true}).decode(await upstream.arrayBuffer())); } catch (error) {return localSkillError(error instanceof UpstreamTimeoutError ? "bffUnavailable" : "invalidOwnerResponse",requestId);}
      const success=personalSkillHistoryResponseSchema.safeParse(raw), error=personalSkillHistoryErrorSchema.safeParse(raw);
      if (upstream.status===200 ? !success.success || success.data.meta.request_id!==upstreamRequestId : !error.success || error.data.meta.request_id!==upstreamRequestId || !personalSkillHistoryErrorAllowed(upstream.status,error.data.error.code)) return localSkillError("invalidOwnerResponse",requestId);
      return NextResponse.json(raw,{status:upstream.status,headers:{"cache-control":"no-store","x-request-id":upstreamRequestId}});
    }
    const projectionHeaders = new Headers({
      "cache-control": "no-store",
      "x-request-id": upstreamRequestId,
      "content-type": upstreamContentType,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: projectionHeaders,
    });
  }

  // 普通 Hub 响应只回传状态与内容类型，body 流式转发。
  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control", "content-length"]) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      responseHeaders.set(name, value);
    }
  }
  responseHeaders.set("cache-control", "private, no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
