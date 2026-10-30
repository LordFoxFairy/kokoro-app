import { createHash } from "node:crypto"

import { createClient } from "redis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createSession, finalizeRefresh, inspectSession, inspectSessionState, reserveRefresh, tombstoneSession } from "@/lib/server/product-session-store"

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
    expect(await inspectSessionState(config, id, 0)).toBe("active")
    const [one, two] = await Promise.all([reserveRefresh(config, id, 0), reserveRefresh(config, id, 0)])
    expect([one, two].filter((item) => item !== null)).toHaveLength(1)
    expect([one, two].find((item) => item !== null)?.refresh).toBe("refresh-secret-do-not-leak")
    expect(await inspectSession(config, id, 0)).toBe(false)
    expect(await inspectSessionState(config, id, 0)).toBe("refreshing")
    const winner = one ?? two
    expect(winner).not.toBeNull()
    expect(await finalizeRefresh(config, id, 0, winner!.reservation, "rotated-refresh")).toBe(true)
    expect(await inspectSession(config, id, 0)).toBe(false)
    expect(await inspectSession(config, id, 1)).toBe(true)
    expect(await inspectSessionState(config, id, 0)).toBe("stale")
    expect(await inspectSessionState(config, id, 2)).toBe("stale")
    const taken = await tombstoneSession(config, id, 1)
    expect(taken).toEqual({ status: "active", refresh: "rotated-refresh" })
    expect(await inspectSessionState(config, id, 1)).toBe("absent")
    expect(await inspectSession(config, id, 1)).toBe(false)
    expect(await tombstoneSession(config, id, 1)).toEqual({ status: "repeat" })
  })

  it("does not steal an expired refresh reservation and treats damaged records as unavailable", async () => {
    const id = await newSession()
    await reserveRefresh(config, id, 0)
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    try {
      await client.connect()
      const pending = JSON.parse((await client.get(`${prefix}${id}`))!) as Record<string, unknown>
      await client.set(`${prefix}${id}`, JSON.stringify({ ...pending, deadline: Date.now() - 1 }), { KEEPTTL: true })
      expect(await inspectSessionState(config, id, 0)).toBe("unconfirmed")
      expect(await inspectSession(config, id, 0)).toBe(false)
      expect(await reserveRefresh(config, id, 0)).toBeNull()
      expect(await client.exists(`${prefix}${id}`)).toBe(1)
      await client.set(`${prefix}${id}`, JSON.stringify({ ...pending, state: "unexpected" }), { KEEPTTL: true })
      await expect(inspectSessionState(config, id, 0)).rejects.toThrow("invalid Product Session record")
    } finally { client.destroy() }
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

it("reproduces refresh admission401 at list entry and archive exit without admitting the old cookie", async () => {
  // Real RP cookies/Redis CAS and production GET adapters; only BFF business
  // content is a double. No issuer, Next server, or normal browser session.
  const { randomUUID } = await import("node:crypto")
  const { vi } = await import("vitest")
  // Match the Node crypto/JWT byte realm inside this server test's jsdom worker.
  vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor)
  const productBff = await import("@/lib/server/product-bff")
  const upstream = await import("@/lib/server/upstream-http")
  const { productSessionCookie } = await import("@/lib/server/product-session")
  const { GET } = await import("@/app/api/session/[...path]/route")
  const owned = { ...config, webOrigin: `http://auth-read-race-${randomUUID()}.fixture` }
  const candidate = await createSession(owned, "qa-only-refresh")
  const ownedKeys = [`${productSessionKeyPrefix(owned.webOrigin)}${candidate.id}`, `${productSessionKeyPrefix(owned.webOrigin)}${candidate.id}:tombstone`]
  const claims = { ...candidate, generation: 0, access: "qa-only-access", accessExpiresAt: Date.now() + 600_000, subject: "qa-read-race", issuerSessionId: "qa-only-issuer-session" }
  const cookie = async (generation: number) => (await productSessionCookie({ ...claims, generation }, owned.secret, owned.webOrigin)).split(";", 1)[0]!
  const read = (jar: string, archive = false) => {
    const path = archive ? ["sessions", "qa-read-race", "archive"] : ["sessions"]
    return GET(new Request(`${owned.webOrigin}/api/session/${path.join("/")}`, { headers: { host: new URL(owned.webOrigin).host, cookie: jar } }), { params: Promise.resolve({ path }) })
  }
  let release!: () => void
  const latch = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const atBff = new Promise<void>(resolve => { entered = resolve })
  let holdArchive = false
  const configuration = vi.spyOn(productBff, "productBffConfig").mockReturnValue({ bffBaseUrl: "http://bff.fixture", domain: "qa.fixture", internalSecret: null, session: owned })
  const business = vi.spyOn(upstream, "requestWithDomain").mockImplementation(async (url, _domain, options) => {
    expect(options.method).toBe("GET")
    const archive = String(url).endsWith("/archive")
    if (archive && holdArchive) { entered(); await latch }
    const requestId = new Headers(options.headers).get("x-kokoro-request-id")!
    return Response.json(archive ? { data: { session_id: "qa-read-race", archived_at: null } } : { data: [], meta: { request_id: requestId } }, { headers: { "cache-control": "no-store", "x-request-id": requestId } })
  })
  try {
    const oldCookie = await cookie(0)
    expect((await read(oldCookie)).status).toBe(200)
    const reserved = await reserveRefresh(owned, candidate.id, 0)
    expect(reserved).not.toBeNull()
    expect(await inspectSessionState(owned, candidate.id, 0)).toBe("refreshing")
    const duringRefresh = await read(oldCookie)
    expect(duringRefresh.status).toBe(401)
    expect(await duringRefresh.json()).toMatchObject({ error: { code: "unauthenticated" } })
    expect(business).toHaveBeenCalledTimes(1)
    expect(await finalizeRefresh(owned, candidate.id, 0, reserved!.reservation, "qa-only-rotated-refresh")).toBe(true)
    expect((await read(oldCookie)).status).toBe(401)
    expect(business).toHaveBeenCalledTimes(1)
    const currentCookie = await cookie(1)
    expect((await read(currentCookie)).status).toBe(200)

    holdArchive = true
    const pendingArchive = read(currentCookie, true)
    await atBff
    const next = await reserveRefresh(owned, candidate.id, 1)
    expect(next).not.toBeNull()
    expect(await finalizeRefresh(owned, candidate.id, 1, next!.reservation, "qa-only-final-refresh")).toBe(true)
    release()
    const retired = await pendingArchive
    expect(retired.status).toBe(401)
    expect(await retired.json()).toMatchObject({ error: { code: "session_invalid", retryable: false } })
    expect(business).toHaveBeenCalledTimes(3)
    const latestCookie = await cookie(2)
    expect((await read(latestCookie, true)).status).toBe(200)
    expect((await read(latestCookie)).status).toBe(200)
    expect(await tombstoneSession(owned, candidate.id, 2)).toMatchObject({ status: "active" })
    expect((await read(latestCookie)).status).toBe(401)
    expect(business).toHaveBeenCalledTimes(5)
  } finally {
    release()
    configuration.mockRestore()
    business.mockRestore()
    vi.unstubAllGlobals()
    const client = createClient({ url: redisUrl, socket: { connectTimeout: 500, reconnectStrategy: false } })
    client.on("error", () => undefined)
    try {
      await client.connect()
      await client.del(ownedKeys)
      expect(await client.exists(ownedKeys)).toBe(0)
    } finally { client.destroy() }
  }
})
