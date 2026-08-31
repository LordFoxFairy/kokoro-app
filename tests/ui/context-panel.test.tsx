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
