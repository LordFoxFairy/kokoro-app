import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import YAML from "yaml"

import { createBillingClient } from "@/billing/client"
import { creditAccountErrorAllowed, creditAccountHeadersValid } from "@/contract/billing-credit-account"
import { restoreBillingCreditAccountParent } from "./bff-billing-credit-account-parent"

const summary = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "9007199254740993123456789", held_micros: "1234567" }
const response = (body: unknown = summary, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "fixture-1", ...Object.fromEntries(new Headers(headers)) } })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it("I5 pins the whole released19.3 and restores the exact whole19.2 parent without resigning it", async () => {
  const bytes = await readFile("src/generated/bff-public-openapi.yaml")
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("6574930b3a893a208596e6f27c2f9e09122e759d111a7fdbf2d54c294efc0e8f")
  const spec = YAML.parse(bytes.toString())
  expect(spec.info.version).toBe("20.0.0")
  expect(spec.paths["/v1/billing/credit-account"].put).toMatchObject({ operationId: "initializeBillingCreditAccount", "x-kokoro-idempotency": "inherent", requestBody: { required: true } })
  expect(spec.paths["/v1/billing/credit-account"].put.parameters).toBeUndefined()
  expect(createHash("sha256").update(restoreBillingCreditAccountParent(bytes)).digest("hex")).toBe("ef56014105cc187bd86da74eb5ba6eef5f54aacb934e2f86e007c98719ff02f6")
})
describe("I5 command-only browser transport", () => {
  it("dispatches one same-origin PUT{} without key and preserves actual large/nonzero held values", async () => {
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetcher)
    expect(await createBillingClient().initializeCreditAccount()).toEqual(summary)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/session/billing/credit-account")
    const init = fetcher.mock.calls[0]?.[1]
    expect(init).toMatchObject({ method: "PUT", body: "{}", credentials: "same-origin", cache: "no-store", redirect: "error" })
    expect(new Headers(init.headers).has("idempotency-key")).toBe(false)
  })
  it.each(["private, no-store", "no-store", "private, no-store, max-age=1", ""])("rejects browser cache %s without retry", async (cache) => {
    const fetcher = vi.fn().mockResolvedValue(response(summary, 200, { "cache-control": cache })); vi.stubGlobal("fetch", fetcher)
    await expect(createBillingClient().initializeCreditAccount()).rejects.toMatchObject({ code: "invalid_response" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(["set-cookie", "location", "transfer-encoding", "content-encoding"])("rejects %s even on valid200", async (header) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(summary, 200, { [header]: "unexpected" })))
    await expect(createBillingClient().initializeCreditAccount()).rejects.toMatchObject({ code: "invalid_response" })
  })
  it.each(["\ufeff{}", '{"status":"active","status":"active"}', "{", 'null'])("rejects invalid raw JSON %j", async (text) => {
    const good = response(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { headers: good.headers })))
    await expect(createBillingClient().initializeCreditAccount()).rejects.toMatchObject({ code: "invalid_response" })
  })
  it("rejects a length mismatch and does not trust a declared length before EOF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(summary, 200, { "content-length": "2" })))
    await expect(createBillingClient().initializeCreditAccount()).rejects.toMatchObject({ code: "invalid_response" })
  })
  it("covers noncooperative response EOF with the same20 second deadline", async () => {
    vi.useFakeTimers()
    const good = response(), cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(summary))) }, cancel }), { headers: good.headers })))
    const pending = createBillingClient().initializeCreditAccount().catch(error => error)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await pending).toMatchObject({ code: "request_timeout" }); expect(cancel).toHaveBeenCalledTimes(1)
  })
  it("classifies only the published disabled tuple, rejecting a forged retryable bit", async () => {
    expect(creditAccountErrorAllowed(403, "billing_account_disabled", false)).toBe(true)
    expect(creditAccountErrorAllowed(403, "billing_account_disabled", true)).toBe(false)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "billing_account_disabled", message: "disabled", retryable: false } }, 403)))
    await expect(createBillingClient().initializeCreditAccount()).rejects.toMatchObject({ code: "billing_account_disabled", retryable: false, status: 403 })
    expect(creditAccountHeadersValid(response().headers, 200, "owner")).toBe(false)
  })
})
