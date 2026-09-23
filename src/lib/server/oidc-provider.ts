import { custom, TokenSet, type Client } from "openid-client"
import type { AuthOptions } from "next-auth"
import type { OAuthConfig } from "next-auth/providers/oauth"

import { boundedOidcBffAgent } from "./oidc-bff-agent"
import { iamRelayConfig, type IamRelayConfig } from "./iam-relay-config"
import { validAccessCredential } from "./product-session"
import { validRefreshCredential } from "./product-session-store"

export const OIDC_RESOURCE = "https://kokoro.dev/resources/iam-internal"
export const OIDC_SCOPE = "openid profile email offline_access iam:session-authorization.verify"
export const MAX_TOKEN_LIFETIME_SECONDS = 60 * 60
const PROVIDER_ID = "kokoro-iam"

export type OidcRpConfig = Readonly<{
  relay: IamRelayConfig
  clientId: string
  clientSecret: string
  authSecret: string
  redisUrl: string
  issuer: string
  callbackUrl: string
}>

export type VerifiedOidcTokens = Readonly<{
  subject: string
  access: string
  refresh: string
  accessExpiresAt: number
}>

export function oidcRpConfig(env: NodeJS.ProcessEnv): OidcRpConfig | null {
  const relay = iamRelayConfig(env)
  const clientId = env.KOKORO_OIDC_CLIENT_ID?.trim()
  const clientSecret = env.KOKORO_OIDC_CLIENT_SECRET?.trim()
  const authSecret = env.KOKORO_WEB_AUTH_SECRET?.trim()
  const redisUrl = env.KOKORO_WEB_REDIS_URL?.trim()
  if (relay === null || !clientId || !clientSecret || !authSecret || !redisUrl) return null
  if (authSecret.length < 32 || clientId.length > 256 || clientSecret.length > 1024) return null
  if (env.NEXTAUTH_URL !== `${relay.webOrigin}/api/auth`) return null
  return {
    relay, clientId, clientSecret, authSecret, redisUrl,
    issuer: `${relay.webOrigin}/iam`,
    callbackUrl: `${relay.webOrigin}/api/auth/callback/${PROVIDER_ID}`,
  }
}

function allowBffEndpoint(client: Client, config: OidcRpConfig, endpoint: "token" | "userinfo", signal: AbortSignal): void {
  signal.throwIfAborted()
  const expected = `${config.relay.bffOrigin}/iam/oauth2/${endpoint}`
  client[custom.http_options] = (url, options) => {
    signal.throwIfAborted()
    if (url.href !== expected) throw new Error("unexpected RP backchannel endpoint")
    return {
      agent: boundedOidcBffAgent(url, signal),
      timeout: 5_000,
      headers: {
        ...options.headers,
        "x-kokoro-service": "web-bff",
        "x-kokoro-internal-secret": config.relay.secret,
      },
    }
  }
  const jwks = `${config.relay.bffOrigin}/iam/jwks`
  client.issuer[custom.http_options] = (url) => {
    signal.throwIfAborted()
    if (url.href !== jwks) throw new Error("unexpected RP JWKS endpoint")
    return { agent: boundedOidcBffAgent(url, signal), timeout: 5_000, headers: {
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": config.relay.secret,
    } }
  }
}

export function oidcAuthOptions(config: OidcRpConfig, onVerified: (tokens: VerifiedOidcTokens) => void, signal: AbortSignal): AuthOptions {
  const provider: OAuthConfig<{ sub: string; name?: string; email?: string }> = {
    id: PROVIDER_ID,
    name: "Kokoro IAM",
    type: "oauth",
    issuer: config.issuer,
    jwks_endpoint: `${config.relay.bffOrigin}/iam/jwks`,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    client: { token_endpoint_auth_method: "client_secret_basic", id_token_signed_response_alg: "EdDSA" },
    checks: ["pkce", "state", "nonce"],
    idToken: true,
    authorization: {
      url: `${config.relay.webOrigin}/iam/oauth2/authorize`,
      params: { response_type: "code", scope: OIDC_SCOPE, resource: OIDC_RESOURCE },
    },
    token: {
      url: `${config.relay.bffOrigin}/iam/oauth2/token`,
      async request({ client, params, checks, provider: activeProvider }) {
        signal.throwIfAborted()
        allowBffEndpoint(client, config, "token", signal)
        const tokens = await client.callback(activeProvider.callbackUrl, params, checks, {
          exchangeBody: { resource: OIDC_RESOURCE },
        })
        return { tokens }
      },
    },
    userinfo: {
      url: `${config.relay.bffOrigin}/iam/oauth2/userinfo`,
      async request({ client, tokens }) {
        signal.throwIfAborted()
        if (!(tokens instanceof TokenSet) || typeof tokens.id_token !== "string") throw new Error("unverified RP tokens")
        allowBffEndpoint(client, config, "userinfo", signal)
        return client.userinfo(tokens)
      },
    },
    profile(profile) {
      if (typeof profile.sub !== "string" || profile.sub.length === 0) throw new Error("invalid RP subject")
      return { id: profile.sub, name: profile.name ?? null, email: profile.email ?? null }
    },
  }
  return {
    providers: [provider],
    secret: config.authSecret,
    useSecureCookies: config.relay.secureCookies,
    session: { strategy: "jwt" },
    callbacks: {
      signIn({ account }) {
        if (account?.provider !== PROVIDER_ID || typeof account.providerAccountId !== "string" ||
          !validAccessCredential(account.access_token) || !validRefreshCredential(account.refresh_token) ||
          typeof account.expires_at !== "number" || !Number.isSafeInteger(account.expires_at) ||
          account.expires_at * 1_000 <= Date.now() ||
          account.expires_at * 1_000 > Date.now() + MAX_TOKEN_LIFETIME_SECONDS * 1_000) return false
        onVerified({ subject: account.providerAccountId, access: account.access_token,
          refresh: account.refresh_token, accessExpiresAt: account.expires_at * 1_000 })
        return false
      },
      session() {
        return { expires: new Date(0).toISOString() }
      },
      redirect() {
        return config.relay.webOrigin
      },
    },
    logger: {
      error(code) { console.error("Web RP error:", code) },
      warn(code) { console.warn("Web RP warning:", code) },
      debug() { /* RP protocol inputs and credentials are never logged. */ },
    },
  }
}
