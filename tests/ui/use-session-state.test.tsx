import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

const authenticated = (subject = "reader-a"): Response =>
  Response.json({ authenticated: true, subject, mode: "native" })
const anonymous = (): Response => Response.json({ authenticated: false })

describe("useSessionProbe native IAM boundary", () => {
  it("shares one in-flight native session read between concurrent mounts", async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    const fetchMock = vi.fn().mockReturnValueOnce(pending)
    vi.stubGlobal("fetch", fetchMock)
    const first = renderHook(() => useSessionProbe())
    const second = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      resolve(authenticated())
      await waitFor(() => expect(first.result.current.projectReadBoundary.admitted).toBe(true))
      expect(second.result.current.projectReadBoundary).toMatchObject({ admitted: true, subject: "reader-a" })
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/session", expect.objectContaining({ cache: "no-store" }))
    } finally {
      first.unmount()
      second.unmount()
    }
  })

  it("admits a native projection without CSRF reads, refresh POSTs, or Product Session state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(authenticated("reader-native"))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe({ serverAdmitted: true }))
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      expect(view.result.current).toMatchObject({ state: "pass", mode: "authenticated", projectReadBoundary: {
        subject: "reader-native", admitted: true,
      } })
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls.every(([path, init]) => path === "/api/auth/session" && init?.method === undefined)).toBe(true)
    } finally { view.unmount() }
  })

  it("keeps an anonymous projection closed and does not establish a browser subject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(anonymous())
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
      expect(view.result.current.projectReadBoundary).toEqual({ admitted: false, subject: null, generation: 1 })
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally { view.unmount() }
  })

  it("rejects malformed session projections as unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ authenticated: true, subject: " " }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.state).toBe("unavailable"))
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    } finally { view.unmount() }
  })

  it("preserves a same-subject boundary during a focused recheck", async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(authenticated())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      const boundary = view.result.current.projectReadBoundary
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      expect(view.result.current.projectReadBoundary).toBe(boundary)
      await act(async () => { finish(authenticated()) })
      await waitFor(() => expect(view.result.current.requestPending).toBe(false))
      expect(view.result.current.projectReadBoundary).toBe(boundary)
    } finally { view.unmount() }
  })

  it("retires admission when a native recheck becomes anonymous", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(anonymous())
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => expect(view.result.current.state).toBe("anonymous"))
      expect(view.result.current.projectReadBoundary).toMatchObject({ admitted: false, subject: null })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally { view.unmount() }
  })

  it("retires a pending check after a cross-tab identity marker change", async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn().mockResolvedValueOnce(authenticated()).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      act(() => {
        window.localStorage.setItem("kokoro.web.auth-index-subject", "reader-b")
        window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", storageArea: window.localStorage, oldValue: "reader-a", newValue: "reader-b" }))
      })
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
      await act(async () => { finish(authenticated()) })
      expect(view.result.current.projectReadBoundary.admitted).toBe(false)
    } finally { view.unmount() }
  })

  it("uses one bounded native GET for a read-unauthorized recovery", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(authenticated())
    vi.stubGlobal("fetch", fetchMock)
    const view = renderHook(() => useSessionProbe())
    try {
      await waitFor(() => expect(view.result.current.projectReadBoundary.admitted).toBe(true))
      const boundary = view.result.current.projectReadBoundary
      const signal = new AbortController().signal
      let accepted: Promise<boolean> | void = undefined
      act(() => { accepted = view.result.current.reportReadUnauthorized({ subject: "reader-a", generation: boundary.generation, signal }) })
      await expect(accepted).resolves.toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined)).toBe(true)
    } finally { view.unmount() }
  })
})
