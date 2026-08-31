import { renderHook, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PointerEvent as ReactPointerEvent } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_COMPACT_BREAKPOINT,
  RAIL_DEFAULT,
  clampRailWidth,
  snapResizeWidth,
  useRailResize,
} from "@/ui/rail/use-rail-resize"

afterEach(() => {
  vi.restoreAllMocks()
  document.body.style.cursor = ""
  document.body.style.userSelect = ""
  window.sessionStorage.clear()
})

describe("useRailResize", () => {
  it("公开桌面 Rail 的 52px 收起轨道、300px 默认宽度和 768px 自动收起阈值", () => {
    expect(RAIL_COLLAPSED_WIDTH).toBe(52)
    expect(RAIL_DEFAULT).toBe(300)
    expect(RAIL_COMPACT_BREAKPOINT).toBe(768)
  })

  it("将拖动宽度吸附到设备像素，避免分隔线被栅格化成双线", () => {
    expect(snapResizeWidth(320.49)).toBe(320)
    expect(snapResizeWidth(320.51)).toBe(321)
  })

  it("把 rail 宽度限制在最小/最大边界，并为 Canvas 保留主区", () => {
    expect(clampRailWidth(120, 1280)).toBe(240)
    expect(clampRailWidth(500, 1280)).toBe(440)
    expect(clampRailWidth(500, 1280, 480)).toBe(380)
  })

  it("键盘调整同步提交受控 Sidebar 的宽度", () => {
    const shell = document.createElement("div")
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      width: 1280, height: 720, top: 0, right: 1280, bottom: 720, left: 0, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const { result } = renderHook(() => useRailResize())
    result.current.shellRef.current = shell

    act(() => result.current.onResizeKeyDown({
      key: "ArrowRight",
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as ReactKeyboardEvent<HTMLElement>))

    expect(result.current.width).toBe(316)
  })

  it("拖动结束时恢复页面原有的指针与选择策略", () => {
    const shell = document.createElement("div")
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      width: 1280,
      height: 720,
      top: 0,
      right: 1280,
      bottom: 720,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const { result } = renderHook(() => useRailResize())
    result.current.shellRef.current = shell
    const handle = document.createElement("button")
    document.body.style.cursor = "crosshair"
    document.body.style.userSelect = "text"

    act(() => {
      result.current.onResizeStart({
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactPointerEvent<HTMLElement>)
    })
    expect(document.body.style.cursor).toBe("col-resize")
    expect(document.body.style.userSelect).toBe("none")
    expect(shell.dataset.railResizing).toBe("true")

    act(() => {
      handle.dispatchEvent(new Event("lostpointercapture"))
    })
    expect(document.body.style.cursor).toBe("crosshair")
    expect(document.body.style.userSelect).toBe("text")
    expect(shell.dataset.railResizing).toBeUndefined()
    expect(shell.dataset.resizing).toBeUndefined()
  })

  it("Canvas 打开时 Rail 的边界会为右侧轨道预留空间", () => {
    const shell = document.createElement("div")
    const panel = document.createElement("aside")
    panel.dataset.slot = "context-panel"
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      width: 1280,
      height: 720,
      top: 0,
      right: 1280,
      bottom: 720,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      width: 480,
      height: 720,
      top: 0,
      right: 1280,
      bottom: 720,
      left: 800,
      x: 800,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    shell.appendChild(panel)

    const { result } = renderHook(() => useRailResize())
    result.current.shellRef.current = shell
    const handle = document.createElement("button")
    act(() => {
      result.current.onResizeStart({
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactPointerEvent<HTMLElement>)
    })

    const move = new Event("pointermove")
    Object.defineProperty(move, "clientX", { value: 440 })
    act(() => window.dispatchEvent(move))
    // Rail and Canvas share the same 420px main-surface minimum.
    expect(result.current.width).toBe(380)
    // AppFrame is the sole owner of these variables. The resize hook must not
    // race its render with a second native style writer.
    expect(shell.style.getPropertyValue("--rail-width")).toBe("")
    expect(shell.style.getPropertyValue("--sidebar-width")).toBe("")
    expect(shell.style.getPropertyValue("--rail-divider-width")).toBe("")
    act(() => window.dispatchEvent(new Event("pointerup")))
    shell.remove()
  })

  it("Canvas 正在拖动时不启动第二个 Rail 手势", () => {
    const shell = document.createElement("div")
    shell.dataset.canvasResizing = "true"
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      width: 1280, height: 720, top: 0, right: 1280, bottom: 720, left: 0, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const { result } = renderHook(() => useRailResize())
    result.current.shellRef.current = shell
    const handle = document.createElement("button")

    act(() => result.current.onResizeStart({
      currentTarget: handle,
      preventDefault: vi.fn(),
    } as unknown as ReactPointerEvent<HTMLElement>))

    expect(result.current.isResizing).toBe(false)
    expect(shell.dataset.railResizing).toBeUndefined()
  })

})
