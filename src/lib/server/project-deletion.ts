import { randomUUID } from "node:crypto"

import { projectDeletionAcceptedMatches, projectDeletionAcceptedSchema, projectDeletionBrowserCacheControl,
  projectDeletionHeadersValid, projectDeletionIdSchema, projectDeletionKeySchema, projectDeletionMaxResponseBytes,
  projectDeletionOwnerErrorAllowed, projectDeletionOwnerErrorSchema, projectDeletionStatusMatches, projectDeletionStatusSchema,
  type ProjectDeletionFault } from "@/contract/project-deletion"
import { parseProjectRenameJson } from "@/contract/project-rename"
import { productBffConfig, productBffHeaders } from "./product-bff"
import { currentProductSession, type ProductClaims } from "./product-session"
import { requestWithDomain } from "./upstream-http"

/** Classification only: decoded aliases enter the strict adapter; they are never normalized into valid commands. */
export function isProjectDeletionRequest(request: Request): boolean {
  const parts = new URL(request.url).pathname.split("/").slice(1).flatMap((part) => {
    try { return decodeURIComponent(part).split("/") } catch { return [part] }
  })
  if (parts[0] !== "api" || parts[1] !== "hub") return false
  const path = parts.slice(parts[2] === "self" ? 3 : 2)
  while (path.at(-1) === "") path.pop()
  return path[0] === "projects" && (path[2] === "deletion" || request.method === "DELETE" && path.length === 2)
}

/** Project deletion owns one deadline including params, both session reads and actual request/owner EOF. */
export async function proxyProjectDeletion(request: Request, params: Promise<{ path: string[] }>): Promise<Response> {
  const deadline = performance.now() + 10_000
  const requestId = randomUUID(), controller = new AbortController()
  const browserHeaders = { "cache-control": projectDeletionBrowserCacheControl, "x-request-id": requestId }
  const fail = (status: number, code: string, retryable = false) => Response.json(
    { error: { code, message: code, retryable } }, { status, headers: browserHeaders },
  )
  const config = productBffConfig()
  if (config === null) return fail(503, "product_tenant_not_configured", true)
  const url = new URL(request.url), origin = new URL(config.session.webOrigin)
  if (!["GET", "DELETE"].includes(request.method)) return fail(405, "project_deletion_method_not_allowed")
  const method = request.method === "DELETE" ? "DELETE" : "GET"
  if (url.protocol !== origin.protocol || request.headers.get("host") !== origin.host
    || (method === "DELETE" ? request.headers.get("origin") !== origin.origin
      : request.headers.has("origin") && request.headers.get("origin") !== origin.origin)) return fail(403, "session_forbidden")
  const key = request.headers.get("idempotency-key")
  if (method === "DELETE" && key === null) return fail(400, "idempotency_key_required")
  if (method === "DELETE" && !projectDeletionKeySchema.safeParse(key).success) return fail(400, "invalid_idempotency_key")
  const encoding = request.headers.get("content-encoding"), transfer = request.headers.get("transfer-encoding")
  if (method === "GET" && key !== null || url.href.includes("?") || url.hash !== ""
    || request.headers.has("content-length") && request.headers.get("content-length") !== "0"
    || encoding !== null && encoding.toLowerCase() !== "identity"
    || transfer !== null && (method === "GET" || transfer.toLowerCase() !== "chunked" || request.headers.has("content-length"))) {
    return fail(400, "invalid_project_deletion_request")
  }

  let retired = false, fault: ProjectDeletionFault = "network_error"
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, response: Response | undefined
  let rejectInterrupt: (reason: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupt = reject })
  const stop = () => {
    controller.abort()
    if (reader) {
      void reader.cancel().catch(() => undefined)
      try { reader.releaseLock() } catch {}
      reader = undefined
    }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { fault = "request_aborted"; stop(); rejectInterrupt(new Error(fault)) }
  const timer = setTimeout(() => { fault = "request_timeout"; stop(); rejectInterrupt(new Error(fault)) }, Math.max(0, deadline - performance.now()))
  request.signal.addEventListener("abort", abort, { once: true })
  if (request.signal.aborted) abort()
  const check = () => {
    if (request.signal.aborted) fault = "request_aborted"
    else if (performance.now() >= deadline) fault = "request_timeout"
    if (retired || controller.signal.aborted || request.signal.aborted || performance.now() >= deadline) {
      stop()
      throw new Error(fault)
    }
  }
  const operation = async (): Promise<Response> => {
    check()
    const { path } = await params
    check()
    const projectId = path[1] ?? ""
    const expected = `/api/hub/projects/${projectId}${method === "GET" ? "/deletion" : ""}`
    if (path[0] !== "projects" || path.length !== (method === "GET" ? 3 : 2)
      || method === "GET" && path[2] !== "deletion" || !projectDeletionIdSchema.safeParse(projectId).success
      || url.pathname !== expected) {
      if (path[0] === "projects" && path.length === 3 && path[2] === "deletion" && method === "DELETE") return fail(405, "project_deletion_method_not_allowed")
      return fail(400, "invalid_project_deletion_request")
    }
    // A zero declared size is insufficient: an actual body must reach EOF without a single byte.
    if (request.body) {
      reader = request.body.getReader()
      try {
        for (;;) {
          check()
          const part = await reader.read()
          check()
          if (part.done) break
          if (part.value.byteLength !== 0) return fail(400, "invalid_project_deletion_request")
        }
      } catch { check(); return fail(400, "invalid_project_deletion_request") }
      reader.releaseLock(); reader = undefined
    }
    let session: ProductClaims | null
    try { session = await currentProductSession(request, config.session) }
    catch { check(); return fail(503, "iam_admission_unavailable", true) }
    check()
    if (!session || session.accessExpiresAt <= Date.now() || session.expiresAt <= Date.now()) return fail(401, "session_invalid")
    const outgoing = productBffHeaders(config, session, requestId)
    if (key !== null) outgoing.set("idempotency-key", key)
    try {
      response = await requestWithDomain(`${config.bffBaseUrl}/v1/projects/${projectId}${method === "GET" ? "/deletion" : ""}`, config.domain, {
        method, headers: outgoing, signal: controller.signal,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())), maxResponseBytes: projectDeletionMaxResponseBytes,
      })
    } catch { check(); return fail(503, "network_error", true) }
    check()
    if (!projectDeletionHeadersValid({ headers: response.headers, status: response.status, projectId, boundary: "owner", requestId })) return fail(502, "invalid_headers", true)
    let bytes = 0, text = ""
    response.headers.forEach((value, name) => { bytes += new TextEncoder().encode(`${name}: ${value}\r\n`).byteLength })
    if (bytes > projectDeletionMaxResponseBytes) return fail(502, "invalid_headers", true)
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    try {
      if (response.body) {
        reader = response.body.getReader()
        for (;;) {
          check()
          const part = await reader.read()
          check()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > projectDeletionMaxResponseBytes) return fail(502, "invalid_json", true)
          text += decoder.decode(part.value, { stream: true })
        }
        text += decoder.decode()
        reader.releaseLock(); reader = undefined
      }
    } catch { check(); return fail(502, "invalid_json", true) }
    let raw: unknown
    try { raw = parseProjectRenameJson(text) } catch { return fail(502, "invalid_json", true) }
    check()
    let output: unknown
    if (response.status === (method === "DELETE" ? 202 : 200)) {
      const input = { raw, projectId }
      if (!(method === "DELETE" ? projectDeletionAcceptedMatches(input) : projectDeletionStatusMatches(input))) return fail(502, "ack_shape_mismatch", true)
      output = method === "DELETE" ? projectDeletionAcceptedSchema.parse(raw) : projectDeletionStatusSchema.parse(raw)
    } else {
      const owner = projectDeletionOwnerErrorSchema.safeParse(raw)
      if (!owner.success || !projectDeletionOwnerErrorAllowed({ method, status: response.status, ...owner.data.error })) return fail(502, "unexpected_status", true)
      output = { error: { ...owner.data.error, message: owner.data.error.code } }
    }
    let latest: ProductClaims | null
    try { latest = await currentProductSession(request, config.session) }
    catch { check(); return fail(503, "iam_admission_unavailable", true) }
    check()
    if (!latest || (["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"] as const).some((field) => latest[field] !== session[field])
      || latest.accessExpiresAt <= Date.now() || latest.expiresAt <= Date.now()) return fail(401, "session_invalid")
    const retry = response.headers.get("retry-after")
    return Response.json(output, { status: response.status, headers: {
      ...browserHeaders,
      ...(response.status === 202 ? { location: `/v1/projects/${projectId}/deletion` } : {}),
      ...(retry === null ? {} : { "retry-after": retry }),
    } })
  }
  const currentFault = (): ProjectDeletionFault => fault
  try { return await Promise.race([interrupted, operation()]) }
  catch { const failure = currentFault(); return fail(failure === "request_timeout" ? 504 : failure === "request_aborted" ? 499 : 503, failure, true) }
  finally { retired = true; clearTimeout(timer); request.signal.removeEventListener("abort", abort); stop() }
}
