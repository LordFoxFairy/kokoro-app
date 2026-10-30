import { NextResponse } from "next/server";
import { MCP_SERVER_ICON_POLICY, mcpServerIconIdSchema, mcpServerIconErrors } from "@/generated/bff-mcp-server-icon";
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json";
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff";
import { requestWithDomain, UpstreamResponseTooLargeError, UpstreamResponseIncompleteError, UpstreamTimeoutError } from "./upstream-http";

/** A bounded private media adapter, not a second MCP metadata or Storage client. */
export async function proxyMcpServerIcon(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) => NextResponse.json({ error: { code, message: code, retryable } }, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  if (request.method !== "GET") return fail(405, "method_not_allowed");
  const url = new URL(request.url);
  if (path.length !== 4 || path[0] !== "mcp" || path[1] !== "servers" || path[3] !== "icon" || !mcpServerIconIdSchema.safeParse(path[2]).success
    || url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` || url.search || url.hash || request.body !== null
    || ["content-type", "content-length", "transfer-encoding", "content-encoding", "idempotency-key", "if-match", "if-none-match", "range", "if-range"].some(name => request.headers.has(name)))
    return fail(400, "invalid_mcp_personal_request");
  const config = productBffConfig();
  if (!config) return fail(503, "product_tenant_not_configured", true);
  if (request.headers.has("origin") && request.headers.get("origin") !== config.session.webOrigin) return fail(403, "session_forbidden");
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const deadlineAt = performance.now() + 10_000;
  const timer = setTimeout(() => controller.abort(new UpstreamTimeoutError()), 10_000);
  let upstream: Response | undefined;
  const check = () => { signal.throwIfAborted(); if (performance.now() >= deadlineAt) throw new UpstreamTimeoutError(); };
  const within = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
  try {
    check();
    let claims;
    try { claims = await within(admittedProductSession(request, config)); }
    catch { check(); return fail(503, "iam_admission_unavailable", true); }
    check();
    if (claims === null) return fail(401, "session_authentication_required");
    const headers = productBffHeaders(config, claims, requestId);
    headers.set("accept", MCP_SERVER_ICON_POLICY.success.content_types.join(", "));
    upstream = await within(requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/browser/v1/mcp/servers/${encodeURIComponent(path[2]!)}/icon`, config.domain, {
      method: "GET", headers, signal, timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())),
      maxResponseBytes: MCP_SERVER_ICON_POLICY.max_bytes, maxErrorResponseBytes: 65_536, strictResponseLength: true,
    }).then(value => { if (signal.aborted) void value.body?.cancel().catch(() => undefined); return value; }));
    check();
    if (upstream === undefined) return fail(502, "mcp_personal_response_invalid");
    const h = upstream.headers, ownerId = h.get("x-request-id"), retryAfter = h.get("retry-after");
    if (h.get("cache-control") !== "no-store" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(ownerId ?? "")
      || h.has("location") || h.has("set-cookie") || h.has("content-encoding")
      || (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter)))) return fail(502, "mcp_personal_response_invalid");
    const success = upstream.status === 200;
    const errorSchema = mcpServerIconErrors[String(upstream.status) as keyof typeof mcpServerIconErrors];
    const type = h.get("content-type"), length = h.get("content-length");
    if (success ? !MCP_SERVER_ICON_POLICY.success.content_types.some(value => value === type)
      || length === null || !/^[1-9][0-9]*$/u.test(length) || Number(length) > MCP_SERVER_ICON_POLICY.max_bytes
      || h.get("x-content-type-options") !== "nosniff" || h.get("referrer-policy") !== "no-referrer"
      : !errorSchema || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(type ?? "")) return fail(502, "mcp_personal_response_invalid");
    const max = success ? MCP_SERVER_ICON_POLICY.max_bytes : 65_536;
    if (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > max)) return fail(502, "mcp_personal_response_invalid");
    if (upstream.body === null) return fail(502, "mcp_personal_response_invalid");
    const reader = upstream.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      for (;;) {
        check(); const part = await within(reader.read()); check();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > max) throw new UpstreamResponseTooLargeError();
        chunks.push(part.value);
      }
    } finally { signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (length !== null && Number(length) !== size) return fail(502, "mcp_personal_response_invalid");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    check();
    if (success) return new Response(bytes, { headers: {
      "content-type": type!, "content-length": String(size), "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": ownerId!,
    } });
    let parsed;
    try { parsed = errorSchema.safeParse(parseMcpConnectorJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
    catch { return fail(502, "mcp_personal_response_invalid"); }
    check();
    if (!parsed.success) return fail(502, "mcp_personal_response_invalid");
    return NextResponse.json(parsed.data, { status: upstream.status, headers: { "cache-control": "no-store", "x-request-id": ownerId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } });
  } catch (error) {
    return error instanceof UpstreamResponseTooLargeError || error instanceof UpstreamResponseIncompleteError
      ? fail(502, "mcp_personal_response_invalid") : fail(503, "mcp_personal_dependency_unavailable", true);
  } finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined); }
}
