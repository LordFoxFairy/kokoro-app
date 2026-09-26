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
  return query
}
