import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { createClient } from "redis"

const TOKEN_TTL_SECONDS = 300
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u
const COOKIE_NAME = "kokoro_iam_csrf"

type Binding = Readonly<{
  redisUrl: string
  webOrigin: string
  path: "/auth/sign-in" | "/iam/interactions/consent" | "/iam/interactions/invitation"
  method: "GET" | "POST"
  query: string
  issuerCookie: string
  context?: string
}>

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Per-render proof: two cold renders of the same signed query never share a cookie. */
export function iamSignInCsrfCookieName(query: string, token: string | null): string | null {
  if (token === null || !TOKEN_PATTERN.test(token)) return null
  return `${COOKIE_NAME}_signin_${sha256(query).slice(0, 16)}_${sha256(token).slice(0, 32)}`
}

export function iamSignInCsrfWithinBudget(raw: string | null): boolean {
  if (raw === null) return true
  if (Buffer.byteLength(raw) > 12_288) return false
  const names = new Set<string>()
  for (const pair of raw.split(";")) {
    const name = pair.trim().split("=", 1)[0]!
    if (!name.startsWith(`${COOKIE_NAME}_signin_`)) continue
    if (names.has(name)) return false
    names.add(name)
  }
  return names.size < 4
}

export function iamCsrfKeyPrefix(webOrigin: string): string {
  return `kokoro:web:iam-csrf:${sha256(webOrigin)}:`
}

function bindingDigest(input: Binding): string {
  return sha256(JSON.stringify([input.path, input.method, input.query, input.issuerCookie, input.context ?? ""]))
}

function validRedisUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === "redis:" || parsed.protocol === "rediss:") && parsed.hostname !== "" && parsed.hash === ""
  } catch {
    return false
  }
}

async function withRedis<T>(url: string, operation: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  if (!validRedisUrl(url)) throw new Error("invalid Web CSRF Redis configuration")
  const client = createClient({ url, socket: { connectTimeout: 1_000, reconnectStrategy: false } })
  client.on("error", () => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        await client.connect()
        return operation(client)
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Web CSRF Redis deadline exceeded")), 2_000)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    client.destroy()
  }
}

export async function issueIamInteractionCsrf(input: Binding & Readonly<{ secureCookies: boolean; cookieName?: string }>): Promise<Readonly<{
  token: string
  cookie: string
}>> {
  const token = randomBytes(32).toString("base64url")
  const cookieName = input.path === "/auth/sign-in"
    ? iamSignInCsrfCookieName(input.query, token)!
    : input.cookieName ?? COOKIE_NAME
  if (input.path !== "/auth/sign-in" && !/^kokoro_iam_csrf(?:_invite_(?:signin|signup|accept|reject))?$/u.test(cookieName)) {
    throw new Error("invalid IAM interaction CSRF cookie name")
  }
  const key = `${iamCsrfKeyPrefix(input.webOrigin)}${sha256(token)}`
  const stored = await withRedis(input.redisUrl, (client) => client.set(key, bindingDigest(input), {
    EX: TOKEN_TTL_SECONDS,
    NX: true,
  }))
  if (stored !== "OK") throw new Error("Web CSRF nonce collision")
  return {
    token,
    cookie: `${cookieName}=${token}; Path=${input.path}; Max-Age=${TOKEN_TTL_SECONDS}; HttpOnly; SameSite=Lax${input.secureCookies ? "; Secure" : ""}`,
  }
}

export async function consumeIamInteractionCsrf(input: Binding & Readonly<{
  cookieToken: string | null
  formToken: string | null
}>): Promise<boolean> {
  if (
    input.cookieToken === null || input.formToken === null ||
    !TOKEN_PATTERN.test(input.cookieToken) || !TOKEN_PATTERN.test(input.formToken) ||
    !timingSafeEqual(Buffer.from(input.cookieToken), Buffer.from(input.formToken))
  ) return false
  const key = `${iamCsrfKeyPrefix(input.webOrigin)}${sha256(input.cookieToken)}`
  const expected = bindingDigest(input)
  if (input.path === "/auth/sign-in") {
    return withRedis(input.redisUrl, async (client) => {
      const stored = await client.get(key)
      if (stored === null || stored.length !== expected.length ||
        !timingSafeEqual(Buffer.from(stored), Buffer.from(expected))) return false
      const consumed = await client.eval(
        "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
        { keys: [key], arguments: [stored] },
      )
      return consumed === 1
    })
  }
  const stored = await withRedis(input.redisUrl, (client) => client.getDel(key))
  if (stored === null) return false
  return stored.length === expected.length && timingSafeEqual(Buffer.from(stored), Buffer.from(expected))
}

export function iamCsrfCookieName(): string {
  return COOKIE_NAME
}

export function clearIamCsrfCookie(path: Binding["path"], secureCookies: boolean, cookieName = COOKIE_NAME): string {
  return `${cookieName}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax${secureCookies ? "; Secure" : ""}`
}
