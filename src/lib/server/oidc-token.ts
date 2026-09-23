import { request as httpRequest, type RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"

import { boundedOidcBffAgent } from "./oidc-bff-agent"
import { MAX_TOKEN_LIFETIME_SECONDS, OIDC_RESOURCE, type OidcRpConfig } from "./oidc-provider"
import { validAccessCredential } from "./product-session"
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

export async function refreshOidcToken(config: OidcRpConfig, refresh: string, signal: AbortSignal): Promise<RefreshResult> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, resource: OIDC_RESOURCE })
  const raw = await tokenPost(config, body, signal)
  if (typeof raw !== "object" || raw === null) throw new Error("invalid refresh response")
  const value = raw as Record<string, unknown>
  if (!validAccessCredential(value.access_token) || !validRefreshCredential(value.refresh_token) ||
      typeof value.expires_in !== "number" || !Number.isSafeInteger(value.expires_in) ||
      value.expires_in < 1 || value.expires_in > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error("invalid refresh response")
  }
  return { access: value.access_token, refresh: value.refresh_token, expiresIn: value.expires_in }
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
