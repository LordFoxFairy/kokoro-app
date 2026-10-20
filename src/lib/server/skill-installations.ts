import { NextResponse } from "next/server";
import { sameOriginOk } from "./same-origin";
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff";
import { readBoundedRequestBody, requestWithDomain, UpstreamTimeoutError, UpstreamRequestTooLargeError } from "./upstream-http";
import { projectSkillIdSchema } from "@/hub/project-skills.schema";
import { installationIdSchema, installationKeySchema, installationInstallRequestSchema, installationUpdateRequestSchema,
  installationEnabledRequestSchema, installationListQuerySchema, installationReceiptMatches, installationResponseSchema,
  installationErrorSchema, installationErrorAllowed, type InstallationOperation } from "@/hub/schemas";
const PROJECTION_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const JSON_MEDIA_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu;

// Dedicated Product installation boundary; never the permissive legacy Hub branch.
export async function proxyInstallation(
  request: Request,
  path: string[],
): Promise<Response> {
  const project = path[0] === "projects" && path[2] === "skill-installations";
  const upstreamPath = project ? path : path.slice(1);
  // Normalize segment positions only; transport keeps the explicit Project path.
  const target = project ? ["project", ...path.slice(2)] : path;
  const supplied = request.headers.get("x-kokoro-request-id");
  const requestId =
    supplied !== null && PROJECTION_REQUEST_ID.test(supplied)
      ? supplied
      : crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) =>
    NextResponse.json(
      { error: { code, message: code, retryable } },
      {
        status,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  if (project ? !projectSkillIdSchema.safeParse(path[1]).success : path[0] !== "self")
    return fail(404, "skill_installation_not_found");
  const operation: InstallationOperation | null =
    target.length === 2
      ? request.method === "POST"
        ? "install"
        : request.method === "GET"
          ? "list"
          : null
      : target.length === 3
        ? request.method === "GET"
          ? "get"
          : request.method === "DELETE"
            ? "remove"
            : null
        : target.length === 4 && target[3] === "enabled" && request.method === "PUT"
          ? "setEnabled"
          : target.length === 4 && target[3] === "update" && request.method === "POST"
            ? "update"
            : null;
  if (operation === null) return fail(404, "skill_installation_not_found");
  const mutation = ["install", "setEnabled", "remove", "update"].includes(operation);
  if (mutation && !sameOriginOk(request)) return fail(403, "session_forbidden");
  const deadline = new AbortController();
  const joined = AbortSignal.any([request.signal, deadline.signal]);
  const deadlineAt = performance.now() + 10_000;
  const timer = setTimeout(() => deadline.abort(new UpstreamTimeoutError()), 10_000);
  let upstream: Response | undefined;
  const within = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason);
    joined.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort));
    if (joined.aborted) abort();
  });
  try {
    joined.throwIfAborted();
    const config = productBffConfig();
    if (!config?.bffBaseUrl) return fail(503, "product_tenant_not_configured");
    let claims;
    try {
      claims = await within(admittedProductSession(request, config));
      joined.throwIfAborted();
    } catch {
      joined.throwIfAborted();
      return fail(503, "iam_admission_unavailable", true);
    }
    if (claims === null) return fail(401, "session_authentication_required");
    const query = new URL(request.url).searchParams;
    if (target.length > 2 && !installationIdSchema.safeParse(target[2]).success)
      return fail(400, "invalid_skill_installation_request");
    if (operation === "list") {
      if (
        [...query.keys()].some(
          (key) =>
            !["installed", "enabled", "limit", "cursor", "source_kind", "query"].includes(key) ||
            query.getAll(key).length !== 1,
        )
      )
        return fail(400, "invalid_skill_installation_request");
      const values: Record<string, unknown> = {};
      for (const [key, value] of query) {
        if (key === "installed" || key === "enabled") {
          if (value !== "true" && value !== "false")
            return fail(400, "invalid_skill_installation_request");
          values[key] = value === "true";
        } else if (key === "limit") {
          if (!/^[1-9][0-9]{0,2}(?![\s\S])/u.test(value))
            return fail(400, "invalid_skill_installation_request");
          values[key] = Number(value);
        } else values[key] = value;
      }
      if (!installationListQuerySchema.safeParse(values).success)
        return fail(400, "invalid_skill_installation_request");
    } else if (query.size) return fail(400, "invalid_skill_installation_request");
    const key = request.headers.get("idempotency-key");
    if (mutation ? !installationKeySchema.safeParse(key).success : key !== null)
      return fail(
        400,
        mutation
          ? "skill_installation_idempotency_key_required"
          : "invalid_skill_installation_request",
      );
    let expectedIdentity = target[2] ?? "";
    let expectedEnabled: boolean | undefined;
    let targetSourceRef: string | undefined;
    let body: ArrayBuffer;
    try {
      body = await within(readBoundedRequestBody(request, 65_536, joined));
      joined.throwIfAborted();
    } catch (error) {
      joined.throwIfAborted();
      return fail(
        error instanceof UpstreamRequestTooLargeError ? 413 : 400,
        error instanceof UpstreamRequestTooLargeError
          ? "request_body_too_large"
          : "invalid_skill_installation_request",
      );
    }
    if (["install", "setEnabled", "update"].includes(operation)) {
      if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? ""))
        return fail(400, "invalid_skill_installation_request");
      try {
        const value: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(body),
        );
        if (operation === "update") {
          targetSourceRef = installationUpdateRequestSchema.parse(value).source_ref;
        } else {
          const parsed = (operation === "install" ? installationInstallRequestSchema : installationEnabledRequestSchema).parse(value);
          if ("source_ref" in parsed) expectedIdentity = parsed.source_ref;
          else expectedEnabled = parsed.enabled;
        }
      } catch {
        return fail(400, "invalid_skill_installation_request");
      }
    } else if (body.byteLength !== 0)
      return fail(400, "invalid_skill_installation_request");
    const headers = productBffHeaders(config, claims, requestId);
    if (mutation && key !== null) headers.set("idempotency-key", key);
    if (["install", "setEnabled", "update"].includes(operation))
      headers.set("content-type", "application/json");
    try {
      joined.throwIfAborted();
      upstream = await within(requestWithDomain(
        `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${upstreamPath.map(encodeURIComponent).join("/")}${query.size ? `?${query}` : ""}`,
        config.domain,
        {
          method: request.method,
          headers: Object.fromEntries(headers),
          signal: joined,
          timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())),
          maxRequestBytes: 65_536,
          maxResponseBytes: 1_048_576,
          ...(["install", "setEnabled", "update"].includes(operation) ? { body } : {}),
        },
      ).then(value => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value; }));
      joined.throwIfAborted();
    } catch (error) {
      joined.throwIfAborted();
      return error instanceof UpstreamTimeoutError
        ? fail(504, "skill_installation_dependency_timeout", true)
        : fail(503, "skill_installation_dependency_unavailable", true);
    }
    if (upstream === undefined) return fail(502, "skill_installation_response_invalid");
    const upstreamId = upstream.headers.get("x-request-id");
    const retryAfter =
      upstream.status === 429 ? upstream.headers.get("retry-after") : null;
    if (
      !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "") ||
      upstream.headers.get("cache-control") !== "no-store" ||
      upstreamId === null ||
      !PROJECTION_REQUEST_ID.test(upstreamId) ||
      (retryAfter !== null && !/^[1-9][0-9]{0,4}$/u.test(retryAfter))
    ) {
      await upstream.body?.cancel();
      return fail(502, "skill_installation_response_invalid");
    }
    let raw: unknown;
    try {
      raw = await within(upstream.json());
      joined.throwIfAborted();
    } catch {
      joined.throwIfAborted();
      return fail(502, "skill_installation_response_invalid");
    }
    if (upstream.status === 200) {
      const parsed = installationResponseSchema(operation).safeParse(raw);
      if (!parsed.success)
        return fail(502, "skill_installation_response_invalid");
      const value = parsed.data.data;
      if (
        (operation === "get" &&
          (!("installation_id" in value) ||
            value.installation_id !== expectedIdentity)) ||
        (operation !== "get" &&
          operation !== "list" &&
          (!("installation" in value) ||
            !installationReceiptMatches(
              operation,
              value,
              expectedIdentity,
              expectedEnabled,
              targetSourceRef,
            )))
      )
        return fail(502, "skill_installation_response_invalid");
    } else {
      const error = installationErrorSchema.safeParse(raw);
      if (
        !error.success ||
        !installationErrorAllowed(
          operation,
          upstream.status,
          error.data.error.code,
        )
      )
        return fail(502, "skill_installation_response_invalid");
    }
    return NextResponse.json(raw, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": upstreamId,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      },
    });
  } catch {
    return deadline.signal.aborted && !request.signal.aborted
      ? fail(504, "skill_installation_dependency_timeout", true)
      : fail(503, "skill_installation_dependency_unavailable", true);
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
