import {
  isLibraryArtifactDeleteOwnerError,
  libraryArtifactConversationIdSchema,
  libraryArtifactDeleteErrorSchema,
  libraryArtifactDeleteKeySchema,
  libraryArtifactDeleteResponseSchema,
  libraryArtifactFavoriteRequestSchema,
  libraryArtifactFavoriteResponseSchema,
  libraryArtifactIdSchema,
} from "@/generated/bff-library-artifact-mutations"

import { bffErrorEnvelopeSchema, webErrorResponse } from "./bff-response"
import { nativeSessionBffHeaders, productBffConfig } from "./product-bff"
import { sameOriginOk } from "./same-origin"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "./upstream-http"

const ownerDeadlineMs = 21_000
const jsonMediaType = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu
const noStore = /(?:^|,)\s*no-store\s*(?:,|$)/iu
const prohibitedHeaders = ["content-encoding", "transfer-encoding", "if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range"]

/** The current browser session sets a target favorite or retires one exact FINAL. */
export async function proxyLibraryArtifactMutation(request: Request, path: readonly string[]): Promise<Response> {
  const deleting = request.method === "DELETE"
  const requestId = crypto.randomUUID()
  const replyHeaders = { "cache-control": "private, no-store", "x-request-id": requestId }
  const fail = (status: number, code: string, retryable = false) => deleting
    ? Response.json({ error: { code, message: "Library artifact deletion could not be confirmed", retryable } }, { status, headers: replyHeaders })
    : webErrorResponse(code, status, requestId, "Library artifact favorite could not be confirmed")
  const invalidCode = deleting ? "invalid_artifact_delete_request" : "invalid_library_artifact"
  if (path.length !== (deleting ? 4 : 5) || path[0] !== "library" || path[1] !== "artifacts" || (!deleting && path[4] !== "favorite"))
    return fail(404, "library_artifact_not_found")
  const conversation = libraryArtifactConversationIdSchema.safeParse(path[2])
  const artifact = libraryArtifactIdSchema.safeParse(path[3])
  if (!conversation.success || !artifact.success) return fail(400, invalidCode)
  const ownerPath = `/library/artifacts/${encodeURIComponent(conversation.data)}/${encodeURIComponent(artifact.data)}${deleting ? "" : "/favorite"}`
  const url = new URL(request.url)
  const length = request.headers.get("content-length")
  if (url.pathname !== `/api/hub${ownerPath}` || request.url.includes("?") || url.hash ||
    prohibitedHeaders.some(name => request.headers.has(name)) ||
    (deleting ? length !== null && length !== "0"
      : !jsonMediaType.test(request.headers.get("content-type") ?? "") || request.headers.has("idempotency-key")))
    return fail(400, invalidCode)

  const key = deleting ? libraryArtifactDeleteKeySchema.safeParse(request.headers.get("idempotency-key")) : null
  if (key?.success === false) return fail(400, "invalid_idempotency_key")
  if (!sameOriginOk(request)) return fail(403, "session_forbidden")
  const config = productBffConfig()
  if (config === null) return fail(503, "storage_unavailable", true)
  const auth = nativeSessionBffHeaders(request, config, requestId)
  if (auth.state !== "valid") return fail(401, auth.state === "missing" ? "session_authentication_required" : "session_invalid")

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(ownerDeadlineMs)])
  const deadline = performance.now() + ownerDeadlineMs
  const maxRequestBytes = deleting ? 0 : 256
  let upstream: Response | undefined
  try {
    // An empty browser DELETE may still be a stream: require zero-byte EOF.
    const input = await readBoundedRequestBody(request, maxRequestBytes, signal)
    signal.throwIfAborted()
    const headers = auth.headers
    let target: boolean | undefined
    let body: ArrayBuffer | undefined
    if (key?.success) headers.set("idempotency-key", key.data)
    else {
      let raw: unknown
      try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input)) }
      catch { return fail(400, invalidCode) }
      const parsed = libraryArtifactFavoriteRequestSchema.safeParse(raw)
      if (!parsed.success) return fail(400, invalidCode)
      target = parsed.data.favorited
      headers.set("content-type", "application/json")
      body = new TextEncoder().encode(JSON.stringify(parsed.data)).buffer
    }
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1${ownerPath}`, config.domain, {
      method: deleting ? "DELETE" : "PUT", headers, ...(body === undefined ? {} : { body }), signal,
      timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())), maxRequestBytes,
      maxResponseBytes: 8192, maxErrorResponseBytes: 8192, strictResponseLength: true,
    })

    const invalid = () => fail(502, "storage_response_invalid")
    const ownerId = upstream.headers.get("x-request-id")
    const retryAfter = upstream.headers.get("retry-after")
    // Earlier favorite admission errors correlate in the standard body only.
    if ((ownerId === null ? deleting || upstream.status === 200 : ownerId !== requestId) ||
      !jsonMediaType.test(upstream.headers.get("content-type") ?? "") ||
      !noStore.test(upstream.headers.get("cache-control") ?? "") || upstream.headers.has("location") ||
      (retryAfter !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retryAfter) || Number(retryAfter) > 86_400))) return invalid()
    let payload: unknown
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await upstream.arrayBuffer())) }
    catch { signal.throwIfAborted(); return invalid() }
    signal.throwIfAborted()
    const outputHeaders = { ...replyHeaders, ...(retryAfter === null ? {} : { "retry-after": retryAfter }) }
    if (upstream.status === 200) {
      const exact = (data: { conversation_id: string; artifact_id: string }) =>
        data.conversation_id === conversation.data && data.artifact_id === artifact.data
      if (deleting) {
        const ack = libraryArtifactDeleteResponseSchema.safeParse(payload)
        return ack.success && exact(ack.data.data) ? Response.json(ack.data, { headers: outputHeaders }) : invalid()
      }
      const ack = libraryArtifactFavoriteResponseSchema.safeParse(payload)
      return ack.success && exact(ack.data.data) && ack.data.data.favorited === target && ack.data.meta.request_id === requestId
        ? Response.json(ack.data, { headers: outputHeaders }) : invalid()
    }
    if (deleting) {
      const failure = libraryArtifactDeleteErrorSchema.safeParse(payload)
      return failure.success && isLibraryArtifactDeleteOwnerError(upstream.status, failure.data.error.code, failure.data.error.retryable)
        ? Response.json(failure.data, { status: upstream.status, headers: outputHeaders }) : invalid()
    }
    const failure = bffErrorEnvelopeSchema.safeParse(payload)
    return [400, 401, 403, 404, 429, 502, 503].includes(upstream.status) && failure.success && failure.data.meta.request_id === requestId
      ? Response.json(failure.data, { status: upstream.status, headers: outputHeaders }) : invalid()
  } catch (error) {
    return error instanceof UpstreamRequestTooLargeError ? fail(400, invalidCode) : fail(503, "storage_unavailable", true)
  } finally {
    if (upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(() => undefined)
  }
}
