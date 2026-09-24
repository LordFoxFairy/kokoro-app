import { randomUUID } from "node:crypto"

import { NextRequest } from "next/server"
import { cookies as requestCookies } from "next/headers"

import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route"
import { iamInteractionDocument } from "@/lib/server/iam-interaction-page"
import { oidcRpConfig } from "@/lib/server/oidc-provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CSRF_PARTS = { params: Promise.resolve({ nextauth: ["csrf"] }) }
const SIGN_IN_PARTS = { params: Promise.resolve({ nextauth: ["signin", "kokoro-iam"] }) }

function unavailable(phase: string): Response {
  console.error("Kokoro Product login start unavailable:", phase)
  // Keep the issuer's visual language without showing an imitation credential form.
  const html = iamInteractionDocument({
    title: "Sign in",
    heading: "Sign in",
    description: "Continue with your Kokoro account.",
    trustedFormHtml: '<p class="empty" role="alert">Sign-in is temporarily unavailable. Please reload this page later.</p>',
  })
  return new Response(html, { status: 503, headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-request-id": randomUUID(),
  } })
}

function cookiePairs(response: Response): string[] | null {
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 4) return null
  const pairs: string[] = []
  for (const cookie of cookies) {
    const pair = cookie.split(";", 1)[0]
    if (!pair || !/^(?:__Host-|__Secure-)?next-auth\.(?:csrf-token|callback-url)=[^;]+$/u.test(pair)) return null
    pairs.push(pair)
  }
  return pairs
}

export async function GET(request: NextRequest): Promise<Response> {
  const config = oidcRpConfig(process.env)
  if (config === null || request.nextUrl.pathname !== "/login" || request.nextUrl.search !== "" ||
    request.headers.get("host") !== config.relay.webHost ||
    (request.headers.get("origin") !== null && request.headers.get("origin") !== config.relay.webOrigin)) return unavailable("configuration_or_origin")

  const base = config.relay.webOrigin
  const headers = new Headers({ host: config.relay.webHost, accept: "application/json" })
  try {
    const csrf = await authGet(new NextRequest(`${base}/api/auth/csrf`, { headers }), CSRF_PARTS)
    if (csrf.status !== 200) return unavailable("csrf_status")
    const body: unknown = await csrf.json()
    const token = typeof body === "object" && body !== null ? (body as { csrfToken?: unknown }).csrfToken : null
    const issuedCookies = cookiePairs(csrf)
    if (typeof token !== "string" || !/^[A-Za-z0-9]+$/u.test(token) || issuedCookies === null) return unavailable("csrf_shape")
    // Auth.js v4's Route Handler reads cookies() from the active Next request
    // context, not from a synthetic NextRequest passed to its handler.
    const activeCookies = await requestCookies()
    const csrfName = `${config.relay.secureCookies ? "__Host-" : ""}next-auth.csrf-token`
    const cookies = [...issuedCookies]
    if (!cookies.some((pair) => pair.startsWith(`${csrfName}=`))) {
      const existing = activeCookies.get(csrfName)?.value
      if (existing?.split("|", 1)[0] !== token) return unavailable("csrf_cookie_missing")
      cookies.push(`${csrfName}=${encodeURIComponent(existing)}`)
    }
    for (const pair of cookies) {
      const separator = pair.indexOf("=")
      activeCookies.set(pair.slice(0, separator), decodeURIComponent(pair.slice(separator + 1)), {
        path: "/", httpOnly: true, sameSite: "lax", secure: config.relay.secureCookies,
      })
    }

    const signIn = await authPost(new NextRequest(`${base}/api/auth/signin/kokoro-iam`, {
      method: "POST",
      headers: {
        host: config.relay.webHost,
        origin: base,
        cookie: cookies.join("; "),
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrfToken: token }).toString(),
    }), SIGN_IN_PARTS)
    const location = signIn.headers.get("location")
    if (signIn.status !== 302 || location === null ||
      !location.startsWith(`${base}/iam/oauth2/authorize?`)) {
      const path = location === null ? "none" : new URL(location, base).pathname
      return unavailable(`signin_response_${signIn.status}_${path}`)
    }

    const responseHeaders = new Headers({
      location,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-request-id": randomUUID(),
    })
    for (const cookie of [...csrf.headers.getSetCookie(), ...signIn.headers.getSetCookie()]) {
      responseHeaders.append("set-cookie", cookie)
    }
    return new Response(null, { status: 302, headers: responseHeaders })
  } catch {
    return unavailable("start_exception")
  }
}

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET" } })
}
