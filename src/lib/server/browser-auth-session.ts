import { browserAuthSessionErrorSchemas, browserAuthSessionPath, browserAuthSessionResponseSchema, type BrowserAuthSession } from "@/generated/bff-auth-session"
import { productBffHeaders, type ProductBffConfig } from "./product-bff"
import { requestWithDomain } from "./upstream-http"

export type BrowserAuthObservation = { status: number; body: unknown; headers: Headers }

/** Read-only callers explicitly opt out of rolling and never commit response cookies. */
export async function observeBrowserAuthSession(request: Request, config: ProductBffConfig, requestId: string, refresh: boolean): Promise<BrowserAuthObservation> {
  const headers = productBffHeaders(config, request, requestId)
  const upstream = await requestWithDomain(`${config.bffBaseUrl}${browserAuthSessionPath(refresh)}`, config.domain, {
    method: "GET", headers, signal: request.signal, timeoutMs: 10_000, maxResponseBytes: 65_536,
  })
  if (!/^application\/json(?:;|$)/iu.test(upstream.headers.get("content-type") ?? "") ||
    !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(upstream.headers.get("cache-control") ?? "")) throw new Error("Invalid auth status protocol")
  const schema = upstream.status === 200 ? browserAuthSessionResponseSchema : browserAuthSessionErrorSchemas[upstream.status as keyof typeof browserAuthSessionErrorSchemas]
  if (!schema) throw new Error("Invalid auth status")
  const body = schema.parse(await upstream.json())
  const output = new Headers({ "cache-control": "no-store", "x-request-id": requestId })
  const retry = upstream.headers.get("retry-after")
  if (retry !== null && [429,503].includes(upstream.status) && /^[1-9]\d{0,4}$/u.test(retry) && Number(retry) <= 86400) output.set("retry-after", retry)
  if (refresh) for (const cookie of upstream.headers.getSetCookie()) output.append("set-cookie", cookie)
  return { status: upstream.status, body, headers: output }
}

export async function readBrowserAuthSession(request: Request, config: ProductBffConfig, requestId: string): Promise<BrowserAuthSession> {
  const observed = await observeBrowserAuthSession(request, config, requestId, false)
  if (observed.status !== 200) throw new Error("Browser auth status unavailable")
  return browserAuthSessionResponseSchema.parse(observed.body).data
}
