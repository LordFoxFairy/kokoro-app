// 文件 chip 与 canvas 内容体：chip=路径即入口；PreviewBody 按 MIME 分派（媒体/懒文本/下载兜底）。
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/engine/config", () => ({ sessionBaseUrl: () => "http://s.local" }))

import { LocaleProvider } from "@/i18n/context"
import { FileChip, PreviewBody } from "@/ui/thread/artifact-card"
import { deliveryUrl, fileUrl } from "@/ui/canvas/canvas-panel"

describe("FileChip / PreviewBody / fileUrl", () => {
  beforeEach(() => {
    window.localStorage.setItem("kokoro.locale", "zh")
  })
  afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
    window.localStorage.removeItem("kokoro.auth.token")
  })

  it("chip：显示文件名，点击触发 onOpen（canvas 入口）", () => {
    const onOpen = vi.fn()
    render(<FileChip path="media/track.wav" onOpen={onOpen} />, { wrapper: LocaleProvider })
    screen.getByText("track.wav").click()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("fileUrl：files 端点 + 逐段编码", () => {
    expect(fileUrl("ses_1", "media/我的 文件.wav")).toBe(
      "http://s.local/sessions/ses_1/files/media/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6.wav",
    )
  })

  it("preview delivery：开发成果使用本地 fixture，不伪造 session BFF 请求", () => {
    expect(deliveryUrl("ses_1", "preview-delivery-report")).toBe(
      "/api/dev/preview-files/preview-delivery-report",
    )
    expect(deliveryUrl("ses_1", "sha256:report")).toBe(
      "http://s.local/sessions/ses_1/deliveries/sha256%3Areport",
    )
  })

  it("audio/*：同源鉴权拉取字节 → blob src 原生播放器（cookie 自动携带，前端不持 token）", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type: "audio/wav" }) })
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const { container } = render(
      <PreviewBody url="http://s.local/f.wav" mime="audio/wav" name="f.wav" />,
      { wrapper: LocaleProvider },
    )
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull())
    // src 必须是 blob（不是端点直连）：<audio src> 带不了自定义头，故一律 fetch→blob→object URL。
    expect(container.querySelector("audio")?.getAttribute("src")).toBe("blob:mock")
    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(reqUrl).toBe("http://s.local/f.wav")
    // 冻结当前鉴权形态（AUTH-P0）：同源 httpOnly 信封 cookie 自动携带 —— 前端不再持 token、
    // 不再手挂 Authorization 头。若哪天又出现 Bearer 头，即是把 token 漏回前端的回归。
    expect(init.headers).toBeUndefined()
    expect(init.cache).toBe("no-store")
  })

  it("未知类型：下载兜底文案", () => {
    render(<PreviewBody url="http://s.local/x" mime="application/octet-stream" name="x.bin" />, { wrapper: LocaleProvider })
    expect(screen.getByText(/暂不支持内嵌预览/)).toBeInTheDocument()
  })

  it("CSV 预览保留引号内逗号、转义引号和 CRLF", async () => {
    const csv = 'name,location\r\n"Acme, Inc.","New York, NY"\r\n"She said ""hi""",Paris\r\n'
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
    }))
    render(<PreviewBody url="http://s.local/data.csv" mime="text/csv" name="data.csv" />, { wrapper: LocaleProvider })
    await waitFor(() => expect(screen.getByText("New York, NY")).toBeInTheDocument())
    expect(screen.getByText("Acme, Inc.")).toBeInTheDocument()
    expect(screen.getByText('She said "hi"')).toBeInTheDocument()
  })

  it("文本预览离开时取消在途字节请求", () => {
    let signal: AbortSignal | null | undefined
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal
      return new Promise<Response>(() => {})
    }))
    const { unmount } = render(
      <PreviewBody url="http://s.local/slow.txt" mime="text/plain" name="slow.txt" />,
      { wrapper: LocaleProvider },
    )
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("文本预览失败时提供可操作的重新加载入口", async () => {
    let resolveRetry: ((value: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRetry = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    render(<PreviewBody url="http://s.local/fail.txt" mime="text/plain" name="fail.txt" />, { wrapper: LocaleProvider })

    await waitFor(() => expect(screen.getByRole("button", { name: "重新加载预览" })).toBeInTheDocument())
    screen.getByRole("button", { name: "重新加载预览" }).click()
    await waitFor(() => expect(screen.getByText("加载预览…")).toBeInTheDocument())
    resolveRetry?.({ ok: true, arrayBuffer: async () => new TextEncoder().encode("recovered").buffer } as Response)
    await waitFor(() => expect(screen.getByText("recovered")).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("切换文本文件时先清空旧正文，避免内容与标题错配", async () => {
    let resolveFirst: ((value: Response) => void) | undefined
    let resolveSecond: ((value: Response) => void) | undefined
    vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((resolve) => {
      if (url.endsWith("first.txt")) resolveFirst = resolve
      else resolveSecond = resolve
    })))
    const view = render(
      <PreviewBody url="http://s.local/first.txt" mime="text/plain" name="first.txt" />,
      { wrapper: LocaleProvider },
    )
    resolveFirst?.({ ok: true, arrayBuffer: async () => new TextEncoder().encode("first body").buffer } as Response)
    await waitFor(() => expect(screen.getByText("first body")).toBeInTheDocument())

    view.rerender(<PreviewBody url="http://s.local/second.txt" mime="text/plain" name="second.txt" />)
    expect(screen.queryByText("first body")).toBeNull()
    expect(screen.getByText("加载预览…")).toBeInTheDocument()

    resolveSecond?.({ ok: true, arrayBuffer: async () => new TextEncoder().encode("second body").buffer } as Response)
    await waitFor(() => expect(screen.getByText("second body")).toBeInTheDocument())
  })
})
