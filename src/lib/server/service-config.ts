// Server-only upstream selection. The independent kokoro-bff owns business
// projections; explicit service URLs remain available for Chat, auth, and
// staged migrations. No shared gateway root is consulted here.

export function configuredBffBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.KOKORO_BFF_BASE_URL?.trim()
  return value === undefined || value.length === 0 ? null : value.replace(/\/+$/u, "")
}

export function bffPathUrl(path: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const baseUrl = configuredBffBaseUrl(env)
  if (baseUrl === null) return null
  return new URL(path.replace(/^\/+/, "/"), `${baseUrl}/`).toString()
}
