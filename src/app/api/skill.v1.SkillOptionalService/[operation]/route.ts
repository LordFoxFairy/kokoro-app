import { NextResponse } from "next/server"

import { sameOriginOk } from "@/lib/server/same-origin"
import { admittedProductSession, productBffConfig, productBffHeaders } from "@/lib/server/product-bff"
import { readBoundedRequestBody, requestWithDomain, UpstreamRequestTooLargeError } from "@/lib/server/upstream-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// These are the exact public read methods used by the Manus-compatible Skill
// surface.  The browser cannot choose an arbitrary BFF RPC path.
const OPERATIONS = new Set(["ListSkills", "ListHubSkills", "GetSkill", "SetSkillInstallationEnabled"])
const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu

function error(code: string, status: number): Response {
  return NextResponse.json({ error: { code, message: code } }, {
    status,
    headers: { "cache-control": "private, no-store" },
  })
}

async function boundedMutationBody(response: Response): Promise<Uint8Array> {
  if (response.body === null) throw new Error("skill_response_invalid")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.byteLength
      if (size > 65_536) throw new Error("skill_response_invalid")
      chunks.push(item.value)
    }
  } finally {
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function POST(request: Request, context: { params: Promise<{ operation: string }> }): Promise<Response> {
  const { operation } = await context.params
  if (!OPERATIONS.has(operation)) return error("skill_operation_not_found", 404)
  if (!sameOriginOk(request)) return error("session_forbidden", 403)
  if (!JSON_MEDIA_TYPE.test(request.headers.get("content-type") ?? "")) return error("invalid_skill_request", 400)

  const config = productBffConfig()
  if (config === null) return error("skill_dependency_unavailable", 503)
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return error("iam_admission_unavailable", 503)
  }
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
  if (operation === "SetSkillInstallationEnabled") {
    const idempotencyKey = request.headers.get("idempotency-key")
    if (idempotencyKey === null || idempotencyKey.trim() === "") return error("idempotency_key_required", 400)
    headers.set("idempotency-key", idempotencyKey)
  }
  let upstream: Response
  try {
    upstream = await requestWithDomain(
      `${config.bffBaseUrl.replace(/\/+$/u, "")}/skill.v1.SkillOptionalService/${operation}`,
      config.domain,
      { method: "POST", headers: Object.fromEntries(headers), body, signal: request.signal },
    )
  } catch {
    return error("skill_dependency_unavailable", 503)
  }

  const contentType = upstream.headers.get("content-type")
  const requestIdHeader = upstream.headers.get("x-request-id")
  if (contentType === null || !JSON_MEDIA_TYPE.test(contentType) || requestIdHeader === null) {
    await upstream.body?.cancel()
    return error("skill_response_invalid", 502)
  }
  // Command callers deliberately do not consume a response body. Drain this
  // small JSON acknowledgement before replying so the Node upstream stream can
  // finish and the button does not remain pending behind an unread bridge.
  if (operation === "SetSkillInstallationEnabled") {
    let mutationBody: Uint8Array
    try {
      mutationBody = await boundedMutationBody(upstream)
    } catch {
      return error("skill_response_invalid", 502)
    }
    // A fresh Uint8Array owns an ArrayBuffer (rather than the generic
    // ArrayBufferLike view returned by stream readers), which is a valid
    // Response BodyInit in the server runtime.
    const bufferedMutationBody = new Uint8Array(mutationBody.byteLength)
    bufferedMutationBody.set(mutationBody)
    return new Response(bufferedMutationBody.buffer, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
        "content-length": String(mutationBody.byteLength),
        "cache-control": "private, no-store",
        "x-request-id": requestIdHeader,
      },
    })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
      "cache-control": "private, no-store",
      "x-request-id": requestIdHeader,
    },
  })
}
