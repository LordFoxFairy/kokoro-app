import { NextResponse } from "next/server"

import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { requestWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const handlePattern = /^[A-Za-z0-9_-]{43}$/u

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }): Promise<Response> {
  const { handle } = await context.params
  if (!handlePattern.test(handle)) return NextResponse.json({ error: { code: "skill_download_not_found" } }, { status: 404 })
  const config = productBffConfig()
  if (config === null) return NextResponse.json({ error: { code: "skill_dependency_unavailable" } }, { status: 503 })
  let claims
  try { claims = await admittedProductSession(request, config) } catch { return NextResponse.json({ error: { code: "iam_admission_unavailable" } }, { status: 503 }) }
  if (claims === null) return NextResponse.json({ error: { code: "session_authentication_required" } }, { status: 401 })
  const requestId = request.headers.get("x-kokoro-request-id") ?? crypto.randomUUID()
  try {
    const headers = productBffHeaders(config, claims, requestId)
    const upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}/skill-downloads/${handle}`, config.domain, {
      method: "GET", headers: Object.fromEntries(headers), signal: request.signal,
    })
    const location = upstream.headers.get("location")
    if (upstream.status >= 300 && upstream.status < 400 && location !== null) {
      await upstream.body?.cancel()
      return Response.redirect(location, upstream.status)
    }
    const contentType = upstream.headers.get("content-type")
    if (contentType === null) { await upstream.body?.cancel(); return NextResponse.json({ error: { code: "skill_download_invalid" } }, { status: 502 }) }
    return new Response(upstream.body, { status: upstream.status, headers: {
      "content-type": contentType,
      "content-disposition": upstream.headers.get("content-disposition") ?? "attachment",
      "cache-control": "private, no-store",
      ...(upstream.headers.get("content-length") ? { "content-length": upstream.headers.get("content-length")! } : {}),
    } })
  } catch { return NextResponse.json({ error: { code: "skill_dependency_unavailable" } }, { status: 503 }) }
}
