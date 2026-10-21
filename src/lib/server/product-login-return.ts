import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target"
import { OIDC_TRANSACTION_TTL_SECONDS, validOidcNamespace } from "./oidc-transaction-cookies"

const VERSION = "product-login-intent-v1"
export type ProductLoginIntent = Readonly<{ target: ProductReturnTarget; handoffNamespace: string }>

function mac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${VERSION}:${value}`).digest("hex")
}

export function issueProductLoginIntent(target: ProductReturnTarget, secret: string, origin: string): ProductLoginIntent & Readonly<{ intent: string }> {
  if (secret.length < 32 || parseProductReturnTarget(target) !== target || new URL(origin).origin !== origin) throw new Error("invalid login intent")
  const handoffNamespace = randomBytes(16).toString("base64url")
  const value = Buffer.from(JSON.stringify([VERSION, origin, Date.now() + OIDC_TRANSACTION_TTL_SECONDS * 1000, handoffNamespace, target])).toString("base64url")
  return { target, handoffNamespace, intent: `${value}.${mac(value, secret)}` }
}

export function readProductLoginIntent(raw: unknown, secret: string, origin: string): ProductLoginIntent | null {
  if (typeof raw !== "string" || raw.length > 4096 || secret.length < 32 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/u.test(raw)) return null
  const separator = raw.indexOf(".")
  const value = raw.slice(0, separator)
  if (!timingSafeEqual(Buffer.from(raw.slice(separator + 1)), Buffer.from(mac(value, secret)))) return null
  let record: unknown
  try { record = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) } catch { return null }
  if (!Array.isArray(record) || record.length !== 5 || record[0] !== VERSION || record[1] !== origin
    || !Number.isSafeInteger(record[2]) || record[2] <= Date.now() || record[2] > Date.now() + OIDC_TRANSACTION_TTL_SECONDS * 1000
    || !validOidcNamespace(record[3]) || typeof record[4] !== "string") return null
  const target = parseProductReturnTarget(record[4])
  return target !== null && target === record[4] ? { target, handoffNamespace: record[3] } : null
}
