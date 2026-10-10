import { NextResponse } from "next/server"

import { sameOriginOk } from "@/lib/server/same-origin"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu

function error(code: string, status: number): Response {
  return NextResponse.json({ error: { code, message: code } }, { status, headers: { "cache-control": "private, no-store" } })
}

/** Browser-private projection of Manus' exact DownloadSkill operation. */
export async function POST(request: Request): Promise<Response> {
  if (!sameOriginOk(request)) return error("session_forbidden", 403)
  if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return error("invalid_skill_request", 400)
  const config = productBffConfig()
  if (config === null) return error("skill_dependency_unavailable", 503)
  let claims
  try { claims = await admittedProductSession(request, config) } catch { return error("iam_admission_unavailable", 503) }
  if (claims === null) return error("session_authentication_required", 401)
  let body: ArrayBuffer
  try {
    body = await readBoundedRequestBody(request, 65_536)
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
  } catch (caught) {
    return error(caught instanceof UpstreamRequestTooLargeError ? "request_body_too_large" : "invalid_skill_request", caught instanceof UpstreamRequestTooLargeError ? 413 : 400)
  }
  const requestId = request.headers.get("x-kokoro-request-id") ?? crypto.randomUUID()
  const headers = productBffHeaders(config, claims, requestId)
  headers.set("content-type", "application/json")
  headers.set("accept", "application/json")
  try {
    const upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/skill.v1.SkillService/DownloadSkill`, config.domain, {
      method: "POST", headers: Object.fromEntries(headers), body, signal: request.signal,
    })
    const contentType = upstream.headers.get("content-type")
    const upstreamRequestId = upstream.headers.get("x-request-id")
    if (contentType === null || !JSON_MEDIA_TYPE.test(contentType) || upstreamRequestId === null) {
      await upstream.body?.cancel()
      return error("skill_response_invalid", 502)
    }
    return new Response(upstream.body, { status: upstream.status, headers: { "content-type": contentType, "cache-control": "private, no-store", "x-request-id": upstreamRequestId } })
  } catch { return error("skill_dependency_unavailable", 503) }
}
