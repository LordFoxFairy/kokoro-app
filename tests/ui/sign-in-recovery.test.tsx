import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navigation }))
import { SignInRecovery } from "@/ui/auth/sign-in-recovery"

const active = () => ({ authenticated: true, subject: "recovery-actor", expires_at: Date.now() + 60_000 })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(finish => { resolve = finish }); return { promise, resolve } }
async function settle() { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }) }
async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function visibility(value: "visible" | "hidden") { Object.defineProperty(document, "visibilityState", { configurable: true, value }); fireEvent(document, new Event("visibilitychange")) }
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it("reads only the current Session and replaces fixed /app after strict success, without storing identity or invoking login", async () => {
  const writes = vi.spyOn(Storage.prototype, "setItem")
  const fetcher = vi.fn().mockResolvedValue(Response.json(active()))
  vi.stubGlobal("fetch", fetcher)
  render(<SignInRecovery />); await settle()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]).toEqual(["/api/auth/session", expect.objectContaining({ method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error", signal: expect.any(AbortSignal) })])
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app")
  expect(navigation.refresh).not.toHaveBeenCalled()
  expect(writes).not.toHaveBeenCalled()
})

it.each(["anonymous", "unknown", "extra", "blank", "expired", "bad-json", "401", "409", "503", "network"])("%s stays explicit, stops at two GETs, and never starts OAuth or POST refresh", async kind => {
  const raw = kind === "anonymous" ? { authenticated: false } : kind === "unknown" ? { authenticated: false, refresh_required: true, subject: "recovery-actor", expires_at: Date.now() + 60_000 }
    : kind === "extra" ? { ...active(), access_token: "fixture-must-not-authorize" } : kind === "blank" ? { ...active(), subject: " " }
    : kind === "expired" ? { ...active(), expires_at: Date.now() - 1 } : active()
  const fetcher = vi.fn().mockImplementation(async () => {
    if (kind === "network") throw new Error("controlled offline")
    return kind === "bad-json" ? new Response("not-json", { status: 200 }) : Response.json(raw, { status: /^\d/u.test(kind) ? Number(kind) : 200 })
  })
  vi.stubGlobal("fetch", fetcher); render(<SignInRecovery />); await settle(); await tick(1_000); await tick(20_000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls.every(([path, init]) => path === "/api/auth/session" && init.method === "GET")).toBe(true)
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(navigation.refresh).not.toHaveBeenCalled()
  expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/login")
  expect(screen.getByRole("button", { name: "检查并继续" })).toBeEnabled()
})

it("coalesces mount/resume/explicit events into one active episode; explicit recovery only refreshes and re-reads", async () => {
  const held = deferred<Response>()
  const fetcher = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue(Response.json({ authenticated: false }))
  vi.stubGlobal("fetch", fetcher); render(<SignInRecovery />); await settle()
  for (const event of ["focus", "online", "pageshow"]) fireEvent(window, new Event(event))
  visibility("visible"); fireEvent.click(screen.getByRole("button", { name: "检查并继续" })); await settle()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(navigation.refresh).not.toHaveBeenCalled()
  await act(async () => held.resolve(Response.json({ authenticated: false }))); await tick(1_000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  navigation.refresh.mockImplementationOnce(() => fireEvent(window, new Event("focus")))
  fireEvent.click(screen.getByRole("button", { name: "检查并继续" })); await settle()
  expect(navigation.refresh).toHaveBeenCalledOnce()
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(navigation.replace).not.toHaveBeenCalled()
})

it.each(["hidden", "unmount", "deadline", "pagehide"])("retires %s even while the body ignores cancellation; late authenticated bytes never navigate", async reason => {
  const body = deferred<unknown>()
  const fetcher = vi.fn().mockResolvedValue({ status: 200, json: () => body.promise })
  vi.stubGlobal("fetch", fetcher); const view = render(<SignInRecovery />); await settle()
  const signal = fetcher.mock.calls[0]?.[1].signal as AbortSignal
  if (reason === "hidden") visibility("hidden")
  else if (reason === "unmount") view.unmount()
  else if (reason === "pagehide") fireEvent(window, new Event("pagehide"))
  else await tick(10_000)
  expect(signal.aborted).toBe(true)
  await act(async () => body.resolve(active())); await tick(20_000)
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledOnce()
  if (reason !== "unmount") expect(screen.getByRole("button", { name: "检查并继续" })).toBeEnabled()
})

it("a visible new episode is not affected by the retired hidden response or its deadline", async () => {
  const old = deferred<Response>(), current = deferred<Response>()
  const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
  vi.stubGlobal("fetch", fetcher); render(<SignInRecovery />); await settle(); await tick(3_000)
  visibility("hidden"); visibility("visible"); await settle()
  expect(fetcher).toHaveBeenCalledTimes(2)
  await act(async () => old.resolve(Response.json(active())))
  expect(navigation.replace).not.toHaveBeenCalled()
  await tick(7_000)
  expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(false)
  await act(async () => current.resolve(Response.json(active())))
  expect(navigation.replace).toHaveBeenCalledExactlyOnceWith("/app")
})

it("the second GET shares the first request's absolute ten-second deadline", async () => {
  const body = deferred<unknown>()
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ authenticated: false })).mockResolvedValueOnce({ status: 200, json: () => body.promise })
  vi.stubGlobal("fetch", fetcher); render(<SignInRecovery />); await settle(); await tick(1_000); await tick(9_000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(true)
  await act(async () => body.resolve(active()))
  expect(navigation.replace).not.toHaveBeenCalled()
})
