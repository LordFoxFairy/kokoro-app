import { createHmac, timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { oidcLoginDocumentPolicy } from "@/lib/server/oidc-login-recovery"
import { parseProductReturnTarget } from "@/lib/product-return-target"

import { securityHeaders, shouldDisableCaching } from "@/lib/server/security-headers"

function requestNonce(): string {
  return btoa(crypto.randomUUID()).replace(/=+$/u, "")
}

function signInViewProof(secret: string, host: string, query: string, token: string, flow: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(["iam-sign-in-view-v2", host, query, token, flow])).digest("base64url")
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = requestNonce()
  const headers = new Headers(request.headers)
  const path = request.nextUrl.pathname
  // Never accept a browser's private projection, including on non-product paths.
  headers.delete("x-kokoro-product-return-target")
  if (request.method === "GET") {
    const { iamRelayConfig, matchesCanonicalWebRequest } = await import("@/lib/server/iam-relay-config")
    const canonical = iamRelayConfig(process.env)
    if (canonical && request.nextUrl.protocol === new URL(canonical.webOrigin).protocol
      && matchesCanonicalWebRequest(request, canonical, "GET")) {
      const target = parseProductReturnTarget(`${path}${request.nextUrl.search}`)
      if (target !== null) headers.set("x-kokoro-product-return-target", target)
    }
  }
  // A rewrite re-enters Proxy. The internal Page is admitted only with a
  // server-HMACed proof; direct browser requests cannot forge these headers.
  let internalSignInView = false
  if (path === "/auth/sign-in/form" && request.method === "GET") {
    const { iamRelayConfig } = await import("@/lib/server/iam-relay-config")
    const config = iamRelayConfig(process.env)
    const flow = headers.get("x-kokoro-sign-in-flow")
    const query = headers.get("x-kokoro-sign-in-query")
    const token = headers.get("x-kokoro-sign-in-csrf")
    const proof = headers.get("x-kokoro-sign-in-proof")
    if (config && flow && /^[A-Za-z0-9_-]{24}$/u.test(flow) && query && token && proof && /^[A-Za-z0-9_-]{43}$/u.test(token) &&
      /^[A-Za-z0-9_-]{43}$/u.test(proof) && request.nextUrl.search === `?flow=${flow}`) {
      const expected = signInViewProof(config.secret, config.webHost, query, token, flow)
      internalSignInView = timingSafeEqual(Buffer.from(proof), Buffer.from(expected))
    }
  }
  if (!internalSignInView) {
    headers.delete("x-kokoro-sign-in-flow")
    headers.delete("x-kokoro-sign-in-query")
    headers.delete("x-kokoro-sign-in-csrf")
    headers.delete("x-kokoro-sign-in-feedback")
  }
  headers.delete("x-kokoro-sign-in-proof")
  const responseSecurityHeaders = securityHeaders(nonce, process.env.NODE_ENV === "development", {
    webOrigin: process.env.KOKORO_WEB_ORIGIN,
    localUploadOrigin: process.env.KOKORO_WEB_LOCAL_UPLOAD_ORIGIN,
    requestProtocol: request.nextUrl.protocol,
    requestHost: request.headers.get("host"),
    requestOrigin: request.headers.get("origin"),
  })
  const policy = responseSecurityHeaders["Content-Security-Policy"]
  headers.set("x-nonce", nonce)
  if (policy !== undefined) headers.set("Content-Security-Policy", policy)

  if (path === "/auth/sign-in/form" && !internalSignInView) return new NextResponse(null, { status: 404 })

  let response: NextResponse
  if (path === "/auth/sign-in" && request.method === "GET") {
    const [{ iamRelayConfig, matchesCanonicalWebRequest }, { filterIssuerCookies, IAM_RELAY_POLICY },
      { issueIamInteractionCsrf, iamSignInCsrfWithinBudget, retireObservedSignInCsrf, clearIamCsrfCookie },
      { readSignInFeedback, clearSignInFeedback, signInFeedbackCookieName },
      { rawIamSignInQuery, isIamSignInExpired, iamSignInFlowId },
      { createIamSignInFlow, readIamSignInFlow, iamSignInFlowWithinBudget }] = await Promise.all([
      import("@/lib/server/iam-relay-config"), import("@/lib/server/iam-relay-policy"),
      import("@/lib/server/iam-interaction-csrf"), import("@/lib/server/iam-sign-in-feedback"),
      import("@/lib/server/iam-sign-in-target"), import("@/lib/server/iam-sign-in-flow"),
    ])
    const config = iamRelayConfig(process.env)
    const redisUrl = process.env.KOKORO_WEB_REDIS_URL
    const retired: string[] = []
    const reject = (status: number) => {
      const result = new NextResponse(null, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } })
      for (const name of retired) result.headers.append("set-cookie", clearIamCsrfCookie("/auth/sign-in", config?.secureCookies ?? false, name))
      return result
    }
    if (config === null || !redisUrl) return reject(503)
    if (!matchesCanonicalWebRequest(request, config, "GET")) return reject(403)
    let byteCount = 2
    for (const [name, value] of request.headers) byteCount += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
    if (byteCount > IAM_RELAY_POLICY.maxHeaderBytes || request.body !== null) return reject(413)
    const cookie = request.headers.get("cookie")
    const issuerCookie = filterIssuerCookies(cookie, config.secureCookies)
    if (issuerCookie === null) return reject(400)
    const redirect = (path: string) => {
      const result = NextResponse.redirect(new URL(path, config.webOrigin), 303)
      result.headers.set("cache-control", "no-store")
      result.headers.set("referrer-policy", "no-referrer")
      return result
    }
    try {
      const flowId = iamSignInFlowId(request.url)
      if (flowId === null) {
        const query = rawIamSignInQuery(request.url)
        if (query === null) return reject(404)
        if (isIamSignInExpired(query)) return redirect("/login")
        if (!iamSignInFlowWithinBudget(cookie)) return reject(429)
        const flow = await createIamSignInFlow({ redisUrl, webOrigin: config.webOrigin, query, cookie, secureCookies: config.secureCookies })
        response = redirect(flow.path)
        response.headers.append("set-cookie", flow.cookie)
        return response
      }
      const flow = await readIamSignInFlow({ redisUrl, webOrigin: config.webOrigin, flowId, cookie })
      if (flow === null || isIamSignInExpired(flow.query)) return redirect("/login")
      const { query, expiresAt } = flow
      const binding = { redisUrl, webOrigin: config.webOrigin, path: "/auth/sign-in" as const,
        method: "POST" as const, query, issuerCookie, context: flowId }
      await retireObservedSignInCsrf({ ...binding, cookie }, name => retired.push(name))
      const remaining = cookie?.split(";").filter(pair => !retired.includes(pair.trim().split("=", 1)[0]!)).join(";") ?? null
      if (!iamSignInCsrfWithinBudget(remaining)) return reject(429)
      const proof = await issueIamInteractionCsrf({ ...binding, expiresAt, secureCookies: config.secureCookies })
      const feedback = readSignInFeedback({ cookie, secret: config.secret, origin: config.webOrigin, query, flowId })
      headers.set("x-kokoro-sign-in-flow", flowId)
      headers.set("x-kokoro-sign-in-query", query)
      headers.set("x-kokoro-sign-in-csrf", proof.token)
      if (feedback !== null) headers.set("x-kokoro-sign-in-feedback", Buffer.from(JSON.stringify(feedback)).toString("base64url"))
      headers.set("x-kokoro-sign-in-proof", signInViewProof(config.secret, config.webHost, query, proof.token, flowId))
      response = NextResponse.rewrite(new URL(`/auth/sign-in/form?flow=${flowId}`, config.webOrigin), { request: { headers } })
      for (const name of retired) response.headers.append("set-cookie", clearIamCsrfCookie("/auth/sign-in", config.secureCookies, name))
      response.headers.append("set-cookie", proof.cookie)
      if (request.cookies.has(signInFeedbackCookieName(flowId))) response.headers.append("set-cookie", clearSignInFeedback(config.secureCookies, flowId))
      response.headers.set("Cache-Control", "private, no-store, max-age=0")
      response.headers.set("Referrer-Policy", "origin")
      response.headers.set("Vary", "Cookie")
    } catch {
      return reject(503)
    }
  } else {
    response = NextResponse.next({ request: { headers } })
  }
  for (const [name, value] of Object.entries(responseSecurityHeaders)) {
    response.headers.set(name, value)
  }
  // Route response headers alone are overridden by Next's Proxy merge. This
  // Exact native login paths only return redirects or inert error pages. Never
  // propagate a callback's code/state in the Referer of its recovery link.
  if (path === "/iam/oauth2/authorize" || path === "/api/auth/signin/kokoro-iam" || path === "/api/auth/callback/kokoro-iam"
    || path === "/auth/select-tenant" || path === "/iam/interactions/select-tenant") {
    response.headers.set("Referrer-Policy", "no-referrer")
    response.headers.set("Content-Security-Policy", oidcLoginDocumentPolicy(nonce))
  }
  if (path === "/auth/sign-out") {
    response.headers.set("Cache-Control", "no-store")
    // The fixed interactive page needs canonical Origin on its native form POST.
    // Its query contains no protocol payload; the inert failure variant has no form.
    response.headers.set("Referrer-Policy", request.nextUrl.searchParams.has("failed") ? "no-referrer" : "origin")
  }
  if (path === "/iam/oauth2/end-session" || path === "/iam/oauth2/end-session/confirm") {
    response.headers.set("Referrer-Policy", "no-referrer")
  }
  if (internalSignInView) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    response.headers.set("Referrer-Policy", "origin")
    response.headers.set("Vary", "Cookie")
  }
  if (path === "/iam/verify-email" || path === "/iam/interactions/invitation") {
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Referrer-Policy", path === "/iam/verify-email" ? "no-referrer" : "same-origin")
  }
  if (request.method === "POST" && path === "/iam/interactions/consent") {
    response.headers.set("Referrer-Policy", "no-referrer")
  }
  // Only exact binary GET paths suppress referrer data at the final Next
  // boundary. Do not accept arbitrary percent escapes or double decoding here.
  if (request.method === "GET" && request.nextUrl.search === ""
    && (/^\/api\/hub\/library\/files\/(?:[A-Za-z0-9][A-Za-z0-9._:-]{0,190}|asset%3A[a-f0-9]{64})\/content$/u.test(path)
      || /^\/api\/hub\/library\/artifacts\/[A-Za-z0-9](?:[A-Za-z0-9._:-]|%3A){0,190}\/[A-Za-z0-9](?:[A-Za-z0-9._:-]|%3A){0,190}\/content$/u.test(path))) {
    response.headers.set("Referrer-Policy", "no-referrer")
  }
  if (shouldDisableCaching(path)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    response.headers.set("Vary", "Cookie")
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
