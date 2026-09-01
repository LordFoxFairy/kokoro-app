// Chat 同源适配器（BFF）：浏览器保留稳定的 `/api/session/*` 兼容路径，服务端统一
// 投影到 `kokoro-bff/v1/*`。BFF Chat 模块负责消息/run/SSE 事实编排；浏览器不直连
// Session、Gateway 或任意业务子仓库。HTTP/SSE/二进制一律流式转发，大 JSON 仅在
// BFF envelope 适配时解包。变更类请求校验同源 Origin。

import { NextResponse } from "next/server"

import { requestWithDomain } from "@/lib/server/upstream-http"
import {
  authConfig,
  INTERNAL_SECRET_HEADER,
  resolveSessionWithRefresh,
  sameOriginOk,
  SERVICE_HEADER,
  SERVICE_VALUE,
} from "@/lib/server/auth"

export const runtime = "nodejs"
// 每请求实时求值：绝不静态化/缓存代理响应（SSE、鉴权头随信封变）。
export const dynamic = "force-dynamic"

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// 仅转发 Chat 实际需要的入站头，绝不转发 cookie（信封 cookie 不得外泄到 BFF）。
const FORWARD_HEADERS = ["accept", "content-type", "last-event-id", "idempotency-key"] as const

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const config = authConfig()
  if (config === null) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  }
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  }
  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()
  const resolved = await resolveSessionWithRefresh(request, config)
  if (resolved === null) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  const { envelope, setCookie } = resolved

  if (config.bffBaseUrl === null || config.bffBaseUrl === undefined) {
    return NextResponse.json({ error: "bff_not_configured" }, { status: 503 })
  }

  const { path } = await context.params
  const search = new URL(request.url).search
  const encodedPath = (path ?? []).map((segment) => encodeURIComponent(segment)).join("/")
  const target = `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${encodedPath}${search}`

  const headers = new Headers()
  headers.set("authorization", `Bearer ${envelope.runtime_jwt}`)
  headers.set("x-kokoro-namespace", envelope.namespace)
  headers.set("x-kokoro-principal-id", envelope.user_id)
  headers.set(SERVICE_HEADER, SERVICE_VALUE)
  if (config.internalSecret !== null) {
    headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)
  }
  headers.set("x-kokoro-request-id", requestId)
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) {
      headers.set(name, value)
    }
  }

  // JSON body 体积小，缓冲即可；GET/DELETE 无体。SSE 是 GET，走响应流式。
  const body =
    request.method === "GET" || request.method === "HEAD" || request.method === "DELETE"
      ? undefined
      : await request.arrayBuffer()

  // The browser Chat client carries its stable message key in the JSON body
  // for the flat legacy contract. Promote it to the standard HTTP
  // Idempotency-Key expected by BFF v1 without exposing any extra identity
  // channel to the browser.
  if (MUTATION_METHODS.has(request.method) && !headers.has("idempotency-key") && body !== undefined) {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(body))
      if (typeof parsed === "object" && parsed !== null && "idempotency_key" in parsed) {
        const key = (parsed as { idempotency_key?: unknown }).idempotency_key
        if (typeof key === "string" && key.trim() !== "") headers.set("idempotency-key", key.trim())
      }
    } catch {
      // Preserve the original body. BFF owns the canonical invalid JSON error.
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
    return NextResponse.json({ error: "bff_unreachable" }, { status: 502 })
  }

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? ""
  // SSE and binary bodies must remain streaming and opaque to this adapter.
  if (!contentType.includes("application/json")) {
    const responseHeaders = new Headers()
    for (const name of ["content-type", "cache-control", "content-disposition", "content-length"]) {
      const value = upstream.headers.get(name)
      if (value !== null) responseHeaders.set(name, value)
    }
    if (setCookie !== null) responseHeaders.append("set-cookie", setCookie)
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  }

  const raw: unknown = await upstream.json().catch(() => null)
  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json({ error: "bff_bad_response" }, { status: 502 })
  }
  if ("error" in raw) {
    const error = raw as { error?: { code?: unknown; message?: unknown } }
    const code = typeof error.error?.code === "string" ? error.error.code : "bff_error"
    const message = typeof error.error?.message === "string" ? error.error.message : code
    return NextResponse.json({ error: message, code }, { status: upstream.status })
  }
  if (!("data" in raw)) {
    return NextResponse.json({ error: "bff_bad_response" }, { status: 502 })
  }

  // The browser SessionClient intentionally keeps the established flat Chat
  // DTOs. Only the Web adapter unwraps the BFF v1 envelope; BFF and upstream
  // business APIs remain envelope-first and independently versioned.
  const responseHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  if (setCookie !== null) responseHeaders.append("set-cookie", setCookie)
  return new Response(JSON.stringify((raw as { data: unknown }).data), { status: upstream.status, headers: responseHeaders })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const HEAD = proxy
