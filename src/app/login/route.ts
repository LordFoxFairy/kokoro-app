import { randomUUID } from "node:crypto"

import { NextRequest } from "next/server"

import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route"
import { iamInteractionDocument } from "@/lib/server/iam-interaction-page"
import { oidcRpConfig } from "@/lib/server/oidc-provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CSRF_PARTS = { params: Promise.resolve({ nextauth: ["csrf"] }) }
const SIGN_IN_PARTS = { params: Promise.resolve({ nextauth: ["signin", "kokoro-iam"] }) }

function unavailable(): Response {
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
  if (cookies.length === 0 || cookies.length > 4) return null
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
    (request.headers.get("origin") !== null && request.headers.get("origin") !== config.relay.webOrigin)) return unavailable()

  const base = config.relay.webOrigin
  const headers = new Headers({ host: config.relay.webHost, accept: "application/json" })
  try {
    const csrf = await authGet(new NextRequest(`${base}/api/auth/csrf`, { headers }), CSRF_PARTS)
    if (csrf.status !== 200) return unavailable()
    const body: unknown = await csrf.json()
    const token = typeof body === "object" && body !== null ? (body as { csrfToken?: unknown }).csrfToken : null
    const cookies = cookiePairs(csrf)
    if (typeof token !== "string" || !/^[A-Za-z0-9]+$/u.test(token) || cookies === null) return unavailable()

    const signIn = await authPost(new NextRequest(`${base}/api/auth/signin/kokoro-iam`, {
      method: "POST",
      headers: {
        host: config.relay.webHost,
        origin: base,
        cookie: cookies.join("; "),
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrfToken: token }).toString(),
    }), SIGN_IN_PARTS)
    const location = signIn.headers.get("location")
    if (signIn.status !== 302 || location === null ||
      !location.startsWith(`${base}/iam/oauth2/authorize?`)) return unavailable()

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
    return unavailable()
  }
}

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET" } })
}
