import {
  zErrorEnvelope, zProjectTaskId, zProjectTaskIdempotencyKey, zProjectTaskIfMatch,
  zProjectTaskWriteProjectId, zProjectTaskWriteResponse, zTaskListResponse,
} from "@/generated/bff-project-tasks/zod.gen"
import { PROJECT_TASK_STATUSES } from "@/generated/bff-project-tasks/provenance"
import { nativeSessionBffHeaders, productBffConfig } from "./product-bff"
import { sameOriginOk } from "./same-origin"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "./upstream-http"

const requestLimit = 4096
const ownerDeadline = 10_000
const collection = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/tasks`
const jsonType = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu

export function isProjectTaskFamily(path: readonly string[]): boolean {
  const projectAt = path[0] === "self" ? 1 : 0
  return path[projectAt] === "projects" && path[projectAt + 2] === "tasks"
}

/** Same-origin transport only; the BFF owns Project and Task decisions. */
export async function proxyProjectTasks(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const replyHeaders = { "cache-control": "private, no-store", "x-request-id": requestId }
  const fail = (status: number, code: string) => Response.json({ error: { code, message: code }, meta: { request_id: requestId } }, { status, headers: replyHeaders })
  const [, projectId, , taskId] = path
  if (path[0] !== "projects" || (path.length !== 3 && path.length !== 4) || path[2] !== "tasks") return fail(404, "bff_route_not_found")
  if (!zProjectTaskWriteProjectId.safeParse(projectId).success || (taskId !== undefined && !zProjectTaskId.safeParse(taskId).success))
    return fail(400, "invalid_project_task_request")
  const uri = `${collection(projectId!)}${taskId === undefined ? "" : `/${encodeURIComponent(taskId)}`}`
  const url = new URL(request.url)
  if (url.pathname !== `/api/hub${uri}` || request.url.includes("?") || url.hash) return fail(400, "invalid_project_task_request")
  const operation = taskId === undefined
    ? request.method === "GET" ? "list" : request.method === "POST" ? "create" : null
    : request.method === "PATCH" ? "update" : request.method === "DELETE" ? "delete" : null
  if (operation === null) return fail(405, "method_not_allowed")
  if (operation !== "list" && !sameOriginOk(request)) return fail(403, "forbidden_origin")
  const key = request.headers.get("idempotency-key")
  const revision = request.headers.get("if-match")
  if (operation !== "list" && key === null) return fail(400, "idempotency_key_required")
  if ((key !== null && (operation === "list" || !zProjectTaskIdempotencyKey.safeParse(key).success)) || request.headers.has("if-none-match"))
    return fail(400, "invalid_project_task_request")
  if (operation === "update" || operation === "delete") {
    if (revision === null) return fail(428, "project_task_precondition_required")
    if (!zProjectTaskIfMatch.safeParse(revision).success) return fail(400, "invalid_project_task_request")
  } else if (revision !== null) return fail(400, "invalid_project_task_request")

  const jsonBody = operation === "create" || operation === "update"
  const contentType = request.headers.get("content-type")
  const contentLength = request.headers.get("content-length")
  if (request.headers.has("transfer-encoding") || (jsonBody
    ? !jsonType.test(contentType ?? "") || request.body === null
    : contentType !== null || (contentLength !== null && contentLength !== "0"))) return fail(400, "invalid_project_task_request")
  const config = productBffConfig()
  if (!config) return fail(503, "project_task_dependency_unavailable")
  const auth = nativeSessionBffHeaders(request, config, requestId)
  if (auth.state !== "valid") return fail(401, "session_authentication_required")
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(ownerDeadline)])
  const deadline = performance.now() + ownerDeadline
  const headers = auth.headers
  if (key !== null) headers.set("idempotency-key", key)
  if (revision !== null) headers.set("if-match", revision)
  if (jsonBody) headers.set("content-type", "application/json")
  let upstream: Response | undefined
  try {
    // Next may represent a bodyless DELETE with a non-null, empty stream.
    if (!jsonBody && request.body !== null) await readBoundedRequestBody(request, 0, signal)
    const body = jsonBody ? await readBoundedRequestBody(request, requestLimit, signal) : undefined
    signal.throwIfAborted()
    if (body?.byteLength === 0) return fail(400, "invalid_project_task_request")
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/$/u, "")}/v1${uri}`, config.domain, {
      method: request.method, headers, signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
      maxRequestBytes: requestLimit, maxResponseBytes: 1_048_576, maxErrorResponseBytes: 8192,
      ...(body === undefined ? {} : { body }),
    })
    signal.throwIfAborted()
    const invalid = () => fail(502, "project_task_response_invalid")
    const ownerId = upstream.headers.get("x-request-id")
    const location = upstream.headers.get("location")
    const retry = upstream.headers.get("retry-after")
    if (!ownerId || ownerId.length > 256 || !/\bno-store\b/iu.test(upstream.headers.get("cache-control") ?? "") ||
        !(PROJECT_TASK_STATUSES[operation] as readonly number[]).includes(upstream.status) ||
        (retry !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retry) || Number(retry) > 86_400))) return invalid()
    const returned = { ...replyHeaders, "x-request-id": ownerId, ...(retry === null ? {} : { "retry-after": retry }) }
    if (upstream.status === 204) {
      if (location !== null || upstream.headers.has("content-type") || ![null, "0"].includes(upstream.headers.get("content-length"))) return invalid()
      return new Response(null, { status: 204, headers: returned })
    }
    if (!jsonType.test(upstream.headers.get("content-type") ?? "")) return invalid()
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await upstream.arrayBuffer())) }
    catch { signal.throwIfAborted(); return invalid() }
    signal.throwIfAborted()
    if (!upstream.ok) {
      const parsed = zErrorEnvelope.safeParse(raw)
      return location === null && parsed.success && parsed.data.meta.request_id === ownerId
        ? Response.json(parsed.data, { status: upstream.status, headers: returned }) : invalid()
    }
    if (operation === "list") {
      const parsed = zTaskListResponse.safeParse(raw)
      if (location !== null || !parsed.success || parsed.data.meta.request_id !== ownerId) return invalid()
      const tasks = parsed.data.data.tasks
      if (new Set(tasks.map(({ id }) => id)).size !== tasks.length || tasks.some((task) => task.project_id !== projectId || !zProjectTaskId.safeParse(task.id).success)) return invalid()
      return Response.json(parsed.data, { headers: returned })
    }
    const parsed = zProjectTaskWriteResponse.safeParse(raw)
    if (!parsed.success || parsed.data.meta.request_id !== ownerId || parsed.data.data.project_id !== projectId ||
      !zProjectTaskId.safeParse(parsed.data.data.id).success || (operation === "update" && parsed.data.data.id !== taskId)) return invalid()
    if (operation === "create") {
      const identity = `${uri}/${encodeURIComponent(parsed.data.data.id)}`
      if (location !== `/v1${identity}`) return invalid()
      return Response.json(parsed.data, { status: 201, headers: { ...returned, location: `/api/hub${identity}` } })
    }
    if (location !== null) return invalid()
    return Response.json(parsed.data, { headers: returned })
  } catch (error) {
    if (error instanceof UpstreamRequestTooLargeError) {
      return jsonBody ? fail(413, "request_body_too_large") : fail(400, "invalid_project_task_request")
    }
    return fail(503, "project_task_dependency_unavailable")
  } finally {
    void upstream?.body?.cancel().catch(() => undefined)
  }
}
