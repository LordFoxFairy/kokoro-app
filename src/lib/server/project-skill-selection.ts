import { NextResponse } from "next/server";
import { projectSkillIdSchema, projectSkillSelectionInputSchema, projectSkillSelectionSchema } from "@/hub/project-skills.schema";
import { installationKeySchema, installationErrorSchema } from "@/hub/schemas";
import { sameOriginOk } from "./same-origin";
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff";
import { readBoundedRequestBody, requestWithDomain, UpstreamTimeoutError, UpstreamRequestTooLargeError } from "./upstream-http";

/** Project defaults only. Installation lifecycle and message freezing remain separate owners. */
export async function proxyProjectSkillSelection(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID();
  const fail = (status: number, code: string, retryable = false) => NextResponse.json(
    { error: { code, message: code, retryable } },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
  const projectId = path[1];
  if (path.length !== 3 || path[0] !== "projects" || path[2] !== "skill-selection" || !projectSkillIdSchema.safeParse(projectId).success)
    return fail(404, "project_not_found");
  const mutation = request.method === "PUT";
  if (!mutation && request.method !== "GET") return fail(405, "method_not_allowed");
  if (mutation && !sameOriginOk(request)) return fail(403, "session_forbidden");
  if (new URL(request.url).search) return fail(400, "invalid_skill_request");
  const key = request.headers.get("idempotency-key");
  if (mutation ? !installationKeySchema.safeParse(key).success : key !== null) return fail(400, "invalid_skill_request");
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
        error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "invalid_skill_request");
    }
    let expected: string[] | undefined;
    if (mutation) {
      if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) return fail(400, "invalid_skill_request");
      try { expected = projectSkillSelectionInputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))).installation_ids; }
      catch { return fail(400, "invalid_skill_request"); }
    } else if (body.byteLength) return fail(400, "invalid_skill_request");
    const headers = productBffHeaders(config, claims, requestId);
    if (mutation) { headers.set("idempotency-key", key!); headers.set("content-type", "application/json"); }
    signal.throwIfAborted();
    upstream = await within(requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/, "")}/v1/projects/${encodeURIComponent(projectId!)}/skill-selection`, config.domain, {
      method: request.method, headers, signal,
      timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())), maxRequestBytes: 65_536, maxResponseBytes: 65_536,
      ...(mutation ? { body } : {}),
    }).then(value => { if (signal.aborted) void value.body?.cancel().catch(() => undefined); return value; }));
    signal.throwIfAborted();
    if (upstream === undefined) return fail(502, "skill_response_invalid");
    const upstreamId = upstream.headers.get("x-request-id");
    const retryAfter = upstream.headers.get("retry-after");
    if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") || upstream.headers.get("cache-control") !== "no-store"
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(upstreamId ?? "")
      || (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter)))) return fail(502, "skill_response_invalid");
    let raw: unknown;
    try {
      const declared = upstream.headers.get("content-length");
      if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 65_536)) throw new Error("selection_body_invalid");
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
          if (size > 65_536) throw new Error("selection_body_too_large");
          chunks.push(part.value);
        }
      } finally { signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (declared !== null && Number(declared) !== size) throw new Error("selection_body_size_mismatch");
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { signal.throwIfAborted(); return fail(502, "skill_response_invalid"); }
    signal.throwIfAborted();
    if (upstream.status === 200) {
      const parsed = projectSkillSelectionSchema.safeParse(raw);
      if (!parsed.success || parsed.data.data.project_id !== projectId
        || (expected !== undefined && JSON.stringify(parsed.data.data.installation_ids) !== JSON.stringify(expected))) return fail(502, "skill_response_invalid");
    } else if (![400, 401, 403, 404, 405, 409, 412, 413, 429, 502, 503, 504].includes(upstream.status) || !installationErrorSchema.safeParse(raw).success) return fail(502, "skill_response_invalid");
    return NextResponse.json(raw, { status: upstream.status, headers: {
      "cache-control": "no-store", "x-request-id": upstreamId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
    } });
  } catch (error) {
    return error instanceof UpstreamTimeoutError || (controller.signal.aborted && !request.signal.aborted)
      ? fail(504, "skill_deadline_exceeded", true) : fail(503, "skill_dependency_unavailable", true);
  } finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined); }
}
