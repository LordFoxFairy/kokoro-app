import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useVoiceInput } from "@/ui/composer/use-voice-input"

type ResultEvent = Event & {
  results: ArrayLike<{ 0: { transcript: string } }>
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
      results: transcripts.map((transcript) => ({ 0: { transcript } })),
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
  const pendingTimers = vi.getTimerCount()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  expect(pendingTimers).toBe(0)
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
    act(() => result.current.toggle())

    expect(result.current.state).toBe("idle")
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(1000))
    expect(props.onDraftChange).not.toHaveBeenCalled()

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
    expect(props.onDraftChange).toHaveBeenCalledWith("existing first second")

    act(() => recognition?.emitEnd())
    expect(result.current.state).toBe("idle")

    unmount()
  })

  it("真实 recognition error 会进入 error，并忽略之后的 end/result", () => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition)
    const { result, props, unmount } = renderVoiceInput()

    act(() => result.current.toggle())
    const recognition = FakeSpeechRecognition.latest
    expect(recognition).not.toBeNull()

    act(() => recognition?.emitError("not-allowed"))
    expect(result.current.state).toBe("error")

    act(() => {
      recognition?.emitEnd()
      recognition?.emitResult("late result")
    })
    expect(result.current.state).toBe("error")
    expect(props.onDraftChange).not.toHaveBeenCalled()

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
