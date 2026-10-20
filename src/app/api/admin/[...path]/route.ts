import {emptyModelPublishBody} from "@/lib/server/model-publish-body"
import { requestIdForRequest } from "@/lib/server/bff-response"
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
    { error: {
      code,
      message: status === 401 ? "请先登录后再试。" : "后台请求未完成，请稍后重试。",
      retryable: status >= 500,
    } },
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
  // Admin uses this response correlation ID to prove that its same-origin
  // product adapter actually handled the command. Keep an upstream-supplied
  // value intact instead of minting a second ID at this hop.
  const requestId = requestIdForRequest(request)
  const config = productBffConfig()
  if (config === null) return failure(503, "admin_gateway_unavailable", requestId)
  const { path } = await context.params
  const modelRead = request.method === "GET" && path.length === 1 && ["model-routing", "model-labels", "model-revisions", "model-providers", "model-provider-creations", "model-definitions", "model-features"].includes(path[0] ?? "")
  const uuid=/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffffffffffff)$/iu
  const modelPublish=request.method === "POST" && path.length===3 && path[0]==="model-revisions" && uuid.test(path[1]??"") && path[2]==="publish"
  const modelWrite = modelPublish || (path.length===1 && request.method==="POST" && ["model-providers","model-definitions","model-revisions","model-labels"].includes(path[0]??"")) || (path.length===2 && uuid.test(path[1]??"") && ((request.method==="PUT" && path[0]==="model-routing") || (request.method==="PATCH" && path[0]==="model-labels")))
  if (
    path.length === 0 ||
    (!["mcp", "skills"].includes(path[0] ?? "") && !modelRead && !modelWrite) ||
    path.some((segment) => !ADMIN_SEGMENT.test(segment))
  )
    return failure(404, "admin_operation_not_found", requestId)
  if (!(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).includes(request.method as "GET"))
    return failure(405, "admin_method_not_allowed", requestId)

  if (modelRead && ["if-match", "if-none-match", "idempotency-key", "content-type"].some((name) => request.headers.has(name)))
    return failure(400, "invalid_admin_request", requestId)

  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return failure(503, "admin_gateway_unavailable", requestId)
  }
  if (claims === null) return failure(401, "session_authentication_required", requestId)

  const mutation = request.method !== "GET"
  let body: ArrayBuffer | null = null
  if (mutation) {
    if(modelPublish){
      if(!(await emptyModelPublishBody(request)))return failure(400,"invalid_admin_request",requestId)
    }else{
    if (!JSON_TYPE.test(request.headers.get("content-type") ?? ""))
      return failure(400, "invalid_admin_request", requestId)
    body = await readBody(request)
    if (body === null) return failure(400, "invalid_admin_request", requestId)
    }
  } else if (request.body !== null) {
    return failure(400, "invalid_admin_request", requestId)
  }

  const headers = productBffHeaders(config, claims, requestId)
  headers.set("accept", "application/json")
  if (body !== null) headers.set("content-type", "application/json")
  if (mutation) {
    const idempotency = request.headers.get("idempotency-key")
    if (idempotency !== null) headers.set("idempotency-key", idempotency)
    if (modelWrite) {
      // Keep the exact owner's precondition, including invalid/combined values:
      // only the BFF decides whether this is create, update or a 400/428 failure.
      for (const name of ["if-match", "if-none-match"]) {
        const value = request.headers.get(name)
        if (value !== null) headers.set(name, value)
      }
    }
  }
  let upstream: Response
  try {
    upstream = await fetchWithDomain(
      `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/admin/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`,
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
