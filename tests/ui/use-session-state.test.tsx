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
