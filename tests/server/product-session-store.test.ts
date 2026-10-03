import { createHash } from "node:crypto"

import { createClient } from "redis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createSession, finalizeRefresh, inspectSession, reserveRefresh, tombstoneSession } from "@/lib/server/product-session-store"

const redisUrl = process.env.KOKORO_WEB_REDIS_URL ?? "redis://127.0.0.1:6379/9"
const webOrigin = "http://product-session-store.fixture"
const secret = "product-session-store-test-key-at-least-32-bytes"
const config = { redisUrl, webOrigin, secret }
const ids: string[] = []
const prefix = `kokoro:web:product-session:${createHash("sha256").update(webOrigin).digest("hex")}:`
const otherOrigin = "http://other-product-session.fixture"
let resourceBaseline: Readonly<Record<"primary" | "other", ReadonlySet<string>>> | undefined

function productSessionKeyPrefix(origin: string): string {
  return `kokoro:web:product-session:${createHash("sha256").update(origin).digest("hex")}:`
}

async function ownedResourceKeys(): Promise<Record<"primary" | "other", Set<string>>> {
  const prefixes = { primary: prefix, other: productSessionKeyPrefix(otherOrigin) } as const
  const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
  client.on("error", () => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        await client.connect()
        const found = { primary: new Set<string>(), other: new Set<string>() }
        for (const kind of Object.keys(prefixes) as Array<keyof typeof prefixes>) {
          for await (const batch of client.scanIterator({ MATCH: `${prefixes[kind]}*`, COUNT: 100 })) {
            for (const key of batch) found[kind].add(key)
          }
        }
        return found
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Product Session test resource read deadline")), 2_000)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    client.destroy()
  }
}

beforeAll(async () => { resourceBaseline = await ownedResourceKeys() })

afterAll(async () => {
  const errors: unknown[] = []
  if (ids.length > 0) {
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        (async () => {
          await client.connect()
          await client.del(ids.flatMap((id) => [`${prefix}${id}`, `${prefix}${id}:tombstone`]))
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Product Session test cleanup deadline")), 2_000)
        }),
      ])
    } catch (error) { errors.push(error) }
    finally { if (timer !== undefined) clearTimeout(timer); client.destroy() }
  }
  try {
    if (resourceBaseline !== undefined) {
      const current = await ownedResourceKeys()
      for (const kind of ["primary", "other"] as const) {
        const count = [...current[kind]].filter((key) => !resourceBaseline?.[kind].has(key)).length
        if (count > 0) throw new Error(`Product Session test resource delta: kind=${kind} count=${count}`)
      }
    }
  } catch (error) { errors.push(error) }
  if (errors.length > 0) throw new AggregateError(errors, "Product Session test cleanup failed")
})

async function newSession(): Promise<string> {
  const { id } = await createSession(config, "refresh-secret-do-not-leak")
  ids.push(id)
  return id
}

describe("Product Session Redis double-CAS", () => {
  it("fails closed when the Product Session store is unreachable", async () => {
    await expect(createSession({ ...config, redisUrl: "redis://127.0.0.1:1/9" }, "refresh-secret"))
      .rejects.toThrow()
  })
  it("encrypts refresh in the record and admits only one cross-connection reservation", async () => {
    const id = await newSession()
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    try {
      await client.connect()
      const raw = await client.get(`${prefix}${id}`)
      expect(raw).not.toContain("refresh-secret-do-not-leak")
      expect(`${prefix}${id}`).not.toContain("refresh-secret-do-not-leak")
    } finally { client.destroy() }
    const [one, two] = await Promise.all([reserveRefresh(config, id, 0), reserveRefresh(config, id, 0)])
    expect([one, two].filter((item) => item !== null)).toHaveLength(1)
    expect([one, two].find((item) => item !== null)?.refresh).toBe("refresh-secret-do-not-leak")
    expect(await inspectSession(config, id, 0)).toBe(false)
    const winner = one ?? two
    expect(winner).not.toBeNull()
    expect(await finalizeRefresh(config, id, 0, winner!.reservation, "rotated-refresh")).toBe(true)
    expect(await inspectSession(config, id, 0)).toBe(false)
    expect(await inspectSession(config, id, 1)).toBe(true)
    const taken = await tombstoneSession(config, id, 1)
    expect(taken).toEqual({ status: "active", refresh: "rotated-refresh" })
    expect(await inspectSession(config, id, 1)).toBe(false)
    expect(await tombstoneSession(config, id, 1)).toEqual({ status: "repeat" })
  })

  it("tombstones pending without exposing or revoking its possibly stale refresh", async () => {
    const id = await newSession()
    const pending = await reserveRefresh(config, id, 0)
    expect(pending).not.toBeNull()
    expect(await tombstoneSession(config, id, 0)).toEqual({ status: "pending" })
    expect(await finalizeRefresh(config, id, 0, pending!.reservation, "late-rotated")).toBe(false)
    expect(await inspectSession(config, id, 0)).toBe(false)
    expect(await tombstoneSession(config, id, 0)).toEqual({ status: "repeat" })
  })

  it("binds encrypted refresh to origin, session ID and generation", async () => {
    const first = await newSession()
    const second = await newSession()
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    try {
      await client.connect()
      const firstRaw = await client.get(`${prefix}${first}`)
      const secondRaw = await client.get(`${prefix}${second}`)
      expect(firstRaw).not.toBeNull()
      expect(secondRaw).not.toBeNull()
      const firstValue = JSON.parse(firstRaw!) as { refresh: string }
      const secondValue = JSON.parse(secondRaw!) as { refresh: string }
      const otherPrefix = productSessionKeyPrefix(otherOrigin)
      const otherKey = `${otherPrefix}${first}`
      await client.set(otherKey, firstRaw!, { EX: 60 })
      try {
        await expect(reserveRefresh({ ...config, webOrigin: otherOrigin }, first, 0)).rejects.toThrow()
      } finally { await client.del([otherKey, `${otherKey}:tombstone`]) }
      await client.set(`${prefix}${second}`, JSON.stringify({ ...secondValue, refresh: firstValue.refresh }), { KEEPTTL: true })
      await expect(reserveRefresh(config, second, 0)).rejects.toThrow()
      expect(await client.exists(`${prefix}${second}`)).toBe(0)
      expect(await client.exists(`${prefix}${second}:tombstone`)).toBe(1)
      const firstReservation = await reserveRefresh(config, first, 0)
      expect(firstReservation).not.toBeNull()
      expect(await finalizeRefresh(config, first, 0, firstReservation!.reservation, "next-generation-refresh")).toBe(true)
      const rotatedRaw = await client.get(`${prefix}${first}`)
      const rotated = JSON.parse(rotatedRaw!) as { refresh: string }
      await client.set(`${prefix}${first}`, JSON.stringify({ ...rotated, refresh: firstValue.refresh }), { KEEPTTL: true })
      await expect(reserveRefresh(config, first, 1)).rejects.toThrow()
      expect(await client.exists(`${prefix}${first}`)).toBe(0)
      expect(await client.exists(`${prefix}${first}:tombstone`)).toBe(1)
    } finally { client.destroy() }
  })

  it("rejects an oversized rotated credential before committing the next generation", async () => {
    const id = await newSession()
    const reserved = await reserveRefresh(config, id, 0)
    expect(reserved).not.toBeNull()
    await expect(finalizeRefresh(config, id, 0, reserved!.reservation, "r".repeat(8193))).rejects.toThrow()
    expect(await inspectSession(config, id, 1)).toBe(false)
    expect(await tombstoneSession(config, id, 0)).toEqual({ status: "pending" })
  })

  it("leaves the old generation unusable if finalize committed but its ACK or new cookie was lost", async () => {
    const id = await newSession()
    const reserved = await reserveRefresh(config, id, 0)
    expect(reserved).not.toBeNull()
    // Model an ACK/cookie loss: commit in Redis, then intentionally discard the result.
    await finalizeRefresh(config, id, 0, reserved!.reservation, "new-refresh")
    expect(await inspectSession(config, id, 0)).toBe(false)
    expect(await inspectSession(config, id, 1)).toBe(true)
    // No second issuer refresh or previous-generation recovery; the orphan expires by record TTL.
  })

  it("does not let a stale generation tombstone or take the current rotated refresh", async () => {
    const id = await newSession()
    const reserved = await reserveRefresh(config, id, 0)
    expect(reserved).not.toBeNull()
    expect(await finalizeRefresh(config, id, 0, reserved!.reservation, "current-refresh")).toBe(true)
    expect(await tombstoneSession(config, id, 0)).toEqual({ status: "stale" })
    expect(await inspectSession(config, id, 1)).toBe(true)
    expect(await tombstoneSession(config, id, 1)).toEqual({ status: "active", refresh: "current-refresh" })
    expect(await inspectSession(config, id, 1)).toBe(false)
  })

  it("does not let a future generation tombstone a pending or active record", async () => {
    const id = await newSession()
    expect(await tombstoneSession(config, id, 1)).toEqual({ status: "stale" })
    expect(await inspectSession(config, id, 0)).toBe(true)
    const pending = await reserveRefresh(config, id, 0)
    expect(pending).not.toBeNull()
    expect(await tombstoneSession(config, id, 1)).toEqual({ status: "stale" })
    expect(await finalizeRefresh(config, id, 0, pending!.reservation, "current-refresh")).toBe(true)
    expect(await inspectSession(config, id, 1)).toBe(true)
  })
})
