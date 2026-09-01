// Agent connection BFF: the browser only sees the stable setup projection;
// runtime credentials, deployment context and identity headers stay server-side.
// This route is intentionally narrower than the generic Session/Hub proxies:
// only the connection setup resource is exposed and `platform` is allowlisted.

import { NextResponse } from "next/server"

import {
  authConfig,
  INTERNAL_SECRET_HEADER,
  resolveSessionWithRefresh,
  SERVICE_HEADER,
  SERVICE_VALUE,
} from "@/lib/server/auth"
import { requestWithDomain } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PLATFORMS = new Set(["telegram", "line", "slack"])

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ error }, { status })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const path = (await context.params).path ?? []
  if (path.length !== 2 || path[0] !== "connections" || path[1] !== "setup") {
    return errorResponse("agent_route_not_found", 404)
  }

  const url = new URL(request.url)
  const platforms = url.searchParams.getAll("platform")
  const platform = platforms.length === 1 ? platforms[0] : null
  if (platform === null || !PLATFORMS.has(platform)) {
    return errorResponse("invalid_agent_platform", 400)
  }

  const config = authConfig()
  if (config === null) return errorResponse("auth_not_configured", 503)
  if (config.bffBaseUrl == null && config.agentBaseUrl == null) return errorResponse("agent_not_configured", 503)

  const resolved = await resolveSessionWithRefresh(request, config)
  if (resolved === null) return errorResponse("unauthenticated", 401)
  const { envelope, setCookie } = resolved
  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()
  const target = config.bffBaseUrl != null
    ? `${config.bffBaseUrl.replace(/\/+$/, "")}/v1/agents/connections/setup?platform=${encodeURIComponent(platform)}`
    : `${config.agentBaseUrl!.replace(/\/+$/, "")}/connections/setup?platform=${encodeURIComponent(platform)}`

  const headers = new Headers({
    [SERVICE_HEADER]: SERVICE_VALUE,
    ["x-kokoro-namespace"]: envelope.namespace,
    ["x-kokoro-user-id"]: envelope.user_id,
    ["x-kokoro-request-id"]: requestId,
  })
  // The business BFF authorizes the sealed identity headers itself. Only the
  // legacy direct Agent adapter receives the runtime JWT.
  if (config.bffBaseUrl == null) headers.set("authorization", `Bearer ${envelope.runtime_jwt}`)
  if (config.internalSecret !== null) headers.set(INTERNAL_SECRET_HEADER, config.internalSecret)
  const accept = request.headers.get("accept")
  if (accept !== null) headers.set("accept", accept)

  let upstream: Response
  try {
    upstream = await requestWithDomain(target, config.domain, {
      method: "GET",
      headers: Object.fromEntries(headers.entries()),
      signal: request.signal,
    })
  } catch {
    return errorResponse("agent_unreachable", 502)
  }

  const responseHeaders = new Headers()
  for (const name of ["content-type", "cache-control", "content-length"] as const) {
    const value = upstream.headers.get(name)
    if (value !== null) responseHeaders.set(name, value)
  }
  if (setCookie !== null) responseHeaders.append("set-cookie", setCookie)
  if (config.bffBaseUrl != null && upstream.ok) {
    const raw = await upstream.json().catch(() => null) as { data?: unknown } | null
    if (raw === null || !Object.prototype.hasOwnProperty.call(raw, "data")) return errorResponse("invalid_agent_response", 502)
    responseHeaders.set("content-type", "application/json")
    responseHeaders.delete("content-length")
    return new Response(JSON.stringify(raw.data), { status: upstream.status, headers: responseHeaders })
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}
