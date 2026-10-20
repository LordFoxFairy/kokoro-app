import { createHash, timingSafeEqual } from "node:crypto"

/** Read only an unambiguous, authenticated Auth.js double-submit cookie. */
export function oidcCsrfToken(cookieHeader: string | null, secret: string): string | null {
  const cookies = (cookieHeader ?? "").split(";").map(part => part.trim())
    .filter(part => /^(?:__Host-)?next-auth\.csrf-token=/u.test(part))
  if (cookies.length !== 1) return null
  let value: string
  try { value = decodeURIComponent(cookies[0]!.slice(cookies[0]!.indexOf("=") + 1)) }
  catch { return null }
  const parts = value.split("|")
  const [token, digest] = parts
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/u.test(token ?? "") || !/^[a-f0-9]{64}$/u.test(digest ?? "")) return null
  const expected = createHash("sha256").update(`${token}${secret}`).digest("hex")
  return timingSafeEqual(Buffer.from(digest!), Buffer.from(expected)) ? token! : null
}
