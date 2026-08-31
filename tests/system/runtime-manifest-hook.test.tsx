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
