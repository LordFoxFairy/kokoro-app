import { NextResponse } from "next/server"
import { projectContentIdSchema, projectContentInstallationIdSchema, projectPackageOperation, projectDownloadOperation, projectPackageErrors, projectPackageResponseSchema, skillDownloadBudgetMs } from "@/generated/bff-project-skill-content"
import { catalogPackagePathSchema, catalogPackageResponseSchema, catalogPackageMatches, installationPackageErrorAllowed } from "@/hub/schemas"
import { skillDownloadErrorEnvelopeAllowed, skillDownloadSchema } from "@/hub/skill-download.schema"
import { parsePersonalSkillHistoryJson } from "@/hub/personal-skill-history.schema"
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff"
import { readBoundedRequestBody, requestWithDomain, UpstreamTimeoutError } from "./upstream-http"

/** Project installation content only; no personal/catalog locator or transport fallback. */
export async function proxyProjectSkillContent(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID(), download = path[4] === "download"
  const fail = (status: number, code: string, retryable = false) => NextResponse.json({ error: { code, message: code, retryable } }, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } })
  const invalid = () => fail(400, download ? "invalid_skill_request" : "invalid_skill_package_request")
  if (path.length !== 5 || path[0] !== "projects" || path[2] !== "skill-installations" || !["package", "download"].includes(path[4] ?? "")
    || !projectContentIdSchema.safeParse(path[1]).success || !projectContentInstallationIdSchema.safeParse(path[3]).success) return invalid()
  if (request.method !== (download ? "POST" : "GET")) return fail(405, "MethodNotAllowed")
  const url = new URL(request.url), suffix = `projects/${encodeURIComponent(path[1]!)}/skill-installations/${encodeURIComponent(path[3]!)}/${path[4]}`
  if (url.pathname !== `/api/hub/${suffix}` || url.hash || request.headers.has("idempotency-key") || request.headers.has("transfer-encoding")
    || (!download && (request.body !== null || request.headers.has("content-length")))
    || (download && request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return invalid()
  const keys = [...url.searchParams.keys()], filePath = url.searchParams.get("file_path") ?? undefined
  if (download ? url.search !== "" : keys.some(key => key !== "file_path") || url.searchParams.getAll("file_path").length > 1 || filePath !== undefined && !catalogPackagePathSchema.safeParse(filePath).success) return invalid()
  const deadline = new AbortController(), signal = AbortSignal.any([request.signal, deadline.signal]), deadlineAt = performance.now() + skillDownloadBudgetMs
  const timer = setTimeout(() => deadline.abort(new UpstreamTimeoutError()), skillDownloadBudgetMs)
  let upstream: Response | undefined
  const within = <T,>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort)); if (signal.aborted) abort()
  })
  try {
    signal.throwIfAborted()
    const config = productBffConfig()
    if (config === null) return fail(503, "product_tenant_not_configured", true)
    if ((download || request.headers.has("origin")) && request.headers.get("origin") !== config.session.webOrigin) return fail(403, "session_forbidden")
    let claims
    try { claims = await within(admittedProductSession(request, config)) }
    catch { signal.throwIfAborted(); return fail(503, "iam_admission_unavailable", true) }
    signal.throwIfAborted()
    if (claims === null) return fail(401, "session_authentication_required")
    if (download) {
      try { if ((await within(readBoundedRequestBody(request, 1, signal))).byteLength !== 0) return invalid() }
      catch { signal.throwIfAborted(); return invalid() }
    }
    signal.throwIfAborted()
    const operation = download ? projectDownloadOperation : projectPackageOperation
    const endpoint = operation.path.replace("{projectId}", encodeURIComponent(path[1]!)).replace("{installation_id}", encodeURIComponent(path[3]!))
    upstream = await within(requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}${endpoint}${filePath === undefined ? "" : `?file_path=${encodeURIComponent(filePath)}`}`, config.domain, {
      method: request.method, headers: productBffHeaders(config, claims, requestId), signal,
      timeoutMs: Math.max(1, Math.ceil(deadlineAt - performance.now())), maxResponseBytes: 1_048_576, maxErrorResponseBytes: 1_048_576, strictResponseLength: true,
    }).then(value => { if (signal.aborted) void value.body?.cancel().catch(() => undefined); return value }))
    signal.throwIfAborted()
    if (upstream === undefined) return fail(502, "skill_response_invalid")
    const id = upstream.headers.get("x-request-id"), retryAfter = upstream.headers.get("retry-after"), declared = upstream.headers.get("content-length")
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/u.test(id ?? "")
      || !upstream.headers.get("cache-control")?.split(",").some(token => token.trim().toLowerCase() === "no-store")
      || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") || upstream.body === null
      || declared !== null && (!/^(0|[1-9][0-9]*)(?![\s\S])/u.test(declared) || Number(declared) > 1_048_576)
      || retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}(?![\s\S])/u.test(retryAfter))) return fail(502, "skill_response_invalid")
    const reader = upstream.body.getReader(), chunks: Uint8Array[] = []; let size = 0
    const cancel = () => { void reader.cancel().catch(() => undefined) }; signal.addEventListener("abort", cancel, { once: true })
    try { for (;;) { const item = await within(reader.read()); signal.throwIfAborted(); if (item.done) break; size += item.value.byteLength; if (size > 1_048_576) return fail(502, "skill_response_invalid"); chunks.push(item.value) } }
    finally { signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => undefined); reader.releaseLock() }
    if (declared !== null && Number(declared) !== size) return fail(502, "skill_response_invalid")
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let raw: unknown
    try { raw = parsePersonalSkillHistoryJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { return fail(502, "skill_response_invalid") }
    signal.throwIfAborted()
    if (upstream.status === 200) {
      if (download) {
        const parsed = skillDownloadSchema.safeParse((raw as { data?: unknown } | null)?.data)
        if (!raw || typeof raw !== "object" || Object.keys(raw).length !== 1 || !parsed.success || Date.parse(parsed.data.download_info.expires_at) <= Date.now()) return fail(502, "skill_response_invalid")
      } else {
        const parsed = catalogPackageResponseSchema.safeParse(raw)
        if (!projectPackageResponseSchema.safeParse(raw).success || !parsed.success || !catalogPackageMatches(parsed.data.data, parsed.data.data.source_ref.slice(6), filePath)) return fail(502, "skill_response_invalid")
      }
    } else if (download ? !skillDownloadErrorEnvelopeAllowed("project_installation", upstream.status, raw)
      : !projectPackageErrors.some(error => error.status === upstream!.status && error.schema.safeParse(raw).success)
        || !installationPackageErrorAllowed(upstream.status, (raw as { error: { code: string } }).error.code, (raw as { error: { retryable: boolean } }).error.retryable, retryAfter)) return fail(502, "skill_response_invalid")
    return NextResponse.json(raw, { status: upstream.status, headers: { "cache-control": "no-store", "x-request-id": id!, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) } })
  } catch (error) {
    if (error instanceof UpstreamTimeoutError || deadline.signal.aborted && !request.signal.aborted) return fail(504, "skill_deadline_exceeded", true)
    return fail(503, download ? "skill_dependency_unavailable" : "skill_package_dependency_unavailable", true)
  } finally { clearTimeout(timer); void upstream?.body?.cancel().catch(() => undefined) }
}
