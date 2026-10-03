import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSessionProbe } from "@/ui/auth/use-session-state"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useSessionProbe", () => {
  it("shares one in-flight session request between concurrent mounts", async () => {
    let resolve!: (response: Response) => void
    const response = new Promise<Response>((done) => {
      resolve = done
    })
    const fetchMock = vi.fn().mockReturnValue(response)
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
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
