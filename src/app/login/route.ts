import { createHash, randomBytes, randomUUID } from "node:crypto"

import { NextRequest } from "next/server"

import { DEFAULT_PRODUCT_RETURN_TARGET, parseProductReturnTarget } from "@/lib/product-return-target"
import { escapeInteractionHtml } from "@/lib/server/iam-interaction-route"
import { productLoginReturnCookie } from "@/lib/server/product-login-return"
import { oidcRpConfig } from "@/lib/server/oidc-provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function unavailable(phase: string): Response {
  console.error("Kokoro Product login start unavailable:", phase)
  return new Response(null, { status: 503, headers: {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-request-id": randomUUID(),
  } })
}

function csrfCookie(name: string, token: string, secret: string, secure: boolean): string {
  const digest = createHash("sha256").update(`${token}${secret}`).digest("hex")
  return `${name}=${encodeURIComponent(`${token}|${digest}`)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}

function loginStartDocument(token: string, nonce: string): string {
  const csrf = escapeInteractionHtml(token)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>登录 Kokoro</title></head><body><form id="kokoro-login-start" method="post" action="/api/auth/signin/kokoro-iam"><input type="hidden" name="csrfToken" value="${csrf}"></form><script nonce="${nonce}">document.getElementById("kokoro-login-start")?.submit()</script></body></html>`
}

export async function GET(request: NextRequest): Promise<Response> {
  const config = oidcRpConfig(process.env)
  if (config === null || request.nextUrl.pathname !== "/login" ||
    request.headers.get("host") !== config.relay.webHost ||
    (request.headers.get("origin") !== null && request.headers.get("origin") !== config.relay.webOrigin)) return unavailable("configuration_or_origin")

  try { decodeURIComponent(request.nextUrl.search.slice(1).replace(/\+/g, " ")) }
  catch { return unavailable("return_target") }
  const query = request.nextUrl.searchParams
  const target = request.nextUrl.search === "" ? DEFAULT_PRODUCT_RETURN_TARGET
    : [...query.keys()].length === 1 && query.getAll("return_to").length === 1
      ? parseProductReturnTarget(query.get("return_to") ?? "") : null
  if (target === null) return unavailable("return_target")

  // Auth.js obtains cookies from the live browser request context. A server-side
  // nested Route Handler call cannot move a newly issued cookie into that context,
  // so issue its compatible double-submit cookie and let the browser make the
  // one fixed provider POST.
  const token = randomBytes(32).toString("hex")
  const nonce = request.headers.get("x-nonce")
  if (nonce === null || !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)) return unavailable("request_nonce")
  const csrfName = `${config.relay.secureCookies ? "__Host-" : ""}next-auth.csrf-token`
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-request-id": randomUUID(),
  })
  headers.append("set-cookie", csrfCookie(csrfName, token, config.authSecret, config.relay.secureCookies))
  headers.append("set-cookie", productLoginReturnCookie(target, config.authSecret, config.relay.secureCookies))
  return new Response(loginStartDocument(token, nonce), { status: 200, headers })
}

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET" } })
}
