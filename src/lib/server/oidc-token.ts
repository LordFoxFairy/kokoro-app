import { performance } from "node:perf_hooks"
import { Issuer, TokenSet, custom } from "openid-client"
import { request as httpRequest, type RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"

import { boundedOidcBffAgent } from "./oidc-bff-agent"
import { MAX_TOKEN_LIFETIME_SECONDS, OIDC_RESOURCE, type OidcRpConfig } from "./oidc-provider"
import { validAccessCredential, validIssuerSessionId } from "./product-session"
import { validRefreshCredential } from "./product-session-store"

type RefreshResult = Readonly<{ access: string; refresh: string; expiresIn: number }>

async function tokenPost(config: OidcRpConfig, body: URLSearchParams, signal: AbortSignal): Promise<unknown> {
  const url = new URL("/iam/oauth2/token", config.relay.bffOrigin)
  const payload = body.toString()
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")
  const options: RequestOptions = {
    method: "POST", agent: boundedOidcBffAgent(url, signal),
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded",
      accept: "application/json", "content-length": Buffer.byteLength(payload),
      "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": config.relay.secret },
  }
  return new Promise<unknown>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options, (response) => {
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 1_048_576) { request.destroy(new Error("OIDC response too large")); return }
        chunks.push(chunk)
      })
      response.once("end", () => {
        if (response.statusCode !== 200) { reject(new Error("OIDC token exchange failed")); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown) }
        catch { reject(new Error("invalid OIDC token response")) }
      })
    })
    request.once("error", reject)
    request.setTimeout(5_000, () => request.destroy(new Error("OIDC token timeout")))
    signal.addEventListener("abort", () => request.destroy(new DOMException("Aborted", "AbortError")), { once: true })
    if (signal.aborted) { request.destroy(new DOMException("Aborted", "AbortError")); return }
    request.end(payload)
  })
}

export async function refreshOidcToken(
  config: OidcRpConfig,
  refresh: string,
  callerSignal: AbortSignal,
  expected: Readonly<{ subject: string; issuerSessionId: string }>,
): Promise<RefreshResult> {
  if (!validIssuerSessionId(expected.issuerSessionId) || !expected.subject || expected.subject.length > 256) {
    throw new Error("Invalid refresh session binding")
  }
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(5_000)])
  const deadline = performance.now() + 5_000
  const check = () => {
    signal.throwIfAborted()
    if (performance.now() >= deadline) throw new Error("RP refresh deadline")
  }
  try {
    signal.throwIfAborted()
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, resource: OIDC_RESOURCE })
    const raw = await tokenPost(config, body, signal)
    if (typeof raw !== "object" || raw === null) throw new Error()
    const value = raw as Record<string, unknown>
    if (!validAccessCredential(value.access_token) || !validRefreshCredential(value.refresh_token) ||
        typeof value.expires_in !== "number" || !Number.isSafeInteger(value.expires_in) ||
        value.expires_in < 1 || value.expires_in > MAX_TOKEN_LIFETIME_SECONDS ||
        typeof value.id_token !== "string" || value.id_token.length === 0) throw new Error()
    // Keep exact raw token bounds and the sole exchange above. Use the public
    // native refresh verifier with a one-shot grant result, never re-send a rotating refresh.
    const jwks = new URL("/iam/jwks", config.relay.bffOrigin).href
    const issuer = new Issuer({ issuer: config.issuer,
      token_endpoint: new URL("/iam/oauth2/token", config.relay.bffOrigin).href, jwks_uri: jwks })
    issuer[custom.http_options] = (url) => {
      signal.throwIfAborted()
      if (url.href !== jwks) throw new Error("Unexpected RP key endpoint")
      return { agent: boundedOidcBffAgent(url, signal), timeout: 5_000, headers: {
        "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": config.relay.secret,
      } }
    }
    const client = new issuer.Client({ client_id: config.clientId, client_secret: config.clientSecret,
      token_endpoint_auth_method: "client_secret_basic", id_token_signed_response_alg: "EdDSA" })
    let used = false
    client.grant = () => {
      signal.throwIfAborted()
      if (used) throw new Error("Refresh exchange already consumed")
      used = true
      return Promise.resolve(new TokenSet({ access_token: value.access_token as string,
        refresh_token: value.refresh_token as string, id_token: value.id_token as string,
        expires_in: value.expires_in as number, token_type: "Bearer" }))
    }
    const verified = await client.refresh(refresh, { exchangeBody: { resource: OIDC_RESOURCE } })
    check()
    const claims = verified.claims()
    if (claims.sub !== expected.subject || !validIssuerSessionId(claims.sid) ||
        claims.sid !== expected.issuerSessionId) throw new Error()
    check()
    return { access: value.access_token, refresh: value.refresh_token, expiresIn: value.expires_in }
  } catch { throw new Error("OIDC refresh session verification failed") }
}

export async function revokeOidcToken(config: OidcRpConfig, refresh: string, signal: AbortSignal): Promise<boolean> {
  const url = new URL("/iam/oauth2/revoke", config.relay.bffOrigin)
  const payload = new URLSearchParams({ token: refresh, token_type_hint: "refresh_token" }).toString()
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")
  return new Promise<boolean>((resolve) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "POST", agent: boundedOidcBffAgent(url, signal), headers: {
        authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded",
        "content-length": Buffer.byteLength(payload), "x-kokoro-service": "web-bff",
        "x-kokoro-internal-secret": config.relay.secret,
      },
    }, (response) => { response.resume(); response.once("end", () => resolve(response.statusCode === 200)) })
    request.once("error", () => resolve(false))
    request.setTimeout(5_000, () => request.destroy())
    signal.addEventListener("abort", () => request.destroy(), { once: true })
    if (signal.aborted) { request.destroy(); return }
    request.end(payload)
  })
}
