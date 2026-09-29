import { createHmac, timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { securityHeaders, shouldDisableCaching } from "@/lib/server/security-headers"

function requestNonce(): string {
  return btoa(crypto.randomUUID()).replace(/=+$/u, "")
}

function signInViewProof(secret: string, host: string, query: string, token: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(["iam-sign-in-view-v1", host, query, token])).digest("base64url")
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = requestNonce()
  const headers = new Headers(request.headers)
  const path = request.nextUrl.pathname
  // A rewrite re-enters Proxy. The internal Page is admitted only with a
  // server-HMACed proof; direct browser requests cannot forge these headers.
  let internalSignInView = false
  if (path === "/auth/sign-in/form" && request.method === "GET") {
    const { iamRelayConfig } = await import("@/lib/server/iam-relay-config")
    const config = iamRelayConfig(process.env)
    const query = headers.get("x-kokoro-sign-in-query")
    const token = headers.get("x-kokoro-sign-in-csrf")
    const proof = headers.get("x-kokoro-sign-in-proof")
    if (config && query && token && proof && /^[A-Za-z0-9_-]{43}$/u.test(token) &&
      /^[A-Za-z0-9_-]{43}$/u.test(proof) && request.nextUrl.search === query) {
      const expected = signInViewProof(config.secret, config.webHost, query, token)
      internalSignInView = timingSafeEqual(Buffer.from(proof), Buffer.from(expected))
    }
  }
  if (!internalSignInView) {
    headers.delete("x-kokoro-sign-in-query")
    headers.delete("x-kokoro-sign-in-csrf")
    headers.delete("x-kokoro-sign-in-feedback")
  }
  headers.delete("x-kokoro-sign-in-proof")
  const responseSecurityHeaders = securityHeaders(nonce, process.env.NODE_ENV === "development")
  const policy = responseSecurityHeaders["Content-Security-Policy"]
  headers.set("x-nonce", nonce)
  if (policy !== undefined) headers.set("Content-Security-Policy", policy)

  if (path === "/auth/sign-in/form" && !internalSignInView) return new NextResponse(null, { status: 404 })

  let response: NextResponse
  if (path === "/auth/sign-in" && request.method === "GET") {
    const [{ iamRelayConfig, matchesCanonicalWebRequest }, { filterIssuerCookies, IAM_RELAY_POLICY },
      { issueIamInteractionCsrf }, { readSignInFeedback, clearSignInFeedback }, { rawIamSignInQuery }] = await Promise.all([
      import("@/lib/server/iam-relay-config"), import("@/lib/server/iam-relay-policy"),
      import("@/lib/server/iam-interaction-csrf"), import("@/lib/server/iam-sign-in-feedback"),
      import("@/lib/server/iam-sign-in-target"),
    ])
    const config = iamRelayConfig(process.env)
    const query = rawIamSignInQuery(request.url)
    const redisUrl = process.env.KOKORO_WEB_REDIS_URL
    if (config === null || !redisUrl) return new NextResponse(null, { status: 503, headers: { "cache-control": "no-store" } })
    if (!matchesCanonicalWebRequest(request, config, "GET")) return new NextResponse(null, { status: 403, headers: { "cache-control": "no-store" } })
    if (query === null) return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } })
    // A bookmarked IAM interaction is not a reusable login entry. Restart the
    // fixed Product OIDC flow before rendering a form bound to an expired query.
    const expiration = new URLSearchParams(query).getAll("exp")
    if (expiration.length === 1 && /^(0|[1-9][0-9]*)$/u.test(expiration[0] ?? "") &&
      Number(expiration[0]) <= Math.floor(Date.now() / 1_000)) {
      return new NextResponse(null, { status: 303, headers: {
        location: "/login", "cache-control": "no-store", "referrer-policy": "no-referrer",
      } })
    }
    let byteCount = 2
    for (const [name, value] of request.headers) byteCount += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
    if (byteCount > IAM_RELAY_POLICY.maxHeaderBytes || request.body !== null) {
      return new NextResponse(null, { status: 413, headers: { "cache-control": "no-store" } })
    }
    const issuerCookie = filterIssuerCookies(request.headers.get("cookie"), config.secureCookies)
    if (issuerCookie === null) return new NextResponse(null, { status: 400, headers: { "cache-control": "no-store" } })
    try {
      const proof = await issueIamInteractionCsrf({ redisUrl, webOrigin: config.webOrigin,
        path: "/auth/sign-in", method: "POST", query, issuerCookie, secureCookies: config.secureCookies })
      const feedback = readSignInFeedback({ cookie: request.headers.get("cookie"), secret: config.secret,
        origin: config.webOrigin, query })
      headers.set("x-kokoro-sign-in-query", query)
      headers.set("x-kokoro-sign-in-csrf", proof.token)
      if (feedback !== null) headers.set("x-kokoro-sign-in-feedback", Buffer.from(JSON.stringify(feedback)).toString("base64url"))
      headers.set("x-kokoro-sign-in-proof", signInViewProof(config.secret, config.webHost, query, proof.token))
      const destination = new URL(`/auth/sign-in/form${query}`, config.webOrigin)
      response = NextResponse.rewrite(destination, { request: { headers } })
      response.headers.append("set-cookie", proof.cookie)
      if (request.cookies.has("kokoro_iam_signin_feedback")) response.headers.append("set-cookie", clearSignInFeedback(config.secureCookies))
      response.headers.set("Cache-Control", "private, no-store, max-age=0")
      response.headers.set("Referrer-Policy", "origin")
      response.headers.set("Vary", "Cookie")
    } catch {
      return new NextResponse(null, { status: 503, headers: { "cache-control": "no-store" } })
    }
  } else {
    response = NextResponse.next({ request: { headers } })
  }
  for (const [name, value] of Object.entries(responseSecurityHeaders)) {
    response.headers.set(name, value)
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
