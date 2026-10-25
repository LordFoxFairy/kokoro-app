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

it("preserves the admitted data lifecycle during same-subject recheck and retires it on a real failure", async () => {
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
    expect(view.result.current.projectReadBoundary).toBe(first)
    expect(view.result.current.requestPending).toBe(true)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await act(async () => { settleRecheck(Response.json({ authenticated: true, subject: "reader-a" })) })
    await waitFor(() => expect(view.result.current.requestPending).toBe(false))
    expect(view.result.current.projectReadBoundary).toBe(first)
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(view.result.current).toMatchObject({ state: "pass", mode: "authenticated" })
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: "reader-a" })
    expect(view.result.current.projectReadBoundary.generation).toBeGreaterThan(first.generation)
  } finally {
    view.unmount()
  }
})

it("coalesces focus and visibility without retiring the same subject's data generation", async () => {
  let settleRecheck: (response: Response) => void = () => { throw new Error("no pending recheck") }
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { settleRecheck = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const generation = view.result.current.projectReadBoundary.generation
    act(() => {
      window.dispatchEvent(new Event("focus"))
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: true, generation })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await act(async () => { settleRecheck(session()) })
    await waitFor(() => expect(view.result.current.requestPending).toBe(false))
    expect(view.result.current.projectReadBoundary.generation).toBe(generation)
  } finally { view.unmount() }
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

it.each(["changed", "missing", "unreadable", "roundtrip"])("retires an admitted subject immediately when its browser marker is %s during a pending check", async (change) => {
  let finishCheck!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishCheck = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    expect(view.result.current.projectReadBoundary.admitted).toBe(true)
    act(() => {
      if (change === "changed" || change === "roundtrip") window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
      else if (change === "missing") window.localStorage.removeItem("kokoro.web.auth-index-subject")
      else vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage denied") })
      window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage }))
      if (change === "roundtrip") {
        window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-a")
        window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage }))
      }
    })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await act(async () => { finishCheck(session()) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(view.result.current.unavailable).toBe(true)
  } finally { view.unmount() }
})

it("retires queued cross-tab identity changes even when storage has already returned to the original subject", async () => {
  let finishCheck!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishCheck = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    act(() => {
      // Another tab completes both writes before this tab handles either event.
      window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
      window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-a")
      for (const [oldValue, newValue] of [["reader-a", "reader-b"], ["reader-b", "reader-a"]] as const) {
        window.dispatchEvent(new StorageEvent("storage", {
          key: "kokoro.web.auth-index-subject", storageArea: window.localStorage, oldValue, newValue,
        }))
      }
    })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    await act(async () => { finishCheck(session()) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

it.each(["mount", "retry"])("does not readmit a retired shared response through a later %s", async (join) => {
  let finishCheck!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishCheck = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  let late: ReturnType<typeof renderHook<ReturnType<typeof useSessionProbe>, unknown>> | undefined
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    act(() => {
      for (const [oldValue, newValue] of [["reader-a", "reader-b"], ["reader-b", "reader-a"]] as const) {
        window.localStorage.setItem("kokoro.web.auth-index-subject", newValue)
        window.dispatchEvent(new StorageEvent("storage", {
          key: "kokoro.web.auth-index-subject", storageArea: window.localStorage, oldValue, newValue,
        }))
      }
    })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    if (join === "mount") late = renderHook(() => useSessionProbe())
    else act(() => view.result.current.retry())
    await act(async () => { finishCheck(session()) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    if (late) expect(late.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  } finally { late?.unmount(); view.unmount() }
})

it("shares one immediate check after an identity event across already mounted consumers", async () => {
  let finishCheck!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishCheck = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const first = renderHook(() => useSessionProbe())
  const second = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(first.result.current.projectReadBoundary.admitted).toBe(true))
    expect(second.result.current.projectReadBoundary.admitted).toBe(true)
    await act(async () => {
      window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
      window.dispatchEvent(new StorageEvent("storage", {
        key: "kokoro.web.auth-index-subject", storageArea: window.localStorage,
        oldValue: "reader-a", newValue: "reader-b",
      }))
    })
    expect(first.result.current.projectReadBoundary.admitted).toBe(false)
    expect(second.result.current.projectReadBoundary.admitted).toBe(false)
    expect(first.result.current.unavailable).toBe(false)
    expect(second.result.current.unavailable).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await act(async () => { finishCheck(Response.json({ authenticated: false })) })
    expect(first.result.current.state).toBe("anonymous")
    expect(second.result.current.state).toBe("anonymous")
  } finally { first.unmount(); second.unmount() }
})

it("retires a previously admitted page when the session becomes anonymous", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(Response.json({ authenticated: false }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const generation = view.result.current.projectReadBoundary.generation
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: null })
    expect(view.result.current.projectReadBoundary.generation).toBeGreaterThan(generation)
  } finally { view.unmount() }
})

it.each(["draft", "sessionStorage"])("keeps unrelated %s writes outside the session probe", async (storage) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const boundary = view.result.current.projectReadBoundary
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: storage === "draft" ? "kokoro.web.drafts" : "kokoro.web.auth-index-subject",
      storageArea: storage === "draft" ? window.localStorage : window.sessionStorage,
      oldValue: "reader-a", newValue: "reader-b",
    })))
    expect(view.result.current.projectReadBoundary).toBe(boundary)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  } finally { view.unmount() }
})

it("retires a pending check on a queued localStorage clear even if the marker was restored", async () => {
  let finishCheck!: (response: Response) => void
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishCheck = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, storageArea: window.localStorage })))
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    await act(async () => { finishCheck(session()) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

it("retires a hidden tab's changed identity without rotating credentials in the background", async () => {
  let visible = "visible"
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible as DocumentVisibilityState)
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    visible = "hidden"
    act(() => {
      window.localStorage.removeItem("kokoro.web.auth-index-subject")
      window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage }))
    })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  } finally { view.unmount() }
})

it("clears the old subject before navigating to a newly verified account", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(Response.json({ authenticated: true, subject: "reader-b" }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(view.result.current.projectReadBoundary.subject).toBeNull())
    expect(view.result.current).toMatchObject({ state: "checking", mode: "checking", requestPending: false })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
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
    const freshGeneration = view.result.current.projectReadBoundary.generation
    await act(async () => { oldCsrf(csrf()) })
    expect(fetchMock.mock.calls[4]?.[1].signal.aborted).toBe(false)
    act(() => {
      window.dispatchEvent(new Event("focus"))
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(view.result.current.projectReadBoundary.generation).toBe(freshGeneration)
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


it("recovers a transient session check in the background without a manual retry or a new login", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ authenticated: false }, { status: 503 })).mockResolvedValueOnce(Response.json({ authenticated: true, subject: "reader-a" })).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed());
  vi.stubGlobal("fetch", fetchMock);
  const view = renderHook(() => useSessionProbe());
  try {
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.unavailable).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: true, subject: "reader-a" });
    expect(view.result.current.unavailable).toBe(false);
    const count = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(fetchMock).toHaveBeenCalledTimes(count);
  } finally { view.unmount(); }
});
it("bounds background outage retries and cancels them when the session probe unmounts", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ authenticated: false }, { status: 503 })));
  vi.stubGlobal("fetch", fetchMock);
  const view = renderHook(() => useSessionProbe());
  try {
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(view.result.current.projectReadBoundary.admitted).toBe(false);
    expect(view.result.current.state).toBe("unavailable");
  } finally { view.unmount(); }
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

const refreshRequired = () => Response.json({ authenticated: false, refresh_required: true, subject: "reader-a", expires_at: Date.now() + 3_600_000 })

it.each(["cold", "warm"])("renews a %s expired access credential without treating the valid Product session as anonymous", async phase => {
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const fetchMock = phase === "cold"
    ? vi.fn().mockResolvedValueOnce(refreshRequired()).mockResolvedValueOnce(csrf()).mockReturnValueOnce(pending)
    : vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
      .mockResolvedValueOnce(refreshRequired()).mockResolvedValueOnce(csrf()).mockReturnValueOnce(pending)
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    if (phase === "warm") {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      act(() => window.dispatchEvent(new Event("focus")))
    }
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(phase === "cold" ? 3 : 6))
    expect(view.result.current.projectReadBoundary.admitted).toBe(phase === "warm")
    expect(view.result.current.state).not.toBe("anonymous")
    await act(async () => finish(renewed()))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
  } finally { view.unmount() }
})

it("never repeats an uncertain refresh when readonly confirmation only says refresh_required", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(refreshRequired()).mockResolvedValueOnce(csrf())
    .mockResolvedValueOnce(Response.json({}, { status: 503 })).mockImplementation(async () => refreshRequired())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(view.result.current.state).not.toBe("anonymous")
  } finally { view.unmount() }
})


it.each(["pagehide", "csrf-failure"])("can renew expired access after %s before any refresh POST was sent", async failure => {
  let settleCsrf!: (response: Response) => void
  const pendingCsrf = new Promise<Response>(resolve => { settleCsrf = resolve })
  const fetchMock = vi.fn().mockResolvedValueOnce(refreshRequired())
    .mockImplementationOnce(() => failure === "pagehide" ? pendingCsrf : Promise.resolve(new Response(null, { status: 503 })))
    .mockResolvedValueOnce(refreshRequired()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    if (failure === "pagehide") {
      await act(async () => { window.dispatchEvent(new Event("pagehide")); settleCsrf(csrf()) })
      expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true)
      expect(view.result.current.requestPending).toBe(false)
    } else {
      await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    }
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    act(() => window.dispatchEvent(new Event(failure === "pagehide" ? "pageshow" : "focus")))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.projectReadBoundary.subject).toBe("reader-a")
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  } finally { view.unmount() }
})


it("preloads cold CSRF alongside the trusted session read without admitting or rotating early", async () => {
  let finishSession!: (response: Response) => void
  let finishCsrf!: (response: Response) => void
  const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === "/api/auth/csrf") return new Promise<Response>(resolve => { finishCsrf = resolve })
    if (options?.method === "POST") return Promise.resolve(renewed())
    return new Promise<Response>(resolve => { finishSession = resolve })
  })
  vi.stubGlobal("fetch", fetchMock)
  const first = renderHook(() => useSessionProbe({ serverAdmitted: true }))
  const second = renderHook(() => useSessionProbe({ serverAdmitted: true }))
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["/api/auth/session", "/api/auth/csrf"])
    expect(first.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock.mock.calls[1]![1].signal).toBe(fetchMock.mock.calls[0]![1].signal)
    await act(async () => { finishSession(session()) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.result.current.mode).toBe("checking")
    await act(async () => { finishCsrf(csrf()) })
    await waitFor(() => expect(first.result.current.projectReadBoundary.admitted).toBe(true))
    expect(second.result.current.projectReadBoundary.admitted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2]![1].method).toBe("POST")
    expect(fetchMock.mock.calls[2]![1].signal).toBe(fetchMock.mock.calls[0]![1].signal)
  } finally { first.unmount(); second.unmount() }
})

it.each(["anonymous", "error", "invalid"])("retires an unused cold CSRF read after a %s GET without any late POST", async (kind) => {
  let finishCsrf!: (response: Response) => void
  const response = kind === "anonymous" ? Response.json({ authenticated: false })
    : kind === "error" ? new Response(null, { status: 503 }) : Response.json({ authenticated: true })
  const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/auth/csrf"
    ? new Promise<Response>(resolve => { finishCsrf = resolve }) : Promise.resolve(response))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe({ serverAdmitted: true }))
  try {
    await waitFor(() => expect(view.result.current.state).toBe(kind === "anonymous" ? "anonymous" : "unavailable"))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]![1].signal.aborted).toBe(true)
    await act(async () => { finishCsrf(csrf()) })
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "POST")).toBe(false)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

it("keeps a preloaded CSRF result behind the original cold browser account fence", async () => {
  let finishSession!: (response: Response) => void
  const fetchMock = vi.fn().mockImplementation((url: string) => url === "/api/auth/csrf"
    ? Promise.resolve(csrf()) : new Promise<Response>(resolve => { finishSession = resolve }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe({ serverAdmitted: true }))
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    act(() => {
      window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
      window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage, oldValue: null, newValue: "reader-b" }))
    })
    await act(async () => { finishSession(session()) })
    await waitFor(() => expect(view.result.current.unavailable).toBe(true))
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "POST")).toBe(false)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

it("keeps concurrent cold reads within the original 10s deadline and never rotates after late bodies", async () => {
  vi.useFakeTimers()
  let finishSession!: (response: Response) => void
  let finishCsrf!: (response: Response) => void
  const fetchMock = vi.fn().mockImplementation((url: string) => new Promise<Response>(resolve => {
    if (url === "/api/auth/csrf") finishCsrf = resolve
    else finishSession = resolve
  }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe({ serverAdmitted: true }))
  try {
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(view.result.current.unavailable).toBe(true)
    expect(fetchMock.mock.calls.every(call => call[1].signal.aborted)).toBe(true)
    await act(async () => { finishSession(session()); finishCsrf(csrf()) })
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "POST")).toBe(false)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})


it("retires both prefetched cold reads on pagehide without a late rotating POST", async () => {
  let finishSession!: (response: Response) => void
  let finishCsrf!: (response: Response) => void
  const fetchMock = vi.fn().mockImplementation((url: string) => new Promise<Response>(resolve => {
    if (url === "/api/auth/csrf") finishCsrf = resolve
    else finishSession = resolve
  }))
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe({ serverAdmitted: true }))
  try {
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event("pagehide")))
    expect(fetchMock.mock.calls.every(call => call[1].signal.aborted)).toBe(true)
    await act(async () => { finishSession(session()); finishCsrf(csrf()) })
    expect(fetchMock.mock.calls.some(call => call[1]?.method === "POST")).toBe(false)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
  } finally { view.unmount() }
})

// The gate and a production read hook share the real Session admission. Only
// same-origin HTTP is replaced; no retry/probe helper is called by this test.
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ refresh: () => undefined }) }))
vi.mock("@/system/use-runtime-manifest", () => ({
  useRuntimeManifest: () => ({ source: "error", manifest: { brand: { name: "unused", mark: "U" }, navigation: [], featureFlags: [] } }),
}))
let admittedProjectFixture: ((props: { projectReadBoundary: import("@/ui/auth/use-session-state").ProjectReadBoundary }) => import("react").ReactNode) | undefined
vi.mock("@/features/app/kokoro-app-surface", () => ({
  KokoroAppSurface: (props: { projectReadBoundary: import("@/ui/auth/use-session-state").ProjectReadBoundary }) => admittedProjectFixture?.(props) ?? null,
}))

it("current read401 recovers the production Project collection in a fresh admitted generation without a user retry", async () => {
  const { render, screen } = await import("@testing-library/react")
  const { useProjectList } = await import("@/features/app/use-project-list")
  const { AppGate } = await import("@/ui/auth/app-gate")
  const { LocaleProvider } = await import("@/i18n/context")
  const admissions: import("@/ui/auth/use-session-state").ProjectReadBoundary[] = []
  admittedProjectFixture = function AdmittedProjectFixture({ projectReadBoundary }) {
    const collection = useProjectList(false, projectReadBoundary)
    admissions.push(projectReadBoundary)
    return <output data-testid="read401-projects">{collection.list.status}</output>
  }
  let projectReads = 0
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/auth/csrf") return csrf()
    if (path === "/api/auth/session") return init?.method === "POST" ? renewed() : session()
    if (path === "/api/hub/projects") {
      projectReads++
      return projectReads === 1
        ? Response.json({ error: { code: "session_invalid" } }, { status: 401 })
        : Response.json({ data: { projects: [] }, meta: { request_id: "controlled-project-read" } })
    }
    throw new Error("unexpected controlled read")
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(<StrictMode><LocaleProvider><AppGate /></LocaleProvider></StrictMode>)
  try {
    await waitFor(() => expect(projectReads).toBe(2))
    await waitFor(() => expect(screen.getByTestId("read401-projects")).toHaveTextContent("ready"))
    expect(projectReads).toBe(2)
    const admitted = admissions.filter(value => value.admitted)
    expect(admitted.at(-1)!.generation).toBeGreaterThan(admitted[0]!.generation)
    expect(fetchMock.mock.calls.filter(([path, init]) => path === "/api/auth/session" && init?.method === "POST")).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([path, init]) => path === "/api/auth/session" && init?.method !== "POST")).toHaveLength(2)
  } finally { view.unmount(); admittedProjectFixture = undefined }
})

it("current read401 is bounded after the recovery generation and the visible Retry starts an independent episode", async () => {
  const { render, screen, fireEvent } = await import("@testing-library/react")
  const { useProjectList } = await import("@/features/app/use-project-list")
  const { AppGate } = await import("@/ui/auth/app-gate")
  const { LocaleProvider } = await import("@/i18n/context")
  admittedProjectFixture = function AdmittedProjectFixture({ projectReadBoundary }) {
    const collection = useProjectList(false, projectReadBoundary)
    return <output data-testid="read401-projects">{collection.list.status}</output>
  }
  let reads = 0
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/auth/csrf") return csrf()
    if (path === "/api/auth/session") return init?.method === "POST" ? renewed() : session()
    if (path === "/api/hub/projects") return ++reads < 3
      ? Response.json({ error: { code: "session_invalid" } }, { status: 401 })
      : Response.json({ data: { projects: [] }, meta: { request_id: "manual-read" } })
    throw new Error("unexpected controlled read")
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(<LocaleProvider><AppGate /></LocaleProvider>)
  try {
    const retry = await screen.findByRole("button", { name: "Retry" })
    expect(screen.getByRole("status", { name: "Connection interrupted" })).toHaveTextContent("Connection interrupted")
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument()
    expect(reads).toBe(2)
    expect(screen.getByTestId("read401-projects")).toHaveTextContent("blocked")
    const count = fetchMock.mock.calls.length
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(count)
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByTestId("read401-projects")).toHaveTextContent("ready"))
    expect(reads).toBe(3)
    expect(fetchMock.mock.calls.filter(([path, init]) => path === "/api/auth/session" && init?.method === "POST")).toHaveLength(1)
  } finally { view.unmount(); admittedProjectFixture = undefined }
})

it("current read401 from simultaneous old-generation readers joins an ongoing refresh without cancelling or duplicating its POST", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let finishRefresh!: (value: Response) => void
  const pendingRefresh = new Promise<Response>(resolve => { finishRefresh = resolve })
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(csrf()).mockReturnValueOnce(pendingRefresh)
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const old = view.result.current.projectReadBoundary
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    const authSignal = (fetchMock.mock.calls[4]![1] as RequestInit).signal!
    const signal = new AbortController().signal
    act(() => {
      view.result.current.reportReadUnauthorized({ ...old, signal })
      view.result.current.reportReadUnauthorized({ ...old, signal })
      view.result.current.reportReadUnauthorized({ ...old, signal })
    })
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(false))
    expect(view.result.current.readRecoveryBlocked).toBe(false)
    expect(authSignal.aborted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    await act(async () => { finishRefresh(renewed()) })
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const next = view.result.current.projectReadBoundary
    expect(next.generation).toBeGreaterThan(old.generation)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    act(() => { view.result.current.reportReadUnauthorized({ ...old, signal }) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(true)
    act(() => { view.result.current.reportReadUnauthorized({ ...next, signal }) })
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(view.result.current.readRecoveryBlocked).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  } finally { finishRefresh(renewed()); view.unmount() }
})

it("current read401 ignores aborted, foreign and stale proofs and pagehide does not spend a recovery", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockImplementation(async () => session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const old = view.result.current.projectReadBoundary, active = new AbortController(), aborted = new AbortController()
    aborted.abort()
    act(() => {
      view.result.current.reportReadUnauthorized({ ...old, signal: aborted.signal })
      view.result.current.reportReadUnauthorized({ ...old, subject: "other-reader", signal: active.signal })
      view.result.current.reportReadUnauthorized({ ...old, generation: old.generation - 1, signal: active.signal })
      window.dispatchEvent(new Event("pagehide"))
      view.result.current.reportReadUnauthorized({ ...old, signal: active.signal })
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    act(() => window.dispatchEvent(new Event("pageshow")))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    act(() => { view.result.current.reportReadUnauthorized({ ...view.result.current.projectReadBoundary, signal: active.signal }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.readRecoveryBlocked).toBe(false)
  } finally { view.unmount() }
})

it.each(["projection", "api", "detail", "composer", "project"] as const)("reports only a current typed HTTP401 from the production %s GET owner", async kind => {
  const { ProductReadRecheckProvider } = await import("@/ui/auth/product-read-recheck-context")
  const { createHubClient, HubClientError } = await import("@/hub/client")
  const { useMcpProjection } = await import("@/ui/mcp/use-mcp-projection")
  const { useCustomApiProjection } = await import("@/ui/mcp/use-custom-api-projection")
  const { useMcpProviderConnection } = await import("@/ui/mcp/use-mcp-provider-connection")
  const { useComposerConnections } = await import("@/ui/shell/use-composer-connections")
  const { useProjectList } = await import("@/features/app/use-project-list")
  const { createSessionEngine } = await import("@/engine/machine")
  const { createFakeClient, createMemoryStorage } = await import("../engine/fakes")
  const engine = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<import("@/core/conversations").ConversationStore>(null) })
  const boundary = { admitted: true, subject: "read-proof-owner", generation: 7 }
  for (const failure of ["401", "403", "parse401", "network", "aborted"] as const) {
    const error = new HubClientError(failure === "401" || failure === "403" ? "http" : failure === "parse401" ? "parse" : failure, "controlled read failure", null, failure === "403" ? 403 : 401)
    const fail = vi.fn(async () => { throw error })
    const client = { ...createHubClient(), listMcpConnectorProviders: fail, listCustomApis: fail, getMcpConnector: fail,
      listMcpConnectors: vi.fn(async () => ({ items: [], next_cursor: null })),
      listMcpConnections: vi.fn(async () => ({ connections: [{ connection_id: "connection:a", connector_id: "connector:a", server_id: "server:a", provider_key: "qa", transport: "streamable_http" as const, status: "active" as const }] })),
    }
    const projectFetch = vi.fn(async () => {
      if (failure === "401" || failure === "403") return new Response(null, { status: failure === "401" ? 401 : 403 })
      if (failure === "parse401") return Response.json({ invalid: true })
      throw failure === "aborted" ? new DOMException("controlled abort", "AbortError") : new TypeError("controlled network")
    })
    vi.stubGlobal("fetch", projectFetch)
    const report = vi.fn((proof: import("@/ui/auth/product-read-recheck-context").ProductRead401) => {
      expect(proof).toMatchObject({ subject: boundary.subject, generation: boundary.generation })
      expect(proof.signal.aborted).toBe(false)
    })
    const wrapper = ({ children }: { children: import("react").ReactNode }) => <ProductReadRecheckProvider value={report}>{children}</ProductReadRecheckProvider>
    const readers = {
      projection: function useProjectionReader() { return useMcpProjection({ client, identity: boundary.subject, cursor: null, view: "catalog", admitted: true, readGeneration: 7 }) },
      api: function useApiReader() { return useCustomApiProjection({ client, identity: boundary.subject, refreshKey: 0, admitted: true, readGeneration: 7 }) },
      detail: function useDetailReader() { return useMcpProviderConnection({ client, identity: boundary.subject, admitted: true, readGeneration: 7, connectorId: "connector:a", providerKey: "qa", known: undefined, retry: 0 }) },
      composer: function useComposerReader() { return useComposerConnections({ engine, client, boundary, enforceSubjectMarker: false }) },
      project: function useProjectReader() { return useProjectList(false, boundary) },
    }
    const view = renderHook(() => { readers[kind]() }, { wrapper })
    try {
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
      if (kind === "project") expect(projectFetch).toHaveBeenCalledOnce()
      else expect(fail).toHaveBeenCalledOnce()
      expect(report).toHaveBeenCalledTimes(failure === "401" ? 1 : 0)
    } finally { view.unmount() }
  }
  engine.dispose()
})

it("current read401 does not consume the new actor epoch during a queued A-to-B-to-A retirement", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed()).mockImplementation(async () => session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const old = view.result.current.projectReadBoundary, signal = new AbortController().signal
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage, oldValue: "reader-a", newValue: "reader-b" }))
      view.result.current.reportReadUnauthorized({ ...old, signal })
    })
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.projectReadBoundary.generation).toBeGreaterThan(old.generation)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    act(() => { view.result.current.reportReadUnauthorized({ ...view.result.current.projectReadBoundary, signal }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.readRecoveryBlocked).toBe(false)
  } finally { view.unmount() }
})

it("current read401 receives another credit only after an independent normal renewal cycle", async () => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => path === "/api/auth/csrf" ? csrf() : init?.method === "POST" ? renewed() : session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const report = () => view.result.current.reportReadUnauthorized({ ...view.result.current.projectReadBoundary, signal: new AbortController().signal })
    act(report)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(view.result.current.requestPending).toBe(false))
    act(report)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.readRecoveryBlocked).toBe(false)
  } finally { view.unmount() }
})

it.each(["readonly", "rotating"] as const)("current read401 releases a retired pending %s observation so a later focus can recover", async kind => {
  let now = 0
  vi.spyOn(Date, "now").mockImplementation(() => now)
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  const fetchMock = vi.fn().mockResolvedValueOnce(session()).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(session())
  if (kind === "rotating") fetchMock.mockResolvedValueOnce(csrf())
  fetchMock.mockReturnValueOnce(pending).mockImplementation(async () => session())
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useSessionProbe())
  try {
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const signal = new AbortController().signal
    act(() => { view.result.current.reportReadUnauthorized({ ...view.result.current.projectReadBoundary, signal }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    const recovered = view.result.current.projectReadBoundary
    if (kind === "rotating") now = 120_001
    act(() => window.dispatchEvent(new Event("focus")))
    const pendingCount = kind === "rotating" ? 6 : 5
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(pendingCount))
    const authSignal = (fetchMock.mock.calls[pendingCount - 1]![1] as RequestInit).signal!
    act(() => { view.result.current.reportReadUnauthorized({ ...recovered, signal }) })
    expect(view.result.current.readRecoveryBlocked).toBe(true)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(pendingCount)
    expect(authSignal.aborted).toBe(false)
    await act(async () => { finish(kind === "rotating" ? renewed() : session()) })
    // A retired observation must release only its scheduler slot, not grant admission.
    expect(view.result.current.readRecoveryBlocked).toBe(true)
    expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    expect(authSignal.aborted).toBe(false)
    act(() => window.dispatchEvent(new Event("focus")))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(pendingCount + 1))
    await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
    expect(view.result.current.readRecoveryBlocked).toBe(false)
    expect(fetchMock.mock.calls.at(-1)![1]).not.toMatchObject({ method: "POST" })
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(kind === "rotating" ? 2 : 1)
  } finally { finish(session()); view.unmount() }
})
