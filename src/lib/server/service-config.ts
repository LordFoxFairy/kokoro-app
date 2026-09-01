// Server-only upstream selection. A deployment can expose one gateway to the
// Web BFF and let the gateway own the bounded-context routing. Explicit
// service URLs remain available for staged migrations and local fixtures.

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
