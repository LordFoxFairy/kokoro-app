// Server-only deployment context. The Web bundle has one product identity per
// repository; the backend resolves the request's tenant from this deployment
// domain. Never accept this value from query params, request bodies, or browser
// state.

// RFC 7239 is the standard way for a trusted proxy to describe the public
// authority that reached the edge. The BFF is the proxy here; it must replace
// (not append to) any browser-controlled value before forwarding upstream.
export const FORWARDED_HEADER = "forwarded"

function normalizeDomain(value: string | undefined): string | null {
  const domain = value?.trim().toLowerCase().replace(/\.$/u, "") ?? ""
  if (domain.length === 0 || domain.length > 253 || /[\s/?#:]/u.test(domain)) return null
  const labels = domain.split(".")
  if (labels.some((label) =>
    label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
  )) return null
  return domain
}

export function configuredDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeDomain(env.KOKORO_DOMAIN)
}

export function forwardedHeaders(domain: string): Record<string, string> {
  const normalized = normalizeDomain(domain)
  if (normalized === null) throw new Error("invalid KOKORO_DOMAIN")
  return { [FORWARDED_HEADER]: `host=${normalized}` }
}
