import { afterEach, expect, it, vi } from "vitest"

import { overlayHandoffDelay } from "@/ui/shell/overlay-handoff"

afterEach(() => {
  vi.restoreAllMocks()
})

it("默认等待旧 overlay 的关闭动画完成", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList)
  expect(overlayHandoffDelay(300)).toBe(300)
})

it("减少动效时不额外等待 overlay 动画", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList)
  expect(overlayHandoffDelay(300)).toBe(0)
})
