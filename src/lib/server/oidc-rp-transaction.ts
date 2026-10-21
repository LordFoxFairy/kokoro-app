import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { createClient } from "redis"

import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target"
import { oidcProofCookieNames, validOidcNamespace, type OidcCookieNamespaces } from "./oidc-transaction-cookies"

const STATE_TTL_SECONDS = 300
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u
export type OidcTransaction = OidcCookieNamespaces & Readonly<{ target: ProductReturnTarget }>

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function oidcStateKeyPrefix(webOrigin: string): string {
  return `kokoro:web:oidc-state:${digest(webOrigin)}:`
}

function cookieBinding(source: string, setCookie: boolean, secureCookies: boolean, namespace: string): string | null {
  const names = oidcProofCookieNames(secureCookies, namespace)
  const found = new Map<string, string>()
  for (const raw of source.split(setCookie ? "\n" : ";")) {
    const pair = (setCookie ? raw.split(";", 1)[0] : raw)?.trim() ?? ""
    const separator = pair.indexOf("=")
    if (separator < 1) continue
    const name = pair.slice(0, separator)
    const canonical = names.find((candidate) => name === candidate)
    if (canonical === undefined) continue
    if (found.has(canonical)) return null
    const value = pair.slice(separator + 1)
    if (value.length < 16 || value.length > 4096 || !/^[A-Za-z0-9._~%-]+$/u.test(value)) return null
    found.set(canonical, value)
  }
  if (found.size !== names.length) return null
  return digest(JSON.stringify(names.map((name) => found.get(name))))
}

function key(webOrigin: string, state: string): string | null {
  return STATE_PATTERN.test(state) ? `${oidcStateKeyPrefix(webOrigin)}${digest(state)}` : null
}

function validRedisUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return (url.protocol === "redis:" || url.protocol === "rediss:") && url.hostname !== "" && url.hash === ""
  } catch {
    return false
  }
}

async function withRedis<T>(url: string, operation: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  if (!validRedisUrl(url)) throw new Error("invalid Web RP Redis configuration")
  const client = createClient({ url, socket: { connectTimeout: 1_000, reconnectStrategy: false } })
  client.on("error", () => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => { await client.connect(); return operation(client) })(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Web RP Redis deadline exceeded")), 2_000) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    client.destroy()
  }
}

const RECORD_VERSION = "product-return-v2"
const HEX_DIGEST = /^[a-f0-9]{64}$/u

function returnMac(secret: string, webOrigin: string, state: string, namespaces: OidcCookieNamespaces, binding: string, target: ProductReturnTarget): string {
  return createHmac("sha256", secret).update(JSON.stringify([
    RECORD_VERSION, "kokoro-iam", `${webOrigin}/api/auth/callback/kokoro-iam`, state,
    namespaces.handoffNamespace, namespaces.oidcNamespace, binding, target,
  ])).digest("hex")
}

export async function issueOidcState(input: Readonly<{
  redisUrl: string
  secureCookies: boolean
  webOrigin: string
  authSecret: string
  state: string
  setCookies: readonly string[]
  target: ProductReturnTarget
  handoffNamespace: string
  oidcNamespace: string
}>): Promise<void> {
  const redisKey = key(input.webOrigin, input.state)
  if (!validOidcNamespace(input.handoffNamespace) || !validOidcNamespace(input.oidcNamespace)) throw new Error("invalid RP namespace")
  const binding = cookieBinding(input.setCookies.join("\n"), true, input.secureCookies, input.oidcNamespace)
  const target = parseProductReturnTarget(input.target)
  if (redisKey === null || binding === null || input.authSecret.length < 32 || target === null || target !== input.target) throw new Error("invalid RP transaction")
  const value = JSON.stringify([RECORD_VERSION, target, input.handoffNamespace, input.oidcNamespace, binding, returnMac(input.authSecret, input.webOrigin, input.state, input, binding, target)])
  const stored = await withRedis(input.redisUrl, (client) => client.set(redisKey, value, { EX: STATE_TTL_SECONDS, NX: true }))
  if (stored !== "OK") throw new Error("RP state collision")
}

export async function consumeOidcState(input: Readonly<{
  redisUrl: string
  secureCookies: boolean
  webOrigin: string
  authSecret: string
  state: string
  cookieHeader: string | null
}>): Promise<OidcTransaction | null> {
  const redisKey = key(input.webOrigin, input.state)
  if (redisKey === null || input.authSecret.length < 32) return null
  return withRedis(input.redisUrl, async (client) => {
    const stored = await client.get(redisKey)
    if (stored === null || stored.length > 2400) return null
    let value: unknown
    try { value = JSON.parse(stored) } catch { return null }
    if (!Array.isArray(value) || value.length !== 6 || value[0] !== RECORD_VERSION
      || typeof value[1] !== "string" || !validOidcNamespace(value[2]) || !validOidcNamespace(value[3])
      || typeof value[4] !== "string" || typeof value[5] !== "string"
      || !HEX_DIGEST.test(value[4]) || !HEX_DIGEST.test(value[5])) return null
    const target = parseProductReturnTarget(value[1])
    if (target === null || target !== value[1]) return null
    const namespaces = { handoffNamespace: value[2], oidcNamespace: value[3] }
    const mac = returnMac(input.authSecret, input.webOrigin, input.state, namespaces, value[4], target)
    if (!timingSafeEqual(Buffer.from(value[5]), Buffer.from(mac))) return null
    const binding = cookieBinding(input.cookieHeader ?? "", false, input.secureCookies, namespaces.oidcNamespace)
    if (binding === null || !timingSafeEqual(Buffer.from(value[4]), Buffer.from(binding))) return null
    // Only the callback that proved this exact record may consume it. A stale
    // tab must not burn the original state, and concurrent valid callbacks
    // must still admit at most one exchange.
    const consumed = await client.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0',
      { keys: [redisKey], arguments: [stored] },
    )
    return consumed === 1 ? { ...namespaces, target } : null
  })
}
