// ERROR-UX（Wave5）：run.failed 分类文案 + 恢复引导 + message 原文折叠。
import { readFileSync } from "node:fs"

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { stateFromSnapshot } from "@/core/hydration"
import { applyChatProjectionEvent } from "@/core/reducer"
import { createSessionStreamState, type SessionDelivery, type SessionStreamState } from "@/core/state"
import { BFF_AGENT_FAILURE_TUPLES, type BffAgentFailureTuple } from "@/generated/bff-agent-failure"
import { LocaleProvider } from "@/i18n/context"
import { LOCALE_STORAGE_KEY, zh, type MessageKey } from "@/i18n/messages"
import { negotiateLocale, resolveMessage } from "@/i18n/resolve"
import { ConversationThread, failureCopyKey, type ConversationThreadProps } from "@/ui/thread/conversation-thread"

import {
  expectedAgentFailureZhCopy,
  expectedZhCopy,
  makeDispatchFailureEvent,
  makeFailedSnapshot,
} from "../core/fixtures"

// LocaleProvider 水合后按 navigator.languages 协商语言（jsdom 通常 en）——按同一协商取译文断言，
// 不写死语言，避免测试与运行环境语言绑定。
const LOCALE = negotiateLocale(null, typeof navigator !== "undefined" ? [...navigator.languages] : [])
const tr = (key: MessageKey): string => resolveMessage(LOCALE, key)

type AgentFailureCode = BffAgentFailureTuple["code"]
const CODES = [...new Set(BFF_AGENT_FAILURE_TUPLES.map((profile) => profile.code))]

function failureProfile(code: AgentFailureCode): BffAgentFailureTuple {
  const profile = BFF_AGENT_FAILURE_TUPLES.find((candidate) => candidate.code === code && !candidate.retryable)
  if (profile === undefined) throw new Error(`missing generated Agent failure profile: ${code}`)
  return profile
}

function failedThreadWithProfile(profile: BffAgentFailureTuple): SessionStreamState {
  const thread = stateFromSnapshot(makeFailedSnapshot(profile))
  return {
    ...thread,
    messages: [
      { id: "m_u", role: "user", content: "do the thing", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "working…", runId: "run_1" },
    ],
    stepsByRun: { run_1: [] },
  }
}

function failedThread(code: AgentFailureCode): SessionStreamState {
  return failedThreadWithProfile(failureProfile(code))
}

function emptyFailedThread(): SessionStreamState {
  return {
    ...failedThread("internal_error"),
    messages: [
      { id: "m_u", role: "user", content: "do the thing", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "", runId: "run_1" },
    ],
  }
}

function renderFailure(thread: SessionStreamState, onRetry = vi.fn()) {
  return render(
    <ConversationThread
      sessionId="ses_1"
      thread={thread}
      isStreaming={false}
      isReconnecting={false}
      hasFailed
      canRetryPendingSubmission={false}
      creditRejected={false}
      onOpenBilling={vi.fn()}
      onOpenPricing={vi.fn()}
      onRetry={onRetry}
      mode="fast"
      stagingByRun={{}}
      hitlRunId={null}
      controlError={null}
    />,
    { wrapper: LocaleProvider },
  )
}

type ObservedResize = {
  callback: ResizeObserverCallback
  disconnected: boolean
  elements: Set<Element>
}

type GeometryHarness = ReturnType<typeof installGeometryHarness>

let activeGeometryHarness: GeometryHarness | null = null

function rect(top: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 700,
    top,
    width: 700,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

function scrollTopFromCall(call: unknown[]): number | undefined {
  const first = call[0]
  if (typeof first === "object" && first !== null && "top" in first) {
    const top = (first as ScrollToOptions).top
    return typeof top === "number" ? top : undefined
  }
  return typeof call[1] === "number" ? call[1] : undefined
}

function installGeometryHarness() {
  const originalResizeObserver = globalThis.ResizeObserver
  const originalWindowResizeObserver = window.ResizeObserver
  const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")
  const frames = new Map<number, FrameRequestCallback>()
  const rects = new WeakMap<Element, DOMRect>()
  const observers: ObservedResize[] = []
  let nextFrame = 1

  class FakeResizeObserver implements ResizeObserver {
    readonly record: ObservedResize

    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, disconnected: false, elements: new Set() }
      observers.push(this.record)
    }

    observe(target: Element) {
      this.record.elements.add(target)
    }

    unobserve(target: Element) {
      this.record.elements.delete(target)
    }

    disconnect() {
      this.record.disconnected = true
      this.record.elements.clear()
    }

    takeRecords(): ResizeObserverEntry[] {
      return []
    }
  }

  globalThis.ResizeObserver = FakeResizeObserver
  window.ResizeObserver = FakeResizeObserver
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextFrame
    nextFrame += 1
    frames.set(id, callback)
    return id
  })
  const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id)
  })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return rects.get(this) ?? rect(0, 0)
  })
  const scrollTo = vi.fn(function (this: HTMLElement, first: ScrollToOptions | number, second?: number) {
    const top = typeof first === "object" ? first.top : second
    if (typeof top === "number") this.scrollTop = top
  })
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value: scrollTo,
  })

  function flushFrames() {
    let passes = 0
    while (frames.size > 0) {
      if (passes > 20) throw new Error("animation frame loop did not settle")
      passes += 1
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback(performance.now()))
    }
  }

  function configure(
    container: HTMLElement,
    itemRects: readonly DOMRect[],
    options: {
      contentPadding?: readonly [number, number]
      scrollTop?: number
      spacerHeight?: number
      viewportHeight?: number
      viewportPadding?: readonly [number, number]
    } = {},
  ) {
    const viewport = container.querySelector<HTMLElement>('[data-slot="message-scroller-viewport"]')
    const content = container.querySelector<HTMLElement>('[data-slot="message-scroller-content"]')
    const items = [...container.querySelectorAll<HTMLElement>('[data-slot="message-scroller-item"]')]
    const spacer = container.querySelector<HTMLElement>("[data-message-scroller-spacer]")
    if (!viewport || !content || !spacer) throw new Error("message scroller geometry is missing")
    if (items.length !== itemRects.length) {
      throw new Error(`expected ${itemRects.length} items, received ${items.length}`)
    }
    const viewportHeight = options.viewportHeight ?? 600
    const viewportPadding = options.viewportPadding ?? [20, 20]
    const contentPadding = options.contentPadding ?? [10, 10]
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: viewportHeight })
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: options.scrollTop ?? 80,
      writable: true,
    })
    viewport.style.paddingTop = `${viewportPadding[0]}px`
    viewport.style.paddingBottom = `${viewportPadding[1]}px`
    content.style.paddingTop = `${contentPadding[0]}px`
    content.style.paddingBottom = `${contentPadding[1]}px`
    spacer.hidden = false
    spacer.style.height = `${options.spacerHeight ?? 180}px`
    rects.set(viewport, rect(0, viewportHeight))
    rects.set(content, rect(0, viewportHeight))
    rects.set(spacer, rect(0, options.spacerHeight ?? 180))
    items.forEach((item, index) => rects.set(item, itemRects[index] ?? rect(0, 0)))
    return { content, items, spacer, viewport }
  }

  function geometryObserver(elements: readonly Element[]): ObservedResize | undefined {
    return observers.find((observer) => !observer.disconnected && elements.every((element) => observer.elements.has(element)))
  }

  function trigger(observer: ObservedResize) {
    observer.callback([], observer as unknown as ResizeObserver)
  }

  function zeroScrollCalls() {
    return scrollTo.mock.calls.filter((call) => scrollTopFromCall(call) === 0)
  }

  function restore() {
    if (originalResizeObserver !== undefined) globalThis.ResizeObserver = originalResizeObserver
    if (originalWindowResizeObserver !== undefined) window.ResizeObserver = originalWindowResizeObserver
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
    }
  }

  return {
    cancelFrame,
    configure,
    flushFrames,
    frames,
    geometryObserver,
    observers,
    rects,
    restore,
    scrollTo,
    trigger,
    zeroScrollCalls,
  }
}

function renderGeometryThread(
  thread: SessionStreamState,
  overrides: Partial<ConversationThreadProps> = {},
) {
  return render(
    <ConversationThread
      sessionId="ses_geometry"
      thread={thread}
      isStreaming={false}
      isReconnecting={false}
      hasFailed={false}
      canRetryPendingSubmission={false}
      creditRejected={false}
      onOpenBilling={vi.fn()}
      onOpenPricing={vi.fn()}
      onRetry={vi.fn()}
      mode="fast"
      stagingByRun={{}}
      hitlRunId={null}
      controlError={null}
      {...overrides}
    />,
    { wrapper: LocaleProvider },
  )
}

function settledMessages(messages: SessionStreamState["messages"]): SessionStreamState {
  return {
    ...createSessionStreamState(),
    messages,
    stepsByRun: Object.fromEntries(
      messages
        .filter((message) => message.role === "assistant" && message.runId)
        .map((message) => [message.runId as string, []]),
    ),
  }
}

afterEach(() => {
  cleanup()
  window.localStorage.removeItem(LOCALE_STORAGE_KEY)
  activeGeometryHarness?.restore()
  activeGeometryHarness = null
  vi.restoreAllMocks()
})

describe("failureCopyKey — generated 10-code safe profile localization", () => {
  it("每个闭集码映射到一个存在的、非通用的文案键", () => {
    for (const code of CODES) {
      const key = failureCopyKey(failedThread(code).runError)
      expect(key).not.toBe("fail.generic")
      expect(zh[key]).toBeTruthy()
    }
  })

  it("十码映射两两不同（无碰撞）", () => {
    const keys = CODES.map((code) => failureCopyKey(failedThread(code).runError))
    expect(new Set(keys).size).toBe(CODES.length)
  })

  it("generic 与 null 终态使用通用安全文案", () => {
    expect(failureCopyKey(stateFromSnapshot(makeFailedSnapshot(null)).runError)).toBe("fail.generic")
    expect(failureCopyKey(null)).toBe("fail.generic")
  })

  it("中文安全文案不承诺重发原消息或暴露错误详情", () => {
    expect(expectedZhCopy("fail.dispatch")).not.toMatch(/重试|重新发送/u)
    expect(expectedZhCopy("fail.internalHint")).not.toMatch(/重试|详情/u)
  })
})

describe("ConversationThread 紧凑线程几何", () => {
  function geometry() {
    activeGeometryHarness = installGeometryHarness()
    return activeGeometryHarness
  }

  it("全部三个短滚动项连同双层上下 padding 都容得下时只清一次 spacer", () => {
    const harness = geometry()
    const thread = settledMessages([
      { id: "m_u1", role: "user", content: "one", runId: "m_u1" },
      { id: "m_a1", role: "assistant", content: "two", runId: "run_1" },
      { id: "m_u2", role: "user", content: "three", runId: "m_u2" },
    ])
    const { container } = renderGeometryThread(thread)
    const elements = harness.configure(container, [rect(30, 80), rect(138, 80), rect(246, 80)])

    harness.scrollTo.mockClear()
    act(() => harness.flushFrames())
    expect(harness.zeroScrollCalls()).toHaveLength(1)

    const observer = harness.geometryObserver([elements.viewport, elements.content, ...elements.items])
    expect(observer).toBeDefined()
    act(() => {
      harness.trigger(observer as ObservedResize)
      harness.flushFrames()
    })
    expect(harness.zeroScrollCalls()).toHaveLength(1)
  })

  it.each([
    {
      name: "首项很长而末项很短",
      itemRects: [rect(30, 500), rect(558, 80)],
      viewportHeight: 600,
    },
    {
      name: "viewport clientHeight 为零",
      itemRects: [rect(30, 80), rect(138, 80)],
      viewportHeight: 0,
    },
    {
      name: "Item 像素不是有限值",
      itemRects: [rect(Number.NaN, 80), rect(138, 80)],
      viewportHeight: 600,
    },
  ])("$name 时不清 spacer", ({ itemRects, viewportHeight }) => {
    const harness = geometry()
    const thread = settledMessages([
      { id: "m_u", role: "user", content: "long prompt", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "short answer", runId: "run_1" },
    ])
    const { container } = renderGeometryThread(thread)
    const elements = harness.configure(container, itemRects, { viewportHeight })

    harness.scrollTo.mockClear()
    act(() => harness.flushFrames())
    expect(elements.spacer).not.toHaveAttribute("hidden")
    expect(elements.spacer).toHaveStyle({ height: "180px" })
  })

  it("成果滚动项使总内容超高时不再只按末助手项误判", () => {
    const harness = geometry()
    const delivery: SessionDelivery = {
      conversationId: "ses_geometry",
      artifactId: "artifact_geometry",
      assetId: "asset_geometry",
      artifactKind: "document",
      title: "Geometry report",
      mime: "application/pdf",
      size: 2048,
      runId: "run_1",
      createdAt: "2026-09-30T00:00:00Z",
    }
    const thread = {
      ...settledMessages([
        { id: "m_u", role: "user" as const, content: "prompt", runId: "m_u" },
        { id: "m_a", role: "assistant" as const, content: "answer", runId: "run_1" },
      ]),
      deliveries: [delivery],
    }
    const { container } = renderGeometryThread(thread, { onOpenDelivery: vi.fn() })
    const elements = harness.configure(container, [rect(30, 80), rect(138, 80), rect(246, 340)])

    harness.scrollTo.mockClear()
    act(() => harness.flushFrames())
    expect(elements.spacer).not.toHaveAttribute("hidden")
    expect(elements.spacer).toHaveStyle({ height: "180px" })
  })

  it.each([
    { name: "流式", overrides: { isStreaming: true } },
    { name: "重连", overrides: { isReconnecting: true } },
    { name: "HITL", overrides: { hitlRunId: "run_1" } },
  ])("$name 状态不取得紧凑滚动所有权", ({ overrides }) => {
    const harness = geometry()
    const thread = settledMessages([
      { id: "m_u", role: "user", content: "prompt", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "answer", runId: "run_1" },
    ])
    const { container } = renderGeometryThread(thread, overrides)
    const items = [...container.querySelectorAll('[data-slot="message-scroller-item"]')]
    harness.configure(container, items.map((_, index) => rect(30 + index * 108, 80)))

    harness.scrollTo.mockClear()
    act(() => harness.flushFrames())
    expect(harness.zeroScrollCalls()).toHaveLength(0)
  })

  it("嵌入安全失败反馈参与 fit 且不提供 raw detail 动作", () => {
    const harness = geometry()
    const { container } = renderGeometryThread(emptyFailedThread(), {
      hasFailed: true,
    })
    const elements = harness.configure(container, [rect(30, 80), rect(138, 150)])

    harness.scrollTo.mockClear()
    act(() => harness.flushFrames())
    expect(harness.zeroScrollCalls()).toHaveLength(1)
    expect(container.querySelector('[data-slot="collapsible"]')).toBeNull()
    expect(elements.items).toHaveLength(2)
  })

  it("ResizeObserver 仅在不 fit 变 fit 时清 spacer，变长不跳尾且卸载清理 pending frame", () => {
    const harness = geometry()
    const thread = settledMessages([
      { id: "m_u", role: "user", content: "prompt", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "answer", runId: "run_1" },
    ])
    const rendered = renderGeometryThread(thread)
    const elements = harness.configure(rendered.container, [rect(30, 500), rect(558, 80)])

    harness.scrollTo.mockClear()
    act(() => harness.flushFrames())
    expect(harness.zeroScrollCalls()).toHaveLength(0)

    const observer = harness.geometryObserver([elements.viewport, elements.content, ...elements.items])
    expect(observer).toBeDefined()
    harness.rects.set(elements.items[0] as Element, rect(30, 80))
    harness.rects.set(elements.items[1] as Element, rect(138, 80))
    act(() => {
      harness.trigger(observer as ObservedResize)
      harness.flushFrames()
    })
    expect(harness.zeroScrollCalls()).toHaveLength(1)

    harness.scrollTo.mockClear()
    harness.rects.set(elements.items[0] as Element, rect(30, 500))
    harness.rects.set(elements.items[1] as Element, rect(558, 80))
    act(() => {
      harness.trigger(observer as ObservedResize)
      harness.flushFrames()
    })
    expect(harness.scrollTo).not.toHaveBeenCalled()

    elements.spacer.hidden = false
    elements.spacer.style.height = "180px"
    elements.viewport.scrollTop = 80
    harness.rects.set(elements.items[0] as Element, rect(30, 80))
    harness.rects.set(elements.items[1] as Element, rect(138, 80))
    act(() => harness.trigger(observer as ObservedResize))
    expect(harness.frames.size).toBeGreaterThan(0)
    rendered.unmount()
    expect(observer?.disconnected).toBe(true)
    expect(harness.cancelFrame).toHaveBeenCalled()
  })
})

describe("ConversationThread 失败卡渲染", () => {
  const delivery: SessionDelivery = {
    conversationId: "ses_1", artifactId: "artifact_1", assetId: "asset_1", artifactKind: "document",
    title: "Report", mime: "application/pdf", size: 2048, runId: "run_1", createdAt: "2026-09-30T00:00:00Z",
  }

  it.each([
    { name: "空成果且无更多页", sessionId: "ses_1", deliveries: [], hasMore: false, canOpen: true, visible: false },
    { name: "无会话且空成果", sessionId: null, deliveries: [], hasMore: false, canOpen: true, visible: false },
    { name: "无会话且已有成果", sessionId: null, deliveries: [delivery], hasMore: false, canOpen: true, visible: false },
    { name: "无会话且有更多页", sessionId: null, deliveries: [], hasMore: true, canOpen: true, visible: false },
    { name: "有效会话且有更多页", sessionId: "ses_1", deliveries: [], hasMore: true, canOpen: true, visible: true },
    { name: "有效会话且已有成果", sessionId: "ses_1", deliveries: [delivery], hasMore: false, canOpen: true, visible: true },
    { name: "无打开动作且已有成果", sessionId: "ses_1", deliveries: [delivery], hasMore: false, canOpen: false, visible: false },
  ])("成果滚动项仅在成果区可渲染时存在：$name", ({ sessionId, deliveries, hasMore, canOpen, visible }) => {
    const { container } = render(
      <ConversationThread
        sessionId={sessionId}
        thread={{ ...createSessionStreamState(), deliveries, deliveriesHasMore: hasMore }}
        isStreaming={false}
        isReconnecting={false}
        hasFailed={false}
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        {...(canOpen ? { onOpenDelivery: vi.fn() } : {})}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )
    const wrapper = container.querySelector('[data-message-id="deliveries"]')
    if (visible) {
      expect(wrapper).not.toBeNull()
      expect(wrapper?.querySelector("section")).not.toBeNull()
    } else {
      expect(wrapper).toBeNull()
    }
  })

  it("空终态助手轮保留消息身份并在同一滚动项承接唯一普通失败反馈", () => {
    const thread = failedThread("internal_error")
    const { container } = render(
      <ConversationThread
        sessionId="ses_1"
        thread={{ ...thread, messages: [
          { id: "m_u1", role: "user", content: "same persisted prompt", runId: "m_u1" },
          { id: "m_u2", role: "user", content: "same persisted prompt", runId: "m_u2" },
          { id: "m_a", role: "assistant", content: "", runId: "run_1" },
        ] }}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        onOpenDelivery={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )
    expect(container.querySelector('[data-message-id="m_u1"]')).toHaveTextContent("same persisted prompt")
    expect(container.querySelector('[data-message-id="m_u2"]')).toHaveTextContent("same persisted prompt")
    const assistantItem = container.querySelector('[data-slot="message-scroller-item"][data-message-id="run_1"]')
    const feedback = container.querySelector('[data-message-id="run-error"]')
    expect(assistantItem?.querySelector("article")).not.toBeNull()
    expect(feedback?.closest('[data-slot="message-scroller-item"]')).toBe(assistantItem)
    expect(container.querySelectorAll('[data-slot="message-scroller-item"][data-message-id="run-error"]')).toHaveLength(0)
    expect(container.querySelector('[data-message-id="deliveries"]')).toBeNull()
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
    expect(container.querySelector('[data-slot="collapsible"]')).toBeNull()
  })

  it("pre-admission 余额不足独立保留补款、定价与原意图恢复动作", () => {
    const onRetry = vi.fn()
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={createSessionStreamState()}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
        canRetryPendingSubmission
        creditRejected
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={onRetry}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByRole("button", { name: tr("billing.viewPricing") })).toBeEnabled()
    expect(screen.getByRole("button", { name: tr("billing.viewBalance") })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: tr("thread.retry") }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("未获receipt的transport错误保留同key冻结意图恢复入口", () => {
    const onRetry = vi.fn()
    const thread = {
      ...createSessionStreamState(),
      messages: [{ id: "usr_pending", role: "user" as const, content: "pending intent", runId: "usr_pending" }],
    }
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={thread}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
        canRetryPendingSubmission
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={onRetry}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )
    const retry = screen.getByRole("button", { name: tr("thread.retry") })
    expect(retry).toBeEnabled()
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      name: "有正文",
      thread: () => failedThread("internal_error"),
      props: {},
    },
    {
      name: "空白正文并非精确空串",
      thread: () => ({
        ...emptyFailedThread(),
        messages: [
          { id: "m_u", role: "user" as const, content: "do the thing", runId: "m_u" },
          { id: "m_a", role: "assistant" as const, content: " ", runId: "run_1" },
        ],
      }),
      props: {},
    },
    {
      name: "有思考过程",
      thread: () => ({
        ...emptyFailedThread(),
        stepsByRun: {
          run_1: [{ kind: "thinking" as const, seq: 1, segmentId: "m_a", text: "working" }],
        },
      }),
      props: {},
    },
    {
      name: "失败助手后还有持久化用户消息",
      thread: () => ({
        ...emptyFailedThread(),
        messages: [
          ...emptyFailedThread().messages,
          { id: "m_u2", role: "user" as const, content: "new request", runId: "m_u2" },
        ],
      }),
      props: {},
    },
    {
      name: "仅有孤立过程而无持久化助手",
      thread: () => ({
        ...emptyFailedThread(),
        messages: [{ id: "m_u", role: "user" as const, content: "do the thing", runId: "m_u" }],
        stepsByRun: {
          run_1: [{ kind: "thinking" as const, seq: 1, segmentId: "thinking_1", text: "working" }],
        },
      }),
      props: {},
    },
    {
      name: "重试已进入流式",
      thread: emptyFailedThread,
      props: { isStreaming: true },
    },
    {
      name: "正在重连",
      thread: emptyFailedThread,
      props: { isReconnecting: true },
    },
    {
      name: "HITL仍活跃",
      thread: emptyFailedThread,
      props: { hitlRunId: "run_1" },
    },
    {
      name: "成果区可渲染",
      thread: () => ({ ...emptyFailedThread(), deliveries: [delivery] }),
      props: { onOpenDelivery: vi.fn() },
    },
    {
      name: "没有持久化助手",
      thread: () => ({
        ...emptyFailedThread(),
        messages: [{ id: "m_u", role: "user" as const, content: "do the thing", runId: "m_u" }],
        stepsByRun: {},
      }),
      props: {},
    },
  ])("$name 时保留独立失败滚动项", ({ thread, props }) => {
    const { container } = render(
      <ConversationThread
        sessionId="ses_1"
        thread={thread()}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
        {...props}
      />,
      { wrapper: LocaleProvider },
    )

    const feedbackItem = container.querySelector('[data-slot="message-scroller-item"][data-message-id="run-error"]')
    expect(feedbackItem).not.toBeNull()
    expect(feedbackItem?.querySelector('[role="alert"]')).not.toBeNull()
    expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
  })

  it("失败反馈按内容收敛且不恢复成第二个输入卡", () => {
    const css = readFileSync(`${process.cwd()}/src/ui/thread/thread.module.css`, "utf8")
    expect(css).toMatch(
      /\.error\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*100%;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;[^}]*box-shadow:\s*none;[^}]*\}/u,
    )
    expect(css).toMatch(
      /\.error\s+:global\(\[data-slot="alert-title"\]\)\s*\{[^}]*display:\s*block;[^}]*overflow:\s*visible;[^}]*-webkit-line-clamp:\s*unset;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;[^}]*\}/u,
    )
    expect(css).not.toMatch(
      /\.thread\[data-desktop-web="true"\]\s+\.error\s*\{[^}]*(?:box-shadow|border-radius|background|padding):/u,
    )
  })

  it("余额不足反馈保留 alert 标题、说明与全部动作", () => {
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={createSessionStreamState()}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
        canRetryPendingSubmission
        creditRejected
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(tr("billing.creditRejected"))
    expect(alert).toHaveTextContent(tr("billing.creditPricing"))
    expect(screen.getByRole("button", { name: tr("billing.viewPricing") })).toBeEnabled()
    expect(screen.getByRole("button", { name: tr("billing.viewBalance") })).toBeEnabled()
    expect(screen.getByRole("button", { name: tr("thread.retry") })).toBeEnabled()
  })

  it("桌面任务态的助手答案可复制当前轮真实文本", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const thread = createSessionStreamState()
    const withAnswer: SessionStreamState = {
      ...thread,
      messages: [
        { id: "m_u", role: "user", content: "draft a plan", runId: "m_u" },
        { id: "m_a", role: "assistant", content: "Here is the plan.", runId: "run_1" },
      ],
      stepsByRun: { run_1: [] },
    }
    const { container } = render(
      <ConversationThread
        sessionId="ses_1"
        thread={withAnswer}
        isStreaming={false}
        isReconnecting={false}
        hasFailed={false}
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )

    expect(container.querySelector('[data-slot="assistant-identity-mark"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="task-stage"]')).toHaveTextContent("draft a plan")
    expect(container.querySelector('[data-slot="credit-note"]')).toBeNull()
    expect(container.querySelector('[data-slot="badge"]')).toBeNull()
    expect(container.querySelector('[data-slot="markdown-message"]')).toHaveTextContent("Here is the plan.")
    fireEvent.click(screen.getByRole("button", { name: tr("thread.copyAnswer") }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Here is the plan."))
  })

  it("每个已落定助手轮都可复制自己的真实文本，不依赖首轮任务标题", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const thread = createSessionStreamState()
    const withTwoAnswers: SessionStreamState = {
      ...thread,
      messages: [
        { id: "m_u_1", role: "user", content: "draft a plan", runId: "m_u_1" },
        { id: "m_a_1", role: "assistant", content: "First answer.", runId: "run_1" },
        { id: "m_u_2", role: "user", content: "add the risks", runId: "m_u_2" },
        { id: "m_a_2", role: "assistant", content: "Second answer with risks.", runId: "run_2" },
      ],
      stepsByRun: { run_1: [], run_2: [] },
    }
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={withTwoAnswers}
        isStreaming={false}
        isReconnecting={false}
        hasFailed={false}
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )

    const copyActions = screen.getAllByRole("button", { name: tr("thread.copyAnswer") })
    expect(copyActions).toHaveLength(2)
    fireEvent.click(copyActions[1]!)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Second answer with risks."))
  })

  it("流式助手轮不提供复制完整答案动作", () => {
    const thread = failedThread("internal_error")
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={thread}
        isStreaming
        isReconnecting={false}
        hasFailed={false}
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )

    expect(screen.queryByRole("button", { name: tr("thread.copyAnswer") })).toBeNull()
  })

  it("流式助手轮不以 atomic=true 重复播报整轮内容", () => {
    const thread = failedThread("internal_error")
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={thread}
        isStreaming
        isReconnecting={false}
        hasFailed={false}
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )
    expect(screen.getByRole("article")).toHaveAttribute("aria-atomic", "false")
  })

  it("每个闭集码渲染对应本地化人话（绝不裸露错误码）", () => {
    for (const code of CODES) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh")
      renderFailure(failedThread(code))
      expect(screen.getByText(expectedAgentFailureZhCopy(code))).toBeTruthy()
      // 裸码绝不出现在可见文案里。
      expect(screen.queryByText(code)).toBeNull()
      cleanup()
    }
  })

  it("不渲染 producer 原文或详情动作", () => {
    renderFailure(failedThread("internal_error"))
    expect(screen.queryByText("boom at line 42")).toBeNull()
    expect(document.querySelector('[data-slot="collapsible"]')).toBeNull()
  })

  it("internal_error 额外给反馈指引", () => {
    renderFailure(failedThread("internal_error"))
    expect(screen.getByText(tr("fail.internalHint"))).toBeTruthy()
  })

  it("非 internal_error 不显示反馈指引", () => {
    renderFailure(failedThread("enqueue_failed"))
    expect(screen.queryByText(tr("fail.internalHint"))).toBeNull()
  })

  it.each(BFF_AGENT_FAILURE_TUPLES)(
    "$code retryable=$retryable 终态都不提供重发原消息动作",
    (profile) => {
      const onRetry = vi.fn()
      window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh")
      renderFailure(failedThreadWithProfile(profile), onRetry)
      expect(screen.getByText(expectedAgentFailureZhCopy(profile.code))).toBeTruthy()
      expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
      expect(onRetry).not.toHaveBeenCalled()
      cleanup()
    },
  )

  it("dispatch terminal 使用安全只读反馈且没有 retry/detail", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh")
    const thread = applyChatProjectionEvent(
      createSessionStreamState(),
      makeDispatchFailureEvent("9007199254740993123456789"),
    )
    renderFailure(thread)
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(expectedZhCopy("fail.generic"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
    expect(document.querySelector('[data-slot="collapsible"]')).toBeNull()
  })

  it("generic terminal 使用安全只读反馈且没有 retry/detail", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "zh")
    renderFailure(stateFromSnapshot(makeFailedSnapshot(null)))
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText(expectedZhCopy("fail.generic"))).toBeTruthy()
    expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
    expect(document.querySelector('[data-slot="collapsible"]')).toBeNull()
  })

  it("流式边界也不重新暴露 terminal retry 动作", () => {
    const onRetry = vi.fn()
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={failedThread("dispatch_exhausted")}
        isStreaming
        isReconnecting={false}
        hasFailed
        canRetryPendingSubmission={false}
        creditRejected={false}
        onOpenBilling={vi.fn()}
        onOpenPricing={vi.fn()}
        onRetry={onRetry}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
      />,
      { wrapper: LocaleProvider },
    )
    expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
    expect(onRetry).not.toHaveBeenCalled()
  })
})
