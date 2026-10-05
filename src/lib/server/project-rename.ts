import { NextResponse } from "next/server"

import { projectRenameIdSchema, projectRenameKeySchema, projectRenameRequestSchema, projectRenameAckMatches,
  projectRenameBrowserCacheControl, projectRenameOwnerHeadersValid, projectRenameOwnerErrorSchema, projectRenameOwnerErrorAllowed,
  parseProjectRenameJson, projectRenameRetryAfterValid,
  type ProjectRenameFault } from "@/contract/project-rename"
import { sameOriginOk } from "./same-origin"
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff"
import { requestWithDomain, UpstreamTimeoutError } from "./upstream-http"

/** Exact browser-private command adapter; generic Hub envelopes are not used. */
export async function proxyProjectRename(request: Request, segments: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string, retryable = false) => NextResponse.json(
    { error: { code, message: code, retryable } },
    { status, headers: { "cache-control": projectRenameBrowserCacheControl, "x-request-id": requestId } },
  )
  const url = new URL(request.url)
  const projectId = segments[1] ?? ""
  if (request.method !== "PATCH" || segments.length !== 3 || segments[0] !== "projects" || segments[2] !== "name"
    || !projectRenameIdSchema.safeParse(projectId).success || request.url.includes("?")
    || url.pathname !== `/api/hub/projects/${projectId}/name`) return fail(400, "invalid_project_rename")
  if (!sameOriginOk(request)) return fail(403, "session_forbidden")
  const key = request.headers.get("idempotency-key")
  if (key === null) return fail(400, "idempotency_key_required")
  if (!projectRenameKeySchema.safeParse(key).success) return fail(400, "invalid_project_rename")
  if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) return fail(400, "invalid_project_rename")

  const controller = new AbortController()
  const deadlineAt = performance.now() + 10_000
  let fault: ProjectRenameFault = "network_error"
  const failureStatus = () => fault === "request_timeout" ? 504 : fault === "request_aborted" ? 499 : 503
  let upstream: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const stop = () => {
    controller.abort()
    if (reader) void reader.cancel().catch(() => undefined)
  }
  let rejectInterrupt: (error: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupt = reject })
  const abort = () => { fault = "request_aborted"; rejectInterrupt(new Error(fault)); stop() }
  const timer = setTimeout(() => { fault = "request_timeout"; rejectInterrupt(new Error(fault)); stop() }, 10_000)
  request.signal.addEventListener("abort", abort, { once: true })
  if (request.signal.aborted) abort()
  const check = () => {
    if (request.signal.aborted) { fault = "request_aborted"; throw new Error(fault) }
    if (performance.now() >= deadlineAt) { fault = "request_timeout"; throw new Error(fault) }
    if (controller.signal.aborted) throw new Error(fault)
  }
  try {
    return await Promise.race([interrupted, (async () => {
      check()
      const config = productBffConfig()
      if (config === null) return fail(503, "product_tenant_not_configured", true)
      let claims
      try { claims = await admittedProductSession(request, config) } catch { return fail(503, "iam_admission_unavailable", true) }
      check()
      if (claims === null) return fail(401, "session_authentication_required")
      let bytes = new Uint8Array(0)
      if (request.body !== null) {
        reader = request.body.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          while (true) {
            check()
            const part = await reader.read()
            check()
            if (part.done) break
            size += part.value.byteLength
            if (size > 65_536) { stop(); return fail(400, "invalid_project_rename") }
            chunks.push(part.value)
          }
        } finally { reader.releaseLock(); reader = undefined }
        bytes = new Uint8Array(size)
        let offset = 0
        for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
      }
      let raw: unknown
      try { raw = parseProjectRenameJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail(400, "invalid_project_rename") }
      const parsed = projectRenameRequestSchema.safeParse(raw)
      if (!parsed.success) return fail(400, "invalid_project_rename")
      check()
      const headers = productBffHeaders(config, claims, requestId)
      headers.set("idempotency-key", key)
      headers.set("content-type", "application/json")
      const body = new TextEncoder().encode(JSON.stringify(parsed.data)).buffer
      try {
        upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/, "")}/v1/projects/${projectId}/name`, config.domain, {
          method: "PATCH", headers, body, signal: controller.signal,
          timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())),
          maxRequestBytes: 65_536, maxResponseBytes: 65_536,
        })
      } catch (error) {
        check()
        return fail(error instanceof UpstreamTimeoutError ? 504 : 503, error instanceof UpstreamTimeoutError ? "request_timeout" : "network_error", true)
      }
      check()
      if (!projectRenameOwnerHeadersValid(upstream.headers)) return fail(502, "invalid_headers", true)
      let payload: unknown
      try { payload = parseProjectRenameJson(await upstream.text()) } catch { check(); return fail(502, "invalid_json", true) }
      check()
      if (upstream.status === 200) {
        if (!projectRenameAckMatches(payload, { projectId, name: parsed.data.name })) return fail(502, "ack_shape_mismatch", true)
      } else {
        const owner = projectRenameOwnerErrorSchema.safeParse(payload)
        if (!owner.success || !projectRenameOwnerErrorAllowed(upstream.status, owner.data.error.code, owner.data.error.retryable)) return fail(502, "unexpected_status", true)
      }
      const retryAfter = upstream.status === 429 ? upstream.headers.get("retry-after") : null
      if (retryAfter !== null && !projectRenameRetryAfterValid(retryAfter)) return fail(502, "invalid_headers", true)
      return NextResponse.json(payload, { status: upstream.status, headers: {
        "cache-control": projectRenameBrowserCacheControl, "x-request-id": upstream.headers.get("x-request-id")!,
        ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
      } })
    })()])
  } catch {
    return fail(failureStatus(), fault, true)
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener("abort", abort)
    stop()
    if (upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(() => undefined)
  }
}
