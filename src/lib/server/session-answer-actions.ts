import { z } from "zod"
import {
  answerActionIdSchema,
  answerActionStatuses,
  answerActionErrorSchema,
  answerFeedbackSchema,
  answerRegenerationReceiptSchema,
  runDisplaySchema,
} from "@/contract/answer-actions"
import { parseArchivedTasksJson } from "@/lib/archived-tasks-json"
import { admittedProductSession, productBffConfig, productBffHeaders } from "./product-bff"
import { requestWithDomain, readBoundedRequestBody, UpstreamResponseIncompleteError, UpstreamResponseTooLargeError } from "./upstream-http"
/** Four exact answer operations, never a general Session proxy or command recovery loop. */
export async function sessionAnswerActions(request: Request, params: Promise<{ path: string[] }>): Promise<Response> {
  const deadline = performance.now() + 10000,
    controller = new AbortController(),
    signal = AbortSignal.any([request.signal, controller.signal]),
    requestId = crypto.randomUUID()
  let upstream: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const timer = setTimeout(() => controller.abort(), 10000)
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-request-id": requestId }
  const response = (status: number, body: unknown, retry: string | null = null) => {
    const bytes = new TextEncoder().encode(JSON.stringify(body))
    return new Response(bytes, { status, headers: { ...headers, "content-length": String(bytes.byteLength), ...(retry ? { "retry-after": retry } : {}) } })
  }
  const fail = (status: number, code: string) => response(status, { error: { code, message: code }, meta: { request_id: requestId } })
  const check = () => {
    signal.throwIfAborted()
    if (performance.now() >= deadline) throw Error("answer_actions_retired")
  }
  const within = <T>(work: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const stop = () => reject(Error("answer_actions_retired"))
      signal.addEventListener("abort", stop, { once: true })
      if (signal.aborted) {
        signal.removeEventListener("abort", stop)
        stop()
        return
      }
      void Promise.resolve()
        .then(() => {
          check()
          return work()
        })
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", stop))
    })
  try {
    const config = productBffConfig()
    if (!config?.bffBaseUrl) return fail(503, "answer_actions_unavailable")
    const { path } = await within(() => params),
      url = new URL(request.url),
      sessionId = path[1],
      targetId = path[3]
    let parts: string[]
    try {
      parts = url.pathname.split("/").slice(3).map(decodeURIComponent)
    } catch {
      return fail(400, "answer_actions_invalid_request")
    }
    if (
      path.length !== 5 ||
      path[0] !== "sessions" ||
      !answerActionIdSchema.safeParse(sessionId).success ||
      !answerActionIdSchema.safeParse(targetId).success ||
      JSON.stringify(parts) !== JSON.stringify(path) ||
      url.pathname !== `/api/session/${path.map(encodeURIComponent).join("/")}` ||
      request.url.includes("?") ||
      url.hash ||
      ["if-match", "if-none-match", "last-event-id", "content-encoding", "transfer-encoding"].some((key) => request.headers.has(key))
    )
      return fail(400, "answer_actions_invalid_request")
    const feedback = path[2] === "messages" && path[4] === "feedback",
      regen = path[2] === "messages" && path[4] === "regenerate",
      display = path[2] === "runs" && path[4] === "display"
    if (!feedback && !regen && !display) return fail(400, "answer_actions_invalid_request")
    const method = request.method,
      writing = method === "PUT" || method === "POST"
    if (feedback ? !["GET", "PUT"].includes(method) : regen ? method !== "POST" : method !== "GET") return fail(405, "method_not_allowed")
    const origin = new URL(config.session.webOrigin),
      incomingOrigin = request.headers.get("origin")
    if (
      (request.headers.get("host") ?? url.host) !== origin.host ||
      url.protocol !== origin.protocol ||
      (writing ? incomingOrigin !== origin.origin : incomingOrigin !== null && incomingOrigin !== origin.origin)
    )
      return fail(403, "forbidden_origin")
    const key = request.headers.get("idempotency-key")
    if (regen ? key === null || !/^[\x21-\x7E]{1,128}(?![\s\S])/u.test(key) || key.includes(",") : key !== null)
      return fail(400, "answer_actions_invalid_request")
    if (!writing && (request.body !== null || request.headers.has("content-length") || request.headers.has("content-type")))
      return fail(400, "answer_actions_invalid_request")
    if (writing && !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? ""))
      return fail(415, "answer_actions_content_type_unsupported")
    const length = request.headers.get("content-length")
    if (length !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(length) || BigInt(length) > BigInt(1024))) return fail(400, "answer_actions_invalid_request")
    let body: ArrayBuffer | undefined, value: "up" | "down" | null | undefined
    if (writing) {
      try {
        body = await within(() => readBoundedRequestBody(request, 1024, signal))
      } catch {
        check()
        return fail(400, "answer_actions_invalid_request")
      }
      if (length !== null && BigInt(length) !== BigInt(body.byteLength)) return fail(400, "answer_actions_invalid_request")
      try {
        const raw = parseArchivedTasksJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body))
        if (regen) z.object({}).strict().parse(raw)
        else value = z.object({ feedback: answerFeedbackSchema.shape.feedback }).strict().parse(raw).feedback
      } catch {
        return fail(400, "answer_actions_invalid_request")
      }
    }
    const claims = await within(() => admittedProductSession(request, config))
    if (!claims) return fail(401, "unauthenticated")
    const outgoing = productBffHeaders(config, claims, requestId)
    outgoing.set("accept", "application/json")
    if (writing) {
      outgoing.set("content-type", "application/json")
      outgoing.set("content-length", String(body!.byteLength))
    }
    if (regen) outgoing.set("idempotency-key", key!)
    upstream = await within(() =>
      requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/v1/${path.map(encodeURIComponent).join("/")}`, config.domain, {
        method,
        headers: outgoing,
        signal,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
        maxRequestBytes: 1024,
        maxResponseBytes: 1048576,
        ...(body === undefined ? {} : { body }),
      }),
    )
    const size = upstream.headers.get("content-length"),
      status = upstream.status,
      retry = upstream.headers.get("retry-after")
    if (
      !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") ||
      size === null ||
      !/^(?:0|[1-9][0-9]*)$/u.test(size) ||
      BigInt(size) > BigInt(1048576) ||
      upstream.headers.get("x-request-id") !== requestId ||
      !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(upstream.headers.get("cache-control") ?? "") ||
      ["set-cookie", "location", "content-encoding", "transfer-encoding"].some((key) => upstream!.headers.has(key))
    )
      return fail(502, "answer_actions_response_invalid")
    if (!upstream.body) return fail(502, "answer_actions_response_invalid")
    reader = upstream.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    try {
      for (;;) {
        const chunk = await within(() => reader!.read())
        if (chunk.done) break
        received += chunk.value.byteLength
        if (received > 1048576) return fail(502, "answer_actions_response_invalid")
        chunks.push(chunk.value)
      }
    } catch {
      check()
      return fail(502, "answer_actions_response_invalid")
    }
    if (BigInt(size) !== BigInt(received)) return fail(502, "answer_actions_response_invalid")
    const bytes = new Uint8Array(received)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.length
    }
    const operation = display ? "getSessionRunDisplay" : regen ? "regenerateLatestAssistantMessage" : writing ? "setMessageFeedback" : "getMessageFeedback",
      success = regen ? 202 : 200
    let result: unknown
    try {
      const raw = parseArchivedTasksJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
      if (status === success) {
        const envelope = z.object({ data: z.unknown() }).strict().parse(raw)
        if (display) {
          const parsed = runDisplaySchema.parse(envelope.data)
          if (parsed.run_id !== targetId) throw Error()
          result = parsed
        } else if (regen) {
          const parsed = answerRegenerationReceiptSchema.parse(envelope.data)
          if (parsed.regenerated_from_message_id !== targetId || parsed.assistant_message_id === targetId) throw Error()
          result = parsed
        } else {
          const parsed = answerFeedbackSchema.parse(envelope.data)
          if (parsed.session_id !== sessionId || parsed.message_id !== targetId || (writing && parsed.feedback !== value)) throw Error()
          result = parsed
        }
      } else {
        if (!answerActionStatuses[operation].some((item) => item === status)) throw Error()
        const error = answerActionErrorSchema.parse(raw)
        if (error.meta.request_id !== requestId) throw Error()
        result = { error: { code: error.error.code, message: error.error.code }, meta: { request_id: requestId } }
      }
      if (retry !== null && (status !== 429 || !/^[1-9][0-9]{0,4}(?![\s\S])/u.test(retry) || Number(retry) > 86400)) throw Error()
    } catch {
      return fail(502, "answer_actions_response_invalid")
    }
    const latest = await within(() => admittedProductSession(request, config))
    if (
      !latest ||
      ["id", "generation", "subject", "access", "accessExpiresAt", "expiresAt", "issuerSessionId"].some(
        (key) => Reflect.get(latest, key) !== Reflect.get(claims, key),
      )
    )
      return fail(401, "session_invalid")
    check()
    return response(status, result, retry)
  } catch (error) {
    return error instanceof UpstreamResponseIncompleteError || error instanceof UpstreamResponseTooLargeError
      ? fail(502, "answer_actions_response_invalid")
      : fail(503, "answer_actions_unavailable")
  } finally {
    clearTimeout(timer)
    controller.abort()
    if (reader) {
      void reader.cancel().catch(() => undefined)
      try {
        reader.releaseLock()
      } catch {}
    } else if (upstream?.body) void upstream.body.cancel().catch(() => undefined)
  }
}
