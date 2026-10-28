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
  makeSnapshot,
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
    runFailuresById: {
      run_1: { failedRunId: "run_1", kind: "agent", profile },
    },
  }
}

function failedThread(code: AgentFailureCode): SessionStreamState {
  return failedThreadWithProfile(failureProfile(code))
}

function renderFailure(thread: SessionStreamState, onRetry = vi.fn(), submissionFailureCode?: string | null, canRetryPendingSubmission = false) {
  return render(
    <ConversationThread
      sessionId="ses_1"
      thread={thread}
      isStreaming={false}
      isReconnecting={false}
      hasFailed={thread.unattributedFailure !== null || submissionFailureCode !== undefined}
      {...(submissionFailureCode === undefined ? {} : { submissionFailureCode })}
      canRetryPendingSubmission={canRetryPendingSubmission}
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
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
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
    configure,
    flushFrames,
    frames,
    observers,
    rects,
    restore,
    scrollTo,
  }
}

function geometryThread(
  thread: SessionStreamState,
  overrides: Partial<ConversationThreadProps> = {},
) {
  return (
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
    />
  )
}

function renderGeometryThread(thread: SessionStreamState, overrides: Partial<ConversationThreadProps> = {}) {
  return render(geometryThread(thread, overrides), { wrapper: LocaleProvider })
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

describe("failureCopyKey — generated 11-code safe profile localization", () => {
  it("每个闭集码映射到一个存在的、非通用的文案键", () => {
    for (const code of CODES) {
      const key = failureCopyKey(failedThread(code).runFailuresById.run_1 ?? null)
      expect(key).not.toBe("fail.generic")
      expect(zh[key]).toBeTruthy()
    }
  })

  it("闭集码映射两两不同（无碰撞）", () => {
    const keys = CODES.map((code) => failureCopyKey(failedThread(code).runFailuresById.run_1 ?? null))
    expect(new Set(keys).size).toBe(CODES.length)
  })

  it("generic 与 null 终态使用通用安全文案", () => {
    expect(failureCopyKey(stateFromSnapshot(makeFailedSnapshot(null)).runFailuresById.run_failed ?? null)).toBe("fail.generic")
    expect(failureCopyKey(null)).toBe("fail.generic")
  })

  it("BFF 明确 Agent 未配置时使用配置说明，而不是误导用户立即重试", () => {
    expect(failureCopyKey(null, "agent_not_configured")).toBe("fail.agentNotConfigured")
    expect(zh["fail.agentNotConfigured"]).toBeTruthy()

    const thread = createSessionStreamState()
    thread.messages = [{ id: "m_u", role: "user", content: "start", runId: "m_u" }]
    renderFailure(thread, vi.fn(), "agent_not_configured")
    expect(screen.getByText(tr("fail.agentNotConfigured"))).toBeInTheDocument()
  })

  it("未就绪的执行依赖以中性状态说明呈现，历史内容保留且不冒充运行失败", () => {
    const thread = createSessionStreamState()
    thread.messages = [{ id: "paused_prompt", role: "user", content: "keep my original prompt", runId: "paused_prompt" }]
    const retry = vi.fn()
    renderFailure(thread, retry, "agent_not_configured")

    expect(screen.getByRole("status")).toHaveTextContent(tr("fail.agentNotConfigured"))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByText("keep my original prompt")).toBeVisible()
    expect(retry).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: tr("thread.retryOriginal") })).toBeNull()
  })

  it("执行未就绪时只有明确点击才恢复原提交，不自动发送或隐藏合法恢复入口", () => {
    const retry = vi.fn()
    renderFailure(createSessionStreamState(), retry, "agent_not_configured", true)

    expect(retry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: tr("thread.retryOriginal") }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("中文安全文案不承诺重发原消息或暴露错误详情", () => {
    expect(expectedZhCopy("fail.dispatch")).not.toMatch(/重试|重新发送/u)
    expect(expectedZhCopy("fail.internalHint")).not.toMatch(/重试|详情/u)
  })
})

describe("ConversationThread 原生滚动行为", () => {
  function geometry() {
    activeGeometryHarness = installGeometryHarness()
    return activeGeometryHarness
  }

  it("提交脚手架换为真实轮、流式和失败时保留短历史，不创建把问题推离视口的空白", async () => {
    const harness = geometry()
    const history = settledMessages([
      { id: "m_u1", role: "user", content: "original prompt", runId: "m_u1" },
      { id: "m_a1", role: "assistant", content: "original answer", runId: "run_1" },
      { id: "m_u2", role: "user", content: "new prompt", runId: "m_u2" },
    ])
    const rendered = renderGeometryThread(history)
    const originalPrompt = screen.getByText("original prompt", { selector: "p" })
    for (const phase of ["submitting", "queued", "streaming", "reconnecting", "completed", "failed"] as const) {
      const active = phase !== "completed" && phase !== "failed"
      const thread = phase === "streaming" || phase === "completed"
        ? { ...history, messages: [...history.messages, { id: "m_a2", role: "assistant" as const, content: "new answer", runId: "run_2" }] }
        : history
      rendered.rerender(geometryThread(thread, {
        isStreaming: active,
        isReconnecting: phase === "reconnecting",
        currentRunId: phase === "submitting" ? null : "run_2",
        executionPhase: phase === "completed" ? "idle" : phase === "failed" ? "error" : phase === "reconnecting" ? "streaming" : phase,
        hasFailed: phase === "failed",
        submissionFailureCode: phase === "failed" ? "agent_not_configured" : null,
      }))
      const items = [...rendered.container.querySelectorAll('[data-slot="message-scroller-item"]')]
      const elements = harness.configure(rendered.container, items.map((_, index) => rect(20 + index * 108, 80)), {
        scrollTop: 0, spacerHeight: 0,
      })
      elements.spacer.hidden = true
      await act(async () => { await Promise.resolve(); harness.flushFrames() })
      expect(elements.viewport.scrollTop, phase).toBe(0)
      expect(Number.parseFloat(elements.spacer.style.height), phase).toBe(0)
      expect(originalPrompt).toBeInTheDocument()
      expect(screen.getByText("new prompt", { selector: "p" })).toBeInTheDocument()
    }
  })


  it("长历史向上阅读时新内容不抢滚动，回到最新后恢复贴底增长", async () => {
    const harness = geometry()
    const history = settledMessages([
      { id: "m_u", role: "user", content: "prompt", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "long answer", runId: "run_1" },
    ])
    const rendered = renderGeometryThread(history)
    const elements = harness.configure(rendered.container, [rect(-680, 80), rect(-572, 1200)], {
      scrollTop: 700, spacerHeight: 0,
    })
    elements.spacer.hidden = true
    Object.defineProperty(elements.viewport, "scrollHeight", { configurable: true, value: 1520 })
    fireEvent.wheel(elements.viewport, { deltaY: -300 })
    const updated = { ...history, messages: [...history.messages, {
      id: "m_u2", role: "user" as const, content: "new prompt", runId: "m_u2",
    }] }
    rendered.rerender(geometryThread(updated, { isStreaming: true, currentRunId: "run_2" }))
    const items = [...rendered.container.querySelectorAll('[data-slot="message-scroller-item"]')]
    items.forEach((item, index) => harness.rects.set(item, index < 2
      ? rect(-680 + index * 108, index === 1 ? 1200 : 80)
      : rect(656 + (index - 2) * 108, 80)))
    await act(async () => { await Promise.resolve(); harness.flushFrames() })
    expect(elements.viewport.scrollTop).toBe(700)
    expect(screen.getByText("long answer")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: tr("shell.backToLatest") }))
    expect(elements.viewport.scrollTop).toBe(920)
    Object.defineProperty(elements.viewport, "scrollHeight", { configurable: true, value: 1720 })
    await act(async () => {
      for (const observer of harness.observers) {
        if (!observer.disconnected && observer.elements.has(elements.content)) {
          observer.callback([], observer as unknown as ResizeObserver)
        }
      }
      harness.flushFrames()
    })
    expect(elements.viewport.scrollTop).toBe(1120)
    expect(Number.parseFloat(elements.spacer.style.height)).toBe(0)
  })
})

describe("ConversationThread 失败卡渲染", () => {
  it("待核对状态保留正文且不声称已扣款或提供重发动作", () => {
    const onRetry = vi.fn()
    renderFailure(failedThread("model_settlement_pending"), onRetry)
    expect(screen.getByText("working…")).toBeInTheDocument()
    expect(screen.getByText(tr("fail.modelSettlementPending"))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /retry|重试|重新发送/i })).not.toBeInTheDocument()
    expect(onRetry).not.toHaveBeenCalled()
    expect(zh["fail.modelSettlementPending"]).toBe("本轮已停止，已生成的内容已保留；结算仍待核对。")
  })

  const delivery: SessionDelivery = {
    conversationId: "ses_1", artifactId: "artifact_1", assetId: "asset_1", artifactKind: "document",
    title: "Report", mime: "application/pdf", size: 2048, runId: "run_1", createdAt: "2026-09-30T00:00:00Z",
  }

  it.each([
    ["empty", ""],
    ["partial", "partial answer"],
    ["full", "This answer looks complete."],
  ])("%s terminal 保留正文并把唯一失败 footer 放在 exact run 内", (_label, content) => {
    const profile = failureProfile("internal_error")
    const thread = {
      ...createSessionStreamState(),
      messages: [
        { id: "u1", role: "user" as const, content: "same prompt", runId: "u1" },
        { id: "a1", role: "assistant" as const, content, runId: "run_failed" },
        { id: "u2", role: "user" as const, content: "same prompt", runId: "u2" },
        { id: "a2", role: "assistant" as const, content: "newer success", runId: "run_success" },
      ],
      stepsByRun: {
        run_failed: [{ kind: "text" as const, seq: 1, segmentId: "a1" }],
        run_success: [{ kind: "text" as const, seq: 2, segmentId: "a2" }],
      },
      runFailuresById: {
        run_failed: { failedRunId: "run_failed", kind: "agent" as const, profile },
      },
    }
    const { container } = renderFailure(thread)
    const failedTurn = container.querySelector('[data-message-id="assistant:run_failed:turn:0"]')
    const successfulTurn = container.querySelector('[data-message-id="assistant:run_success:turn:0"]')
    expect(container.querySelectorAll('[data-message-id="u1"], [data-message-id="u2"]')).toHaveLength(2)
    expect(failedTurn?.querySelector('[data-run-failure="run_failed"]')).not.toBeNull()
    expect(successfulTurn?.querySelector('[role="alert"]')).toBeNull()
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: tr("thread.retry") })).toBeNull()
    if (content) expect(failedTurn).toHaveTextContent(content)
  })

  it("同 run 多个 assistant 组只在最后一组放一次 footer", () => {
    const profile = failureProfile("dependency_unavailable")
    const thread = {
      ...createSessionStreamState(),
      messages: [
        { id: "a1", role: "assistant" as const, content: "part one", runId: "run_a" },
        { id: "u1", role: "user" as const, content: "persisted boundary", runId: "u1" },
        { id: "a2", role: "assistant" as const, content: "part two", runId: "run_a" },
      ],
      stepsByRun: { run_a: [
        { kind: "text" as const, seq: 1, segmentId: "a1" },
        { kind: "text" as const, seq: 2, segmentId: "a2" },
      ] },
      runFailuresById: { run_a: { failedRunId: "run_a", kind: "agent" as const, profile } },
    }
    const { container } = renderFailure(thread)
    const turns = container.querySelectorAll('[data-slot="message-scroller-item"][data-message-id^="assistant:run_a:turn:"]')
    expect(turns).toHaveLength(2)
    expect([...turns].map((turn) => turn.getAttribute("data-message-id"))).toEqual([
      "assistant:run_a:turn:0",
      "assistant:run_a:turn:1",
    ])
    expect(turns[0]?.querySelector('[data-run-failure="run_a"]')).toBeNull()
    expect(turns[1]?.querySelectorAll('[data-run-failure="run_a"]')).toHaveLength(1)
  })

  it.each([
    ["empty", ""],
    ["with body", "historical partial"],
  ])("active run identity keeps replayed old failure visible alongside current live feedback: %s", (_label, content) => {
    const profile = failureProfile("model_unavailable")
    const thread = {
      ...createSessionStreamState(),
      activeRunId: "run_new",
      messages: [{ id: "old_answer", role: "assistant" as const, content, runId: "run_old" }],
      stepsByRun: { run_old: [{ kind: "text" as const, seq: 1, segmentId: "old_answer" }] },
      runFailuresById: {
        run_old: { failedRunId: "run_old", kind: "agent" as const, profile },
      },
    }
    const { container, rerender } = render(
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
    expect(container.querySelector('[data-run-failure="run_old"]')).not.toBeNull()
    expect(screen.getAllByText(tr("thread.formingAnswer"))).toHaveLength(1)

    rerender(
      <LocaleProvider>
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
        />
      </LocaleProvider>,
    )
    expect(container.querySelectorAll('[data-run-failure="run_old"]')).toHaveLength(1)
    expect(screen.getAllByText(tr("thread.formingAnswer"))).toHaveLength(1)
  })

  it("compact footer 在窄栏可换行且没有 terminal 可聚焦动作", () => {
    const css = readFileSync(`${process.cwd()}/src/ui/thread/thread.module.css`, "utf8")
    expect(css).toMatch(/\.runFailureFooter\s*\{[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/u)
    const { container } = renderFailure(failedThread("model_unavailable"))
    const footer = container.querySelector('[data-run-failure="run_1"]')
    expect(footer?.querySelector('button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])')).toBeNull()
  })

  it("partial/full terminal 的 settled copy footer 仍可见可操作", () => {
    const css = readFileSync(`${process.cwd()}/src/ui/thread/thread.module.css`, "utf8")
    expect(css).toMatch(/\.assistantActions\s*\{[^}]*display:\s*flex;/u)
    const { container } = renderFailure(failedThread("dependency_unavailable"))
    const turn = container.querySelector('[data-message-id="assistant:run_1:turn:0"]')
    expect(turn?.querySelector(`button[aria-label="${tr("thread.copyAnswer")}"]`)).not.toBeNull()
  })

  it.each([
    { name: "空成果且无更多页", sessionId: "ses_1", deliveries: [], hasMore: false, canOpen: true, visible: false },
    { name: "无会话且空成果", sessionId: null, deliveries: [], hasMore: false, canOpen: true, visible: false },
    { name: "无会话且已有成果", sessionId: null, deliveries: [delivery], hasMore: false, canOpen: true, visible: false },
    { name: "无会话且有更多页", sessionId: null, deliveries: [], hasMore: true, canOpen: true, visible: false },
    { name: "有效会话且有更多页", sessionId: "ses_1", deliveries: [], hasMore: true, canOpen: true, visible: true },
    { name: "有效会话且已有成果", sessionId: "ses_1", deliveries: [delivery], hasMore: false, canOpen: true, visible: true },
    { name: "无打开动作且已有成果", sessionId: "ses_1", deliveries: [delivery], hasMore: false, canOpen: false, visible: false },
  ])("无所属轮的成果保留 Library 入口，并遵守会话和打开动作边界：$name", ({ sessionId, deliveries, hasMore, canOpen, visible }) => {
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
    const libraryLinks = screen.queryAllByRole("link", { name: tr("delivery.viewAll") })
    expect(libraryLinks).toHaveLength(visible ? 1 : 0)
    if (visible) expect(libraryLinks[0]).toHaveAttribute("href", "/app/library?tab=artifacts")
    // No Run turn is present in this window: keep access, never invent a card owner.
    expect(container.querySelector('[data-canvas-opener="true"]')).toBeNull()
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
        hasFailed={false}
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
    const assistantItem = container.querySelector('[data-slot="message-scroller-item"][data-message-id="assistant:run_1:turn:0"]')
    const feedback = container.querySelector('[data-run-failure="run_1"]')
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

  it("无 run_id 的真实 generic 失败保留独立安全反馈", () => {
    const thread = stateFromSnapshot(makeSnapshot({
      messages: [{ message_id: "a_unknown", role: "assistant", content: "partial", status: "failed", created_at: "2026-07-02T00:00:01Z" }],
    }))
    const { container } = render(
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
        onRetry={vi.fn()}
        mode="fast"
        stagingByRun={{}}
        hitlRunId={null}
        controlError={null}
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
        currentRunId="run_1"
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
        currentRunId="run_1"
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

it("an unconfirmed admission is not described as a failed execution, and only explicit original recovery is offered", () => {
  const thread = createSessionStreamState()
  thread.messages = [{ id: "local_unknown", role: "user", content: "preserve original intent", runId: "local_unknown" }]
  const retry = vi.fn()
  renderFailure(thread, retry, "submission_outcome_unknown", true)
  expect(screen.getByRole("status")).toHaveTextContent(tr("thread.submissionUnconfirmed"))
  expect(screen.queryByText(tr("fail.generic"))).toBeNull()
  expect(screen.getByText("preserve original intent")).toBeVisible()
  expect(retry).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: tr("thread.retryOriginal") }))
  expect(retry).toHaveBeenCalledTimes(1)
})

describe("confirmed cancellation presentation", () => {
  it.each(["", "preserved answer"])("keeps %j and shows a neutral stopped footer, not generic failure", (content) => {
    const state = applyChatProjectionEvent({ ...createSessionStreamState(), messages: content ? [{ id: "a", role: "assistant", content, runId: "r" }] : [] }, {
      event_id: "cancelled", session_id: "ses_1", run_id: "r", timestamp: "now", seq: 1,
      kind: "run.completed", payload: { status: "cancelled" },
    })
    renderFailure(state)
    expect(screen.getByText(tr("thread.cancelled"))).toBeInTheDocument()
    if (content) expect(screen.getByText(content)).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

it("offers an explicit same-intent cancel retry only while cancellation is uncertain", () => {
  const retryCancel = vi.fn()
  render(<ConversationThread sessionId="ses_1" thread={createSessionStreamState()} isStreaming currentRunId="r" executionPhase="cancelling"
    isReconnecting={false} hasFailed={false} canRetryPendingSubmission={false} creditRejected={false} onOpenBilling={vi.fn()} onOpenPricing={vi.fn()}
    onRetry={vi.fn()} mode="fast" stagingByRun={{}} hitlRunId={null} controlError="lost ACK" onCancelRun={retryCancel} />, { wrapper: LocaleProvider })
  expect(screen.getByText(tr("thread.cancelUnknown"))).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: tr("thread.retryCancel") }))
  expect(retryCancel).toHaveBeenCalledTimes(1)
  expect(screen.queryByText(tr("thread.cancelled"))).not.toBeInTheDocument()
  expect(screen.queryByText("lost ACK")).not.toBeInTheDocument()
})

it("keeps a real unread cancelled body recoverable without inventing a generic Run failure", () => {
  const state = stateFromSnapshot(makeSnapshot({ messages: [{ message_id: "a", role: "assistant", run_id: "r", status: "failed", terminal_status: "cancelled", content: "prefix", created_at: "now" }] }))
  state.messageParts = { a: { messageId: "a", runId: "r", revision: "1", status: "partial" } }
  renderFailure(state)
  expect(screen.getByText("prefix")).toBeInTheDocument()
  expect(screen.getByText(tr("thread.cancelled"))).toBeInTheDocument()
  expect(screen.getByText(tr("thread.partsPartial"))).toBeInTheDocument()
  expect(state.runFailuresById).toEqual({})
})
