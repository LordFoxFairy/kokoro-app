import { mcpReauthorizationRequestSchema, mcpReauthorizationErrorAllowed } from "@/hub/mcp-reauthorization.schema";
import {
  mcpPrepareReceiptRequest,
  mcpPrepareReceiptMatches,
  mcpPrepareReceiptErrorAllowed,
  mcpPreparePostErrorAllowed,
  mcpPrepareReceiptLookupOnly,
} from "@/hub/mcp-prepare-receipt.schema";
import { mcpIconOperation, mcpIconInputs, mcpIconMatches, type McpIconOperation } from "@/hub/mcp-icon.schema";
import {
  mcpConnectorIdSchema,
  mcpPrivateServerMatches,
  mcpPrivateJsonImportMatches,
  mcpPrivateJsonImportInputSchema,
  mcpPrivateServerRegistrationInputSchema,
  mcpPrivateServerPrepareInputSchema,
  mcpPrivateServerUpdateInputSchema,
  mcpConnectorMatches,
  mcpConnectorErrorAllowed,
  mcpConnectorCommandRequestSchemas,
  type McpConnectorCommandOperation,
  type McpConnectorOperation,
  type McpPrivateServerOperation,
} from "@/hub/mcp-connector.schema";
import {
  mcpConnectorAuthorizationCallbackSchema,
  mcpConnectorAuthorizationMatches,
  mcpConnectorAuthorizationRequestSchema,
  mcpConnectorCreateConnectionSchema,
  type McpConnectorAuthorizationOperation,
} from "@/hub/mcp-connector-authorization.schema";
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json";
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

export async function proxyMcpConnector(
  request: Request,
  path: string[],
): Promise<Response> {
  const supplied = request.headers.get("x-kokoro-request-id");
  const requestId =
    supplied !== null && PROJECTION_REQUEST_ID.test(supplied)
      ? supplied
      : crypto.randomUUID();
  const fail = (httpStatus: number, code: string) =>
    NextResponse.json(
      {
        error: {
          code,
          message: code,
          retryable:
            httpStatus === 429 ||
            httpStatus === 503 ||
            (httpStatus === 409 && code === "mcp_personal_command_in_progress"),
        },
      },
      {
        status: httpStatus,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  const url = new URL(request.url);
  const iconOperation = mcpIconOperation(path, request.method);
  const reauthorizationPath = path.length === 4 && path[1] === "servers" && path[3] === "reauthorize";
  if (reauthorizationPath && request.method !== "POST") return fail(405, "invalid_mcp_personal_request");
  const receiptPath = path.length === 4 && path[1] === "servers" && path[3] === "prepare-receipt";
  if (receiptPath && request.method !== "GET") return fail(405, "invalid_mcp_personal_request");
  const receiptOperation = receiptPath && request.method === "GET";
  const operation:
    | McpConnectorOperation
    | McpConnectorAuthorizationOperation
    | McpPrivateServerOperation
    | McpIconOperation
    | "prepareReceipt"
    | undefined = reauthorizationPath ? "reauthorizeServer" : receiptOperation ? "prepareReceipt" : iconOperation ?? (
    path.length === 3 &&
      path[1] === "servers" &&
      path[2] === "import" &&
      request.method === "POST"
      ? "importJson"
      : path.length === 2 && path[1] === "servers" && request.method === "POST"
        ? "registerServer"
        : path.length === 3 && path[1] === "servers" && request.method === "GET"
        ? "server"
        : path.length === 4 &&
            path[1] === "servers" &&
            path[3] === "prepare" &&
            request.method === "POST"
          ? "prepareServer"
          : path.length === 3 &&
              path[1] === "servers" &&
              request.method === "PATCH"
            ? "updateServer"
            : path.length === 3 &&
                path[1] === "servers" &&
                request.method === "DELETE"
              ? "deleteServer"
              : path.length === 2 &&
                  path[1] === "connectors" &&
                  request.method === "GET"
                ? "connectors"
                : path.length === 2 &&
                    path[1] === "connectors" &&
                    request.method === "POST"
                  ? "create"
                  : path.length === 3 &&
                      path[1] === "connectors" &&
                      request.method === "PATCH"
                    ? "update"
                    : path.length === 3 &&
                        path[1] === "connectors" &&
                        request.method === "DELETE"
                      ? "remove"
                      : path.length === 4 &&
                          path[1] === "connectors" &&
                          path[3] === "enabled" &&
                          request.method === "PUT"
                        ? "enabled"
                        : path.length === 4 &&
                            path[1] === "connectors" &&
                            path[3] === "authorization" &&
                            request.method === "POST"
                          ? "beginAuthorization"
                          : path.length === 5 &&
                              path[1] === "connectors" &&
                              path[3] === "authorization" &&
                              path[4] === "reconnect" &&
                              request.method === "POST"
                            ? "reconnectAuthorization"
                            : path.length === 4 &&
                                path[1] === "connectors" &&
                                path[3] === "connections" &&
                                request.method === "GET"
                              ? "connections"
                              : path.length === 3 &&
                                  path[1] === "connectors" &&
                                  request.method === "GET"
                                ? "connector"
                                : path.length === 3 &&
                                    path[1] === "connections" &&
                                    request.method === "GET"
                                  ? "connection"
                                  : path.length === 2 &&
                                      path[1] === "connections" &&
                                      request.method === "POST"
                                    ? "createConnection"
                                    : path.length === 3 &&
                                        path[1] === "authorization" &&
                                        path[2] === "callback" &&
                                        request.method === "POST"
                                      ? "completeAuthorization"
                                      : path.length === 2 &&
                                          path[1] === "providers" &&
                                          request.method === "GET"
                                        ? "providers"
                                        : path.length === 3 &&
                                            path[1] === "providers" &&
                                            request.method === "GET"
                                          ? "provider"
                                          : undefined);
  if (operation === undefined) return fail(400, "invalid_mcp_personal_request");
  const authorization = [
    "beginAuthorization",
    "reconnectAuthorization",
    "completeAuthorization",
    "createConnection",
  ].includes(operation);
  const privateServer = [
    "registerServer",
    "importJson",
    "server",
    "reauthorizeServer",
    "prepareServer",
    "updateServer",
    "deleteServer",
  ].includes(operation);
  const mutation = ![
    "connectors",
    "connector",
    "connections",
    "connection",
    "providers",
    "provider",
    "server",
    "prepareReceipt",
    "getIcon",
  ].includes(operation);
  const requiresIdempotency = [
    "create",
    "update",
    "enabled",
    "remove",
    "createConnection",
    "registerServer",
    "importJson",
    "reauthorizeServer",
    "prepareServer",
    "prepareReceipt",
    "updateServer",
    "deleteServer",
    "beginIcon", "completeIcon", "cancelIcon", "importIcon",
  ].includes(operation);
  const id =
    [
      "server",
      "connector",
      "update",
      "remove",
      "enabled",
      "connections",
      "connection",
      "provider",
      "beginAuthorization",
      "reconnectAuthorization",
    ].includes(operation) ||
    ["reauthorizeServer", "prepareServer", "prepareReceipt", "updateServer", "deleteServer", "getIcon", "completeIcon", "cancelIcon"].includes(operation)
      ? path[2]
      : undefined;
  const query = url.searchParams;
  const allowed =
    operation === "prepareReceipt" ? ["expected_state_version"] :
    operation === "connectors"
      ? ["status", "limit", "cursor"]
      : operation === "connections"
        ? ["limit", "cursor"]
        : operation === "providers"
          ? ["query", "directory_type", "category_key", "limit", "cursor"]
          : [];
  if (
    path[0] !== "mcp" ||
    (id !== undefined &&
      !(operation === "provider"
        ? /^[a-z0-9][a-z0-9._-]{0,63}(?![\s\S])/u
        : mcpConnectorIdSchema.safeParse(id).success)) ||
    url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` ||
    url.hash ||
    [...query.keys()].some(
      (key) => !allowed.includes(key) || query.getAll(key).length !== 1,
    ) ||
    (query.has("limit") &&
      !/^(?:[1-9]|[1-9][0-9]|100)(?![\s\S])/u.test(query.get("limit")!)) ||
    (query.has("cursor") &&
      !/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u.test(query.get("cursor")!)) ||
    (query.has("status") &&
      !["pending", "active", "error", "revoked"].includes(
        query.get("status")!,
      )) ||
    (query.has("query") &&
      (!query.get("query") || [...query.get("query")!].length > 1000)) ||
    (query.has("directory_type") &&
      !["app", "data_source"].includes(query.get("directory_type")!)) ||
    (query.has("category_key") &&
      ![
        "efficiency",
        "creation",
        "business",
        "development",
        "finance",
        "travel",
        "health",
      ].includes(query.get("category_key")!))
  )
    return fail(400, "invalid_mcp_personal_request");
  const key = request.headers.get("idempotency-key");
  let receiptVersion: string | undefined;
  if (receiptOperation) {
    if (!mcpPrepareReceiptLookupOnly() || query.getAll("expected_state_version").length !== 1 ||
      ["content-type", "content-encoding", "content-length", "transfer-encoding"].some(name => request.headers.has(name))) return fail(400, "invalid_mcp_personal_request");
    try { receiptVersion = mcpPrepareReceiptRequest(id!, query.get("expected_state_version")!, key!).version; }
    catch { return fail(400, "invalid_mcp_personal_request"); }
  }
  if (
    mutation
      ? !sameOriginOk(request) ||
        !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "") ||
        (requiresIdempotency &&
          !/^[\x21-\x7e]{1,191}(?![\s\S])/u.test(key ?? "")) ||
        (!requiresIdempotency && key !== null)
      : request.body !== null ||
        ["content-length", "transfer-encoding", ...(receiptOperation ? [] : ["idempotency-key"])].some(
          (name) => request.headers.has(name),
        )
  )
    return fail(400, "invalid_mcp_personal_request");
  const config = productBffConfig();
  if (!config?.bffBaseUrl) return fail(503, "product_tenant_not_configured");
  if (
    !mutation &&
    request.headers.has("origin") &&
    request.headers.get("origin") !== config.session.webOrigin
  )
    return fail(403, "session_forbidden");
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const expires = performance.now() + 10_000;
  const timer = setTimeout(() => controller.abort(), 10_000);
  let upstream: Response | undefined;
  const within = <T>(work: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      void work
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
      if (signal.aborted) abort();
    });
  try {
    let body: ArrayBuffer | undefined;
    let input: unknown;
    if (mutation) {
      try {
        body = await readBoundedRequestBody(request, 65_536);
        input = parseMcpConnectorJson(
          new TextDecoder("utf-8", { fatal: true }).decode(body),
        );
      } catch (error) {
        return fail(
          error instanceof UpstreamRequestTooLargeError ? 413 : 400,
          error instanceof UpstreamRequestTooLargeError
            ? "mcp_personal_body_too_large"
            : "invalid_mcp_personal_request",
        );
      }
      const accepted = operation === "reauthorizeServer" ? mcpReauthorizationRequestSchema.safeParse(input).success : iconOperation && iconOperation !== "getIcon" ? mcpIconInputs[iconOperation].safeParse(input).success : authorization
        ? operation === "beginAuthorization" ||
          operation === "reconnectAuthorization"
          ? mcpConnectorAuthorizationRequestSchema.safeParse(input).success
          : operation === "completeAuthorization"
            ? mcpConnectorAuthorizationCallbackSchema.safeParse(input).success
            : mcpConnectorCreateConnectionSchema.safeParse(input).success
        : operation === "registerServer"
          ? mcpPrivateServerRegistrationInputSchema.safeParse(input).success
          : operation === "importJson"
            ? mcpPrivateJsonImportInputSchema.safeParse(input).success
            : operation === "prepareServer" || operation === "deleteServer"
            ? mcpPrivateServerPrepareInputSchema.safeParse(input).success
            : operation === "updateServer"
              ? mcpPrivateServerUpdateInputSchema.safeParse(input).success
              : mcpConnectorCommandRequestSchemas[
                  operation as McpConnectorCommandOperation
                ].safeParse(input).success;
      if (!accepted) return fail(400, "invalid_mcp_personal_request");
    }
    signal.throwIfAborted();

    signal.throwIfAborted();
    // Admission consumes the same receipt budget; never create a fresh 1ms owner budget after expiry.
    if (receiptOperation && performance.now() >= expires) controller.abort();
    signal.throwIfAborted();

    const headers = productBffHeaders(config, request, requestId);
    headers.set("accept", "application/json");
    if (mutation) headers.set("content-type", "application/json");
    if (requiresIdempotency) headers.set("idempotency-key", key!);
    upstream = await within(
      requestWithDomain(
        `${config.bffBaseUrl.replace(/\/+$/u, "")}/browser/v1/${path.map(encodeURIComponent).join("/")}${url.search}`,
        config.domain,
        {
          method: request.method,
          headers: Object.fromEntries(headers),
          ...(body === undefined ? {} : { body }),
          signal,
          timeoutMs: Math.max(1, expires - performance.now()),
          maxResponseBytes: 1_048_576,
          maxErrorResponseBytes: 1_048_576,
          strictResponseLength: true,
        },
      ).then((value) => {
        if (signal.aborted) void value.body?.cancel().catch(() => undefined);
        return value;
      }),
    );
    signal.throwIfAborted();
    if (upstream === undefined)
      return fail(503, "mcp_personal_dependency_unavailable");
    const ownerId = upstream.headers.get("x-request-id");
    if (
      upstream.body === null ||
      !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "") ||
      upstream.headers.get("cache-control") !== "no-store" ||
      !PROJECTION_REQUEST_ID.test(ownerId ?? "") ||
      (upstream.status >= 300 && upstream.status < 400)
    )
      return fail(502, "mcp_personal_response_invalid");
    const length = upstream.headers.get("content-length");
    if (
      length !== null &&
      (!/^(0|[1-9][0-9]*)(?![\s\S])/u.test(length) ||
        Number(length) > 1_048_576)
    )
      return fail(502, "mcp_personal_response_invalid");
    const reader = upstream.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await within(reader.read());
        if (receiptOperation && performance.now() >= expires) controller.abort();
        signal.throwIfAborted();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1_048_576) return fail(502, "mcp_personal_response_invalid");
        chunks.push(part.value);
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (length !== null && Number(length) !== size)
      return fail(502, "mcp_personal_response_invalid");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let raw: unknown;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      raw = receiptOperation ? parseMcpConnectorJson(text) : JSON.parse(text);
    } catch {
      return fail(502, "mcp_personal_response_invalid");
    }
    const expected =
      operation === "create" ||
      operation === "createConnection" ||
      operation === "registerServer" ||
      operation === "importJson"
        ? 201
        : 200;
    const connectorOperation =
      operation === "registerServer" || operation === "importJson"
        ? "create"
        : operation === "server"
          ? "connector"
          : operation;
    const valid =
      upstream.status === expected
        ? receiptOperation ? mcpPrepareReceiptMatches(raw, id!, receiptVersion!) : iconOperation ? mcpIconMatches(iconOperation, raw, id, input) : authorization
          ? mcpConnectorAuthorizationMatches(
              operation as McpConnectorAuthorizationOperation,
              raw,
              id,
              input,
            )
          : privateServer
            ? operation === "importJson"
              ? mcpPrivateJsonImportMatches(raw, input)
              : mcpPrivateServerMatches(
                  operation as McpPrivateServerOperation,
                  raw,
                  id,
                  input,
                )
            : mcpConnectorMatches(
                operation as McpConnectorOperation,
                raw,
                id,
                query,
                input,
              )
        : operation === "reauthorizeServer" ? mcpReauthorizationErrorAllowed(upstream.status, raw) : receiptOperation ? mcpPrepareReceiptErrorAllowed(upstream.status, raw) : operation === "prepareServer" ? mcpPreparePostErrorAllowed(upstream.status, raw) : authorization
          ? mcpConnectorErrorAllowed("authorization", upstream.status, raw)
          : mcpConnectorErrorAllowed(
              connectorOperation as McpConnectorOperation,
              upstream.status,
              raw,
            );
    if (!valid) return fail(502, "mcp_personal_response_invalid");
    const retryAfter = upstream.headers.get("retry-after");
    if (
      retryAfter !== null &&
      (upstream.status !== 429 ||
        !/^[1-9][0-9]{0,4}(?![\s\S])/u.test(retryAfter) ||
        Number(retryAfter) > 86400)
    )
      return fail(502, "mcp_personal_response_invalid");
    return NextResponse.json(raw, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": ownerId!,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      },
    });
  } catch (error) {
    return error instanceof UpstreamResponseTooLargeError ||
      error instanceof UpstreamResponseIncompleteError
      ? fail(502, "mcp_personal_response_invalid")
      : fail(503, "mcp_personal_dependency_unavailable");
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
