import {
  customApiCreateInputSchema,
  customApiCreateSchema,
  customApiErrorAllowed,
  customApiGetSchema,
  customApiPageSchema,
  customApiRemoveInputSchema,
  customApiRemoveSchema,
  customApiUpdateInputSchema,
  customApiUpdateSchema,
} from "@/hub/custom-api.schema";
import { NextResponse } from "next/server";
import { sameOriginOk } from "@/lib/server/same-origin";
import { productBffConfig, productBffHeaders } from "@/lib/server/product-bff";
import {
  readBoundedRequestBody,
  requestWithDomain,
  UpstreamRequestTooLargeError,
  UpstreamResponseTooLargeError,
  UpstreamResponseIncompleteError,
} from "@/lib/server/upstream-http";
import { JSON_MEDIA_TYPE, PROJECTION_REQUEST_ID } from "@/lib/server/hub-projection";

// Custom API is a separate Platform aggregate. It has its own strict
// same-origin adapter rather than being treated as a private MCP server.
type CustomApiAdapterOperation =
  | "create"
  | "list"
  | "get"
  | "update"
  | "remove";
const CUSTOM_API_PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u;

function customApiAdapterOperation(
  method: string,
  path: string[],
): CustomApiAdapterOperation | null {
  if (path[0] !== "connectors" || path[1] !== "custom-apis") return null;
  if (path.length === 2 && method === "POST") return "create";
  if (path.length === 2 && method === "GET") return "list";
  if (path.length === 3 && method === "GET") return "get";
  if (path.length === 3 && method === "PATCH") return "update";
  if (path.length === 3 && method === "DELETE") return "remove";
  return null;
}

export async function proxyCustomApi(
  request: Request,
  path: string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) =>
    NextResponse.json(
      { error: { code, message: code, retryable } },
      {
        status,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  const operation = customApiAdapterOperation(request.method, path);
  const mutation =
    operation === "create" || operation === "update" || operation === "remove";
  const url = new URL(request.url);
  const isItem = path.length === 3;
  const allowedQuery =
    operation === "list" ? new Set(["limit", "cursor"]) : new Set<string>();
  const invalidQuery = [...url.searchParams.keys()].some(
    (key) =>
      !allowedQuery.has(key) || url.searchParams.getAll(key).length !== 1,
  );
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");
  if (
    operation === null ||
    !sameOriginOk(request) ||
    url.hash ||
    invalidQuery ||
    (isItem && !CUSTOM_API_PROFILE_ID.test(path[2] ?? "")) ||
    request.headers.has("transfer-encoding") ||
    (limit !== null && !/^(?:[1-9]|[1-9][0-9]|100)(?![\s\S])/u.test(limit)) ||
    (cursor !== null && !/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u.test(cursor)) ||
    (!mutation &&
      ["content-length", "content-type", "idempotency-key"].some((key) =>
        request.headers.has(key),
      )) ||
    (mutation &&
      (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "") ||
        !/^[\x21-\x7e]{1,191}(?![\s\S])/u.test(
          request.headers.get("idempotency-key") ?? "",
        )))
  )
    return fail(400, "invalid_custom_api_request");
  if (url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}`)
    return fail(400, "invalid_custom_api_request");

  let body: ArrayBuffer | undefined;
  if (mutation) {
    let input: unknown;
    try {
      body = await readBoundedRequestBody(request, 131_072);
      input = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(body),
      );
    } catch (error) {
      return fail(
        error instanceof UpstreamRequestTooLargeError ? 413 : 400,
        "invalid_custom_api_request",
      );
    }
    const valid =
      operation === "create"
        ? customApiCreateInputSchema.safeParse(input).success
        : operation === "update"
          ? customApiUpdateInputSchema.safeParse(input).success
          : customApiRemoveInputSchema.safeParse(input).success;
    if (!valid) return fail(400, "invalid_custom_api_request");
  }

  const config = productBffConfig();
  if (!config?.bffBaseUrl)
    return fail(503, "product_tenant_not_configured", true);

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 10_000);
  let upstream: Response | undefined;
  try {
    const headers = productBffHeaders(config, request, requestId);
    headers.set("accept", "application/json");
    if (mutation) {
      headers.set("content-type", "application/json");
      headers.set("idempotency-key", request.headers.get("idempotency-key")!);
    }
    const resource = `${config.bffBaseUrl.replace(/\/+$/u, "")}/browser/v1/${path.map(encodeURIComponent).join("/")}${url.search}`;
    upstream = await requestWithDomain(resource, config.domain, {
      method: request.method,
      headers: Object.fromEntries(headers),
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.any([request.signal, deadline.signal]),
      timeoutMs: 10_000,
      maxResponseBytes: 1_048_576,
      maxErrorResponseBytes: 1_048_576,
      strictResponseLength: true,
    });
    const ownerId = upstream.headers.get("x-request-id");
    if (
      upstream.body === null ||
      !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "") ||
      upstream.headers.get("cache-control") !== "no-store" ||
      !PROJECTION_REQUEST_ID.test(ownerId ?? "")
    )
      return fail(502, "custom_api_response_invalid");
    const raw = (await upstream.json()) as unknown;
    const schema =
      operation === "create"
        ? customApiCreateSchema
        : operation === "list"
          ? customApiPageSchema
          : operation === "get"
            ? customApiGetSchema
            : operation === "update"
              ? customApiUpdateSchema
              : customApiRemoveSchema;
    const successStatus = operation === "create" ? 201 : 200;
    const valid =
      upstream.status === successStatus
        ? schema.safeParse((raw as { data?: unknown })?.data).success
        : customApiErrorAllowed(operation, upstream.status, raw);
    if (!valid) return fail(502, "custom_api_response_invalid");
    return NextResponse.json(raw, {
      status: upstream.status,
      headers: { "cache-control": "no-store", "x-request-id": ownerId! },
    });
  } catch (error) {
    return error instanceof UpstreamResponseTooLargeError ||
      error instanceof UpstreamResponseIncompleteError
      ? fail(502, "custom_api_response_invalid")
      : fail(503, "custom_api_dependency_unavailable", true);
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
