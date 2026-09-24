import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto"

import { createClient } from "redis"

const MAX_SESSION_SECONDS = 60 * 60
const RESERVATION_MS = 10_000
export const MAX_REFRESH_CREDENTIAL_BYTES = 8192

export function validRefreshCredential(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") > 0 &&
    Buffer.byteLength(value, "utf8") <= MAX_REFRESH_CREDENTIAL_BYTES
}

type Active = { state: "active"; generation: number; refresh: string; expiresAt: number }

function prefix(origin: string): string {
  return `kokoro:web:product-session:${createHash("sha256").update(origin).digest("hex")}:`
}

function keys(origin: string, id: string): [string, string] {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error("invalid Product Session ID")
  const base = `${prefix(origin)}${id}`
  return [base, `${base}:tombstone`]
}

function cryptoKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "kokoro-web-product-session", "refresh-at-rest-v1", 32))
}

function aad(origin: string, id: string, generation: number): Buffer {
  return Buffer.from(JSON.stringify(["kokoro-product-refresh-v1", origin, id, generation]), "utf8")
}

function encrypt(config: StoreConfig, id: string, generation: number, value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(config.secret), iv)
  cipher.setAAD(aad(config.webOrigin, id, generation))
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

function decrypt(config: StoreConfig, id: string, generation: number, value: string): string {
  const raw = Buffer.from(value, "base64url")
  if (raw.length < 29) throw new Error("invalid encrypted refresh")
  const decipher = createDecipheriv("aes-256-gcm", cryptoKey(config.secret), raw.subarray(0, 12))
  decipher.setAAD(aad(config.webOrigin, id, generation))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
}

async function withRedis<T>(url: string, operation: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const parsed = new URL(url)
  if (!["redis:", "rediss:"].includes(parsed.protocol) || !parsed.hostname || parsed.hash) throw new Error("invalid Web Redis URL")
  const client = createClient({ url, socket: { connectTimeout: 1_000, reconnectStrategy: false } })
  client.on("error", () => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => { await client.connect(); return operation(client) })(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Product Session Redis deadline")), 2_000) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    client.destroy()
  }
}

export type StoreConfig = Readonly<{ redisUrl: string; webOrigin: string; secret: string }>
export type SessionCandidate = Readonly<{ id: string; expiresAt: number }>

export function newSessionCandidate(): SessionCandidate {
  return { id: randomUUID(), expiresAt: Date.now() + MAX_SESSION_SECONDS * 1_000 }
}

export async function createSession(config: StoreConfig, refresh: string, candidate: SessionCandidate = newSessionCandidate()): Promise<SessionCandidate> {
  if (!validRefreshCredential(refresh)) throw new Error("invalid Product Session refresh credential")
  const { id, expiresAt } = candidate
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() ||
    expiresAt > Date.now() + MAX_SESSION_SECONDS * 1_000) throw new Error("invalid Product Session expiry")
  const [record, tombstone] = keys(config.webOrigin, id)
  const value: Active = { state: "active", generation: 0, refresh: encrypt(config, id, 0, refresh), expiresAt }
  const script = `if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
    return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) and 1 or 0`
  const stored = await withRedis(config.redisUrl, (client) => client.eval(script, { keys: [record, tombstone], arguments: [JSON.stringify(value), String(MAX_SESSION_SECONDS)] }))
  if (stored !== 1) throw new Error("Product Session collision")
  return { id, expiresAt }
}

export async function inspectSession(config: StoreConfig, id: string, generation: number): Promise<boolean> {
  const [record, tombstone] = keys(config.webOrigin, id)
  const script = `if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
    local raw=redis.call('GET', KEYS[1]); if not raw then return 0 end
    local v=cjson.decode(raw); if v.state ~= 'active' or v.generation ~= tonumber(ARGV[1]) or v.expiresAt <= tonumber(ARGV[2]) then return 0 end
    return 1`
  return (await withRedis(config.redisUrl, (client) => client.eval(script, { keys: [record, tombstone], arguments: [String(generation), String(Date.now())] }))) === 1
}

export async function reserveRefresh(config: StoreConfig, id: string, generation: number): Promise<{ reservation: string; refresh: string } | null> {
  const [record, tombstone] = keys(config.webOrigin, id)
  const reservation = randomUUID()
  const deadline = Date.now() + RESERVATION_MS
  const script = `if redis.call('EXISTS', KEYS[2]) == 1 then return nil end
    local raw=redis.call('GET', KEYS[1]); if not raw then return nil end
    local v=cjson.decode(raw); if v.state ~= 'active' or v.generation ~= tonumber(ARGV[1]) or v.expiresAt <= tonumber(ARGV[2]) then return nil end
    v.state='refreshing'; v.reservation=ARGV[3]; v.deadline=tonumber(ARGV[4]);
    redis.call('SET', KEYS[1], cjson.encode(v), 'KEEPTTL'); return v.refresh`
  const encrypted = await withRedis(config.redisUrl, (client) => client.eval(script, { keys: [record, tombstone], arguments: [String(generation), String(Date.now()), reservation, String(deadline)] }))
  if (typeof encrypted !== "string") return null
  try {
    const refresh = decrypt(config, id, generation, encrypted)
    if (!validRefreshCredential(refresh)) throw new Error("invalid Product Session refresh credential")
    return { reservation, refresh }
  } catch (error) {
    await invalidatePending(config, id, reservation).catch(() => undefined)
    throw error
  }
}

export async function finalizeRefresh(config: StoreConfig, id: string, generation: number, reservation: string, refresh: string): Promise<boolean> {
  if (!validRefreshCredential(refresh)) throw new Error("invalid Product Session refresh credential")
  const [record, tombstone] = keys(config.webOrigin, id)
  const script = `if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
    local raw=redis.call('GET', KEYS[1]); if not raw then return 0 end
    local v=cjson.decode(raw); if v.state ~= 'refreshing' or v.generation ~= tonumber(ARGV[1]) or v.reservation ~= ARGV[2] or v.deadline <= tonumber(ARGV[3]) then return 0 end
    v.state='active'; v.generation=v.generation+1; v.refresh=ARGV[4]; v.reservation=nil; v.deadline=nil;
    redis.call('SET', KEYS[1], cjson.encode(v), 'KEEPTTL'); return 1`
  return (await withRedis(config.redisUrl, (client) => client.eval(script, { keys: [record, tombstone], arguments: [String(generation), reservation, String(Date.now()), encrypt(config, id, generation + 1, refresh)] }))) === 1
}

export async function invalidatePending(config: StoreConfig, id: string, reservation: string): Promise<void> {
  const [record, tombstone] = keys(config.webOrigin, id)
  const script = `local raw=redis.call('GET', KEYS[1]); if not raw then return 0 end
    local v=cjson.decode(raw); if v.state ~= 'refreshing' or v.reservation ~= ARGV[1] then return 0 end
    redis.call('SET', KEYS[2], '1', 'EX', ARGV[2], 'NX'); redis.call('DEL', KEYS[1]); return 1`
  await withRedis(config.redisUrl, (client) => client.eval(script, { keys: [record, tombstone], arguments: [reservation, String(MAX_SESSION_SECONDS + 60)] }))
}

export async function tombstoneSession(config: StoreConfig, id: string, expectedGeneration: number): Promise<{ status: "active" | "pending" | "missing" | "repeat" | "stale"; refresh?: string }> {
  const [record, tombstone] = keys(config.webOrigin, id)
  const script = `if redis.call('EXISTS', KEYS[2]) == 1 then return {'repeat'} end
    local raw=redis.call('GET', KEYS[1]);
    local v=nil
    if raw then
      v=cjson.decode(raw)
      if v.generation ~= tonumber(ARGV[2]) then return {'stale'} end
    end
    redis.call('SET', KEYS[2], '1', 'EX', ARGV[1], 'NX'); redis.call('DEL', KEYS[1]);
    if not raw then return {'missing'} end
    if v.state == 'active' then return {'active', v.refresh, tostring(v.generation)} end
    return {'pending'}`
  const result = await withRedis(config.redisUrl, (client) => client.eval(script, { keys: [record, tombstone], arguments: [String(MAX_SESSION_SECONDS + 60), String(expectedGeneration)] }))
  if (!Array.isArray(result)) throw new Error("invalid tombstone result")
  const status = result[0]
  if (status === "active" && typeof result[1] === "string" && typeof result[2] === "string") {
    return { status, refresh: decrypt(config, id, Number(result[2]), result[1]) }
  }
  if (status === "pending" || status === "missing" || status === "repeat" || status === "stale") return { status }
  throw new Error("invalid tombstone result")
}
