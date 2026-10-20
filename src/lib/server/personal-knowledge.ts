import {
  knowledgeIdSchema,
  knowledgeText,
  knowledgeReplaceSchema,
  knowledgeDeleteSchema,
  knowledgeUsageInputSchema,
  knowledgeItemResponseSchema,
  knowledgeListResponseSchema,
  knowledgeUsageResponseSchema,
  knowledgeErrorAllowed,
  knowledgeAckMatches,
  parseKnowledgeJson,
  parseKnowledgeResponseJson,
} from "@/contract/personal-knowledge";
import {
  admittedProductSession,
  productBffConfig,
  productBffHeaders,
} from "./product-bff";
import { sameOriginOk } from "./same-origin";
import {
  readBoundedRequestBody,
  requestWithDomain,
  UpstreamRequestTooLargeError,
  UpstreamTimeoutError,
} from "./upstream-http";

const JSON_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
// 100 entries × 3,000 Unicode scalars × at most 4 UTF-8 bytes, plus structure.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function responseJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(0|[1-9][0-9]*)$/u.test(declared) ||
      !Number.isSafeInteger(Number(declared)) ||
      Number(declared) > MAX_RESPONSE_BYTES)
  )
    throw new Error("Invalid knowledge length");
  if (response.body === null) throw new Error("Missing knowledge body");
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new Error("Knowledge body too large");
      chunks.push(part.value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
  if (declared !== null && Number(declared) !== size)
    throw new Error("Knowledge length mismatch");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseKnowledgeResponseJson(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
}

/** Exact preference adapter, not an arbitrary Hub passthrough. No business identity from the browser. */
export async function proxyPersonalKnowledge(
  request: Request,
  segments: readonly string[],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) =>
    Response.json(
      { error: { code, message: code, retryable } },
      {
        status,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  const url = new URL(request.url),
    collection = segments[1] === "knowledge" && segments.length === 2;
  const usage = segments[1] === "knowledge-usage" && segments.length === 2;
  const id = !collection && !usage ? segments[2] : undefined;
  if (segments[0] !== "preferences") return fail(404, "knowledge_not_found");
  if (
    (!collection &&
      !usage &&
      (segments.length !== 3 ||
        segments[1] !== "knowledge" ||
        !knowledgeIdSchema.safeParse(id).success)) ||
    url.pathname !== `/api/hub/${segments.join("/")}`
  )
    return fail(400, "invalid_knowledge_request");
  const method = request.method,
    mutation = method !== "GET";
  if (
    !(
      collection ? ["GET"] : usage ? ["GET", "PUT"] : ["GET", "PUT", "DELETE"]
    ).includes(method)
  )
    return fail(405, "method_not_allowed");
  const query = [...url.searchParams.entries()];
  if (
    (request.url.includes("?") && query.length === 0) ||
    query.length > (collection ? 1 : 0) ||
    query.some(
      ([key, value]) =>
        key !== "query" || !knowledgeText(500, false).safeParse(value).success,
    ) ||
    ["idempotency-key", "if-match", "if-none-match"].some((name) =>
      request.headers.has(name),
    )
  )
    return fail(400, "invalid_knowledge_request");
  if (mutation && (!request.headers.has("origin") || !sameOriginOk(request)))
    return fail(403, "session_forbidden");
  if (
    mutation
      ? !JSON_TYPE.test(request.headers.get("content-type") ?? "")
      : request.body !== null ||
        request.headers.has("transfer-encoding") ||
        ![null, "0"].includes(request.headers.get("content-length"))
  )
    return fail(400, "invalid_knowledge_request");
  const controller = new AbortController(),
    signal = AbortSignal.any([request.signal, controller.signal]);
  const deadline = performance.now() + 10_000;
  const timer = setTimeout(
    () => controller.abort(new UpstreamTimeoutError()),
    10_000,
  );
  const within = <T>(work: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      void work
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
      if (signal.aborted) abort();
    });
  let upstream: Response | undefined;
  try {
    signal.throwIfAborted();
    const config = productBffConfig();
    if (config === null) return fail(503, "product_tenant_not_configured");
    if (mutation && request.headers.get("origin") !== config.session.webOrigin)
      return fail(403, "session_forbidden");
    let claims;
    try {
      claims = await within(admittedProductSession(request, config));
    } catch {
      signal.throwIfAborted();
      return fail(503, "iam_admission_unavailable", true);
    }
    signal.throwIfAborted();
    if (claims === null) return fail(401, "session_authentication_required");
    let body: ArrayBuffer | undefined, input: unknown;
    if (mutation) {
      try {
        body = await within(readBoundedRequestBody(request, 65_536, signal));
        const raw = parseKnowledgeJson(
          new TextDecoder("utf-8", { fatal: true }).decode(body),
        );
        input = (
          usage
            ? knowledgeUsageInputSchema
            : method === "DELETE"
              ? knowledgeDeleteSchema
              : knowledgeReplaceSchema
        ).parse(raw);
      } catch (e) {
        signal.throwIfAborted();
        return e instanceof UpstreamRequestTooLargeError
          ? fail(413, "request_body_too_large")
          : fail(400, "invalid_knowledge_request");
      }
    }
    const ownerPath = `/v1/${segments.join("/")}`;
    const headers = productBffHeaders(config, claims, requestId);
    if (mutation) headers.set("content-type", "application/json");
    signal.throwIfAborted();
    upstream = await within(
      requestWithDomain(
        `${config.bffBaseUrl.replace(/\/+$/, "")}${ownerPath}${url.search}`,
        config.domain,
        {
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          signal,
          timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
          maxRequestBytes: 65_536,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        },
      ).then((response) => {
        if (signal.aborted) void response.body?.cancel().catch(() => undefined);
        return response;
      }),
    );
    signal.throwIfAborted();
    if (upstream === undefined) return fail(502, "knowledge_response_invalid");
    const ownerId = upstream.headers.get("x-request-id"),
      retry = upstream.headers.get("retry-after");
    const invalid = () => fail(502, "knowledge_response_invalid");
    if (
      !REQUEST_ID.test(ownerId ?? "") ||
      upstream.headers.get("cache-control") !== "no-store" ||
      (retry !== null &&
        (upstream.status !== 429 ||
          !/^[1-9][0-9]{0,4}$/u.test(retry) ||
          Number(retry) > 86400))
    )
      return invalid();
    const outHeaders = new Headers({
      "cache-control": "no-store",
      "x-request-id": ownerId!,
    });
    if (retry !== null) outHeaders.set("retry-after", retry);
    if (upstream.status === 204) {
      if (
        method !== "DELETE" ||
        upstream.body !== null ||
        ![null, "0"].includes(upstream.headers.get("content-length"))
      )
        return invalid();
      return new Response(null, { status: 204, headers: outHeaders });
    }
    if (!JSON_TYPE.test(upstream.headers.get("content-type") ?? ""))
      return invalid();
    let raw: unknown;
    try {
      raw = await within(responseJson(upstream, signal));
    } catch {
      signal.throwIfAborted();
      return invalid();
    }
    signal.throwIfAborted();
    if (upstream.ok) {
      const expectedStatus =
        method === "PUT" &&
        !usage &&
        knowledgeReplaceSchema.parse(input).expected_revision === 0
          ? 201
          : 200;
      if (method === "DELETE" || upstream.status !== expectedStatus)
        return invalid();
      if (collection) {
        if (!knowledgeListResponseSchema.safeParse(raw).success)
          return invalid();
      } else if (usage) {
        const parsed = knowledgeUsageResponseSchema.safeParse(raw);
        if (!parsed.success) return invalid();
        if (mutation) {
          const command = knowledgeUsageInputSchema.parse(input);
          if (
            parsed.data.data.revision !== command.expected_revision + 1 ||
            parsed.data.data.enabled !== command.enabled
          )
            return invalid();
        }
      } else {
        const parsed = knowledgeItemResponseSchema.safeParse(raw);
        if (
          !parsed.success ||
          !knowledgeAckMatches(
            parsed.data.data,
            id!,
            mutation ? knowledgeReplaceSchema.parse(input) : undefined,
          )
        )
          return invalid();
      }
      if (upstream.status === 201) {
        if (upstream.headers.get("location") !== ownerPath) return invalid();
        outHeaders.set("location", `/api/hub/${segments.join("/")}`);
      } else if (upstream.headers.has("location")) return invalid();
    } else if (!knowledgeErrorAllowed(raw, upstream.status, method))
      return invalid();
    return Response.json(raw, { status: upstream.status, headers: outHeaders });
  } catch (e) {
    return e instanceof UpstreamTimeoutError ||
      (controller.signal.aborted && !request.signal.aborted)
      ? fail(504, "knowledge_deadline_exceeded", !mutation)
      : fail(503, "knowledge_dependency_unavailable", !mutation);
  } finally {
    clearTimeout(timer);
    void upstream?.body?.cancel().catch(() => undefined);
  }
}
