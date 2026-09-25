import { randomUUID } from "node:crypto"

import { clearIamCsrfCookie, consumeIamInteractionCsrf, issueIamInteractionCsrf } from "@/lib/server/iam-interaction-csrf"
import { csrfCookieValue } from "@/lib/server/iam-interaction-route"
import { invitationPreviewPage, invitationSignInPage, invitationStatusPage } from "@/lib/server/iam-invitation-page"
import { isExpiredInvitationError, matchesInvitationDecision, parseInvitationContext, parseInvitationTarget, readInvitationForm, VERIFY_MESSAGES } from "@/lib/server/iam-invitation-input"
import { iamRelayConfig, matchesCanonicalWebRequest } from "@/lib/server/iam-relay-config"
import { filterIssuerCookies, IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { nativeIamResponse } from "@/lib/server/iam-relay-response"
import { requestIamRelay } from "@/lib/server/iam-relay-transport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_PATH = "/iam/interactions/invitation"
function requestId(request: Request): string {
  const value = request.headers.get("x-request-id")
  return value !== null && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : randomUUID()
}

function page(html: string, status: number, id: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "referrer-policy": "same-origin", "x-request-id": id })
  for (const cookie of cookies) headers.append("set-cookie", cookie)
  return new Response(html, { status, headers })
}

function rejected(status: number, id: string): Response {
  const message = status === 404 ? "邀请不可用" : status === 429 ? "请求过于频繁" :
    status === 403 ? "邀请请求已拒绝" : "暂时未能打开邀请"
  return page(invitationStatusPage(message, status === 404 ? "当前账号无法查看这份邀请。" :
    status === 429 ? "请稍后再试。" :
      status === 403 ? "请检查邀请链接。" : "当前无法确认邀请状态。"), status, id)
}

function headerBytes(headers: Headers): number {
  let bytes = 2
  for (const [name, value] of headers) bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
  return bytes
}

function fixedTenant(): string | null {
  const value = process.env.KOKORO_TENANT_ID?.trim()
  return value && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null
}

async function loginPage(input: Readonly<{
  query: string; requestId: string; redisUrl: string; webOrigin: string; secureCookies: boolean; message?: string
  failedAction?: "sign-in" | "sign-up"; email?: string; name?: string
}>): Promise<Response> {
  try {
    const inputs = (["sign-in", "sign-up"] as const).map((action) => ({
      redisUrl: input.redisUrl, webOrigin: input.webOrigin, path: PAGE_PATH as "/iam/interactions/invitation", method: "POST" as const,
      query: input.query, issuerCookie: "", context: action, secureCookies: input.secureCookies,
      cookieName: action === "sign-in" ? "kokoro_iam_csrf_invite_signin" : "kokoro_iam_csrf_invite_signup",
    }))
    const [signIn, signUp] = await Promise.all(inputs.map(issueIamInteractionCsrf))
    if (!signIn || !signUp) return rejected(503, input.requestId)
    return page(invitationSignInPage({ action: `${PAGE_PATH}${input.query}`, signInToken: signIn.token,
      signUpToken: signUp.token, ...(input.message === undefined ? {} : { message: input.message }),
      ...(input.failedAction === undefined ? {} : { failedAction: input.failedAction }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.name === undefined ? {} : { name: input.name }) }),
    200, input.requestId, [signIn.cookie, signUp.cookie])
  } catch { return rejected(503, input.requestId) }
}

export async function GET(request: Request): Promise<Response> {
  const id = requestId(request)
  const target = parseInvitationTarget(request.url)
  if (target === null) return rejected(404, id)
  const config = iamRelayConfig(process.env)
  const tenant = fixedTenant()
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL
  if (config === null || tenant === null || !redisUrl) return rejected(503, id)
  if (!matchesCanonicalWebRequest(request, config, "GET") || request.headers.has("authorization")) return rejected(403, id)
  if (headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes || request.body !== null ||
    request.headers.has("transfer-encoding") ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) return rejected(403, id)
  if (target.error !== null) return page(invitationStatusPage("邮箱验证未完成", VERIFY_MESSAGES[target.error] ??
    "此验证链接不可用。"), 200, id)
  const issuerCookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
  if (issuerCookie === null) return rejected(403, id)
  const issuerName = config.secureCookies ? "__Secure-kokoro-issuer.session_token=" : "kokoro-issuer.session_token="
  if (!issuerCookie.split("; ").some((part) => part.startsWith(issuerName) && part.length > issuerName.length)) {
    return loginPage({ query: target.query, requestId: id, redisUrl, webOrigin: config.webOrigin,
      secureCookies: config.secureCookies })
  }
  const headers = new Headers({ accept: "application/json", origin: config.webOrigin,
    cookie: issuerCookie, "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": config.secret, "x-request-id": id })
  try {
    const upstream = await requestIamRelay({
      url: `${config.bffOrigin}/iam/v1/tenants/${tenant}/invitations/${target.id}/context`, headers,
      signal: request.signal, timeoutMs: IAM_RELAY_POLICY.maxDurationMs,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
    })
    if (upstream.status === 401) return loginPage({ query: target.query, requestId: id,
      redisUrl, webOrigin: config.webOrigin, secureCookies: config.secureCookies })
    if (upstream.status === 409 && /^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") &&
      isExpiredInvitationError(upstream.body)) {
      return page(invitationStatusPage("邀请已过期", "请联系邀请人重新发送邀请。"), 409, id)
    }
    if (upstream.status !== 200) return rejected(upstream.status === 404 ? 404 : upstream.status === 429 ? 429 : 503, id)
    if (!/^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") ||
      upstream.setCookies.length !== 0 || upstream.headers.has("location")) return rejected(503, id)
    const context = parseInvitationContext(upstream.body, target.id, tenant)
    if (context === null) return rejected(503, id)
    const decisionProofs = await Promise.all((["accept", "reject"] as const).map((action) =>
      issueIamInteractionCsrf({ redisUrl, webOrigin: config.webOrigin, path: PAGE_PATH, method: "POST",
        query: target.query, issuerCookie, context: `${tenant}:${action}`, secureCookies: config.secureCookies,
        cookieName: `kokoro_iam_csrf_invite_${action}` })))
    const acceptProof = decisionProofs[0]
    const rejectProof = decisionProofs[1]
    if (!acceptProof || !rejectProof) return rejected(503, id)
    return page(invitationPreviewPage({ action: `${PAGE_PATH}${target.query}`,
      acceptToken: acceptProof.token, rejectToken: rejectProof.token,
      tenantName: context.tenant_name, roles: context.roles, expiresAt: context.expires_at }), 200, id,
    decisionProofs.map((proof) => proof.cookie))
  } catch { return rejected(503, id) }
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request)
  const target = parseInvitationTarget(request.url)
  if (target === null || target.error !== null) return rejected(404, id)
  const config = iamRelayConfig(process.env)
  const tenant = fixedTenant()
  const redisUrl = process.env.KOKORO_WEB_REDIS_URL
  if (config === null || tenant === null || !redisUrl) return rejected(503, id)
  if (!matchesCanonicalWebRequest(request, config, "POST") || request.headers.has("authorization") ||
    headerBytes(request.headers) > IAM_RELAY_POLICY.maxHeaderBytes) return rejected(403, id)
  const form = await readInvitationForm(request)
  if (form === null) return rejected(403, id)
  const action = form.get("decision") as "sign-in" | "sign-up" | "accept" | "reject"
  const deciding = action === "accept" || action === "reject"
  const cookieName = action === "sign-in" ? "kokoro_iam_csrf_invite_signin" :
    action === "sign-up" ? "kokoro_iam_csrf_invite_signup" : `kokoro_iam_csrf_invite_${action}`
  const issuerCookie = deciding ? filterIssuerCookies(request.headers.get("cookie"), config.secureCookies) : ""
  const issuerName = config.secureCookies ? "__Secure-kokoro-issuer.session_token=" : "kokoro-issuer.session_token="
  if (issuerCookie === null || (deciding && !issuerCookie.split("; ").some((part) =>
    part.startsWith(issuerName) && part.length > issuerName.length))) return rejected(403, id)
  try {
    const accepted = await consumeIamInteractionCsrf({ redisUrl, webOrigin: config.webOrigin, path: PAGE_PATH,
      method: "POST", query: target.query, issuerCookie, context: deciding ? `${tenant}:${action}` : action,
      cookieToken: csrfCookieValue(request.headers.get("cookie"), cookieName), formToken: form.get("csrf_token") })
    if (!accepted) return rejected(403, id)
  } catch { return rejected(503, id) }
  if (deciding) {
    const headers = new Headers({ accept: "application/json", origin: config.webOrigin, cookie: issuerCookie,
      "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": config.secret, "x-request-id": id })
    try {
      const upstream = await requestIamRelay({
        url: `${config.bffOrigin}/iam/v1/tenants/${tenant}/invitations/${target.id}/${action}`,
        method: "POST", body: new Uint8Array(0), headers, signal: request.signal,
        timeoutMs: IAM_RELAY_POLICY.maxDurationMs, maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes,
        maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes,
      })
      if (upstream.status !== 200) return rejected(upstream.status === 404 ? 404 :
        upstream.status === 429 ? 429 : 503, id)
      if (!/^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") ||
        upstream.setCookies.length !== 0 || upstream.headers.has("location") ||
        !matchesInvitationDecision(upstream.body, target.id, action)) return rejected(503, id)
      const response = action === "accept" ? new Response(null, { status: 303, headers: {
        location: "/login", "cache-control": "no-store", "referrer-policy": "same-origin", "x-request-id": id } }) :
        page(invitationStatusPage("已拒绝邀请", "这份邀请已关闭。"), 200, id)
      response.headers.append("set-cookie", clearIamCsrfCookie(PAGE_PATH, config.secureCookies, cookieName))
      return response
    } catch { return rejected(503, id) }
  }
  const payload = action === "sign-in"
    ? { email: form.get("email"), password: form.get("password") }
    : { name: form.get("name")?.trim(), email: form.get("email"), password: form.get("password"),
      callbackURL: `${config.webOrigin}${PAGE_PATH}${target.query}` }
  const headers = new Headers({ "content-type": "application/json", accept: "application/json", origin: config.webOrigin,
    "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": config.secret, "x-request-id": id })
  try {
    const upstream = await requestIamRelay({ url: `${config.bffOrigin}/iam/${action}/email`, method: "POST", headers,
      body: new TextEncoder().encode(JSON.stringify(payload)), signal: request.signal,
      timeoutMs: IAM_RELAY_POLICY.maxDurationMs, maxRequestBytes: IAM_RELAY_POLICY.maxRequestBodyBytes,
      maxResponseBytes: IAM_RELAY_POLICY.maxResponseBytes, maxHeaderBytes: IAM_RELAY_POLICY.maxHeaderBytes })
    if (upstream.status !== 200) {
      const failure = upstream.status === 429 ? "尝试次数过多，请稍后再试。" :
        upstream.status === 400 || upstream.status === 401
          ? action === "sign-in" ? "邮箱或密码不正确。" : "未能创建账号，请检查填写的信息。"
          : "本次操作未完成，请稍后再试。"
      return loginPage({ query: target.query, requestId: id, redisUrl, webOrigin: config.webOrigin,
        secureCookies: config.secureCookies, message: failure, failedAction: action,
        email: form.get("email") ?? "", ...(action === "sign-up" ? { name: form.get("name") ?? "" } : {}) })
    }
    if (!/^application\/json(?:; charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "") ||
      upstream.headers.has("location")) return rejected(503, id)
    if (action === "sign-up") {
      if (upstream.setCookies.length !== 0) return rejected(503, id)
      const result = page(invitationStatusPage("请查收邮件", "打开验证邮件完成邮箱验证，然后返回此邀请链接登录。"), 200, id)
      result.headers.append("set-cookie", clearIamCsrfCookie(PAGE_PATH, config.secureCookies, cookieName))
      return result
    }
    const native = nativeIamResponse(upstream, config.webOrigin, config.secureCookies, id)
    const issuerName = config.secureCookies ? "__Secure-kokoro-issuer.session_token=" : "kokoro-issuer.session_token="
    if (native === null || !upstream.setCookies.some((cookie) => cookie.startsWith(issuerName))) return rejected(503, id)
    const response = new Response(null, { status: 303, headers: { location: `${PAGE_PATH}${target.query}`,
      "cache-control": "no-store", "referrer-policy": "same-origin", "x-request-id": id } })
    for (const cookie of upstream.setCookies) response.headers.append("set-cookie", cookie)
    response.headers.append("set-cookie", clearIamCsrfCookie(PAGE_PATH, config.secureCookies, cookieName))
    return response
  } catch { return rejected(503, id) }
}

export function HEAD(): Response { return new Response(null, { status: 405, headers: { allow: "GET, POST", "cache-control": "no-store" } }) }
export function OPTIONS(): Response { return new Response(null, { status: 405, headers: { allow: "GET, POST", "cache-control": "no-store" } }) }
