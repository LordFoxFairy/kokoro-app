// Composer 模型选择器（MODEL-UX）：候选下拉渲染 + 选择回调（raw business label key）+ 首条锁定态 + 空候选隐藏。
import { readFileSync } from "node:fs"
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { createSessionEngine } from "@/engine/machine"
import { createFakeClient, createMemoryStorage, settle } from "../engine/fakes"
import { useComposerSelectors } from "@/ui/shell/use-composer-selectors"
import { createRef, type FormEvent, useState } from "react"

import type { ConversationStore } from "@/core/conversations"
import type { ModelCandidate } from "@/contract/http"
import { LocaleProvider } from "@/i18n/context"
import { Composer } from "@/ui/composer/composer"
import { CreationIntentPill, type CreationIntent } from "@/ui/composer/creation-intent-pill"

const MODELS: ModelCandidate[] = [
  { provider: "anthropic", name: "claude-sonnet-4-6", is_default: true, display_name: "claude-sonnet-4-6", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "claude-sonnet-4-6" },
  { provider: "openai", name: "gpt-5", is_default: false, display_name: "gpt-5", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "gpt-5" },
]

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    draft: "",
    onDraftChange: vi.fn(),
    onKeyDown: vi.fn(),
    onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()),
    isStreaming: false,
    canSend: false,
    onStop: vi.fn(),
    composerRef: { current: null },
    mode: "fast" as const,
    onModeChange: vi.fn(),
    modeLocked: false,
    models: MODELS,
    selectedModel: null,
    onModelChange: vi.fn(),
    modelLocked: false,
    environmentLabel: "Kokoro 桌面版",
    onCreationIntentDismiss: vi.fn(),
    ...overrides,
  }
  render(<Composer {...props} />, { wrapper: LocaleProvider })
  return props
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it("shows the selected exact skill as removable context without changing the editable prompt", () => {
  const props = renderComposer({ draft: "editable prompt", selectedSkill: { name: "Exact skill", sourceRef: "skill:revision-one" }, onRemoveSelectedSkill: vi.fn() })
  expect(screen.getByText("Exact skill")).toBeVisible()
  fireEvent.click(screen.getByRole("button", { name: /Exact skill/ }))
  expect(props.onRemoveSelectedSkill).toHaveBeenCalledOnce()
  expect(screen.getByRole("textbox")).toHaveValue("editable prompt")
  expect(props.onSubmit).not.toHaveBeenCalled()
})

it("preserves an over-limit restored draft, explains the limit and blocks submission until corrected", () => {
  const draft = "a".repeat(4001)
  const props = renderComposer({ draft, canSend: true })
  const input = screen.getByRole("textbox", { name: "Chat input" })
  expect(input).toHaveValue(draft)
  expect(input).toHaveAttribute("aria-invalid", "true")
  expect(input).toHaveAccessibleDescription("Messages can contain up to 4000 characters. Shorten your draft to send.")
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
  fireEvent.submit(screen.getByRole("form", { name: "Message editor" }))
  expect(props.onSubmit).not.toHaveBeenCalled()

  cleanup()
  const corrected = renderComposer({ draft: "a".repeat(4000), canSend: true })
  expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid", "true")
  expect(screen.queryByText(/Shorten your draft/)).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled()
  fireEvent.submit(screen.getByRole("form", { name: "Message editor" }))
  expect(corrected.onSubmit).toHaveBeenCalledOnce()
})

describe("Composer model selector", () => {
  it("fast 输入使用中性提示，不作免费或扣点承诺", () => {
    renderComposer({ mode: "fast" })
    const input = screen.getByRole("textbox", { name: "Chat input" })
    expect(input).toHaveAttribute("placeholder", "Tell me what's on your mind.")
    expect(input.getAttribute("placeholder")).not.toMatch(/free|credit|免费|点数|积分/iu)
  })

  it("selectedModel=null 时高亮缺省候选（is_default）", () => {
    renderComposer()
    expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy()
  })

  it("展示别名但真实UI提交给engine的model是raw业务label key", async () => {
    const client = createFakeClient()
    const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
    try {
      renderComposer({
        models: [MODELS[0]!, { ...MODELS[1]!, provider: "real-provider", name: "chat/fast", display_name: "Optional alias", request_model: "vendor/model-fast" }],
        onModelChange: value => engine.setModel(value),
        draft: "stable label request", canSend: true,
        onSubmit: event => { event.preventDefault(); engine.submit("stable label request") },
      })
      fireEvent.pointerDown(screen.getByRole("button", { name: /Switch model:/ }))
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Optional alias" }))
      fireEvent.submit(screen.getByRole("form", { name: "Message editor" }))
      await settle()
      expect(client.createCalls[0]?.body.model).toBe("chat/fast")
    } finally { engine.dispose() }
  })

  it("旧provider:name偏好不注入engine，旧key和其他存储保持原样", async () => {
    const old = JSON.stringify({ model: "real-provider:chat/fast" })
    window.localStorage.setItem("kokoro.web.chat-prefs", old)
    window.localStorage.setItem("unrelated-test-entry", "preserve")
    window.localStorage.removeItem("kokoro.web.chat-prefs.v2")
    const client = createFakeClient()
    const engine = createSessionEngine({ client, storage: createMemoryStorage<ConversationStore>(null) })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ models: MODELS, next_cursor: null })))
    const hook = renderHook(() => useComposerSelectors(engine))
    try {
      await act(async () => { await settle(); engine.submit("no legacy preference"); await settle() })
      expect(client.createCalls[0]?.body).not.toHaveProperty("model")
      expect(window.localStorage.getItem("kokoro.web.chat-prefs")).toBe(old)
      expect(window.localStorage.getItem("unrelated-test-entry")).toBe("preserve")
    } finally {
      hook.unmount(); engine.dispose(); vi.unstubAllGlobals()
      window.localStorage.removeItem("kokoro.web.chat-prefs")
      window.localStorage.removeItem("unrelated-test-entry")
    }
  })

  it("selectedModel 命中候选时显示该项为当前", () => {
    renderComposer({ selectedModel: "gpt-5" })
    // 触发器展示当前选择的名称。
    const trigger = screen.getByRole("button", { name: /Switch model:/ })
    expect(trigger.textContent).toContain("gpt-5")
    expect(trigger).toHaveAccessibleName("Switch model: gpt-5")
    expect(trigger).toHaveAttribute("title", "gpt-5")
  })

  it("selectedModel 不再存在于目录时回落缺省项并保持单选态", () => {
    renderComposer({ selectedModel: "retired:old-model" })
    const trigger = screen.getByRole("button", { name: /Switch model:/ })
    expect(trigger).toHaveAccessibleName("Switch model: claude-sonnet-4-6")

    fireEvent.pointerDown(trigger)
    expect(screen.getByRole("menuitemradio", { name: "claude-sonnet-4-6" })).toHaveAttribute("data-state", "checked")
  })

  it("modelLocked → 只读锁定态（不可展开切换）", () => {
    renderComposer({ selectedModel: "gpt-5", modelLocked: true })
    expect(screen.queryByRole("button", { name: /Switch model:/ })).toBeNull()
    const locked = screen.getByRole("button", { name: /locked this turn/i })
    expect(locked.hasAttribute("disabled")).toBe(true)
    expect(locked.textContent).toContain("gpt-5")
    expect(locked).toHaveAttribute("title", expect.stringContaining("gpt-5"))
  })

  it("空候选 → 不渲染模型选择器", () => {
    renderComposer({ models: [] })
    expect(screen.queryByRole("button", { name: /Switch model:/ })).toBeNull()
  })

  it("单一桌面环境使用静态控件，不打开伪菜单", () => {
    renderComposer({ models: [] })

    const environment = screen.getByRole("status", { name: /Kokoro 桌面版/ })
    expect(environment).toHaveAttribute("data-environment-state", "static")
    expect(environment).not.toHaveAttribute("tabindex")
    expect(environment.closest("button")).toBeNull()
  })

  it("站点首屏已在顶栏承接模型选择时，Composer 不重复渲染第二个模型入口", () => {
    renderComposer({ hideModelSelector: true })
    expect(screen.queryByRole("button", { name: /Switch model:/ })).toBeNull()
    expect(screen.getByRole("button", { name: /Switch mode:/ })).toBeInTheDocument()
  })

  it("站点可以为项目上下文投影专属输入提示", () => {
    renderComposer({ placeholder: "在此项目开始会话" })
    expect(screen.getByRole("textbox", { name: "Chat input" })).toHaveAttribute("placeholder", "在此项目开始会话")
  })

  it("网站创作意图显示固定选中胶囊，普通聊天不显示", () => {
    renderComposer({ creationIntent: "website" })
    const intent = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites creation mode", hidden: true })
    expect(intent).toHaveTextContent("Websites")
    expect(intent).toHaveAttribute("data-slot", "creation-intent")
    expect(intent).toHaveAttribute("data-intent", "website")
    const closeIcon = closeButton.querySelector('[data-testid="creation-intent-close"]')
    expect(closeIcon).toBeInTheDocument()
    expect(closeIcon).toHaveClass("lucide-x")
    expect(closeButton).toHaveAttribute("type", "button")
    expect(closeButton).toHaveAttribute("data-hit-area", "24")
    expect(closeButton).toHaveAttribute("aria-keyshortcuts", "Enter Space")

    cleanup()
    renderComposer()
    expect(screen.queryByTestId("creation-intent-pill")).toBeNull()
  })

  it("应用创作意图也使用同规格可关闭胶囊", () => {
    renderComposer({ creationIntent: "app" })
    const intent = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Develop app creation mode", hidden: true })
    expect(intent).toHaveTextContent("Develop app")
    expect(closeButton.querySelector('[data-testid="creation-intent-close"]')).toBeInTheDocument()
    expect(intent.querySelector(".lucide-smartphone")).toBeNull()
    expect(intent).toHaveAttribute("data-slot", "creation-intent")
    expect(intent).toHaveAttribute("data-intent", "app")
  })

  it.each([
    ["website", "Websites", "creation-intent-glyph"],
    ["presentation", "Slides", "creation-intent-glyph"],
    ["design", "Design", "creation-intent-glyph"],
    ["game", "Games", "creation-intent-glyph"],
    ["app", "Develop app", "creation-intent-glyph"],
  ] as const)("%s 变体复用同一胶囊结构和关闭命中区", (intent, label, glyphTestId) => {
    const onDismiss = vi.fn()
    render(<CreationIntentPill intent={intent} label={label} onDismiss={onDismiss} />)

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByTestId("creation-intent-close-button")

    expect(capsule).toHaveAttribute("data-intent", intent)
    expect(capsule).toHaveAttribute("data-slot", "creation-intent")
    expect(screen.getByTestId(glyphTestId)).toHaveAttribute("aria-hidden", "true")
    expect(closeButton).toHaveAttribute("data-slot", "creation-intent-close")
    expect(closeButton).toHaveAttribute("data-hit-area", "24")
    expect(closeButton).toBeEnabled()

    fireEvent.click(closeButton)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("设计创作意图使用对应图标，并在同一工具栏显示图像模型", () => {
    renderComposer({
      creationIntent: "design",
      models: [
        { provider: "kokoro", name: "standard-new", is_default: true, display_name: "Standard New", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "standard-new" },
        { provider: "openai", name: "gpt-image-2", is_default: false, display_name: "GPT Image 2", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "gpt-image-2" },
      ],
      preferredModelSelector: "gpt-image-2",
      hideModelSelector: false,
    })

    const intent = screen.getByTestId("creation-intent-pill")
    expect(intent).toHaveAttribute("data-intent", "design")
    expect(screen.getByTestId("creation-intent-glyph")).toHaveClass("lucide-sparkles")
    expect(screen.getByRole("button", { name: "Switch model: GPT Image 2" })).toBeInTheDocument()
  })

  it("创作工作流的首选模型在目录可用时同步到受控选择值", () => {
    const props = renderComposer({
      creationIntent: "design",
      models: [
        { provider: "kokoro", name: "standard-new", is_default: true, display_name: "Standard New", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "standard-new" },
        { provider: "openai", name: "gpt-image-2", is_default: false, display_name: "GPT Image 2", model_id: "11111111-1111-4111-8111-111111111111", revision_id: "22222222-2222-4222-8222-222222222222", provider_id: "33333333-3333-4333-8333-333333333333", feature_key: "chat", request_model: "gpt-image-2" },
      ],
      preferredModelSelector: "gpt-image-2",
      selectedModel: null,
      hideModelSelector: false,
    })

    expect(props.onModelChange).toHaveBeenCalledWith("gpt-image-2")
  })

  it("简报创作态使用投影片胶囊文案而不是入口文案", () => {
    renderComposer({ creationIntent: "presentation", models: [], hideModelSelector: true })

    expect(screen.getByTestId("creation-intent-pill")).toHaveTextContent("Slides")
    expect(screen.getByTestId("creation-intent-pill")).toHaveAttribute("data-intent", "presentation")
  })

  it("普通空白直接会话显示语音模式与麦克风两个入口", () => {
    renderComposer({ emptyWorkspace: true })

    expect(screen.getByRole("button", { name: "Voice mode" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voice input" })).toBeInTheDocument()
  })

  it("网站创建意图收起语音模式，只保留麦克风入口", () => {
    renderComposer({ emptyWorkspace: true, creationIntent: "website" })

    expect(screen.queryByRole("button", { name: "Voice mode" })).toBeNull()
    expect(screen.getByRole("button", { name: "Voice input" })).toBeEnabled()
  })

  it("麦克风指针焦点标记在失焦时清理，不产生异步事件错误", () => {
    renderComposer({ emptyWorkspace: true, creationIntent: "website" })
    const voice = screen.getByRole("button", { name: "Voice input" })

    fireEvent.pointerDown(voice, { pointerType: "mouse" })
    expect(voice).toHaveAttribute("data-pointer-focus", "true")
    fireEvent.blur(voice)
    expect(voice).not.toHaveAttribute("data-pointer-focus")
  })

  it("preview 语音输入保持原位按钮，并异步完成转写", async () => {
    vi.useFakeTimers()
    const props = renderComposer({ emptyWorkspace: true, creationIntent: "website", voicePreview: true })
    const voice = screen.getByRole("button", { name: "Voice input" })

    fireEvent.click(voice)
    expect(screen.queryByTestId("voice-recorder")).toBeNull()
    expect(screen.getByRole("button", { name: "Stop voice input" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Listening")).toHaveAttribute("data-slot", "voice-input-status")

    act(() => vi.advanceTimersByTime(620))
    expect(screen.getByRole("button", { name: "Stop voice input" })).toHaveAttribute("data-state", "transcribing")
    expect(screen.getByText("Transcribing")).toHaveAttribute("data-slot", "voice-input-status")
    act(() => vi.advanceTimersByTime(220))
    expect(props.onDraftChange).toHaveBeenCalledWith("Help me organize today's priorities")
    expect(screen.getByRole("button", { name: "Voice input" })).toBeInTheDocument()
  })

  it("再次点击会取消 preview 录音且不会追加转写", async () => {
    vi.useFakeTimers()
    const props = renderComposer({ voicePreview: true })

    fireEvent.click(screen.getByRole("button", { name: "Voice input" }))
    fireEvent.click(screen.getByRole("button", { name: "Stop voice input" }))
    await vi.advanceTimersByTimeAsync(1000)

    expect(props.onDraftChange).not.toHaveBeenCalled()
    expect(screen.queryByTestId("voice-recorder")).toBeNull()
    expect(screen.getByRole("button", { name: "Voice input" })).toBeInTheDocument()
  })

  it("浏览器不支持语音识别时保留原位按钮并提供无障碍状态", () => {
    renderComposer({ voicePreview: false })

    fireEvent.click(screen.getByRole("button", { name: "Voice input" }))

    expect(screen.getByRole("button", { name: "Voice input" })).toHaveAttribute("data-state", "error")
    expect(screen.getByRole("status")).toHaveTextContent("Voice input is unavailable in this browser")
  })

  it("活动会话继续保留语音模式与语音输入两个入口", () => {
    renderComposer({ emptyWorkspace: false })

    expect(screen.getByRole("button", { name: "Voice mode" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voice input" })).toBeInTheDocument()
  })

  it("活动项目线程同时保留任务状态入口与底部桌面环境锚点", () => {
    renderComposer({
      models: [],
      projectWorkspace: true,
      environmentSelectorPlacement: "floating",
    })

    const environmentAnchors = screen.getAllByRole("status", { name: /Kokoro 桌面版/ })
    expect(environmentAnchors).toHaveLength(1)
    expect(environmentAnchors[0]).toHaveAttribute("data-slot", "floating-environment")
    expect(environmentAnchors.some((anchor) => anchor.className.includes("environmentIconOnly"))).toBe(false)
    expect(screen.queryByRole("menu")).toBeNull()
    expect(environmentAnchors.every((anchor) => anchor.getAttribute("data-environment-state") === "static")).toBe(true)
  })

  it("停止态复用 32px 的桌面发送槽位", () => {
    renderComposer({ isStreaming: true, canSend: false })
    const stop = screen.getByRole("button", { name: "Stop generating" })
    expect(stop).toHaveAttribute("data-size", "icon-sm")
  })

  it("桌面 Web 只保留 Manus 式内联编辑器，不渲染旧的放大编辑入口", () => {
    renderComposer()

    expect(screen.queryByRole("button", { name: "Expand editor" })).toBeNull()
  })
})

describe("CreationIntentPill dismissal", () => {
  it("renders the reference overlay close target and delegates dismissal without submitting", () => {
    const onDismiss = vi.fn()
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <CreationIntentPill intent="website" label="Websites" onDismiss={onDismiss} />
      </form>
    )

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites", hidden: true })

    expect(capsule).toHaveAttribute("data-slot", "creation-intent")
    expect(capsule).toHaveAttribute("data-dismiss-action", "creation-intent")
    const closeIcon = closeButton.querySelector(".lucide-x")
    expect(closeIcon).toBeInTheDocument()
    expect(screen.getByTestId("creation-intent-glyph")).toHaveAttribute("data-slot", "code-window-icon")
    expect(closeIcon).toHaveAttribute("data-testid", "creation-intent-close")
    expect(closeIcon).toHaveAttribute("aria-hidden", "true")
    expect(closeButton).toHaveAttribute("title", "Dismiss Websites")

    fireEvent.click(closeButton)

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(capsule).toBeInTheDocument()
  })

  it("clicking the capsule does not steal a focused multiline draft", () => {
    const onDismiss = vi.fn()
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <textarea aria-label="Draft" defaultValue={"第一行\n第二行"} />
        <CreationIntentPill intent="website" label="Websites" onDismiss={onDismiss} />
      </form>
    )

    const draft = screen.getByRole("textbox", { name: "Draft" })
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites", hidden: true })
    draft.focus()

    const mouseDown = createEvent.mouseDown(closeButton)
    fireEvent(closeButton, mouseDown)

    expect(mouseDown.defaultPrevented).toBe(true)
    expect(draft).toHaveFocus()

    fireEvent.click(closeButton)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("clicking the visible X delegates to the same dismiss action", () => {
    const onDismiss = vi.fn()
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <CreationIntentPill intent="website" label="Websites" onDismiss={onDismiss} />
      </form>
    )

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites", hidden: true })

    fireEvent.click(closeButton)

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(capsule).toBeInTheDocument()
  })

  it("在桌面悬停时保持固定尺寸并保留可发现的关闭入口", () => {
    render(<CreationIntentPill intent="website" label="Websites" onDismiss={vi.fn()} />)

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites" })
    const glyph = screen.getByTestId("creation-intent-glyph")
    const before = capsule.getBoundingClientRect().width

    expect(glyph).toBeVisible()
    fireEvent.pointerEnter(capsule, { pointerType: "mouse" })
    expect(capsule).not.toHaveAttribute("data-hovered")
    expect(closeButton).toBeVisible()
    expect(glyph).toBeVisible()
    expect(capsule.getBoundingClientRect().width).toBe(before)

    fireEvent.pointerLeave(capsule, { pointerType: "mouse" })
    expect(capsule).not.toHaveAttribute("data-hovered")
  })

  it("suppresses primary pointer focus stealing for mouse and touch while keeping the context menu available", () => {
    const onDismiss = vi.fn()

    render(<CreationIntentPill intent="website" label="Websites" onDismiss={onDismiss} />)

    const closeButton = screen.getByRole("button", { name: "Dismiss Websites", hidden: true })
    const primaryMouseDown = createEvent.pointerDown(closeButton, { button: 0, pointerType: "mouse" })
    const primaryTouchDown = createEvent.pointerDown(closeButton, { button: 0, pointerType: "touch" })
    const secondaryMouseDown = createEvent.pointerDown(closeButton, { button: 2, pointerType: "mouse" })

    fireEvent(closeButton, primaryMouseDown)
    fireEvent(closeButton, primaryTouchDown)
    fireEvent(closeButton, secondaryMouseDown)

    expect(primaryMouseDown.defaultPrevented).toBe(true)
    expect(primaryTouchDown.defaultPrevented).toBe(true)
    expect(secondaryMouseDown.defaultPrevented).toBe(false)
  })

  it("聚焦关闭入口后仍保持稳定的胶囊结构", () => {
    render(<CreationIntentPill intent="website" label="Websites" onDismiss={vi.fn()} />)

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites" })

    closeButton.focus()
    fireEvent.pointerEnter(capsule, { pointerType: "mouse" })
    fireEvent.pointerLeave(capsule, { pointerType: "mouse" })

    expect(closeButton).toHaveFocus()
    expect(closeButton).toBeVisible()

    fireEvent.blur(closeButton)

    expect(capsule).not.toHaveAttribute("data-focused")
  })

  it("不同标签都使用固定的关闭槽位，不挤压相邻控件", () => {
    const { rerender } = render(
      <CreationIntentPill intent="website" label="网站" onDismiss={vi.fn()} />,
    )

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByTestId("creation-intent-close-button")
    const iconSlot = closeButton.parentElement

    expect(iconSlot).toBeInTheDocument()
    expect(iconSlot).toHaveAttribute("data-slot", "creation-intent-icon-slot")
    expect(screen.getByTestId("creation-intent-close-button").parentElement).toBe(iconSlot)
    expect(capsule).toHaveTextContent("网站")

    rerender(
      <CreationIntentPill
        intent="website"
        label="这是一个很长的站点创作标签，用来验证桌面编辑器不会挤压相邻操作"
        onDismiss={vi.fn()}
      />,
    )

    const longCapsule = screen.getByTestId("creation-intent-pill")
    expect(longCapsule.querySelector('[data-testid="creation-intent-close-button"]')?.parentElement).toHaveAttribute(
      "data-slot",
      "creation-intent-icon-slot",
    )
    expect(longCapsule.querySelectorAll("button")).toHaveLength(1)
  })

  it("keyboard focus exposes the X and Enter activates the same dismiss action", () => {
    const onDismiss = vi.fn()
    render(<CreationIntentPill intent="website" label="网站" onDismiss={onDismiss} />)

    const closeButton = screen.getByRole("button", { name: "Dismiss 网站", hidden: true })
    closeButton.focus()

    expect(closeButton).toHaveFocus()
    fireEvent.keyDown(closeButton, { key: "Enter", code: "Enter" })
    // jsdom does not synthesize the browser's native keyboard click. Dispatch
    // the resulting activation explicitly after exercising the key path.
    fireEvent.click(closeButton)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("keeps the visible capsule label passive and exposes a single keyboard close target", () => {
    const onDismiss = vi.fn()
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(
      <form onSubmit={onSubmit}>
        <CreationIntentPill intent="website" label="Websites" onDismiss={onDismiss} />
      </form>
    )

    const capsule = screen.getByTestId("creation-intent-pill")
    const closeButton = screen.getByRole("button", { name: "Dismiss Websites", hidden: true })
    const label = screen.getByText("Websites")

    expect(capsule).toHaveAttribute("data-slot", "creation-intent")
    expect(capsule).toContainElement(label)

    closeButton.focus()
    expect(closeButton).toHaveFocus()

    fireEvent.click(label)

    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.click(closeButton)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("五种创作类型共享统一的语义状态与 24px 关闭命中槽", () => {
    const intents = ["website", "presentation", "design", "game", "app"] as const
    const labels = {
      website: "网站",
      presentation: "投影片",
      design: "设计",
      game: "游戏",
      app: "应用",
    } as const

    render(
      <div>
        {intents.map((intent) => (
          <CreationIntentPill
            key={intent}
            intent={intent}
            label={labels[intent]}
            dismissLabel={`关闭${labels[intent]}`}
            onDismiss={vi.fn()}
          />
        ))}
      </div>,
    )

    const capsules = screen.getAllByTestId("creation-intent-pill")
    expect(capsules).toHaveLength(intents.length)

    capsules.forEach((capsule, index) => {
      const closeButton = screen.getAllByTestId("creation-intent-close-button")[index]
      const intent = intents[index]
      if (closeButton === undefined || intent === undefined) {
        throw new Error("Expected a close button for every creation intent")
      }
      expect(capsule).toHaveAttribute("data-state", "selected")
      expect(closeButton).toHaveAttribute("type", "button")
      expect(closeButton).toHaveAttribute("data-hit-area", "24")
      expect(closeButton).toHaveAttribute("aria-label", `关闭${labels[intent]}`)
      expect(closeButton).toHaveAttribute("title", `关闭${labels[intent]}`)
      expect(closeButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    })
  })

  it("受控取消会卸载胶囊而不留下空的布局槽", () => {
    function ControlledIntent() {
      const [intent, setIntent] = useState<CreationIntent | null>("website")

      return (
        <div data-testid="intent-toolbar">
          {intent ? (
            <CreationIntentPill
              intent={intent}
              label="网站"
              onDismiss={() => setIntent(null)}
            />
          ) : null}
        </div>
      )
    }

    render(<ControlledIntent />)
    fireEvent.click(screen.getByTestId("creation-intent-close-button"))

    expect(screen.queryByTestId("creation-intent-pill")).toBeNull()
    expect(screen.getByTestId("intent-toolbar")).toBeEmptyDOMElement()
  })
})

describe("Composer preset retirement", () => {
  it("仅保留模型和 mode 选择，不呈现旧 agent 选择器", () => {
    renderComposer()
    expect(screen.getByRole("button", { name: /Switch model:/ })).toBeEnabled()
    expect(document.querySelector('[data-composer-control="mode"]')).toBeInTheDocument()
    expect(document.querySelector('[data-composer-control="agent"]')).toBeNull()
  })
})

describe("Composer 状态契约", () => {
  it("受控草稿变化时同步自适应高度", () => {
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 120,
    })
    const composerRef = createRef<HTMLTextAreaElement>()
    renderComposer({ draft: "由场景卡注入的多行草稿", composerRef })
    expect(composerRef.current).toHaveStyle({ height: "120px" })
    delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight
  })

  it("空值保持发送按钮禁用，且保留固定的编辑区", () => {
    renderComposer({ draft: "", canSend: false })
      expect(screen.getByRole("form", { name: "Message editor" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Chat input" })).toHaveAttribute("data-slot", "composer-input")
    expect(screen.getByTestId("composer-controls")).toHaveAttribute("data-slot", "composer-controls")
    expect(screen.getByRole("textbox").closest('[data-slot="composer-wrap"]')).toHaveAttribute("data-layout", "conversation")
    cleanup()
    renderComposer({ emptyWorkspace: true })
    expect(screen.getByRole("textbox").closest('[data-slot="composer-wrap"]')).toHaveAttribute("data-layout", "workspace")
    cleanup()
    renderComposer({ projectWorkspace: true, emptyWorkspace: true })
    expect(screen.getByRole("textbox").closest('[data-slot="composer-wrap"]')).toHaveAttribute("data-layout", "workspace")
    cleanup()
    renderComposer({ projectWorkspace: true })
    expect(screen.getByRole("textbox").closest('[data-slot="composer-wrap"]')).toHaveAttribute("data-layout", "conversation")
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("流式空草稿切换为停止按钮，不改变编辑区语义", () => {
    const props = renderComposer({ draft: "", canSend: false, isStreaming: true })
      const form = screen.getByRole("form", { name: "Message editor" })
    expect(form).toHaveAttribute("aria-busy", "true")
      fireEvent.click(screen.getByRole("button", { name: "Stop generating" }))
    expect(props.onStop).toHaveBeenCalledTimes(1)
  })

  it("流式中有草稿时停止始终可达，发送动作仍独立保留", () => {
    const props = renderComposer({ draft: "补充一个例子", canSend: true, isStreaming: true })
    const stop = screen.getByRole("button", { name: "Stop generating" })
    const send = screen.getByRole("button", { name: "Send interjection" })
    expect(stop).toBeEnabled()
    expect(send).toBeEnabled()
    fireEvent.click(stop)
    expect(props.onStop).toHaveBeenCalledTimes(1)
    expect(props.onSubmit).not.toHaveBeenCalled()
    fireEvent.click(send)
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it("等待批准且有草稿时取消等待与发送动作互不替代", () => {
    const props = renderComposer({ draft: "补充说明", canSend: true, isStreaming: true, isAwaitingApproval: true })
    fireEvent.click(screen.getByRole("button", { name: "Cancel waiting" }))
    expect(props.onStop).toHaveBeenCalledTimes(1)
    expect(props.onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Send interjection" }))
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it("发送动作独立于可换行的选择器 cluster", () => {
    renderComposer()
    const send = screen.getByRole("button", { name: "Send message" })
    const model = screen.getByRole("button", { name: /Switch model:/ })
    expect(send.parentElement?.className).toContain("controls")
    expect(model.parentElement?.className).toContain("cluster")
    expect(send.parentElement).not.toBe(model.parentElement)
  })

  it("只渲染由站点注入的真实前置动作", () => {
    renderComposer({ leadingActions: <button type="button">添加资源</button> })
    expect(screen.getByRole("button", { name: "添加资源" })).toBeInTheDocument()
  })

  it("锁定态保留当前模式但不再提供切换入口", () => {
    renderComposer({ modeLocked: true })
    expect(screen.queryByRole("button", { name: /Switch mode:/ })).toBeNull()
    expect(screen.getByRole("button", { name: /locked this turn/i })).toBeDisabled()
  })

})


it("编辑器基础输入表面去除阴影，不依赖 fine pointer 或聚焦态", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/composer/composer.module.css`, "utf8")
  const baseInput = css.match(/^\.input\s*\{([^}]*)\}/m)?.[1]
  expect(baseInput).toBeDefined()
  expect(baseInput).toMatch(/box-shadow:\s*none;/)
})

it("独立环境控件与高对比模式保留可见焦点保障", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/composer/composer.module.css`, "utf8")
  // Toolbar geometry/focus is exercised in the real browser journey, not a private CSS selector.
  const environmentControl = css.match(
    /^\.wrap\[data-desktop-web="true"\]\[data-empty-workspace="true"\] \[data-environment-state="static"\]\s*\{([^}]*)\}/m,
  )?.[1]
  expect(environmentControl).toMatch(/outline:\s*1px solid rgb\(0 0 0 \/ 6%\);/)
  expect(css).toContain("@media (forced-colors: active)")
  expect(css).toMatch(/\.wrap \.composer:has\(\.input:focus-visible\)/)
})

it("高对比模式由 shell 替代输入框的系统色 outline，保留唯一可见焦点", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/composer/composer.module.css`, "utf8")
  expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.wrap \.composer:has\(\.input:focus-visible\)\s*\{[^}]*outline: 2px solid Highlight;[^}]*outline-offset: 2px;[^}]*box-shadow: none;\s*\}\s*\.input:focus-visible\s*\{[^}]*outline: none;/)
  expect(css).toMatch(/\.input:focus-visible\s*\{[^}]*outline: 2px solid transparent;/)
  expect(css).not.toContain("forced-color-adjust")
})

it("编辑器把可见焦点环画在圆角 shell，textarea 不出现直角内框", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/composer/composer.module.css`, "utf8")
  expect(css).not.toContain(".composer:focus-within")
  expect(css).toMatch(/\.input:focus-visible\s*\{[^}]*outline: 2px solid transparent;/)
  expect(css).toMatch(/\.wrap \.composer:has\(\.input:focus-visible\)\s*\{[^}]*border-color: transparent;[^}]*box-shadow: 0 0 0 2px var\(--ring\);/)
  expect(css).not.toMatch(/\.wrap \.composer:has\(\.input:focus-visible\)\s*\{[^}]*border-color: var\(--ring\);/)
  expect(css).not.toMatch(/\.wrap \.composer:has\(\.input:focus-visible\)\s*\{[^}]*box-shadow: 0 0 0 3px/)
  expect(css).toContain("@media (forced-colors: active)")
  expect(css).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.wrap \.composer:has\(\.input:focus-visible\)\s*\{[^}]*outline: 2px solid Highlight;[^}]*outline-offset: 2px;[^}]*box-shadow: none;/)
  expect(css.indexOf(".wrap .composer:has(.input:focus-visible)")).toBeGreaterThan(css.indexOf('[data-empty-workspace="true"] .composer'))
  expect(css).toContain("@media (prefers-reduced-motion: reduce)")
  expect(css).toContain("@container composer (max-width: 24rem)")
})

it("Textarea 在输入、删除和宽度改变时增高/收缩，忽略纯高度通知并在卸载断开观察", () => {
  const callbacks: ResizeObserverCallback[] = []
  const observe = vi.fn()
  const disconnect = vi.fn()
  const observer = vi.spyOn(globalThis, "ResizeObserver").mockImplementation(class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback) }
    observe = observe
    disconnect = disconnect
    unobserve() {}
  })
  try {
    const props = renderComposer()
    const input = screen.getByRole("textbox") as HTMLTextAreaElement
    let height = 112
    let width = 640
    Object.defineProperty(input, "scrollHeight", { configurable: true, get: () => height })
    Object.defineProperty(input, "clientWidth", { configurable: true, get: () => width })
    fireEvent.change(input, { target: { value: "第一行\n第二行\n第三行" } })
    expect(input.style.height).toBe("112px")
    expect(props.onDraftChange).toHaveBeenCalledWith("第一行\n第二行\n第三行")
    height = 32
    fireEvent.change(input, { target: { value: "短句" } })
    expect(input.style.height).toBe("32px")
    expect(observe).toHaveBeenCalledWith(input)
    const notify = () => act(() => callbacks[0]?.([], {} as ResizeObserver))
    width = 320
    height = 160
    notify()
    expect(input.style.height).toBe("160px")
    height = 200
    notify()
    expect(input.style.height).toBe("160px")
    width = 640
    height = 48
    notify()
    expect(input.style.height).toBe("48px")
    cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
  } finally {
    observer.mockRestore()
  }
})


it("catalog failure is visible with explicit retry and no internal details", () => {
  const onRetryModels = vi.fn()
  renderComposer({ models: [], modelCatalogStatus: "error", onRetryModels })
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load the model catalog")
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }))
  expect(onRetryModels).toHaveBeenCalledOnce()
})

it("confirmed empty catalog clears an invalid selection but loading does not", () => {
  const loading = renderComposer({ models: [], selectedModel: "retired", modelCatalogStatus: "loading" })
  expect(loading.onModelChange).not.toHaveBeenCalled()
  cleanup()
  const empty = renderComposer({ models: [], selectedModel: "retired", modelCatalogStatus: "ready" })
  expect(empty.onModelChange).toHaveBeenCalledWith(null)
})

it("selector retries a failed read and retires the previous engine's late catalog", async () => {
  const engineA = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const engineB = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  let finish!: (response: Response) => void
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("private upstream detail"))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    .mockResolvedValueOnce(Response.json({ models: [MODELS[1]], next_cursor: null }))
  vi.stubGlobal("fetch", fetchMock)
  const hook = renderHook(({ engine }) => useComposerSelectors(engine), { initialProps: { engine: engineA } })
  try {
    await act(async () => { await settle() })
    expect(hook.result.current.modelCatalogStatus).toBe("error")
    act(() => hook.result.current.retryModels())
    await act(async () => { await settle() })
    hook.rerender({ engine: engineB })
    await act(async () => { await settle() })
    expect(hook.result.current.models).toEqual([MODELS[1]])
    await act(async () => { finish(Response.json({ models: [MODELS[0]], next_cursor: null })); await settle() })
    expect(hook.result.current.models).toEqual([MODELS[1]])
    expect(fetchMock.mock.calls[1]?.[1]?.signal.aborted).toBe(true)
  } finally { hook.unmount(); engineA.dispose(); engineB.dispose(); vi.unstubAllGlobals() }
})

it("an engine change retires its explicit model choice before the new catalog arrives", async () => {
  const engineA = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const engineB = createSessionEngine({ client: createFakeClient(), storage: createMemoryStorage<ConversationStore>(null) })
  const setModelB = vi.spyOn(engineB, "setModel")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ models: MODELS, next_cursor: null }))
    .mockImplementation(() => new Promise<Response>(() => {})))
  const hook = renderHook(({ engine }) => useComposerSelectors(engine), { initialProps: { engine: engineA } })
  try {
    await act(async () => { await settle() })
    act(() => hook.result.current.setSelectedModel("gpt-5"))
    hook.rerender({ engine: engineB })
    expect(hook.result.current.models).toEqual([])
    expect(hook.result.current.selectedModel).toBeNull()
    expect(setModelB).not.toHaveBeenCalledWith("gpt-5")
    hook.rerender({ engine: engineA })
    expect(hook.result.current.models).toEqual([])
    expect(hook.result.current.selectedModel).toBeNull()
  } finally { hook.unmount(); engineA.dispose(); engineB.dispose(); vi.unstubAllGlobals() }
})

it("a failed refresh retains the confirmed candidates and explicit business label", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ models: MODELS, next_cursor: null }))
    .mockRejectedValueOnce(new Error("internal upstream failure")))
  const hook = renderHook(() => useComposerSelectors(null))
  try {
    await act(async () => { await settle() })
    act(() => { hook.result.current.setSelectedModel("gpt-5"); hook.result.current.retryModels() })
    expect(hook.result.current.modelCatalogStatus).toBe("loading")
    expect(hook.result.current.models).toEqual(MODELS)
    await act(async () => { await settle() })
    expect(hook.result.current.modelCatalogStatus).toBe("error")
    expect(hook.result.current.models).toEqual(MODELS)
    expect(hook.result.current.selectedModel).toBe("gpt-5")
  } finally { hook.unmount(); vi.unstubAllGlobals() }
})

it.each([{ models: [] }, { models: MODELS }])("catalog reads remain visually quiet and retain any confirmed model controls (%j)", ({ models }) => {
  const props = renderComposer({ models, selectedModel: "gpt-5", modelCatalogStatus: "loading" })
  expect(screen.queryByText("Loading model catalog…")).not.toBeInTheDocument()
  const cluster = document.querySelector('[data-slot="composer-selector-cluster"]')
  expect(cluster?.querySelector('[role="status"]')).toBeNull()
  expect(cluster).toHaveAttribute("aria-busy", "true")
  expect(props.onModelChange).not.toHaveBeenCalled()
  if (models.length > 0) {
    const trigger = screen.getByRole("button", { name: "Switch model: gpt-5" })
    expect(trigger).toBeEnabled()
    fireEvent.pointerDown(trigger)
    expect(screen.getByRole("menuitemradio", { name: "gpt-5" })).toHaveAttribute("data-state", "checked")
  }
})

it("requests the resource menu for one typed slash at the caret without replacing the surrounding text", () => {
  const onResourceMenuRequest = vi.fn()
  const props = renderComposer({ draft: "before after", onResourceMenuRequest })
  const input = screen.getByRole("textbox", { name: "Chat input" })
  fireEvent.change(input, { target: { value: "before /after", selectionStart: 8, selectionEnd: 8 } })
  expect(props.onDraftChange).toHaveBeenCalledWith("before /after")
  expect(onResourceMenuRequest).toHaveBeenCalledWith({ draft: "before /after", start: 7, end: 8 })
  expect(props.onSubmit).not.toHaveBeenCalled()
})

it("does not open slash commands from IME, pasted content, a URL, or replacement of selected text", () => {
  const onResourceMenuRequest = vi.fn()
  renderComposer({ onResourceMenuRequest })
  const input = screen.getByRole("textbox", { name: "Chat input" })
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: "/" } })
  fireEvent.compositionEnd(input)
  fireEvent.input(input, { inputType: "insertFromPaste", target: { value: "/" } })
  fireEvent.change(input, { target: { value: "https://example.test/a" } })
  expect(onResourceMenuRequest).not.toHaveBeenCalled()
  cleanup()
  renderComposer({ draft: "selected text", onResourceMenuRequest })
  fireEvent.change(screen.getByRole("textbox", { name: "Chat input" }), { target: { value: "/" } })
  expect(onResourceMenuRequest).not.toHaveBeenCalled()
})
