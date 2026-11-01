import { IAM_RELAY_POLICY, isAllowedIssuerCookieName, resolveBrowserIamGet } from "./iam-relay-policy"
import type { IamRelayUpstream } from "./iam-relay-transport"

const COOKIE_ATTRIBUTES = new Set(["path", "httponly", "samesite", "secure", "expires", "max-age"])

export function browserIamGetResponse(response: Response, relativePath: string): Response {
  if (relativePath === "/verify-email") {
    response.headers.set("cache-control", "no-store")
    response.headers.set("referrer-policy", "no-referrer")
  }
  return response
}

function safeHeaderValue(value: string, maxBytes = 4096): boolean {
  return Buffer.byteLength(value) <= maxBytes && /^[\x20-\x7e]*$/u.test(value)
}

function rawLocationPath(value: string): string | null {
  if (value.startsWith("/")) {
    const queryStart = value.indexOf("?")
    return queryStart < 0 ? value : value.slice(0, queryStart)
  }
  if (!/^https?:\/\//u.test(value)) return null
  const authorityStart = value.indexOf("://") + 3
  const pathStart = value.indexOf("/", authorityStart)
  const queryStart = value.indexOf("?", authorityStart)
  if (pathStart < 0 || (queryStart >= 0 && queryStart < pathStart)) return "/"
  return value.slice(pathStart, queryStart < 0 ? undefined : queryStart)
}

export function validInvitationLocation(value: string, webOrigin: string, sourceRoute: string): boolean {
  if (
    sourceRoute !== IAM_RELAY_POLICY.invitationLocation.sourceRoute ||
    !value.startsWith(`${webOrigin}${IAM_RELAY_POLICY.invitationLocation.path}?id=`) ||
    !safeHeaderValue(value, 8192) ||
    value.includes("\\") ||
    value.includes("#")
  )
    return false
  const remainder = value.slice(`${webOrigin}${IAM_RELAY_POLICY.invitationLocation.path}?id=`.length)
  const [invitationId, error, extra] = remainder.split("&")
  if (
    extra !== undefined ||
    !invitationId ||
    !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/u.test(
      invitationId,
    )
  )
    return false
  return error === undefined || (error.startsWith("error=") && IAM_RELAY_POLICY.invitationLocation.allowedErrorCodes.includes(error.slice("error=".length)))
}

function allowedLocation(value: string, webOrigin: string, sourceRoute?: string): boolean {
  if (!safeHeaderValue(value, 8192) || value.startsWith("//") || value.includes("\\") || value.includes("#")) return false
  const rawPath = rawLocationPath(value)
  if (rawPath === null || rawPath.includes("%") || rawPath.includes("//") || rawPath.split("/").some((segment) => segment === "." || segment === ".."))
    return false
  const rawQuery = value.includes("?") ? value.slice(value.indexOf("?")) : ""
  if (Buffer.byteLength(rawQuery) > IAM_RELAY_POLICY.maxQueryBytes || /%(?![0-9a-fA-F]{2})/u.test(rawQuery)) return false
  try {
    const target = new URL(value, webOrigin)
    if (target.origin !== webOrigin || target.username !== "" || target.password !== "" || target.hash !== "" || target.pathname.includes("%")) return false
    if (IAM_RELAY_POLICY.webInteractionPaths.includes(target.pathname)) return true
    if (sourceRoute !== undefined && validInvitationLocation(value, webOrigin, sourceRoute)) return true
    return resolveBrowserIamGet(`${target.pathname}${target.search}`, "GET") !== null
  } catch {
    return false
  }
}

export function validIamInteractionNavigation(value: string, webOrigin: string): boolean {
  if (!/^https?:\/\//u.test(value) || !allowedLocation(value, webOrigin)) return false
  try {
    const target = new URL(value)
    return IAM_RELAY_POLICY.webInteractionPaths.includes(target.pathname) && target.search.length > 1
  } catch {
    return false
  }
}

function validSetCookieName(value: string, secure: boolean): string | null {
  if (!safeHeaderValue(value, 8192)) return null
  const parts = value.split(";").map((part) => part.trim())
  const pair = parts[0] ?? ""
  const separator = pair.indexOf("=")
  if (separator < 1 || !isAllowedIssuerCookieName(pair.slice(0, separator), secure)) return null
  const attributes = new Map<string, string>()
  for (const part of parts.slice(1)) {
    if (part === "") return null
    const index = part.indexOf("=")
    const key = (index < 0 ? part : part.slice(0, index)).toLowerCase()
    if (!COOKIE_ATTRIBUTES.has(key) || attributes.has(key)) return null
    attributes.set(key, index < 0 ? "" : part.slice(index + 1))
  }
  const name = pair.slice(0, separator)
  const expectedPath = IAM_RELAY_POLICY.cookiePaths.default
  const valid =
    attributes.get("path") === expectedPath &&
    attributes.has("httponly") &&
    attributes.get("samesite")?.toLowerCase() === "lax" &&
    !attributes.has("domain") &&
    (!secure || attributes.has("secure"))
  return valid ? name : null
}

export function nativeIamResponse(
  upstream: IamRelayUpstream,
  webOrigin: string,
  secureCookies: boolean,
  fallbackRequestId: string,
  sourceRoute?: string,
): Response | null {
  if (!Number.isInteger(upstream.status) || upstream.status < 200 || upstream.status > 599) return null
  if ((upstream.status === 204 || upstream.status === 304) && upstream.body.byteLength !== 0) return null

  const headers = new Headers()
  for (const name of IAM_RELAY_POLICY.responseHeaders) {
    const value = upstream.headers.get(name)
    if (value === null) continue
    if (!safeHeaderValue(value, name === "location" ? 8192 : 4096)) return null
    if (name === "location" && !allowedLocation(value, webOrigin, sourceRoute)) return null
    if (name === "retry-after" && (upstream.status !== 429 || !/^[1-9][0-9]{0,4}$/u.test(value) || Number(value) > 86400)) return null
    if (name === "x-content-type-options" && value.toLowerCase() !== "nosniff") return null
    if (name === "pragma" && value.toLowerCase() !== "no-cache") return null
    if (name === "x-request-id" && !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) return null
    headers.set(name, value)
  }
  if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304 && !headers.has("location")) return null
  const cookieNames = new Set<string>()
  for (const cookie of upstream.setCookies) {
    const name = validSetCookieName(cookie, secureCookies)
    if (name === null || cookieNames.has(name)) return null
    cookieNames.add(name)
    headers.append("set-cookie", cookie)
  }
  if (!headers.has("x-request-id")) headers.set("x-request-id", fallbackRequestId)
  headers.set("content-length", String(upstream.body.byteLength))

  const body =
    upstream.status === 204 || upstream.status === 304
      ? null
      : (upstream.body.buffer.slice(upstream.body.byteOffset, upstream.body.byteOffset + upstream.body.byteLength) as ArrayBuffer)
  return new Response(body, { status: upstream.status, headers })
}
