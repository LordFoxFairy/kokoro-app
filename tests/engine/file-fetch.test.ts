import { renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useFileBlob } from "@/engine/file-fetch"

afterEach(() => {
  vi.unstubAllGlobals()
})

it("组件卸载时取消未完成的预览抓取", () => {
  let signal: AbortSignal | null | undefined
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    signal = init?.signal
    return new Promise<Response>(() => {})
  }))

  const { unmount } = renderHook(() => useFileBlob("/api/session/files/file_1", true))
  expect(signal?.aborted).toBe(false)

  unmount()

  expect(signal?.aborted).toBe(true)
})
