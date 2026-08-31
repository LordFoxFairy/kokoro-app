import { renderHook, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  canvasWidthFromLayout,
  clampCanvas,
  clampPreferredCanvas,
  snapCanvasWidth,
  useCanvasResize,
} from "@/ui/canvas/use-canvas-resize"

const originalResizeObserver = globalThis.ResizeObserver

afterEach(() => {
  if (originalResizeObserver === undefined) {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  } else {
    globalThis.ResizeObserver = originalResizeObserver
  }
  vi.restoreAllMocks()
})

function sizedElement(width: number) {
  const element = document.createElement("div")
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({
    width,
    height: 720,
    top: 0,
    right: width,
    bottom: 720,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect)
  return element
}

describe("Canvas resizable layout", () => {
  it("snaps widths to the device pixel grid", () => {
    expect(snapCanvasWidth(480.49)).toBe(480)
    expect(snapCanvasWidth(480.51)).toBe(481)
  })

  it("keeps Canvas inside its pixel and main-surface constraints", () => {
    expect(clampCanvas(480, 704)).toBe(284)
    expect(clampCanvas(480, 1200)).toBe(480)
    expect(clampCanvas(900, 1200)).toBe(760)
    expect(clampCanvas(200, 500)).toBe(80)
    expect(clampCanvas(480, 641)).toBe(221)
    expect(clampPreferredCanvas(200)).toBe(320)
    expect(clampPreferredCanvas(900)).toBe(760)
  })

  it("translates the shadcn panel percentage into the Canvas pixel width", () => {
    expect(canvasWidthFromLayout(40, 1200)).toBe(480)
    expect(canvasWidthFromLayout(70, 1200)).toBe(760)
    expect(canvasWidthFromLayout(50, 704)).toBe(284)
    expect(canvasWidthFromLayout(Number.NaN, 1200)).toBe(0)
  })

  it("reconciles a panel layout without competing with the primitive gesture", () => {
    let notify: (() => void) | undefined
    class FakeResizeObserver {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver

    let containerWidth = 390
    const element = sizedElement(containerWidth)
    vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => ({
      width: containerWidth,
      height: 720,
      top: 0,
      right: containerWidth,
      bottom: 720,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect)
    const { result } = renderHook(() => useCanvasResize({ current: element }))

    act(() => notify?.())
    expect(result.current.width).toBe(0)

    act(() => result.current.onLayoutChange({ canvas: 40 }))
    expect(result.current.width).toBe(0)

    containerWidth = 1440
    act(() => notify?.())
    expect(result.current.width).toBe(480)

    act(() => result.current.onLayoutChange({ canvas: 35 }))
    expect(result.current.width).toBe(504)
  })
})
