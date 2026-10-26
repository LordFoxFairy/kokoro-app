import { randomUUID } from "node:crypto"
import { projectDownloadBrowserCache, projectDownloadErrorSchema, projectDownloadHeadersValid,
  projectDownloadMaxBytes, projectDownloadMetadata, projectDownloadOwnerStatus, projectDownloadSelector } from "@/contract/project-resource-download"
import { parseProjectRenameJson } from "@/contract/project-rename"
import { productBffConfig, productBffHeaders } from "./product-bff"
import { currentProductSession, type ProductClaims } from "./product-session"
import { requestWithDomain } from "./upstream-http"

type SafeDownloadHeaders = (headers: Headers, maxBytes: number) => Headers | null

/** Claim encoded structural aliases, then reject them against the original request in the adapter. */
export function isProjectResourceDownloadRequest(request: Request): boolean {
  const path = new URL(request.url).pathname
  let decoded = path
  try { decoded = decodeURIComponent(path) } catch {}
  return [path, decoded].some(value => /^\/api\/hub\/(?:self\/)?projects\/.*\/resources\/.*\/content\/*$/u.test(value))
}

function matchingSession(first: ProductClaims, latest: ProductClaims | null): boolean {
  return latest !== null && latest.accessExpiresAt > Date.now() && latest.expiresAt > Date.now()
    && (["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt"] as const).every(key => first[key] === latest[key])
}

/** The single 30s deadline owns every awaited stage and actual EOF, including noncooperative dependencies. */
export async function proxyProjectResourceDownload(request: Request, params: Promise<{ path: string[] }>, safeHeaders: SafeDownloadHeaders): Promise<Response> {
  const deadline = performance.now() + 30_000, requestId = randomUUID(), controller = new AbortController()
  const headers = { "cache-control": projectDownloadBrowserCache, "x-request-id": requestId,
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" }
  const fail = (status: number, code: string) => Response.json({ error: { code, message: code }, meta: { request_id: requestId } }, { status, headers })
  let retired = false, fault = "invalid_response", response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let rejectInterrupt: (reason: Error) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupt = reject })
  const stop = () => {
    controller.abort()
    if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock() } catch {} reader = undefined }
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => undefined)
  }
  const abort = () => { fault = "request_aborted"; stop(); rejectInterrupt(new Error(fault)) }
  const timer = setTimeout(() => { fault = "request_timeout"; stop(); rejectInterrupt(new Error(fault)) }, 30_000)
  request.signal.addEventListener("abort", abort, { once: true })
  if (request.signal.aborted) abort()
  const check = () => {
    if (request.signal.aborted) fault = "request_aborted"
    else if (performance.now() >= deadline) fault = "request_timeout"
    if (retired || controller.signal.aborted || request.signal.aborted || performance.now() >= deadline) { stop(); throw new Error(fault) }
  }
  const read = async (body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
    const parts: Uint8Array[] = []; let count = 0
    if (body) {
      reader = body.getReader()
      for (;;) {
        check(); const part = await reader.read(); check()
        if (part.done) break
        count += part.value.byteLength
        if (count > limit) throw new Error("invalid_length")
        parts.push(part.value)
      }
      reader.releaseLock(); reader = undefined
    }
    const bytes = new Uint8Array(count); let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    return bytes
  }
  const operation = () => serveProjectResourceDownload({ request, params, safeHeaders, requestId, deadline, signal: controller.signal,
    check, read, setResponse: value => { response = value }, fail, headers })
  const currentFault = () => fault
  try { return await Promise.race([interrupted, operation()]) }
  catch { const code = currentFault(); return fail(code === "request_timeout" ? 504 : code === "request_aborted" ? 499 : 502, code) }
  finally { retired = true; clearTimeout(timer); request.signal.removeEventListener("abort", abort); stop() }
}

type DownloadOperation = Readonly<{
  request: Request; params: Promise<{ path: string[] }>; safeHeaders: SafeDownloadHeaders; requestId: string; deadline: number; signal: AbortSignal
  check: () => void; read: (body: ReadableStream<Uint8Array> | null, limit: number) => Promise<Uint8Array<ArrayBuffer>>
  setResponse: (response: Response) => void; fail: (status: number, code: string) => Response; headers: Record<string, string>
}>

/** Route/authentication and binary projection; unrelated Hub adapters retain their own policies. */
async function serveProjectResourceDownload(input: DownloadOperation): Promise<Response> {
  const { request, check, fail } = input
  check()
  if (request.method !== "GET") return fail(405, "project_resource_method_not_allowed")
  const config = productBffConfig()
  if (!config) return fail(503, "product_tenant_not_configured")
  const url = new URL(request.url), origin = new URL(config.session.webOrigin)
  if (url.protocol !== origin.protocol || request.headers.get("host") !== origin.host
    || request.headers.has("origin") && request.headers.get("origin") !== origin.origin) return fail(403, "session_forbidden")
  const { path } = await input.params
  check()
  const projectRef = path[1] ?? "", assetId = path[3] ?? ""
  if (path.length !== 5 || path[0] !== "projects" || path[2] !== "resources" || path[4] !== "content"
    || !projectDownloadSelector.safeParse(projectRef).success || !projectDownloadSelector.safeParse(assetId).success
    || url.pathname !== `/api/hub/projects/${encodeURIComponent(projectRef)}/resources/${encodeURIComponent(assetId)}/content`
    || url.href.includes("?") || url.hash || request.headers.has("idempotency-key") || request.headers.has("transfer-encoding")
    || request.headers.has("content-encoding") || request.headers.has("content-length") && request.headers.get("content-length") !== "0") return fail(400, "invalid_project_resource_request")
  try { await input.read(request.body, 0) } catch { check(); return fail(400, "invalid_project_resource_request") }
  let first: ProductClaims | null
  try { first = await currentProductSession(request, config.session) } catch { check(); return fail(503, "iam_admission_unavailable") }
  check()
  if (!first || first.accessExpiresAt <= Date.now() || first.expiresAt <= Date.now()) return fail(401, "session_invalid")
  let response: Response
  try {
    response = await requestWithDomain(`${config.bffBaseUrl}/v1/projects/${encodeURIComponent(projectRef)}/resources/${encodeURIComponent(assetId)}/content`, config.domain, {
      method: "GET", headers: productBffHeaders(config, first, input.requestId), signal: input.signal,
      timeoutMs: Math.max(1, Math.ceil(input.deadline - performance.now())), maxResponseBytes: projectDownloadMaxBytes,
    })
    input.setResponse(response)
  } catch { check(); return fail(503, "network_error") }
  check()
  if (!projectDownloadHeadersValid(response.headers, "owner", input.requestId)) return fail(502, "invalid_headers")
  let result: Response
  if (response.status === 200) {
    const metadata = projectDownloadMetadata(response.headers), safe = input.safeHeaders(response.headers, projectDownloadMaxBytes)
    if (!metadata || !safe) return fail(502, "invalid_headers")
    const bytes = await input.read(response.body, metadata.length)
    if (bytes.byteLength !== metadata.length) return fail(502, "invalid_length")
    safe.set("cache-control", projectDownloadBrowserCache)
    result = new Response(bytes, { status: 200, headers: safe })
  } else result = await projectDownloadFailure(response, input)
  let latest: ProductClaims | null
  try { latest = await currentProductSession(request, config.session) } catch { check(); return fail(503, "iam_admission_unavailable") }
  check()
  return matchingSession(first, latest) ? result : fail(401, "session_invalid")
}

async function projectDownloadFailure(response: Response, input: DownloadOperation): Promise<Response> {
  if (!projectDownloadOwnerStatus(response.status) || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "")) return input.fail(502, "unexpected_status")
  const retry = response.headers.get("retry-after")
  if (retry !== null && (response.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retry) || Number(retry) > 86400)) return input.fail(502, "invalid_headers")
  try {
    const bytes = await input.read(response.body, projectDownloadMaxBytes)
    const length = response.headers.get("content-length")
    if (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) !== bytes.byteLength)) return input.fail(502, "invalid_length")
    const parsed = projectDownloadErrorSchema.safeParse(parseProjectRenameJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)))
    input.check()
    if (!parsed.success || parsed.data.meta.request_id !== input.requestId) return input.fail(502, "invalid_json")
    return Response.json({ error: { code: parsed.data.error.code, message: parsed.data.error.code }, meta: { request_id: input.requestId } }, {
      status: response.status, headers: { ...input.headers, ...(retry === null ? {} : { "retry-after": retry }) },
    })
  } catch { input.check(); return input.fail(502, "invalid_json") }
}
