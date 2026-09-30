// hub 同源代理（BFF，WEB-SKILLS）：读信封 → 注入 web-bff caller 凭据 + scope/user 身份头 →
// 转发到 kokoro-hub 的 self 面。scope 恒取自密封信封的 namespace，绝不透传浏览器参数当 scope；
// 浏览器只见同源 `/api/hub/*`，runtime 凭据与 namespace 身份全留服务端。变更类请求校验同源 Origin。
//
// 路径约定：浏览器调 `/api/hub/self/skills?scope_kind=personal` → BFF `/v1/skills?scope_kind=personal`。
// 上传旧态仍走 multipart：透传浏览器 content-type（含 boundary），
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
const PROJECTION_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const JSON_MEDIA_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu

type ProjectionFault = "configuration" | "bffNotConfigured" | "iamUnavailable" | "unauthenticated" | "forbidden" | "invalidQuery" | "invalidSkillRequest" | "tooLarge" | "bffUnavailable" | "invalidOwnerResponse"
type ProjectionLocalCode = "product_tenant_not_configured" | "skill_dependency_unavailable" | "iam_admission_unavailable" | "session_authentication_required" | "session_forbidden" | "invalid_query_parameter" | "invalid_skill_request" | "request_body_too_large" | "skill_response_invalid"
const PROJECTION_FAILURES = {
  configuration: { status: 503, code: "product_tenant_not_configured", retryable: false },
  bffNotConfigured: { status: 503, code: "skill_dependency_unavailable", retryable: false },
  iamUnavailable: { status: 503, code: "iam_admission_unavailable", retryable: true },
  unauthenticated: { status: 401, code: "session_authentication_required", retryable: false },
  forbidden: { status: 403, code: "session_forbidden", retryable: false },
  invalidQuery: { status: 400, code: "invalid_query_parameter", retryable: false },
  invalidSkillRequest: { status: 400, code: "invalid_skill_request", retryable: false },
  tooLarge: { status: 413, code: "request_body_too_large", retryable: false },
  bffUnavailable: { status: 503, code: "skill_dependency_unavailable", retryable: true },
  invalidOwnerResponse: { status: 502, code: "skill_response_invalid", retryable: false },
} as const satisfies Record<ProjectionFault, { status: 400 | 401 | 403 | 413 | 502 | 503; code: ProjectionLocalCode; retryable: boolean }>

function projectionError(fault: ProjectionFault, requestId: string): Response {
  const { status, code, retryable } = PROJECTION_FAILURES[fault]
  return NextResponse.json(
    { error: { code, message: code, retryable } },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  )
}

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

function boundedArtifactBody(source: ReadableStream<Uint8Array>, length: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let total = 0
  let closed = false
  let onAbort: (() => void) | undefined
  const cleanup = () => { if (onAbort) signal.removeEventListener("abort", onAbort) }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        if (closed) return
        closed = true
        void reader.cancel(signal.reason)
        controller.error(signal.reason ?? new Error("artifact download cancelled"))
        cleanup()
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    },
    async pull(controller) {
      if (closed) return
      try {
        const result = await reader.read()
        if (closed) return
        if (result.done) {
          closed = true
          cleanup()
          if (total !== length) controller.error(new Error("artifact download incomplete"))
          else controller.close()
          return
        }
        total += result.value.byteLength
        if (total > length || total > MAX_ARTIFACT_DOWNLOAD_BYTES) {
          closed = true
          cleanup()
          await reader.cancel(new Error("artifact download exceeded declared length"))
          controller.error(new Error("artifact download exceeded declared length"))
          return
        }
        controller.enqueue(result.value)
      } catch (error) {
        if (closed) return
        closed = true
        cleanup()
        controller.error(error)
      }
    },
    async cancel(reason) {
      closed = true
      cleanup()
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
  const { path } = await context.params
  const search = new URL(request.url).search
  const businessPath = bffBusinessPath(path ?? [])
  const personalSkillListRead = request.method === "GET" && path[0] === "self" && businessPath.length === 1 && businessPath[0] === "skills"
  const personalSkillIdRead = request.method === "GET" && path[0] === "self" && businessPath.length === 2 && businessPath[0] === "skills"
    && !["pool", "catalog", "quota"].includes(businessPath[1] ?? "")
  const mcpProjectionRead = request.method === "GET" && path[0] === "self" && businessPath.length === 2 && businessPath[0] === "mcp" && businessPath[1] === "servers"
  const publicProjectionRead = personalSkillListRead || personalSkillIdRead || mcpProjectionRead
  const formalSkillId = businessPath[1] ?? ""
  const skillUploadGet = request.method === "GET" && path[0] === "self" && businessPath.length === 3 && businessPath[0] === "skills" && businessPath[2] === "package-upload"
  const skillDraftPost = request.method === "POST" && path[0] === "self" && businessPath.length === 2 && businessPath[0] === "skills" && businessPath[1] === "drafts"
  const skillWritePost = request.method === "POST" && path[0] === "self" && businessPath[0] === "skills" && (
    businessPath.length === 3 && ["package-upload", "validate", "publish"].includes(businessPath[2] ?? "")
    || businessPath.length === 4 && businessPath[2] === "package-upload" && businessPath[3] === "complete"
  )
  const publicSkillBoundary = publicProjectionRead || skillUploadGet || skillDraftPost || skillWritePost
  const incomingRequestId = request.headers.get("x-kokoro-request-id")
  const requestId = publicSkillBoundary
    ? incomingRequestId !== null && PROJECTION_REQUEST_ID.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID()
    : incomingRequestId || crypto.randomUUID()
  const config = productBffConfig()
  if (config === null) {
    if (publicSkillBoundary) return projectionError("configuration", requestId)
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  }
  if (config.bffBaseUrl == null) {
    // 未接 hub 节点（预览档）：能力面不可用，展示层据此降级。
    if (publicSkillBoundary) return projectionError("bffNotConfigured", requestId)
    return NextResponse.json({ error: "hub_not_configured" }, { status: 503 })
  }
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) {
    if (publicSkillBoundary) return projectionError("forbidden", requestId)
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  }
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    if (publicSkillBoundary) return projectionError("iamUnavailable", requestId)
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 })
  }
  if (claims === null) {
    if (publicSkillBoundary) return projectionError("unauthenticated", requestId)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  // The multipart preview/confirm and GitHub pseudo-publish routes belong to
  // explicit local fixtures only; they are not a production publish fallback.
  if (path[0] === "self" && businessPath[0] === "skills" && ["upload", "github"].includes(businessPath[1] ?? "")) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  }
  if (request.method === "GET" && path[0] === "self" && (
    (businessPath[0] === "skills" && ["pool", "catalog", "quota"].includes(businessPath[1] ?? ""))
    || (businessPath[0] === "mcp" && businessPath[1] === "secrets")
  )) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  if (publicProjectionRead) {
    const query = new URLSearchParams(search)
    const allowed = personalSkillListRead ? ["scope_kind", "cursor"] : mcpProjectionRead ? ["cursor"] : []
    const invalidQuery = [...query.keys()].some((key) => !allowed.includes(key) || query.getAll(key).length !== 1)
      || (personalSkillListRead && query.get("scope_kind") !== "personal")
      || (query.has("cursor") && (query.get("cursor") === "" || (query.get("cursor")?.length ?? 0) > 4096))
      || (personalSkillIdRead && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(businessPath[1] ?? ""))
    if (invalidQuery) return projectionError(personalSkillIdRead ? "invalidSkillRequest" : "invalidQuery", requestId)
  }
  if (skillUploadGet || skillDraftPost || skillWritePost) {
    if (search !== "" || ((skillUploadGet || skillWritePost) && !PROJECTION_REQUEST_ID.test(formalSkillId))) return projectionError("invalidSkillRequest", requestId)
    if ((skillDraftPost || skillWritePost) && !/^[\x21-\x2B\x2D-\x7E]{1,128}$/u.test(request.headers.get("idempotency-key") ?? "")) return projectionError("invalidSkillRequest", requestId)
  }
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
      body = await readBoundedRequestBody(request, boundedFileUpload ? 1024 * 1024 : publicSkillBoundary ? 64 * 1024 : undefined)
      if (skillWritePost && businessPath[2] === "publish" && body.byteLength !== 0) return projectionError("invalidSkillRequest", requestId)
    } catch (error) {
      if (publicSkillBoundary) return projectionError(error instanceof UpstreamRequestTooLargeError ? "tooLarge" : "invalidSkillRequest", requestId)
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
    if (publicSkillBoundary) return projectionError("bffUnavailable", requestId)
    return NextResponse.json({ error: "hub_unreachable" }, { status: 502 })
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
      return new Response(boundedArtifactBody(upstream.body, Number(safeHeaders.get("content-length")), request.signal), { status: 200, headers: safeHeaders })
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

  if (publicSkillBoundary) {
    const upstreamRequestId = upstream.headers.get("x-request-id")
    const upstreamContentType = upstream.headers.get("content-type")
    const expectedSuccess = skillDraftPost || (skillWritePost && businessPath[2] === "package-upload" && businessPath.length === 3) ? 201 : 200
    const allowedSkillErrors = skillDraftPost ? [400, 401, 403, 409, 412, 413, 429, 502, 503]
      : skillUploadGet ? [400, 401, 403, 404, 412, 429, 502, 503]
        : [400, 401, 403, 404, 409, 412, 413, 429, 502, 503]
    if (upstream.status >= 200 && upstream.status < 300 && upstream.status !== expectedSuccess
      || upstream.status >= 300 && upstream.status < 400
      || (skillDraftPost || skillUploadGet || skillWritePost) && upstream.status >= 400 && !allowedSkillErrors.includes(upstream.status)
      || upstream.headers.get("cache-control") !== "no-store"
      || upstreamRequestId === null
      || !PROJECTION_REQUEST_ID.test(upstreamRequestId)
      || upstreamContentType === null
      || !JSON_MEDIA_TYPE.test(upstreamContentType)) {
      await upstream.body?.cancel()
      return projectionError("invalidOwnerResponse", requestId)
    }
    const projectionHeaders = new Headers({ "cache-control": "no-store", "x-request-id": upstreamRequestId, "content-type": upstreamContentType })
    return new Response(upstream.body, { status: upstream.status, headers: projectionHeaders })
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
