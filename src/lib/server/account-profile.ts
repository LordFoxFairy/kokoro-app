import { randomUUID } from "node:crypto"
import { accountProfileResponseSchema } from "@/lib/account-profile.schema"
import { admittedNativeSession, productBffConfig, productBffHeaders, sameNativeSessionSnapshot } from "./product-bff"
import { requestWithDomain } from "./upstream-http"

/** Read the IAM-owned projection through the BFF native-session seam. */
export async function readAccountProfile(request: Request): Promise<Response> {
  const requestId = randomUUID()
  const headers = { "cache-control": "private, no-store", "x-request-id": requestId }
  const fail = (status: number, code: string, retryAfter?: string) =>
    Response.json(
      { error: { code, message: code, ...(status === 429 || status === 503 ? { retryable: true } : { retryable: false }) } },
      { status, headers: { ...headers, ...(retryAfter === undefined ? {} : { "retry-after": retryAfter }) } },
    )
  const config = productBffConfig()
  if (!config) return fail(503, "account_profile_unavailable")
  const url = new URL(request.url)
  const origin = new URL(config.session.webOrigin)
  if (
    request.method !== "GET" ||
    url.pathname !== "/api/account/profile" ||
    request.url.includes("?") ||
    request.body !== null ||
    request.headers.has("transfer-encoding") ||
    request.headers.has("idempotency-key") ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0")
  )
    return fail(400, "account_profile_input_invalid")
  if (
    url.protocol !== origin.protocol ||
    request.headers.get("host") !== origin.host ||
    (request.headers.has("origin") && request.headers.get("origin") !== origin.origin)
  )
    return fail(403, "account_profile_forbidden")

  const deadline = performance.now() + 10_000
  const controller = new AbortController()
  let retired = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let upstream: Response | undefined
  let reject!: (reason: unknown) => void
  const cancelled = new Promise<never>((_, failPromise) => {
    reject = failPromise
  })
  const stop = () => {
    controller.abort()
    const active = reader
    reader = undefined
    void active?.cancel().catch(() => undefined)
    try {
      active?.releaseLock()
    } catch {
      /* A retired body never regains ownership. */
    }
    if (upstream?.body && !upstream.body.locked) void upstream.body.cancel().catch(() => undefined)
  }
  const abort = () => {
    stop()
    reject(new Error("account_profile_retired"))
  }
  const timer = setTimeout(abort, Math.max(0, deadline - performance.now()))
  request.signal.addEventListener("abort", abort, { once: true })
  if (request.signal.aborted) abort()
  const check = () => {
    if (retired || request.signal.aborted || controller.signal.aborted || performance.now() >= deadline) throw new Error("account_profile_retired")
  }
  const readBody = async (body: ReadableStream<Uint8Array> | null, maxBytes: number, initialBytes: number): Promise<string> => {
    let size = initialBytes
    let text = ""
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    if (size > maxBytes) throw new Error("account_profile_response_invalid")
    if (body) {
      reader = body.getReader()
      try {
        for (;;) {
          const part = await reader.read()
          check()
          if (part.done) break
          size += part.value.byteLength
          if (size > maxBytes) throw new Error("account_profile_response_invalid")
          text += decoder.decode(part.value, { stream: true })
        }
        text += decoder.decode()
      } finally {
        const active = reader
        reader = undefined
        void active?.cancel().catch(() => undefined)
        try {
          active?.releaseLock()
        } catch {
          /* The stream may already be closed. */
        }
      }
    }
    check()
    return text
  }
  const operation = async () => {
    check()
    let session
    try {
      session = await admittedNativeSession(request, config)
    } catch {
      return fail(503, "account_profile_unavailable")
    }
    check()
    if (!session || session.accessExpiresAt <= Date.now() || session.expiresAt <= Date.now()) return fail(401, "session_invalid")
    upstream = await requestWithDomain(`${config.bffBaseUrl}/v1/account/profile`, config.domain, {
      method: "GET",
      signal: controller.signal,
      timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
      maxResponseBytes: 1_048_576,
      headers: productBffHeaders(config, session, requestId),
    })
    check()
    if (
      upstream.headers.get("x-request-id") !== requestId ||
      !/^application\/json(?:\s*;|$)/iu.test(upstream.headers.get("content-type") ?? "") ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(upstream.headers.get("cache-control") ?? "") ||
      upstream.headers.has("location") ||
      upstream.headers.has("set-cookie")
    )
      return fail(502, "account_profile_response_invalid")
    let headerBytes = 0
    upstream.headers.forEach((value, key) => {
      headerBytes += new TextEncoder().encode(`${key}: ${value}\r\n`).byteLength
    })
    let raw: unknown
    try {
      raw = JSON.parse(await readBody(upstream.body, 1_048_576, headerBytes))
    } catch {
      return fail(502, "account_profile_response_invalid")
    }
    const retryAfter = upstream.headers.get("retry-after") ?? undefined
    if (upstream.status !== 200) {
      if (upstream.status === 401) return fail(401, "session_invalid")
      if (upstream.status === 403) return fail(403, "account_profile_forbidden")
      if (upstream.status === 429 && retryAfter !== undefined && /^[1-9][0-9]{0,4}$/u.test(retryAfter) && Number(retryAfter) <= 86400)
        return fail(429, "account_profile_rate_limited", retryAfter)
      if (upstream.status === 503) return fail(503, "account_profile_unavailable")
      return fail(502, "account_profile_response_invalid")
    }
    const profile = accountProfileResponseSchema.safeParse(raw)
    if (!profile.success || profile.data.data.subject !== session.subject) return fail(502, "account_profile_response_invalid")
    const latest = await admittedNativeSession(request, config)
    check()
    if (!sameNativeSessionSnapshot(session, latest)) return fail(401, "session_invalid")
    return Response.json(profile.data, { headers })
  }
  try {
    return await Promise.race([cancelled, operation()])
  } catch {
    return fail(503, "account_profile_unavailable")
  } finally {
    retired = true
    clearTimeout(timer)
    request.signal.removeEventListener("abort", abort)
    stop()
  }
}
