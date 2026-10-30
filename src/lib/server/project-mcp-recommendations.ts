import { NextResponse } from "next/server";
import { hasHubNoStoreDirective } from "@/hub/client";
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json";
import {
  projectMcpRecommendationIdSchema,
  projectMcpRecommendationsRequestSchema,
  parseProjectMcpRecommendationsResponse,
  projectMcpRecommendationsErrorAllowed,
  type ProjectMcpRecommendationsInput,
} from "@/generated/bff-project-mcp-recommendations";
import { projectRenameBrowserCacheControl } from "@/contract/project-rename";
import { sameOriginOk } from "./same-origin";
import {
  admittedProductSession,
  productBffConfig,
  productBffHeaders,
} from "./product-bff";
import {
  readBoundedRequestBody,
  requestWithDomain,
  UpstreamResponseIncompleteError,
  UpstreamResponseTooLargeError,
} from "./upstream-http";

/** Exact BFF Project configuration only, never a Platform/Connection/definition-publication adapter. */
export async function proxyProjectMcpRecommendations(
  request: Request,
  path: readonly string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) =>
    NextResponse.json(
      { error: { code, message: code, retryable } },
      {
        status,
        headers: {
          "cache-control": projectRenameBrowserCacheControl,
          "x-request-id": requestId,
        },
      },
    );
  const url = new URL(request.url),
    put = request.method === "PUT",
    projectId = path[1];
  if (!["GET", "PUT"].includes(request.method))
    return fail(405, "method_not_allowed");
  if (
    path.length !== 3 ||
    path[0] !== "projects" ||
    path[2] !== "mcp-recommendations" ||
    !projectMcpRecommendationIdSchema.safeParse(projectId).success ||
    url.pathname !==
      `/api/hub/projects/${encodeURIComponent(projectId!)}/mcp-recommendations` ||
    request.url.includes("?") ||
    url.hash ||
    request.headers.has("idempotency-key") ||
    request.headers.has("transfer-encoding")
  )
    return fail(400, "project_mcp_recommendations_request_invalid");
  if (put && !sameOriginOk(request)) return fail(403, "session_forbidden");
  if (
    !put &&
    ["content-type", "content-length"].some((key) => request.headers.has(key))
  )
    return fail(400, "project_mcp_recommendations_request_invalid");
  const declared = request.headers.get("content-length");
  if (
    put &&
    (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
      request.headers.get("content-type") ?? "",
    ) ||
      (declared !== null &&
        (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 16384)))
  )
    return fail(400, "project_mcp_recommendations_request_invalid");
  const controller = new AbortController(),
    signal = AbortSignal.any([request.signal, controller.signal]),
    deadlineAt = performance.now() + 10000;
  const timer = setTimeout(() => controller.abort(), 10000);
  let upstream: Response | undefined;
  const check = () => {
    signal.throwIfAborted();
    if (performance.now() >= deadlineAt) throw Error("recommendation_deadline");
  };
  const within = <T>(work: Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
      void work
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", stop));
      if (signal.aborted) stop();
    });
  try {
    check();
    const config = productBffConfig();
    if (!config?.bffBaseUrl)
      return fail(503, "product_tenant_not_configured", true);
    let claims;
    try {
      claims = await within(admittedProductSession(request, config));
    } catch {
      check();
      return fail(503, "iam_admission_unavailable", true);
    }
    check();
    if (claims === null) return fail(401, "session_authentication_required");
    let body: ArrayBuffer;
    try {
      body = await within(readBoundedRequestBody(request, 16384, signal));
    } catch {
      check();
      return fail(400, "project_mcp_recommendations_request_invalid");
    }
    check();
    let original: ProjectMcpRecommendationsInput | undefined;
    if (put) {
      if (declared !== null && Number(declared) !== body.byteLength)
        return fail(400, "project_mcp_recommendations_request_invalid");
      try {
        original = projectMcpRecommendationsRequestSchema.parse(
          parseMcpConnectorJson(
            new TextDecoder("utf-8", { fatal: true }).decode(body),
          ),
        );
      } catch {
        return fail(400, "project_mcp_recommendations_request_invalid");
      }
    } else if (body.byteLength)
      return fail(400, "project_mcp_recommendations_request_invalid");
    const headers = productBffHeaders(config, claims, requestId);
    if (put) {
      headers.set("content-type", "application/json");
      headers.set("content-length", String(body.byteLength));
    }
    check();
    upstream = await within(
      requestWithDomain(
        `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/projects/${encodeURIComponent(projectId!)}/mcp-recommendations`,
        config.domain,
        {
          method: request.method,
          headers,
          signal,
          timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())),
          maxRequestBytes: 16384,
          maxResponseBytes: 65536,
          ...(put ? { body } : {}),
        },
      ).then((value) => {
        if (signal.aborted) void value.body?.cancel().catch(() => undefined);
        return value;
      }),
    );
    check();
    if (upstream === undefined) return fail(503, "project_mcp_recommendations_dependency_unavailable", true);
    const ownerId = upstream.headers.get("x-request-id"),
      length = upstream.headers.get("content-length"),
      retryAfter = upstream.headers.get("retry-after");
    const invalid = () =>
      fail(502, "project_mcp_recommendations_response_invalid");
    if (
      !hasHubNoStoreDirective(upstream.headers) ||
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
        upstream.headers.get("content-type") ?? "",
      ) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(ownerId ?? "") ||
      upstream.body === null ||
      (length !== null &&
        (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > 65536)) ||
      (retryAfter !== null &&
        (upstream.status !== 429 ||
          !/^[1-9][0-9]{0,4}$/u.test(retryAfter) ||
          Number(retryAfter) > 86400))
    )
      return invalid();
    const reader = upstream.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        const next = await within(reader.read());
        check();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 65536) return invalid();
        chunks.push(next.value);
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
    if (length !== null && size !== Number(length)) return invalid();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let raw: unknown;
    try {
      raw = parseMcpConnectorJson(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      if (upstream.status === 200)
        parseProjectMcpRecommendationsResponse(raw, projectId!, original);
      else if (!projectMcpRecommendationsErrorAllowed(upstream.status, raw, put ? "PUT" : "GET"))
        return invalid();
    } catch {
      return invalid();
    }
    check();
    return NextResponse.json(raw, {
      status: upstream.status,
      headers: {
        "cache-control": projectRenameBrowserCacheControl,
        "x-request-id": ownerId!,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      },
    });
  } catch (error) {
    return fail(
      error instanceof UpstreamResponseIncompleteError ||
        error instanceof UpstreamResponseTooLargeError
        ? 502
        : 503,
      error instanceof UpstreamResponseIncompleteError ||
        error instanceof UpstreamResponseTooLargeError
        ? "project_mcp_recommendations_response_invalid"
        : "project_mcp_recommendations_dependency_unavailable",
      !(
        error instanceof UpstreamResponseIncompleteError ||
        error instanceof UpstreamResponseTooLargeError
      ),
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
