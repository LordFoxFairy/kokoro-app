import { isLibraryFileDeleteOwnerError, libraryFileAssetIdSchema, libraryFileDeleteErrorSchema, libraryFileDeleteKeySchema, libraryFileDeleteResponseSchema } from "@/contract/library-file"

import { nativeSessionBffHeaders, productBffConfig } from "./product-bff"
import { sameOriginOk } from "./same-origin"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "./upstream-http"

const ownerDeadlineMs = 10_000
const jsonMediaType = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu
const prohibitedHeaders = ["content-encoding", "transfer-encoding", "if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range"]

/** Exact empty personal deletion; the BFF authorizes the current owner. */
export async function proxyLibraryFileDelete(request: Request, path: readonly string[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  const replyHeaders = { "cache-control": "private, no-store", "x-request-id": requestId }
  const fail = (status: number, code: string, retryable = false) => Response.json({
    error: { code, message: "Personal library file deletion could not be confirmed", retryable },
  }, { status, headers: replyHeaders })
  if (path.length !== 3 || path[0] !== "library" || path[1] !== "files") return fail(404, "file_not_found")
  const id = libraryFileAssetIdSchema.safeParse(path[2])
  if (!id.success) return fail(400, "invalid_file_delete_request")
  const encoded = encodeURIComponent(id.data)
  const url = new URL(request.url)
  const length = request.headers.get("content-length")
  if (url.pathname !== `/api/hub/library/files/${encoded}` || request.url.includes("?") || url.hash ||
    (length !== null && length !== "0") || prohibitedHeaders.some((name) => request.headers.has(name)))
    return fail(400, "invalid_file_delete_request")
  const key = libraryFileDeleteKeySchema.safeParse(request.headers.get("idempotency-key"))
  if (!key.success) return fail(400, "invalid_idempotency_key")
  if (!sameOriginOk(request)) return fail(403, "session_forbidden")

  const config = productBffConfig()
  if (config === null) return fail(503, "storage_unavailable", true)
  const auth = nativeSessionBffHeaders(request, config, requestId)
  if (auth.state !== "valid") return fail(401, auth.state === "missing" ? "session_authentication_required" : "session_invalid")
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(ownerDeadlineMs)])
  const deadline = performance.now() + ownerDeadlineMs
  let upstream: Response | undefined
  try {
    // Next can represent an empty DELETE as a non-null stream. Require EOF
    // before forwarding; no body, query or caller-supplied identity crosses.
    await readBoundedRequestBody(request, 0, signal)
    signal.throwIfAborted()
    const headers = auth.headers
    headers.set("idempotency-key", key.data)
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/library/files/${encoded}`, config.domain, {
      method: "DELETE", headers, signal, timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
      maxRequestBytes: 0, maxResponseBytes: 8192, maxErrorResponseBytes: 8192, strictResponseLength: true,
    })
    const invalid = () => fail(502, "storage_response_invalid")
    const ownerId = upstream.headers.get("x-request-id")
    const retryAfter = upstream.headers.get("retry-after")
    if (ownerId !== requestId ||
      !jsonMediaType.test(upstream.headers.get("content-type") ?? "") ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(upstream.headers.get("cache-control") ?? "") || upstream.headers.has("location") ||
      (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter) || Number(retryAfter) > 86_400))) return invalid()
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await upstream.arrayBuffer())) }
    catch { signal.throwIfAborted(); return invalid() }
    signal.throwIfAborted()
    const outputHeaders = { ...replyHeaders, "x-request-id": ownerId, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) }
    if (upstream.status === 200) {
      const ack = libraryFileDeleteResponseSchema.safeParse(payload)
      return ack.success && ack.data.data.asset_id === id.data ? Response.json(ack.data, { headers: outputHeaders }) : invalid()
    }
    const error = libraryFileDeleteErrorSchema.safeParse(payload)
    return error.success && isLibraryFileDeleteOwnerError(upstream.status, error.data.error.code, error.data.error.retryable)
      ? Response.json(error.data, { status: upstream.status, headers: outputHeaders }) : invalid()
  } catch (error) {
    return error instanceof UpstreamRequestTooLargeError ? fail(400, "invalid_file_delete_request") : fail(503, "storage_unavailable", true)
  } finally {
    if (upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(() => undefined)
  }
}
