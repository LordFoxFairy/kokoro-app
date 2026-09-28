import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDraft } from "@/ui/shell/use-draft"

const DRAFTS_KEY = "kokoro.web.drafts"

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useDraft persistence", () => {
  it("debounces storage writes while keeping the latest draft in React", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDraft("conversation-1", true))

    act(() => {
      result.current.updateDraft("a")
      result.current.updateDraft("ab")
    })

    expect(result.current.draft).toBe("ab")
    expect(window.localStorage.getItem(DRAFTS_KEY)).toBeNull()

    act(() => vi.advanceTimersByTime(199))
    expect(window.localStorage.getItem(DRAFTS_KEY)).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}"))
      .toEqual({ "conversation-1": "ab" })
  })

  it("flushes a pending draft when the scoped composer unmounts", () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useDraft("conversation-2", true))

    act(() => result.current.updateDraft("keep this before navigation"))
    unmount()

    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}"))
      .toEqual({ "conversation-2": "keep this before navigation" })
  })

  it("keeps an empty project's draft separate from a newer direct-chat draft", () => {
    const { result, rerender } = renderHook(
      ({ projectRef }: { projectRef: string | undefined }) => useDraft(null, true, projectRef),
      { initialProps: { projectRef: undefined as string | undefined } },
    )
    act(() => result.current.updateDraft("B direct draft"))
    rerender({ projectRef: "project-a" })
    act(() => result.current.updateDraft("A project draft"))
    expect(result.current.draft).toBe("A project draft")
    rerender({ projectRef: undefined })
    expect(result.current.draft).toBe("B direct draft")
  })
})
