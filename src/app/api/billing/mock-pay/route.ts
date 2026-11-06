// Retired mock payment surface: retain configuration/origin validation only;
// never inspect credentials, read payment intent or contact an owner.
import { NextResponse } from "next/server"

import { sameOriginOk } from "@/lib/server/same-origin"
import { productBffConfig } from "@/lib/server/product-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const config = productBffConfig()
  if (config === null) return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
  if (!sameOriginOk(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })



  return NextResponse.json({ error: "mock_pay_unavailable" }, { status: 503 })
}
