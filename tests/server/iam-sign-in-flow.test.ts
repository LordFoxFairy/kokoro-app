import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import { createClient } from "redis"

import { createIamSignInFlow, readIamSignInFlow, retireIamSignInFlow, iamSignInFlowKeyPrefix, iamSignInFlowCookieName } from "@/lib/server/iam-sign-in-flow"

const redisUrl = process.env.KOKORO_WEB_REDIS_URL ?? "redis://127.0.0.1:6379"
const webOrigin = `http://signin-flow-${randomUUID()}.localhost:3000`
const keys = new Set<string>()
async function redis<T>(operation: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url: redisUrl, socket: { connectTimeout: 1_000, reconnectStrategy: false } })
  client.on("error", () => undefined)
  try { await client.connect(); return await operation(client) } finally { client.destroy() }
}
async function create(query = "?sig=%2BAb+cd&scope=openid+profile", cookie: string | null = null) {
  const result = await createIamSignInFlow({ redisUrl, webOrigin, query, cookie, secureCookies: true })
  keys.add(`${iamSignInFlowKeyPrefix(webOrigin)}${result.id}`)
  return { ...result, browserCookie: result.cookie.split(";", 1)[0]! }
}
afterAll(async () => { if (keys.size) await redis(client => client.del([...keys])) })

describe("browser-bound short sign-in flow", () => {
  it("keeps exact signed bytes server-side and requires a distinct browser proof", async () => {
    const query = "?sig=%2BAb+cd&scope=openid+profile&scope=email"
    const flow = await create(query)
    expect(flow.id).toMatch(/^[A-Za-z0-9_-]{24}$/u)
    expect(flow.path).toBe(`/auth/sign-in?flow=${flow.id}`)
    expect(flow.cookie).toContain("HttpOnly; SameSite=Lax; Secure")
    expect(flow.cookie).not.toContain(query)
    const input = { redisUrl, webOrigin, flowId: flow.id, cookie: flow.browserCookie }
    expect(await readIamSignInFlow(input)).toEqual({ query, expiresAt: flow.expiresAt })
    expect(await readIamSignInFlow({ ...input, cookie: null })).toBeNull()
    expect(await readIamSignInFlow({ ...input, cookie: `${iamSignInFlowCookieName(flow.id)}=${"x".repeat(43)}` })).toBeNull()
    expect(await readIamSignInFlow({ ...input, cookie: `${flow.browserCookie}; ${flow.browserCookie}` })).toBeNull()
    expect(await readIamSignInFlow({ ...input, webOrigin: "https://another.example" })).toBeNull()
    const raw = await redis(client => client.get(`${iamSignInFlowKeyPrefix(webOrigin)}${flow.id}`))
    expect(raw).not.toContain(flow.browserCookie.split("=", 2)[1])
  })

  it("does not prolong the original expiration when reading or refreshing", async () => {
    const exp = Math.floor(Date.now() / 1_000) + 100
    const flow = await create(`?sig=one&exp=${exp}`)
    const key = `${iamSignInFlowKeyPrefix(webOrigin)}${flow.id}`
    expect(flow.expiresAt).toBe(exp * 1_000)
    await redis(client => client.pExpire(key, 50_000))
    expect(await readIamSignInFlow({ redisUrl, webOrigin, flowId: flow.id, cookie: flow.browserCookie })).not.toBeNull()
    expect(await redis(client => client.pTTL(key))).toBeLessThanOrEqual(50_000)
  })

  it.each(["?exp=0&sig=x", "?exp=1&exp=2&sig=x", "?exp=01&sig=x", "?flow=abc", "?sig=x&flow=abc"])("rejects expired or ambiguous input %s", async query => {
    await expect(create(query)).rejects.toThrow()
  })

  it("validates before CAS deletion and retires at most once", async () => {
    const flow = await create()
    const input = { redisUrl, webOrigin, flowId: flow.id, cookie: flow.browserCookie }
    expect(await retireIamSignInFlow({ ...input, cookie: null })).toBe(false)
    expect(await readIamSignInFlow(input)).not.toBeNull()
    expect((await Promise.all([retireIamSignInFlow(input), retireIamSignInFlow(input)])).sort()).toEqual([false, true])
    expect(await readIamSignInFlow(input)).toBeNull()
  })

  it("isolates two tabs even for byte-identical protocol queries", async () => {
    const a = await create(); const b = await create()
    expect(a.id).not.toBe(b.id)
    const cookies = `${a.browserCookie}; ${b.browserCookie}`
    expect(await retireIamSignInFlow({ redisUrl, webOrigin, flowId: a.id, cookie: cookies })).toBe(true)
    expect(await readIamSignInFlow({ redisUrl, webOrigin, flowId: b.id, cookie: cookies })).not.toBeNull()
  })

  it("rejects corrupted records without deleting them or returning their query", async () => {
    const flow = await create()
    const key = `${iamSignInFlowKeyPrefix(webOrigin)}${flow.id}`
    const raw = await redis(client => client.get(key))
    const corrupted = JSON.stringify({ ...JSON.parse(raw!), extra: true })
    await redis(client => client.set(key, corrupted, { EX: 30 }))
    const input = { redisUrl, webOrigin, flowId: flow.id, cookie: flow.browserCookie }
    expect(await readIamSignInFlow(input)).toBeNull()
    expect(await retireIamSignInFlow(input)).toBe(false)
    expect(await redis(client => client.get(key))).toBe(corrupted)
  })

  it("bounds allocation without evicting other browser flows", async () => {
    const existing = await Promise.all([create(), create(), create(), create()])
    const cookies = existing.map(flow => flow.browserCookie).join("; ")
    await expect(create("?sig=new", cookies)).rejects.toThrow("budget")
    for (const flow of existing) expect(await readIamSignInFlow({ redisUrl, webOrigin, flowId: flow.id, cookie: cookies })).not.toBeNull()
  })

  it("fails closed on unavailable storage and rejects malformed flow references", async () => {
    await expect(createIamSignInFlow({ redisUrl: "invalid", webOrigin, query: "?sig=x", cookie: null, secureCookies: false })).rejects.toThrow()
    expect(await readIamSignInFlow({ redisUrl: "invalid", webOrigin, flowId: "../bad", cookie: null })).toBeNull()
  })
})


it.each(["?flow=" + "a".repeat(24), "?%66low=" + "a".repeat(24), "?sig=one&flow=x", "?flow=x&flow=y"])("never accepts a flow reference as a native OAuth query: %s", async query => {
  const { rawIamSignInQuery } = await import("@/lib/server/iam-sign-in-target")
  expect(rawIamSignInQuery(`https://web.test/auth/sign-in${query}`)).toBeNull()
})
