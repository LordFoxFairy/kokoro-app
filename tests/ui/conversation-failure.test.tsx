// ERROR-UX（Wave5）：run.failed 分类文案 + 恢复引导 + message 原文折叠。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionStreamState, type RunErrorCode, type SessionStreamState } from "@/core/state"
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
