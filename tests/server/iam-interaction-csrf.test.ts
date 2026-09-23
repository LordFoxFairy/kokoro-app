import { createHash, randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "vitest"
import { createClient } from "redis"

import { consumeIamInteractionCsrf, iamCsrfKeyPrefix, issueIamInteractionCsrf } from "@/lib/server/iam-interaction-csrf"

const redisUrl = process.env.KOKORO_WEB_REDIS_URL ?? "redis://127.0.0.1:6379"
const webOrigin = `http://csrf-${randomUUID()}.localhost:3000`
const issuerCookie = "kokoro-issuer.session_data=bound"
const prefix = iamCsrfKeyPrefix(webOrigin)
const issuedTokens = new Set<string>()

async function withTestRedis<T>(url: string, operation: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url, socket: { connectTimeout: 500, reconnectStrategy: false } })
  client.on("error", () => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => { await client.connect(); return operation(client) })(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("test Redis deadline")), 2_000) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    client.destroy()
  }
}

async function cleanupIssuedTokens(url: string, tokens: ReadonlySet<string>): Promise<void> {
  const keys = [...tokens].map((token) => `${prefix}${createHash("sha256").update(token).digest("hex")}`)
  if (keys.length === 0) return
  await withTestRedis(url, async (client) => { await client.del(keys) })
}

async function issue(input: Parameters<typeof issueIamInteractionCsrf>[0]): ReturnType<typeof issueIamInteractionCsrf> {
  const result = await issueIamInteractionCsrf(input)
  issuedTokens.add(result.token)
  return result
}

afterAll(async () => {
  await cleanupIssuedTokens(redisUrl, issuedTokens)
})

describe("Web IAM interaction CSRF", () => {
  it("atomically consumes once and binds exact signed query, path and issuer cookie", async () => {
    const issued = await issue({ redisUrl, webOrigin, path: "/auth/sign-in", method: "POST", query: "?sig=%2BAb", issuerCookie, secureCookies: false })
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(issued.cookie).toContain("HttpOnly")
    expect(issued.cookie).toContain("SameSite=Lax")
    expect(issued.cookie).toContain("Path=/auth/sign-in")
    const input = { redisUrl, webOrigin, path: "/auth/sign-in" as const, method: "POST" as const, query: "?sig=%2BAb", issuerCookie, cookieToken: issued.token, formToken: issued.token }
    expect(await consumeIamInteractionCsrf({ ...input, query: "?sig=+Ab" })).toBe(false)
    expect(await consumeIamInteractionCsrf(input)).toBe(false)

    const fresh = await issue({ redisUrl, webOrigin, path: "/auth/sign-in", method: "POST", query: "?sig=%2BAb", issuerCookie, secureCookies: false })
    const result = await Promise.all([0, 1].map(() => consumeIamInteractionCsrf({ ...input, cookieToken: fresh.token, formToken: fresh.token })))
    expect(result.sort()).toEqual([false, true])
    expect(await consumeIamInteractionCsrf({ ...input, cookieToken: fresh.token, formToken: fresh.token })).toBe(false)
  })

  it("rejects mismatched form/cookie proof before consuming the valid token", async () => {
    const issued = await issue({ redisUrl, webOrigin, path: "/auth/sign-in", method: "POST", query: "?sig=one", issuerCookie, secureCookies: false })
    const input = { redisUrl, webOrigin, path: "/auth/sign-in" as const, method: "POST" as const, query: "?sig=one", issuerCookie, cookieToken: issued.token, formToken: issued.token }
    expect(await consumeIamInteractionCsrf({ ...input, formToken: "attacker" })).toBe(false)
    expect(await consumeIamInteractionCsrf({ ...input, issuerCookie: "" })).toBe(false)
    expect(await consumeIamInteractionCsrf(input)).toBe(false)
  })

  it("fails closed when its Redis URL is unavailable", async () => {
    await expect(issueIamInteractionCsrf({
      redisUrl: "not-a-redis-url", webOrigin, path: "/auth/sign-in", method: "POST", query: "?sig=one", issuerCookie,
      secureCookies: false,
    })).rejects.toThrow()
  })

  it("binds the proof to the POST method", async () => {
    const issued = await issue({
      redisUrl, webOrigin, path: "/auth/sign-in", method: "POST", query: "?sig=method", issuerCookie,
      secureCookies: false,
    })
    const base = { redisUrl, webOrigin, path: "/auth/sign-in" as const, query: "?sig=method", issuerCookie,
      cookieToken: issued.token, formToken: issued.token }
    expect(await consumeIamInteractionCsrf({ ...base, method: "GET" })).toBe(false)
    expect(await consumeIamInteractionCsrf({ ...base, method: "POST" })).toBe(false)
  })

  it("binds tenant choice evidence to the tenant path and owner-listed ids", async () => {
    const issued = await issue({
      redisUrl, webOrigin, path: "/iam/interactions/select-tenant", method: "POST", query: "?sig=tenant",
      issuerCookie, context: "tenant-one,tenant-two", secureCookies: false,
    })
    expect(issued.cookie).toContain("Path=/iam/interactions/select-tenant")
    const input = { redisUrl, webOrigin, path: "/iam/interactions/select-tenant" as const, method: "POST" as const,
      query: "?sig=tenant", issuerCookie, context: "tenant-one,tenant-two",
      cookieToken: issued.token, formToken: issued.token }
    expect(await consumeIamInteractionCsrf({ ...input, context: "tenant-other" })).toBe(false)
    expect(await consumeIamInteractionCsrf(input)).toBe(false)
    const second = await issue({
      redisUrl, webOrigin, path: "/iam/interactions/consent", method: "POST", query: "?sig=tenant&scope=openid",
      issuerCookie, secureCookies: false,
    })
    expect(second.cookie).toContain("Path=/iam/interactions/consent")
    expect(await consumeIamInteractionCsrf({ redisUrl, webOrigin, path: "/iam/interactions/consent", method: "POST",
      query: "?sig=tenant&scope=openid", issuerCookie,
      cookieToken: second.token, formToken: second.token })).toBe(true)
  })

  it("deletes only issued keys and leaves a pre-existing key in the same namespace", async () => {
    const sentinelKey = `${prefix}preexisting-${randomUUID()}`
    await withTestRedis(redisUrl, async (client) => { await client.set(sentinelKey, "other-owner", { EX: 60 }) })
    try {
      await issue({ redisUrl, webOrigin, path: "/auth/sign-in", method: "POST", query: "?sig=cleanup", issuerCookie, secureCookies: false })
      await cleanupIssuedTokens(redisUrl, issuedTokens)
      expect(await withTestRedis(redisUrl, (client) => client.get(sentinelKey))).toBe("other-owner")
    } finally {
      await withTestRedis(redisUrl, async (client) => { await client.del(sentinelKey) })
    }
  })

  it("bounds cleanup when Redis is disconnected", async () => {
    const start = Date.now()
    await expect(cleanupIssuedTokens("redis://127.0.0.1:1", new Set(["a"]))).rejects.toThrow()
    expect(Date.now() - start).toBeLessThan(2_500)
  })
})
