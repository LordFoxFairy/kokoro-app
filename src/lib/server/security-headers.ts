const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "X-DNS-Prefetch-Control": "off",
} as const

type LocalUploadPolicyContext = Readonly<{
  webOrigin: string | undefined
  localUploadOrigin: string | undefined
  requestProtocol: string
  requestHost: string | null
  requestOrigin: string | null
}>

function canonicalLocalHttpOrigin(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.origin !== raw || url.port === "0") return null
    return url
  } catch { return null }
}

function localUploadSource(development: boolean, context: LocalUploadPolicyContext | undefined): string {
  if (!development || context === undefined) return ""
  const web = canonicalLocalHttpOrigin(context.webOrigin)
  const upload = canonicalLocalHttpOrigin(context.localUploadOrigin)
  // Next dev may normalize its URL to localhost. Compare the actual Host only
  // against trusted configuration; never use request headers as policy sources.
  if (web === null || upload === null || context.requestProtocol !== web.protocol || context.requestHost !== web.host
    || context.requestOrigin !== null && context.requestOrigin !== web.origin) return ""
  return ` ${upload.origin}`
}

export function contentSecurityPolicy(nonce: string, development = false, localUpload?: LocalUploadPolicyContext): string {
  const developmentSources = development ? " 'unsafe-eval'" : ""
  const localAssetSource = localUploadSource(development, localUpload)
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentSources}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: https:${localAssetSource}`,
    "font-src 'self' data: https:",
    `connect-src 'self' https: wss:${localAssetSource}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

export function securityHeaders(nonce: string, development = false, localUpload?: LocalUploadPolicyContext): Record<string, string> {
  return {
    ...BASE_SECURITY_HEADERS,
    "Content-Security-Policy": contentSecurityPolicy(nonce, development, localUpload),
  }
}

export function shouldDisableCaching(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/api" || pathname === "/app" || pathname.startsWith("/app/")
}
