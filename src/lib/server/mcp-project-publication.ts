import { mcpPublicationErrorPolicy } from "@/hub/mcp-project-publication-error";
import { NextResponse } from "next/server";
import { publicationIdSchema, publicationReceiptRequestSchema, publicationErrorSchema, mcpPublicationInputSchema, parseMcpPublicationAck, parseMcpPublicationPage, type McpPublicationIdentity } from "@/hub/mcp-project-publication.schema";
import { parseMcpConnectorJson } from "@/hub/mcp-connector-json";
import { sameOriginOk } from "./same-origin";
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff";
import { readBoundedRequestBody, requestWithDomain, UpstreamTimeoutError, UpstreamRequestTooLargeError } from "./upstream-http";

/** Narrow browser-private definition publication. No owner URL, credentials or retries in the browser. */
export async function proxyMcpProjectPublication(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) => NextResponse.json({ error: { code, message: code, retryable } }, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  const publish = path.length === 4 && path[0] === "mcp" && path[1] === "servers" && path[3] === "project-publications" && publicationIdSchema.safeParse(path[2]).success;
  const receipt = path.length === 2 && path[0] === "mcp" && path[1] === "project-publication-receipts";
  const list = path.length === 3 && path[0] === "projects" && path[2] === "mcp-pins" && publicationIdSchema.safeParse(path[1]).success;
  if (!publish && !receipt && !list) return fail(404, "mcp_project_publication_not_found");
  const mutation = !list;
  if (request.method !== (mutation ? "POST" : "GET")) return fail(405, "method_not_allowed");
  if (mutation && !sameOriginOk(request)) return fail(403, "session_forbidden");
  const url = new URL(request.url), key = request.headers.get("idempotency-key");
  if (url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` || url.hash || (mutation ? url.search !== "" || !publicationIdSchema.safeParse(key).success : key !== null)) return fail(400, "mcp_project_publication_request_invalid");
  if (list && ([...url.searchParams.keys()].some(name => !["limit", "cursor"].includes(name) || url.searchParams.getAll(name).length !== 1) || !/^(?:[1-9][0-9]?|100)$/u.test(url.searchParams.get("limit") ?? "50") || url.searchParams.has("cursor") && !/^[A-Za-z0-9_-]{1,2048}(?![\s\S])/u.test(url.searchParams.get("cursor") ?? "") || ["content-type", "content-length", "transfer-encoding"].some(name => request.headers.has(name)))) return fail(400, "mcp_project_publication_request_invalid");
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const deadlineAt = performance.now() + 10_000;
  const timer = setTimeout(() => controller.abort(new UpstreamTimeoutError()), 10_000);
  let upstream: Response | undefined;
  const within = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
  try {
    signal.throwIfAborted();
    const config = productBffConfig();
    if (!config?.bffBaseUrl) return fail(503, "product_tenant_not_configured", true);
    let claims;
    try { claims = await within(admittedProductSession(request, config)); }
    catch { signal.throwIfAborted(); return fail(503, "iam_admission_unavailable", true); }
    signal.throwIfAborted();
    if (claims === null) return fail(401, "session_authentication_required");
    let body: ArrayBuffer;
    try { body = await within(readBoundedRequestBody(request, 65_536, signal)); }
    catch (error) {
      signal.throwIfAborted();
      return fail(error instanceof UpstreamRequestTooLargeError ? 413 : 400,
        error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "mcp_project_publication_request_invalid");
    }
    let original: McpPublicationIdentity | undefined;
    if (mutation) {
      if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "") || request.headers.has("transfer-encoding")) return fail(400, "mcp_project_publication_request_invalid");
      try {
        const raw = parseMcpConnectorJson(new TextDecoder("utf-8", { fatal: true }).decode(body));
        if (publish) original = { ...mcpPublicationInputSchema.parse(raw), server_id: path[2]! };
        else {
          const value = publicationReceiptRequestSchema.parse(raw);
          // The UI only publishes definitions; no removal commands are admitted here.
          if (!("publication" in value)) return fail(400, "mcp_project_publication_request_invalid");
          const { server_id, ...input } = value.publication;
          original = { ...mcpPublicationInputSchema.parse(input), server_id };
        }
      } catch { return fail(400, "mcp_project_publication_request_invalid"); }
    } else if (body.byteLength) return fail(400, "mcp_project_publication_request_invalid");
    const headers = productBffHeaders(config, claims, requestId);
    if (mutation) { headers.set("idempotency-key", key!); headers.set("content-type", "application/json"); }
    signal.throwIfAborted();
    upstream = await within(requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/, "")}/browser/v1/${path.map(encodeURIComponent).join("/")}${url.search}`, config.domain, {
      method: request.method, headers, signal,
      timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())), maxRequestBytes: 65_536, maxResponseBytes: 262_144,
      ...(mutation ? { body } : {}),
    }).then(value => { if (signal.aborted) void value.body?.cancel().catch(() => undefined); return value; }));
    signal.throwIfAborted();
    if (upstream === undefined) return fail(502, "mcp_project_publication_response_invalid");
    const upstreamId = upstream.headers.get("x-request-id");
    const retryAfter = upstream.headers.get("retry-after");
    if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") || upstream.headers.get("cache-control") !== "no-store"
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(upstreamId ?? "")
      || (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter)))) return fail(502, "mcp_project_publication_response_invalid");
    let raw: unknown;
    try {
      const declared = upstream.headers.get("content-length");
      if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 262_144)) throw new Error("selection_body_invalid");
      if (upstream.body === null) throw new Error("selection_body_missing");
      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        for (;;) {
          const part = await within(reader.read()); signal.throwIfAborted();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 262_144) throw new Error("selection_body_too_large");
          chunks.push(part.value);
        }
      } finally { signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (declared !== null && Number(declared) !== size) throw new Error("selection_body_size_mismatch");
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { signal.throwIfAborted(); return fail(502, "mcp_project_publication_response_invalid"); }
    signal.throwIfAborted();
    if (upstream.status === 200) {
      try {
        if (original) parseMcpPublicationAck(raw, original, receipt);
        else {
          const page = parseMcpPublicationPage(raw, path[1]!, url.searchParams.get("cursor") ?? undefined);
          if (page.pins.length > Number(url.searchParams.get("limit") ?? "50")) return fail(502, "mcp_project_publication_response_invalid");
        }
      } catch { return fail(502, "mcp_project_publication_response_invalid"); }
    } else {
      const error = publicationErrorSchema.safeParse(raw);
      if (!error.success || !mcpPublicationErrorPolicy(upstream.status, error.data.error)) return fail(502, "mcp_project_publication_response_invalid");
    }
    return NextResponse.json(raw, { status: upstream.status, headers: {
      "cache-control": "no-store", "x-request-id": upstreamId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
    } });
  } catch (error) {
    return error instanceof UpstreamTimeoutError || (controller.signal.aborted && !request.signal.aborted)
      ? fail(503, "mcp_project_publication_dependency_unavailable", true) : fail(503, "mcp_project_publication_dependency_unavailable", true);
  } finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined); }
}
