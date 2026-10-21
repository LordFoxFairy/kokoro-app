import { randomUUID } from "node:crypto"

/** Same nonce policy at the final Proxy and the standalone failure document. */
export function oidcLoginDocumentPolicy(nonce: string): string {
  return `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`
}

/** Native navigation leaves technical URLs; API clients retain their error contract. */
export function oidcLoginRecovery(request: Request): Response | null {
  if (request.headers.get("sec-fetch-mode") !== "navigate" || request.headers.get("sec-fetch-dest") !== "document") return null
  const acceptsHtml = request.headers.get("accept")?.split(",").some(value => {
    const [mediaType, ...parameters] = value.split(";").map(part => part.trim())
    if (mediaType?.toLowerCase() !== "text/html") return false
    const weights = parameters.filter(parameter => /^q\s*=/iu.test(parameter))
    if (weights.length === 0) return true
    if (weights.length !== 1) return false
    const quality = /^q\s*=\s*(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/iu.exec(weights[0]!)
    return quality !== null && Number(quality[1]) > 0
  })
  if (!acceptsHtml) return null
  const nonce = request.headers.get("x-nonce")
  if (!nonce || !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)) return null
  return new Response(null, {
    status: 303,
    headers: {
      location: "/auth/sign-in/failed",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": oidcLoginDocumentPolicy(nonce),
      "x-request-id": randomUUID(),
      vary: "Accept",
    },
  })
}
