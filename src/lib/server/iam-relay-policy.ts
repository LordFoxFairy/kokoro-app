import policySnapshot from "@/generated/iam-relay-policy.json"

export const IAM_RELAY_POLICY_PROVENANCE = Object.freeze({
  ownerRepository: "kokoro-bff",
  ownerCommit: "cd1c2600ea2a6e0716b07628822a49653964675a",
  policySha256: "457909cd8c6ce77d59ca4cb929f22b439ebf00154256381a0cc3d6a32c2e8fb2",
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

const EXPECTED_IAM_COMMIT = "b838853a81ff34bd0f7a079ccc75ba6abd61d1ec"
const BROWSER_GET_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/jwks",
  "/oauth2/authorize",
  "/get-session",
  "/organization/list",
])

export function validateIamRelayPolicySnapshot(value: unknown): IamRelayPolicy {
  if (typeof value !== "object" || value === null) throw new Error("invalid IAM relay policy snapshot")
  const policy = value as Partial<IamRelayPolicy>
  if (
    policy.version !== "1.0.0" ||
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
  return { relativePath, query }
}

function allowedCookieName(name: string, secure: boolean): boolean {
  const prefix = IAM_RELAY_POLICY.cookieNamePrefixes[secure ? 1 : 0]
  if (prefix === undefined || !name.startsWith(prefix)) return false
  return IAM_RELAY_POLICY.cookieNames.includes(name.slice(prefix.length))
}

export function filterIssuerCookies(raw: string | null, secure: boolean): string | null {
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
    if (name.endsWith(".oauth_logout_confirmation")) continue
    kept.push(pair)
  }
  return kept.join("; ")
}

export function isAllowedIssuerCookieName(name: string, secure: boolean): boolean {
  return allowedCookieName(name, secure)
}
