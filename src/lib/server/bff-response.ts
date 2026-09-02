import { NextResponse } from "next/server"
import { z } from "zod"

export const PUBLIC_REQUEST_ID_HEADER = "x-request-id"

const requestIdSchema = z.string().trim().min(1)

export const bffRequestMetaSchema = z.object({
  request_id: requestIdSchema,
}).passthrough()

export const bffErrorEnvelopeSchema = z.object({
  error: z.object({
    code: requestIdSchema,
    message: z.string().min(1),
  }).strict(),
  meta: bffRequestMetaSchema,
}).strict()

export function bffSuccessEnvelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: bffRequestMetaSchema }).passthrough()
}

function nonEmptyHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim() ?? ""
  return value.length > 0 ? value : null
}

export function requestIdForRequest(request: Request): string {
  return nonEmptyHeader(request, "x-kokoro-request-id")
    ?? nonEmptyHeader(request, PUBLIC_REQUEST_ID_HEADER)
    ?? crypto.randomUUID()
}

export function requestIdFromResponse(upstream: Response, fallback: string): string {
  const value = upstream.headers.get(PUBLIC_REQUEST_ID_HEADER)?.trim()
    || upstream.headers.get("x-kokoro-request-id")?.trim()
  return value || fallback
}

export function responseHeadersWithRequestId(requestId: string, init?: HeadersInit): Headers {
  const headers = new Headers(init)
  headers.set(PUBLIC_REQUEST_ID_HEADER, requestId)
  return headers
}

export function upstreamResponseHeaders(
  upstream: Response,
  requestId: string,
  names: readonly string[] = ["cache-control", "retry-after"],
): Headers {
  const headers = responseHeadersWithRequestId(requestId)
  headers.set("cache-control", "no-store")
  for (const name of names) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return headers
}

export function webErrorResponse(
  code: string,
  status: number,
  requestId: string,
  message = code,
  init?: HeadersInit,
): NextResponse {
  const headers = responseHeadersWithRequestId(requestId, init)
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store")
  return NextResponse.json({
    error: { code, message },
    meta: { request_id: requestId },
  }, { status, headers })
}

export function bffErrorResponse(
  upstream: Response,
  body: unknown,
  fallbackCode: string,
  fallbackRequestId: string,
  init?: HeadersInit,
): Response {
  const parsed = bffErrorEnvelopeSchema.safeParse(body)
  const requestId = parsed.success
    ? parsed.data.meta.request_id
    : requestIdFromResponse(upstream, fallbackRequestId)
  const status = upstream.status >= 400 ? upstream.status : 502
  const headers = responseHeadersWithRequestId(requestId, init)
  for (const name of ["cache-control", "retry-after"] as const) {
    if (!headers.has(name)) {
      const value = upstream.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
  }
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store")
  headers.set("content-type", "application/json; charset=utf-8")
  headers.delete("content-length")

  if (parsed.success) {
    return new Response(JSON.stringify({ error: parsed.data.error, meta: parsed.data.meta }), { status, headers })
  }

  return NextResponse.json({
    error: { code: fallbackCode, message: fallbackCode },
    meta: { request_id: requestId },
  }, { status, headers })
}
