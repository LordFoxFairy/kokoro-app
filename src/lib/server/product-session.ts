import { decode, encode } from "next-auth/jwt"

import { inspectSession, type StoreConfig } from "./product-session-store"

const COOKIE = "kokoro_product_session"
const SESSION_SECONDS = 60 * 60
export const MAX_ACCESS_CREDENTIAL_BYTES = 2048

export function validAccessCredential(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") > 0 &&
    Buffer.byteLength(value, "utf8") <= MAX_ACCESS_CREDENTIAL_BYTES
}

type ProductClaims = Readonly<{ id: string; generation: number; access: string; accessExpiresAt: number; expiresAt: number; subject: string }>

function validClaims(value: unknown): value is ProductClaims {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === "string" && /^[a-f0-9-]{36}$/u.test(v.id) &&
    typeof v.generation === "number" && Number.isSafeInteger(v.generation) && v.generation >= 0 &&
    validAccessCredential(v.access) &&
    typeof v.accessExpiresAt === "number" && Number.isFinite(v.accessExpiresAt) &&
    typeof v.expiresAt === "number" && Number.isFinite(v.expiresAt) &&
    typeof v.subject === "string" && v.subject.length > 0 && v.subject.length <= 256
}

function readCookie(request: Request): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`))
  return values.length === 1 ? values[0]!.slice(COOKIE.length + 1) : null
}

export async function decodeProductSession(request: Request, secret: string): Promise<ProductClaims | null> {
  try {
    const raw = readCookie(request)
    if (raw === null) return null
    const value = await decode({ token: raw, secret, salt: "kokoro-product-session-v1" })
    return validClaims(value) && value.expiresAt > Date.now() ? value : null
  } catch { return null }
}

export async function currentProductSession(request: Request, config: StoreConfig): Promise<ProductClaims | null> {
  const claims = await decodeProductSession(request, config.secret)
  if (claims === null) return null
  return await inspectSession(config, claims.id, claims.generation) ? claims : null
}

export async function productSessionCookie(claims: ProductClaims, secret: string, secure: boolean): Promise<string> {
  if (!validClaims(claims)) throw new Error("invalid Product Session claims")
  const maxAge = Math.max(0, Math.min(SESSION_SECONDS, Math.floor((claims.expiresAt - Date.now()) / 1000)))
  const value = await encode({ token: { ...claims }, secret, salt: "kokoro-product-session-v1", maxAge })
  const cookie = `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
  if (Buffer.byteLength(cookie, "utf8") > 4096) throw new Error("Product Session cookie too large")
  return cookie
}

export function clearProductSessionCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}

export type { ProductClaims }
