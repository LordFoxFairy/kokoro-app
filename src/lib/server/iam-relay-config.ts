export type IamRelayConfig = Readonly<{
  bffOrigin: string
  webOrigin: string
  webHost: string
  secret: string
  secureCookies: boolean
}>

function configuredOrigin(raw: string | undefined, requireCanonicalSpelling: boolean): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username !== "" ||
      parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" ||
      (requireCanonicalSpelling && value !== parsed.origin)
    ) return null
    return parsed.origin
  } catch {
    return null
  }
}

export function iamRelayConfig(env: NodeJS.ProcessEnv): IamRelayConfig | null {
  const bffOrigin = configuredOrigin(env.KOKORO_BFF_BASE_URL, false)
  const webOrigin = configuredOrigin(env.KOKORO_WEB_ORIGIN, true)
  const secret = env.KOKORO_INTERNAL_SECRET_WEB_BFF?.trim()
  if (bffOrigin === null || webOrigin === null || !secret) return null
  return { bffOrigin, webOrigin, webHost: new URL(webOrigin).host, secret, secureCookies: env.NODE_ENV === "production" }
}
