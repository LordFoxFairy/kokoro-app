import type { AuthOptions } from "next-auth"

export const OIDC_TRANSACTION_TTL_SECONDS = 300
const NAMESPACE_PATTERN = /^[A-Za-z0-9_-]{22}$/u
const MAX_PENDING_PER_KIND = 4

export type OidcCookieNamespaces = Readonly<{ handoffNamespace: string; oidcNamespace: string }>

export function validOidcNamespace(value: unknown): value is string {
  return typeof value === "string" && NAMESPACE_PATTERN.test(value)
}

export function oidcHandoffCsrfName(secure: boolean, namespace: string): string {
  if (!validOidcNamespace(namespace)) throw new Error("invalid login namespace")
  return `${secure ? "__Host-" : ""}next-auth.csrf-token.tx-${namespace}`
}

export function oidcProofCookieNames(secure: boolean, namespace: string): readonly string[] {
  if (!validOidcNamespace(namespace)) throw new Error("invalid login namespace")
  return ["state", "pkce.code_verifier", "nonce"].map(kind => `${secure ? "__Secure-" : ""}next-auth.${kind}.tx-${namespace}`)
}

export function oidcTransactionCookieOptions(secure: boolean, namespaces: OidcCookieNamespaces): NonNullable<AuthOptions["cookies"]> {
  const [state, pkceCodeVerifier, nonce] = oidcProofCookieNames(secure, namespaces.oidcNamespace)
  const cookie = (name: string) => ({ name, options: {
    httpOnly: true, sameSite: "lax" as const, path: "/", secure, maxAge: OIDC_TRANSACTION_TTL_SECONDS,
  } })
  return {
    csrfToken: cookie(oidcHandoffCsrfName(secure, namespaces.handoffNamespace)),
    state: cookie(state!), pkceCodeVerifier: cookie(pkceCodeVerifier!), nonce: cookie(nonce!),
  }
}

export function clearOidcTransactionCookies(secure: boolean, namespaces: OidcCookieNamespaces): readonly string[] {
  return [oidcHandoffCsrfName(secure, namespaces.handoffNamespace), ...oidcProofCookieNames(secure, namespaces.oidcNamespace)]
    .map(name => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`)
}

/** Per-request visible budget, not a cross-request browser lock or global quota. */
export function oidcStartWithinCookieBudget(raw: string | null, allocatingHandoff = true): boolean {
  if (Buffer.byteLength(raw ?? "", "utf8") > 12_288) return false
  const seen = new Set<string>()
  let handoffs = 0, transactions = 0
  for (const part of (raw ?? "").split(";")) {
    const name = part.trim().split("=", 1)[0] ?? ""
    const handoff = /^(?:__Host-)?next-auth\.csrf-token\.tx-[A-Za-z0-9_-]{22}$/u.test(name)
    const transaction = /^(?:__Secure-)?next-auth\.state\.tx-[A-Za-z0-9_-]{22}$/u.test(name)
    if (!handoff && !transaction) continue
    if (seen.has(name)) return false
    seen.add(name)
    if (handoff) handoffs++
    if (transaction) transactions++
  }
  return handoffs < MAX_PENDING_PER_KIND + (allocatingHandoff ? 0 : 1) && transactions < MAX_PENDING_PER_KIND
}
