import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { withIamInteractionRedis } from "@/lib/server/iam-interaction-csrf"
import { IAM_RELAY_POLICY } from "@/lib/server/iam-relay-policy"
import { rawIamSignInQuery } from "@/lib/server/iam-sign-in-target"

const ID = /^[A-Za-z0-9_-]{24}$/u
const PROOF = /^[A-Za-z0-9_-]{43}$/u
const COOKIE_PREFIX = "kokoro_iam_signin_flow_"
const TTL_SECONDS = 300

type FlowInput = Readonly<{ redisUrl: string; webOrigin: string; flowId: string; cookie: string | null }>
type FlowRecord = Readonly<{ version: 1; query: string; proof_digest: string; expires_at: number }>

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function iamSignInFlowKeyPrefix(webOrigin: string): string {
  return `kokoro:web:iam-signin-flow:${digest(webOrigin)}:`
}

export function iamSignInFlowCookieName(id: string): string {
  if (!ID.test(id)) throw new Error("invalid sign-in flow reference")
  return `${COOKIE_PREFIX}${id}`
}

function attributes(secure: boolean, seconds: number): string {
  return `Path=/auth/sign-in; Max-Age=${seconds}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
}

export function clearIamSignInFlowCookie(id: string, secure: boolean): string {
  return `${iamSignInFlowCookieName(id)}=; ${attributes(secure, 0)}`
}

function browserProof(raw: string | null, id: string): string | null {
  let found: string | null = null
  const name = iamSignInFlowCookieName(id)
  for (const part of raw?.split(";") ?? []) {
    const pair = part.trim()
    if (!pair.startsWith(`${name}=`)) continue
    if (found !== null) return null
    found = pair.slice(name.length + 1)
  }
  return found !== null && PROOF.test(found) ? found : null
}

export function iamSignInFlowWithinBudget(raw: string | null): boolean {
  if (raw === null) return true
  if (Buffer.byteLength(raw) > 12_288) return false
  const names = new Set<string>()
  for (const part of raw.split(";")) {
    const name = part.trim().split("=", 1)[0]!
    if (!name.startsWith(COOKIE_PREFIX)) continue
    if (names.has(name)) return false
    names.add(name)
  }
  return names.size < 4
}

function validProtocolQuery(query: string): boolean {
  return rawIamSignInQuery(`https://internal.invalid/auth/sign-in${query}`) === query &&
    !new URLSearchParams(query).has("flow")
}

function deadline(query: string): number {
  if (!validProtocolQuery(query)) throw new Error("invalid sign-in protocol query")
  const values = new URLSearchParams(query).getAll("exp")
  const cap = Math.floor(Date.now() / 1_000) + TTL_SECONDS
  if (values.length === 0) return cap * 1_000
  const value = values[0]!
  if (values.length !== 1 || !/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("invalid sign-in expiration")
  }
  return Math.min(cap, Number(value)) * 1_000
}

export async function createIamSignInFlow(input: Readonly<{
  redisUrl: string; webOrigin: string; query: string; cookie: string | null; secureCookies: boolean
}>): Promise<Readonly<{ id: string; path: string; cookie: string; expiresAt: number }>> {
  if (!iamSignInFlowWithinBudget(input.cookie)) throw new Error("sign-in flow budget exceeded")
  const expiresAt = deadline(input.query)
  const ttl = Math.floor((expiresAt - Date.now()) / 1_000)
  if (ttl <= 0) throw new Error("expired sign-in query")
  const id = randomBytes(18).toString("base64url")
  const proof = randomBytes(32).toString("base64url")
  const record: FlowRecord = { version: 1, query: input.query, proof_digest: digest(proof), expires_at: expiresAt }
  const stored = await withIamInteractionRedis(input.redisUrl, client => client.set(
    `${iamSignInFlowKeyPrefix(input.webOrigin)}${id}`, JSON.stringify(record), { EX: ttl, NX: true },
  ))
  if (stored !== "OK") throw new Error("sign-in flow collision")
  return { id, path: `/auth/sign-in?flow=${id}`, expiresAt,
    cookie: `${iamSignInFlowCookieName(id)}=${proof}; ${attributes(input.secureCookies, ttl)}` }
}

function parseRecord(raw: string, proof: string): FlowRecord | null {
  if (Buffer.byteLength(raw) > IAM_RELAY_POLICY.maxQueryBytes * 6 + 512) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null
    const fields = value as Record<string, unknown>
    if (Object.keys(fields).sort().join(",") !== "expires_at,proof_digest,query,version" ||
      fields.version !== 1 || typeof fields.query !== "string" || !validProtocolQuery(fields.query) ||
      typeof fields.proof_digest !== "string" || !/^[a-f0-9]{64}$/u.test(fields.proof_digest) ||
      typeof fields.expires_at !== "number" || !Number.isSafeInteger(fields.expires_at) || fields.expires_at <= Date.now()) return null
    if (!timingSafeEqual(Buffer.from(fields.proof_digest), Buffer.from(digest(proof)))) return null
    return { version: 1, query: fields.query, proof_digest: fields.proof_digest, expires_at: fields.expires_at }
  } catch { return null }
}

async function verifiedRecord(input: FlowInput): Promise<Readonly<{ key: string; raw: string; record: FlowRecord }> | null> {
  if (!ID.test(input.flowId)) return null
  const proof = browserProof(input.cookie, input.flowId)
  if (proof === null) return null
  const key = `${iamSignInFlowKeyPrefix(input.webOrigin)}${input.flowId}`
  const raw = await withIamInteractionRedis(input.redisUrl, client => client.get(key))
  if (raw === null) return null
  const record = parseRecord(raw, proof)
  return record === null ? null : { key, raw, record }
}

export async function readIamSignInFlow(input: FlowInput): Promise<Readonly<{ query: string; expiresAt: number }> | null> {
  const value = await verifiedRecord(input)
  return value === null ? null : { query: value.record.query, expiresAt: value.record.expires_at }
}

export async function retireIamSignInFlow(input: FlowInput): Promise<boolean> {
  const value = await verifiedRecord(input)
  if (value === null) return false
  return withIamInteractionRedis(input.redisUrl, async client => {
    const result = await client.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      { keys: [value.key], arguments: [value.raw] },
    )
    return result === 1
  })
}
