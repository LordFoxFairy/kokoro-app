import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroDirectChatWelcome } from "@/features/app/kokoro-welcome"

afterEach(cleanup)

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
})

it("直接会话空态使用 Manus 式聊天欢迎面，而不是项目上下文卡片", () => {
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview />
    </LocaleProvider>,
  )

  expect(document.querySelector('[data-slot="direct-chat-welcome"]')).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "我能为你做什么？" })).toBeInTheDocument()
  expect(screen.getByRole("group", { name: "选一个场景开始，或直接把想法说给我" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "更多" })).toBeInTheDocument()
  expect(screen.queryByText("指令")).toBeNull()
  expect(screen.queryByText("文件和资源")).toBeNull()
  expect(screen.queryByText("技能")).toBeNull()
})

it("计划状态使用文字、分隔线和升级动作三段结构", () => {
  const onOpenSettings = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview onOpenSettings={onOpenSettings} />
    </LocaleProvider>,
  )

  const freePlan = screen.getByText("免费计划")
  const plan = freePlan.parentElement
  expect(plan?.children).toHaveLength(3)
  expect(plan?.querySelector('[data-slot="separator"][data-orientation="vertical"]')).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "升级" }))
  expect(onOpenSettings).toHaveBeenCalledWith("subscription")
})

it("首页不再用硬编码轮播宣称已接通能力", () => {
  render(<LocaleProvider><KokoroDirectChatWelcome preview /></LocaleProvider>)
  expect(document.querySelector('[data-slot="welcome-promotion"]')).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "2 / 5" })).not.toBeInTheDocument()
})

it("建立网站入口把网站意图交给壳层以显示选中胶囊", () => {
  const onPrompt = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview onPrompt={onPrompt} />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: /建立网站/ }))
  expect(onPrompt).toHaveBeenCalledWith("描述你想要建立的网站", "website")
})

it("能力提示填写精确草稿和意图，不切换无正文创作模式", () => {
  const onPrompt = vi.fn()
  const onCreationIntentSelect = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview onPrompt={onPrompt} onCreationIntentSelect={onCreationIntentSelect} />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "设计 找趋势、出结论、给建议" }))

  expect(onPrompt).toHaveBeenCalledExactlyOnceWith("帮我分析这份数据，找出关键趋势和可执行的结论。", "design")
  expect(onCreationIntentSelect).not.toHaveBeenCalled()
})

it("显式网站意图切换为专案归档与创建类型布局", () => {
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="帮我建立一个产品网站" creationIntent="website" />
    </LocaleProvider>,
  )

  expect(screen.getByText("让你的网站井然有序").tagName).toBe("P")
  expect(screen.getByText("将所有任务、版本和更新集中保存在一个地方。").tagName).toBe("P")
  expect(screen.getByRole("button", { name: "新增到专案" })).toBeInTheDocument()
  expect(screen.getByText("您想建立什么？").tagName).toBe("P")
  expect(screen.getByRole("button", { name: /电子商务/ })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "从 Figma 汇入" }).querySelector('[data-slot="figma-mark"]')).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /电子商务/ }).querySelector('[data-slot="shopify-mark"]')).toHaveTextContent("S")
  expect(screen.queryByRole("group", { name: "选一个场景开始，或直接把想法说给我" })).toBeNull()
  expect(screen.queryByRole("region", { name: "创作你自己的游戏" })).toBeNull()
})

it("网站创建区默认直接进入内建整合，不插入灵感层级", () => {
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="建立网站" creationIntent="website" />
    </LocaleProvider>,
  )

  expect(screen.queryByText("探索点子")).toBeNull()
  expect(screen.getByText("强大的内建整合")).toBeInTheDocument()
})

it("网站分类点击只展开 Manus 式灵感层级，选中前不改写草稿", () => {
  const onPrompt = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="" creationIntent="website" onPrompt={onPrompt} />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: "着陆页" }))
  expect(screen.getByText("探索点子")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "构建候补名单着陆页" })).toBeInTheDocument()
  expect(onPrompt).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: "产品发布页" }))
  expect(onPrompt).toHaveBeenCalledWith(expect.stringContaining("建立一个发布页"), "website")
})

it("网站创建空态仍保留专案归档轨道并禁用空提交", () => {
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview creationIntent="website" />
    </LocaleProvider>,
  )

  expect(screen.getByText("让你的网站井然有序")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "新增到专案" })).toBeInTheDocument()
  expect(screen.getByText("强大的内建整合")).toBeInTheDocument()
})

it("切换网站模式后把欢迎页滚动位置恢复到 Manus 的顶部轴", () => {
  const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0)
    return 1
  })
  const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)
  const { rerender } = render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview />
    </LocaleProvider>,
  )

  const surface = document.querySelector<HTMLElement>('[data-slot="direct-chat-welcome"]')
  expect(surface).not.toBeNull()
  if (surface) surface.scrollTop = 59.5

  rerender(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="建立网站" creationIntent="website" />
    </LocaleProvider>,
  )

  expect(surface?.scrollTop).toBe(0)
  requestFrame.mockRestore()
  cancelFrame.mockRestore()
})

it("应用意图保留能力入口并显示五条应用示例，不渲染旧推广轮播", () => {
  const onPrompt = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview creationIntent="app" onPrompt={onPrompt} />
    </LocaleProvider>,
  )

  expect(screen.queryByRole("group", { name: "选一个场景开始，或直接把想法说给我" })).toBeNull()
  const examples = screen.getByLabelText("应用示例")
  expect(within(examples).getAllByRole("button")).toHaveLength(5)
  fireEvent.click(within(examples).getByRole("button", { name: /创建学习计划与进度管理工具/ }))
  expect(onPrompt).toHaveBeenCalledWith("创建学习计划与进度管理工具", "app")
  expect(screen.queryByRole("region", { name: "创作你自己的游戏" })).toBeNull()
})

it("普通非空草稿不显示网站上下文，也不混入空态快捷入口", () => {
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="帮我整理今天的工作" />
    </LocaleProvider>,
  )

  expect(screen.queryByRole("group", { name: "选一个场景开始，或直接把想法说给我" })).toBeNull()
  expect(screen.queryByText("让你的网站井然有序")).toBeNull()
  expect(screen.queryByRole("heading", { name: "您想建立什么？" })).toBeNull()
})

it("关闭网站胶囊后保留草稿，但移除网站上下文和空态快捷入口", () => {
  const { rerender } = render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="描述你想要建立的网站" creationIntent="website" />
    </LocaleProvider>,
  )

  expect(screen.getByText("让你的网站井然有序")).toBeInTheDocument()
  rerender(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="描述你想要建立的网站" />
    </LocaleProvider>,
  )

  expect(document.querySelector('[data-slot="direct-chat-welcome"]')).toHaveAttribute("data-has-draft", "true")
  expect(screen.queryByText("让你的网站井然有序")).toBeNull()
  expect(screen.queryByRole("group", { name: "选一个场景开始，或直接把想法说给我" })).toBeNull()
})

it("预览缺创建回调时入口禁用，不产生伪专案选择", () => {
  render(<LocaleProvider><KokoroDirectChatWelcome preview draft="建立网站" creationIntent="website" /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "新增到专案" })).toBeDisabled()
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
})

it("专案菜单不以品牌猜测已有专案身份", () => {
  render(<LocaleProvider><KokoroDirectChatWelcome preview draft="建立网站" creationIntent="website" onOpenProject={vi.fn()} /></LocaleProvider>)
  fireEvent.pointerDown(screen.getByRole("button", { name: "新增到专案" }))
  expect(screen.queryByRole("menuitem", { name: "Kokoro" })).not.toBeInTheDocument()
  expect(screen.getByRole("menuitem", { name: "新建专案" })).toBeInTheDocument()
})

it("新建专案动作会生成唯一的本地预览专案引用并承接聊天", () => {
  const onOpenProject = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview
        brandName="Kokoro"
        draft="建立网站"
        creationIntent="website"
        onOpenProject={onOpenProject}
      />
    </LocaleProvider>,
  )

  fireEvent.pointerDown(screen.getByRole("button", { name: "新增到专案" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "新建专案" }))
  expect(onOpenProject).toHaveBeenCalledWith(expect.stringMatching(/^preview-project-[a-z0-9-]+$/), "建立网站")
})

it("正式欢迎页的新建专案只上报创建意图，不预造 preview 项目", () => {
  const onCreateProject = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview={false} draft="正式草稿" creationIntent="website" onCreateProject={onCreateProject} />
    </LocaleProvider>,
  )
  fireEvent.pointerDown(screen.getByRole("button", { name: "新增到专案" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "新建专案" }))
  expect(onCreateProject).toHaveBeenCalledWith("正式草稿")
})

it("创建类型更多按钮横向浏览隐藏选项", () => {
  const scrollTo = vi.fn()
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo })
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview draft="建立网站" creationIntent="website" />
    </LocaleProvider>,
  )

  const typeRow = screen.getByRole("group", { name: "您想建立什么？" })
  Object.defineProperty(typeRow, "scrollWidth", { configurable: true, value: 1_192 })
  fireEvent.click(screen.getByRole("button", { name: "更多" }))
  expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", left: 1_192 })

  Object.defineProperty(typeRow, "scrollLeft", { configurable: true, value: 456 })
  fireEvent.scroll(typeRow)
  fireEvent.click(screen.getByRole("button", { name: "上一组" }))
  expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "smooth", left: 0 })
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

it("正式首页不宣传未接通集成且品牌文案完成插值", () => {
  const { container } = render(<LocaleProvider><KokoroDirectChatWelcome preview={false} brandName="Mori" /></LocaleProvider>)
  expect(container.textContent).not.toContain("{brand}")
  expect(container.textContent).toContain("Mori")
  expect(screen.queryByRole("button", { name: "4 / 5" })).not.toBeInTheDocument()
  expect(screen.queryByText(/Slack|Zapier/)).not.toBeInTheDocument()
})

it("正式欢迎页没有创建回调时不生成或打开猜测项目", () => {
  const onOpenProject = vi.fn()
  render(<LocaleProvider><KokoroDirectChatWelcome preview={false} draft="草稿" creationIntent="website" onOpenProject={onOpenProject} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: "新增到专案" })).not.toBeInTheDocument()
  expect(onOpenProject).not.toHaveBeenCalled()
})


it("正式网站提示流程不展示虚构 Figma/Shopify 与内建集成", () => {
  render(<LocaleProvider><KokoroDirectChatWelcome preview={false} creationIntent="website" onCreateProject={vi.fn()} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: "从 Figma 汇入" })).not.toBeInTheDocument()
  expect(document.querySelector('[data-slot="shopify-mark"]')).not.toBeInTheDocument()
  expect(screen.queryByText("强大的内建整合")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "新增到专案" })).toBeEnabled()
})

it.each([
  { label: "制作简报", prompt: "帮我写一篇关于「主题」的文章，风格专业、结构清晰。", intent: "presentation" as const },
  { label: "建立网站", prompt: "描述你想要建立的网站", intent: "website" as const },
  { label: "设计", prompt: "帮我分析这份数据，找出关键趋势和可执行的结论。", intent: "design" as const },
  { label: "制作游戏", prompt: "帮我写一个「功能」的脚本，并说明如何运行和调整。", intent: "game" as const },
])("正式 Home 的 $label 提示只填写精确草稿，不切换或启动其他产品动作", ({ label, prompt, intent }) => {
  const onPrompt = vi.fn()
  const onCreationIntentSelect = vi.fn()
  const onCreateProject = vi.fn()
  const onOpenProject = vi.fn()
  const onOpenSettings = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome
        preview={false}
        onPrompt={onPrompt}
        onCreationIntentSelect={onCreationIntentSelect}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        onOpenSettings={onOpenSettings}
      />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("button", { name: new RegExp(label, "u") }))

  expect({
    promptCalls: onPrompt.mock.calls,
    creationIntentCalls: onCreationIntentSelect.mock.calls,
    createProjectCalls: onCreateProject.mock.calls,
    openProjectCalls: onOpenProject.mock.calls,
    settingsCalls: onOpenSettings.mock.calls,
  }).toEqual({
    promptCalls: [[prompt, intent]],
    creationIntentCalls: [],
    createProjectCalls: [],
    openProjectCalls: [],
    settingsCalls: [],
  })
})

it("无 Billing owner 投影的正式 Home 不声明免费计划或升级套餐", () => {
  const onOpenSettings = vi.fn()
  render(
    <LocaleProvider>
      <KokoroDirectChatWelcome preview={false} onOpenSettings={onOpenSettings} />
    </LocaleProvider>,
  )

  expect({
    freePlanVisible: screen.queryByText("免费计划") !== null,
    upgradeVisible: screen.queryByRole("button", { name: "升级" }) !== null,
    settingsCalls: onOpenSettings.mock.calls,
  }).toEqual({
    freePlanVisible: false,
    upgradeVisible: false,
    settingsCalls: [],
  })
})
