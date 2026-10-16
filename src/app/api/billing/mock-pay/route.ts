// Retired mock payment surface: retain authentication and origin admission,
// but do not read payment intent or contact an owner in any environment.
import { NextResponse } from "next/server"

import { sameOriginOk } from "@/lib/server/same-origin"
import { admittedProductSession, productBffConfig } from "@/lib/server/product-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const config = productBffConfig()
  if (config === null) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  if (!sameOriginOk(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  let claims
  try {
    claims = await admittedProductSession(request, config)
  } catch {
    return NextResponse.json({ error: "session_unavailable" }, { status: 503 })
  }
  if (claims === null) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  return NextResponse.json({ error: "mock_pay_unavailable" }, { status: 503 })
}
