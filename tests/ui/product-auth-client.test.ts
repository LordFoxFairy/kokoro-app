import { afterEach, describe, expect, it, vi } from "vitest"

import { endProductSession, openProductSignIn } from "@/ui/auth/product-auth-client"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState({}, "", "/")
})

describe("native product auth browser client", () => {
  it("uses only the canonical IAM sign-out adapter", async () => {
    const navigate = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await endProductSession(navigate)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/iam/sign-out", {
      method: "POST",
      cache: "no-store",
    })
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/")
  })

  it.each([401, 303, 307])("treats an already-closed sign-out boundary %s as complete", async (status) => {
    const navigate = vi.fn()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })))
    await endProductSession(navigate)
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/")
  })

  it("keeps the caller abort between transport and navigation", async () => {
    const controller = new AbortController()
    const navigate = vi.fn()
    let resolve!: (response: Response) => void
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done })))
    const pending = endProductSession(navigate, controller.signal)
    resolve(new Response(null, { status: 204 }))
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("does not navigate after an unavailable native sign-out", async () => {
    const navigate = vi.fn()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    await expect(endProductSession(navigate)).rejects.toThrow("Native sign-out unavailable")
    expect(navigate).not.toHaveBeenCalled()
  })

  it("rejects an already aborted caller before network I/O", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(endProductSession(vi.fn(), controller.signal)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("native sign-in return target", () => {
  it.each([
    "/app?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app/project/project_00000000-0000-4000-8000-000000000301?conversation=conv_00000000-0000-4000-8000-000000000302",
    "/app/library?type=images&view=list",
  ])("retains the allowed return target %s", (target) => {
    window.history.replaceState({}, "", target + "#ignored")
    const navigate = vi.fn()
    openProductSignIn(navigate)
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`/login?${new URLSearchParams({ return_to: target })}`)
  })

  it.each(["/api/auth/session", "/app?unknown=value", "/app/project/arbitrary"])("drops invalid return target %s", (target) => {
    window.history.replaceState({}, "", target)
    const navigate = vi.fn()
    openProductSignIn(navigate)
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/login")
  })
})
