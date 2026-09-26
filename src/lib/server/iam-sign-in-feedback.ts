import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

const NAME = "kokoro_iam_signin_feedback"
const MAX_AGE_SECONDS = 90

export type SignInFeedback = Readonly<{ status: 401 | 429 | 503; email: string }>

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.from("kokoro-iam-signin-feedback-v1"), Buffer.from("cookie"), 32))
}

function associatedData(origin: string, query: string): Buffer {
  return Buffer.from(`${origin}\n${query}`)
}

function cookieAttributes(secure: boolean, age: number): string {
  return `Path=/auth/sign-in; Max-Age=${age}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}

export function issueSignInFeedback(input: Readonly<{
  secret: string; origin: string; query: string; secure: boolean; status: SignInFeedback["status"]; email: string
}>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(input.secret), iv)
  cipher.setAAD(associatedData(input.origin, input.query))
  const payload = Buffer.from(JSON.stringify({ status: input.status, email: input.email, expires: Date.now() + MAX_AGE_SECONDS * 1_000 }))
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")
  return `${NAME}=${value}; ${cookieAttributes(input.secure, MAX_AGE_SECONDS)}`
}

export function readSignInFeedback(input: Readonly<{
  cookie: string | null; secret: string; origin: string; query: string
}>): SignInFeedback | null {
  let value: string | null = null
  for (const part of input.cookie?.split(";") ?? []) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(`${NAME}=`)) continue
    if (value !== null) return null
    value = trimmed.slice(NAME.length + 1)
  }
  if (value === null || !/^[A-Za-z0-9_-]{40,1024}$/u.test(value)) return null
  try {
    const bytes = Buffer.from(value, "base64url")
    if (bytes.length < 29) return null
    const decipher = createDecipheriv("aes-256-gcm", key(input.secret), bytes.subarray(0, 12))
    decipher.setAAD(associatedData(input.origin, input.query))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const payload: unknown = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"))
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null
    const result = payload as Record<string, unknown>
    if (![401, 429, 503].includes(result.status as number) || typeof result.email !== "string" ||
      !/^[^\s@]{1,64}@[^\s@]{1,189}$/u.test(result.email) ||
      typeof result.expires !== "number" || !Number.isSafeInteger(result.expires) ||
      result.expires < Date.now() || result.expires > Date.now() + MAX_AGE_SECONDS * 1_000) return null
    return { status: result.status as SignInFeedback["status"], email: result.email }
  } catch {
    return null
  }
}

export function clearSignInFeedback(secure: boolean): string {
  return `${NAME}=; ${cookieAttributes(secure, 0)}`
}
