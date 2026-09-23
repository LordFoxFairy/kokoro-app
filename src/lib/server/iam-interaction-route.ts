import { randomUUID } from "node:crypto"

import { clearIamCsrfCookie } from "./iam-interaction-csrf"
import { IAM_RELAY_POLICY, filterIssuerCookies } from "./iam-relay-policy"
import { iamRelayConfig, type IamRelayConfig } from "./iam-relay-config"
import { nativeIamResponse, validIamInteractionNavigation } from "./iam-relay-response"
import type { IamRelayUpstream } from "./iam-relay-transport"

export type InteractionPath =
  "/auth/select-tenant" | "/auth/consent" |
  "/iam/interactions/select-tenant" | "/iam/interactions/consent"
export type InteractionContext = Readonly<{
  id: string
  config: IamRelayConfig
  redisUrl: string
  query: string
  issuerCookie: string
}>

export function interactionError(status: number, code: string, id: string): Response {
  return Response.json({ error: { code, message: "IAM interaction was rejected" } }, {
    status, headers: { "cache-control": "no-store", "x-request-id": id },
  })
}

export function interactionMethodNotAllowed(allow: "GET" | "GET, POST"): Response {
  return new Response(null, { status: 405, headers: { allow, "cache-control": "no-store" } })
}

function rawQuery(request: Request, path: InteractionPath): string | null {
  const absolute = request.url
  const authorityStart = absolute.indexOf("://") + 3
  if (authorityStart < 3) return null
  const pathStart = absolute.indexOf("/", authorityStart)
  const target = pathStart < 0 ? "/" : absolute.slice(pathStart)
  if (!target.startsWith(`${path}?`) || target.includes("#")) return null
  const query = target.slice(path.length)
  if (
    query.length < 2 || Buffer.byteLength(query) > IAM_RELAY_POLICY.maxQueryBytes ||
    /[\u0000-\u001f\u007f\\]/u.test(query) || /%(?![0-9a-fA-F]{2})/u.test(query)
  ) return null
  const params = new URLSearchParams(query.slice(1))
  if (params.getAll("sig").length !== 1 || !params.get("sig")) return null
  return query
}

function headerBytes(headers: Headers): number {
  let bytes = 2
  for (const [name, value] of headers) bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  return bytes
}

export function prepareInteraction(request: Request, path: InteractionPath, method: "GET" | "POST"): InteractionContext | Response {
  if (request.method !== method) return interactionMethodNotAllowed(method === "GET" ? "GET" : "GET, POST")
  const rawId = request.headers.get("x-request-id")
  const id = rawId !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(rawId) ? rawId : randomUUID()
  const config = iamRelayConfig(process.env)
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL
  if (config === null || !redisUrl) return interactionError(503, "iam_interaction_unavailable", id)
  if (
    new URL(request.url).origin !== config.webOrigin || request.headers.get("host") !== config.webHost ||
    (method === "POST" ? request.headers.get("origin") !== config.webOrigin :
      request.headers.has("origin") && request.headers.get("origin") !== config.webOrigin)
  ) return interactionError(403, "iam_interaction_origin_rejected", id)
  const query = rawQuery(request, path)
  if (query === null) return interactionError(404, "iam_interaction_not_found", id)
  if (request.headers.has("authorization")) return interactionError(403, "iam_interaction_credential_rejected", id)
  if (headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) return interactionError(413, "iam_interaction_request_too_large", id)
  if (method === "GET" && (request.body !== null || request.headers.has("transfer-encoding") ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0"))) {
    return interactionError(400, "iam_interaction_body_rejected", id)
  }
  const issuerCookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
  if (issuerCookie === null) return interactionError(400, "iam_interaction_cookie_invalid", id)
  return { id, config, redisUrl, query, issuerCookie }
}

export function redirectAuthInteraction(request: Request, outerPath: "/auth/select-tenant" | "/auth/consent"): Response {
  const context = prepareInteraction(request, outerPath, "GET")
  if (context instanceof Response) return context
  const innerPath = outerPath === "/auth/select-tenant" ? "/iam/interactions/select-tenant" : "/iam/interactions/consent"
  return new Response(null, { status: 302, headers: {
    "cache-control": "no-store", "location": `${innerPath}${context.query}`, "x-request-id": context.id,
  } })
}

export function csrfCookieValue(raw: string | null, name: string): string | null {
  if (raw === null) return null
  let value: string | null = null
  for (const part of raw.split(";")) {
    const pair = part.trim()
    const separator = pair.indexOf("=")
    if (separator < 1) return null
    if (pair.slice(0, separator) === name) {
      if (value !== null) return null
      value = pair.slice(separator + 1)
    }
  }
  return value
}

export async function boundedInteractionForm(request: Request, fields: readonly string[]): Promise<URLSearchParams | null> {
  const length = request.headers.get("content-length")
  if (length !== null && (!/^(0|[1-9][0-9]*)$/u.test(length) || Number(length) > IAM_RELAY_POLICY.maxRequestBodyBytes)) return null
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded" || request.body === null) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let aborted = false
  const onAbort = (): void => { aborted = true; void reader.cancel().catch(() => undefined) }
  const deadline = setTimeout(onAbort, IAM_RELAY_POLICY.maxDurationMs)
  request.signal.addEventListener("abort", onAbort, { once: true })
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > IAM_RELAY_POLICY.maxRequestBodyBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(result.value)
    }
  } catch {
    return null
  } finally {
    clearTimeout(deadline)
    request.signal.removeEventListener("abort", onAbort)
    reader.releaseLock()
  }
  if (aborted) return null
  const form = new URLSearchParams(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString("utf8"))
  if ([...form.keys()].length !== fields.length || fields.some((field) => form.getAll(field).length !== 1) ||
    [...form.keys()].some((field) => !fields.includes(field))) return null
  return form
}

export function escapeInteractionHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
}

export function interactionUpstreamHeaders(context: InteractionContext, accept = "application/json"): Headers {
  const headers = new Headers({
    accept, origin: context.config.webOrigin, "x-kokoro-service": "web-bff",
    "x-kokoro-internal-secret": context.config.secret, "x-request-id": context.id,
  })
  if (context.issuerCookie !== "") headers.set("cookie", context.issuerCookie)
  return headers
}

export function issuerCookieAfter(previous: string, setCookies: readonly string[]): string {
  const pairs = new Map<string, string>()
  if (previous !== "") for (const pair of previous.split("; ")) pairs.set(pair.slice(0, pair.indexOf("=")), pair)
  for (const cookie of setCookies) {
    const pair = cookie.slice(0, cookie.indexOf(";"))
    const name = pair.slice(0, pair.indexOf("="))
    let maxAge: string | null = null
    let expires: string | null = null
    for (const rawAttribute of cookie.split(";").slice(1)) {
      const attribute = rawAttribute.trim()
      const separator = attribute.indexOf("=")
      if (separator < 0) continue
      const key = attribute.slice(0, separator).toLowerCase()
      if (key === "max-age") maxAge = attribute.slice(separator + 1)
      if (key === "expires") expires = attribute.slice(separator + 1)
    }
    const expiredByAge = maxAge !== null && /^-?[0-9]+$/u.test(maxAge) ? Number(maxAge) <= 0 : null
    const expiryTime = expires === null ? NaN : Date.parse(expires)
    const deleted = expiredByAge ?? (Number.isFinite(expiryTime) && expiryTime <= Date.now())
    if (deleted) pairs.delete(name)
    else pairs.set(name, pair)
  }
  return [...pairs.values()].join("; ")
}

export function interactionNavigation(
  upstream: IamRelayUpstream,
  context: InteractionContext,
  path: "/iam/interactions/select-tenant" | "/iam/interactions/consent",
): Response | null {
  if (upstream.status !== 200 && upstream.status !== 302) return null
  const native = nativeIamResponse(upstream, context.config.webOrigin, context.config.secureCookies, context.id)
  if (native === null) return null
  let location: string | null = null
  if (upstream.status === 302) {
    const value = native.headers.get("location")
    if (value !== null && validIamInteractionNavigation(new URL(value, context.config.webOrigin).href, context.config.webOrigin)) location = value
  } else if (/^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "")) {
    try {
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(upstream.body))
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const fields = value as Record<string, unknown>
        if (Object.keys(fields).sort().join(",") === "redirect,url" && fields.redirect === true &&
          typeof fields.url === "string" && validIamInteractionNavigation(fields.url, context.config.webOrigin)) location = fields.url
      }
    } catch { /* Reject malformed continuation. */ }
  }
  if (location === null) return null
  const headers = new Headers(native.headers)
  headers.delete("content-length")
  headers.delete("content-type")
  headers.set("cache-control", "no-store")
  headers.set("location", location)
  const response = new Response(null, { status: upstream.status === 302 ? 302 : 303, headers })
  response.headers.append("set-cookie", clearIamCsrfCookie(path, context.config.secureCookies))
  return response
}
