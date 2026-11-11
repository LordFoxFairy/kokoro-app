import { PROJECT_WEBSITES_BODY_LIMIT, projectWebsitesProjectIdSchema, replaceProjectWebsitesRequestSchema } from "@/generated/bff-project-websites"
import { canonicalProjectWebsites, parseProjectWebsitesState, sameProjectWebsites } from "@/hub/project-websites.schema"
import { bffErrorEnvelopeSchema, webErrorResponse } from "./bff-response"
import { nativeSessionBffHeaders, productBffConfig } from "./product-bff"
import { sameOriginOk } from "./same-origin"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "./upstream-http"

const jsonType = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu
const forbiddenHeaders = ["idempotency-key", "if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range", "transfer-encoding", "content-encoding"]
const errorStatuses = new Set([400, 401, 403, 404, 412, 413, 429, 503])
const deadlineMs = 10_000

export function isProjectWebsitesFamily(path: readonly string[]): boolean {
  const projectAt = path[0] === "self" ? 1 : 0
  return path[projectAt] === "projects" && path[projectAt + 2] === "websites"
}

export async function proxyProjectWebsites(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string) => webErrorResponse(code, status, requestId)
  const invalid = () => fail(400, "invalid_project_websites_request")
  const invalidUpstream = () => fail(502, "project_websites_response_invalid")
  const projectId = path[1] ?? ""
  const url = new URL(request.url)
  const put = request.method === "PUT"
  if (path.length !== 3 || path[0] !== "projects" || path[2] !== "websites") return fail(404, "bff_route_not_found")
  if (!projectWebsitesProjectIdSchema.safeParse(projectId).success || url.pathname !== `/api/hub/projects/${projectId}/websites`
    || request.url.includes("?") || url.hash || forbiddenHeaders.some(name => request.headers.has(name))) return invalid()
  if (!put && request.method !== "GET") return fail(405, "method_not_allowed")
  if (put && !sameOriginOk(request)) return fail(403, "forbidden_origin")
  const length = request.headers.get("content-length")
  const contentType = request.headers.get("content-type")
  if (put ? !jsonType.test(contentType ?? "") || request.body === null || (length !== null && !/^[1-9][0-9]*$/u.test(length))
    : contentType !== null || (length !== null && length !== "0")) return invalid()
  const config = productBffConfig()
  if (!config) return fail(503, "product_tenant_not_configured")
  const native = nativeSessionBffHeaders(request, config, requestId)
  if (native.state !== "valid") return fail(401, "session_authentication_required")
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(deadlineMs)])
  const deadlineAt = performance.now() + deadlineMs
  let upstream: Response | undefined
  try {
    let body: ArrayBuffer | undefined
    let desired: string[] | undefined
    let expectedVersion: number | undefined
    if (put) {
      body = await readBoundedRequestBody(request, PROJECT_WEBSITES_BODY_LIMIT, signal)
      if (length !== null && Number(length) !== body.byteLength) return invalid()
      try {
        // The owner still receives the original bytes and checks strict JSON, including duplicate keys.
        const input = replaceProjectWebsitesRequestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)))
        const canonical = canonicalProjectWebsites(input.websites)
        if (canonical === null) return invalid()
        desired = canonical
        expectedVersion = Number(input.expected_state_version)
      } catch { return invalid() }
      native.headers.set("content-type", "application/json")
    } else if (request.body !== null) {
      await readBoundedRequestBody(request, 0, signal)
    }
    signal.throwIfAborted()
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/projects/${projectId}/websites`, config.domain, {
      method: request.method, headers: native.headers, signal, timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())),
      maxRequestBytes: PROJECT_WEBSITES_BODY_LIMIT, maxResponseBytes: PROJECT_WEBSITES_BODY_LIMIT, maxErrorResponseBytes: 8192,
      ...(body === undefined ? {} : { body }),
    })
    signal.throwIfAborted()
    const ownerId = upstream.headers.get("x-request-id")
    const retryAfter = upstream.headers.get("retry-after")
    if (!jsonType.test(upstream.headers.get("content-type") ?? "") || upstream.headers.get("cache-control") !== "no-store"
      || (ownerId !== null && ownerId !== requestId) || (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter)
        || Number(retryAfter) > 86_400))) return invalidUpstream()
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await upstream.arrayBuffer())) }
    catch { signal.throwIfAborted(); return invalidUpstream() }
    signal.throwIfAborted()
    const headers = { "cache-control": "private, no-store", "x-request-id": requestId, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) }
    if (upstream.status === 200) {
      const state = parseProjectWebsitesState(raw, projectId)
      const returnedVersion = Number(state?.state_version)
      if (ownerId === null || state === null || (desired !== undefined && (!sameProjectWebsites(state.websites, desired)
        || expectedVersion === undefined || (returnedVersion !== expectedVersion && returnedVersion !== expectedVersion + 1)))) return invalidUpstream()
      return Response.json({ data: state }, { headers })
    }
    const error = bffErrorEnvelopeSchema.safeParse(raw)
    if (!error.success || error.data.meta.request_id !== requestId || !errorStatuses.has(upstream.status)
      || (!put && (upstream.status === 412 || upstream.status === 413))
      || (upstream.status === 412 && error.data.error.code !== "project_websites_precondition_failed")) return invalidUpstream()
    return Response.json(error.data, { status: upstream.status, headers })
  } catch (error) {
    if (error instanceof UpstreamRequestTooLargeError) return put ? fail(413, "request_body_too_large") : invalid()
    return fail(503, "project_websites_dependency_unavailable")
  } finally { void upstream?.body?.cancel().catch(() => undefined) }
}
