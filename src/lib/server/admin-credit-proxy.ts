import { admittedProductSession, productBffHeaders, type ProductBffConfig } from "./product-bff"
import { readBoundedRequestBody, requestWithDomain } from "./upstream-http"
const JSON_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu
const KEY = /^[\x21-\x2b\x2d-\x7e]{8,128}$(?![\s\S])/u
function failure(status: number, code: string, requestId: string): Response {
  return Response.json(
    { error: { code, message: status === 401 ? "请先登录后再试。" : "后台请求未完成，请保留原充值请求后重试。", retryable: status >= 500 } },
    { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
  )
}
/** Only these two named management operations; no identity/billing prefix proxy or business retry. */
export async function proxyAdminCredit(
  request: Request,
  config: ProductBffConfig,
  kind: "members" | "grant",
  requestId: string,
  deadlineAt: number,
): Promise<Response> {
  const query = new URL(request.url).searchParams
  const forbidden = [
    "if-match",
    "if-none-match",
    ...(kind === "members" ? ["idempotency-key", "content-type", "content-length", "transfer-encoding"] : ["transfer-encoding"]),
  ]
  if (forbidden.some((name) => request.headers.has(name))) return failure(400, "invalid_admin_request", requestId)
  if (kind === "members") {
    if (request.body !== null) return failure(400, "invalid_admin_request", requestId)
    for (const [key, value] of query) {
      if (
        query.getAll(key).length !== 1 ||
        (key === "limit" ? !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(value) : key !== "cursor" || !value || [...value].length > 2048 || value.includes("\0"))
      )
        return failure(400, "invalid_admin_request", requestId)
    }
  } else {
    const length = request.headers.get("content-length")
    if (
      query.size ||
      !JSON_TYPE.test(request.headers.get("content-type") ?? "") ||
      !KEY.test(request.headers.get("idempotency-key") ?? "") ||
      length === null ||
      !/^[1-9][0-9]{0,4}$(?![\s\S])/u.test(length) ||
      Number(length) > 16384 ||
      request.body === null
    )
      return failure(400, "invalid_admin_request", requestId)
  }
  const controller = new AbortController(),
    abort = () => controller.abort()
  request.signal.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, Math.max(0, deadlineAt - Date.now()))
  if (request.signal.aborted || Date.now() >= deadlineAt) abort()
  const unavailable = () => failure(503, "admin_gateway_unavailable", requestId)
  const check = () => {
    if (Date.now() >= deadlineAt) abort()
    controller.signal.throwIfAborted()
  }
  let onAbort: (() => void) | undefined
  const cancelled = new Promise<Response>((resolve) => {
    onAbort = () => resolve(unavailable())
    controller.signal.addEventListener("abort", onAbort, { once: true })
    if (controller.signal.aborted) onAbort()
  })
  const work = async (): Promise<Response> => {
    check()
    let body: ArrayBuffer | undefined
    if (kind === "grant") {
      try {
        body = await readBoundedRequestBody(request, 16384, controller.signal)
      } catch {
        check()
        return failure(400, "invalid_admin_request", requestId)
      }
      check()
      if (body.byteLength !== Number(request.headers.get("content-length"))) return failure(400, "invalid_admin_request", requestId)
    }
    // Session admission consumes URL/headers, never the already-read financial command stream.
    const claims = await admittedProductSession(new Request(request.url, { headers: request.headers, signal: controller.signal }), config)
    check()
    if (claims === null) return failure(401, "session_authentication_required", requestId)
    const headers = productBffHeaders(config, claims, requestId)
    headers.set("accept", "application/json")
    if (kind === "grant") {
      headers.set("content-type", "application/json")
      headers.set("idempotency-key", request.headers.get("idempotency-key")!)
    }
    const path = kind === "grant" ? "billing/credit-grants" : "identity/members"
    const upstream = await requestWithDomain(
      `${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/admin/${path}${kind === "members" ? new URL(request.url).search : ""}`,
      config.domain,
      {
        method: kind === "grant" ? "POST" : "GET",
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
        timeoutMs: Math.max(1, deadlineAt - Date.now()),
        maxRequestBytes: 16384,
        maxResponseBytes: 1024 * 1024,
      },
    )
    try {
      check()
    } catch (cause) {
      void upstream.body?.cancel().catch(() => undefined)
      throw cause
    }
    const mime = upstream.headers.get("content-type")
    if (
      upstream.headers.get("x-request-id") !== requestId ||
      !JSON_TYPE.test(mime ?? "") ||
      !upstream.headers
        .get("cache-control")
        ?.toLowerCase()
        .split(",")
        .some((v) => v.trim() === "no-store") ||
      upstream.status < 200 ||
      (upstream.status >= 300 && upstream.status < 400)
    ) {
      void upstream.body?.cancel().catch(() => undefined)
      return failure(502, "admin_gateway_response_invalid", requestId)
    }
    const bytes = await upstream.arrayBuffer()
    check()
    const output = new Headers({ "content-type": mime!, "cache-control": "no-store", "x-request-id": requestId })
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter !== null && /^[1-9][0-9]{0,4}$(?![\s\S])/u.test(retryAfter)) output.set("retry-after", retryAfter)
    return new Response(bytes, { status: upstream.status, headers: output })
  }
  try {
    return await Promise.race([work().catch(unavailable), cancelled])
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener("abort", abort)
    if (onAbort) controller.signal.removeEventListener("abort", onAbort)
  }
}
