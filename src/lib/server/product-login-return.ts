
import { createHmac, timingSafeEqual } from "node:crypto"

import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target"

const COOKIE_NAME = "kokoro_product_login_return"

function mac(encodedTarget: string, secret: string): string {
  return createHmac("sha256", secret).update(`product-login-return-v1:${encodedTarget}`).digest("hex")
}

function cookieValue(source: string | null): string | null {
  if (source === null) return null
  let found: string | null = null
  for (const part of source.split(";")) {
    const pair = part.trim()
    const separator = pair.indexOf("=")
    if (separator < 1) return null
    if (pair.slice(0, separator) !== COOKIE_NAME) continue
    if (found !== null) return null
    found = pair.slice(separator + 1)
  }
  return found
}

export function productLoginReturnTarget(cookieHeader: string | null, secret: string): ProductReturnTarget | null {
  const value = cookieValue(cookieHeader)
  if (value === null || !/^[A-Za-z0-9%._~-]{1,4096}\.[a-f0-9]{64}$/u.test(value)) return null
  const separator = value.lastIndexOf(".")
  const encodedTarget = value.slice(0, separator)
  const supplied = value.slice(separator + 1)
  const expected = mac(encodedTarget, secret)
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null
  try {
    const target = decodeURIComponent(encodedTarget)
    return parseProductReturnTarget(target) === target ? target as ProductReturnTarget : null
  } catch {
    return null
  }
}

export function productLoginReturnCookie(target: ProductReturnTarget, secret: string, secure: boolean): string {
  const encodedTarget = encodeURIComponent(target)
  return `${COOKIE_NAME}=${encodedTarget}.${mac(encodedTarget, secret)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}

export function clearProductLoginReturnCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}
