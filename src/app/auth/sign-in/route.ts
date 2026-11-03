import { readBrowserAuthSession } from "@/lib/server/browser-auth-session"
import { randomUUID } from "node:crypto"

import { clearIamCsrfCookie, consumeIamInteractionCsrf, iamSignInCsrfCookieName } from "@/lib/server/iam-interaction-csrf"
import { iamRelayConfig, matchesCanonicalWebRequest } from "@/lib/server/iam-relay-config"
import { filterIssuerCookies, IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { nativeIamResponse } from "@/lib/server/iam-relay-response"
import { requestIamRelay } from "@/lib/server/iam-relay-transport"
import { nativeProductBffConfig } from "@/lib/server/product-bff"
import { issueSignInFeedback } from "@/lib/server/iam-sign-in-feedback"
import { loginRecovery } from "@/lib/server/login-recovery"
import { IAM_SIGN_IN_PATH, isIamSignInExpired, iamSignInFlowId, nativeIamSignInTarget } from "@/lib/server/iam-sign-in-target"

import { readIamSignInFlow, retireIamSignInFlow, clearIamSignInFlowCookie } from "@/lib/server/iam-sign-in-flow"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = IAM_SIGN_IN_PATH

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

function signInFormFailure(input: Readonly<{
  status: 401 | 429 | 503
  query: string
  flowId: string
  email: string
  secret: string
  webOrigin: string
  secureCookies: boolean
  requestId: string
}>): Response {
  const feedback = issueSignInFeedback({
    status: input.status, email: input.email, secret: input.secret,
    origin: input.webOrigin, query: input.query, flowId: input.flowId, secure: input.secureCookies,
  })
  return new Response(null, { status: 303, headers: {
    location: `${PAGE_PATH}?flow=${input.flowId}`, "cache-control": "no-store",
    "referrer-policy": "origin", "x-request-id": input.requestId, "set-cookie": feedback,
  } })
}

function safeNavigationResponse(native: Response, status: 302 | 303, location: string): Response {
  const headers = new Headers(native.headers)
  headers.delete("content-length")
  headers.delete("content-type")
  headers.set("cache-control", "no-store")
  headers.set("location", location)
  return new Response(null, { status, headers })
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request)
  const config = iamRelayConfig(process.env)
  const productConfig = nativeProductBffConfig(process.env)
  // Match the fixed Product tenant's native-admission credential lexical boundary,
  // not a browser-selected tenant or a UUID-only approximation of IAM opaque IDs.
  const tenantId = process.env.KOKORO_TENANT_ID
  if (!tenantId || tenantId.length > 255 || !/^[^\s\x00-\x1f\x7f]+$/u.test(tenantId) || productConfig === null)
    return errorResponse(503, "iam_interaction_unavailable", id)
  const flowId = iamSignInFlowId(request.url)
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL
  if (config === null || !redisUrl) return errorResponse(503, "iam_interaction_unavailable", id)
  if (!matchesCanonicalWebRequest(request, config, "POST")) return errorResponse(403, "iam_interaction_origin_rejected", id)
  if (flowId === null) return errorResponse(404, "iam_interaction_not_found", id)
  if (request.headers.has("authorization")) return errorResponse(403, "iam_interaction_credential_rejected", id)
  if (headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) return errorResponse(413, "iam_interaction_request_too_large", id)
  const issuerCookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
  if (issuerCookie === null) return errorResponse(400, "iam_interaction_cookie_invalid", id)
  const flowInput = { redisUrl, webOrigin: config.webOrigin, flowId, cookie: request.headers.get("cookie") }
  let flow: Awaited<ReturnType<typeof readIamSignInFlow>>
  try { flow = await readIamSignInFlow(flowInput) } catch { return errorResponse(503, "iam_interaction_unavailable", id) }
  if (flow === null) return loginRecovery(request) ?? errorResponse(403, "iam_interaction_csrf_rejected", id)
  const { query } = flow
  const nativeTarget = nativeIamSignInTarget(query)
  if (nativeTarget === null) return errorResponse(400, "iam_interaction_target_rejected", id)
  const form = await boundedForm(request)
  if (form === null) return errorResponse(400, "iam_interaction_body_rejected", id)
  const formToken = form.get("csrf_token")
  const cookieName = iamSignInCsrfCookieName(query, formToken, flowId)
  if (cookieName === null) return loginRecovery(request) ?? errorResponse(403, "iam_interaction_csrf_rejected", id)
  const cookieToken = cookieValue(request.headers.get("cookie"), cookieName)
  const finish = (response: Response): Response => {
    response.headers.append("set-cookie", clearIamCsrfCookie(PAGE_PATH, config.secureCookies, cookieName))
    return response
  }
  try {
    const valid = await consumeIamInteractionCsrf({ redisUrl, webOrigin: config.webOrigin, path: PAGE_PATH, method: "POST", query, issuerCookie, context: flowId, cookieToken, formToken })
    // Unproved requests neither consume nor clear another form. A proven but
    // expired interaction ends here without automatically sending credentials again.
    if (!valid) return loginRecovery(request) ?? errorResponse(403, "iam_interaction_csrf_rejected", id)
    if (isIamSignInExpired(query)) return finish(loginRecovery(request) ?? errorResponse(403, "iam_interaction_csrf_rejected", id))
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
  const controller = new AbortController()
  const deadline = Date.now() + IAM_RELAY_POLICY.maxDurationMs
  const onAbort = (): void => controller.abort(request.signal.reason)
  if (request.signal.aborted) onAbort()
  else request.signal.addEventListener("abort", onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), IAM_RELAY_POLICY.maxDurationMs)
  const remaining = (): number => {
    controller.signal.throwIfAborted()
    const milliseconds = deadline - Date.now()
    if (milliseconds <= 0) throw new Error("sign-in deadline exceeded")
    return milliseconds
  }
  let credentialsAccepted = false
  const finishNative = async (response: Response): Promise<Response> => {
    // A signed-in session must never send the password again through this flow.
    // Preserve existing browser issuer cookies on failure; do not expose the new
    // unadmitted session. IAM owns expiry of any session not delivered to the browser.
    await retireIamSignInFlow(flowInput).catch(() => false)
    if (response.status === 303 && (controller.signal.aborted || Date.now() >= deadline))
      response = errorResponse(503, "iam_interaction_unavailable", id)
    response.headers.append("set-cookie", clearIamSignInFlowCookie(flowId, config.secureCookies))
    return finish(response)
  }
  const cookies = new Map(issuerCookie === "" ? [] : issuerCookie.split("; ").map(pair => {
    const separator = pair.indexOf("=")
    return [pair.slice(0, separator), pair.slice(separator + 1)] as const
  }))
  const responseCookies = new Map<string, string>()
  const applyCookies = (response: Response): void => {
    for (const raw of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = raw.split(";").map(part => part.trim())
      const separator = pair.indexOf("=")
      const name = pair.slice(0, separator)
      const value = pair.slice(separator + 1)
      const maxAge = attributes.find(attribute => /^max-age=/iu.test(attribute))?.slice(8)
      const expires = attributes.find(attribute => /^expires=/iu.test(attribute))?.slice(8)
      const deleted = value === "" || (maxAge !== undefined ? Number(maxAge) <= 0 : expires !== undefined && Date.parse(expires) <= Date.now())
      if (deleted) cookies.delete(name)
      else cookies.set(name, value)
      responseCookies.set(name, raw)
    }
    baseHeaders.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "))
    if (headerBytes(baseHeaders) > IAM_RELAY_POLICY.maxHeaderBytes ||
      [...responseCookies.values()].reduce((bytes, cookie) => bytes + Buffer.byteLength(cookie) + 14, 0) > IAM_RELAY_POLICY.maxHeaderBytes)
      throw new Error("sign-in cookie headers exceed relay budget")
  }
  try {
    const signedIn = await requestIamRelay({
      url: `${config.bffOrigin}/iam/sign-in/email`, method: "POST", headers: new Headers(baseHeaders),
      body: new TextEncoder().encode(JSON.stringify({ email: form.get("email"), password: form.get("password") })),
      signal: controller.signal, timeoutMs: remaining(),
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    credentialsAccepted = signedIn.status === 200
    remaining()
    const checkedSignIn = nativeIamResponse(signedIn, config.webOrigin, config.secureCookies, id)
    if (checkedSignIn === null) return credentialsAccepted
      ? await finishNative(errorResponse(502, "iam_interaction_response_invalid", id))
      : finish(errorResponse(502, "iam_interaction_response_invalid", id))
    if (signedIn.status !== 200) {
      const status = signedIn.status === 401 ? 401 : signedIn.status === 429 ? 429 : 503
      const code = status === 401 ? "iam_interaction_credentials_rejected" : status === 429 ? "iam_interaction_rate_limited" : "iam_interaction_unavailable"
      if (request.headers.get("accept")?.includes("text/html")) {
        return finish(signInFormFailure({ status, query, flowId, email: form.get("email") ?? "",
          secret: config.secret, webOrigin: config.webOrigin, secureCookies: config.secureCookies, requestId: id }))
      }
      return finish(errorResponse(status, code, id))
    }
    const sessionCookieName = config.secureCookies ? "__Secure-kokoro-issuer.session_token" : "kokoro-issuer.session_token"
    applyCookies(checkedSignIn)
    if (!responseCookies.has(sessionCookieName) || !cookies.has(sessionCookieName))
      return await finishNative(errorResponse(502, "iam_interaction_response_invalid", id))
    const activated = await requestIamRelay({
      url: `${config.bffOrigin}/iam/organization/set-active`, method: "POST", headers: new Headers(baseHeaders),
      body: new TextEncoder().encode(JSON.stringify({ organizationId: tenantId })),
      signal: controller.signal, timeoutMs: remaining(),
      maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    remaining()
    const checkedActivation = nativeIamResponse(activated, config.webOrigin, config.secureCookies, id)
    if (checkedActivation === null) return await finishNative(errorResponse(502, "iam_interaction_response_invalid", id))
    if (activated.status !== 200) {
      const status = activated.status === 401 || activated.status === 403 || activated.status === 429 ? activated.status : 503
      const code = status === 401 ? "iam_interaction_sign_in_required" : status === 403 ? "iam_interaction_tenant_forbidden"
        : status === 429 ? "iam_interaction_rate_limited" : "iam_interaction_unavailable"
      return await finishNative(errorResponse(status, code, id))
    }
    applyCookies(checkedActivation)
    remaining()
    const admitted = await readBrowserAuthSession(new Request(config.webOrigin, {
      headers: { cookie: baseHeaders.get("cookie") ?? "", "x-kokoro-request-id": id }, signal: controller.signal,
    }), productConfig, id)
    remaining()
    if (!admitted.authenticated) return await finishNative(errorResponse(403, "iam_interaction_tenant_forbidden", id))
    const navigation = safeNavigationResponse(checkedSignIn, 303, nativeTarget)
    navigation.headers.delete("set-cookie")
    for (const cookie of responseCookies.values()) navigation.headers.append("set-cookie", cookie)
    navigation.headers.set("referrer-policy", "no-referrer")
    return await finishNative(navigation)
  } catch {
    const response = errorResponse(503, "iam_interaction_unavailable", id)
    return credentialsAccepted ? await finishNative(response) : finish(response)
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener("abort", onAbort)
  }
}
