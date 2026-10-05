import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { admitBrowserAuthSessionIndexes } from "@/ui/shell/page-clients"
import { consumeLandingPrompt, stashLandingPrompt, stashPendingDraft, useDraft } from "@/ui/shell/use-draft"

const DRAFTS_KEY = "kokoro.web.drafts"

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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

  it("flushes the exact pending draft on pagehide without reviving a cleared draft", () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDraft("conversation-pagehide", true))

    act(() => result.current.updateDraft("keep this across a hard reload"))
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")))
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}"))
      .toEqual({ "conversation-pagehide": "keep this across a hard reload" })

    act(() => result.current.updateDraft("must be cleared"))
    act(() => result.current.clearDraft())
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")))
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}"))
      .toEqual({})
  })

  it("removes the pagehide listener when the scoped composer unmounts", () => {
    const add = vi.spyOn(window, "addEventListener")
    const remove = vi.spyOn(window, "removeEventListener")
    const { unmount } = renderHook(() => useDraft("conversation-listener", true))
    const registration = add.mock.calls.find(([type]) => type === "pagehide")

    expect(registration).toBeDefined()
    unmount()
    expect(remove).toHaveBeenCalledWith("pagehide", registration?.[1])
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


it("prefills only the explicit fresh same-tab prompt after first verified admission, once", () => {
  const handoff = "kokoro.web.anonymous-prompt-handoff"
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ __pending__: "unknown actor", oldConversation: "private old draft" }))
  window.sessionStorage.setItem(handoff, JSON.stringify([1, Date.now(), "fresh user prompt"]))
  expect(admitBrowserAuthSessionIndexes("subject-new", null)).toBe(true)
  const { result, unmount } = renderHook(() => useDraft(null, true))
  expect(result.current.draft).toBe("fresh user prompt")
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "fresh user prompt" })
  expect(window.sessionStorage.getItem(handoff)).toBeNull()
  unmount()
})


describe("closed one-shot explicit landing handoff", () => {
  const key = "kokoro.web.anonymous-prompt-handoff"
  it("stashes trimmed input without touching private drafts, consumes once, and clears on empty start", () => {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ oldConversation: "private" }))
    stashLandingPrompt("  exact\ninput  ")
    expect(JSON.parse(window.sessionStorage.getItem(key) ?? "null")).toEqual([1, expect.any(Number), "exact\ninput"])
    expect(window.localStorage.getItem(DRAFTS_KEY)).toBe(JSON.stringify({ oldConversation: "private" }))
    expect(consumeLandingPrompt()).toBe("exact\ninput")
    expect(consumeLandingPrompt()).toBeNull()
    stashLandingPrompt("old choice")
    stashLandingPrompt("  ")
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })
  it("does not turn the existing mounted Skills stash into a login handoff", () => {
    stashPendingDraft("  Skills prompt  ")
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "Skills prompt" })
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })
  it.each([
    [1, 1_000_000, ""], [1, 1_000_000, " padded "], [1, 1_000_001, "future"], [1, 699_999, "expired"],
    [1, 1.5, "fraction"], [1, -1, "negative"], [1, "1000000", "string"], [2, 1_000_000, "wrong version"],
    [1, 1_000_000, "text", "extra"], [1, 1_000_000, "a".repeat(65537)], { prompt: "open record" }, null,
  ].map((record) => [record]))("strictly removes invalid record without recovering old pending %j", (record) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    window.sessionStorage.setItem(key, JSON.stringify(record))
    expect(consumeLandingPrompt()).toBeNull()
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })
  it("accepts the inclusive 300s boundary and finite maximum without truncation", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    const prompt = "a".repeat(65536)
    window.sessionStorage.setItem(key, JSON.stringify([1, 700_000, prompt]))
    expect(consumeLandingPrompt()).toBe(prompt)
    expect(() => stashLandingPrompt(prompt + "a")).toThrow()
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })
  it("removes malformed JSON before returning null", () => {
    window.sessionStorage.setItem(key, "{broken")
    expect(consumeLandingPrompt()).toBeNull()
    expect(window.sessionStorage.getItem(key)).toBeNull()
  })
})


describe("verified actor retirement of mounted draft writers", () => {
  const marker = "kokoro.web.auth-index-subject"
  const handoff = "kokoro.web.anonymous-prompt-handoff"
  const bMap = { __pending__: "B explicit prompt" }
  function admitB() {
    window.sessionStorage.setItem(handoff, JSON.stringify([1, Date.now(), bMap.__pending__]))
    expect(admitBrowserAuthSessionIndexes("actor-B", "actor-A")).toBe(true)
    expect(window.localStorage.getItem(marker)).toBe("actor-B")
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual(bMap)
  }
  it.each(["timer", "pagehide", "unmount", "scope change", "late clear"])("never revives A or removes B through old %s completion", (completion) => {
    vi.useFakeTimers()
    window.localStorage.setItem(marker, "actor-A")
    const { result, rerender, unmount } = renderHook(({ activeId }) => useDraft(activeId, true), {
      initialProps: { activeId: null as string | null },
    })
    act(() => result.current.updateDraft("A private pending write"))
    expect(result.current.draft).toBe("A private pending write")
    const oldClear = result.current.clearDraft
    admitB()
    if (completion === "timer") act(() => vi.advanceTimersByTime(200))
    if (completion === "pagehide") act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")))
    if (completion === "unmount") unmount()
    if (completion === "scope change") rerender({ activeId: "conversation-B" })
    if (completion === "late clear") act(() => oldClear())
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual(bMap)
    // Cleanup after any trigger must also preserve B.
    unmount()
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual(bMap)
  })
  it("hides A's in-memory edit when its old hook rerenders after verified B admission", () => {
    window.localStorage.setItem(marker, "actor-A")
    const { result, rerender } = renderHook(() => useDraft(null, true))
    act(() => result.current.updateDraft("A private in-memory edit"))
    admitB()
    rerender()
    expect(result.current.draft).toBe("")
  })
  it("does not read B's stored draft from a retired A hook without a local edit", () => {
    window.localStorage.setItem(marker, "actor-A")
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ __pending__: "A existing edit" }))
    const { result, rerender } = renderHook(() => useDraft(null, true))
    expect(result.current.draft).toBe("A existing edit")
    admitB()
    rerender()
    expect(result.current.draft).toBe("")
    act(() => result.current.updateDraft("late A event"))
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")))
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual(bMap)
  })
  it("captures the verified marker only when the initially pre-mounted composer becomes mounted", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ mounted }) => useDraft(null, mounted), { initialProps: { mounted: false } })
    expect(result.current.draft).toBe("")
    expect(admitBrowserAuthSessionIndexes("actor-A", null)).toBe(true)
    rerender({ mounted: true })
    act(() => result.current.updateDraft("valid first-login draft"))
    act(() => vi.advanceTimersByTime(200))
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "valid first-login draft" })
    act(() => result.current.clearDraft())
    expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({})
  })
})


it("does not bind an idle already-hydrated booting shell to null before first verified admission", () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(() => useDraft(null, true))
  expect(result.current.draft).toBe("")
  expect(admitBrowserAuthSessionIndexes("first-verified-A", null)).toBe(true)
  rerender()
  act(() => result.current.updateDraft("normal hydrated first-login draft"))
  act(() => vi.advanceTimersByTime(200))
  expect(result.current.draft).toBe("normal hydrated first-login draft")
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "normal hydrated first-login draft" })
})
it("permanently retires an observed A-to-B writer even if the marker later returns to A", () => {
  vi.useFakeTimers()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor-A")
  const { result, rerender } = renderHook(() => useDraft(null, true))
  act(() => result.current.updateDraft("retired private A"))
  expect(admitBrowserAuthSessionIndexes("actor-B", "actor-A")).toBe(true)
  rerender()
  expect(result.current.draft).toBe("")
  expect(admitBrowserAuthSessionIndexes("actor-A", "actor-B")).toBe(true)
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ __pending__: "fresh A" }))
  rerender()
  act(() => result.current.updateDraft("old handler new event"))
  act(() => result.current.clearDraft())
  act(() => vi.advanceTimersByTime(200))
  expect(result.current.draft).toBe("")
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "fresh A" })
})
it.each(["capture", "render", "timer", "pagehide", "clear"])("hides and retires a writer on %s marker storage failure", (stage) => {
  vi.useFakeTimers()
  const key = "kokoro.web.auth-index-subject"
  window.localStorage.setItem(key, "actor-A")
  const original = Storage.prototype.getItem
  let blocked = stage === "capture"
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name: string) {
    if (blocked && this === window.localStorage && name === key) throw new DOMException("blocked", "SecurityError")
    return original.call(this, name)
  })
  const { result, rerender } = renderHook(() => useDraft(null, true))
  if (stage !== "capture") act(() => result.current.updateDraft("A private"))
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ __pending__: "B retained" }))
  blocked = true
  if (stage === "render" || stage === "capture") rerender()
  if (stage === "timer") act(() => vi.advanceTimersByTime(200))
  if (stage === "pagehide") act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")))
  if (stage === "clear") act(() => result.current.clearDraft())
  blocked = false
  rerender()
  expect(result.current.draft).toBe("")
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "B retained" })
})


it("does not let pre-admission null callbacks clear or update the first verified actor", () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(() => useDraft(null, true))
  const oldClear = result.current.clearDraft
  const oldUpdate = result.current.updateDraft
  expect(admitBrowserAuthSessionIndexes("actor-A", null)).toBe(true)
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ __pending__: "A admitted draft" }))
  rerender()
  act(() => oldClear())
  act(() => oldUpdate("stale anonymous event"))
  act(() => vi.advanceTimersByTime(200))
  expect(result.current.draft).toBe("A admitted draft")
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "A admitted draft" })
})
it("retires an anonymous writer that already edited instead of upgrading its pending write to the first actor", () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(() => useDraft(null, true))
  act(() => result.current.updateDraft("unknown pre-admission edit"))
  expect(admitBrowserAuthSessionIndexes("actor-A", null)).toBe(true)
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ __pending__: "A fresh admitted draft" }))
  rerender()
  act(() => vi.advanceTimersByTime(200))
  expect(result.current.draft).toBe("")
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ __pending__: "A fresh admitted draft" })
})
it("allows a fresh B composer and retains same-subject drafts across readmission", () => {
  vi.useFakeTimers()
  window.localStorage.setItem("kokoro.web.auth-index-subject", "actor-B")
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify({ conversationB: "B exact existing draft" }))
  const { result, rerender } = renderHook(() => useDraft("conversationB", true))
  expect(result.current.draft).toBe("B exact existing draft")
  expect(admitBrowserAuthSessionIndexes("actor-B", "actor-B")).toBe(true)
  rerender()
  expect(result.current.draft).toBe("B exact existing draft")
  act(() => result.current.updateDraft("B exact new draft"))
  act(() => vi.advanceTimersByTime(200))
  expect(JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? "{}")).toEqual({ conversationB: "B exact new draft" })
})
