import { createPersonalSkillVersionRequestSchema, createPersonalSkillVersionSchema, withdrawPersonalSkillRequestSchema, withdrawPersonalSkillSchema, personalSkillLifecycleErrors, personalSkillLifecycleErrorSchema } from "@/hub/schemas"
import { shareSchemas, shareIdSchema, shareCreateSchema, shareErrorSchema, shareErrorAllowed, shareMatches, type ShareOperation } from "@/hub/skill-share.schema"
import { githubSchemas, githubPreviewRequestSchema, githubPreviewSchema, githubSelectorSchema, githubKeySchema, githubErrorSchema, githubErrorAllowed, githubPreviewMatches, type GithubImportOperation } from "@/hub/skill-github-import.schema"
// hub 同源代理（BFF，WEB-SKILLS）：读信封 → 注入 web-bff caller 凭据 + scope/user 身份头 →
// 转发到 kokoro-hub 的 self 面。scope 恒取自密封信封的 namespace，绝不透传浏览器参数当 scope；
// 浏览器只见同源 `/api/hub/*`，runtime 凭据与 namespace 身份全留服务端。变更类请求校验同源 Origin。
//
// 本人 Skills 读取只使用 managed 同源闭集；目录列表不是本人管理事实。
// 上传旧态仍走 multipart：透传浏览器 content-type（含 boundary），
// 不强制 application/json。

import { localImportBeginRequestSchema, localImportCompleteRequestSchema, localImportIdSchema, localImportKeySchema, localImportSchemas, localImportErrorSchema, localImportErrorAllowed, localImportMatches, type LocalImportOperation } from "@/hub/skill-local-import.schema"

import { NextResponse } from "next/server"
import { z } from "zod"
import { proxyProjectRename } from "@/lib/server/project-rename"

import { sameOriginOk } from "@/lib/server/same-origin"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError, UpstreamTimeoutError } from "@/lib/server/upstream-http"

import { installationIdSchema, installationKeySchema, installationInstallRequestSchema, installationEnabledRequestSchema,
  installationListQuerySchema, installationReceiptMatches, installationResponseSchema, installationErrorSchema, installationErrorAllowed,
  mcpConnectionPageSchema, mcpConnectionReadErrorSchema, mcpConnectionErrorAllowed,
  catalogPackageResponseSchema, catalogPackageErrorSchema, catalogPackagePathSchema, CATALOG_PACKAGE_ERRORS, catalogPackageMatches, manuscriptCoverErrorSchema, MANUSCRIPT_COVER_ERRORS, skillPublishRequestSchema, type InstallationOperation } from "@/hub/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// 仅透传 hub 实际需要的入站头（含 multipart 的 content-type+boundary）；绝不转发 cookie，
// 也绝不转发浏览器可能伪造的 x-kokoro-* 身份头（新建 Headers 天然丢弃它们）。
const FORWARD_HEADERS = ["accept", "content-type", "idempotency-key"] as const
const MAX_PERSONAL_DOWNLOAD_BYTES = 1_048_576
const MAX_ARTIFACT_DOWNLOAD_BYTES = 1_073_741_824
// BFF CreateDraft owner reads at most 65,536 raw JSON bytes, independent of
// the per-field UTF-16 maxima in its public schema.
const MAX_SKILL_COMMAND_BYTES = 65_536
const PROJECTION_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const MCP_CONNECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u
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

function connectionProjectionError(fault: ProjectionFault, requestId: string): Response {
  const base = PROJECTION_FAILURES[fault]
  const code = fault === "bffNotConfigured" || fault === "bffUnavailable" ? "mcp_connection_dependency_unavailable"
    : fault === "invalidOwnerResponse" ? "mcp_connection_response_invalid"
      : base.code
  return NextResponse.json({ error: { code, message: code, retryable: base.retryable } }, {
    status: base.status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  })
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

// Dedicated Product installation boundary; never the permissive legacy Hub branch.
async function proxyInstallation(request: Request, path: string[]): Promise<Response> {
  const supplied = request.headers.get("x-kokoro-request-id")
  const requestId = supplied !== null && PROJECTION_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID()
  const fail = (status: number, code: string, retryable = false) => NextResponse.json({ error: { code, message: code, retryable } }, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } })
  if (path[0] !== "self") return fail(404, "skill_installation_not_found")
  const operation: InstallationOperation | null = path.length === 2 ? request.method === "POST" ? "install" : request.method === "GET" ? "list" : null
    : path.length === 3 ? request.method === "GET" ? "get" : request.method === "DELETE" ? "remove" : null
      : path.length === 4 && path[3] === "enabled" && request.method === "PUT" ? "setEnabled" : null
  if (operation === null) return fail(404, "skill_installation_not_found")
  const mutation = ["install", "setEnabled", "remove"].includes(operation)
  if (mutation && !sameOriginOk(request)) return fail(403, "session_forbidden")
  const config = productBffConfig()
  if (!config?.bffBaseUrl) return fail(503, "product_tenant_not_configured")
  let claims
  try { claims = await admittedProductSession(request, config) } catch { return fail(503, "iam_admission_unavailable", true) }
  if (claims === null) return fail(401, "session_authentication_required")
  const query = new URL(request.url).searchParams
  if (path.length > 2 && !installationIdSchema.safeParse(path[2]).success) return fail(400, "invalid_skill_installation_request")
  if (operation === "list") {
    if ([...query.keys()].some((key) => !["installed", "enabled", "limit", "cursor"].includes(key) || query.getAll(key).length !== 1)) return fail(400, "invalid_skill_installation_request")
    const values: Record<string, unknown> = {}
    for (const [key, value] of query) {
      if (key === "installed" || key === "enabled") {
        if (value !== "true" && value !== "false") return fail(400, "invalid_skill_installation_request")
        values[key] = value === "true"
      } else if (key === "limit") {
        if (!/^[1-9][0-9]{0,2}(?![\s\S])/u.test(value)) return fail(400, "invalid_skill_installation_request")
        values[key] = Number(value)
      } else values[key] = value
    }
    if (!installationListQuerySchema.safeParse(values).success) return fail(400, "invalid_skill_installation_request")
  } else if (query.size) return fail(400, "invalid_skill_installation_request")
  const key = request.headers.get("idempotency-key")
  if (mutation ? !installationKeySchema.safeParse(key).success : key !== null) return fail(400, mutation ? "skill_installation_idempotency_key_required" : "invalid_skill_installation_request")
  let expectedIdentity = path[2] ?? ""
  let expectedEnabled: boolean | undefined
  let body: ArrayBuffer
  try { body = await readBoundedRequestBody(request, 65_536) } catch (error) {
    return fail(error instanceof UpstreamRequestTooLargeError ? 413 : 400, error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "invalid_skill_installation_request")
  }
  if (operation === "install" || operation === "setEnabled") {
    if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return fail(400, "invalid_skill_installation_request")
    try {
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
      const parsed = (operation === "install" ? installationInstallRequestSchema : installationEnabledRequestSchema).safeParse(value)
      if (!parsed.success) return fail(400, "invalid_skill_installation_request")
      if ("source_ref" in parsed.data) expectedIdentity = parsed.data.source_ref
      else expectedEnabled = parsed.data.enabled
    } catch { return fail(400, "invalid_skill_installation_request") }
  } else if (body.byteLength !== 0) return fail(400, "invalid_skill_installation_request")
  const headers = productBffHeaders(config, claims, requestId)
  if (mutation && key !== null) headers.set("idempotency-key", key)
  if (operation === "install" || operation === "setEnabled") headers.set("content-type", "application/json")
  let upstream: Response
  try {
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${path.slice(1).map(encodeURIComponent).join("/")}${query.size ? `?${query}` : ""}`, config.domain, {
      method: request.method, headers: Object.fromEntries(headers), signal: request.signal,
      ...(["install", "setEnabled"].includes(operation) ? { body } : {}),
    })
  } catch (error) {
    return error instanceof UpstreamTimeoutError ? fail(504, "skill_installation_dependency_timeout", true) : fail(503, "skill_installation_dependency_unavailable", true)
  }
  const upstreamId = upstream.headers.get("x-request-id")
  const retryAfter = upstream.status === 429 ? upstream.headers.get("retry-after") : null
  if (!JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "") || upstream.headers.get("cache-control") !== "no-store"
    || upstreamId === null || !PROJECTION_REQUEST_ID.test(upstreamId)
    || retryAfter !== null && !/^[1-9][0-9]{0,4}$/u.test(retryAfter)) {
    await upstream.body?.cancel()
    return fail(502, "skill_installation_response_invalid")
  }
  let raw: unknown
  try { raw = await upstream.json() } catch { return fail(502, "skill_installation_response_invalid") }
  if (upstream.status === 200) {
    const parsed = installationResponseSchema(operation).safeParse(raw)
    if (!parsed.success) return fail(502, "skill_installation_response_invalid")
    const value = parsed.data.data
    if (operation === "get" && (!("installation_id" in value) || value.installation_id !== expectedIdentity)
      || operation !== "get" && operation !== "list" && (!("installation" in value) || !installationReceiptMatches(operation, value, expectedIdentity, expectedEnabled))) return fail(502, "skill_installation_response_invalid")
  } else {
    const error = installationErrorSchema.safeParse(raw)
    if (!error.success || !installationErrorAllowed(operation, upstream.status, error.data.error.code)) return fail(502, "skill_installation_response_invalid")
  }
  return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "no-store", "x-request-id": upstreamId, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
}

// A cover belongs to an owner revision, not a catalog series or a browser URL.
async function proxySkillCover(request: Request, path: string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (fault: ProjectionFault) => projectionError(fault, requestId)
  const url = new URL(request.url)
  const revision = path[1] ?? ""
  if (request.method !== "GET" || path.length !== 3 || path[0] !== "skills" || path[2] !== "cover"
    || !MCP_CONNECTION_ID.test(revision) || url.pathname !== `/api/hub/skills/${encodeURIComponent(revision)}/cover`
    || url.search || url.hash || request.body !== null
    || ["content-length", "transfer-encoding", "idempotency-key"].some((header) => request.headers.has(header))) return fail("invalidSkillRequest")
  const config = productBffConfig()
  if (config === null) return fail("configuration")
  if (request.headers.has("origin") && request.headers.get("origin") !== config.session.webOrigin) return fail("forbidden")
  const cancellation = new AbortController()
  const signal = AbortSignal.any([request.signal, cancellation.signal])
  const deadline = Date.now() + 10_000
  const timer = setTimeout(() => cancellation.abort(new Error("cover deadline")), 10_000)
  let upstream: Response
  try {
    const claims = await new Promise<Awaited<ReturnType<typeof admittedProductSession>>>((resolve, reject) => {
      const abort = () => reject(signal.reason)
      signal.addEventListener("abort", abort, { once: true })
      void admittedProductSession(request, config).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
      if (signal.aborted) abort()
    }).catch(() => undefined)
    if (claims === undefined) return fail("iamUnavailable")
    if (claims === null) return fail("unauthenticated")
    if (signal.aborted) return fail("bffUnavailable")
    const headers = productBffHeaders(config, claims, requestId)
    headers.set("accept", "image/png, image/jpeg, image/webp")
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/skills/${encodeURIComponent(revision)}/cover`, config.domain, {
      method: "GET", headers: Object.fromEntries(headers), signal,
      timeoutMs: Math.max(1, deadline - Date.now()), maxResponseBytes: 5_242_880, maxErrorResponseBytes: 65_536,
      strictResponseLength: true, streamTotalTimeoutMs: 10_000, streamIdleTimeoutMs: 10_000,
    })
  } catch { return fail("bffUnavailable") }
  finally { clearTimeout(timer) }
  if (upstream.status !== 200) {
    // Binary reads never forward redirects or unvalidated dependency envelopes.
    const parsed = manuscriptCoverErrorSchema.safeParse(await upstream.json().catch(() => null))
    if (!parsed.success || !MANUSCRIPT_COVER_ERRORS[upstream.status]?.includes(parsed.data.error.code)) return fail("invalidOwnerResponse")
    return NextResponse.json(parsed.data, { status: upstream.status, headers: { "cache-control": "private, no-store", "x-request-id": requestId } })
  }
  const h = upstream.headers
  const length = h.get("content-length")
  const type = h.get("content-type")
  const ownerId = h.get("x-request-id")
  if (upstream.body === null || type === null || !["image/png", "image/jpeg", "image/webp"].includes(type)
    || length === null || !/^[1-9][0-9]*$/u.test(length) || Number(length) > 5_242_880
    || h.get("cache-control") !== "no-store" || h.get("referrer-policy") !== "no-referrer"
    || h.get("x-content-type-options") !== "nosniff" || ownerId === null || !PROJECTION_REQUEST_ID.test(ownerId)) {
    await upstream.body?.cancel()
    return fail("invalidOwnerResponse")
  }
  return new Response(boundedArtifactBody(upstream.body, Number(length), request.signal), { headers: {
    "content-type": type, "content-length": length, "cache-control": "private, no-store",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-request-id": ownerId,
  } })
}

// Published inspection is neither a series alias nor a personal/installation read.
async function proxyLocalSkillImport(request: Request, path: string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const localError = (status: number, code: string, retryable = false) => NextResponse.json({ error: { code, message: code, retryable } }, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } })
  const fail = (fault: ProjectionFault) => {
    const base = PROJECTION_FAILURES[fault]
    return localError(base.status, fault === "invalidSkillRequest" ? "invalid_local_skill_import_request" : fault === "bffNotConfigured" || fault === "bffUnavailable" ? "local_skill_import_dependency_unavailable" : fault === "invalidOwnerResponse" ? "local_skill_import_response_invalid" : base.code, base.retryable)
  }
  const url = new URL(request.url)
  const id = path[2]
  const operation: LocalImportOperation | undefined = path.length === 2 && request.method === "POST" ? "begin"
    : path.length === 3 && request.method === "GET" ? "get"
      : path.length === 4 && request.method === "POST" && (path[3] === "complete" || path[3] === "finalize") ? path[3] : undefined
  if (!operation || path[0] !== "skills" || path[1] !== "local-imports" || (id !== undefined && !localImportIdSchema.safeParse(id).success)
    || url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` || url.search || url.hash) return fail("invalidSkillRequest")
  const key = request.headers.get("idempotency-key")
  if (operation === "get" && key !== null) return fail("invalidSkillRequest")
  if (operation !== "get" && !localImportKeySchema.safeParse(key).success) return localError(400, "local_skill_import_idempotency_key_required")
  if ((operation === "begin" || operation === "complete") && !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return fail("invalidSkillRequest")
  const config = productBffConfig()
  if (config === null) return fail("configuration")
  if ((operation !== "get" || request.headers.has("origin")) && request.headers.get("origin") !== config.session.webOrigin) return fail("forbidden")
  const deadline = new AbortController()
  const joined = AbortSignal.any([request.signal, deadline.signal])
  const budget = operation === "finalize" ? 20_000 : 10_000
  const expires = Date.now() + budget
  const timer = setTimeout(() => deadline.abort(), budget)
  let upstream: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    let body: ArrayBuffer | undefined
    let parsedBody: unknown
    if (request.body !== null) {
      const reader = request.body.getReader()
      const cancel = () => { void reader.cancel().catch(() => undefined) }
      joined.addEventListener("abort", cancel, { once: true })
      const chunks: Uint8Array[] = []
      let count = 0
      try {
        for (;;) {
          const part = await within(reader.read())
          joined.throwIfAborted()
          if (part.done) break
          count += part.value.byteLength
          if (count > MAX_SKILL_COMMAND_BYTES) return fail("tooLarge")
          chunks.push(part.value)
        }
      } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
      if ((operation === "get" || operation === "finalize") && count !== 0) return fail("invalidSkillRequest")
      if (count) {
        const bytes = new Uint8Array(count)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        body = bytes.buffer
        try { parsedBody = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidSkillRequest") }
      }
    }
    if (operation === "begin" && !localImportBeginRequestSchema.safeParse(parsedBody).success || operation === "complete" && !localImportCompleteRequestSchema.safeParse(parsedBody).success) return fail("invalidSkillRequest")
    const claims = await within(admittedProductSession(request, config)).catch(() => undefined)
    if (claims === undefined) return fail("iamUnavailable")
    if (claims === null) return fail("unauthenticated")
    joined.throwIfAborted()
    const headers = productBffHeaders(config, claims, requestId)
    headers.set("accept", "application/json")
    if (key !== null) headers.set("idempotency-key", key)
    if (body !== undefined) headers.set("content-type", "application/json")
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/browser/v1/${path.map(encodeURIComponent).join("/")}`
    upstream = await within(requestWithDomain(target, config.domain, {
      method: request.method, headers: Object.fromEntries(headers), ...(body === undefined ? {} : { body }), signal: joined,
      timeoutMs: Math.max(1, expires - Date.now()), maxResponseBytes: 1_048_576, maxErrorResponseBytes: 1_048_576,
      strictResponseLength: true,
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    if (upstream === undefined) return fail("bffUnavailable")
    const ownerId = upstream.headers.get("x-request-id")
    if (upstream.body === null || !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "")
      || upstream.headers.get("cache-control") !== "no-store" || !PROJECTION_REQUEST_ID.test(ownerId ?? "")) return fail("invalidOwnerResponse")
    const declared = upstream.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) return fail("invalidOwnerResponse")
    const reader = upstream.body.getReader()
    let size = 0
    const chunks: Uint8Array[] = []
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        joined.throwIfAborted()
        const part = await within(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1_048_576) return fail("invalidOwnerResponse")
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== size) return fail("invalidOwnerResponse")
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidOwnerResponse") }
    joined.throwIfAborted()
    if (upstream.status === (operation === "begin" ? 201 : 200)) {
      const parsed = z.object({ data: localImportSchemas[operation] }).strict().safeParse(raw)
      if (!parsed.success || !localImportMatches(operation, parsed.data.data, id, operation === "complete" ? localImportCompleteRequestSchema.parse(parsedBody) : undefined)) return fail("invalidOwnerResponse")
    } else {
      const parsed = localImportErrorSchema.safeParse(raw)
      if (!parsed.success || !localImportErrorAllowed(operation, upstream.status, parsed.data.error.code)) return fail("invalidOwnerResponse")
    }
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))) return fail("invalidOwnerResponse")
    return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "private, no-store", "x-request-id": ownerId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
  } catch { return fail("bffUnavailable") }
  finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined) }
}


async function proxyGithubSkillImport(request: Request, path: string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (fault: ProjectionFault) => projectionError(fault, requestId)
  const url = new URL(request.url)
  const operation: GithubImportOperation | undefined = path[2] === "preview" || path[2] === "import" ? path[2] : undefined
  if (!operation || request.method !== "POST" || path.length !== 3 || path[0] !== "skills" || path[1] !== "github"
    || url.pathname !== `/api/hub/skills/github/${operation}` || url.search || url.hash) return fail("invalidSkillRequest")
  const key = request.headers.get("idempotency-key")
  if (operation === "preview" ? key !== null : !githubKeySchema.safeParse(key).success) return fail("invalidSkillRequest")
  if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return fail("invalidSkillRequest")
  const config = productBffConfig()
  if (config === null) return fail("configuration")
  if (!config.bffBaseUrl) return fail("bffNotConfigured")
  if (request.headers.get("origin") !== config.session.webOrigin) return fail("forbidden")
  const deadline = new AbortController()
  const joined = AbortSignal.any([request.signal, deadline.signal])
  const budget = 10_000
  const expires = Date.now() + budget
  const timer = setTimeout(() => deadline.abort(), budget)
  let upstream: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    let body: ArrayBuffer | undefined
    let parsedBody: unknown
    if (request.body !== null) {
      const reader = request.body.getReader()
      const cancel = () => { void reader.cancel().catch(() => undefined) }
      joined.addEventListener("abort", cancel, { once: true })
      const chunks: Uint8Array[] = []
      let count = 0
      try {
        for (;;) {
          const part = await within(reader.read())
          joined.throwIfAborted()
          if (part.done) break
          count += part.value.byteLength
          if (count > MAX_SKILL_COMMAND_BYTES) return fail("tooLarge")
          chunks.push(part.value)
        }
      } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
      if (count) {
        const bytes = new Uint8Array(count)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        body = bytes.buffer
        try { parsedBody = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidSkillRequest") }
      }
    }
    if (!(operation === "preview" ? githubPreviewRequestSchema : githubSelectorSchema).safeParse(parsedBody).success) return fail("invalidSkillRequest")
    const claims = await within(admittedProductSession(request, config)).catch(() => undefined)
    if (claims === undefined) return fail("iamUnavailable")
    if (claims === null) return fail("unauthenticated")
    joined.throwIfAborted()
    const headers = productBffHeaders(config, claims, requestId)
    headers.set("accept", "application/json")
    if (key !== null) headers.set("idempotency-key", key)
    if (body !== undefined) headers.set("content-type", "application/json")
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/${path.map(encodeURIComponent).join("/")}`
    upstream = await within(requestWithDomain(target, config.domain, {
      method: request.method, headers: Object.fromEntries(headers), ...(body === undefined ? {} : { body }), signal: joined,
      timeoutMs: Math.max(1, expires - Date.now()), maxResponseBytes: 1_048_576, maxErrorResponseBytes: 1_048_576,
      strictResponseLength: true,
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    if (upstream === undefined) return fail("bffUnavailable")
    const ownerId = upstream.headers.get("x-request-id")
    if (upstream.body === null || !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "")
      || upstream.headers.get("cache-control") !== "no-store" || !PROJECTION_REQUEST_ID.test(ownerId ?? "")) return fail("invalidOwnerResponse")
    const declared = upstream.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) return fail("invalidOwnerResponse")
    const reader = upstream.body.getReader()
    let size = 0
    const chunks: Uint8Array[] = []
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        joined.throwIfAborted()
        const part = await within(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1_048_576) return fail("invalidOwnerResponse")
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== size) return fail("invalidOwnerResponse")
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidOwnerResponse") }
    joined.throwIfAborted()
    if (upstream.status === (operation === "import" ? 201 : 200)) {
      const parsed = z.object({ data: githubSchemas[operation] }).strict().safeParse(raw)
      if (!parsed.success || operation === "preview" && !githubPreviewMatches(githubPreviewSchema.parse(parsed.data.data), githubPreviewRequestSchema.parse(parsedBody))) return fail("invalidOwnerResponse")
    } else {
      const parsed = githubErrorSchema.safeParse(raw)
      if (!parsed.success || !githubErrorAllowed(operation, upstream.status, parsed.data.error.code)) return fail("invalidOwnerResponse")
    }
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))) return fail("invalidOwnerResponse")
    return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "private, no-store", "x-request-id": ownerId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
  } catch { return fail("bffUnavailable") }
  finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined) }
}


async function proxySkillShare(request: Request, path: string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (fault: ProjectionFault) => projectionError(fault, requestId)
  const url = new URL(request.url)
  const operation: ShareOperation | undefined = path.length === 3 && path[2] === "download" && request.method === "POST" ? "download" : path.length === 1 && request.method === "POST" ? "create" : path.length === 2 && request.method === "GET" ? "resolve" : path.length === 3 && path[2] === "skill" && request.method === "GET" ? "summary" : undefined
  if (!operation || path[0] !== "skill-shares" || path.length > 1 && !shareIdSchema.safeParse(path[1]).success || url.pathname !== `/api/hub/${path.map(encodeURIComponent).join("/")}` || url.search || url.hash || request.headers.has("idempotency-key")) return fail("invalidSkillRequest")
  if (operation !== "create" && operation !== "download" && (request.body !== null || request.headers.has("content-length") || request.headers.has("transfer-encoding"))) return fail("invalidSkillRequest")
  if (operation === "download" && (request.headers.has("transfer-encoding") || request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return fail("invalidSkillRequest")
  if (operation === "create" && !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return fail("invalidSkillRequest")
  const config = productBffConfig()
  if (config === null) return fail("configuration")
  if (!config.bffBaseUrl) return fail("bffNotConfigured")
  if ((operation === "create" || operation === "download" || request.headers.has("origin")) && request.headers.get("origin") !== config.session.webOrigin) return fail("forbidden")
  const deadline = new AbortController()
  const joined = AbortSignal.any([request.signal, deadline.signal])
  const budget = 10_000
  const expires = Date.now() + budget
  const timer = setTimeout(() => deadline.abort(), budget)
  let upstream: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    let body: ArrayBuffer | undefined
    let parsedBody: unknown
    if (request.body !== null) {
      const reader = request.body.getReader()
      const cancel = () => { void reader.cancel().catch(() => undefined) }
      joined.addEventListener("abort", cancel, { once: true })
      const chunks: Uint8Array[] = []
      let count = 0
      try {
        for (;;) {
          const part = await within(reader.read())
          joined.throwIfAborted()
          if (part.done) break
          count += part.value.byteLength
          if (operation === "download" && count > 0) return fail("invalidSkillRequest")
          if (count > MAX_SKILL_COMMAND_BYTES) return fail("tooLarge")
          chunks.push(part.value)
        }
      } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
      if (count) {
        if (operation === "download") return fail("invalidSkillRequest")
        const bytes = new Uint8Array(count)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        body = bytes.buffer
        try { parsedBody = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidSkillRequest") }
      }
    }
    if (operation === "create" ? !shareCreateSchema.safeParse(parsedBody).success : body !== undefined) return fail("invalidSkillRequest")
    const claims = await within(admittedProductSession(request, config)).catch(() => undefined)
    if (claims === undefined) return fail("iamUnavailable")
    if (claims === null) return fail("unauthenticated")
    joined.throwIfAborted()
    const headers = productBffHeaders(config, claims, requestId)
    headers.set("accept", "application/json")
    if (body !== undefined) headers.set("content-type", "application/json")
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/${operation === "download" ? "browser/v1" : "v1"}/${path.map(encodeURIComponent).join("/")}`
    upstream = await within(requestWithDomain(target, config.domain, {
      method: request.method, headers: Object.fromEntries(headers), ...(body === undefined ? {} : { body }), signal: joined,
      timeoutMs: Math.max(1, expires - Date.now()), maxResponseBytes: 1_048_576, maxErrorResponseBytes: 1_048_576,
      strictResponseLength: true,
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    if (upstream === undefined) return fail("bffUnavailable")
    const ownerId = upstream.headers.get("x-request-id")
    if (upstream.body === null || !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "")
      || upstream.headers.get("cache-control") !== "no-store" || !PROJECTION_REQUEST_ID.test(ownerId ?? "")) return fail("invalidOwnerResponse")
    const declared = upstream.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) return fail("invalidOwnerResponse")
    const reader = upstream.body.getReader()
    let size = 0
    const chunks: Uint8Array[] = []
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        joined.throwIfAborted()
        const part = await within(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1_048_576) return fail("invalidOwnerResponse")
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== size) return fail("invalidOwnerResponse")
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidOwnerResponse") }
    joined.throwIfAborted()
    if (upstream.status === (operation === "create" ? 201 : 200)) {
      const parsed = z.object({ data: shareSchemas[operation] }).strict().safeParse(raw)
      if (!parsed.success || !shareMatches(operation, parsed.data.data, operation === "create" ? shareCreateSchema.parse(parsedBody).source_ref : path[1]!, config.session.webOrigin)) return fail("invalidOwnerResponse")
    } else {
      const parsed = shareErrorSchema.safeParse(raw)
      if (!parsed.success || !shareErrorAllowed(operation, upstream.status, parsed.data.error.code)) return fail("invalidOwnerResponse")
    }
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))) return fail("invalidOwnerResponse")
    return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "private, no-store", "x-request-id": ownerId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
  } catch { return operation === "download" && deadline.signal.aborted ? NextResponse.json({ error: { code: "skill_deadline_exceeded", message: "Skill download deadline exceeded", retryable: true } }, { status: 504, headers: { "cache-control": "private, no-store", "x-request-id": requestId } }) : fail("bffUnavailable") }
  finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined) }
}


async function proxyCatalogPackage(request: Request, path: string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (fault: ProjectionFault) => projectionError(fault, requestId)
  const revisionSkillId = path[1] ?? ""
  const url = new URL(request.url)
  if (request.method !== "GET" || path.length !== 3 || path[0] !== "skills" || path[2] !== "package"
    || !MCP_CONNECTION_ID.test(revisionSkillId) || url.pathname !== `/api/hub/skills/${encodeURIComponent(revisionSkillId)}/package`
    || request.body !== null || url.hash || [...url.searchParams.keys()].some((key) => key !== "file_path")
    || url.searchParams.getAll("file_path").length > 1
    || ["content-length", "transfer-encoding", "idempotency-key"].some((header) => request.headers.has(header))) return fail("invalidSkillRequest")
  const filePath = url.searchParams.get("file_path") ?? undefined
  if (filePath !== undefined && !catalogPackagePathSchema.safeParse(filePath).success) return fail("invalidSkillRequest")
  const config = productBffConfig()
  if (config === null) return fail("configuration")
  if (request.headers.has("origin") && request.headers.get("origin") !== config.session.webOrigin) return fail("forbidden")
  const deadline = new AbortController()
  const joined = AbortSignal.any([request.signal, deadline.signal])
  const expires = Date.now() + 10_000
  const timer = setTimeout(() => deadline.abort(), 10_000)
  let upstream: Response | undefined
  const within = <T,>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  try {
    joined.throwIfAborted()
    const claims = await within(admittedProductSession(request, config)).catch(() => undefined)
    if (claims === undefined) return fail("iamUnavailable")
    if (claims === null) return fail("unauthenticated")
    joined.throwIfAborted()
    const headers = productBffHeaders(config, claims, requestId)
    headers.set("accept", "application/json")
    const target = `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/skills/${encodeURIComponent(revisionSkillId)}/package${filePath === undefined ? "" : `?file_path=${encodeURIComponent(filePath)}`}`
    upstream = await within(requestWithDomain(target, config.domain, {
      method: "GET", headers: Object.fromEntries(headers), signal: joined,
      timeoutMs: Math.max(1, expires - Date.now()), maxResponseBytes: 1_048_576, maxErrorResponseBytes: 1_048_576,
      strictResponseLength: true,
    }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    if (upstream === undefined) return fail("bffUnavailable")
    const ownerId = upstream.headers.get("x-request-id")
    if (upstream.body === null || !JSON_MEDIA_TYPE.test(upstream.headers.get("content-type") ?? "")
      || upstream.headers.get("cache-control") !== "no-store" || !PROJECTION_REQUEST_ID.test(ownerId ?? "")) return fail("invalidOwnerResponse")
    const declared = upstream.headers.get("content-length")
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > 1_048_576)) return fail("invalidOwnerResponse")
    const reader = upstream.body.getReader()
    let size = 0
    const chunks: Uint8Array[] = []
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        joined.throwIfAborted()
        const part = await within(reader.read())
        joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > 1_048_576) return fail("invalidOwnerResponse")
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== size) return fail("invalidOwnerResponse")
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail("invalidOwnerResponse") }
    joined.throwIfAborted()
    if (upstream.status === 200) {
      const parsed = catalogPackageResponseSchema.safeParse(raw)
      if (!parsed.success || !catalogPackageMatches(parsed.data.data, revisionSkillId, filePath)) return fail("invalidOwnerResponse")
    } else {
      const parsed = catalogPackageErrorSchema.safeParse(raw)
      if (!parsed.success || !CATALOG_PACKAGE_ERRORS[upstream.status]?.includes(parsed.data.error.code)) return fail("invalidOwnerResponse")
    }
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter))) return fail("invalidOwnerResponse")
    return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "private, no-store", "x-request-id": ownerId!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
  } catch { return fail("bffUnavailable") }
  finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined) }
}

async function proxyPersonalSkillLifecycle(request: Request, path: string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string) => NextResponse.json({ error: { code, message: code }, meta: { request_id: requestId } }, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } })
  const id = path[2] ?? ""
  const version = path[3] === "versions"
  if (request.method !== "POST" || path.length !== 4 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(id) || !["versions", "withdraw"].includes(path[3] ?? "") || new URL(request.url).pathname !== `/api/hub/self/skills/${encodeURIComponent(id)}/${path[3]}` || new URL(request.url).search || request.headers.has("transfer-encoding") || !JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return fail(400, "invalid_skill_request")
  const key = request.headers.get("idempotency-key")
  if (key === null) return fail(400, "idempotency_key_required")
  if (!/^[\x21-\x2B\x2D-\x7E]{1,128}$/u.test(key)) return fail(400, "invalid_idempotency_key")
  const config = productBffConfig()
  if (!config) return fail(503, "product_tenant_not_configured")
  if (request.headers.get("origin") !== config.session.webOrigin) return fail(403, "session_forbidden")
  const deadline = new AbortController()
  const joined = AbortSignal.any([request.signal, deadline.signal])
  const timer = setTimeout(() => deadline.abort(), 10_000)
  let upstream: Response | undefined
  const within = <T,>(work: Promise<T>) => new Promise<T>((resolve, reject) => {
    const abort = () => reject(joined.reason)
    joined.addEventListener("abort", abort, { once: true })
    void work.then(resolve, reject).finally(() => joined.removeEventListener("abort", abort))
    if (joined.aborted) abort()
  })
  const read = async (body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> => {
    if (!body) throw new Error("empty body")
    const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }
    joined.addEventListener("abort", cancel, { once: true })
    try {
      for (;;) {
        const part = await within(reader.read()); joined.throwIfAborted()
        if (part.done) break
        size += part.value.byteLength
        if (size > max) throw new UpstreamRequestTooLargeError()
        chunks.push(part.value)
      }
    } finally { joined.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  }
  try {
    joined.throwIfAborted()
    let input: unknown; let bytes: Uint8Array
    try { bytes = await read(request.body, MAX_SKILL_COMMAND_BYTES); input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
    catch (error) { if (joined.aborted) return fail(503, "skill_dependency_unavailable"); return fail(error instanceof UpstreamRequestTooLargeError ? 413 : 400, error instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "invalid_skill_request") }
    const parsed = (version ? createPersonalSkillVersionRequestSchema : withdrawPersonalSkillRequestSchema).safeParse(input)
    if (!parsed.success) return fail(400, "invalid_skill_request")
    const claims = await within(admittedProductSession(request, config)).catch(() => undefined)
    if (claims === undefined) return fail(503, "iam_admission_unavailable")
    if (claims === null) return fail(401, "session_authentication_required")
    const headers = productBffHeaders(config, claims, requestId); headers.set("content-type", "application/json"); headers.set("idempotency-key", key); headers.set("content-length", String(bytes.byteLength))
    joined.throwIfAborted()
    const response = await within(requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/self/skills/${encodeURIComponent(id)}/${path[3]}`, config.domain, { method: "POST", headers: Object.fromEntries(headers), body: bytes!.buffer as ArrayBuffer, signal: joined, timeoutMs: 10_000, maxResponseBytes: 1_048_576 }).then((value) => { if (joined.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    upstream = response
    const ownerId = response.headers.get("x-request-id")
    if (!ownerId || !PROJECTION_REQUEST_ID.test(ownerId) || !response.headers.get("cache-control")?.split(",").map(value => value.trim()).includes("no-store") || !JSON_MEDIA_TYPE.test(response.headers.get("content-type") ?? "")) return fail(502, "skill_response_invalid")
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await read(response.body, 1_048_576))) }
    catch { return fail(joined.aborted ? 503 : 502, joined.aborted ? "skill_dependency_unavailable" : "skill_response_invalid") }
    const success = version ? 201 : 200
    if (response.status === success) {
      const ack = z.object({ data: version ? createPersonalSkillVersionSchema : withdrawPersonalSkillSchema, meta: z.object({ request_id: z.literal(ownerId) }).strict() }).strict().safeParse(raw)
      if (!ack.success) return fail(502, "skill_response_invalid")
      if (version ? !("skill_id" in ack.data.data) || ack.data.data.skill_id === id : !("source_ref" in ack.data.data) || ack.data.data.source_ref !== `skill:${id}` || BigInt(ack.data.data.state_version) <= BigInt(withdrawPersonalSkillRequestSchema.parse(input).expected_state_version)) return fail(502, "skill_response_invalid")
    } else {
      const error = personalSkillLifecycleErrorSchema.safeParse(raw)
      if (!error.success || error.data.meta.request_id !== ownerId || !personalSkillLifecycleErrors[response.status]?.includes(error.data.error.code)) return fail(502, "skill_response_invalid")
    }
    const retryAfter = response.headers.get("retry-after")
    if (retryAfter !== null && (response.status !== 429 || !/^(?:[1-9][0-9]{0,3}|[1-7][0-9]{4}|8[0-5][0-9]{3}|86[0-3][0-9]{2}|86400)$/u.test(retryAfter))) return fail(502, "skill_response_invalid")
    joined.throwIfAborted()
    return NextResponse.json(raw, { status: response.status, headers: { "cache-control": "no-store", "x-request-id": ownerId, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
  } catch { return fail(503, "skill_dependency_unavailable") }
  finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined) }
}

export async function proxyHubRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params
  if (path[0] === "self" && path[1] === "skills" && ["versions", "withdraw"].includes(path[3] ?? "")) return proxyPersonalSkillLifecycle(request, path)
  if (path[0] === "skill-shares") return proxySkillShare(request, path)
  if (path[0] === "skills" && path[1] === "github") return proxyGithubSkillImport(request, path)
  if (path[0] === "skills" && path[1] === "local-imports") return proxyLocalSkillImport(request, path)
  if (path.at(-1) === "package" && path[0] !== "skill-installations") return proxyCatalogPackage(request, path)
  if (path.at(-1) === "cover") return proxySkillCover(request, path)
  if (path[0] === "projects" && path[2] === "name" || path[0] === "self" && path[1] === "projects" && path[3] === "name") return proxyProjectRename(request, path)
  if (path[0] === "skill-installations" || path[0] === "self" && path[1] === "skill-installations") return proxyInstallation(request, path)
  const search = new URL(request.url).search
  const businessPath = bffBusinessPath(path ?? [])
  if (path[0] !== "self" && (businessPath[0] === "skills" || businessPath[0] === "mcp" && ["servers", "connections"].includes(businessPath[1] ?? ""))) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  }
  const managedSkillPath = path[0] === "self" && path[1] === "skills" && path[2] === "managed"
  const managedSkillRead = managedSkillPath && request.method === "GET" && (path.length === 3 || path.length === 4)
  if (managedSkillPath && !managedSkillRead) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  if (request.method === "GET" && path[0] === "self" && businessPath[0] === "skills" && (businessPath.length === 1 || businessPath.length === 2 && !managedSkillRead)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  const mcpConnectionRead = request.method === "GET" && path[0] === "self" && businessPath.length === 2 && businessPath[0] === "mcp" && businessPath[1] === "connections"
  const publicProjectionRead = mcpConnectionRead
  const formalSkillId = businessPath[1] ?? ""
  const skillUploadGet = request.method === "GET" && path[0] === "self" && businessPath.length === 3 && businessPath[0] === "skills" && businessPath[2] === "package-upload"
  const skillDraftPost = request.method === "POST" && path[0] === "self" && businessPath.length === 2 && businessPath[0] === "skills" && businessPath[1] === "drafts"
  const skillWritePost = request.method === "POST" && path[0] === "self" && businessPath[0] === "skills" && (
    businessPath.length === 3 && ["package-upload", "validate", "publish"].includes(businessPath[2] ?? "")
    || businessPath.length === 4 && businessPath[2] === "package-upload" && businessPath[3] === "complete"
  )
  const publicSkillBoundary = managedSkillRead || publicProjectionRead || skillUploadGet || skillDraftPost || skillWritePost
  const incomingRequestId = request.headers.get("x-kokoro-request-id")
  const requestId = publicSkillBoundary
    ? incomingRequestId !== null && PROJECTION_REQUEST_ID.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID()
    : incomingRequestId || crypto.randomUUID()
  const localSkillError = (fault: ProjectionFault, id: string): Response => {
    if (!managedSkillRead) return projectionError(fault, id)
    const { status, code } = PROJECTION_FAILURES[fault]
    const managedCode = code === "invalid_query_parameter" ? "invalid_skill_request" : code
    return NextResponse.json({ error: { code: managedCode, message: managedCode }, meta: { request_id: id } }, { status, headers: { "cache-control": "no-store", "x-request-id": id } })
  }
  const config = productBffConfig()
  if (config === null) {
    if (publicSkillBoundary) return mcpConnectionRead ? connectionProjectionError("configuration", requestId) : localSkillError("configuration", requestId)
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  }
  if (config.bffBaseUrl == null) {
    // 未接 hub 节点（预览档）：能力面不可用，展示层据此降级。
    if (publicSkillBoundary) return mcpConnectionRead ? connectionProjectionError("bffNotConfigured", requestId) : localSkillError("bffNotConfigured", requestId)
    return NextResponse.json({ error: "hub_not_configured" }, { status: 503 })
  }
  if (MUTATION_METHODS.has(request.method) && !sameOriginOk(request)) {
    if (publicSkillBoundary) return mcpConnectionRead ? connectionProjectionError("forbidden", requestId) : localSkillError("forbidden", requestId)
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  }
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    if (publicSkillBoundary) return mcpConnectionRead ? connectionProjectionError("iamUnavailable", requestId) : localSkillError("iamUnavailable", requestId)
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 })
  }
  if (claims === null) {
    if (publicSkillBoundary) return mcpConnectionRead ? connectionProjectionError("unauthenticated", requestId) : localSkillError("unauthenticated", requestId)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  // The multipart preview/confirm and GitHub pseudo-publish routes belong to
  // explicit local fixtures only; they are not a production publish fallback.
  if (path[0] === "self" && businessPath[0] === "skills" && ["upload", "github"].includes(businessPath[1] ?? "")) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  }
  if (request.method === "GET" && path[0] === "self" && (
    (businessPath[0] === "skills" && ["pool", "catalog", "quota"].includes(businessPath[1] ?? ""))
    || (businessPath[0] === "mcp" && ["servers", "secrets"].includes(businessPath[1] ?? ""))
  )) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } })
  if (managedSkillRead) {
    const query = new URLSearchParams(search)
    if (path.length === 4 && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/u.test(path[3] ?? "") || search !== "")) return localSkillError("invalidQuery", requestId)
    if (path.length === 3 && ([...query.keys()].some((key) => !["status", "limit", "cursor"].includes(key) || query.getAll(key).length !== 1)
      || !["draft", "active"].includes(query.get("status") ?? "") || query.has("limit") && !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(query.get("limit") ?? "")
      || query.has("cursor") && (!query.get("cursor") || query.get("cursor")!.length > 2048))) return localSkillError("invalidQuery", requestId)
    if (request.headers.has("idempotency-key") || request.headers.has("transfer-encoding") || request.headers.has("content-length") && request.headers.get("content-length") !== "0") return localSkillError("invalidQuery", requestId)
  }
  if (publicProjectionRead) {
    if (mcpConnectionRead && ((request.headers.get("content-length") !== null && request.headers.get("content-length") !== "0")
      || request.headers.has("transfer-encoding") || request.headers.has("idempotency-key"))) {
      return connectionProjectionError("invalidQuery", requestId)
    }
    const query = new URLSearchParams(search)
    const allowed = mcpConnectionRead ? ["connection_id", "provider_key", "limit", "cursor"] : []
    const invalidQuery = [...query.keys()].some((key) => !allowed.includes(key) || query.getAll(key).length !== 1)
      || (query.has("cursor") && (query.get("cursor") === "" || [...(query.get("cursor") ?? "")].length > (mcpConnectionRead ? 2048 : 4096)))
      || (mcpConnectionRead && query.has("connection_id") && !MCP_CONNECTION_ID.test(query.get("connection_id") ?? ""))
      || (mcpConnectionRead && query.has("provider_key") && (query.get("provider_key") === "" || [...(query.get("provider_key") ?? "")].length > 191))
      || (mcpConnectionRead && query.has("limit") && !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(query.get("limit") ?? ""))
    if (invalidQuery) return mcpConnectionRead ? connectionProjectionError("invalidQuery", requestId) : localSkillError("invalidQuery", requestId)
  }
  if (skillUploadGet || skillDraftPost || skillWritePost) {
    if (search !== "" || ((skillUploadGet || skillWritePost) && !PROJECTION_REQUEST_ID.test(formalSkillId))) return localSkillError("invalidSkillRequest", requestId)
    if ((skillDraftPost || skillWritePost) && !/^[\x21-\x2B\x2D-\x7E]{1,128}$/u.test(request.headers.get("idempotency-key") ?? "")) return localSkillError("invalidSkillRequest", requestId)
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
  const target = `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/${managedSkillRead ? `self/skills${path.length === 4 ? `/${encodeURIComponent(path[3]!)}` : ""}` : encodedBusinessPath}${search}`

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
      body = await readBoundedRequestBody(request, boundedFileUpload ? 1024 * 1024 : publicSkillBoundary ? MAX_SKILL_COMMAND_BYTES : undefined)
      if (skillWritePost && businessPath[2] === "publish") {
        if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return localSkillError("invalidSkillRequest", requestId)
        let raw: unknown
        try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown } catch { return localSkillError("invalidSkillRequest", requestId) }
        if (!skillPublishRequestSchema.safeParse(raw).success) return localSkillError("invalidSkillRequest", requestId)
      }
    } catch (error) {
      if (publicSkillBoundary) return localSkillError(error instanceof UpstreamRequestTooLargeError ? "tooLarge" : "invalidSkillRequest", requestId)
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
      ...(publicSkillBoundary ? { timeoutMs: 10_000, maxResponseBytes: 1024 * 1024 } : {}),
    })
  } catch {
    if (publicSkillBoundary) return mcpConnectionRead ? connectionProjectionError("bffUnavailable", requestId) : localSkillError("bffUnavailable", requestId)
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
    const allowedSkillErrors = managedSkillRead ? [400, 401, 403, 404, 429, 502, 503] : skillDraftPost ? [400, 401, 403, 409, 412, 413, 429, 502, 503]
      : skillUploadGet ? [400, 401, 403, 404, 412, 429, 502, 503]
        : [400, 401, 403, 404, 409, 412, 413, 429, 502, 503]
    if (upstream.status >= 200 && upstream.status < 300 && upstream.status !== expectedSuccess
      || upstream.status >= 300 && upstream.status < 400
      || (managedSkillRead || skillDraftPost || skillUploadGet || skillWritePost) && upstream.status >= 400 && !allowedSkillErrors.includes(upstream.status)
      || upstream.headers.get("cache-control") !== "no-store"
      || upstreamRequestId === null
      || !PROJECTION_REQUEST_ID.test(upstreamRequestId)
      || upstreamContentType === null
      || !JSON_MEDIA_TYPE.test(upstreamContentType)) {
      await upstream.body?.cancel()
      return mcpConnectionRead ? connectionProjectionError("invalidOwnerResponse", requestId) : localSkillError("invalidOwnerResponse", requestId)
    }
    if (mcpConnectionRead) {
      let raw: unknown
      try {
        raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await upstream.arrayBuffer()))
      } catch (error) {
        return connectionProjectionError(error instanceof UpstreamTimeoutError ? "bffUnavailable" : "invalidOwnerResponse", requestId)
      }
      const error = mcpConnectionReadErrorSchema.safeParse(raw)
      const valid = upstream.status === 200
        ? z.object({ data: mcpConnectionPageSchema }).strict().safeParse(raw).success
        : error.success && mcpConnectionErrorAllowed(upstream.status, error.data.error.code)
      if (!valid) return connectionProjectionError("invalidOwnerResponse", requestId)
      return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "no-store", "x-request-id": upstreamRequestId } })
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
