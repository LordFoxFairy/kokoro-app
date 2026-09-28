import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http"
import { request as httpsRequest } from "node:https"

import { forwardedHeaders } from "./domain-context"

export const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000
export const DEFAULT_UPSTREAM_MAX_REQUEST_BYTES = 2 * 1024 * 1024
export const DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES = 16 * 1024 * 1024

export class UpstreamRequestTooLargeError extends Error {
  readonly code = "upstream_request_too_large"

  constructor() {
    super("upstream request body exceeds the configured limit")
    this.name = "UpstreamRequestTooLargeError"
  }
}

export class UpstreamResponseTooLargeError extends Error {
  readonly code = "upstream_response_too_large"

  constructor() {
    super("upstream response exceeds the configured limit")
    this.name = "UpstreamResponseTooLargeError"
  }
}

export class UpstreamTimeoutError extends Error {
  readonly code = "upstream_timeout"

  constructor() {
    super("upstream request exceeded the configured deadline")
    this.name = "UpstreamTimeoutError"
  }
}

export class UpstreamResponseIncompleteError extends Error {
  readonly code = "upstream_response_incomplete"

  constructor() {
    super("upstream response ended before its declared body completed")
    this.name = "UpstreamResponseIncompleteError"
  }
}

function responseHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
  }
  return headers
}

function headersWithForwardedHost(headers: HeadersInit | undefined, domain: string): Record<string, string> {
  const result = new Headers(headers)
  // Host and legacy/custom tenant headers are transport-owned. Dropping them
  // prevents a caller-provided value from becoming a second isolation signal.
  result.delete("host")
  result.delete("forwarded")
  result.delete("x-forwarded-host")
  result.delete("x-forwarded-proto")
  result.delete("x-forwarded-for")
  result.delete("x-domain")
  result.delete("x-kokoro-tenant-id")
  result.delete("x-kokoro-site-id")
  for (const [name, value] of Object.entries(forwardedHeaders(domain))) result.set(name, value)
  return Object.fromEntries(result.entries())
}

type Deadline = {
  controller: AbortController
  timedOut: () => boolean
  restart: (timeoutMs: number) => void
  cleanup: () => void
}

function deadlineFor(signal: AbortSignal | undefined, timeoutMs: number): Deadline {
  const controller = new AbortController()
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout>
  const restart = (milliseconds: number): void => {
    clearTimeout(timeout)
    timedOut = false
    timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new UpstreamTimeoutError())
    }, milliseconds)
  }
  restart(timeoutMs)
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener("abort", abort, { once: true })
  return {
    controller,
    timedOut: () => timedOut,
    restart,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    },
  }
}

function contentLength(input: IncomingHttpHeaders): number | null {
  const value = input["content-length"]
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function nodeResponseStream(
  response: IncomingMessage,
  client: ClientRequest,
  deadline: Deadline,
  maxBytes: number,
  idleTimeoutMs: number | undefined,
  totalTimeoutMs: number | undefined,
  declaredLength: number | null,
  strictResponseLength: boolean,
  onDone: () => void,
): ReadableStream<Uint8Array> {
  let paused = false
  let finishStream: (() => void) | undefined
  let restartStreamIdle: (() => void) | undefined
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let total = 0
      let closed = false
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const resetIdleTimer = () => {
        if (totalTimeoutMs === undefined || idleTimeoutMs === undefined) return
        clearTimeout(idleTimer)
        if (paused) return
        idleTimer = setTimeout(() => deadline.controller.abort(new UpstreamTimeoutError()), idleTimeoutMs)
      }
      restartStreamIdle = resetIdleTimer
      const finish = () => {
        if (closed) return
        closed = true
        deadline.controller.signal.removeEventListener("abort", onAbort)
        clearTimeout(idleTimer)
        onDone()
      }
      finishStream = finish
      const fail = (error: unknown) => {
        if (closed) return
        closed = true
        deadline.controller.signal.removeEventListener("abort", onAbort)
        clearTimeout(idleTimer)
        onDone()
        controller.error(error)
      }
      const onAbort = () => {
        const error = deadline.timedOut() ? new UpstreamTimeoutError() : deadline.controller.signal.reason
        response.destroy(error instanceof Error ? error : undefined)
        client.destroy(error instanceof Error ? error : undefined)
        fail(error ?? new Error("upstream request aborted"))
      }
      const onData = (chunk: Buffer | string | Uint8Array) => {
        if (totalTimeoutMs === undefined && idleTimeoutMs !== undefined) deadline.restart(idleTimeoutMs)
        else resetIdleTimer()
        const bytes = Buffer.from(chunk)
        total += bytes.byteLength
        if (total > maxBytes || (strictResponseLength && declaredLength !== null && total > declaredLength)) {
          const error = new UpstreamResponseTooLargeError()
          response.destroy(error)
          client.destroy(error)
          fail(error)
          return
        }
        controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
        if ((controller.desiredSize ?? 0) <= 0) {
          paused = true
          response.pause()
          clearTimeout(idleTimer)
        }
      }
      response.on("data", onData)
      response.once("end", () => {
        if (strictResponseLength && (declaredLength === null || total !== declaredLength || !response.complete)) {
          fail(new UpstreamResponseIncompleteError())
          return
        }
        finish()
        controller.close()
      })
      response.once("error", (error) => fail(strictResponseLength ? new UpstreamResponseIncompleteError() : error))
      response.once("close", () => {
        if (!closed && !response.complete) fail(new UpstreamResponseIncompleteError())
      })
      deadline.controller.signal.addEventListener("abort", onAbort, { once: true })
      resetIdleTimer()
    },
    pull() {
      if (paused) {
        paused = false
        restartStreamIdle?.()
        response.resume()
      }
    },
    cancel(reason) {
      const error = reason instanceof Error ? reason : undefined
      finishStream?.()
      response.destroy(error)
      client.destroy(error)
      paused = false
    },
  })
}

function boundedFetchResponse(response: Response, maxBytes: number, onDone: () => void): Response {
  if (response.body === null) {
    onDone()
    return response
  }
  const reader = response.body.getReader()
  let total = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          onDone()
          controller.close()
          return
        }
        total += result.value.byteLength
        if (total > maxBytes) {
          await reader.cancel()
          const error = new UpstreamResponseTooLargeError()
          onDone()
          controller.error(error)
          return
        }
        controller.enqueue(result.value)
      } catch (error) {
        onDone()
        controller.error(error)
      }
    },
    async cancel(reason) {
      await reader.cancel(reason)
      onDone()
    },
  })
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

type RequestWithDomainOptions = {
  method: string
  headers?: HeadersInit
  body?: ArrayBuffer
  signal?: AbortSignal
  timeoutMs?: number
  // SSE has a short connection deadline, then a renewable idle deadline.
  // Non-streaming responses retain the normal total deadline.
  streamIdleTimeoutMs?: number
  streamTotalTimeoutMs?: number
  // Status-specific error budgets keep large successful binaries from widening
  // the resource limits of JSON/error streams on the same exact route.
  errorResponseTimeoutMs?: number
  strictResponseLength?: boolean
  maxRequestBytes?: number
  maxResponseBytes?: number
  maxErrorResponseBytes?: number
}

/**
 * Server-only HTTP transport. It owns forwarding authority, deadlines, and
 * bounded request/response streams so individual route handlers cannot forget
 * a reliability or isolation control.
 */
export function requestWithDomain(
  url: string,
  domain: string,
  options: RequestWithDomainOptions,
): Promise<Response> {
  const target = new URL(url)
  const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest
  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_UPSTREAM_MAX_REQUEST_BYTES
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES
  if (options.body !== undefined && options.body.byteLength > maxRequestBytes) {
    return Promise.reject(new UpstreamRequestTooLargeError())
  }
  const deadline = deadlineFor(options.signal, options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS)

  return new Promise((resolve, reject) => {
    let settled = false
    let responseStarted = false
    const rejectOnce = (error: unknown) => {
      if (settled) return
      settled = true
      deadline.cleanup()
      reject(error)
    }
    const resolveOnce = (response: Response) => {
      if (settled) return
      settled = true
      resolve(response)
    }
    const client = requestFn(target, {
      method: options.method,
      headers: headersWithForwardedHost(options.headers, domain),
      signal: deadline.controller.signal,
    }, (response) => {
      responseStarted = true
      const length = contentLength(response.headers)
      const strictResponseLength = options.strictResponseLength === true && response.statusCode === 200
      const responseMaxBytes = response.statusCode === 200 ? maxResponseBytes : options.maxErrorResponseBytes ?? maxResponseBytes
      if (strictResponseLength && length === null) {
        response.resume()
        const error = new UpstreamResponseIncompleteError()
        client.destroy(error)
        rejectOnce(error)
        return
      }
      if (length !== null && length > responseMaxBytes) {
        response.resume()
        const error = new UpstreamResponseTooLargeError()
        client.destroy(error)
        rejectOnce(error)
        return
      }
      if (response.statusCode === 204 || response.statusCode === 304) {
        deadline.cleanup()
        resolveOnce(new Response(null, { status: response.statusCode, headers: responseHeaders(response.headers) }))
        return
      }
      const isEventStream = options.errorResponseTimeoutMs === undefined || response.statusCode === 200
        ? response.headers["content-type"]?.toString().toLowerCase().startsWith("text/event-stream") ?? false
        : false
      const successStream = response.statusCode === 200 && options.streamTotalTimeoutMs !== undefined
      const idleTimeoutMs = isEventStream || successStream ? options.streamIdleTimeoutMs : undefined
      if (successStream) deadline.restart(options.streamTotalTimeoutMs!)
      else if (options.errorResponseTimeoutMs !== undefined && response.statusCode !== 200) deadline.restart(options.errorResponseTimeoutMs)
      else if (idleTimeoutMs !== undefined) deadline.restart(idleTimeoutMs)
      const body = nodeResponseStream(response, client, deadline, responseMaxBytes, idleTimeoutMs, successStream ? options.streamTotalTimeoutMs : undefined, length, strictResponseLength, deadline.cleanup)
      resolveOnce(new Response(body, { status: response.statusCode ?? 502, headers: responseHeaders(response.headers) }))
    })
    const onAbort = () => {
      if (!responseStarted) {
        client.destroy()
        rejectOnce(deadline.timedOut() ? new UpstreamTimeoutError() : deadline.controller.signal.reason)
      }
    }
    deadline.controller.signal.addEventListener("abort", onAbort, { once: true })
    client.once("error", (error) => {
      deadline.controller.signal.removeEventListener("abort", onAbort)
      if (deadline.timedOut()) rejectOnce(new UpstreamTimeoutError())
      else rejectOnce(error)
    })
    if (options.body !== undefined) client.write(Buffer.from(options.body))
    client.end()
  })
}

/** Read an incoming body with a hard byte limit before forwarding it upstream. */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes = DEFAULT_UPSTREAM_MAX_REQUEST_BYTES,
): Promise<ArrayBuffer> {
  const declared = request.headers.get("content-length")
  if (declared !== null) {
    const length = Number(declared)
    if (Number.isSafeInteger(length) && length > maxBytes) throw new UpstreamRequestTooLargeError()
  }
  if (request.body === null) return new ArrayBuffer(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new UpstreamRequestTooLargeError()
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output.buffer
}

/** JSON-oriented variant used by the System runtime manifest. */
export function getJsonWithDomain(
  url: URL,
  domain: string,
  headers?: HeadersInit,
  signal?: AbortSignal,
): Promise<Response> {
  const options: RequestWithDomainOptions = { method: "GET" }
  if (headers !== undefined) options.headers = headers
  if (signal !== undefined) options.signal = signal
  return requestWithDomain(url.toString(), domain, options)
}

/** Fetch variant for upstream calls that do not need Node's request client. */
export async function fetchWithDomain(
  input: string | URL,
  domain: string,
  init: RequestInit = {},
): Promise<Response> {
  const deadline = deadlineFor(init.signal ?? undefined, DEFAULT_UPSTREAM_TIMEOUT_MS)
  try {
    const response = await fetch(input, {
      ...init,
      headers: headersWithForwardedHost(init.headers, domain),
      signal: deadline.controller.signal,
    })
    return boundedFetchResponse(response, DEFAULT_UPSTREAM_MAX_RESPONSE_BYTES, deadline.cleanup)
  } catch (error) {
    deadline.cleanup()
    if (deadline.timedOut()) throw new UpstreamTimeoutError()
    throw error
  }
}
