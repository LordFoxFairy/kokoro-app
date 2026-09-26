// Fixed-tenant Team Product adapter: browser cookie -> online Product Session -> one BFF user Bearer.
// IAM Member/Invitation/Role facts and authorization stay behind the BFF public owner contract.

import { z } from "zod"

import { sameOriginOk } from "@/lib/server/same-origin"
import {
  bffErrorResponse,
  bffSuccessEnvelopeSchema,
  requestIdForRequest,
  responseHeadersWithRequestId,
  webErrorResponse,
} from "@/lib/server/bff-response"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http"
import { teamCreateInvitationRequestSchema, teamReplaceRolesRequestSchema } from "@/team/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }
type TeamMethod = "GET" | "POST" | "PUT" | "DELETE"

function validId(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && value.length <= 256 && !/[\/%\u0000-\u001f\u007f]/u.test(value)
}

function selectedPath(method: TeamMethod, path: readonly string[]): string | null {
  if (method === "GET" && path.length === 1 && ["members", "invitations", "roles"].includes(path[0]!)) {
    return path[0]!
  }
  if (method === "POST" && path.length === 1 && path[0] === "invitations") return "invitations"
  if (method === "POST" && path.length === 3 && path[0] === "invitations" && validId(path[1]) && path[2] === "resend") {
    return `invitations/${encodeURIComponent(path[1])}/resend`
  }
  if (method === "DELETE" && path.length === 2 && path[0] === "invitations" && validId(path[1])) {
    return `invitations/${encodeURIComponent(path[1])}`
  }
  if (method === "DELETE" && path.length === 2 && path[0] === "members" && path[1] === "me") return "members/me"
  if (path[0] === "members" && validId(path[1]) && path[1] !== "me") {
    if (method === "PUT" && path.length === 3 && path[2] === "roles") return `members/${encodeURIComponent(path[1])}/roles`
    if (method === "DELETE" && path.length === 2) return `members/${encodeURIComponent(path[1])}`
  }
  return null
}

function validQuery(request: Request, method: TeamMethod): string | null {
  const query = new URL(request.url).search
  if (method !== "GET") return query === "" ? "" : null
  if (query.length > 4096) return null
  const params = new URLSearchParams(query)
  if ([...params.keys()].some((key) => key !== "limit" && key !== "cursor")) return null
  if (params.getAll("limit").length > 1 || params.getAll("cursor").length > 1) return null
  const limit = params.get("limit")
  if (limit !== null && (!/^[1-9][0-9]{0,2}$/u.test(limit) || Number(limit) > 100)) return null
  const cursor = params.get("cursor")
  if (cursor !== null && (cursor.length === 0 || cursor.length > 2048)) return null
  return query
}

async function mutationBody(request: Request, method: TeamMethod, path: string): Promise<ArrayBuffer | undefined | null> {
  const expectsJson = method === "POST" && path === "invitations" || method === "PUT"
  if (!expectsJson) return request.body === null ? undefined : null
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) return null
  const bytes = await readBoundedRequestBody(request, 16_384)
  let raw: unknown
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
  catch { return null }
  const parsed = method === "PUT" ? teamReplaceRolesRequestSchema.safeParse(raw) : teamCreateInvitationRequestSchema.safeParse(raw)
  if (!parsed.success) return null
  const normalized = new TextEncoder().encode(JSON.stringify(parsed.data))
  return normalized.buffer.slice(normalized.byteOffset, normalized.byteOffset + normalized.byteLength) as ArrayBuffer
}

async function proxy(request: Request, context: Context): Promise<Response> {
  const method = request.method as TeamMethod
  const requestId = requestIdForRequest(request)
  const { path } = await context.params
  const selected = selectedPath(method, path ?? [])
  if (selected === null) return webErrorResponse("not_found", 404, requestId)
  const query = validQuery(request, method)
  if (query === null) return webErrorResponse("invalid_query", 400, requestId)
  if (method !== "GET" && !sameOriginOk(request)) return webErrorResponse("forbidden_origin", 403, requestId)

  const config = productBffConfig()
  if (config === null) return webErrorResponse("bff_not_configured", 503, requestId)
  let claims
  try { claims = await admittedProductSession(request, config) }
  catch { return webErrorResponse("session_unavailable", 503, requestId) }
  if (claims === null) return webErrorResponse("unauthenticated", 401, requestId)

  let body: ArrayBuffer | undefined | null
  try { body = await mutationBody(request, method, selected) }
  catch (error) {
    return webErrorResponse(error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "request_body_unreadable",
      error instanceof UpstreamRequestTooLargeError ? 413 : 400, requestId)
  }
  if (body === null) return webErrorResponse("invalid_team_request", 400, requestId)

  const headers = productBffHeaders(config, claims, requestId)
  if (body !== undefined) headers.set("content-type", "application/json")
  let upstream: Response
  try {
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/team/${selected}${query}`, config.domain, {
      method, headers: Object.fromEntries(headers.entries()), ...(body === undefined ? {} : { body }),
      signal: request.signal, timeoutMs: 10_000, maxRequestBytes: 16_384, maxResponseBytes: 2 * 1024 * 1024,
    })
  } catch {
    return webErrorResponse("bff_unreachable", 502, requestId)
  }

  const raw: unknown = await upstream.json().catch(() => null)
  if (!upstream.ok) return bffErrorResponse(upstream, raw, "bff_error", requestId)
  const parsed = bffSuccessEnvelopeSchema(z.unknown()).safeParse(raw)
  if (!parsed.success) return webErrorResponse("bff_bad_response", 502, requestId)
  return new Response(JSON.stringify(parsed.data), {
    status: upstream.status,
    headers: responseHeadersWithRequestId(parsed.data.meta.request_id, {
      "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store",
    }),
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
