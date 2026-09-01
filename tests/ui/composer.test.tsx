// Composer 模型选择器（MODEL-UX）：候选下拉渲染 + 选择回调（wire "provider:name"）+ 首条锁定态 + 空候选隐藏。
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createRef, type FormEvent, useState } from "react"

import type { AgentCandidate, ModelCandidate } from "@/contract/http"
import { LocaleProvider } from "@/i18n/context"
import { Composer } from "@/ui/composer/composer"
import { CreationIntentPill, type CreationIntent } from "@/ui/composer/creation-intent-pill"

const MODELS: ModelCandidate[] = [
  { provider: "anthropic", name: "claude-sonnet-4-6", is_default: true },
  { provider: "openai", name: "gpt-5", is_default: false },
]

const AGENTS: AgentCandidate[] = [
  { name: "general", description: "通用协调 agent", is_default: true },
  { name: "poet", description: "诗人预设", is_default: false },
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
    pinnedSkills: [],
    onUnpinSkill: vi.fn(),
    models: MODELS,
    selectedModel: null,
    onModelChange: vi.fn(),
    modelLocked: false,
    agents: [] as AgentCandidate[],
    selectedAgent: null,
    onAgentChange: vi.fn(),
    agentLocked: false,
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

describe("Composer model selector", () => {
  it("selectedModel=null 时高亮缺省候选（is_default）", () => {
    renderComposer()
    expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy()
  })

  it("展开下拉选非缺省项 → onModelChange 收到 provider:name 选择子", () => {
    const props = renderComposer()
    fireEvent.pointerDown(screen.getByRole("button", { name: /Switch model:/ }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "gpt-5" }))
    expect(props.onModelChange).toHaveBeenCalledWith("openai:gpt-5")
  })

  it("selectedModel 命中候选时显示该项为当前", () => {
    renderComposer({ selectedModel: "openai:gpt-5" })
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
    renderComposer({ selectedModel: "openai:gpt-5", modelLocked: true })
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

  it("站点可以为专案上下文投影专属输入提示", () => {
    renderComposer({ placeholder: "在此专案启动任务" })
    expect(screen.getByRole("textbox", { name: "Chat input" })).toHaveAttribute("placeholder", "在此专案启动任务")
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
        { provider: "kokoro", name: "standard-new", is_default: true, display_name: "Standard New" },
        { provider: "openai", name: "gpt-image-2", is_default: false, display_name: "GPT Image 2" },
      ],
      preferredModelSelector: "openai:gpt-image-2",
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
        { provider: "kokoro", name: "standard-new", is_default: true, display_name: "Standard New" },
        { provider: "openai", name: "gpt-image-2", is_default: false, display_name: "GPT Image 2" },
      ],
      preferredModelSelector: "openai:gpt-image-2",
      selectedModel: null,
      hideModelSelector: false,
    })

    expect(props.onModelChange).toHaveBeenCalledWith("openai:gpt-image-2")
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

  it("活动专案线程同时保留任务状态入口与底部桌面环境锚点", () => {
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
      expect(capsule).toHaveAttribute("data-state", "selected")
      expect(closeButton).toHaveAttribute("type", "button")
      expect(closeButton).toHaveAttribute("data-hit-area", "24")
      expect(closeButton).toHaveAttribute("aria-label", `关闭${labels[intents[index]!]}`)
      expect(closeButton).toHaveAttribute("title", `关闭${labels[intents[index]!]}`)
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

describe("Composer agent selector（AGENT-PRESET）", () => {
  it("selectedAgent=null 时高亮缺省候选（is_default=general）", () => {
    renderComposer({ agents: AGENTS })
    expect(screen.getByRole("button", { name: /Switch agent:/ }).textContent).toContain("general")
  })

  it("展开下拉选具名预设 → onAgentChange 收到 agent 名", () => {
    const props = renderComposer({ agents: AGENTS })
    fireEvent.pointerDown(screen.getByRole("button", { name: /Switch agent:/ }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /poet/ }))
    expect(props.onAgentChange).toHaveBeenCalledWith("poet")
  })

  it("agent 下拉展示后端描述，帮助用户在长列表中区分预设", () => {
    renderComposer({ agents: AGENTS })
    fireEvent.pointerDown(screen.getByRole("button", { name: /Switch agent:/ }))
    expect(screen.getByText("通用协调 agent")).toBeTruthy()
    expect(screen.getByText("诗人预设")).toBeTruthy()
  })

  it("selectedAgent 命中候选时显示该项为当前", () => {
    renderComposer({ agents: AGENTS, selectedAgent: "poet" })
    expect(screen.getByRole("button", { name: /Switch agent:/ }).textContent).toContain("poet")
  })

  it("selectedAgent 不再存在于目录时回落缺省预设", () => {
    renderComposer({ agents: AGENTS, selectedAgent: "retired-agent" })
    expect(screen.getByRole("button", { name: /Switch agent:/ }).textContent).toContain("general")
  })

  it("agentLocked → 只读锁定态（不可展开切换）", () => {
    renderComposer({ agents: AGENTS, selectedAgent: "poet", agentLocked: true })
    expect(screen.queryByRole("button", { name: /Switch agent:/ })).toBeNull()
    const locked = screen.getByRole("button", { name: /locked this turn/i })
    expect(locked.hasAttribute("disabled")).toBe(true)
    expect(locked.textContent).toContain("poet")
  })

  it("单候选（仅 general）→ 不渲染 agent 选择器（无可选项，隐去）", () => {
    renderComposer({ agents: [AGENTS[0]!] })
    expect(screen.queryByRole("button", { name: /Switch agent:/ })).toBeNull()
  })

  it("空候选 → 不渲染 agent 选择器", () => {
    renderComposer({ agents: [] })
    expect(screen.queryByRole("button", { name: /Switch agent:/ })).toBeNull()
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

  it("流式中有草稿切换为可发送的插话动作", () => {
    const props = renderComposer({ draft: "补充一个例子", canSend: true, isStreaming: true })
    const send = screen.getByRole("button", { name: "Send interjection" })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it("发送动作独立于可换行的选择器 cluster", () => {
    renderComposer({ agents: AGENTS })
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

  it("固定技能 chip 的移除按钮只移除对应技能", () => {
    const props = renderComposer({ pinnedSkills: ["research", "writer"] })
    fireEvent.click(screen.getByRole("button", { name: "Unpin research" }))
    expect(props.onUnpinSkill).toHaveBeenCalledTimes(1)
    expect(props.onUnpinSkill).toHaveBeenCalledWith("research")
  })

  it("长技能名保留完整 hover 文案并允许 chip 截断", () => {
    const longName = "a-very-long-skill-name-that-must-not-push-the-composer-controls-out-of-view"
    renderComposer({ pinnedSkills: [longName] })

    const name = screen.getByText(longName)
    expect(name).toHaveAttribute("title", longName)
    expect(name.className).toContain("pinnedName")
    expect(name.parentElement?.className).toContain("pinnedChip")
  })
})
