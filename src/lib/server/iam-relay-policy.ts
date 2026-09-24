import policySnapshot from "@/generated/iam-relay-policy.json"

export const IAM_RELAY_POLICY_PROVENANCE = Object.freeze({
  ownerRepository: "kokoro-bff",
  ownerCommit: "87f9d8d154241e8fbde0fc61e67417ee4f1dfa56",
  policySha256: "b3c234924a48f9f92c9928f6e9d127172ee1f952658fa49dea99865cc554bc92",
})

export type IamRelayPolicy = Readonly<{
  version: string
  iamOwnerCommit: string
  iamAllowlistSha256: string
  iamSnapshotSha256: string
  routes: Readonly<Record<string, readonly string[]>>
  requestHeaders: readonly string[]
  responseHeaders: readonly string[]
  cookieNames: readonly string[]
  cookieNamePrefixes: readonly string[]
  cookiePaths: Readonly<{ default: string; logoutConfirmation: string }>
  webInteractionPaths: readonly string[]
  maxQueryBytes: number
  maxRequestBodyBytes: number
  maxHeaderBytes: number
  maxResponseBytes: number
  maxDurationMs: number
}>

const EXPECTED_IAM_COMMIT = "3231d2e9b225c337a1432ffb431cd7a5269d988d"
const BROWSER_GET_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/jwks",
  "/oauth2/authorize",
  "/oauth2/end-session",
  "/get-session",
  "/verify-email",
])

export function validateIamRelayPolicySnapshot(value: unknown): IamRelayPolicy {
  if (typeof value !== "object" || value === null) throw new Error("invalid IAM relay policy snapshot")
  const policy = value as Partial<IamRelayPolicy>
  if (
    policy.version !== "2.0.0" ||
    policy.iamOwnerCommit !== EXPECTED_IAM_COMMIT ||
    typeof policy.routes !== "object" || policy.routes === null ||
    !Array.isArray(policy.cookieNames) || !Array.isArray(policy.cookieNamePrefixes) ||
    policy.cookieNamePrefixes.length !== 2 ||
    typeof policy.cookiePaths !== "object" || policy.cookiePaths === null ||
    !Array.isArray(policy.responseHeaders) || !Array.isArray(policy.webInteractionPaths) ||
    policy.maxQueryBytes !== 8192 || policy.maxHeaderBytes !== 16384 ||
    policy.maxResponseBytes !== 1048576 || policy.maxDurationMs !== 5000
  ) {
    throw new Error("unsupported IAM relay policy snapshot")
  }
  for (const path of BROWSER_GET_PATHS) {
    if (!policy.routes[path]?.includes("GET")) throw new Error("IAM relay policy is missing a browser GET route")
  }
  return policy as IamRelayPolicy
}

export const IAM_RELAY_POLICY = validateIamRelayPolicySnapshot(policySnapshot)

export type BrowserIamGet = Readonly<{ relativePath: string; query: string }>

function validVerifyEmailQuery(query: string): boolean {
  if (!query.startsWith("?")) return false
  let tokenCount = 0
  let callbackCount = 0
  for (const pair of query.slice(1).split("&")) {
    const separator = pair.indexOf("=")
    if (separator < 1) return false
    const name = pair.slice(0, separator)
    if (name === "token") {
      tokenCount += 1
      if (pair.slice(separator + 1) === "") return false
    } else if (name === "callbackURL") {
      callbackCount += 1
    } else {
      return false
    }
    if (tokenCount > 1 || callbackCount > 1) return false
  }
  return tokenCount === 1
}

export function resolveBrowserIamGet(rawTarget: string, method: string): BrowserIamGet | null {
  if (
    method !== "GET" || !rawTarget.startsWith("/iam/") || rawTarget.startsWith("//") ||
    rawTarget.includes("#") || /[\\\u0000-\u001f\u007f]/u.test(rawTarget)
  ) return null
  const question = rawTarget.indexOf("?")
  const path = question < 0 ? rawTarget : rawTarget.slice(0, question)
  const query = question < 0 ? "" : rawTarget.slice(question)
  if (
    Buffer.byteLength(query) > IAM_RELAY_POLICY.maxQueryBytes || /%(?![0-9a-fA-F]{2})/u.test(query) ||
    path.includes("%") || path.includes("//") || path.includes("/./") || path.includes("/../") || path.endsWith("/")
  ) return null
  const relativePath = path.slice("/iam".length)
  if (!BROWSER_GET_PATHS.has(relativePath) || !IAM_RELAY_POLICY.routes[relativePath]?.includes("GET")) return null
  if (relativePath === "/verify-email" && !validVerifyEmailQuery(query)) return null
  return { relativePath, query }
}

function allowedCookieName(name: string, secure: boolean): boolean {
  const prefix = IAM_RELAY_POLICY.cookieNamePrefixes[secure ? 1 : 0]
  if (prefix === undefined || !name.startsWith(prefix)) return false
  return IAM_RELAY_POLICY.cookieNames.includes(name.slice(prefix.length))
}

export function filterIssuerCookies(raw: string | null, secure: boolean, includeLogoutConfirmation = false): string | null {
  if (raw === null || raw === "") return ""
  const seen = new Set<string>()
  const kept: string[] = []
  for (const part of raw.split(";")) {
    const pair = part.trim()
    const separator = pair.indexOf("=")
    if (separator < 1 || /[\u0000-\u001f\u007f]/u.test(pair)) return null
    const name = pair.slice(0, separator)
    if (!allowedCookieName(name, secure)) continue
    if (seen.has(name)) return null
    seen.add(name)
    if (name.endsWith(".oauth_logout_confirmation") && !includeLogoutConfirmation) continue
    kept.push(pair)
  }
  return kept.join("; ")
}

export function isAllowedIssuerCookieName(name: string, secure: boolean): boolean {
  return allowedCookieName(name, secure)
}
