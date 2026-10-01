import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { ProjectResourceUploadError } from "@/features/app/project-resource-upload"

const capabilities = {
  instructions: true,
  connectors: true,
  resources: true,
  skills: true,
  projectConversations: true,
  websites: true,
  scheduledTasks: true,
}

function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description}`)
  }
  return value
}

function at<T>(values: readonly T[], index: number, description: string): T {
  return requireValue(values.at(index), description)
}

function contextCard(container: HTMLElement, kind: string): HTMLElement {
  return requireValue(
    container.querySelector<HTMLElement>(`[data-context-kind="${kind}"]`),
    `${kind} context card`,
  )
}

beforeEach(() => window.localStorage.setItem("kokoro.locale", "zh"))
afterEach(cleanup)

it("项目右栏使用固定的 75×64 空态插图且不进入读屏名称", () => {
  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
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
      <KokoroProjectWorkspace preview
        {...baseProps}
        projectConversationsLoading
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("status")).toHaveTextContent("正在加载会话…")
  expect(screen.queryByText("新建一个任务以开始")).not.toBeInTheDocument()

  rerender(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        {...baseProps}
        projectConversationsError
        onRetryProjectConversations={onRetryProjectConversations}
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("alert")).toHaveTextContent("会话暂时无法加载。")
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  expect(onRetryProjectConversations).toHaveBeenCalledTimes(1)
  expect(screen.queryByText("新建一个任务以开始")).not.toBeInTheDocument()
})

it("项目会话路由优先显示清单错误而不是误报空会话", () => {
  const onRetryProjectConversations = vi.fn()
  const { rerender } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
        projectConversation
        projectConversationsError
        onRetryProjectConversations={onRetryProjectConversations}
      />
    </LocaleProvider>,
  )

  expect(screen.getByTestId("project-conversations-error")).toHaveTextContent("会话暂时无法加载。")
  expect(document.querySelector('[data-slot="project-conversation-welcome"]')).toBeNull()
  expect(screen.queryByText("还没有专案会话。新建一个会话以开始。")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  expect(onRetryProjectConversations).toHaveBeenCalledTimes(1)

  rerender(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
        projectConversation
        projectConversationsLoading
      />
    </LocaleProvider>,
  )
  expect(screen.getByTestId("project-conversations-loading")).toHaveTextContent("正在加载会话…")
  expect(document.querySelector('[data-slot="project-conversation-welcome"]')).toBeNull()
  expect(screen.queryByText("还没有专案会话。新建一个会话以开始。")).toBeNull()
})

it("在项目页内打开指令 Dialog 并通过项目保存回调持久化", async () => {
  const onPrompt = vi.fn()
  const onSaveProjectInstructions = vi.fn().mockResolvedValue(undefined)
  const onUploadProjectResource = vi.fn(async (file: File) => ({ assetId: "asset-single", filename: file.name, mimeType: file.type, sizeBytes: String(file.size) }))

  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={onPrompt}
        projectInstructions="默认先给出摘要。"
        onSaveProjectInstructions={onSaveProjectInstructions}
        onUploadProjectResource={onUploadProjectResource}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const instructionsCard = contextCard(container, "instructions")
  const resourcesCard = contextCard(container, "resources-skills")
  const instructionsTrigger = at(
    within(instructionsCard).getAllByRole("button", { name: /指令/ }),
    0,
    "instructions trigger",
  )
  fireEvent.click(instructionsTrigger)
  const editor = screen.getByRole("textbox", { name: "专案指令" })
  expect(editor).toHaveValue("默认先给出摘要。")
  fireEvent.change(editor, { target: { value: "所有回复先给出结论。" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  await waitFor(() => expect(onSaveProjectInstructions).toHaveBeenCalledWith("所有回复先给出结论。"))
  expect(onPrompt).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  await waitFor(() => expect(instructionsTrigger).toHaveFocus())

  const resourcesTrigger = at(
    within(resourcesCard).getAllByRole("button", { name: /文件和资源/ }),
    0,
    "resources trigger",
  )
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
  await waitFor(() => expect(onUploadProjectResource).toHaveBeenCalled())
})

it("项目多选逐文件提交，部分失败可用原文件和原幂等键重试且不回滚成功项", async () => {
  let secondAttempts = 0
  const onUploadProjectResource = vi.fn(async (file: File, key: string) => {
    expect(key).toMatch(/^project-resource:/)
    if (file.name === "two.txt" && ++secondAttempts === 1) throw new Error("HTTP 503")
    return { assetId: `asset-${file.name}`, filename: file.name, mimeType: "text/plain", sizeBytes: String(file.size) }
  })
  const { container } = render(<LocaleProvider><KokoroProjectWorkspace preview
    brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()}
    onUploadProjectResource={onUploadProjectResource} workspaceCapabilities={capabilities}
  /></LocaleProvider>)
  const resourcesCard = contextCard(container, "resources-skills")
  fireEvent.click(at(within(resourcesCard).getAllByRole("button", { name: /文件和资源/ }), 0, "resources trigger"))
  const first = new File(["one"], "one.txt", { type: "text/plain" })
  const second = new File(["two"], "two.txt", { type: "text/plain" })
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [first, second] } })

  await waitFor(() => expect(onUploadProjectResource).toHaveBeenCalledTimes(2))
  const [firstFile, firstKey] = onUploadProjectResource.mock.calls[0] ?? []
  const [secondFile, secondKey] = onUploadProjectResource.mock.calls[1] ?? []
  expect(firstFile).toBe(first)
  expect(secondFile).toBe(second)
  expect(firstKey).toMatch(/^project-resource:/)
  expect(secondKey).toMatch(/^project-resource:/)
  expect(secondKey).not.toBe(firstKey)
  const dialog = screen.getByRole("dialog", { name: "文件和资源" })
  const confirmed = within(dialog).getByRole("list", { name: "文件和资源" })
  expect(within(confirmed).getByText("one.txt")).toBeInTheDocument()
  expect(within(confirmed).queryByText("two.txt")).toBeNull()
  expect(within(dialog).getByRole("alert")).toHaveTextContent("two.txt")

  fireEvent.click(within(dialog).getByRole("button", { name: "重试上传 two.txt" }))
  await waitFor(() => expect(onUploadProjectResource).toHaveBeenCalledTimes(3))
  expect(onUploadProjectResource.mock.calls[2]).toEqual([second, secondKey])
  await waitFor(() => expect(within(confirmed).getByText("two.txt")).toBeInTheDocument())
  expect(within(dialog).queryByRole("alert")).toBeNull()
})

it("终止性的文件审核失败不会伪造资源或显示无效重试", async () => {
  const onUploadProjectResource = vi.fn().mockRejectedValue(new ProjectResourceUploadError("resource_file_infected", false, 422))
  const { container } = render(<LocaleProvider><KokoroProjectWorkspace preview
    brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()}
    onUploadProjectResource={onUploadProjectResource} workspaceCapabilities={capabilities}
  /></LocaleProvider>)
  const resourcesCard = contextCard(container, "resources-skills")
  fireEvent.click(at(within(resourcesCard).getAllByRole("button", { name: /文件和资源/ }), 0, "resources trigger"))
  const dialog = screen.getByRole("dialog", { name: "文件和资源" })
  const infected = new File(["bad"], "infected.txt", { type: "text/plain" })
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [infected] } })
  await waitFor(() => expect(onUploadProjectResource).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("infected.txt 未通过安全检查"))
  expect(within(dialog).getByRole("list", { name: "文件和资源" })).not.toHaveTextContent("infected.txt")
  expect(within(dialog).queryByRole("button", { name: "重试上传 infected.txt" })).not.toBeInTheDocument()
})

it("不可恢复的幂等冲突不提供同键重试，提示重新选择文件", async () => {
  const onUploadProjectResource = vi.fn().mockRejectedValue(new ProjectResourceUploadError("idempotency_conflict", false, 409))
  const { container } = render(<LocaleProvider><KokoroProjectWorkspace preview
    brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()}
    onUploadProjectResource={onUploadProjectResource} workspaceCapabilities={capabilities}
  /></LocaleProvider>)
  const resourcesCard = contextCard(container, "resources-skills")
  fireEvent.click(at(within(resourcesCard).getAllByRole("button", { name: /文件和资源/ }), 0, "resources trigger"))
  const dialog = screen.getByRole("dialog", { name: "文件和资源" })
  const file = new File(["content"], "conflict.txt", { type: "text/plain" })
  fireEvent.change(document.getElementById("project-resource-upload") as HTMLInputElement, { target: { files: [file] } })
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("请重新选择文件开始新上传"))
  expect(within(dialog).queryByRole("button", { name: "重试上传 conflict.txt" })).not.toBeInTheDocument()
  expect(within(dialog).getByRole("list", { name: "文件和资源" })).not.toHaveTextContent("conflict.txt")
})

it("专案指令历史使用双栏版本 Dialog 并可切换正文", () => {
  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
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

  const instructionsCard = contextCard(container, "instructions")
  fireEvent.click(at(
    within(instructionsCard).getAllByRole("button", { name: /指令/ }),
    0,
    "instructions history trigger",
  ))
  fireEvent.click(screen.getByRole("button", { name: "历史记录" }))

  const historyDialog = screen.getByRole("dialog", { name: "专案指令历史" })
  expect(historyDialog).toHaveTextContent("当前版本")
  expect(historyDialog).toHaveTextContent("当前规则")
  const revisions = within(within(historyDialog).getByRole("list")).getAllByRole("button")
  expect(revisions).toHaveLength(2)
  fireEvent.click(at(revisions, 1, "previous instruction revision"))
  expect(historyDialog).toHaveTextContent("上一版规则")
})

it("在项目页内打开独立技能 Dialog，并持久化技能启用状态", async () => {
  const onOpenSettings = vi.fn()
  const onSetProjectSkillEnabled = vi.fn().mockResolvedValue(undefined)

  const { container } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        onOpenSettings={onOpenSettings}
        onSetProjectSkillEnabled={onSetProjectSkillEnabled}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = contextCard(container, "resources-skills")
  fireEvent.click(at(
    within(resourcesCard).getAllByRole("button", { name: /^技能$/ }),
    0,
    "skills trigger",
  ))

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
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = contextCard(container, "resources-skills")
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
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = contextCard(container, "resources-skills")
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
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        onSetProjectSkillEnabled={onSetProjectSkillEnabled}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const resourcesCard = contextCard(container, "resources-skills")
  fireEvent.click(at(
    within(resourcesCard).getAllByRole("button", { name: /^技能$/ }),
    0,
    "skills failure trigger",
  ))
  const skillSwitch = screen.getByRole("switch", { name: "技能构建器" })
  fireEvent.click(skillSwitch)

  await waitFor(() => expect(onSetProjectSkillEnabled).toHaveBeenCalledWith("skill-builder", false))
  await waitFor(() => expect(skillSwitch).toBeChecked())
})

it("网站入口打开项目级选择弹窗而不是向 Composer 注入提示词", () => {
  const onPrompt = vi.fn()
  render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview brandName="Kokoro" composer={<div>composer</div>} onPrompt={onPrompt} workspaceCapabilities={capabilities} />
    </LocaleProvider>,
  )

  const addButtons = screen.getAllByRole("button", { name: "新增" })
  fireEvent.click(at(addButtons, -2, "website add button"))

  expect(screen.getByRole("dialog", { name: "新增网站至当前专案" })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "搜索网站" })).toBeInTheDocument()
  expect(onPrompt).not.toHaveBeenCalled()
})

it("网站选择器可以搜索、选择并保存合成网站", async () => {
  render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview brandName="Kokoro" composer={<div>composer</div>} onPrompt={vi.fn()} workspaceCapabilities={capabilities} />
    </LocaleProvider>,
  )

  const addButtons = screen.getAllByRole("button", { name: "新增" })
  fireEvent.click(at(addButtons, -2, "website add button"))
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
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        onCreateProjectScheduledTask={onCreateProjectScheduledTask}
        workspaceCapabilities={capabilities}
      />
    </LocaleProvider>,
  )

  const addButtons = screen.getAllByRole("button", { name: "新增" })
  fireEvent.click(at(addButtons, -1, "scheduled task add button"))
  fireEvent.click(screen.getByRole("button", { name: "建立新项目" }))

  const dialogs = screen.getAllByRole("dialog")
  const editor = at(dialogs, -1, "scheduled task editor")
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

it("正式专案任务入口到独立任务页，不提供样例选择或本地成功", () => {
  const { container } = render(<LocaleProvider><KokoroProjectWorkspace preview={false} projectRef="project-real" onPrompt={vi.fn()} workspaceCapabilities={capabilities} /></LocaleProvider>)
  const card = contextCard(container, "scheduled")
  const link = within(card).getByRole("link")
  expect(link).toHaveAttribute("href", "/app/scheduled")
  expect(screen.queryByText("每日简报")).not.toBeInTheDocument()
  expect(within(card).queryByRole("button")).not.toBeInTheDocument()
})

it("新的专案会话欢迎面使用 Conversation DOM 与标题关联", () => {
  render(<LocaleProvider><KokoroProjectWorkspace projectConversation onPrompt={vi.fn()} composer={<textarea aria-label="测试输入" />} /></LocaleProvider>)
  const surface = document.querySelector('[data-slot="project-conversation-welcome"]')
  expect(surface).toBeInTheDocument()
  expect(surface).toHaveAttribute("aria-labelledby", "kokoro-project-conversation-heading")
  expect(screen.getByRole("heading", { name: "新对话" })).toHaveAttribute("id", "kokoro-project-conversation-heading")
})

it("正式项目标题/时间只消费 canonical detail，切换 loading/error 不保留品牌或旧名称", async () => {
  const project = { id: "canonical-A", name: "真正的项目名", slug: "a", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T01:00:00Z" }
  const retry = vi.fn()
  const props = { brandName: "站点品牌", composer: <div>composer</div>, onPrompt: vi.fn(), preview: false, projectRef: project.id, onRetryProjectRead: retry }
  const view = render(<LocaleProvider><KokoroProjectWorkspace {...props} projectDetail={{ status: "ready", data: project }} /></LocaleProvider>)
  expect(screen.getByRole("heading", { name: "真正的项目名" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "站点品牌" })).toBeNull()
  expect(document.querySelector("time")).toHaveAttribute("datetime", project.updated_at)
  expect(screen.queryByText("今天更新")).toBeNull()
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectRef="canonical-B" projectDetail={{ status: "loading" }} /></LocaleProvider>)
  expect(screen.queryByRole("heading", { name: "真正的项目名" })).toBeNull()
  expect(screen.getByTestId("project-detail-loading")).toHaveTextContent("正在加载专案…")
  view.rerender(<LocaleProvider><KokoroProjectWorkspace {...props} projectDetail={{ status: "error", retryable: false }} /></LocaleProvider>)
  expect(screen.getByTestId("project-detail-error")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "重试" })).toBeDisabled()
  expect(screen.queryByRole("heading", { name: "真正的项目名" })).toBeNull()
})

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/project/instruction-project",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const instructionOwnerProject = {
  id: "instruction-project", name: "Canonical instruction project", slug: "instructions", description: "",
  instruction: "身份 A 的已加载指令", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
}
const instructionOwnerRevision = {
  id: "revision-A", instruction: "身份 A 的已加载历史", updated_at: "2026-10-01T00:00:00Z", actor_name: "Actor A", current: true,
}
function instructionDetailResponse(instruction = instructionOwnerProject.instruction) {
  return Response.json({ data: { project: { ...instructionOwnerProject, instruction } }, meta: { request_id: "req_instruction_detail" } })
}
function instructionHistoryResponse() {
  // Exact pinned public 3.0.0 wire, not the old camelCase UI array assertion.
  return Response.json({ data: { items: [instructionOwnerRevision] }, meta: { request_id: "req_instruction_history" } })
}
function pendingInstructionResponse() {
  let resolve: (response: Response) => void = () => { throw new Error("response not pending") }
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}

async function mountInstructionBoundary(
  respond: (path: string, init?: RequestInit) => Promise<Response>,
) {
  const { AppFrame } = await import("@/components/blocks/app-frame/app-frame")
  const { ThemeProvider } = await import("@/ui/theme/theme-context")
  const pageClients = await import("@/ui/shell/page-clients")
  const { createSessionEngine } = await import("@/engine/machine")
  const { createFakeClient, createMemoryStorage } = await import("../engine/fakes")
  const client = createFakeClient()
  const engine = createSessionEngine({ client, storage: createMemoryStorage<import("@/core/conversations").ConversationStore>(null), now: () => 1_000 })
  vi.spyOn(pageClients, "browserListClient").mockReturnValue(client)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, window.location.origin).pathname
    if (path === "/api/hub/projects") return Response.json({ data: { projects: [] }, meta: { request_id: "req_instruction_list" } })
    if (path.startsWith("/api/hub/projects/instruction-project")) return respond(path, init)
    return Response.json({}, { status: 503 })
  })
  let latest: import("@/components/blocks/app-frame/app-frame").EmptyStateProps | undefined
  function InstructionProjection(props: import("@/components/blocks/app-frame/app-frame").EmptyStateProps) {
    latest = props
    // The real AppFrame and its real hooks supply this observable UI projection.
    return <output data-testid="instruction-owner-projection">{JSON.stringify({ instruction: props.projectInstructions ?? "", history: props.projectInstructionHistory ?? [] })}</output>
  }
  const ui = (boundary: { admitted: boolean; subject: string | null; generation: number }) => (
    <ThemeProvider><LocaleProvider><AppFrame
      engine={engine} preview={false} chatHref="/app" projectWorkspace projectRef="instruction-project"
      projectReadBoundary={boundary} emptyState={InstructionProjection}
      workspaceCapabilities={{ instructions: true, connectors: false, resources: false, skills: false, projectConversations: false }}
    /></LocaleProvider></ThemeProvider>
  )
  const view = render(ui({ admitted: true, subject: "reader-A", generation: 1 }))
  const projection = () => JSON.parse(screen.getByTestId("instruction-owner-projection").textContent ?? "{}") as {
    instruction: string; history: Array<{ instruction: string }>
  }
  return { ...view, engine, fetchMock, ui, projection, latest: () => latest }
}

it("真实正式 AppFrame 在身份 A→B 开始核验时清已加载指令/历史，迟到 A PATCH 不写新身份", async () => {
  const { act } = await import("@testing-library/react")
  const patch = pendingInstructionResponse()
  const readSignals: (AbortSignal | null | undefined)[] = []
  let detailGets = 0
  let histories = 0
  let patches = 0
  let subjectB = false
  const view = await mountInstructionBoundary(async (path, init) => {
    if (init?.method === "PATCH") { patches++; return patch.promise }
    if (path.endsWith("/instruction-revisions")) {
      histories++; readSignals.push(init?.signal)
      return subjectB ? Response.json({ data: { items: [{ ...instructionOwnerRevision, id: "revision-B", instruction: "身份 B 的历史", actor_name: "Actor B" }] }, meta: { request_id: "req_history_B" } }) : instructionHistoryResponse()
    }
    detailGets++; readSignals.push(init?.signal)
    return instructionDetailResponse(subjectB ? "身份 B 的指令" : instructionOwnerProject.instruction)
  })
  try {
    await waitFor(() => expect(view.projection().instruction).toBe("身份 A 的已加载指令"))
    await waitFor(() => expect(view.projection().history.map((item) => item.instruction)).toEqual(["身份 A 的已加载历史"]))
    const initialDetailGets = detailGets
    let save: Promise<void> | undefined
    act(() => { save = view.latest()?.onSaveProjectInstructions?.("身份 A 的迟到编辑").catch(() => undefined) })
    await waitFor(() => expect(patches).toBe(1))
    view.rerender(view.ui({ admitted: false, subject: null, generation: 2 }))
    expect(view.projection(), `healthy reads: detail=${detailGets}, history=${histories}, pendingPatch=${patches}`).toEqual({ instruction: "", history: [] })
    subjectB = true
    view.rerender(view.ui({ admitted: true, subject: "reader-B", generation: 3 }))
    await waitFor(() => expect(view.projection().instruction).toBe("身份 B 的指令"))
    await waitFor(() => expect(view.projection().history.map((item) => item.instruction)).toEqual(["身份 B 的历史"]))
    await act(async () => { patch.resolve(instructionDetailResponse("身份 A 的迟到编辑")); await save })
    expect(view.projection().instruction).toBe("身份 B 的指令")
    expect(view.projection().history.map((item) => item.instruction)).toEqual(["身份 B 的历史"])
    expect(initialDetailGets).toBe(1)
    expect(detailGets).toBe(2)
    expect(histories).toBe(2)
    expect(readSignals.every((signal) => signal instanceof AbortSignal)).toBe(true)
  } finally { view.unmount(); view.engine.dispose(); vi.restoreAllMocks() }
})

it("真实正式 AppFrame 同 subject 换代取消 A 待决详情/历史，迟到 GET 不复活旧指令且详情只读一次", async () => {
  const { act } = await import("@testing-library/react")
  const { settle } = await import("../engine/fakes")
  const detail = pendingInstructionResponse()
  const history = pendingInstructionResponse()
  const detailSignals: (AbortSignal | null | undefined)[] = []
  const historySignals: (AbortSignal | null | undefined)[] = []
  let nextGeneration = false
  const view = await mountInstructionBoundary(async (path, init) => {
    if (path.endsWith("/instruction-revisions")) {
      historySignals.push(init?.signal)
      return nextGeneration ? Response.json({ data: { items: [] }, meta: { request_id: "req_new_history" } }) : (await history.promise).clone()
    }
    detailSignals.push(init?.signal)
    return nextGeneration ? instructionDetailResponse("同 subject 新代际指令") : (await detail.promise).clone()
  })
  try {
    await waitFor(() => expect(detailSignals.length).toBeGreaterThan(0))
    await waitFor(() => expect(historySignals).toHaveLength(1))
    view.rerender(view.ui({ admitted: false, subject: null, generation: 2 }))
    expect(view.projection()).toEqual({ instruction: "", history: [] })
    await act(async () => { detail.resolve(instructionDetailResponse()); history.resolve(instructionHistoryResponse()); await settle() })
    expect(view.projection(), `old read signals: detail=${JSON.stringify(detailSignals.map((signal) => signal?.aborted ?? null))}, history=${JSON.stringify(historySignals.map((signal) => signal?.aborted ?? null))}`).toEqual({ instruction: "", history: [] })
    expect(detailSignals).toHaveLength(1)
    expect(detailSignals[0]?.aborted).toBe(true)
    expect(historySignals[0]?.aborted).toBe(true)
    nextGeneration = true
    view.rerender(view.ui({ admitted: true, subject: "reader-A", generation: 3 }))
    await waitFor(() => expect(detailSignals).toHaveLength(2))
    await waitFor(() => expect(view.projection().instruction).toBe("同 subject 新代际指令"))
  } finally { view.unmount(); view.engine.dispose(); vi.restoreAllMocks() }
})
