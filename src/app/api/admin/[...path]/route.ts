import { randomUUID } from "node:crypto"

import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { fetchWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }

const JSON_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu
const MAX_BODY_BYTES = 65_536
const ADMIN_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u

function failure(status: number, code: string, requestId: string): Response {
  return Response.json(
    { error: { code } },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  )
}

async function readBody(request: Request): Promise<ArrayBuffer | null> {
  if (request.body === null) return null
  const length = request.headers.get("content-length")
  if (length === null || !/^(?:0|[1-9][0-9]*)$/u.test(length) || Number(length) > MAX_BODY_BYTES)
    return null
  const body = await request.arrayBuffer().catch(() => null)
  return body !== null && body.byteLength === Number(length) ? body : null
}

/**
 * The product Web owns the browser session. Admin is an independent console
 * surface, not a second OAuth relying party: it forwards its same-origin
 * browser request here and this adapter alone presents the product access
 * credential to the BFF.
 */
async function handle(request: Request, context: Context): Promise<Response> {
  const requestId = randomUUID()
  const config = productBffConfig()
  if (config === null) return failure(503, "admin_gateway_unavailable", requestId)
  const { path } = await context.params
  if (
    path.length === 0 ||
    !["mcp", "skills"].includes(path[0] ?? "") ||
    path.some((segment) => !ADMIN_SEGMENT.test(segment))
  )
    return failure(404, "admin_operation_not_found", requestId)
  if (!(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).includes(request.method as "GET"))
    return failure(405, "admin_method_not_allowed", requestId)

  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return failure(503, "admin_gateway_unavailable", requestId)
  }
  if (claims === null) return failure(401, "admin_session_required", requestId)

  const mutation = request.method !== "GET"
  let body: ArrayBuffer | null = null
  if (mutation) {
    if (!JSON_TYPE.test(request.headers.get("content-type") ?? ""))
      return failure(400, "invalid_admin_request", requestId)
    body = await readBody(request)
    if (body === null) return failure(400, "invalid_admin_request", requestId)
  } else if (request.body !== null) {
    return failure(400, "invalid_admin_request", requestId)
  }

  const headers = productBffHeaders(config, claims, requestId)
  headers.set("accept", "application/json")
  if (body !== null) {
    headers.set("content-type", "application/json")
    const idempotency = request.headers.get("idempotency-key")
    if (idempotency !== null) headers.set("idempotency-key", idempotency)
  }
  let upstream: Response
  try {
    upstream = await fetchWithDomain(
      `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`,
      config.domain,
      { method: request.method, headers, ...(body === null ? {} : { body }), cache: "no-store", signal: request.signal },
    )
  } catch {
    return failure(503, "admin_gateway_unavailable", requestId)
  }
  const upstreamId = upstream.headers.get("x-request-id")
  const contentType = upstream.headers.get("content-type")
  if (
    upstreamId !== requestId ||
    !JSON_TYPE.test(contentType ?? "") ||
    !upstream.headers.get("cache-control")?.toLowerCase().split(",").some((value) => value.trim() === "no-store")
  ) {
    void upstream.body?.cancel().catch(() => undefined)
    return failure(502, "admin_gateway_response_invalid", requestId)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": contentType!, "cache-control": "no-store", "x-request-id": requestId },
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
