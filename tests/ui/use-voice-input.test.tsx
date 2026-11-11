import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useVoiceInput } from "@/ui/composer/use-voice-input"

type ResultEvent = Event & {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

type ErrorEvent = Event & { error?: string }

class FakeSpeechRecognition extends EventTarget {
  static latest: FakeSpeechRecognition | null = null

  continuous = false
  interimResults = false
  lang = ""
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  onresult: ((event: ResultEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onend: (() => void) | null = null

  constructor() {
    super()
    FakeSpeechRecognition.latest = this
  }

  emitResult(...transcripts: string[]) {
    this.onresult?.(Object.assign(new Event("result"), {
      results: transcripts.map((transcript) => ({ isFinal: true, 0: { transcript } })),
    }))
  }

  emitError(error = "network") {
    this.onerror?.(Object.assign(new Event("error"), { error }))
  }

  emitEnd() {
    this.onend?.()
  }
}

function renderVoiceInput(overrides: Partial<Parameters<typeof useVoiceInput>[0]> = {}) {
  const props: Parameters<typeof useVoiceInput>[0] = {
    draft: "hello",
    onDraftChange: vi.fn(),
    preview: false,
    previewTranscript: "preview transcript",
    ...overrides,
  }

  return { ...renderHook(() => useVoiceInput(props)), props }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSpeechRecognition.latest = null
  vi.stubGlobal("SpeechRecognition", undefined)
  vi.stubGlobal("webkitSpeechRecognition", undefined)
})

afterEach(() => {
  // Keep the assertion after RTL cleanup so a leaked preview timer is caught
  // instead of surviving until the next test. The explicit unmounts below
  // still make each lifecycle assertion local and readable.
  cleanup()
  const pendingTimers = vi.getTimerCount()
  expect(pendingTimers).toBe(0)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useVoiceInput", () => {
  it("preview 从 listening 进入 transcribing，并追加预览转写", () => {
    const { result, props, unmount } = renderVoiceInput({ preview: true })

    act(() => result.current.toggle())
    expect(result.current.state).toBe("listening")
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(619))
    expect(result.current.state).toBe("listening")
    expect(props.onDraftChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.state).toBe("transcribing")

    act(() => vi.advanceTimersByTime(219))
    expect(result.current.state).toBe("transcribing")
    expect(props.onDraftChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.state).toBe("idle")
    expect(props.onDraftChange).toHaveBeenCalledWith("hello preview transcript")
    expect(vi.getTimerCount()).toBe(0)

    unmount()
  })

  it("再次点击会取消 preview，并清理待执行的转写", () => {
    const { result, props, unmount } = renderVoiceInput({ preview: true })

    act(() => result.current.toggle())
    act(() => vi.advanceTimersByTime(620))
    expect(result.current.state).toBe("transcribing")
    act(() => result.current.toggle())

    expect(result.current.state).toBe("idle")
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(1000))
    expect(props.onDraftChange).not.toHaveBeenCalled()

    unmount()
  })

  it("preview 取消后不会写入已经捕获但尚未完成的结果", () => {
    const { result, props, unmount } = renderVoiceInput({ preview: true })

    act(() => result.current.toggle())
    act(() => vi.advanceTimersByTime(620))
    expect(result.current.state).toBe("transcribing")

    act(() => result.current.cancel())
    act(() => vi.advanceTimersByTime(220))

    expect(result.current.state).toBe("idle")
    expect(props.onDraftChange).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    unmount()
  })

  it("没有 SpeechRecognition 时进入 error 且不追加草稿", () => {
    const { result, props, unmount } = renderVoiceInput()

    act(() => result.current.toggle())

    expect(result.current.state).toBe("error")
    expect(props.onDraftChange).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    unmount()
  })

  it("真实 recognition result 会进入 transcribing，end 后回到 idle", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props, unmount } = renderVoiceInput({ draft: "existing" })

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    expect(recognition).not.toBeNull()
    expect(recognition?.start).toHaveBeenCalledOnce()
    expect(recognition?.continuous).toBe(false)
    expect(recognition?.interimResults).toBe(false)
    expect(result.current.state).toBe("listening")

    act(() => recognition?.emitResult("first", "second"))
    expect(result.current.state).toBe("transcribing")
    expect(props.onDraftChange).not.toHaveBeenCalled()

    act(() => {
      recognition?.emitResult("first", "second")
      recognition?.emitEnd()
      recognition?.emitEnd()
    })
    expect(result.current.state).toBe("idle")
    expect(props.onDraftChange).toHaveBeenCalledExactlyOnceWith("existing first second")

    unmount()
  })

  it.each([["not-allowed", "permission"], ["service-not-allowed", "recognizer"], ["network", "recognizer"]] as const)(
    "classifies native %s without applying late text", (event, error) => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props, unmount } = renderVoiceInput()

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    expect(recognition).not.toBeNull()

    act(() => recognition?.emitError(event))
    expect(result.current.state).toBe("error")
    expect(result.current.error).toBe(error)

    act(() => {
      recognition?.emitEnd()
      recognition?.emitResult("late result")
    })
    expect(result.current.state).toBe("error")
    expect(props.onDraftChange).not.toHaveBeenCalled()

    unmount()
  })

  it("recognition.start 抛错时进入 error 且不追加草稿", () => {
    class ThrowingSpeechRecognition extends FakeSpeechRecognition {
      override start = vi.fn(() => {
        throw new Error("permission denied")
      })
    }

    vi.stubGlobal("SpeechRecognition", ThrowingSpeechRecognition)
    const { result, props, unmount } = renderVoiceInput()

    act(() => result.current.toggle())

    expect(result.current.state).toBe("error")
    expect(props.onDraftChange).not.toHaveBeenCalled()
    expect(FakeSpeechRecognition.latest?.abort).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    unmount()
  })

  it("再次点击取消真实 recognition，且忽略 abort 后的延迟事件", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props, unmount } = renderVoiceInput()

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    expect(recognition).not.toBeNull()

    act(() => result.current.toggle())
    expect(result.current.state).toBe("idle")
    expect(recognition?.abort).toHaveBeenCalledOnce()

    act(() => {
      recognition?.emitResult("cancelled")
      recognition?.emitEnd()
    })
    expect(result.current.state).toBe("idle")
    expect(props.onDraftChange).not.toHaveBeenCalled()

    unmount()
  })

  it.each(["kokoro:surface-navigation", "pagehide", "kokoro:auth-invalidated"])(
    "retires capture before a late native result after %s", (event) => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const original = vi.fn()
    const next = vi.fn()
    const options = { preview: false, previewTranscript: "" }
    const { result, rerender } = renderHook(
      ({ draft, onDraftChange }) => useVoiceInput({ ...options, draft, onDraftChange }),
      { initialProps: { draft: "first task", onDraftChange: original } },
    )
    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    expect(recognition?.start).toHaveBeenCalledOnce()

    act(() => window.dispatchEvent(new Event(event)))
    rerender({ draft: "second task", onDraftChange: next })
    act(() => {
      recognition?.emitResult("old microphone result")
      recognition?.emitEnd()
    })
    expect(next).not.toHaveBeenCalled()
    expect(original).not.toHaveBeenCalled()
    expect(recognition?.abort).toHaveBeenCalledOnce()
  })

  it("does not apply a final transcript if the user cancels before recognition ends", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props } = renderVoiceInput()

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    act(() => recognition?.emitResult("pending final"))
    expect(result.current.state).toBe("transcribing")
    act(() => result.current.cancel())
    act(() => recognition?.emitEnd())
    expect(result.current.state).toBe("idle")
    expect(recognition?.abort).toHaveBeenCalledOnce()
    expect(props.onDraftChange).not.toHaveBeenCalled()
  })

  it("silence ends without writing a transcript or claiming denied permission", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props } = renderVoiceInput()
    act(() => result.current.toggle())
    act(() => {
      FakeSpeechRecognition.latest?.emitError("no-speech")
      FakeSpeechRecognition.latest?.emitEnd()
    })
    expect(result.current.state).toBe("idle")
    expect(result.current.error).toBeNull()
    expect(props.onDraftChange).not.toHaveBeenCalled()
  })

  it("retires a replaced trusted draft scope even at the same URL", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const original = vi.fn()
    const next = vi.fn()
    const { result, rerender } = renderHook(
      ({ scope, onDraftChange }) => useVoiceInput({ draft: "existing", onDraftChange, scope, preview: false, previewTranscript: "" }),
      { initialProps: { scope: {}, onDraftChange: original } },
    )

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    rerender({ scope: {}, onDraftChange: next })
    act(() => {
      recognition?.emitResult("old owner result")
      recognition?.emitEnd()
    })
    expect(result.current.state).toBe("idle")
    expect(recognition?.abort).toHaveBeenCalledOnce()
    expect(original).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it("unmount 会清理 preview timer，避免卸载后追加转写", () => {
    const { result, props, unmount } = renderVoiceInput({ preview: true })

    act(() => result.current.toggle())
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)

    act(() => vi.advanceTimersByTime(1000))
    expect(props.onDraftChange).not.toHaveBeenCalled()
  })

  it("unmount 会 abort 活跃的 recognition，并忽略卸载后的事件", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props, unmount } = renderVoiceInput()

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    expect(recognition).not.toBeNull()

    unmount()
    expect(recognition?.abort).toHaveBeenCalledOnce()

    act(() => {
      recognition?.emitResult("unmounted")
      recognition?.emitEnd()
    })
    expect(props.onDraftChange).not.toHaveBeenCalled()
  })
})
