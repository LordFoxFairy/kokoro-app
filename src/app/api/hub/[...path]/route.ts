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
const MAX_PERSONAL_DOWNLOAD_BYTES = 1_048_576
const MAX_ARTIFACT_DOWNLOAD_BYTES = 1_073_741_824

function safeDownloadHeaders(headers: Headers, maxBytes: number): Headers | null {
  const type = headers.get("content-type")
  const rawLength = headers.get("content-length")
  const disposition = headers.get("content-disposition")
  const requestId = headers.get("x-request-id")
  const match = disposition === null ? null : /^attachment; filename="([\x20-\x7e]*)"; filename\*=UTF-8''([A-Za-z0-9._~!%-]+)$/u.exec(disposition)
  if (
    type === null || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(type)
    || rawLength === null || !/^(0|[1-9][0-9]*)$/u.test(rawLength)
    || Number(rawLength) > maxBytes
    || match === null || /["\\;]/u.test(match[1] ?? "")
    || headers.get("cache-control") !== "no-store"
    || headers.get("referrer-policy") !== "no-referrer"
    || headers.get("x-content-type-options") !== "nosniff"
    || requestId === null || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(requestId)
  ) return null
  try {
    const filename = decodeURIComponent(match[2] ?? "")
    if (filename.length === 0 || filename.length > 255 || /[\u0000-\u001f\u007f/\\]/u.test(filename)) return null
  } catch {
    return null
  }
  return new Headers({
    "content-type": type,
    "content-length": rawLength,
    "content-disposition": disposition ?? "",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  })
}

function personalDownloadHeaders(headers: Headers): Headers | null {
  return safeDownloadHeaders(headers, MAX_PERSONAL_DOWNLOAD_BYTES)
}

function artifactDownloadHeaders(headers: Headers): Headers | null {
  return safeDownloadHeaders(headers, MAX_ARTIFACT_DOWNLOAD_BYTES)
}

function invalidPersonalDownloadResponse(): Response {
  return NextResponse.json({ error: "library_file_invalid_response" }, { status: 502, headers: { "cache-control": "private, no-store" } })
}

function invalidArtifactDownloadResponse(): Response {
  return NextResponse.json({ error: "library_artifact_invalid_response" }, { status: 502, headers: { "cache-control": "private, no-store" } })
}

function boundedArtifactBody(source: ReadableStream<Uint8Array>, length: number): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let total = 0
  let closed = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return
      try {
        const result = await reader.read()
        if (closed) return
        if (result.done) {
          closed = true
          if (total !== length) controller.error(new Error("artifact download incomplete"))
          else controller.close()
          return
        }
        total += result.value.byteLength
        if (total > length || total > MAX_ARTIFACT_DOWNLOAD_BYTES) {
          closed = true
          await reader.cancel(new Error("artifact download exceeded declared length"))
          controller.error(new Error("artifact download exceeded declared length"))
          return
        }
        controller.enqueue(result.value)
      } catch (error) {
        if (closed) return
        closed = true
        controller.error(error)
      }
    },
    async cancel(reason) {
      closed = true
      await reader.cancel(reason)
    },
  })
}

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
  const personalDownload = request.method === "GET" && businessPath.length === 4
    && businessPath[0] === "library" && businessPath[1] === "files" && businessPath[3] === "content"
  const artifactDownload = request.method === "GET" && businessPath.length === 5
    && businessPath[0] === "library" && businessPath[1] === "artifacts" && businessPath[4] === "content"
  if (personalDownload && path[0] === "self") return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (artifactDownload && path[0] === "self") return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (personalDownload && (search !== "" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(businessPath[2] ?? ""))) {
    return NextResponse.json({ error: "invalid_library_file" }, { status: 400 })
  }
  if (artifactDownload && (search !== "" || ![businessPath[2], businessPath[3]].every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id ?? "")))) {
    return NextResponse.json({ error: "invalid_library_artifact" }, { status: 400 })
  }
  const boundedFileUpload = request.method === "POST"
    && ((businessPath.length === 3 && businessPath[0] === "projects" && businessPath[2] === "resources")
      || (businessPath.length === 2 && businessPath[0] === "library" && businessPath[1] === "files"))
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
      body = await readBoundedRequestBody(request, boundedFileUpload ? 1024 * 1024 : undefined)
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
  let upstreamSignal = request.signal
  let detachArtifactRequestAbort: (() => void) | undefined
  if (artifactDownload) {
    // Next's incoming request signal can end after a native attachment has
    // already received its response headers. Bridge it only while waiting for
    // upstream admission/headers; after handoff, downstream stream cancellation
    // is the authoritative disconnect signal and still cancels the Node body.
    const controller = new AbortController()
    const abort = () => controller.abort(request.signal.reason)
    if (request.signal.aborted) abort()
    else request.signal.addEventListener("abort", abort, { once: true })
    upstreamSignal = controller.signal
    detachArtifactRequestAbort = () => request.signal.removeEventListener("abort", abort)
  }
  try {
    upstream = await requestWithDomain(target, config.domain, {
      method: request.method,
      headers: Object.fromEntries(headers.entries()),
      ...(body !== undefined ? { body } : {}),
      signal: upstreamSignal,
      ...(personalDownload ? { maxResponseBytes: MAX_PERSONAL_DOWNLOAD_BYTES } : {}),
      ...(artifactDownload ? {
        maxResponseBytes: MAX_ARTIFACT_DOWNLOAD_BYTES,
        maxErrorResponseBytes: 16 * 1024 * 1024,
        timeoutMs: 600_000,
        streamTotalTimeoutMs: 1_800_000,
        streamIdleTimeoutMs: 30_000,
        errorResponseTimeoutMs: 15_000,
        strictResponseLength: true,
      } : {}),
      ...(boundedFileUpload ? { timeoutMs: 50_000, maxRequestBytes: 1024 * 1024 } : {}),
    })
  } catch {
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 })
  } finally {
    detachArtifactRequestAbort?.()
  }

  if (personalDownload) {
    if (upstream.status >= 300 && upstream.status < 400) return invalidPersonalDownloadResponse()
    if (upstream.status === 200) {
      const safeHeaders = personalDownloadHeaders(upstream.headers)
      if (safeHeaders === null) {
        await upstream.body?.cancel()
        return invalidPersonalDownloadResponse()
      }
      try {
        const bytes = new Uint8Array(await upstream.arrayBuffer())
        if (request.signal.aborted || bytes.byteLength !== Number(safeHeaders.get("content-length"))) return invalidPersonalDownloadResponse()
        return new Response(bytes, { status: 200, headers: safeHeaders })
      } catch {
        return invalidPersonalDownloadResponse()
      }
    }
  }

  if (artifactDownload) {
    if (upstream.status < 400 && upstream.status !== 200) {
      await upstream.body?.cancel()
      return invalidArtifactDownloadResponse()
    }
    if (upstream.status === 200) {
      const safeHeaders = artifactDownloadHeaders(upstream.headers)
      if (safeHeaders === null || upstream.body === null) {
        await upstream.body?.cancel()
        return invalidArtifactDownloadResponse()
      }
      return new Response(boundedArtifactBody(upstream.body, Number(safeHeaders.get("content-length"))), { status: 200, headers: safeHeaders })
    }
    const errorHeaders = new Headers({ "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" })
    const contentType = upstream.headers.get("content-type")
    if (contentType !== null && /^application\/json(?:;\s*charset=utf-8)?$/iu.test(contentType)) errorHeaders.set("content-type", contentType)
    const ownerRequestId = upstream.headers.get("x-request-id")
    if (ownerRequestId !== null && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(ownerRequestId)) errorHeaders.set("x-request-id", ownerRequestId)
    const retryAfter = upstream.headers.get("retry-after")
    if (upstream.status === 429 && retryAfter !== null && /^[1-9][0-9]{0,4}$/u.test(retryAfter)) errorHeaders.set("retry-after", retryAfter)
    return new Response(upstream.body, { status: upstream.status, headers: errorHeaders })
  }

  // 普通 Hub 响应只回传状态与内容类型，body 流式转发。
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
