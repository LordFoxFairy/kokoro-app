// Match a browser Origin against the requested Host. Next may normalize
// request.url to localhost in development, so the Host header takes precedence.
export function sameOriginOk(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (origin === null) return true
  let originHost: string
  try { originHost = new URL(origin).host }
  catch { return false }
  const hostHeader = request.headers.get("host")
  if (hostHeader !== null) return originHost === hostHeader
  try { return originHost === new URL(request.url).host }
  catch { return false }
}
