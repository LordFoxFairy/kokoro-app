import { randomUUID } from "node:crypto"

import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { nativeProductBffConfig, nativeSessionBffHeaders, admittedNativeSession } from "@/lib/server/product-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ nextauth: string[] }> }
type Action = "session" | "signout"

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json({ error: { code, message: "Native session request was rejected" } }, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-request-id": requestId,
    },
  })
}

function requestId(request: Request): string {
  const value = request.headers.get("x-request-id")
  return value !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : randomUUID()
}

function actionFor(parts: readonly string[]): Action | null {
  if (parts.length === 1 && parts[0] === "session") return "session"
  if (parts.length === 1 && parts[0] === "signout") return "signout"
  return null
}

function headerBytes(headers: Headers): number {
  let bytes = 2
  for (const [name, value] of headers) bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  return bytes
}

function nativeRequestAllowed(request: Request, action: Action, config: NonNullable<ReturnType<typeof nativeProductBffConfig>>): boolean {
  const url = new URL(request.url)
  const expected = `/api/auth/${action}`
  return url.pathname === expected && url.search === "" && request.headers.get("host") === new URL(config.session.webOrigin).host &&
    (request.headers.get("origin") === null || request.headers.get("origin") === config.session.webOrigin)
}

async function handle(request: Request, context: Context, method: "GET" | "POST"): Promise<Response> {
  const id = requestId(request)
  const action = actionFor((await context.params).nextauth)
  if (action === null || request.method !== method) return errorResponse(404, "native_session_route_not_found", id)
  const config = nativeProductBffConfig(process.env)
  if (config === null) return errorResponse(503, "native_session_unavailable", id)
  if (!nativeRequestAllowed(request, action, config)) return errorResponse(403, "native_session_origin_rejected", id)
  if (request.headers.has("authorization") || request.headers.has("x-kokoro-service") || request.headers.has("x-kokoro-internal-secret")) {
    return errorResponse(403, "native_session_credential_rejected", id)
  }
  if (headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) return errorResponse(413, "native_session_request_too_large", id)
  if (request.headers.has("transfer-encoding") || request.body !== null ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) {
    return errorResponse(400, "native_session_body_rejected", id)
  }

  const native = nativeSessionBffHeaders(request, config, id)
  if (native.state === "invalid") return errorResponse(401, "native_session_invalid", id)
  if (action === "signout") {
    // Browser sign-out is performed by the canonical IAM adapter. Keep this
    // historical API path as a same-origin method-preserving handoff only;
    // it never creates or clears a local Product Session.
    return new Response(null, {
      status: 307,
      headers: { location: "/iam/sign-out", "cache-control": "no-store", "x-request-id": id },
    })
  }
  if (native.state === "missing") return Response.json({ authenticated: false }, {
    headers: { "cache-control": "private, no-store", "x-request-id": id },
  })
  try {
    const claims = await admittedNativeSession(request, config)
    if (claims === null) return errorResponse(401, "native_session_required", id)
    return Response.json(
      { authenticated: true, subject: claims.subject, expires_at: claims.expiresAt, mode: "native" },
      { headers: { "cache-control": "private, no-store", "x-request-id": id } },
    )
  } catch {
    return errorResponse(503, "native_session_unavailable", id)
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return handle(request, context, "GET")
}

export async function POST(request: Request, context: Context): Promise<Response> {
  return handle(request, context, "POST")
}

function methodNotAllowed(request: Request): Response {
  return errorResponse(405, "native_session_method_not_allowed", requestId(request))
}

export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
