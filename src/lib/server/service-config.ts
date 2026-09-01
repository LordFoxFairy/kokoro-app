// Server-only upstream selection. A deployment may expose an optional thin
// transport adapter between the Web BFF and its internal services. The
// adapter is not the business layer: use-case orchestration belongs in the
// site BFF or a separately deployed business service. Explicit service URLs
// remain available for staged migrations and local fixtures.
//
// The returned Gateway URL is deliberately the authority root, not a namespace
// URL. Each Web BFF owns its public-to-transport path mapping (for example
// `/api/session/sessions/*` becomes `/sessions/*`). Appending a namespace here
// would duplicate that segment for Session, Hub, User, and Agent requests.

export function configuredGatewayBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.KOKORO_GATEWAY_BASE_URL?.trim()
  return value === undefined || value.length === 0 ? null : value.replace(/\/+$/u, "")
}

export function gatewayNamespaceUrl(
  namespace: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const baseUrl = configuredGatewayBaseUrl(env)
  return baseUrl === null ? null : `${baseUrl}/${namespace}`
}
