import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

import { createClient } from "redis"

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

export async function issueOidcState(input: Readonly<{
  redisUrl: string
  webOrigin: string
  state: string
  setCookies: readonly string[]
}>): Promise<void> {
  const redisKey = key(input.webOrigin, input.state)
  const binding = cookieBinding(input.setCookies.join("\n"), true)
  if (redisKey === null || binding === null) throw new Error("invalid RP transaction")
  const value = digest(JSON.stringify(["kokoro-iam", `${input.webOrigin}/api/auth/callback/kokoro-iam`, binding]))
  const stored = await withRedis(input.redisUrl, (client) => client.set(redisKey, value, { EX: STATE_TTL_SECONDS, NX: true }))
  if (stored !== "OK") throw new Error("RP state collision")
}

export async function consumeOidcState(input: Readonly<{
  redisUrl: string
  webOrigin: string
  state: string
  cookieHeader: string | null
}>): Promise<boolean> {
  const redisKey = key(input.webOrigin, input.state)
  const binding = cookieBinding(input.cookieHeader ?? "", false)
  if (redisKey === null || binding === null) return false
  const expected = digest(JSON.stringify(["kokoro-iam", `${input.webOrigin}/api/auth/callback/kokoro-iam`, binding]))
  const stored = await withRedis(input.redisUrl, (client) => client.getDel(redisKey))
  return stored !== null && stored.length === expected.length && timingSafeEqual(Buffer.from(stored), Buffer.from(expected))
}

export function rpCleanupCookies(secure: boolean): string[] {
  const prefix = secure ? "__Secure-" : ""
  return [...RP_COOKIE_NAMES, "next-auth.callback-url", "next-auth.session-token"].map((name) =>
    `${prefix}${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
  )
}
