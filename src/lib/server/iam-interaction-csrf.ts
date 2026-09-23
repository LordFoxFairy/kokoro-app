import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { createClient } from "redis"

const TOKEN_TTL_SECONDS = 300
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u
const COOKIE_NAME = "kokoro_iam_csrf"

type Binding = Readonly<{
  redisUrl: string
  webOrigin: string
  path: "/auth/sign-in"
  method: "GET" | "POST"
  query: string
  issuerCookie: string
}>

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function iamCsrfKeyPrefix(webOrigin: string): string {
  return `kokoro:web:iam-csrf:${sha256(webOrigin)}:`
}

function bindingDigest(input: Binding): string {
  return sha256(JSON.stringify([input.path, input.method, input.query, input.issuerCookie]))
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

export async function issueIamInteractionCsrf(input: Binding & Readonly<{ secureCookies: boolean }>): Promise<Readonly<{
  token: string
  cookie: string
}>> {
  const token = randomBytes(32).toString("base64url")
  const key = `${iamCsrfKeyPrefix(input.webOrigin)}${sha256(token)}`
  const stored = await withRedis(input.redisUrl, (client) => client.set(key, bindingDigest(input), {
    EX: TOKEN_TTL_SECONDS,
    NX: true,
  }))
  if (stored !== "OK") throw new Error("Web CSRF nonce collision")
  return {
    token,
    cookie: `${COOKIE_NAME}=${token}; Path=${input.path}; Max-Age=${TOKEN_TTL_SECONDS}; HttpOnly; SameSite=Lax${input.secureCookies ? "; Secure" : ""}`,
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
  const stored = await withRedis(input.redisUrl, (client) => client.getDel(key))
  if (stored === null) return false
  return timingSafeEqual(Buffer.from(stored), Buffer.from(bindingDigest(input)))
}

export function iamCsrfCookieName(): string {
  return COOKIE_NAME
}

export function clearIamCsrfCookie(path: "/auth/sign-in", secureCookies: boolean): string {
  return `${COOKIE_NAME}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax${secureCookies ? "; Secure" : ""}`
}
