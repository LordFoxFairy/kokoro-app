import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target"

export const IAM_SIGN_IN_PATH = "/auth/sign-in"

const NATIVE_SIGN_IN_MARKER = "1"

/** Build the only first-party native sign-in query emitted by the product login start. */
export function nativeIamSignInQuery(target: ProductReturnTarget): string {
  return `?native=${NATIVE_SIGN_IN_MARKER}&return_to=${encodeURIComponent(target)}`
}

/** Parse a server-created native login query without accepting OAuth protocol fields. */
export function nativeIamSignInTarget(query: string): ProductReturnTarget | null {
  let params: URLSearchParams
  try { params = new URLSearchParams(query) } catch { return null }
  const keys = [...params.keys()].sort()
  if (keys.join(",") !== "native,return_to" || params.getAll("native").length !== 1 ||
    params.get("native") !== NATIVE_SIGN_IN_MARKER || params.getAll("return_to").length !== 1) return null
  const raw = params.get("return_to")
  if (raw === null) return null
  const target = parseProductReturnTarget(raw)
  return target !== null && target === raw ? target : null
}

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
