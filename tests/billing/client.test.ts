import { afterEach, expect, it, vi } from "vitest"
import { createBillingClient } from "@/billing/client"

const summary = { credit_account_id: "11111111-1111-4111-8111-111111111111", status: "active", available_micros: "1234567", held_micros: "42" }
const ledger = { items: [], page: { next_cursor: null } }
const headers = { "cache-control": "private, no-store", "x-request-id": "credit-read" }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
const missing = () => json({ error: { code: "billing_account_not_found", message: "Missing" }, meta: { request_id: "credit-read" } }, 404)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it.each(["summary", "ledger"] as const)("initializes once after a trusted missing %s and rereads its original GET", async (read) => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing()).mockResolvedValueOnce(json(summary)).mockResolvedValueOnce(json(read === "summary" ? summary : ledger))
  vi.stubGlobal("fetch", fetcher)
  const client = createBillingClient()
  const result = await (read === "summary" ? client.summary() : client.ledger("cursor /?"))
  expect(result).toEqual(read === "summary" ? summary : ledger)
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`/api/session/billing/${read}${read === "ledger" ? "?cursor=cursor%20%2F%3F" : ""}`, "/api/session/billing/credit-account", `/api/session/billing/${read}${read === "ledger" ? "?cursor=cursor%20%2F%3F" : ""}`])
  expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "PUT", body: "{}", headers: { "content-type": "application/json" }, redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) })
})

it.each(["network", "invalid-response"])("verifies %s PUT outcome by GET without a second PUT", async (variant) => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing())
  if (variant === "network") fetcher.mockRejectedValueOnce(new Error("lost ACK"))
  else fetcher.mockResolvedValueOnce(json({ ...summary, extra: true }))
  fetcher.mockResolvedValueOnce(json(summary))
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).resolves.toEqual(summary)
  expect(fetcher.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "PUT", "GET"])
})

it("does not loop on missing account after initialization or fabricate zero", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing()).mockResolvedValueOnce(json(summary)).mockResolvedValueOnce(missing())
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).rejects.toMatchObject({ reason: "missing_account" })
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it.each([
  { name: "generic404", status: 404, code: "not_found", id: "credit-read" },
  { name: "disabled403", status: 403, code: "billing_account_not_found", id: "credit-read" },
  { name: "unavailable503", status: 503, code: "billing_account_not_found", id: "credit-read" },
  { name: "wrong-request-id", status: 404, code: "billing_account_not_found", id: "other" },
])("does not initialize on $name", async ({ status, code, id }) => {
  const fetcher = vi.fn(async () => json({ error: { code, message: "Missing" }, meta: { request_id: id } }, status))
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).rejects.toBeDefined()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it("does not initialize from malformed JSON", async () => {
  const fetcher = vi.fn(async () => new Response("{", { status: 404, headers: { ...headers, "content-type": "application/json" } }))
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).rejects.toMatchObject({ reason: "parse" })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it.each([400, 403])("does not turn a known PUT %s rejection into another write or read", async (status) => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing()).mockResolvedValueOnce(json({ error: { code: "billing_unavailable", message: "Unavailable" } }, status))
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).rejects.toMatchObject({ reason: "http", status })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it("retires before dispatching PUT when the caller is aborted during the missing GET", async () => {
  const controller = new AbortController()
  const fetcher = vi.fn(async () => { controller.abort(); return missing() })
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary(controller.signal)).rejects.toMatchObject({ reason: "aborted" })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it("aborts an in-flight PUT without a late verification GET", async () => {
  const controller = new AbortController()
  const fetcher = vi.fn().mockResolvedValueOnce(missing()).mockImplementationOnce(async () => { controller.abort(); return json(summary) })
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary(controller.signal)).rejects.toMatchObject({ reason: "aborted" })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it("shares a single absolute ten-second budget across GET, PUT and verification", async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockImplementationOnce(async () => { await new Promise((resolve) => setTimeout(resolve, 6000)); return missing() })
    .mockImplementationOnce(async () => new Promise<Response>(() => {}))
  vi.stubGlobal("fetch", fetcher)
  const result = createBillingClient().summary().catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(await result).toMatchObject({ reason: "timeout" })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true)
})

it.each([502, 503])("verifies a possibly committed PUT with a %s ACK by reading, never writing again", async (status) => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing())
    .mockResolvedValueOnce(json({ error: { code: "billing_unavailable", message: "ACK unavailable" } }, status))
    .mockResolvedValueOnce(json(summary))
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).resolves.toEqual(summary)
  expect(fetcher.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "PUT", "GET"])
})

it("leaves an unresolved 503 write outcome as an error and waits for explicit retry", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing())
    .mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(missing())
  vi.stubGlobal("fetch", fetcher)
  await expect(createBillingClient().summary()).rejects.toMatchObject({ reason: "missing_account" })
  expect(fetcher.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "PUT", "GET"])
})

it.each(["retired", "throws"])("suppresses initialization when the caller's continuation guard %s", async (variant) => {
  const fetcher = vi.fn().mockResolvedValueOnce(missing()).mockResolvedValue(json(summary))
  vi.stubGlobal("fetch", fetcher)
  const getCurrent = () => { if (variant === "throws") throw new Error("identity unavailable"); return false }
  await expect(createBillingClient().summary(undefined, getCurrent)).rejects.toMatchObject({ reason: "aborted" })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
