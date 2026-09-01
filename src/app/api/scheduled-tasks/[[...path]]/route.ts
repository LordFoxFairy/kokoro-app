// Scheduled BFF: the browser owns only the typed `/api/scheduled-tasks` path;
// service credentials and namespace/user identity stay server-side. The Hub
// upstream is intentionally a capability boundary: an absent/unimplemented
// upstream returns a typed HTTP error and is never replaced with preview data.

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  authConfig,
  INTERNAL_SECRET_HEADER,
  resolveSessionWithRefresh,
  sameOriginOk,
  SERVICE_HEADER,
  SERVICE_VALUE,
} from "@/lib/server/auth"
import { requestWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MUTATION_METHODS = new Set(["POST", "PATCH", "DELETE"])
const FORWARD_HEADERS = ["accept", "content-type", "idempotency-key"] as const
const bffErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
  meta: z.object({ request_id: z.string().min(1) }).passthrough(),
}).passthrough()

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ error }, { status })
}

async function projectBffError(upstream: Response, responseHeaders: Headers): Promise<Response | null> {
  const parsed = bffErrorEnvelopeSchema.safeParse(await upstream.clone().json().catch(() => null))
  if (!parsed.success) return null
  responseHeaders.set("content-type", "application/json")
  responseHeaders.delete("content-length")
  return new Response(JSON.stringify({ error: parsed.data.error.message, code: parsed.data.error.code }), {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function proxyScheduledTaskRequest(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const config = authConfig()
  if (config === null) return errorResponse("auth_not_configured", 503)
  if (config.bffBaseUrl == null && config.hubBaseUrl === null) return errorResponse("scheduled_tasks_not_configured", 503)
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) return errorResponse("forbidden_origin", 403)

  const resolved = await resolveSessionWithRefresh(request, config)
  if (resolved === null) return errorResponse("unauthenticated", 401)
  const { envelope, setCookie } = resolved
  const path = (await context.params).path ?? []
  if (path.length > 2 || (path.length === 2 && path[1] !== "retry") || path.some((segment) => segment.length === 0)) {
    return errorResponse("invalid_scheduled_task_path", 404)
  }

  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()
  const suffix = path.length === 0 ? "" : `/${path.map((segment) => encodeURIComponent(segment)).join("/")}`
  const target = config.bffBaseUrl != null
    ? `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/scheduled-tasks${suffix}${new URL(request.url).search}`
    : `${config.hubBaseUrl!.replace(/\/+$/, "")}/hub/scheduled-tasks${suffix}${new URL(request.url).search}`
  const headers = new Headers({
    [SERVICE_HEADER]: SERVICE_VALUE,
    ["x-kokoro-namespace"]: envelope.namespace,
    ["x-kokoro-user-id"]: envelope.user_id,
    ["x-kokoro-request-id"]: requestId,
  })
  if (config.internalSecret !== null) headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }

  const body = request.method === "GET" || request.method === "HEAD" || request.method === "DELETE"
    ? undefined
    : await request.arrayBuffer()

  let upstream: Response
  try {
    upstream = await requestWithDomain(target, config.domain, {
      method: request.method,
      headers: Object.fromEntries(headers.entries()),
      ...(body !== undefined ? { body } : {}),
      signal: request.signal,
    })
  } catch {
    return errorResponse("scheduled_tasks_unreachable", 502)
  }

  const responseHeaders = new Headers()
  for (const name of ["content-type", "cache-control", "content-length"] as const) {
    const value = upstream.headers.get(name)
    if (value !== null) responseHeaders.set(name, value)
  }
  if (setCookie !== null) responseHeaders.append("set-cookie", setCookie)
  if (config.bffBaseUrl != null && !upstream.ok) {
    const projectedError = await projectBffError(upstream, responseHeaders)
    if (projectedError !== null) return projectedError
  }
  if (config.bffBaseUrl != null && upstream.ok) {
    const raw = await upstream.json().catch(() => null) as { data?: unknown } | null
    if (raw === null || !Object.prototype.hasOwnProperty.call(raw, "data")) return errorResponse("invalid_scheduled_tasks_response", 502)
    responseHeaders.set("content-type", "application/json")
    responseHeaders.delete("content-length")
    return new Response(JSON.stringify(raw.data), { status: upstream.status, headers: responseHeaders })
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const GET = proxyScheduledTaskRequest
export const POST = proxyScheduledTaskRequest
export const PATCH = proxyScheduledTaskRequest
export const DELETE = proxyScheduledTaskRequest
