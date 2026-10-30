import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"

export const IAM_SIGN_IN_PATH = "/auth/sign-in"

/** Preserve the signed query bytes; URLSearchParams would normalize `%2B` and `+`. */
export function rawIamSignInQuery(absolute: string): string | null {
  const authorityStart = absolute.indexOf("://") + 3
  if (authorityStart < 3) return null
  const pathStart = absolute.indexOf("/", authorityStart)
  const target = pathStart < 0 ? "/" : absolute.slice(pathStart)
  if (!target.startsWith(`${IAM_SIGN_IN_PATH}?`) || target.includes("#")) return null
  const query = target.slice(IAM_SIGN_IN_PATH.length)
  if (
    query.length < 2 || Buffer.byteLength(query) > IAM_RELAY_POLICY.maxQueryBytes ||
    /[\u0000-\u001f\u007f\\]/u.test(query) || /%(?![0-9a-fA-F]{2})/u.test(query)
  ) return null
  return new URLSearchParams(query).has("flow") ? null : query
}

/** This early expiry check does not validate or normalize IAM's signed query. */
export function isIamSignInExpired(query: string): boolean {
  const expiration = new URLSearchParams(query).getAll("exp")
  return expiration.length === 1 && /^(0|[1-9][0-9]*)$/u.test(expiration[0] ?? "") &&
    Number(expiration[0]) <= Math.floor(Date.now() / 1_000)
}

/** Exact private form reference, never an IAM signed query. */
export function iamSignInFlowId(absolute: string): string | null {
  try {
    const url = new URL(absolute)
    if (url.pathname !== IAM_SIGN_IN_PATH || url.hash !== "") return null
    return /^\?flow=([A-Za-z0-9_-]{24})$/u.exec(url.search)?.[1] ?? null
  } catch { return null }
}
