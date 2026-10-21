import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import * as crypto from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

const createClient = vi.fn()

import { DEFAULT_PRODUCT_RETURN_TARGET, parseProductReturnTarget } from "@/lib/product-return-target"
// Next resolves server-only through its own compiler; Vitest has no runtime
// package. Execute the exact module through TypeScript's CJS emitter with only
// its three imports supplied, without changing production or mocking its logic.
const emitted = ts.transpileModule(readFileSync(resolve("src/lib/server/oidc-rp-transaction.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleExports = {} as typeof import("@/lib/server/oidc-rp-transaction")
new Function("require", "exports", emitted)((name: string) => {
  if (name === "server-only") return {}
  if (name === "node:crypto") return crypto
  if (name === "redis") return { createClient }
  if (name === "@/lib/product-return-target") return { parseProductReturnTarget }
  throw new Error(`unexpected transaction dependency: ${name}`)
}, moduleExports)
const { consumeOidcState, issueOidcState } = moduleExports

const origin = "https://web.example.test"
const secret = "s".repeat(32)
const state = "a".repeat(32)
const cookies = ["next-auth.state=" + "s".repeat(32), "next-auth.pkce.code_verifier=" + "p".repeat(32), "next-auth.nonce=" + "n".repeat(32)]
const config = { redisUrl: "redis://fixture.invalid/9", webOrigin: origin, authSecret: secret, state }
const rows = new Map<string, { value: string; expires: number }>()
const redis = { on: vi.fn(), connect: vi.fn(), destroy: vi.fn(), set: vi.fn(), get: vi.fn(), eval: vi.fn() }
function storedRow() {
  const value = [...rows.values()][0]
  if (value === undefined) throw new Error("missing test transaction")
  return value
}
async function issue() {
  const target = parseProductReturnTarget("/app?conversation=conv_00000000-0000-4000-8000-000000000302")
  if (target === null) throw new Error("invalid fixture target")
  await issueOidcState({ ...config, setCookies: cookies.map((value) => `${value}; Path=/; HttpOnly`), target })
  return target
}
const consume = (overrides: Partial<Parameters<typeof consumeOidcState>[0]> = {}) => consumeOidcState({ ...config, cookieHeader: cookies.join("; "), ...overrides })

beforeEach(() => {
  vi.resetAllMocks()
  rows.clear()
  redis.connect.mockResolvedValue(undefined)
  createClient.mockReturnValue(redis)
  redis.set.mockImplementation(async (key: string, value: string, options: { EX: number; NX: boolean }) => {
    if (options.NX && rows.has(key)) return null
    rows.set(key, { value, expires: Date.now() + options.EX * 1000 })
    return "OK"
  })
  redis.get.mockImplementation(async (key: string) => {
    const row = rows.get(key)
    if (row && row.expires <= Date.now()) rows.delete(key)
    return row && row.expires > Date.now() ? row.value : null
  })
  redis.eval.mockImplementation(async (_script: string, input: { keys: string[]; arguments: string[] }) => {
    const key = input.keys[0]!
    const row = rows.get(key)
    if (row && row.expires <= Date.now()) rows.delete(key)
    if (!row || row.expires <= Date.now() || row.value !== input.arguments[0]) return 0
    rows.delete(key)
    return 1
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe("unique RP return tuple and existing single-use transaction", () => {
  it("writes one closed MAC record under unchanged NX/300 seconds and consumes the full target once", async () => {
    const target = await issue()
    const record: unknown = JSON.parse(storedRow().value)
    expect(record).toEqual(["product-return-v1", target, expect.stringMatching(/^[a-f0-9]{64}$/u), expect.stringMatching(/^[a-f0-9]{64}$/u)])
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^kokoro:web:oidc-state:[a-f0-9]{64}:[a-f0-9]{64}$/u), expect.any(String), { EX: 300, NX: true })
    expect(storedRow().value).not.toContain(secret)
    await expect(consume()).resolves.toBe(target)
    await expect(consume()).resolves.toBeNull()
    expect(redis.destroy).toHaveBeenCalledTimes(3)
  })
  it("admits at most one concurrent callback and refuses an NX state collision", async () => {
    const target = await issue()
    await expect(issue()).rejects.toThrow("RP state collision")
    expect(await Promise.all([consume(), consume()])).toEqual([target, null])
  })
  it.each(["replacement", "expiry"])("rejects a %s between verification and atomic consumption", async (kind) => {
    const target = await issue()
    const row = storedRow()
    const replacement = row.value + " "
    const evaluate = redis.eval.getMockImplementation()!
    redis.eval.mockImplementationOnce(async (script: string, input: { keys: string[]; arguments: string[] }) => {
      if (kind === "replacement") row.value = replacement
      else row.expires = Date.now() - 1
      return evaluate(script, input)
    })
    await expect(consume()).resolves.toBeNull()
    if (kind === "replacement") {
      expect(storedRow().value).toBe(replacement)
      await expect(consume()).resolves.toBe(target)
    } else expect(rows.size).toBe(0)
  })
  it.each(["target", "binding", "mac", "version", "extra", "legacy", "unsafe", "noncanonical"])("rejects corrupted %s without a legacy fallback", async (field) => {
    await issue()
    const row = storedRow()
    const record = JSON.parse(row.value) as [string, string, string, string]
    if (field === "target") record[1] = "/app/skills"
    if (field === "binding") record[2] = "b".repeat(64)
    if (field === "mac") record[3] = "b".repeat(64)
    if (field === "version") record[0] = "old-version"
    if (field === "unsafe") record[1] = "//evil.test/app"
    if (field === "noncanonical") record[1] = "/app/library?type=all"
    row.value = field === "legacy" ? "a".repeat(64) : JSON.stringify(field === "extra" ? [...record, "extra"] : record)
    await expect(consume()).resolves.toBeNull()
    // Unauthenticated records are not ours to destroy; the original TTL bounds them.
    expect(rows.size).toBe(1)
  })
  it.each(["state", "pkce", "nonce", "duplicate", "missing"])("rejects a %s cookie mismatch", async (kind) => {
    await issue()
    const values = [...cookies]
    const index = kind === "state" ? 0 : kind === "pkce" ? 1 : 2
    if (kind === "duplicate") values.push(cookies[0] ?? "")
    else if (kind === "missing") values.pop()
    else values[index] = (values[index] ?? "").split("=", 1)[0] + "=" + "x".repeat(32)
    await expect(consume({ cookieHeader: values.join("; ") })).resolves.toBeNull()
    await expect(consume()).resolves.toBe("/app?conversation=conv_00000000-0000-4000-8000-000000000302")
  })
  it("binds the auth secret and origin, and keeps the unchanged expiry at 300 seconds", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    await issue()
    await expect(consume({ authSecret: "other".repeat(8) })).resolves.toBeNull()
    await expect(consume({ webOrigin: "https://other.test" })).resolves.toBeNull()
    vi.spyOn(Date, "now").mockReturnValue(301000)
    await expect(consume()).resolves.toBeNull()
  })
  it("supports the existing secure cookie names and explicit default product target", async () => {
    const secure = cookies.map((value) => `__Secure-${value}`)
    await issueOidcState({ ...config, setCookies: secure, target: DEFAULT_PRODUCT_RETURN_TARGET })
    await expect(consume({ cookieHeader: secure.join("; ") })).resolves.toBe("/app")
  })
  it("settles and destroys the existing Redis handle at its existing finite deadline", async () => {
    vi.useFakeTimers()
    redis.connect.mockImplementation(() => new Promise(() => {}))
    const pending = issue()
    const rejected = expect(pending).rejects.toThrow("deadline")
    await vi.advanceTimersByTimeAsync(2000)
    await rejected
    expect(redis.set).not.toHaveBeenCalled()
    expect(redis.destroy).toHaveBeenCalledOnce()
  })
  it("keeps the original transaction usable after a different tab supplies mismatched proofs", async () => {
    const target = await issue()
    const differentTab = cookies.map(cookie => cookie.split("=", 1)[0] + "=" + "x".repeat(32)).join("; ")
    await expect(consume({ cookieHeader: differentTab })).resolves.toBeNull()
    await expect(consume()).resolves.toBe(target)
  })

})
