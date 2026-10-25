import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useState } from "react"

import { LocaleProvider } from "@/i18n/context"
import { ContextPanel } from "@/components/blocks/context-panel/context-panel"
import { CanvasPanel } from "@/ui/canvas/canvas-panel"

const originalWidth = window.innerWidth

afterEach(() => {
  cleanup()
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth })
})

it("窄视口的桌面 User Web 仍使用并列 Canvas，而不是 Sheet 遮罩", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 786 })

  render(
    <LocaleProvider>
      <ContextPanel
        sessionId="session_1"
        content={{ kind: "node", title: "调研报告", node: <p>内容</p> }}
        files={[]}
        deliveries={[]}
        fullscreen={false}
        onSelectFile={vi.fn()}
        onSelectDelivery={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onClose={vi.fn()}
      />
    </LocaleProvider>,
  )

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(screen.getByRole("complementary")).toHaveClass(/desktopPanel/)
})

it("桌面 Canvas 的视图、全屏、关闭动作都有明确操作语义", async () => {
  const onClose = vi.fn()
  const onToggleFullscreen = vi.fn()

  render(
    <LocaleProvider>
      <CanvasPanel
        sessionId="session_1"
        content={{ kind: "node", title: "调研报告", node: <p>内容</p> }}
        files={[]}
        deliveries={[]}
        fullscreen={false}
        onSelectFile={vi.fn()}
        onSelectDelivery={vi.fn()}
        onToggleFullscreen={onToggleFullscreen}
        onClose={onClose}
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("button", { name: "Fullscreen" })).toHaveAttribute("aria-pressed", "false")
  expect(screen.getAllByRole("complementary")).toHaveLength(1)
  expect(screen.getByRole("complementary")).toHaveClass(/desktopPanel/)
  fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }))
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }))
  expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it("桌面 Canvas 关闭后也能把焦点交还给打开预览的触发按钮", async () => {
  const onOpen = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => { onOpen(); setOpen(true) }}>打开预览</button>
        {open ? (
          <ContextPanel
            sessionId="session_1"
            content={{ kind: "node", title: "调研报告", node: <p>内容</p> }}
            files={[]}
            deliveries={[]}
            fullscreen={false}
            onSelectFile={vi.fn()}
            onSelectDelivery={vi.fn()}
            onToggleFullscreen={vi.fn()}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    )
  }

  render(<LocaleProvider><Harness /></LocaleProvider>)
  const trigger = screen.getByRole("button", { name: "打开预览" })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole("button", { name: /Close preview|关闭预览/ }))
  await waitFor(() => expect(trigger).toHaveFocus())
})

it("多个 Canvas 触发器同时存在时关闭回到实际打开者而不是最后一个 DOM 按钮", async () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" data-canvas-opener="true" onClick={() => setOpen(true)}>打开第一个预览</button>
        <button type="button" data-canvas-opener="true">另一个成果</button>
        {open ? (
          <ContextPanel
            sessionId="session_1"
            content={{ kind: "node", title: "调研报告", node: <p>内容</p> }}
            files={[]}
            deliveries={[]}
            fullscreen={false}
            onSelectFile={vi.fn()}
            onSelectDelivery={vi.fn()}
            onToggleFullscreen={vi.fn()}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    )
  }

  render(<LocaleProvider><Harness /></LocaleProvider>)
  const opener = screen.getByRole("button", { name: "打开第一个预览" })
  opener.focus()
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole("button", { name: /Close preview|关闭预览/ }))
  await waitFor(() => expect(opener).toHaveFocus())
})

it("Canvas 文件列表的长路径保持可选且不重复渲染原始路径", () => {
  const longPath = "/workspace/projects/very-long-folder-name/output/final-report.md"
  const onSelectFile = vi.fn()

  render(
    <LocaleProvider>
      <CanvasPanel
        sessionId="session_1"
        content={{ kind: "file", file: { path: longPath, mime: "text/markdown", bytes: 2048 } }}
        files={[{ path: longPath, mime: "text/markdown", bytes: 2048 }]}
        deliveries={[]}
        fullscreen={false}
        onSelectFile={onSelectFile}
        onSelectDelivery={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onClose={vi.fn()}
      />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("radio", { name: "Files" }))
  const fileButton = screen.getByRole("button", { name: /very-long-folder-name\/output\/final-report\.md/ })
  expect(fileButton).toBeInTheDocument()
  expect(fileButton).toHaveAttribute("aria-pressed", "true")
  fireEvent.click(fileButton)
  expect(onSelectFile).toHaveBeenCalledWith({ path: longPath, mime: "text/markdown", bytes: 2048 })
})

it("Canvas 从文件列表回到预览时把焦点交给稳定标题", async () => {
  render(
    <LocaleProvider>
      <CanvasPanel
        sessionId="session_1"
        content={{ kind: "file", file: { path: "out/report.md", mime: "text/markdown", bytes: 12 } }}
        files={[{ path: "out/report.md", mime: "text/markdown", bytes: 12 }]}
        deliveries={[]}
        fullscreen={false}
        onSelectFile={vi.fn()}
        onSelectDelivery={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onClose={vi.fn()}
      />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("radio", { name: "Files" }))
  fireEvent.click(screen.getByRole("button", { name: /out\/report\.md/ }))
  await waitFor(() => expect(screen.getByRole("heading", { name: "out/report.md" })).toHaveFocus())
})

it("Canvas 下载失败后把同一按钮明确变为重新下载", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
  render(
    <LocaleProvider>
      <CanvasPanel
        sessionId="session_1"
        content={{ kind: "file", file: { path: "out/report.md", mime: "text/markdown", bytes: 12 } }}
        files={[]}
        deliveries={[]}
        fullscreen={false}
        onSelectFile={vi.fn()}
        onSelectDelivery={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onClose={vi.fn()}
      />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: /Download|下载/ }))
  expect(await screen.findByRole("button", { name: /Retry download|重新下载/ })).toBeInTheDocument()
  expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1)
})

it("Canvas 在 disabled 提交前的双击也只发起一次下载", async () => {
  let resolveFetch: ((value: { ok: boolean; blob: () => Promise<Blob> }) => void) | undefined
  const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
  vi.stubGlobal("fetch", fetchMock)

  render(
    <LocaleProvider>
      <CanvasPanel
        sessionId="session_1"
        content={{ kind: "file", file: { path: "out/report.md", mime: "text/markdown", bytes: 12 } }}
        files={[]}
        deliveries={[]}
        fullscreen={false}
        onSelectFile={vi.fn()}
        onSelectDelivery={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onClose={vi.fn()}
      />
    </LocaleProvider>,
  )

  const button = screen.getByRole("button", { name: /Download|下载/ })
  const previewRequestCount = fetchMock.mock.calls.length
  fireEvent.click(button)
  fireEvent.click(button)
  expect(fetchMock).toHaveBeenCalledTimes(previewRequestCount + 1)

  resolveFetch?.({ ok: true, blob: async () => new Blob(["markdown"]) })
  await waitFor(() => expect(button).not.toBeDisabled())
})

it("Canvas 跨会话切换后关闭时不回收到旧会话的已卸载触发器", async () => {
  function Harness() {
    const [sessionId, setSessionId] = useState("session_1")
    return (
      <>
        <button type="button" onClick={() => setSessionId("session_2")}>切换会话</button>
        <ContextPanel
          sessionId={sessionId}
          content={{ kind: "node", title: sessionId, node: <p>{sessionId}</p> }}
          files={[]}
          deliveries={[]}
          fullscreen={false}
          onSelectFile={vi.fn()}
          onSelectDelivery={vi.fn()}
          onToggleFullscreen={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    )
  }

  render(<LocaleProvider><Harness /></LocaleProvider>)
  const switchButton = screen.getByRole("button", { name: "切换会话" })
  switchButton.focus()
  fireEvent.click(switchButton)
  fireEvent.click(screen.getByRole("button", { name: /Close preview|关闭预览/ }))
  await waitFor(() => expect(switchButton).toHaveFocus())
})

it("Canvas 的旧触发器卸载后回收到稳定的 shadcn 导航触发器", async () => {
  function Harness() {
    const [sessionId, setSessionId] = useState("session_1")
    return (
      <>
        <button data-sidebar="trigger" type="button">稳定导航</button>
        {sessionId === "session_1" ? (
          <button type="button" onClick={() => setSessionId("session_2")}>替换会话</button>
        ) : null}
        <ContextPanel
          sessionId={sessionId}
          content={{ kind: "node", title: sessionId, node: <p>{sessionId}</p> }}
          files={[]}
          deliveries={[]}
          fullscreen={false}
          onSelectFile={vi.fn()}
          onSelectDelivery={vi.fn()}
          onToggleFullscreen={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    )
  }

  render(<LocaleProvider><Harness /></LocaleProvider>)
  const oldTrigger = screen.getByRole("button", { name: "替换会话" })
  const stableTrigger = screen.getByRole("button", { name: "稳定导航" })
  oldTrigger.focus()
  fireEvent.click(oldTrigger)
  fireEvent.click(screen.getByRole("button", { name: /Close preview|关闭预览/ }))
  await waitFor(() => expect(stableTrigger).toHaveFocus())
})

it("桌面 Canvas 关闭过渡期间不进入读屏和键盘顺序", async () => {
  function Harness() {
    return (
      <>
        <ContextPanel
          sessionId="session_1"
          content={{ kind: "node", title: "调研报告", node: <p>内容</p> }}
          files={[]}
          deliveries={[]}
          fullscreen={false}
          onSelectFile={vi.fn()}
          onSelectDelivery={vi.fn()}
          onToggleFullscreen={vi.fn()}
          onClose={vi.fn()}
        />
      </>
    )
  }

  render(<LocaleProvider><Harness /></LocaleProvider>)
  const panel = screen.getByRole("complementary")
  const host = panel.parentElement
  expect(host).not.toBeNull()
  fireEvent.click(screen.getByRole("button", { name: /Close preview|关闭预览/ }))
  await waitFor(() => expect(host).toHaveAttribute("aria-hidden", "true"))
  expect(host).toHaveAttribute("inert")
})

import { createHash, webcrypto } from "node:crypto"
import { act } from "@testing-library/react"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

const artifactText = "# Real delivery\n中文正文 <script>alert(1)</script> ![no network](https://foreign.test/x.png)"
const artifactBytes = new TextEncoder().encode(artifactText)
const textDelivery = { conversationId: "session_1", artifactId: "artifact_text", assetId: "asset_text", artifactKind: "document" as const, title: "Delivered text", mime: "text/markdown", size: artifactBytes.length, runId: "run_1", createdAt: "2026-10-25T00:00:00Z" }
const textBoundary = { admitted: true, subject: "preview-reader", generation: 1 }
function textMetadata(artifactId = "artifact_text") {
  return Response.json({ data: { kind: "artifact", conversation_id: "session_1", artifact_id: artifactId, asset_id: "asset_text", artifact_kind: "document", title: "Delivered text", filename: "report.md", mime_type: "text/markdown", size_bytes: String(artifactBytes.length), content_sha256: createHash("sha256").update(artifactBytes).digest("hex"), source_run_id: "run_1", delivered_at: "2026-10-25T00:00:00Z" }, meta: { request_id: "preview-request" } })
}
function textResponse() { return new Response(artifactBytes, { headers: { "content-type": "text/markdown", "content-length": String(artifactBytes.length) } }) }
function renderTextCanvas(boundary: ProjectReadBoundary | undefined, delivery = textDelivery) {
  return <LocaleProvider><CanvasPanel sessionId="session_1" content={{ kind: "delivery", delivery }} files={[]} deliveries={[delivery]} fullscreen={false} onSelectFile={vi.fn()} onSelectDelivery={vi.fn()} onToggleFullscreen={vi.fn()} onClose={vi.fn()} {...(boundary === undefined ? {} : { readBoundary: boundary })} /></LocaleProvider>
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.removeItem("kokoro.web.auth-index-subject") })

it("Canvas opens the actual bounded delivered bytes, not just metadata, without executing Markdown or fetching external resources", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const fetcher = vi.fn().mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse())
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(view.container.querySelector("pre")).toHaveTextContent("Real delivery"))
  expect(view.container.querySelector("pre")?.textContent).toBe(artifactText)
  expect(view.container.querySelector("script, img, iframe")).toBeNull()
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual(["/api/hub/library/artifacts/session_1/artifact_text", "/api/hub/library/artifacts/session_1/artifact_text/content"])
  expect(screen.getByRole("button", { name: "Download" })).toBeEnabled()
})

it.each([undefined, { admitted: false, subject: "preview-reader", generation: 1 }])("missing or retired trusted boundary refuses preview but leaves native download available %j", async boundary => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher)
  render(renderTextCanvas(boundary))
  expect(screen.getByText("Cannot preview — please download.")).toBeVisible()
  expect(screen.getByRole("button", { name: "Download" })).toBeEnabled()
  expect(fetcher).not.toHaveBeenCalled()
})

it.each([{ ...textDelivery, size: 65537 }, { ...textDelivery, mime: "text/html" }])("unsupported or large Delivery does not request bytes or execute a renderer %j", async delivery => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher)
  render(renderTextCanvas(textBoundary, delivery))
  expect(screen.getByText("Cannot preview — please download.")).toBeVisible()
  expect(fetcher).not.toHaveBeenCalled()
})

it("switching artifact or trusted generation retires the old request and never shows its late text", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const pending: { url: string; signal: AbortSignal; resolve: (response: Response) => void }[] = []
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => new Promise<Response>(resolve => pending.push({ url, signal: options.signal!, resolve }))))
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(pending).toHaveLength(1))
  view.rerender(renderTextCanvas({ ...textBoundary, generation: 2 }, { ...textDelivery, artifactId: "artifact_next" }))
  await waitFor(() => expect(pending).toHaveLength(2))
  expect(pending[0]!.signal.aborted).toBe(true)
  await act(async () => { pending[0]!.resolve(textMetadata()); await Promise.resolve() })
  expect(view.container.querySelector("pre")).toBeNull()
  expect(pending).toHaveLength(2)
  view.rerender(renderTextCanvas({ ...textBoundary, admitted: false, generation: 3 }))
  expect(pending[1]!.signal.aborted).toBe(true)
  expect(screen.getByText("Cannot preview — please download.")).toBeVisible()
})

it("actor marker retirement and user cancellation abort preview without reopening the retired actor on retry", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  let requestSignal: AbortSignal | undefined
  const fetcher = vi.fn((_url: string, options: RequestInit) => { requestSignal = options.signal!; return new Promise<Response>(() => {}) })
  vi.stubGlobal("fetch", fetcher)
  render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(requestSignal?.aborted).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  act(() => {
    window.localStorage.setItem("kokoro.web.auth-index-subject", "other-reader")
    window.dispatchEvent(new StorageEvent("storage", { key: "kokoro.web.auth-index-subject", newValue: "other-reader" }))
  })
  expect(requestSignal?.aborted).toBe(true)
  expect(screen.getByText("Cannot preview — please download.")).toBeVisible()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it("a trusted generation change alone hides old text, aborts its body and cannot display a late previous generation", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  let finishContent!: (response: Response) => void
  const fetcher = vi.fn().mockResolvedValueOnce(textMetadata()).mockImplementationOnce(() => new Promise<Response>(resolve => { finishContent = resolve }))
    .mockImplementation(() => new Promise<Response>(() => {}))
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  const oldSignal = fetcher.mock.calls[1]![1].signal as AbortSignal
  view.rerender(renderTextCanvas({ ...textBoundary, generation: 2 }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
  expect(oldSignal.aborted).toBe(true)
  await act(async () => { finishContent(textResponse()); await Promise.resolve(); await Promise.resolve() })
  expect(view.container.querySelector("pre")).toBeNull()
  view.unmount()
  expect(fetcher.mock.calls[2]![1].signal.aborted).toBe(true)
})

it("a preview failure retries only explicitly, while native download keeps its exact owner filename and binary URL", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const invalid = textMetadata()
  const bad = await invalid.json(); bad.data.content_sha256 = "0".repeat(64)
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(bad)).mockResolvedValueOnce(textResponse())
    .mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse()).mockResolvedValueOnce(textMetadata())
  vi.stubGlobal("fetch", fetcher)
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  const view = render(renderTextCanvas(textBoundary))
  expect(await screen.findByRole("button", { name: "Reload preview" })).toBeVisible()
  expect(view.container.querySelector("pre")).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }))
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toBe(artifactText))
  fireEvent.click(screen.getByRole("button", { name: "Download" }))
  await waitFor(() => expect(click).toHaveBeenCalledOnce())
  const anchor = click.mock.instances[0] as HTMLAnchorElement
  expect(anchor.href).toContain("/api/hub/library/artifacts/session_1/artifact_text/content")
  expect(anchor.download).toBe("report.md")
  expect(fetcher).toHaveBeenCalledTimes(5)
})

it.each(["subject", "generation", "artifact"] as const)("a synchronous %s replacement hides already verified old text in the same render", async changed => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const fetcher = vi.fn().mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse()).mockImplementation(() => new Promise<Response>(() => {}))
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toBe(artifactText))
  if (changed === "subject") window.localStorage.setItem("kokoro.web.auth-index-subject", "next-reader")
  view.rerender(renderTextCanvas({ ...textBoundary, ...(changed === "subject" ? { subject: "next-reader" } : changed === "generation" ? { generation: 2 } : {}) }, changed === "artifact" ? { ...textDelivery, artifactId: "artifact_next" } : textDelivery))
  expect(view.container.querySelector("pre")).toBeNull()
  expect(screen.getByText("Loading preview…")).toBeVisible()
})

it("closing the Canvas retires a text request immediately, before any parent's delayed exit unmount", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  let signal!: AbortSignal
  const fetcher = vi.fn((_url: string, options: RequestInit) => { signal = options.signal!; return new Promise<Response>(() => {}) })
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }))
  expect(signal.aborted).toBe(true)
  expect(view.container.querySelector("pre")).toBeNull()
})

it("queued auth-index A to B to A retires a pending preview before the parent commits and only a fresh generation can read again", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    .mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse())
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  const oldSignal = fetcher.mock.calls[0]![1].signal as AbortSignal
  act(() => {
    // Both actual writes precede delivery of either queued storage event.
    window.localStorage.setItem("kokoro.web.auth-index-subject", "other-reader")
    window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
    window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: "kokoro.web.auth-index-subject", oldValue: "preview-reader", newValue: "other-reader" }))
    window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: "kokoro.web.auth-index-subject", oldValue: "other-reader", newValue: "preview-reader" }))
  })
  expect(oldSignal.aborted).toBe(true)
  expect(screen.getByText("Cannot preview — please download.")).toBeVisible()
  await act(async () => { finish(textMetadata()); await Promise.resolve(); await Promise.resolve() })
  expect(fetcher).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(fetcher).toHaveBeenCalledOnce()
  view.rerender(renderTextCanvas({ ...textBoundary, generation: 2 }))
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toBe(artifactText))
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it("queued auth-index change and clear hide verified text immediately without reviving on same-generation retry", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const fetcher = vi.fn().mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse())
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toBe(artifactText))
  act(() => {
    window.localStorage.setItem("kokoro.web.auth-index-subject", "other-reader")
    window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
    window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: "kokoro.web.auth-index-subject", oldValue: "preview-reader", newValue: "other-reader" }))
  })
  expect(view.container.querySelector("pre")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(fetcher).toHaveBeenCalledTimes(2)
  act(() => { window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: null })) })
  expect(view.container.querySelector("pre")).toBeNull()
})

it("a queued localStorage clear retires ready text even if its marker has already been restored", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const fetcher = vi.fn().mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse())
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toBe(artifactText))
  act(() => {
    window.localStorage.clear()
    window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
    window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: null }))
  })
  expect(view.container.querySelector("pre")).toBeNull()
  expect(screen.getByText("Cannot preview — please download.")).toBeVisible()
})

it("unrelated storage and unchanged auth-index events do not revoke the still-current verified preview", async () => {
  window.localStorage.setItem("kokoro.web.auth-index-subject", "preview-reader")
  vi.stubGlobal("crypto", webcrypto)
  const fetcher = vi.fn().mockResolvedValueOnce(textMetadata()).mockResolvedValueOnce(textResponse())
  vi.stubGlobal("fetch", fetcher)
  const view = render(renderTextCanvas(textBoundary))
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toBe(artifactText))
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: "theme", oldValue: "light", newValue: "dark" }))
    window.dispatchEvent(new StorageEvent("storage", { storageArea: window.localStorage, key: "kokoro.web.auth-index-subject", oldValue: "preview-reader", newValue: "preview-reader" }))
  })
  expect(view.container.querySelector("pre")?.textContent).toBe(artifactText)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
