import { NextResponse, type NextRequest } from "next/server"

import { securityHeaders, shouldDisableCaching } from "@/lib/server/security-headers"

function requestNonce(): string {
  return btoa(crypto.randomUUID()).replace(/=+$/u, "")
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = requestNonce()
  const headers = new Headers(request.headers)
  const responseSecurityHeaders = securityHeaders(nonce, process.env.NODE_ENV === "development")
  const policy = responseSecurityHeaders["Content-Security-Policy"]
  headers.set("x-nonce", nonce)
  if (policy !== undefined) headers.set("Content-Security-Policy", policy)

  const response = NextResponse.next({ request: { headers } })
  for (const [name, value] of Object.entries(responseSecurityHeaders)) {
    response.headers.set(name, value)
  }
  if (shouldDisableCaching(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "no-store, max-age=0")
    response.headers.set("Vary", "Cookie")
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
