import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StrictMode, createElement } from "react"

let useSessionProbe: typeof import("@/ui/auth/use-session-state").useSessionProbe
beforeEach(async () => {
  window.localStorage.clear()
  vi.resetModules()
  useSessionProbe = (await import("@/ui/auth/use-session-state")).useSessionProbe
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useSessionProbe", () => {
  it("shares one in-flight session request between concurrent mounts", async () => {
    let resolve!: (response: Response) => void
    const response = new Promise<Response>((done) => {
      resolve = done
    })
    const fetchMock = vi.fn().mockReturnValueOnce(response).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    vi.stubGlobal("fetch", fetchMock)

    const first = renderHook(() => useSessionProbe())
    const second = renderHook(() => useSessionProbe())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    try {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({
        cache: "no-store", signal: expect.any(AbortSignal),
      }))
      resolve(new Response(JSON.stringify({ authenticated: true, subject: "reader-a" }), { status: 200 }))
      await waitFor(() => expect(first.result.current.mode).toBe("authenticated"))
      await waitFor(() => expect(second.result.current.mode).toBe("authenticated"))
    } finally {
      first.unmount()
      second.unmount()
    }
  })
})

it("preserves authenticated Chat during recheck, and treats a later non-200 as unavailable while Project reads stay revoked", async () => {
  const { act } = await import("@testing-library/react")
  let settleRecheck: (response: Response) => void = () => { throw new Error("no pending recheck") }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ authenticated: true, subject: "reader-a" }))
    .mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settleRecheck = resolve }))
    .mockResolvedValueOnce(Response.json({ authenticated: false }, { status: 401 }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const first = view.result.current.projectReadBoundary
    expect(first.subject).toBe("reader-a")
    act(() => window.dispatchEvent(new Event("focus")))
    expect(view.result.current.mode).toBe("authenticated")
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(view.result.current.projectReadBoundary.subject).toBe("reader-a")
    expect(view.result.current.projectReadBoundary.generation).toBeGreaterThan(first.generation)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await act(async () => { settleRecheck(Response.json({ authenticated: true, subject: "reader-a" })) })
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.projectReadBoundary.generation).toBeGreaterThan(first.generation)
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(view.result.current).toMatchObject({ state: "pass", mode: "authenticated" })
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: "reader-a" })
  } finally {
    view.unmount()
  }
})

it("boolean authentication without a trusted subject does not admit Project reads", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ authenticated: true })))
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.state).toBe("unavailable"))
    expect(view.result.current.mode).toBe("checking")
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: null })
  } finally {
    view.unmount()
  }
})


const session = (): Response => Response.json({ authenticated: true, subject: "reader-a" })
const renewed = (): Response => Response.json({ authenticated: true, subject: "reader-a", expires_at: Date.now() + 3_600_000 })
const csrf = (): Response => Response.json({ csrfToken: "a".repeat(64) })

it("renews a visible admitted session after 120s without changing GET projection requirements", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock.mock.calls[4]).toEqual(["/api/auth/session", expect.objectContaining({ method: "POST" })])
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    expect(fetchMock.mock.calls[5]?.[1]).not.toHaveProperty("method", "POST")
  } finally { view.unmount() }
})

it.each([401, 409])("confirms a refresh %s with exactly one readonly GET before readmission", async (status) => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf())
    .mockResolvedValueOnce(Response.json({ error: "conflict" }, { status })).mockResolvedValueOnce(session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock.mock.calls[5]?.[1]).not.toHaveProperty("method", "POST")
  } finally { view.unmount() }
})

it("keeps failed CAS confirmation unavailable and later probes readonly, not anonymous", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf())
    .mockResolvedValueOnce(Response.json({}, { status: 409 }))
    .mockResolvedValue(Response.json({ authenticated: false }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(view.result.current.mode).toBe("authenticated")
    now = 500_000
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    expect(fetchMock.mock.calls[6]?.[1]).not.toHaveProperty("method", "POST")
    expect(view.result.current.mode).toBe("authenticated")
  } finally { view.unmount() }
})

it("does not mask refresh 403 with GET and waits a future 120s after same-subject readonly recovery", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf())
    .mockResolvedValueOnce(Response.json({}, { status: 403 })).mockResolvedValueOnce(session()).mockResolvedValueOnce(session())
    .mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(5)
    now = 500_000
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(6)
    now += 1
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    await waitFor(() => expect(view.result.current.requestPending).toBe(false))
    now = 620_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(9))
  } finally { view.unmount() }
})

it("shares one refresh across StrictMode and mounts and does not abort on one consumer cleanup", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let settle!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(StrictMode, null, children)
  const first = renderHook(() => useSessionProbe(), { wrapper })
  const second = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(second.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    first.unmount()
    expect(fetchMock.mock.calls[4]?.[1].signal.aborted).toBe(false)
    await act(async () => { settle(renewed()) })
    await waitFor(() => expect(second.result.current.projectReadBoundary.admitted).toBe(true))
  } finally { second.unmount() }
})

it("settles the shared 10s budget even if CSRF ignores abort, and never sends a late POST", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let settle!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    now = 120_001
    await act(async () => { window.dispatchEvent(new Event("focus")) })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(view.result.current.requestPending).toBe(false)
    expect(view.result.current.unavailable).toBe(true)
    expect(fetchMock.mock.calls[3]?.[1].signal.aborted).toBe(true)
    await act(async () => { settle(csrf()) })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  } finally { view.unmount() }
})

it("aborts document work on pagehide and rechecks readonly on persisted pageshow", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let settle!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve })).mockResolvedValueOnce(session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await act(async () => { window.dispatchEvent(new Event("pagehide")) })
    expect(fetchMock.mock.calls[3]?.[1].signal.aborted).toBe(true)
    await act(async () => { settle(csrf()) })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    act(() => window.dispatchEvent(new Event("pageshow")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock.mock.calls[4]?.[1]).not.toHaveProperty("method", "POST")
  } finally { view.unmount() }
})


it("keeps anonymous cold GET readonly without trying refresh", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ authenticated: false }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method", "POST")
  } finally { view.unmount() }
})

it("ignores hidden focus but renews directly when an overdue tab becomes visible", async () => {
  let now = 0
  let visible = "visible"
  vi.spyOn(Date, "now").mockImplementation(() => now)
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible as DocumentVisibilityState)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    visible = "hidden"
    now = 600_000
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    visible = "visible"
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/auth/csrf")
    expect(fetchMock.mock.calls[4]?.[1]).toHaveProperty("method", "POST")
  } finally { view.unmount() }
})

it("uses the existing 120s periodic wakeup and does not slide due time on an early readonly probe", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const intervals = vi.spyOn(globalThis, "setInterval")
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const wake = intervals.mock.calls.find((call) => call[1] === 120_000)?.[0]
    expect(wake).toBeTypeOf("function")
    now = 119_999
    act(() => { if (typeof wake === "function") wake() })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await waitFor(() => expect(view.result.current.requestPending).toBe(false))
    now = 240_000
    act(() => { if (typeof wake === "function") wake() })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock.mock.calls[5]?.[1]).toHaveProperty("method", "POST")
  } finally { view.unmount() }
})

it.each(["network", "malformed", "503"])("requires readonly recovery after unknown %s rather than repeating POST", async (failure) => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf())
  if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("network outcome unknown"))
  else if (failure === "malformed") fetchMock.mockResolvedValueOnce(Response.json({ authenticated: true }))
  else fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 }))
  fetchMock.mockResolvedValueOnce(session()).mockResolvedValueOnce(session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(5)
    now = 500_000
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(6)
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    expect(fetchMock.mock.calls.slice(5).every((call) => call[1].method !== "POST")).toBe(true)
  } finally { view.unmount() }
})

it("keeps refresh subject changes behind the original browser account fence", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockResolvedValueOnce(csrf())
    .mockResolvedValueOnce(Response.json({ authenticated: true, subject: "reader-b", expires_at: Date.now() + 3_600_000 }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: "reader-a" })
    expect(view.result.current.mode).toBe("authenticated")
  } finally { view.unmount() }
})

it.each(["post-body", "confirmation-body"])("shares the 10s budget with a late %s and discards its result", async (phase) => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let settleCsrf!: (response: Response) => void
  let settleBody!: (raw: unknown) => void
  const delayedBody = { status: 200, json: () => new Promise((resolve) => { settleBody = resolve }) }
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settleCsrf = resolve }))
  if (phase === "post-body") fetchMock.mockResolvedValueOnce(delayedBody)
  else fetchMock.mockResolvedValueOnce(Response.json({}, { status: 409 })).mockResolvedValueOnce(delayedBody)
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    now = 120_001
    await act(async () => { window.dispatchEvent(new Event("focus")) })
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); settleCsrf(csrf()) })
    expect(settleBody).toBeTypeOf("function")
    const calls = phase === "post-body" ? 5 : 6
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(view.result.current.unavailable).toBe(true)
    expect(view.result.current.requestPending).toBe(false)
    await act(async () => { settleBody({ authenticated: true, subject: "reader-a", expires_at: Date.now() + 3_600_000 }) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  } finally { view.unmount() }
})

it("allows pageshow to start a fresh chain before an aborted predecessor's late finally", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let oldCsrf!: (response: Response) => void
  let freshRead!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { oldCsrf = resolve }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { freshRead = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await act(async () => { window.dispatchEvent(new Event("pagehide")); window.dispatchEvent(new Event("pageshow")) })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    await act(async () => { oldCsrf(csrf()) })
    expect(fetchMock.mock.calls[4]?.[1].signal.aborted).toBe(false)
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    await act(async () => { freshRead(session()) })
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
  } finally { view.unmount() }
})


it("withholds cold Runtime admission until the same-budget initial renewal confirms the GET subject", async () => {
  let settle!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(view.result.current.mode).toBe("checking")
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    const signals = fetchMock.mock.calls.map((call) => call[1].signal)
    expect(signals[1]).toBe(signals[0])
    expect(signals[2]).toBe(signals[0])
    await act(async () => { settle(renewed()) })
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
  } finally { view.unmount() }
})

it.each([200, 409])("rejects a different subject during cold renewal %s without admitting either identity", async (status) => {
  const changed = Response.json({ authenticated: true, subject: "reader-b", expires_at: Date.now() + 3_600_000 })
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf())
    .mockResolvedValueOnce(status === 200 ? changed : Response.json({}, { status }))
    .mockResolvedValueOnce(changed)
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(view.result.current.mode).toBe("checking")
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(status === 200 ? 3 : 4)
  } finally { view.unmount() }
})


it("does not refresh a cold authenticated GET when the browser identity marker cannot be read", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable") })
  const fetchMock = vi.fn().mockResolvedValue(session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

it("does not POST when the browser account changes while the cold readonly GET is pending", async () => {
  let settle!: (response: Response) => void
  window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-a")
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
    await act(async () => { settle(session()) })
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

it("retains the final original account fence when the marker changes during cold POST", async () => {
  let settle!: (response: Response) => void
  window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-a")
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
    await act(async () => { settle(renewed()) })
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(window.localStorage.getItem("kokoro.web.auth-index-subject")).toBe("reader-b")
  } finally { view.unmount() }
})

it("budgets cold readonly GET and CSRF together, not a fresh 10s per stage", async () => {
  let settleRead!: (response: Response) => void
  let settleCsrf!: (response: Response) => void
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settleRead = resolve }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settleCsrf = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  const view = renderHook(() => useSessionProbe())
  try {
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); settleRead(session()) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(view.result.current.unavailable).toBe(true)
    expect(view.result.current.requestPending).toBe(false)
    await act(async () => { settleCsrf(csrf()) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  } finally { view.unmount() }
})
