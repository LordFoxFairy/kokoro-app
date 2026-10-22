import { nativeIamResponse } from "./iam-relay-response"
import type { IamRelayUpstream } from "./iam-relay-transport"
import { oidcDocumentNonce, oidcLoginDocumentPolicy } from "./oidc-login-recovery"

/** The issuer owns validation; a fresh opaque confirmation cookie only admits the local view. */
export function browserLogoutStartResponse(
  request: Request, upstream: IamRelayUpstream, webOrigin: string, secure: boolean, requestId: string,
): Response | null {
  const native = nativeIamResponse(upstream, webOrigin, secure, requestId, "/oauth2/end-session")
  if (native === null || upstream.status !== 200 || oidcDocumentNonce(request) === null) return native
  if (upstream.headers.has("location") || !/^text\/html(?:\s*;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type") ?? "")) return null
  const name = `${secure ? "__Secure-" : ""}kokoro-issuer.session_token.oauth_logout_confirmation`
  const cookie = upstream.setCookies.find(value => value.startsWith(`${name}=`))
  if (!cookie) return null
  const [pair, ...attributes] = cookie.split(";").map(value => value.trim())
  if (!pair || pair === `${name}=`) return null
  const age = attributes.find(value => /^max-age=/iu.test(value))?.slice(8)
  if (!age || !/^[1-9][0-9]{0,2}$/u.test(age) || Number(age) > 300) return null
  const expires = attributes.find(value => /^expires=/iu.test(value))?.slice(8)
  if (expires !== undefined && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) return null
  const headers = new Headers(native.headers)
  headers.delete("content-type")
  headers.delete("content-length")
  headers.set("location", "/auth/sign-out")
  headers.set("cache-control", "no-store")
  headers.set("referrer-policy", "no-referrer")
  headers.set("vary", "Accept")
  return new Response(null, { status: 303, headers })
}

/** No unverified upstream body, cookies or retry command enter the failure document. */
export function browserLogoutFailureResponse(request: Request, response: Response): Response {
  const nonce = oidcDocumentNonce(request)
  if (response.status < 400 || nonce === null) return response
  return new Response(null, { status: 303, headers: {
    location: "/auth/sign-out?failed=1", "cache-control": "no-store", "referrer-policy": "no-referrer",
    "content-security-policy": oidcLoginDocumentPolicy(nonce),
    "x-request-id": response.headers.get("x-request-id") ?? crypto.randomUUID(), vary: "Accept",
  } })
}
