import { afterEach, expect, it, vi } from "vitest"
import { parseProductReturnTarget } from "@/lib/product-return-target"
import { issueProductLoginIntent, readProductLoginIntent } from "@/lib/server/product-login-return"
import { clearOidcTransactionCookies, oidcStartWithinCookieBudget, oidcTransactionCookieOptions } from "@/lib/server/oidc-transaction-cookies"

const secret = "s".repeat(32), origin = "https://web.example.test"
const target = parseProductReturnTarget("/app#/account/settings/skills")!
afterEach(() => vi.restoreAllMocks())

it("binds the origin and precise target to an expiring per-form intent without shared cookies", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000)
  const first = issueProductLoginIntent(target, secret, origin), second = issueProductLoginIntent(target, secret, origin)
  expect(first.handoffNamespace).not.toBe(second.handoffNamespace)
  expect(readProductLoginIntent(first.intent, secret, origin)).toEqual({ target, handoffNamespace: first.handoffNamespace })
  expect(readProductLoginIntent(first.intent, secret, "https://other.test")).toBeNull()
  expect(readProductLoginIntent(first.intent, "x".repeat(32), origin)).toBeNull()
  expect(readProductLoginIntent(first.intent.slice(0, -1) + (first.intent.endsWith("a") ? "b" : "a"), secret, origin)).toBeNull()
  vi.spyOn(Date, "now").mockReturnValue(301000)
  expect(readProductLoginIntent(first.intent, secret, origin)).toBeNull()
})

it.each([false, true])("keeps native cookie options isolated and clears only the named transaction (secure=%s)", secure => {
  const ns = { handoffNamespace: "h".repeat(22), oidcNamespace: "o".repeat(22) }
  const options = oidcTransactionCookieOptions(secure, ns)
  expect(new Set(Object.values(options).map(cookie => cookie!.name)).size).toBe(4)
  for (const cookie of Object.values(options)) expect(cookie!.options).toEqual({ httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 300 })
  expect(options.csrfToken!.name).toContain(ns.handoffNamespace)
  for (const cookie of [options.state, options.nonce, options.pkceCodeVerifier]) expect(cookie!.name).toContain(ns.oidcNamespace)
  const second = oidcTransactionCookieOptions(secure, { ...ns, oidcNamespace: "n".repeat(22) })
  expect(second.state!.name).not.toBe(options.state!.name)
  const cleared = clearOidcTransactionCookies(secure, ns)
  expect(cleared.map(cookie => cookie.split("=", 1)[0]).sort()).toEqual(Object.values(options).map(cookie => cookie!.name).sort())
  expect(cleared.every(cookie => cookie.includes("Max-Age=0") && cookie.includes("HttpOnly") && (cookie.includes("; Secure") === secure))).toBe(true)
})

it("bounds pending form and transaction cookies without evicting existing valid starts", () => {
  const forms = ["a", "b", "c", "d"].map(letter => `next-auth.csrf-token.tx-${letter.repeat(22)}=proof`).join("; ")
  expect(oidcStartWithinCookieBudget(forms)).toBe(false)
  expect(oidcStartWithinCookieBudget(forms, false)).toBe(true)
  const active = ["a", "b", "c", "d"].map(letter => `next-auth.state.tx-${letter.repeat(22)}=proof`).join("; ")
  expect(oidcStartWithinCookieBudget(active, false)).toBe(false)
  expect(oidcStartWithinCookieBudget("unrelated=" + "a".repeat(12288))).toBe(false)
})
