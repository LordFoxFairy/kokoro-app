import { randomUUID } from "node:crypto"

import { NextRequest } from "next/server"

import { DEFAULT_PRODUCT_RETURN_TARGET, parseProductReturnTarget } from "@/lib/product-return-target"
import { iamRelayConfig, matchesCanonicalWebRequest } from "@/lib/server/iam-relay-config"
import { nativeIamSignInQuery } from "@/lib/server/iam-sign-in-target"
import { loginRecovery } from "@/lib/server/login-recovery"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function unavailable(request: NextRequest, phase: string): Response {
  console.error("Kokoro Product login start unavailable:", phase)
  return loginRecovery(request) ?? new Response(null, { status: 503, headers: {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-request-id": randomUUID(),
  } })
}

export async function GET(request: NextRequest): Promise<Response> {
  const config = iamRelayConfig(process.env)
  if (config === null || request.nextUrl.pathname !== "/login" ||
    !matchesCanonicalWebRequest(request, config, "GET")) return unavailable(request, "configuration_or_origin")

  try { decodeURIComponent(request.nextUrl.search.slice(1).replace(/\+/g, " ")) }
  catch { return unavailable(request, "return_target") }
  const query = request.nextUrl.searchParams
  const target = request.nextUrl.search === "" ? DEFAULT_PRODUCT_RETURN_TARGET
    : [...query.keys()].length === 1 && query.getAll("return_to").length === 1
      ? parseProductReturnTarget(query.get("return_to") ?? "") : null
  if (target === null) return unavailable(request, "return_target")

  const response = new Response(null, { status: 303, headers: {
    location: new URL(`/auth/sign-in${nativeIamSignInQuery(target)}`, config.webOrigin).href,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-request-id": randomUUID(),
  } })
  return response
}

export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET" } })
}
