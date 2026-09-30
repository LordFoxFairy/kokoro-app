// ERROR-UX（Wave5）：run.failed 分类文案 + 恢复引导 + message 原文折叠。
import { readFileSync } from "node:fs"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionStreamState, type RunErrorCode, type SessionDelivery, type SessionStreamState } from "@/core/state"
import { LocaleProvider } from "@/i18n/context"
import { zh, type MessageKey } from "@/i18n/messages"
import { negotiateLocale, resolveMessage } from "@/i18n/resolve"
import { ConversationThread, failureCopyKey } from "@/ui/thread/conversation-thread"

// LocaleProvider 水合后按 navigator.languages 协商语言（jsdom 通常 en）——按同一协商取译文断言，
// 不写死语言，避免测试与运行环境语言绑定。
const LOCALE = negotiateLocale(null, typeof navigator !== "undefined" ? [...navigator.languages] : [])
const tr = (key: MessageKey): string => resolveMessage(LOCALE, key)

const CODES: RunErrorCode[] = [
  "token_budget_exceeded",
  "recursion_limit_exceeded",
  "assembly_failed",
  "enqueue_failed",
  "dispatch_exhausted",
  "contract_incompatible",
  "internal_error",
]

function failedThread(code: RunErrorCode, message: string): SessionStreamState {
  const thread = createSessionStreamState()
  return {
    ...thread,
    messages: [
      { id: "m_u", role: "user", content: "do the thing", runId: "m_u" },
      { id: "m_a", role: "assistant", content: "working…", runId: "run_1" },
    ],
    stepsByRun: { run_1: [] },
    runStatus: "failed",
    runError: { code, message },
  }
}

function emptyFailedThread(): SessionStreamState {
  return {
    ...failedThread("internal_error", "diagnostic"),
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("failureCopyKey — 闭集 7 码逐码本地化", () => {
  it("每个闭集码映射到一个存在的、非通用的文案键", () => {
    for (const code of CODES) {
      const key = failureCopyKey({ code, message: "x" })
      expect(key).not.toBe("fail.generic")
      expect(zh[key]).toBeTruthy()
    }
  })

  it("七码映射两两不同（无碰撞）", () => {
    const keys = CODES.map((code) => failureCopyKey({ code, message: "x" }))
    expect(new Set(keys).size).toBe(CODES.length)
  })

  it("未知码与 null 兜底通用句", () => {
    expect(failureCopyKey({ code: "totally_unknown", message: "x" })).toBe("fail.generic")
    expect(failureCopyKey(null)).toBe("fail.generic")
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
    const thread = failedThread("internal_error", "diagnostic")
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
    expect(screen.getAllByRole("button", { name: tr("thread.retry") })).toHaveLength(1)
    expect(screen.getByRole("button", { name: tr("fail.showDetail") })).toBeEnabled()
  })

  it("空终态助手轮在同一滚动项承接唯一余额不足反馈及全部动作", () => {
    const { container } = render(
      <ConversationThread
        sessionId="ses_1"
        thread={emptyFailedThread()}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
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

    const assistantItem = container.querySelector('[data-slot="message-scroller-item"][data-message-id="run_1"]')
    const feedback = container.querySelector('[data-message-id="credit-error"]')
    expect(feedback?.closest('[data-slot="message-scroller-item"]')).toBe(assistantItem)
    expect(container.querySelectorAll('[data-slot="message-scroller-item"][data-message-id="credit-error"]')).toHaveLength(0)
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByRole("button", { name: tr("billing.viewPricing") })).toBeEnabled()
    expect(screen.getByRole("button", { name: tr("billing.viewBalance") })).toBeEnabled()
    expect(screen.getAllByRole("button", { name: tr("thread.retry") })).toHaveLength(1)
  })

  it.each([
    {
      name: "有正文",
      thread: () => failedThread("internal_error", "diagnostic"),
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
    expect(screen.getAllByRole("button", { name: tr("thread.retry") })).toHaveLength(1)
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
        thread={failedThread("internal_error", "diagnostic")}
        isStreaming={false}
        isReconnecting={false}
        hasFailed
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

  it("流式助手轮不以 atomic=true 重复播报整轮内容", () => {
    const thread = failedThread("internal_error", "streaming diagnostic")
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={thread}
        isStreaming
        isReconnecting={false}
        hasFailed={false}
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
      renderFailure(failedThread(code, "raw diagnostic"))
      const key = failureCopyKey({ code, message: "x" })
      expect(screen.getByText(tr(key))).toBeTruthy()
      // 裸码绝不出现在可见文案里。
      expect(screen.queryByText(code)).toBeNull()
      cleanup()
    }
  })

  it("message 原文折叠可展开", () => {
    const scrollIntoView = vi.fn()
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    renderFailure(failedThread("internal_error", "boom at line 42"))
    fireEvent.click(screen.getByRole("button", { name: tr("fail.showDetail") }))
    const detail = screen.getByText("boom at line 42")
    expect(detail.tagName.toLowerCase()).toBe("pre")
    expect(screen.getByText(tr("fail.showDetail"))).toBeTruthy()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" })
  })

  it("internal_error 额外给反馈指引", () => {
    renderFailure(failedThread("internal_error", "boom"))
    expect(screen.getByText(tr("fail.internalHint"))).toBeTruthy()
  })

  it("非 internal_error 不显示反馈指引", () => {
    renderFailure(failedThread("enqueue_failed", "boom"))
    expect(screen.queryByText(tr("fail.internalHint"))).toBeNull()
  })

  it("重试按钮触发 onRetry（重发原消息）", () => {
    const onRetry = vi.fn()
    renderFailure(failedThread("dispatch_exhausted", "boom"), onRetry)
    fireEvent.click(screen.getByText(tr("thread.retry")))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("重试已进入流式态后锁定按钮，避免重复创建 run", () => {
    const onRetry = vi.fn()
    render(
      <ConversationThread
        sessionId="ses_1"
        thread={failedThread("dispatch_exhausted", "boom")}
        isStreaming
        isReconnecting={false}
        hasFailed
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
    expect(retry).toBeDisabled()
    expect(retry).toHaveAttribute("aria-busy", "true")
    fireEvent.click(retry)
    expect(onRetry).not.toHaveBeenCalled()
  })
})
