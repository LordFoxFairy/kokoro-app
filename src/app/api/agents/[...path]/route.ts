import {
  AGENT_CONNECTION_READ_ERRORS, AGENT_CONNECTION_WRITE_ERRORS, agentConnectionCommandSchema, agentConnectionErrorSchema, agentPlatformSchema,
  AGENT_LINE_CONNECTION_CONTINUE_ERRORS, lineConnectionContinueRequestSchema,
  type AgentConnectionCommand,
} from "@/generated/bff-agent-connections"
import {
  AGENT_CONNECTION_BODY_LIMIT, AGENT_CONNECTION_DEADLINE_MS, AGENT_CONNECTION_JSON, AGENT_CONNECTION_RESPONSE_LIMIT, parseAgentConnectionResponse, parseLineConnectionContinuation, type LineConnectionContinueRequest,
} from "@/agents/client"
import { hasHubNoStoreDirective } from "@/hub/client"
import { webErrorResponse } from "@/lib/server/bff-response"
import { nativeSessionBffHeaders, productBffConfig } from "@/lib/server/product-bff"
import { sameOriginOk } from "@/lib/server/same-origin"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const incompatibleHeaders = ["transfer-encoding", "content-encoding", "idempotency-key", "if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range"]

/** Browser-only owner setup; provider webhook traffic never passes here. */
async function proxySetup(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const requestId = crypto.randomUUID()
  const fail = (status: number, code: string) => webErrorResponse(code, status, requestId)
  const invalid = () => fail(400, "invalid_agent_connection_request")
  const invalidUpstream = () => fail(502, "agent_connection_response_invalid")
  const path = (await context.params).path
  const url = new URL(request.url)
  const setup = path?.length === 2 && path[0] === "connections" && path[1] === "setup" && url.pathname === "/api/agents/connections/setup"
  const continuation = path?.length === 3 && path[0] === "connections" && path[1] === "line" && path[2] === "continue" &&
    url.pathname === "/api/agents/connections/line/continue"
  if (!setup && !continuation) return fail(404, "agent_route_not_found")
  const post = request.method === "POST"
  if (continuation && (!post || request.url.includes("?") || url.hash)) return invalid()
  const query = [...url.searchParams.entries()]
  const platform = agentPlatformSchema.safeParse(continuation ? "line" : query[0]?.[1])
  if (!platform.success || (!continuation && (query.length !== 1 || query[0]?.[0] !== "platform" || url.hash))) return fail(400, "invalid_agent_platform")
  if (incompatibleHeaders.some(name => request.headers.has(name))) return invalid()
  const type = request.headers.get("content-type")
  const length = request.headers.get("content-length")
  if (post ? !AGENT_CONNECTION_JSON.test(type ?? "") || request.body === null || (length !== null && !/^[1-9][0-9]*$/u.test(length))
    : type !== null || (length !== null && length !== "0")) return invalid()
  const config = productBffConfig()
  if (!config) return fail(503, "agent_connection_unavailable")
  if (post && (request.headers.get("origin") !== config.session.webOrigin || !sameOriginOk(request))) return fail(403, "forbidden_origin")
  const native = nativeSessionBffHeaders(request, config, requestId)
  if (native.state !== "valid") return fail(401, "session_authentication_required")

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(AGENT_CONNECTION_DEADLINE_MS)])
  const deadline = performance.now() + AGENT_CONNECTION_DEADLINE_MS
  let upstream: Response | undefined
  try {
    let body: ArrayBuffer | undefined
    let command: AgentConnectionCommand | undefined
    let lineCommand: LineConnectionContinueRequest | undefined
    if (post) {
      body = await readBoundedRequestBody(request, AGENT_CONNECTION_BODY_LIMIT, signal)
      if (length !== null && Number(length) !== body.byteLength) return invalid()
      try {
        // The original bytes reach the owner, whose strict JSON decoder also rejects duplicate keys.
        const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
        if (continuation) lineCommand = lineConnectionContinueRequestSchema.parse(raw)
        else command = agentConnectionCommandSchema.parse(raw)
      } catch { return invalid() }
      native.headers.set("content-type", "application/json")
    } else if (request.body !== null) await readBoundedRequestBody(request, 0, signal)
    signal.throwIfAborted()
    upstream = await requestWithDomain(`${config.bffBaseUrl.replace(/\/+$/u, "")}${continuation ? "/v1/agents/connections/line/continue" : `/v1/agents/connections/setup?platform=${platform.data}`}`, config.domain, {
      method: request.method, headers: native.headers, signal,
      timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
      maxRequestBytes: AGENT_CONNECTION_BODY_LIMIT, maxResponseBytes: AGENT_CONNECTION_RESPONSE_LIMIT,
      ...(body === undefined ? {} : { body }),
    })
    signal.throwIfAborted()
    const retry = upstream.headers.get("retry-after")
    if (upstream.headers.get("x-request-id") !== requestId || !hasHubNoStoreDirective(upstream.headers) ||
      !AGENT_CONNECTION_JSON.test(upstream.headers.get("content-type") ?? "") ||
      (retry !== null && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(retry) || Number(retry) > 86_400))) return invalidUpstream()
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await upstream.arrayBuffer())) }
    catch { signal.throwIfAborted(); return invalidUpstream() }
    signal.throwIfAborted()
    const headers = { "cache-control": "private, no-store", "x-request-id": requestId,
      ...(continuation ? { "referrer-policy": "no-referrer" } : {}), ...(retry === null ? {} : { "retry-after": retry }) }
    if (upstream.status === 200) {
      if (continuation && upstream.headers.get("referrer-policy")?.trim().toLowerCase() !== "no-referrer") return invalidUpstream()
      const receipt = lineCommand ? parseLineConnectionContinuation(raw, requestId, lineCommand) : parseAgentConnectionResponse(raw, requestId, platform.data, command)
      return receipt === null ? invalidUpstream() : Response.json(receipt, { headers })
    }
    const error = agentConnectionErrorSchema.safeParse(raw)
    const errors: readonly number[] = continuation ? AGENT_LINE_CONNECTION_CONTINUE_ERRORS : post ? AGENT_CONNECTION_WRITE_ERRORS : AGENT_CONNECTION_READ_ERRORS
    if (!error.success || error.data.meta.request_id !== requestId || !errors.includes(upstream.status) ||
      (upstream.status === 412 && error.data.error.code !== "agent_connection_precondition_failed")) return invalidUpstream()
    return Response.json(error.data, { status: upstream.status, headers })
  } catch (error) {
    if (error instanceof UpstreamRequestTooLargeError) return post ? fail(413, "request_body_too_large") : invalid()
    return fail(503, "agent_connection_unavailable")
  } finally { void upstream?.body?.cancel().catch(() => undefined) }
}

export const GET = proxySetup
export const POST = proxySetup
