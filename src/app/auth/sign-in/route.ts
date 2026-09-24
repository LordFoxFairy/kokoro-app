import { randomUUID } from "node:crypto"

import { clearIamCsrfCookie, consumeIamInteractionCsrf, iamCsrfCookieName, issueIamInteractionCsrf } from "@/lib/server/iam-interaction-csrf"
import { iamInteractionDocument } from "@/lib/server/iam-interaction-page"
import { iamRelayConfig, matchesCanonicalWebRequest } from "@/lib/server/iam-relay-config"
import { filterIssuerCookies, IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { nativeIamResponse, validIamInteractionNavigation } from "@/lib/server/iam-relay-response"
import { requestIamRelay, type IamRelayUpstream } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = "/auth/sign-in"

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json({ error: { code, message: "IAM interaction was rejected" } }, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  })
}

function requestId(request: Request): string {
  const raw = request.headers.get("x-request-id")
  return raw !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(raw) ? raw : randomUUID()
}

function headerBytes(headers: Headers): number {
  let bytes = 2
  for (const [name, value] of headers) bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  return bytes
}

function rawQuery(request: Request): string | null {
  const absolute = request.url
  const authorityStart = absolute.indexOf("://") + 3
  if (authorityStart < 3) return null
  const pathStart = absolute.indexOf("/", authorityStart)
  const target = pathStart < 0 ? "/" : absolute.slice(pathStart)
  if (!target.startsWith(`${PAGE_PATH}?`) || target.includes("#")) return null
  const query = target.slice(PAGE_PATH.length)
  if (
    query.length < 2 || Buffer.byteLength(query) > IAM_RELAY_POLICY.maxQueryBytes ||
    /[\u0000-\u001f\u007f\\]/u.test(query) || /%(?![0-9a-fA-F]{2})/u.test(query)
  ) return null
  return query
}

function cookieValue(raw: string | null, name: string): string | null {
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

async function boundedForm(request: Request): Promise<URLSearchParams | null> {
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
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString("utf8")
  const form = new URLSearchParams(body)
  if ([...form.keys()].length !== 3 || [...form.keys()].some((key) => !["csrf_token", "email", "password"].includes(key))) return null
  if (["csrf_token", "email", "password"].some((key) => form.getAll(key).length !== 1)) return null
  const email = form.get("email") ?? ""
  const password = form.get("password") ?? ""
  if (!/^[^\s@]{1,64}@[^\s@]{1,189}$/u.test(email) || password.length < 1 || Buffer.byteLength(password) > 1024) return null
  return form
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
}

function signInForm(action: string, token: string, email = "", error?: string): string {
  const describedBy = error ? ' aria-describedby="sign-in-error"' : ""
  const alert = error ? `<p class="form-error" id="sign-in-error" role="alert">${escapeHtml(error)}</p>` : ""
  return `<form class="auth-form" method="post" action="${escapeHtml(action)}">${alert}<input type="hidden" name="csrf_token" value="${escapeHtml(token)}"><label class="field" for="email">Email<input id="email" name="email" type="email" autocomplete="username" value="${escapeHtml(email)}"${describedBy} required></label><label class="field" for="password">Password<input id="password" name="password" type="password" autocomplete="current-password"${describedBy} required></label><div class="actions single"><button type="submit">Sign in</button></div></form>`
}

async function signInFormFailure(input: Readonly<{
  status: 401 | 429 | 503
  query: string
  email: string
  issuerCookie: string
  redisUrl: string
  webOrigin: string
  secureCookies: boolean
  requestId: string
}>): Promise<Response> {
  const message = input.status === 401 ? "Email or password is incorrect." : input.status === 429
    ? "Too many sign-in attempts. Please try again later." : "Sign-in could not be completed. Please try again."
  try {
    const proof = await issueIamInteractionCsrf({
      redisUrl: input.redisUrl, webOrigin: input.webOrigin, path: PAGE_PATH, method: "POST",
      query: input.query, issuerCookie: input.issuerCookie, secureCookies: input.secureCookies,
    })
    const html = iamInteractionDocument({
      title: "Sign in", heading: "Sign in", description: "Continue with your Kokoro account.",
      trustedFormHtml: signInForm(`${PAGE_PATH}${input.query}`, proof.token, input.email, message),
    })
    return new Response(html, { status: input.status, headers: {
      "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
      "x-request-id": input.requestId, "set-cookie": proof.cookie,
    } })
  } catch {
    return errorResponse(503, "iam_interaction_unavailable", input.requestId)
  }
}

function issuerCookiesFromResponse(previous: string, upstream: IamRelayUpstream): string {
  const pairs = new Map<string, string>()
  if (previous !== "") for (const pair of previous.split("; ")) pairs.set(pair.slice(0, pair.indexOf("=")), pair)
  for (const cookie of upstream.setCookies) {
    const pair = cookie.slice(0, cookie.indexOf(";"))
    pairs.set(pair.slice(0, pair.indexOf("=")), pair)
  }
  return [...pairs.values()].join("; ")
}

function finalCookies(first: IamRelayUpstream, second: IamRelayUpstream): IamRelayUpstream {
  const cookies = new Map<string, string>()
  for (const value of [...first.setCookies, ...second.setCookies]) cookies.set(value.slice(0, value.indexOf("=")), value)
  return { ...second, setCookies: [...cookies.values()] }
}

function safeContinueLocation(upstream: IamRelayUpstream, webOrigin: string): string | null {
  if (upstream.status !== 200 || !/^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "")) return null
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(upstream.body)) as unknown
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const fields = value as Record<string, unknown>
  if (Object.keys(fields).sort().join(",") !== "redirect,url" || fields.redirect !== true || typeof fields.url !== "string") return null
  return validIamInteractionNavigation(fields.url, webOrigin) ? fields.url : null
}

function safeNavigationResponse(native: Response, status: 302 | 303, location: string): Response {
  const headers = new Headers(native.headers)
  headers.delete("content-length")
  headers.delete("content-type")
  headers.set("cache-control", "no-store")
  headers.set("location", location)
  return new Response(null, { status, headers })
}

export async function GET(request: Request): Promise<Response> {
  const id = requestId(request)
  const config = iamRelayConfig(process.env)
  const query = rawQuery(request)
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL
  if (config === null || !redisUrl) return errorResponse(503, "iam_interaction_unavailable", id)
  if (!matchesCanonicalWebRequest(request, config, "GET")) return errorResponse(403, "iam_interaction_origin_rejected", id)
  if (query === null) return errorResponse(404, "iam_interaction_not_found", id)
  if (headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes || request.body !== null) return errorResponse(413, "iam_interaction_request_too_large", id)
  const issuerCookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
  if (issuerCookie === null) return errorResponse(400, "iam_interaction_cookie_invalid", id)
  try {
    const proof = await issueIamInteractionCsrf({ redisUrl, webOrigin: config.webOrigin, path: PAGE_PATH, method: "POST", query, issuerCookie, secureCookies: config.secureCookies })
    const form = signInForm(`${PAGE_PATH}${query}`, proof.token)
    const html = iamInteractionDocument({ title: "Sign in", heading: "Sign in", description: "Continue with your Kokoro account.", trustedFormHtml: form })
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-request-id": id, "set-cookie": proof.cookie } })
  } catch {
    return errorResponse(503, "iam_interaction_unavailable", id)
  }
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request)
  const config = iamRelayConfig(process.env)
  const query = rawQuery(request)
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL
  if (config === null || !redisUrl) return errorResponse(503, "iam_interaction_unavailable", id)
  if (!matchesCanonicalWebRequest(request, config, "POST")) return errorResponse(403, "iam_interaction_origin_rejected", id)
  if (query === null) return errorResponse(404, "iam_interaction_not_found", id)
  if (request.headers.has("authorization")) return errorResponse(403, "iam_interaction_credential_rejected", id)
  if (headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) return errorResponse(413, "iam_interaction_request_too_large", id)
  const issuerCookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
  if (issuerCookie === null) return errorResponse(400, "iam_interaction_cookie_invalid", id)
  const form = await boundedForm(request)
  if (form === null) return errorResponse(400, "iam_interaction_body_rejected", id)
  const cookieToken = cookieValue(request.headers.get("cookie"), iamCsrfCookieName())
  try {
    const valid = await consumeIamInteractionCsrf({ redisUrl, webOrigin: config.webOrigin, path: PAGE_PATH, method: "POST", query, issuerCookie, cookieToken, formToken: form.get("csrf_token") })
    if (!valid) return errorResponse(403, "iam_interaction_csrf_rejected", id)
  } catch {
    return errorResponse(503, "iam_interaction_unavailable", id)
  }

  const baseHeaders = new Headers({
    "content-type": "application/json",
    origin: config.webOrigin,
    "x-kokoro-service": "web-bff",
    "x-kokoro-internal-secret": config.secret,
    "x-request-id": id,
  })
  if (issuerCookie !== "") baseHeaders.set("cookie", issuerCookie)
  try {
    const signedIn = await requestIamRelay({
      url: `${config.bffOrigin}/iam/sign-in/email`, method: "POST", headers: baseHeaders,
      body: new TextEncoder().encode(JSON.stringify({ email: form.get("email"), password: form.get("password") })),
      signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    const checkedSignIn = nativeIamResponse(signedIn, config.webOrigin, config.secureCookies, id)
    if (checkedSignIn === null) return errorResponse(502, "iam_interaction_response_invalid", id)
    if (signedIn.status !== 200) {
      const status = signedIn.status === 401 ? 401 : signedIn.status === 429 ? 429 : 503
      const code = status === 401 ? "iam_interaction_credentials_rejected" : status === 429 ? "iam_interaction_rate_limited" : "iam_interaction_unavailable"
      if (request.headers.get("accept")?.includes("text/html")) {
        return signInFormFailure({ status, query, email: form.get("email") ?? "", issuerCookie,
          redisUrl, webOrigin: config.webOrigin, secureCookies: config.secureCookies, requestId: id })
      }
      return errorResponse(status, code, id)
    }
    if (!signedIn.setCookies.some((value) => value.startsWith(config.secureCookies ? "__Secure-kokoro-issuer.session_token=" : "kokoro-issuer.session_token="))) {
      return errorResponse(502, "iam_interaction_response_invalid", id)
    }
    const continueHeaders = new Headers(baseHeaders)
    continueHeaders.set("cookie", issuerCookiesFromResponse(issuerCookie, signedIn))
    const continued = await requestIamRelay({
      url: `${config.bffOrigin}/iam/oauth2/continue`, method: "POST", headers: continueHeaders,
      body: new TextEncoder().encode(JSON.stringify({ postLogin: true, oauth_query: query.slice(1) })),
      signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    if (continued.status !== 200 && continued.status !== 302) {
      return errorResponse(503, "iam_interaction_unavailable", id)
    }
    const response = nativeIamResponse(finalCookies(signedIn, continued), config.webOrigin, config.secureCookies, id)
    if (response === null) return errorResponse(502, "iam_interaction_response_invalid", id)
    const location = continued.status === 302 ? response.headers.get("location") : safeContinueLocation(continued, config.webOrigin)
    if (
      location === null ||
      (continued.status === 302 && !validIamInteractionNavigation(new URL(location, config.webOrigin).href, config.webOrigin))
    ) return errorResponse(502, "iam_interaction_response_invalid", id)
    const navigation = safeNavigationResponse(response, continued.status === 302 ? 302 : 303, location)
    navigation.headers.append("set-cookie", clearIamCsrfCookie(PAGE_PATH, config.secureCookies))
    return navigation
  } catch {
    return errorResponse(503, "iam_interaction_unavailable", id)
  }
}
