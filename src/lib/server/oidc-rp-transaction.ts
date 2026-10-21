import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { createClient } from "redis"

import { parseProductReturnTarget, type ProductReturnTarget } from "@/lib/product-return-target"

const STATE_TTL_SECONDS = 300
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u
const RP_COOKIE_NAMES = ["next-auth.state", "next-auth.pkce.code_verifier", "next-auth.nonce"] as const

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function oidcStateKeyPrefix(webOrigin: string): string {
  return `kokoro:web:oidc-state:${digest(webOrigin)}:`
}

function cookieBinding(source: string, setCookie: boolean): string | null {
  const found = new Map<string, string>()
  for (const raw of source.split(setCookie ? "\n" : ";")) {
    const pair = (setCookie ? raw.split(";", 1)[0] : raw)?.trim() ?? ""
    const separator = pair.indexOf("=")
    if (separator < 1) continue
    const name = pair.slice(0, separator)
    const canonical = RP_COOKIE_NAMES.find((candidate) => name === candidate || name === `__Secure-${candidate}`)
    if (canonical === undefined) continue
    if (found.has(canonical)) return null
    const value = pair.slice(separator + 1)
    if (value.length < 16 || value.length > 4096 || !/^[A-Za-z0-9._~%-]+$/u.test(value)) return null
    found.set(canonical, value)
  }
  if (found.size !== RP_COOKIE_NAMES.length) return null
  return digest(JSON.stringify(RP_COOKIE_NAMES.map((name) => found.get(name))))
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

const RECORD_VERSION = "product-return-v1"
const HEX_DIGEST = /^[a-f0-9]{64}$/u

function returnMac(secret: string, webOrigin: string, binding: string, target: ProductReturnTarget): string {
  return createHmac("sha256", secret).update(JSON.stringify([
    RECORD_VERSION, "kokoro-iam", `${webOrigin}/api/auth/callback/kokoro-iam`, binding, target,
  ])).digest("hex")
}

export async function issueOidcState(input: Readonly<{
  redisUrl: string
  webOrigin: string
  authSecret: string
  state: string
  setCookies: readonly string[]
  target: ProductReturnTarget
}>): Promise<void> {
  const redisKey = key(input.webOrigin, input.state)
  const binding = cookieBinding(input.setCookies.join("\n"), true)
  const target = parseProductReturnTarget(input.target)
  if (redisKey === null || binding === null || input.authSecret.length < 32 || target === null || target !== input.target) throw new Error("invalid RP transaction")
  const value = JSON.stringify([RECORD_VERSION, target, binding, returnMac(input.authSecret, input.webOrigin, binding, target)])
  const stored = await withRedis(input.redisUrl, (client) => client.set(redisKey, value, { EX: STATE_TTL_SECONDS, NX: true }))
  if (stored !== "OK") throw new Error("RP state collision")
}

export async function consumeOidcState(input: Readonly<{
  redisUrl: string
  webOrigin: string
  authSecret: string
  state: string
  cookieHeader: string | null
}>): Promise<ProductReturnTarget | null> {
  const redisKey = key(input.webOrigin, input.state)
  const binding = cookieBinding(input.cookieHeader ?? "", false)
  if (redisKey === null || binding === null || input.authSecret.length < 32) return null
  return withRedis(input.redisUrl, async (client) => {
    const stored = await client.get(redisKey)
    if (stored === null || stored.length > 2400) return null
    let value: unknown
    try { value = JSON.parse(stored) } catch { return null }
    if (!Array.isArray(value) || value.length !== 4 || value[0] !== RECORD_VERSION
      || typeof value[1] !== "string" || typeof value[2] !== "string" || typeof value[3] !== "string"
      || !HEX_DIGEST.test(value[2]) || !HEX_DIGEST.test(value[3])) return null
    const target = parseProductReturnTarget(value[1])
    if (target === null || target !== value[1]) return null
    const mac = returnMac(input.authSecret, input.webOrigin, value[2], target)
    if (!timingSafeEqual(Buffer.from(value[3]), Buffer.from(mac))
      || !timingSafeEqual(Buffer.from(value[2]), Buffer.from(binding))) return null
    // Only the callback that proved this exact record may consume it. A stale
    // tab must not burn the original state, and concurrent valid callbacks
    // must still admit at most one exchange.
    const consumed = await client.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0',
      { keys: [redisKey], arguments: [stored] },
    )
    return consumed === 1 ? target : null
  })
}
