import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useRuntimeManifest } from "@/system/use-runtime-manifest"

describe("useRuntimeManifest", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("keeps explicit preview transport completely offline", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRuntimeManifest({ preview: true }))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.source).toBe("preview")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not relabel a live manifest failure as preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("system unavailable")))

    const { result } = renderHook(() => useRuntimeManifest())

    await waitFor(() => expect(result.current.source).toBe("error"))
    expect(result.current.retry).toEqual(expect.any(Function))
  })

  it("drops stale site branding when a verified manifest later becomes unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        productId: "kokoro", locale: "en-US", navigation: [], localeNamespaces: [],
        theme: { brandName: "Previous Site", primary: "#7c3aed" },
        featureFlags: [], references: [], configVersion: "1", releaseId: null, digest: "previous",
      } }), { status: 200 }))
      .mockRejectedValueOnce(new Error("system unavailable"))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRuntimeManifest())
    await waitFor(() => expect(result.current.source).toBe("live"))
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#7c3aed")

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.source).toBe("error"))
    expect(result.current.manifest.brand.name).toBe("Kokoro")
    expect(document.title).toBe("Kokoro Web")
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
  })

  it("从 preview 切到 live 时先进入 loading，避免 mock 皮肤闪现", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(() => undefined))
    vi.stubGlobal("fetch", fetchMock)

    const { result, rerender } = renderHook(({ preview }: { preview: boolean }) =>
      useRuntimeManifest({ preview }), { initialProps: { preview: true } })

    expect(result.current.source).toBe("preview")
    rerender({ preview: false })

    await waitFor(() => expect(result.current.source).toBe("loading"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("marks retry as loading before the next manifest request resolves", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("system unavailable"))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRuntimeManifest())
    await waitFor(() => expect(result.current.source).toBe("error"))

    act(() => result.current.retry())
    expect(result.current.source).toBe("loading")
    expect(result.current.retrying).toBe(true)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it("projects System module arrays into the shell manifest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productId: "kokoro",
        locale: "en-US",
        navigation: [[{ key: "studio", label: "Studio", icon: "✦" }]],
        localeNamespaces: [],
        theme: {
          brandName: "First Site",
          brandLogoUrl: "/first-logo.svg",
          primary: "#7c3aed",
          ring: "#7c3aed; --foreground: red",
          radius: "0.5rem",
          fontSans: "Inter, sans-serif",
        },
        featureFlags: [[{ key: "workspace", enabled: true }]],
        references: [[{ key: "research", label: "Research", description: "Find and synthesize sources." }]],
        configVersion: "1",
        releaseId: null,
        digest: "digest",
      },
    }), { status: 200, headers: { "content-type": "application/json" } })))

    const { result } = renderHook(() => useRuntimeManifest())

    await waitFor(() => expect(result.current.source).toBe("live"))
    expect(result.current.manifest.navigation).toEqual([{ key: "studio", label: "Studio", icon: "✦" }])
    expect(result.current.manifest.featureFlags).toEqual([{ key: "workspace", enabled: true }])
    expect(result.current.manifest.capabilities).toEqual([{ key: "research", label: "Research", description: "Find and synthesize sources." }])
    expect(result.current.manifest.brand.name).toBe("First Site")
    expect(result.current.manifest.brand.logoUrl).toBe("/first-logo.svg")
    expect(document.title).toBe("First Site Web")
    expect(document.documentElement.style.getPropertyValue("--radius")).toBe("0.5rem")
    expect(document.documentElement.style.getPropertyValue("--font-geist-sans")).toBe("Inter, sans-serif")
    expect(result.current.manifest.theme).not.toHaveProperty("ring")
    expect(document.documentElement.style.getPropertyValue("--ring")).not.toContain("foreground")
  })

  it("ignores empty or whitespace-only runtime brand values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productId: "kokoro",
        locale: "en-US",
        navigation: [],
        localeNamespaces: [],
        theme: { brandName: "   ", brandMark: "" },
        featureFlags: [],
        references: [],
        configVersion: "1",
        releaseId: null,
        digest: "digest-empty-brand",
      },
    }), { status: 200, headers: { "content-type": "application/json" } })))

    const { result } = renderHook(() => useRuntimeManifest())
    await waitFor(() => expect(result.current.source).toBe("live"))
    expect(result.current.manifest.brand.name).toBe("Kokoro")
    expect(result.current.manifest.brand.mark).toBe("心")
  })

  it("rejects protocol-relative tenant navigation and logo URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productId: "kokoro",
        locale: "en-US",
        navigation: [{ key: "external", label: "External", href: "//evil.example/path" }],
        localeNamespaces: [],
        theme: { brandLogoUrl: "//evil.example/logo.svg" },
        featureFlags: [],
        references: [],
        configVersion: "1",
        releaseId: null,
        digest: "digest-relative-url",
      },
    }), { status: 200 })))

    const { result } = renderHook(() => useRuntimeManifest())
    await waitFor(() => expect(result.current.source).toBe("live"))
    expect(result.current.manifest.navigation).toEqual([])
    expect(result.current.manifest.brand.logoUrl).toBeUndefined()
  })

  it("keeps empty live navigation and capability configuration empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productId: "kokoro",
        locale: "en-US",
        navigation: [],
        localeNamespaces: [],
        theme: {},
        featureFlags: [],
        references: [],
        configVersion: "1",
        releaseId: null,
        digest: "digest-empty-site-config",
      },
    }), { status: 200 })))

    const { result } = renderHook(() => useRuntimeManifest())
    await waitFor(() => expect(result.current.source).toBe("live"))
    expect(result.current.manifest.navigation).toEqual([])
    expect(result.current.manifest.capabilities).toEqual([])
  })
})

// SET31: owned runtime request retirement
import { PREVIEW_RUNTIME_MANIFEST, PRODUCT_RUNTIME_MANIFEST } from "@/system/preview-runtime"

function set31Deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function set31Payload(name: string) {
  return { data: {
    productId: "kokoro", locale: "en-US", navigation: [], localeNamespaces: [],
    theme: { brandName: name, primary: "#123456" },
    featureFlags: [], references: [], configVersion: "1", releaseId: null, digest: name,
  } }
}
function set31Response(name: string) {
  return new Response(JSON.stringify(set31Payload(name)), { status: 200 })
}
function set31Render() {
  return renderHook(({ preview }: { preview: boolean }) => useRuntimeManifest({ preview }), { initialProps: { preview: false } })
}
async function set31Flush() {
  await act(async () => { await Promise.resolve() })
}
describe("SET31 runtime lifecycle", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("SET31 queued dispatch unmounts in the same turn without calling fetch", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(() => undefined))
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => view.unmount())
    await set31Flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("SET31 queued dispatch retires to preview in the same turn without calling fetch", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(() => undefined))
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    expect(fetchMock).not.toHaveBeenCalled()
    view.rerender({ preview: true })
    await set31Flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(view.result.current.source).toBe("preview")
    expect(view.result.current.manifest).toEqual(PREVIEW_RUNTIME_MANIFEST)
  })

  it.each(["preview", "unmount"] as const)("SET31 dispatched late response in %s does not start JSON", async (mode) => {
    const request = set31Deferred<Response>()
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal; return request.promise })
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    if (mode === "preview") view.rerender({ preview: true })
    else view.unmount()
    expect(signal?.aborted).toBe(true)
    const response = set31Response("Retired A")
    const json = vi.spyOn(response, "json")
    await act(async () => { request.resolve(response); await Promise.resolve() })
    expect(json).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (mode === "preview") {
      expect(view.result.current.manifest).toEqual(PREVIEW_RUNTIME_MANIFEST)
      expect(view.result.current.source).toBe("preview")
    }
    expect(document.title).not.toBe("Retired A Web")
  })

  it("SET31 already-started noncooperative JSON cannot commit after preview retirement", async () => {
    const body = set31Deferred<unknown>()
    const response = set31Response("Retired JSON")
    const json = vi.spyOn(response, "json").mockImplementation(() => body.promise)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    const view = set31Render()
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1))
    view.rerender({ preview: true })
    await act(async () => { body.resolve(set31Payload("Retired JSON")); await Promise.resolve() })
    expect(view.result.current.manifest.brand.name).not.toBe("Retired JSON")
    expect(view.result.current.manifest).toEqual(PREVIEW_RUNTIME_MANIFEST)
    expect(view.result.current.source).toBe("preview")
    expect(document.title).not.toBe("Retired JSON Web")
  })

  it("SET31 retired non-AbortError cannot replace the preview projection", async () => {
    const request = set31Deferred<Response>()
    const fetchMock = vi.fn().mockImplementation(() => request.promise)
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    view.rerender({ preview: true })
    await act(async () => { request.reject(new Error("old unavailable")); await Promise.resolve() })
    expect(view.result.current.source).toBe("preview")
    expect(view.result.current.manifest).toEqual(PREVIEW_RUNTIME_MANIFEST)
    expect(view.result.current.retrying).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(["response", "error"] as const)("SET31 live-preview-live B stays authoritative after old A %s", async (mode) => {
    const a = set31Deferred<Response>()
    const b = set31Deferred<Response>()
    const fetchMock = vi.fn().mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    view.rerender({ preview: true })
    view.rerender({ preview: false })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await act(async () => { b.resolve(set31Response("Current B")); await Promise.resolve() })
    await waitFor(() => expect(view.result.current.manifest.brand.name).toBe("Current B"))
    await act(async () => {
      if (mode === "response") a.resolve(set31Response("Old A"))
      else a.reject(new Error("old unavailable"))
      await Promise.resolve()
    })
    expect(view.result.current.source).toBe("live")
    expect(view.result.current.manifest.brand.name).toBe("Current B")
    expect(document.title).toBe("Current B Web")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("SET31 settled live retires to preview and a new live pending uses product defaults", async () => {
    const b = set31Deferred<Response>()
    const fetchMock = vi.fn().mockResolvedValueOnce(set31Response("Previous Site")).mockImplementationOnce(() => b.promise)
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    await waitFor(() => expect(view.result.current.source).toBe("live"))
    expect(view.result.current.manifest.brand.name).toBe("Previous Site")
    view.rerender({ preview: true })
    expect(view.result.current.manifest).toEqual(PREVIEW_RUNTIME_MANIFEST)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.rerender({ preview: false })
    expect(view.result.current.source).toBe("loading")
    expect(view.result.current.manifest).toEqual(PRODUCT_RUNTIME_MANIFEST)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await act(async () => { b.resolve(set31Response("Fresh Site")); await Promise.resolve() })
    await waitFor(() => expect(view.result.current.manifest.brand.name).toBe("Fresh Site"))
  })

  it("SET31 settled live unmount aborts its owned signal without another request", async () => {
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal; return Promise.resolve(set31Response("Settled")) })
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    await waitFor(() => expect(view.result.current.source).toBe("live"))
    view.unmount()
    await set31Flush()
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("SET31 new retry attempt cannot be overwritten by a retired noncooperative request", async () => {
    const a = set31Deferred<Response>()
    const b = set31Deferred<Response>()
    const fetchMock = vi.fn().mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)
    vi.stubGlobal("fetch", fetchMock)
    const view = set31Render()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => view.result.current.retry())
    expect(view.result.current.source).toBe("loading")
    expect(view.result.current.retrying).toBe(true)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await act(async () => { b.resolve(set31Response("Retry B")); await Promise.resolve() })
    await waitFor(() => expect(view.result.current.source).toBe("live"))
    await act(async () => { a.resolve(set31Response("Retired retry A")); await Promise.resolve() })
    expect(view.result.current.manifest.brand.name).toBe("Retry B")
    expect(view.result.current.retrying).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
