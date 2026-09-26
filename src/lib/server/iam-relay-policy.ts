import policySnapshot from "@/generated/iam-relay-policy.json"

export const IAM_RELAY_POLICY_PROVENANCE = Object.freeze({
  ownerRepository: "kokoro-bff",
  ownerCommit: "1105553cfc24d4f44a90f626132bc30323a77946",
  policySha256: "8f7d4f4cb6fa0ec34d2cce8702d8882d3270a316a6cbdb2d8bdaccefb9c6b4a1",
})

export type IamRelayPolicy = Readonly<{
  version: string
  iamOwnerCommit: string
  iamAllowlistSha256: string
  iamSnapshotSha256: string
  iamOpenapiPath: string
  iamOpenapiVersion: string
  iamOpenapiSha256: string
  routes: Readonly<Record<string, readonly string[]>>
  invitationRoutes: readonly Readonly<{
    template: string
    methods: readonly string[]
    operationId: string
    owner: string
    visibility: string
    stability: string
    idempotency: string
  }>[]
  invitationSignUp: Readonly<{
    route: string
    method: string
    bodyFields: readonly string[]
    callbackPath: string
    callbackQueryParameter: string
  }>
  invitationLocation: Readonly<{
    sourceRoute: string
    path: string
    queryParameter: string
    valueFormat: string
    errorQueryParameter: string
    allowedErrorCodes: readonly string[]
  }>
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

const EXPECTED_IAM_COMMIT = "a4c2b61467f1fc1772d6b6d8e98f081c090289fb"
const EXPECTED_INVITATION_ROUTES = [
  ["/v1/tenants/{tenant_id}/invitations/{invitation_id}/context", "GET", "getTenantInvitationContext"],
  ["/v1/tenants/{tenant_id}/invitations/{invitation_id}/accept", "POST", "acceptTenantInvitation"],
  ["/v1/tenants/{tenant_id}/invitations/{invitation_id}/reject", "POST", "rejectTenantInvitation"],
] as const
const EXPECTED_INVITATION_ERRORS = ["TOKEN_EXPIRED", "INVALID_TOKEN", "USER_NOT_FOUND", "INVALID_USER"] as const
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
    policy.version !== "2.1.0" ||
    policy.iamOwnerCommit !== EXPECTED_IAM_COMMIT ||
    policy.iamOpenapiPath !== "contract/openapi/iam.internal.v1.json" ||
    policy.iamOpenapiVersion !== "0.6.0" ||
    policy.iamOpenapiSha256 !== "392ca0e49544c0ec6e0d2fa782c46c33c1847e2c350102e7ad3b8af43f858ced" ||
    !Array.isArray(policy.invitationRoutes) || policy.invitationRoutes.length !== 3 ||
    !policy.invitationSignUp || !policy.invitationLocation ||
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
  if (JSON.stringify(policy.routes["/sign-up/email"]) !== '["POST"]' ||
    policy.invitationSignUp.route !== "/sign-up/email" || policy.invitationSignUp.method !== "POST" ||
    JSON.stringify(policy.invitationSignUp.bodyFields) !== '["callbackURL","email","name","password"]' ||
    policy.invitationSignUp.callbackPath !== "/iam/interactions/invitation" ||
    policy.invitationSignUp.callbackQueryParameter !== "id" ||
    policy.invitationLocation.sourceRoute !== "/verify-email" ||
    policy.invitationLocation.path !== "/iam/interactions/invitation" ||
    policy.invitationLocation.queryParameter !== "id" ||
    policy.invitationLocation.valueFormat !== "canonical-lowercase-uuid" ||
    policy.invitationLocation.errorQueryParameter !== "error" ||
    JSON.stringify(policy.invitationLocation.allowedErrorCodes) !== JSON.stringify(EXPECTED_INVITATION_ERRORS) ||
    !policy.invitationRoutes.every((route, index) => {
      const expected = EXPECTED_INVITATION_ROUTES[index]
      return expected !== undefined && route.template === expected[0] &&
        JSON.stringify(route.methods) === JSON.stringify([expected[1]]) && route.operationId === expected[2] &&
        route.owner === "kokoro-iam" && route.visibility === "browser-private" &&
        route.stability === "stable" && route.idempotency === "none"
    })) throw new Error("IAM relay invitation policy is invalid")
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
