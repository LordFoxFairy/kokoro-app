// hub 同源代理（BFF，WEB-SKILLS）：读信封 → 注入 web-bff caller 凭据 + scope/user 身份头 →
// 转发到 kokoro-hub 的 self 面。scope 恒取自密封信封的 namespace，绝不透传浏览器参数当 scope；
// 浏览器只见同源 `/api/hub/*`，runtime 凭据与 namespace 身份全留服务端。变更类请求校验同源 Origin。
//
// 路径约定：浏览器调 `/api/hub/self/skills/pool` → BFF `/v1/skills/pool`
// （BFF 承接原 Hub self 面）。上传走 multipart：透传浏览器 content-type（含 boundary），
// 不强制 application/json。

import { NextResponse } from "next/server"

import { sameOriginOk } from "@/lib/server/same-origin"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// 仅透传 hub 实际需要的入站头（含 multipart 的 content-type+boundary）；绝不转发 cookie，
// 也绝不转发浏览器可能伪造的 x-kokoro-* 身份头（新建 Headers 天然丢弃它们）。
const FORWARD_HEADERS = ["accept", "content-type", "idempotency-key"] as const

function bffBusinessPath(path: string[]): string[] {
  // Preserve the browser-facing Hub namespace and translate it only at the
  // Web-to-BFF boundary. The BFF owns the business path after this point.
  if (path[0] === "self" && path[1] !== undefined) return path.slice(1)
  return path
}

export async function proxyHubRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const config = productBffConfig()
  if (config === null) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  }
  if (config.bffBaseUrl == null) {
    // 未接 hub 节点（预览档）：能力面不可用，展示层据此降级。
    return NextResponse.json({ error: "hub_not_configured" }, { status: 503 })
  }
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  }
  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 })
  }
  if (claims === null) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }

  const { path } = await context.params
  const search = new URL(request.url).search
  const businessPath = bffBusinessPath(path ?? [])
  const encodedBusinessPath = businessPath.map((segment) => encodeURIComponent(segment)).join("/")
  const target = `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${encodedBusinessPath}${search}`

  const headers = productBffHeaders(config, claims, requestId)
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) {
      headers.set(name, value)
    }
  }

  let body: ArrayBuffer | undefined
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE") {
    try {
      body = await readBoundedRequestBody(request)
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "request_body_unreadable",
        },
        { status: error instanceof UpstreamRequestTooLargeError ? 413 : 400 },
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
    })
  } catch {
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 })
  }

  // 原样回传状态与内容类型，body 流式转发（错误码/审核态由展示层解析 hub 响应体决定）。
  const responseHeaders = new Headers()
  for (const name of ["content-type", "cache-control", "content-length"]) {
    const value = upstream.headers.get(name)
    if (value !== null) {
      responseHeaders.set(name, value)
    }
  }
  responseHeaders.set("cache-control", "private, no-store")
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export const GET = proxyHubRequest
export const POST = proxyHubRequest
export const PUT = proxyHubRequest
export const PATCH = proxyHubRequest
export const DELETE = proxyHubRequest
