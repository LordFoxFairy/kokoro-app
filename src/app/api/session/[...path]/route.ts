// Chat 同源适配器（BFF）：浏览器保留稳定的 `/api/session/*` 兼容路径，服务端统一
// 投影到 `kokoro-bff/v1/*`。BFF Chat 模块负责消息/run/SSE 事实编排；浏览器不直连
// Session、Gateway 或任意业务子仓库。HTTP/SSE/二进制一律流式转发，大 JSON 仅在
// BFF envelope 适配时解包。变更类请求校验同源 Origin。

import { z } from "zod"

import { sameOriginOk } from "@/lib/server/same-origin"
import {
  bffErrorEnvelopeSchema,
  bffErrorResponse,
  bffSuccessEnvelopeSchema,
  requestIdForRequest,
  requestIdFromResponse,
  responseHeadersWithRequestId,
  webErrorResponse,
} from "@/lib/server/bff-response"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"

export const runtime = "nodejs"
// 每请求实时求值：绝不静态化/缓存代理响应（SSE、鉴权头随信封变）。
export const dynamic = "force-dynamic"

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const AGUI_STREAM_IDLE_TIMEOUT_MS = 60_000

// 仅转发 Chat 实际需要的入站头，绝不转发 cookie（信封 cookie 不得外泄到 BFF）。
const FORWARD_HEADERS = ["accept", "content-type", "last-event-id", "idempotency-key"] as const

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const requestId = requestIdForRequest(request)
  const config = productBffConfig()
  if (config === null) {
    return webErrorResponse("auth_not_configured", 503, requestId)
  }
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) {
    return webErrorResponse("forbidden_origin", 403, requestId)
  }
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return webErrorResponse("session_unavailable", 503, requestId)
  }
  if (claims === null) {
    return webErrorResponse("unauthenticated", 401, requestId)
  }

  if (config.bffBaseUrl === null || config.bffBaseUrl === undefined) {
    return webErrorResponse("bff_not_configured", 503, requestId)
  }

  const { path } = await context.params
  const segments = path ?? []
  const isAgUiEvents = request.method === "GET" && segments.length === 3
    && segments[0] === "sessions" && segments[2] === "events"
  const search = new URL(request.url).search
  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join("/")
  const target = `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${encodedPath}${search}`

  const headers = productBffHeaders(config, claims, requestId)
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) {
      headers.set(name, value)
    }
  }

  // JSON body 体积小，缓冲即可；GET/DELETE 无体。SSE 是 GET，走响应流式。
  let body: ArrayBuffer | undefined
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE") {
    try {
      body = await readBoundedRequestBody(request)
    } catch (error) {
      return webErrorResponse(
        error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "request_body_unreadable",
        error instanceof UpstreamRequestTooLargeError ? 413 : 400,
        requestId,
      )
    }
  }

  let upstream: Response
  try {
    upstream = await requestWithDomain(target, config.domain, {
      method: request.method,
      headers: Object.fromEntries(headers.entries()),
      ...(body !== undefined ? { body } : {}),
      signal: request.signal,
      ...(isAgUiEvents ? { streamIdleTimeoutMs: AGUI_STREAM_IDLE_TIMEOUT_MS } : {}),
    })
  } catch {
    return webErrorResponse("bff_unreachable", 502, requestId)
  }

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? ""
  // SSE and binary bodies must remain streaming and opaque to this adapter.
  if (!contentType.includes("application/json")) {
    if (!upstream.ok) {
      const errorHeaders = new Headers()
      const retryAfter = upstream.headers.get("retry-after")
      if (retryAfter !== null) errorHeaders.set("retry-after", retryAfter)
      return bffErrorResponse(upstream, null, "bff_error", requestId, errorHeaders)
    }
    const responseRequestId = requestIdFromResponse(upstream, requestId)
    const responseHeaders = new Headers()
    for (const name of ["content-type", "cache-control", "content-disposition", "content-length"]) {
      const value = upstream.headers.get(name)
      if (value !== null) responseHeaders.set(name, value)
    }
    responseHeaders.set("cache-control", "private, no-store")
    responseHeaders.set("x-request-id", responseRequestId)
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  }

  const raw: unknown = await upstream.json().catch(() => null)
  if (!upstream.ok || bffErrorEnvelopeSchema.safeParse(raw).success) {
    const errorHeaders = new Headers()
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter !== null) errorHeaders.set("retry-after", retryAfter)
    return bffErrorResponse(upstream, raw, "bff_error", requestId, errorHeaders)
  }
  const parsed = bffSuccessEnvelopeSchema(z.unknown()).safeParse(raw)
  if (!parsed.success) return webErrorResponse("bff_bad_response", 502, requestId)

  // The browser SessionClient intentionally keeps the established flat Chat
  // DTOs. Only the Web adapter unwraps the BFF v1 envelope; BFF and upstream
  // business APIs remain envelope-first and independently versioned.
  const responseHeaders = responseHeadersWithRequestId(parsed.data.meta.request_id, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  })
  return new Response(JSON.stringify(parsed.data.data), {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const HEAD = proxy
