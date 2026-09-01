import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"

const capabilities = {
  instructions: true,
  connectors: true,
  resources: true,
  skills: true,
  projectConversations: true,
  websites: true,
  scheduledTasks: true,
}

beforeEach(() => window.localStorage.setItem("kokoro.locale", "zh"))
afterEach(cleanup)

it("项目右栏使用固定的 75×64 空态插图且不进入读屏名称", () => {
  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  for (const src of [
    "/site-assets/project-website.webp",
    "/site-assets/project-scheduled-tasks.svg",
  ]) {
    const image = [...container.querySelectorAll("img")]
      .find((candidate) => decodeURIComponent(candidate.getAttribute("src") ?? "").includes(src))
    expect(image).toHaveAttribute("width", "75")
    expect(image).toHaveAttribute("height", "64")
    expect(image).toHaveAttribute("alt", "")
    expect(image).toHaveAttribute("aria-hidden", "true")
  }
})

it("项目任务列表区分加载态和错误态，并提供重试入口", () => {
  const onRetryProjectConversations = vi.fn()
  const baseProps = {
    brandName: "Kokoro",
    composer: <div>composer</div>,
    onPrompt: vi.fn(),
    workspaceCapabilities: capabilities,
  }

  const { rerender } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        {...baseProps}
        projectConversationsLoading
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("status")).toHaveTextContent("正在加载任务…")
  expect(screen.queryByText("新建一个任务以开始")).not.toBeInTheDocument()

  rerender(
    <LocaleProvider>
      <KokoroProjectWorkspace
        {...baseProps}
        projectConversationsError
        onRetryProjectConversations={onRetryProjectConversations}
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("alert")).toHaveTextContent("任务暂时无法加载。")
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  expect(onRetryProjectConversations).toHaveBeenCalledTimes(1)
  expect(screen.queryByText("新建一个任务以开始")).not.toBeInTheDocument()
})

it("在项目页内打开指令 Dialog 并通过项目保存回调持久化", async () => {
  const onPrompt = vi.fn()
  const onSaveProjectInstructions = vi.fn().mockResolvedValue(undefined)
  const onUploadProjectResources = vi.fn().mockResolvedValue(undefined)

  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={onPrompt}
        projectInstructions="默认先给出摘要。"
        onSaveProjectInstructions={onSaveProjectInstructions}
        onUploadProjectResources={onUploadProjectResources}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const instructionsCard = container.querySelector<HTMLElement>('[data-context-kind="instructions"]')
  const resourcesCard = container.querySelector<HTMLElement>('[data-context-kind="resources-skills"]')
  const instructionsTrigger = within(instructionsCard!).getAllByRole("button", { name: /指令/ })[0]!
  fireEvent.click(instructionsTrigger)
  const editor = screen.getByRole("textbox", { name: "专案指令" })
  expect(editor).toHaveValue("默认先给出摘要。")
  fireEvent.change(editor, { target: { value: "所有回复先给出结论。" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  await waitFor(() => expect(onSaveProjectInstructions).toHaveBeenCalledWith("所有回复先给出结论。"))
  expect(onPrompt).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await waitFor(() => expect(instructionsTrigger).toHaveFocus())

  const resourcesTrigger = within(resourcesCard!).getAllByRole("button", { name: /文件和资源/ })[0]!
  fireEvent.click(resourcesTrigger)
  expect(screen.getByRole("dialog")).toHaveTextContent("研究简报.md")
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }))
  await waitFor(() => expect(resourcesTrigger).toHaveFocus())
  fireEvent.click(resourcesTrigger)
  fireEvent.pointerDown(screen.getByRole("button", { name: "打开新增菜单" }))
  expect(await screen.findByRole("menuitem", { name: /添加本地文件/ })).toBeInTheDocument()

  const upload = document.getElementById("project-resource-upload") as HTMLInputElement
  const file = new File(["hello"], "brief.txt", { type: "text/plain" })
  fireEvent.change(upload, { target: { files: [file] } })
  await waitFor(() => expect(onUploadProjectResources).toHaveBeenCalled())
})

it("专案指令历史使用双栏版本 Dialog 并可切换正文", () => {
  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        projectInstructions="当前规则"
        projectInstructionHistory={[
          { id: "current", instruction: "当前规则", updatedAt: new Date("2026-08-29T10:31:00Z").getTime(), actorName: "Kokoro", current: true },
          { id: "previous", instruction: "上一版规则", updatedAt: new Date("2026-08-28T09:15:00Z").getTime(), actorName: "Kokoro" },
        ]}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const instructionsCard = container.querySelector<HTMLElement>('[data-context-kind="instructions"]')
  fireEvent.click(within(instructionsCard!).getAllByRole("button", { name: /指令/ })[0])
  fireEvent.click(screen.getByRole("button", { name: "历史记录" }))

  const historyDialog = screen.getByRole("dialog", { name: "专案指令历史" })
  expect(historyDialog).toHaveTextContent("当前版本")
  expect(historyDialog).toHaveTextContent("当前规则")
  const revisions = within(within(historyDialog).getByRole("list")).getAllByRole("button")
  expect(revisions).toHaveLength(2)
  fireEvent.click(revisions[1])
  expect(historyDialog).toHaveTextContent("上一版规则")
})

it("在项目页内打开独立技能 Dialog，并持久化技能启用状态", async () => {
  const onOpenSettings = vi.fn()
  const onSetProjectSkillEnabled = vi.fn().mockResolvedValue(undefined)

  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        onOpenSettings={onOpenSettings}
        onSetProjectSkillEnabled={onSetProjectSkillEnabled}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = container.querySelector<HTMLElement>('[data-context-kind="resources-skills"]')
  fireEvent.click(within(resourcesCard!).getAllByRole("button", { name: /^技能$/ })[0])

  const dialog = screen.getByRole("dialog")
  expect(dialog).toHaveTextContent("专案技能")
  expect(onOpenSettings).not.toHaveBeenCalled()

  const skillSwitch = screen.getByRole("switch", { name: "技能构建器" })
  expect(skillSwitch).toBeChecked()
  fireEvent.click(skillSwitch)

  await waitFor(() => expect(onSetProjectSkillEnabled).toHaveBeenCalledWith("skill-builder", false))
  expect(skillSwitch).not.toBeChecked()
})

it("资源卡的上传与搜索网络动作分别进入对应状态", async () => {
  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = container.querySelector<HTMLElement>('[data-context-kind="resources-skills"]')!
  fireEvent.click(within(resourcesCard).getByRole("button", { name: "搜索网络" }))

  const dialog = screen.getByRole("dialog", { name: "文件和资源" })
  await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "搜索文件和资源" })).toHaveFocus())
  expect(dialog).toHaveTextContent("Kokoro 产品网站")
  expect(dialog).not.toHaveTextContent("研究简报.md")

  fireEvent.click(within(dialog).getByRole("button", { name: "关闭对话框" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  fireEvent.click(within(resourcesCard).getByRole("button", { name: "上传" }))
  expect(screen.getByRole("dialog", { name: "文件和资源" })).toBeInTheDocument()
})

it("资源筛选与技能搜索会实际过滤本地预览数据", () => {
  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = container.querySelector<HTMLElement>('[data-context-kind="resources-skills"]')!
  fireEvent.click(within(resourcesCard).getByRole("button", { name: /文件和资源/ }))
  const resourcesDialog = screen.getByRole("dialog", { name: "文件和资源" })
  fireEvent.pointerDown(within(resourcesDialog).getByRole("button", { name: "筛选" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "网页" }))
  expect(resourcesDialog).toHaveTextContent("Kokoro 产品网站")
  expect(resourcesDialog).not.toHaveTextContent("研究简报.md")
  fireEvent.click(within(resourcesDialog).getByRole("button", { name: "关闭对话框" }))

  fireEvent.click(within(resourcesCard).getByRole("button", { name: /^技能$/ }))
  const skillsDialog = screen.getByRole("dialog", { name: "专案技能" })
  fireEvent.change(within(skillsDialog).getByRole("textbox", { name: "搜索技能" }), { target: { value: "不存在" } })
  expect(skillsDialog).toHaveTextContent("暂无已添加的技能")
  expect(skillsDialog).not.toHaveTextContent("技能构建器")
})

it("技能启用状态保存失败时回滚视觉状态", async () => {
  const onSetProjectSkillEnabled = vi.fn().mockRejectedValue(new Error("network"))

  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        onSetProjectSkillEnabled={onSetProjectSkillEnabled}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = container.querySelector<HTMLElement>('[data-context-kind="resources-skills"]')
  fireEvent.click(within(resourcesCard!).getAllByRole("button", { name: /^技能$/ })[0])
  const skillSwitch = screen.getByRole("switch", { name: "技能构建器" })
  fireEvent.click(skillSwitch)

  await waitFor(() => expect(onSetProjectSkillEnabled).toHaveBeenCalledWith("skill-builder", false))
  await waitFor(() => expect(skillSwitch).toBeChecked())
})

it("网站入口打开项目级选择弹窗而不是向 Composer 注入提示词", () => {
  const onPrompt = vi.fn()
  render(
    <LocaleProvider>
      <KokoroProjectWorkspace brandName="Kokoro" composer={<div>composer</div>} onPrompt={onPrompt} workspaceCapabilities={capabilities} />
    </LocaleProvider>,
  )

  const addButtons = screen.getAllByRole("button", { name: "新增" })
  fireEvent.click(addButtons[addButtons.length - 2])

  expect(screen.getByRole("dialog", { name: "新增网站至当前专案" })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "搜索网站" })).toBeInTheDocument()
  expect(onPrompt).not.toHaveBeenCalled()
})

it("网站选择器可以搜索、选择并保存合成网站", async () => {
  render(
    <LocaleProvider>
      <KokoroProjectWorkspace brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()} workspaceCapabilities={capabilities} />
    </LocaleProvider>,
  )

  const addButtons = screen.getAllByRole("button", { name: "新增" })
  fireEvent.click(addButtons[addButtons.length - 2])
  const dialog = screen.getByRole("dialog", { name: "新增网站至当前专案" })
  const search = within(dialog).getByRole("textbox", { name: "搜索网站" })
  fireEvent.change(search, { target: { value: "Kokoro" } })
  const website = within(dialog).getByRole("button", { name: /Kokoro 产品网站/ })
  fireEvent.click(website)
  expect(website).toHaveAttribute("aria-pressed", "true")
  const save = within(dialog).getByRole("button", { name: "保存" })
  expect(save).toBeEnabled()
  fireEvent.click(save)
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
})

it("定时任务入口打开选择弹窗和编辑器，并提交项目级任务", async () => {
  const onCreateProjectScheduledTask = vi.fn().mockResolvedValue(undefined)
  render(
    <LocaleProvider>
      <KokoroProjectWorkspace
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        onCreateProjectScheduledTask={onCreateProjectScheduledTask}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const addButtons = screen.getAllByRole("button", { name: "新增" })
  fireEvent.click(addButtons[addButtons.length - 1])
  fireEvent.click(screen.getByRole("button", { name: "建立新项目" }))

  const dialogs = screen.getAllByRole("dialog")
  const editor = dialogs[dialogs.length - 1]
  fireEvent.change(within(editor).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "每日简报" } })
  fireEvent.change(within(editor).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "汇总今天的重要消息" } })
  fireEvent.click(within(editor).getByRole("button", { name: "保存" }))

  await waitFor(() => expect(onCreateProjectScheduledTask).toHaveBeenCalledWith({
    title: "每日简报",
    prompt: "汇总今天的重要消息",
    frequency: "daily",
    time: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    expiresAt: undefined,
    autoApprove: false,
  }))
  await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1))
  expect(screen.getByRole("dialog")).toHaveTextContent("每日简报")
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
})
