import { randomUUID } from "node:crypto"
import { browserAuthSessionPolicy } from "@/generated/bff-auth-session"

import { observeBrowserAuthSession } from "@/lib/server/browser-auth-session"

import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { InvalidBrowserCookieError, nativeProductBffConfig } from "@/lib/server/product-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorResponse(status: number, code: string, requestId: string): Response {
  const error = browserAuthSessionPolicy.errors.find(error => error.status === status && error.code === code)
  return Response.json({ error: { code, message: error?.message ?? code, retryable: error?.retryable ?? status === 503 } }, {
    status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-request-id": requestId },
  })
}
export async function GET(request: Request): Promise<Response> {
  const supplied = request.headers.get("x-request-id")
  const id = supplied !== null && /^[A-Za-z0-9_-]{1,128}$/u.test(supplied) ? supplied : randomUUID()
  const config = nativeProductBffConfig(process.env)
  if (config === null) return errorResponse(503, "iam_admission_unavailable", id)
  const url = new URL(request.url)
  if (url.pathname !== "/api/auth/session" || [...url.searchParams].some(([key,value]) => key !== "refresh" || !["true","false"].includes(value)) || url.searchParams.getAll("refresh").length > 1) return errorResponse(400, "auth_session_request_invalid", id)
  if (request.headers.get("host") !== new URL(config.session.webOrigin).host || (request.headers.has("origin") && request.headers.get("origin") !== config.session.webOrigin)) return errorResponse(403, "native_session_origin_rejected", id)
  if (["authorization","x-kokoro-service","x-kokoro-internal-secret"].some(header => request.headers.has(header))) return errorResponse(403, "native_session_credential_rejected", id)
  let headerBytes = 2
  for (const [name,value] of request.headers) headerBytes += Buffer.byteLength(name)+Buffer.byteLength(value)+4
  if (headerBytes > IAM_RELAY_POLICY.maxHeaderBytes) return errorResponse(413, "native_session_request_too_large", id)
  if (request.body !== null || request.headers.has("transfer-encoding") || (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return errorResponse(400, "auth_session_request_invalid", id)
  try {
    const observed = await observeBrowserAuthSession(request, config, id, url.searchParams.get("refresh") !== "false")
    return Response.json(observed.body, { status: observed.status, headers: observed.headers })
  } catch (error) { return error instanceof InvalidBrowserCookieError
    ? errorResponse(400, "auth_session_request_invalid", id)
    : errorResponse(503, "iam_admission_unavailable", id) }
}
