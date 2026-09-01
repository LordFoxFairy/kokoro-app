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
    resolve(new Response(JSON.stringify({ state: "authenticated" }), { status: 200 }))
    await waitFor(() => expect(first.result.current.mode).toBe("authenticated"))
    await waitFor(() => expect(second.result.current.mode).toBe("authenticated"))
    first.unmount()
    second.unmount()
  })
})
