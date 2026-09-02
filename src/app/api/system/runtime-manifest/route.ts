import { NextResponse } from "next/server"

import {
  bffErrorEnvelopeSchema,
  bffErrorResponse,
  bffSuccessEnvelopeSchema,
  requestIdForRequest,
  responseHeadersWithRequestId,
  webErrorResponse,
} from "@/lib/server/bff-response"
import { getJsonWithDomain } from "@/lib/server/upstream-http"
import {
  authConfig,
  INTERNAL_SECRET_HEADER,
  readEnvelope,
  SERVICE_HEADER,
  SERVICE_VALUE,
} from "@/lib/server/auth"
import { configuredDomain } from "@/lib/server/domain-context"
import { configuredBffBaseUrl } from "@/lib/server/service-config"
import { runtimeManifestSchema, toPublicRuntimeManifest } from "@/system/runtime-manifest"

export const runtime = "nodejs"

const runtimeManifestResponseSchema = bffSuccessEnvelopeSchema(runtimeManifestSchema.shape.data)

function fail(message: string, status: 400 | 503, requestId: string): NextResponse {
  return webErrorResponse(message, status, requestId)
}

export async function GET(request: Request): Promise<Response> {
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
  const requestId = requestIdForRequest(request)
  const domain = configuredDomain()
  const internalSecret = process.env.KOKORO_INTERNAL_SECRET_WEB_BFF?.trim() || null
  const auth = authConfig()

  if (
    (requestedProductId !== null && requestedProductId !== productId)
    || (requestedSurfaceId !== null && requestedSurfaceId !== surfaceId)
    || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale)
  ) {
    return fail("invalid_runtime_manifest_request", 400, requestId)
  }
  const bffBaseUrl = configuredBffBaseUrl()
  if (!bffBaseUrl || domain === null) return fail("system_runtime_unavailable", 503, requestId)
  // System is reached only through the independent business BFF. The public
  // authority in Forwarded is routing context; it is not a tenant selector.
  if (process.env.NODE_ENV === "production" && internalSecret === null) {
    return fail("system_runtime_unavailable", 503, requestId)
  }

  const upstreamUrl = new URL("/v1/system/runtime-manifest", `${bffBaseUrl}/`)
  upstreamUrl.searchParams.set("product_id", productId)
  upstreamUrl.searchParams.set("locale", locale)
  upstreamUrl.searchParams.set("surface_id", surfaceId)

  const headers: Record<string, string> = {
    "x-kokoro-request-id": requestId,
    [SERVICE_HEADER]: SERVICE_VALUE,
  }
  if (internalSecret !== null) headers[INTERNAL_SECRET_HEADER] = internalSecret
  const envelope = auth === null ? null : readEnvelope(request, auth)
  if (envelope?.namespace) headers["x-kokoro-tenant-id"] = envelope.namespace
  if (envelope?.user_id) headers["x-kokoro-principal-id"] = envelope.user_id

  const upstream = await getJsonWithDomain(upstreamUrl, domain, headers, request.signal).catch(() => null)
  if (!upstream) return fail("system_runtime_unavailable", 503, requestId)

  const raw: unknown = await upstream.json().catch(() => null)
  if (!upstream.ok || bffErrorEnvelopeSchema.safeParse(raw).success) {
    return bffErrorResponse(upstream, raw, "system_runtime_unavailable", requestId)
  }
  const parsed = runtimeManifestResponseSchema.safeParse(raw)
  if (!parsed.success) return fail("invalid_runtime_manifest_response", 503, requestId)
  const manifest = parsed.data.data
  // Product/surface are fixed by this site BFF; tenant selection stays entirely
  // inside System from the server-only RFC 7239 `Forwarded` header.
  if (manifest.productId !== productId || manifest.locale !== locale) {
    return fail("invalid_runtime_manifest_response", 503, requestId)
  }

  return NextResponse.json({ data: toPublicRuntimeManifest(manifest) }, {
    status: 200,
    headers: responseHeadersWithRequestId(parsed.data.meta.request_id, {
      "cache-control": "private, no-store",
    }),
  })
}
