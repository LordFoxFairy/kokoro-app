import { NextResponse } from "next/server"

import { getJsonWithDomain } from "@/lib/server/upstream-http"
import {
  authConfig,
  INTERNAL_SECRET_HEADER,
  readEnvelope,
  SERVICE_HEADER,
  SERVICE_VALUE,
} from "@/lib/server/auth"
import { configuredDomain } from "@/lib/server/domain-context"
import { runtimeManifestSchema, toPublicRuntimeManifest } from "@/system/runtime-manifest"

export const runtime = "nodejs"

function fail(message: string, status: 400 | 503): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url)
  const requestedProductId = requestUrl.searchParams.get("product_id")?.trim() || null
  const locale = requestUrl.searchParams.get("locale")?.trim() || "en-US"
  const requestedSurfaceId = requestUrl.searchParams.get("surface_id")?.trim() || null
  // This is the Kokoro User Web BFF, not a generic manifest proxy. Optional
  // query values are accepted only as an explicit canonical assertion; the
  // upstream target is always fixed to this product/surface pair so a caller
  // cannot project another product or surface through this site repository.
  const productId = "kokoro"
  const surfaceId = "user-web"
  const requestId = request.headers.get("x-kokoro-request-id") || crypto.randomUUID()
  const systemBaseUrl = process.env.KOKORO_SYSTEM_BASE_URL?.trim() || null
  const domain = configuredDomain()
  const internalSecret = process.env.KOKORO_INTERNAL_SECRET_WEB_BFF?.trim() || null

  if (
    (requestedProductId !== null && requestedProductId !== productId)
    || (requestedSurfaceId !== null && requestedSurfaceId !== surfaceId)
    || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale)
  ) {
    return fail("invalid_runtime_manifest_request", 400)
  }
  if (!systemBaseUrl || domain === null) return fail("system_runtime_unavailable", 503)
  // System is an upstream service too. The public authority in Forwarded is
  // only routing context; production must authenticate the Web BFF separately.
  if (process.env.NODE_ENV === "production" && internalSecret === null) {
    return fail("system_runtime_unavailable", 503)
  }

  const upstreamUrl = new URL("/system/runtime-manifest", systemBaseUrl)
  upstreamUrl.searchParams.set("product_id", productId)
  upstreamUrl.searchParams.set("locale", locale)
  upstreamUrl.searchParams.set("surface_id", surfaceId)

  const headers: Record<string, string> = {
    "x-kokoro-request-id": requestId,
    [SERVICE_HEADER]: SERVICE_VALUE,
  }
  if (internalSecret !== null) headers[INTERNAL_SECRET_HEADER] = internalSecret
  const auth = authConfig()
  const envelope = auth === null ? null : readEnvelope(request, auth)
  if (envelope?.user_id) headers["x-kokoro-actor-id"] = envelope.user_id
  const workloadToken = process.env.KOKORO_SYSTEM_WORKLOAD_TOKEN?.trim()
  if (workloadToken) headers.Authorization = `Bearer ${workloadToken}`

  const upstream = await getJsonWithDomain(upstreamUrl, domain, headers, request.signal).catch(() => null)
  if (!upstream || !upstream.ok) return fail("system_runtime_unavailable", 503)

  const parsed = runtimeManifestSchema.safeParse(await upstream.json().catch(() => null))
  if (!parsed.success) return fail("invalid_runtime_manifest_response", 503)
  const manifest = parsed.data.data
  // Product/surface are fixed by this site BFF; tenant selection stays entirely
  // inside System from the server-only RFC 7239 `Forwarded` header.
  if (manifest.productId !== productId || manifest.locale !== locale) {
    return fail("invalid_runtime_manifest_response", 503)
  }

  return NextResponse.json({ data: toPublicRuntimeManifest(manifest) }, {
    headers: { "cache-control": "private, no-store" },
  })
}
