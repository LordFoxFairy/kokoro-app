import { act, renderHook, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroProjectWorkspace } from "@/features/app/kokoro-project-workspace"
import { ProjectResourceUploadError } from "@/features/app/project-resource-upload"
import { useProjectSkills } from "@/features/app/use-project-skills"

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
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    "/site-assets/project-skills.svg",
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

it("项目上下文和最近会话在编辑区之前，空指令保留独立添加入口", () => {
  render(<LocaleProvider><KokoroProjectWorkspace preview
    brandName="Kokoro" composer={<section aria-label="消息编辑区">composer</section>}
    onPrompt={vi.fn()} workspaceCapabilities={capabilities}
  /></LocaleProvider>)
  const context = screen.getByRole("complementary", { name: "工作区状态" })
  const conversations = screen.getByRole("region", { name: /最近|项目会话/ })
  const composer = screen.getByRole("region", { name: "消息编辑区" })
  expect(context.compareDocumentPosition(conversations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(conversations.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(context).getByRole("button", { name: "新增指令" }))
  expect(screen.getByRole("textbox", { name: "项目指令" })).toBeInTheDocument()
})

it("项目会话读取过程不打断工作台，也不展示重试面板", () => {
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
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByText("新建一个任务以开始")).not.toBeInTheDocument()

  rerender(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        {...baseProps}
        projectConversationsError
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("status")).toHaveTextContent("会话暂时无法加载。")
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByText("新建一个任务以开始")).not.toBeInTheDocument()
})

it("项目会话路由在读取未完成时不误报空会话，也不显示异常卡片", () => {
  const { rerender } = render(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
        projectConversationsError
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("status")).toHaveTextContent("会话暂时无法加载。")
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.queryByTestId("project-conversations-error")).not.toBeInTheDocument()
  expect(document.querySelector('[data-slot="project-conversation-welcome"]')).toBeNull()
  expect(screen.queryByText("还没有项目会话。新建一个会话以开始。")).toBeNull()

  rerender(
    <LocaleProvider>
      <KokoroProjectWorkspace preview
        brandName="Kokoro"
        composer={<div>composer</div>}
        onPrompt={vi.fn()}
        workspaceCapabilities={capabilities}
        projectConversationsLoading
      />
    </LocaleProvider>,
  )
  expect(screen.getByRole("status")).toHaveTextContent("正在加载会话…")
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.queryByTestId("project-conversations-loading")).not.toBeInTheDocument()
  expect(document.querySelector('[data-slot="project-conversation-welcome"]')).toBeNull()
  expect(screen.queryByText("还没有项目会话。新建一个会话以开始。")).toBeNull()
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
  const editor = screen.getByRole("textbox", { name: "项目指令" })
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

it("项目指令历史使用双栏版本 Dialog 并可切换正文", () => {
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

  const historyDialog = screen.getByRole("dialog", { name: "项目指令历史" })
  expect(historyDialog).toHaveTextContent("当前版本")
  expect(historyDialog).toHaveTextContent("当前规则")
  const revisions = within(within(historyDialog).getByRole("list")).getAllByRole("button")
  expect(revisions).toHaveLength(2)
  fireEvent.click(at(revisions, 1, "previous instruction revision"))
  expect(historyDialog).toHaveTextContent("上一版规则")
})

const skillProjectId = "project_11111111-1111-4111-8111-111111111111"
const skillProject = { id: skillProjectId, name: "Skills project", slug: "skills-project", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T01:00:00Z" }
const projectSkill = { installation_id: "project-install-1", source_ref: "skill:revision-1", series_id: "series-1", revision: "1", installed: true, enabled: true,
  installed_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", display_name: "Project Skill", summary: "Exact project installation", source_status: "active",
  skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "5" }, tags: [] }
const skillReply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-request-id": "project-skills-ui" } })
const skillWorkspace = (boundary = { admitted: true, subject: "project-reader", generation: 1 }, loading = false, presentation: Pick<Parameters<typeof KokoroProjectWorkspace>[0], "projectConversationContent" | "projectContextVisible"> = {}) => <LocaleProvider><KokoroProjectWorkspace
  {...presentation} composer={<div>composer</div>} onPrompt={vi.fn()} workspaceCapabilities={capabilities} preview={false} projectRef={skillProjectId}
  projectDetail={loading ? { status: "loading" } : { status: "ready", data: skillProject }} projectReadBoundary={boundary} /></LocaleProvider>
const openProjectSkills = (container: HTMLElement) => fireEvent.click(within(contextCard(container, "resources-skills")).getByRole("button", { name: /^技能$/ }))

it("项目不可用版本不能启用或新增默认，但仍可停用、移除及显式更新", async () => {
  let item = { ...projectSkill, source_status: "withdrawn", enabled: false, available_update: { source_ref: "skill:revision-2", revision: "2" } }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      item = { ...item, enabled: false }
      return skillReply({ data: { installation: item, change: "disabled", event_id: "disabled-withdrawn", replayed: false } })
    }
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: [] } })
    return skillReply({ data: [item] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(skillWorkspace()); openProjectSkills(view.container)
  const toggle = await screen.findByRole("switch", { name: "启用 Project Skill" })
  expect(toggle).toBeDisabled()
  expect(screen.getByRole("checkbox", { name: "默认使用 Project Skill" })).toBeDisabled()
  expect(screen.getByText("此技能版本当前不可用")).toBeVisible()
  expect(screen.getByRole("button", { name: "移除技能" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "更新技能" })).toBeEnabled()
  fireEvent.click(toggle)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0)

  item = { ...item, enabled: true }
  view.rerender(skillWorkspace({ admitted: true, subject: "project-reader", generation: 2 }))
  await waitFor(() => expect(screen.getByRole("switch", { name: "启用 Project Skill" })).toBeEnabled())
  fireEvent.click(screen.getByRole("switch", { name: "启用 Project Skill" }))
  await waitFor(() => expect(screen.getByRole("switch", { name: "启用 Project Skill" })).not.toBeChecked())
  expect(screen.getByRole("switch", { name: "启用 Project Skill" })).toBeDisabled()
  const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ enabled: false })
})

it("项目旧启用回调按当前来源状态拒绝新命令，恢复active后可显式启用", async () => {
  let item = { ...projectSkill, enabled: false }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      item = { ...item, enabled: true }
      return skillReply({ data: { installation: item, change: "enabled", event_id: "enabled-active", replayed: false } })
    }
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: [] } })
    return skillReply({ data: [item] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = renderHook(() => useProjectSkills(skillProjectId, { admitted: true, subject: "project-reader", generation: 1 }, true))
  await waitFor(() => expect(view.result.current.status).toBe("ready"))
  const previousEnable = view.result.current.execute
  item = { ...item, source_status: "withdrawn" }
  act(() => view.result.current.reload())
  await waitFor(() => expect(view.result.current.facts?.items[0]?.source_status).toBe("withdrawn"))
  let result: boolean | undefined
  await act(async () => { result = await previousEnable({ kind: "enabled", id: item.installation_id, enabled: true }) })
  expect(result).toBe(false)
  expect(view.result.current.pending).toBeNull()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0)

  item = { ...item, source_status: "active" }
  act(() => view.result.current.reload())
  await waitFor(() => expect(view.result.current.facts?.items[0]?.source_status).toBe("active"))
  await act(async () => { result = await view.result.current.execute({ kind: "enabled", id: item.installation_id, enabled: true }) })
  expect(result).toBe(true)
  expect(view.result.current.facts?.items[0]?.enabled).toBe(true)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1)
})

it("在独立项目技能面板读取真实安装，显式保存默认安装 ID 而非名称", async () => {
  let selected: string[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { selected = (JSON.parse(String(init.body)) as { installation_ids: string[] }).installation_ids; return skillReply({ data: { project_id: skillProjectId, installation_ids: selected } }) }
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: selected } })
    const next = new URL(url, "http://localhost").searchParams.get("cursor")
    return skillReply(next ? { data: [{ ...projectSkill, installation_id: "project-install-2", display_name: "Page Two" }] } : { data: [projectSkill], meta: { next_cursor: "opaque +/=" } })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(skillWorkspace()); openProjectSkills(view.container)
  const checkbox = await screen.findByRole("checkbox", { name: "默认使用 Project Skill" })
  expect(checkbox).not.toBeChecked(); fireEvent.click(checkbox)
  fireEvent.change(screen.getByRole("textbox", { name: "搜索技能" }), { target: { value: "报表" } })
  await screen.findByRole("checkbox", { name: "默认使用 Project Skill" })
  expect(screen.getByRole("checkbox", { name: "默认使用 Project Skill" })).toBeChecked()
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByRole("checkbox", { name: "默认使用 Page Two" })
  expect(fetchMock.mock.calls.some(([url]) => new URL(url, "http://localhost").searchParams.get("query") === "报表" && new URL(url, "http://localhost").searchParams.get("cursor") === "opaque +/=")).toBe(true)
  fireEvent.click(screen.getByRole("button", { name: "保存默认技能" }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1))
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "默认使用 Project Skill" })).toBeChecked())
  const [url, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!
  expect(url).toBe(`/api/hub/projects/${skillProjectId}/skill-selection`)
  expect(JSON.parse(String(init?.body))).toEqual({ installation_ids: [projectSkill.installation_id] })
  expect(new Headers(init?.headers).get("idempotency-key")).toBeTruthy()
  expect(fetchMock.mock.calls.every(([url]) => !url.includes("/skills/skill-builder"))).toBe(true)
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
  const skillsDialog = screen.getByRole("dialog", { name: "项目技能" })
  fireEvent.change(within(skillsDialog).getByRole("textbox", { name: "搜索技能" }), { target: { value: "不存在" } })
  expect(skillsDialog).toHaveTextContent("暂无符合筛选条件的安装")
  expect(skillsDialog).not.toHaveTextContent("技能构建器")
})

it("未知默认命令跨重核只显式重放原 key/body，ACK 后回读失败不再写", async () => {
  let writes = 0, failReads = false
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { writes++; if (writes === 1) throw new Error("response lost"); failReads = true; return skillReply({ data: { project_id: skillProjectId, installation_ids: [projectSkill.installation_id] } }) }
    if (failReads) throw new Error("read unavailable")
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: [] } })
    return skillReply({ data: [projectSkill] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(skillWorkspace()); openProjectSkills(view.container)
  fireEvent.click(await screen.findByRole("checkbox", { name: "默认使用 Project Skill" }))
  fireEvent.click(screen.getByRole("button", { name: "保存默认技能" }))
  await screen.findByText("操作结果尚未确认。重试会使用原操作，不会创建新的请求。")
  const stableDialog = screen.getByRole("dialog", { name: "项目技能" })
  view.rerender(skillWorkspace({ admitted: false, subject: "project-reader", generation: 2 }, true))
  expect(screen.getByRole("dialog", { name: "项目技能" })).toBe(stableDialog)
  expect(screen.queryByText("Exact project installation")).not.toBeInTheDocument()
  view.rerender(skillWorkspace({ admitted: true, subject: "project-reader", generation: 3 }))
  await screen.findByRole("checkbox", { name: "默认使用 Project Skill" })
  expect(writes).toBe(1)
  fireEvent.click(screen.getByRole("button", { name: "重试原操作" }))
  await screen.findByText("操作已确认，但读取失败。请重新读取，不会重复操作。")
  const commands = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")
  expect(commands).toHaveLength(2)
  expect(commands[1]?.[1]?.body).toBe(commands[0]?.[1]?.body)
  expect(new Headers(commands[1]?.[1]?.headers).get("idempotency-key")).toBe(new Headers(commands[0]?.[1]?.headers).get("idempotency-key"))
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }))
  await screen.findByText("操作已确认，但读取失败。请重新读取，不会重复操作。")
  expect(writes).toBe(2)
  failReads = false
  fireEvent.click(within(screen.getByRole("dialog", { name: "项目技能" })).getByRole("button", { name: "关闭对话框" }))
  openProjectSkills(view.container)
  await screen.findByRole("checkbox", { name: "默认使用 Project Skill" })
  await waitFor(() => expect(screen.queryByText("操作已确认，但读取失败。请重新读取，不会重复操作。")).not.toBeInTheDocument())
  expect(writes).toBe(2)
  expect(screen.getByRole("checkbox", { name: "默认使用 Project Skill" })).not.toBeChecked() // fresh GET, not the old acknowledged selection
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

  expect(screen.getByRole("dialog", { name: "新增网站至当前项目" })).toBeInTheDocument()
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
  const dialog = screen.getByRole("dialog", { name: "新增网站至当前项目" })
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

it("正式项目任务入口到独立任务页，不提供样例选择或本地成功", () => {
  const { container } = render(<LocaleProvider><KokoroProjectWorkspace preview={false} projectRef="project-real" onPrompt={vi.fn()} workspaceCapabilities={capabilities} /></LocaleProvider>)
  const card = contextCard(container, "scheduled")
  const link = within(card).getByRole("link")
  expect(link).toHaveAttribute("href", "/app/scheduled?project_id=project-real#scheduled-tasks/new")
  expect(screen.queryByText("每日简报")).not.toBeInTheDocument()
  expect(within(card).queryByRole("button")).not.toBeInTheDocument()
})

it("empty project conversations retain identity, context and real project history", () => {
  const project = { id: "project-context", name: "项目上下文", slug: "context", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T01:00:00Z" }
  render(<LocaleProvider><KokoroProjectWorkspace preview={false}
    projectRef={project.id} projectDetail={{ status: "ready", data: project }}
    workspaceCapabilities={capabilities} projectConversations={[{ id: "existing-task", title: "已有项目任务" }]}
    onPrompt={vi.fn()} composer={<textarea aria-label="测试输入" />} /></LocaleProvider>)
  expect(screen.getByRole("heading", { name: "项目上下文" })).toBeVisible()
  expect(screen.getByText("已有项目任务")).toBeVisible()
  expect(screen.getByRole("textbox", { name: "测试输入" })).toBeVisible()
  expect(screen.queryByText("还没有项目会话。新建一个会话以开始。")).toBeNull()
})

it("正式项目任务入口精确编码 opaque projectRef，缺少引用时不猜测关联", () => {
  const encoded = render(<LocaleProvider><KokoroProjectWorkspace preview={false} projectRef="项目/one two" onPrompt={vi.fn()} workspaceCapabilities={capabilities} /></LocaleProvider>)
  expect(within(contextCard(encoded.container, "scheduled")).getByRole("link")).toHaveAttribute(
    "href",
    "/app/scheduled?project_id=%E9%A1%B9%E7%9B%AE%2Fone%20two#scheduled-tasks/new",
  )
  encoded.unmount()

  const personal = render(<LocaleProvider><KokoroProjectWorkspace preview={false} onPrompt={vi.fn()} workspaceCapabilities={capabilities} /></LocaleProvider>)
  expect(within(contextCard(personal.container, "scheduled")).getByRole("link")).toHaveAttribute("href", "/app/scheduled")
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
  expect(screen.queryByText("项目不可用")).toBeNull()
  expect(screen.getByTestId("project-title-loading")).toHaveAttribute("aria-hidden", "true")
  expect(screen.getByTestId("project-detail-loading")).toHaveTextContent("正在加载项目…")
  expect(screen.getByTestId("project-detail-loading").closest("header")).toHaveAttribute("aria-busy", "true")
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


it("Project rename keeps cancel at zero writes, pending locked, unknown same-key retry and ACK read-failure GET-only", async () => {
  const { useAppFrameProject } = await import("@/components/blocks/app-frame/use-app-frame-project")
  const { ProjectReadError } = await import("@/features/app/project-list")
  const id = "project_12345678-1234-1234-1234-123456789abc"
  const project = { id, name: "Old canonical", slug: "unchanged", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.history.replaceState(null, "", `/app/project/${id}?conversation=conv-unchanged`)
  const updateDraft = vi.fn(); const clearDraft = vi.fn()
  let deliver: (response: Response) => void = () => { throw new Error("no pending PATCH") }
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise<Response>((resolve) => { deliver = resolve }))
    .mockResolvedValueOnce(Response.json({ data: { project_id: id, name: "我的项目" } }, { headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "ack-a" } }))
  const readBack = vi.fn().mockRejectedValueOnce(new ProjectReadError("http", 503)).mockResolvedValueOnce({ ...project, name: "Current B" })
  const options = {
    projectRef: id, projectWorkspace: true, preview: false, mounted: true, draft: "preserved draft", updateDraft, clearDraft,
    projectDetail: { status: "ready" as const, data: project }, instructionHistory: { status: "blocked" as const }, instructionContext: {},
    refreshProject: vi.fn(), refreshRenamedProject: readBack, renameBoundary: { admitted: true, subject: "reader", generation: 1 }, renameRouteKey: "same-project-thread",
  }
  const view = renderHook(() => useAppFrameProject(options), { wrapper: LocaleProvider })
  try {
    act(() => view.result.current.projectRename.onOpen())
    act(() => view.result.current.projectRename.onChange("  我的项目  "))
    act(() => view.result.current.projectRename.onClose())
    expect(view.result.current.projectRename.open).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => view.result.current.projectRename.onOpen())
    act(() => view.result.current.projectRename.onChange("  我的项目  "))
    act(() => view.result.current.projectRename.onSave())
    expect(view.result.current.projectRename.status).toBe("pending")
    act(() => { view.result.current.projectRename.onSave(); view.result.current.projectRename.onClose(); view.result.current.projectRename.onChange("different") })
    expect(view.result.current.projectRename.open).toBe(true)
    expect(view.result.current.projectRename.name).toBe("  我的项目  ")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readBack).not.toHaveBeenCalled()
    await act(async () => { deliver(Response.json({ error: { code: "business_store_unavailable", message: "unknown commit", retryable: true } }, { status: 503, headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "unknown" } })); await Promise.resolve() })
    await waitFor(() => expect(view.result.current.projectRename.status).toBe("unknown"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => view.result.current.projectRename.onRetry())
    await waitFor(() => expect(view.result.current.projectRename.status).toBe("read-error"))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const requests = fetchMock.mock.calls.map(([url, init]) => ({ url, body: init?.body, key: new Headers(init?.headers).get("idempotency-key") }))
    expect(requests[0]).toEqual(requests[1])
    expect(requests[0]).toEqual({ url: `/api/hub/projects/${id}/name`, body: '{"name":"我的项目"}', key: expect.any(String) })
    expect(readBack).toHaveBeenCalledTimes(1)
    act(() => view.result.current.projectRename.onRetry())
    await waitFor(() => expect(view.result.current.projectRename.open).toBe(false))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(readBack).toHaveBeenCalledTimes(2)
    expect(readBack.mock.calls.every(([target]) => target === id)).toBe(true)
    expect(updateDraft).not.toHaveBeenCalled()
    expect(clearDraft).not.toHaveBeenCalled()
    expect(`${window.location.pathname}${window.location.search}`).toBe(`/app/project/${id}?conversation=conv-unchanged`)
  } finally { view.unmount(); fetchMock.mockRestore(); window.history.replaceState(null, "", originalUrl) }
})

it("Project rename revocation clears sensitive intent; a route change aborts late PATCH before read-back", async () => {
  const { useAppFrameProject } = await import("@/components/blocks/app-frame/use-app-frame-project")
  const id = "project_12345678-1234-1234-1234-123456789abc"
  const project = { id, name: "Old", slug: "same", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.history.replaceState(null, "", `/app/project/${id}`)
  let deliver: (response: Response) => void = () => { throw new Error("no PATCH") }
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ error: { code: "session_forbidden", message: "denied", retryable: false } }, { status: 403, headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "denied" } }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { deliver = resolve }))
  const readBack = vi.fn().mockResolvedValue(project)
  const options = { projectRef: id, projectWorkspace: true, preview: false, mounted: true, draft: "same", updateDraft: vi.fn(), clearDraft: vi.fn(),
    projectDetail: { status: "ready" as const, data: project }, instructionHistory: { status: "blocked" as const }, instructionContext: {}, refreshProject: vi.fn(),
    refreshRenamedProject: readBack, renameBoundary: { admitted: true, subject: "reader", generation: 1 }, renameRouteKey: "route" }
  const view = renderHook(({ boundary }) => useAppFrameProject({ ...options, renameBoundary: boundary }), { initialProps: { boundary: options.renameBoundary }, wrapper: LocaleProvider })
  try {
    act(() => view.result.current.projectRename.onOpen())
    act(() => view.result.current.projectRename.onChange("sensitive name"))
    act(() => view.result.current.projectRename.onSave())
    await waitFor(() => expect(view.result.current.projectRename.problem).toBe("permission"))
    expect(view.result.current.projectRename.name).toBe("")
    expect(view.result.current.projectRename.available).toBe(false)
    act(() => view.result.current.projectRename.onRetry())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.rerender({ boundary: { admitted: true, subject: "another-reader", generation: 2 } })
    act(() => view.result.current.projectRename.onOpen())
    act(() => view.result.current.projectRename.onChange("late name"))
    act(() => view.result.current.projectRename.onSave())
    window.history.pushState(null, "", "/app")
    act(() => window.dispatchEvent(new PopStateEvent("popstate")))
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    await act(async () => { deliver(Response.json({ data: { project_id: id, name: "late name" } }, { headers: { "cache-control": "private, no-store, max-age=0", "x-request-id": "late" } })); await Promise.resolve() })
    expect(readBack).not.toHaveBeenCalled()
    expect(view.result.current.projectRename.open).toBe(false)
    expect(view.result.current.projectRename.name).toBe("")
    expect(options.updateDraft).not.toHaveBeenCalled()
  } finally { view.unmount(); fetchMock.mockRestore(); window.history.replaceState(null, "", originalUrl) }
})

it("项目技能安装、启停、显式更新和移除使用真实 pin，安装不自动设为默认", async () => {
  let installed = false, selected: string[] = []
  let item = { ...projectSkill, enabled: false, available_update: { source_ref: "skill:revision-2", revision: "2" } as { source_ref: string; revision: string } | undefined }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/hub/self/skill-installations")) return skillReply({ data: [{ ...projectSkill, installation_id: "personal-install-1" }] })
    if (url.endsWith("skill-selection")) {
      if (init?.method === "PUT") selected = (JSON.parse(String(init.body)) as { installation_ids: string[] }).installation_ids
      return skillReply({ data: { project_id: skillProjectId, installation_ids: selected } })
    }
    if (init?.method === "POST" && url.endsWith("/update")) { item = { ...item, source_ref: "skill:revision-2", revision: "2", available_update: undefined }; return skillReply({ data: { installation: item, change: "upgraded", event_id: "event-updated", replayed: false } }) }
    if (init?.method === "POST") { installed = true; return skillReply({ data: { installation: item, change: "installed", event_id: "event-installed", replayed: false } }) }
    if (init?.method === "PUT") { item = { ...item, enabled: true }; return skillReply({ data: { installation: item, change: "enabled", event_id: "event-enabled", replayed: false } }) }
    if (init?.method === "DELETE") { installed = false; return skillReply({ data: { installation: { ...item, installed: false, enabled: false, removed_at: "2026-10-11T00:00:00Z" }, change: "removed", event_id: "event-removed", replayed: false } }) }
    return skillReply({ data: installed ? [item] : [] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(skillWorkspace()); openProjectSkills(view.container)
  const dialog = screen.getByRole("dialog", { name: "项目技能" })
  await within(dialog).findByText("尚无技能")
  expect(within(dialog).queryByRole("button", { name: "保存默认技能" })).toBeNull()
  fireEvent.pointerDown(within(dialog).getByRole("button", { name: "添加" }), { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole("menuitem", { name: "从我的技能导入" }))
  const source = await within(dialog).findByRole("heading", { name: "Project Skill" })
  fireEvent.click(within(source.closest("article")!).getByRole("button", { name: "新增" }))
  await within(dialog).findByRole("switch", { name: "启用 Project Skill" })
  expect(screen.getByRole("switch", { name: "启用 Project Skill" })).not.toBeChecked()
  expect(screen.getByRole("checkbox", { name: "默认使用 Project Skill" })).toBeDisabled()
  expect(selected).toEqual([])
  fireEvent.click(screen.getByRole("switch", { name: "启用 Project Skill" }))
  await waitFor(() => expect(screen.getByRole("switch", { name: "启用 Project Skill" })).toBeChecked())
  fireEvent.click(screen.getByRole("checkbox", { name: "默认使用 Project Skill" }))
  fireEvent.click(screen.getByRole("button", { name: "保存默认技能" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "移除技能" })).toBeDisabled())
  expect(selected).toEqual([projectSkill.installation_id])
  const updateTrigger = screen.getByRole("button", { name: "更新技能" })
  updateTrigger.focus()
  fireEvent.click(updateTrigger)
  fireEvent.click(within(screen.getByRole("dialog", { name: "更新技能" })).getByRole("button", { name: "取消" }))
  await waitFor(() => expect(updateTrigger).toHaveFocus())
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/update"))).toHaveLength(0)
  fireEvent.click(updateTrigger)
  const confirmation = screen.getByRole("dialog", { name: "更新技能" })
  expect(confirmation).toHaveTextContent("skill:revision-1")
  expect(confirmation).toHaveTextContent("skill:revision-2")
  fireEvent.click(within(confirmation).getByRole("button", { name: "确认" }))
  await within(dialog).findByText("版本 2")
  await waitFor(() => expect(dialog).toHaveFocus())
  const update = fetchMock.mock.calls.find(([url]) => url.endsWith("/update"))!
  expect(update[0]).toBe(`/api/hub/projects/${skillProjectId}/skill-installations/${projectSkill.installation_id}/update`)
  expect(JSON.parse(String(update[1]?.body))).toEqual({ expected_source_ref: "skill:revision-1", source_ref: "skill:revision-2" })
  fireEvent.click(screen.getByRole("checkbox", { name: "默认使用 Project Skill" }))
  fireEvent.click(screen.getByRole("button", { name: "保存默认技能" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "移除技能" })).toBeEnabled())
  const removeTrigger = screen.getByRole("button", { name: "移除技能" })
  removeTrigger.focus()
  fireEvent.click(removeTrigger)
  fireEvent.keyDown(screen.getByRole("dialog", { name: "移除技能" }), { key: "Escape", code: "Escape" })
  await waitFor(() => expect(removeTrigger).toHaveFocus())
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0)
  fireEvent.click(removeTrigger)
  fireEvent.click(within(screen.getByRole("dialog", { name: "移除技能" })).getByRole("button", { name: "确认" }))
  await within(dialog).findByText("尚无技能")
  expect(selected).toEqual([])
  const installs = fetchMock.mock.calls.filter(([url, init]) => url.endsWith("/skill-installations") && init?.method === "POST")
  expect(installs).toHaveLength(1)
  expect(JSON.parse(String(installs[0]?.[1]?.body))).toEqual({ source_ref: "skill:revision-1" })
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1)
})

it("项目技能跨账号退休旧写与正文，A→B→A 不复活命令或旧事实", async () => {
  let actor = "A", finish: ((response: Response) => void) | undefined, commandSignal: AbortSignal | undefined
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { commandSignal = init.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve }) }
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: [] } })
    return skillReply({ data: [{ ...projectSkill, display_name: `Private ${actor}` }] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(skillWorkspace()); openProjectSkills(view.container)
  fireEvent.click(await screen.findByRole("checkbox", { name: "默认使用 Private A" }))
  fireEvent.click(screen.getByRole("button", { name: "保存默认技能" }))
  await waitFor(() => expect(finish).toBeTypeOf("function"))
  actor = "B"; view.rerender(skillWorkspace({ admitted: true, subject: "reader-B", generation: 2 }))
  expect(commandSignal?.aborted).toBe(true)
  expect(screen.queryByText("Private A")).not.toBeInTheDocument()
  openProjectSkills(view.container)
  await screen.findByRole("checkbox", { name: "默认使用 Private B" })
  await act(async () => { finish?.(skillReply({ data: { project_id: skillProjectId, installation_ids: [projectSkill.installation_id] } })); await Promise.resolve() })
  expect(screen.getByRole("checkbox", { name: "默认使用 Private B" })).not.toBeChecked()
  expect(screen.queryByText("操作结果尚未确认。重试会使用原操作，不会创建新的请求。")).not.toBeInTheDocument()
  actor = "fresh A"; view.rerender(skillWorkspace({ admitted: true, subject: "project-reader", generation: 3 }))
  openProjectSkills(view.container)
  expect(screen.queryByText("Private B")).not.toBeInTheDocument()
  await screen.findByRole("checkbox", { name: "默认使用 Private fresh A" })
  expect(screen.queryByText("Private A")).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1)
})

it("官方来源选择复用正式目录，装入精确 version UID 而不把目录名称或 series 当 pin", async () => {
  let installed = false
  const official = { ...projectSkill, display_name: "Official Skill", series_id: "official-series", source_ref: "skill:official-revision", revision: "7" }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("ListHubSkills")) return skillReply({ skills: [{ skillId: "official-series", displayName: "Official Skill", publisherType: "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL", currentVersion: { versionUid: "official-revision" } }], tagOptions: {} })
    if (url.endsWith("ListSkills")) return skillReply({ officialSkills: [], userAddedSkills: [] })
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: [] } })
    if (init?.method === "POST") { installed = true; return skillReply({ data: { installation: official, change: "installed", event_id: "official-install", replayed: false } }) }
    return skillReply({ data: installed ? [official] : [] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(skillWorkspace()); openProjectSkills(view.container)
  const dialog = screen.getByRole("dialog", { name: "项目技能" })
  await within(dialog).findByText("尚无技能")
  fireEvent.pointerDown(within(dialog).getByRole("button", { name: "新增" }), { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole("menuitem", { name: "从官方技能添加" }))
  const title = await within(dialog).findByRole("heading", { name: "Official Skill" })
  fireEvent.click(within(title.closest("article")!).getByRole("button", { name: "新增" }))
  const choice = await within(dialog).findByRole("checkbox", { name: "默认使用 Official Skill" })
  expect(choice).not.toBeChecked()
  const writes = fetchMock.mock.calls.filter(([url, init]) => url.endsWith("/skill-installations") && init?.method === "POST")
  expect(writes).toHaveLength(1)
  expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ source_ref: "skill:official-revision" })
})

it("Project delete keeps cancel at zero writes, preserves an unknown command key, and retires only the confirmed project", async () => {
  const { useAppFrameProject } = await import("@/components/blocks/app-frame/use-app-frame-project")
  const id = "project_12345678-1234-1234-1234-123456789abc"
  const project = { id, name: "Delete me", slug: "delete-me", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.history.replaceState(null, "", `/app/project/${id}`)
  const retireProject = vi.fn(); const refreshProject = vi.fn()
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ error: { code: "business_store_unavailable", message: "uncertain", retryable: true } }, {
      status: 503, headers: { "cache-control": "private, no-store, max-age=0" },
    }))
    .mockResolvedValueOnce(Response.json({ error: { code: "business_store_unavailable", message: "read uncertain", retryable: true } }, {
      status: 503, headers: { "cache-control": "private, no-store, max-age=0" },
    }))
    .mockResolvedValueOnce(Response.json({ data: { project_id: id, logical_release_state: "pending", physical_cleanup_state: "pending" } }, {
      status: 202, headers: { "cache-control": "private, no-store, max-age=0" },
    }))
  const options = {
    projectRef: id, projectWorkspace: true, preview: false, mounted: true, draft: "draft", updateDraft: vi.fn(), clearDraft: vi.fn(),
    projectDetail: { status: "ready" as const, data: project }, instructionHistory: { status: "blocked" as const }, instructionContext: {},
    refreshProject, retireProject, renameBoundary: { admitted: true, subject: "reader", generation: 1 }, renameRouteKey: "delete-route",
  }
  const view = renderHook(() => useAppFrameProject(options), { wrapper: LocaleProvider })
  try {
    act(() => view.result.current.projectDelete.onOpen())
    act(() => view.result.current.projectDelete.onClose())
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => { view.result.current.projectDelete.onOpen(); view.result.current.projectDelete.onConfirm() })
    await waitFor(() => expect(view.result.current.projectDelete.problem).toBe("unknown"))
    expect(view.result.current.projectDelete.targetName).toBe("Delete me")
    act(() => { view.result.current.projectDelete.onClose(); view.result.current.projectDelete.onOpen() })
    expect(view.result.current.projectDelete.targetName).toBe("Delete me")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const first = fetchMock.mock.calls[0]
    expect(first?.[0]).toBe(`/api/hub/projects/${id}`)
    expect(first?.[1]?.method).toBe("DELETE")
    expect(Object.hasOwn(first?.[1] ?? {}, "body")).toBe(false)
    expect(new Headers(first?.[1]?.headers).get("idempotency-key")).toEqual(expect.any(String))
    act(() => view.result.current.projectDelete.onCheck())
    await waitFor(() => expect(view.result.current.projectDelete.problem).toBe("read"))
    const receipt = fetchMock.mock.calls[1]
    expect(receipt?.[0]).toBe(`/api/hub/projects/${id}/deletion`)
    expect(receipt?.[1]?.method).toBe("GET")
    expect(Object.hasOwn(receipt?.[1] ?? {}, "body")).toBe(false)
    expect(new Headers(receipt?.[1]?.headers).has("idempotency-key")).toBe(false)
    act(() => view.result.current.projectDelete.onRetry())
    await waitFor(() => expect(retireProject).toHaveBeenCalledWith(id))
    expect(refreshProject).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const second = fetchMock.mock.calls[2]
    expect({ url: first?.[0], init: { method: first?.[1]?.method, body: first?.[1]?.body, key: new Headers(first?.[1]?.headers).get("idempotency-key") } })
      .toEqual({ url: second?.[0], init: { method: second?.[1]?.method, body: second?.[1]?.body, key: new Headers(second?.[1]?.headers).get("idempotency-key") } })
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/app")
  } finally { view.unmount(); fetchMock.mockRestore(); window.history.replaceState(null, "", originalUrl) }
})

it("Project menu contains only project actions and never opens account or upgrade from the project surface", async () => {
  const { WorkspaceHeaderProjectMenu } = await import("@/components/blocks/workspace-header/workspace-header-project-menu")
  const scope = {}
  render(<LocaleProvider><WorkspaceHeaderProjectMenu
    projectRename={{ focusScopeToken: scope, available: true, open: false, name: "", status: "idle", problem: null, frozen: false,
      onOpen: vi.fn(), onClose: vi.fn(), onChange: vi.fn(), onSave: vi.fn(), onRetry: vi.fn(), onRestart: vi.fn() }}
    projectInstruction={{ available: true, onTriggerMount: vi.fn(), onOpen: vi.fn() }}
    projectDelete={{ focusScopeToken: scope, targetName: "Project A", available: true, open: false, status: "idle", problem: null, frozen: false,
      onOpen: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn(), onRetry: vi.fn(), onCheck: vi.fn() }}
  /></LocaleProvider>)
  fireEvent.pointerDown(screen.getByRole("button", { name: "项目选项" }), { button: 0, ctrlKey: false })
  expect(screen.getByRole("menuitem", { name: "重命名项目" })).toBeInTheDocument()
  expect(screen.getByRole("menuitem", { name: "编辑指令" })).toBeInTheDocument()
  expect(screen.getByRole("menuitem", { name: "删除项目" })).toBeInTheDocument()
  expect(screen.queryByRole("menuitem", { name: "账户" })).toBeNull()
  expect(screen.queryByRole("menuitem", { name: "升级" })).toBeNull()
})

it("Project delete dialog names its loaded target before the existing risk explanation", async () => {
  const { WorkspaceHeaderProjectMenu } = await import("@/components/blocks/workspace-header/workspace-header-project-menu")
  const scope = {}
  render(<LocaleProvider><WorkspaceHeaderProjectMenu
    projectDelete={{ focusScopeToken: scope, targetName: "Project A", available: true, open: true, status: "idle", problem: null, frozen: false,
      onOpen: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn(), onRetry: vi.fn(), onCheck: vi.fn() }}
  /></LocaleProvider>)
  const dialog = screen.getByRole("dialog", { name: "删除项目" })
  expect(dialog).toHaveTextContent("将删除「Project A」。")
  expect(dialog).toHaveTextContent("删除项目会移除其会话和项目内容；此操作会立即从你的工作区中移除该项目。")
})

it("Project delete retires its command on a route change and ignores a late 202", async () => {
  const { useAppFrameProject } = await import("@/components/blocks/app-frame/use-app-frame-project")
  const id = "project_12345678-1234-1234-1234-123456789abc"
  const project = { id, name: "Late", slug: "late", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.history.replaceState(null, "", `/app/project/${id}`)
  let deliver: (response: Response) => void = () => { throw new Error("no pending DELETE") }
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => new Promise<Response>((resolve) => {
    deliver = resolve
    expect(init?.method).toBe("DELETE")
  }))
  const retireProject = vi.fn(); const refreshProject = vi.fn()
  const options = {
    projectRef: id, projectWorkspace: true, preview: false, mounted: true, draft: "draft", updateDraft: vi.fn(), clearDraft: vi.fn(),
    projectDetail: { status: "ready" as const, data: project }, instructionHistory: { status: "blocked" as const }, instructionContext: {},
    refreshProject, retireProject, renameBoundary: { admitted: true, subject: "reader", generation: 1 }, renameRouteKey: "delete-route",
  }
  const view = renderHook(() => useAppFrameProject(options), { wrapper: LocaleProvider })
  try {
    act(() => { view.result.current.projectDelete.onOpen(); view.result.current.projectDelete.onConfirm() })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(view.result.current.projectDelete.targetName).toBe("Late")
    window.history.pushState(null, "", "/app")
    act(() => window.dispatchEvent(new PopStateEvent("popstate")))
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(view.result.current.projectDelete.targetName).toBe("")
    await act(async () => {
      deliver(Response.json({ data: { project_id: id, logical_release_state: "pending", physical_cleanup_state: "pending" } }, {
        status: 202, headers: { "cache-control": "private, no-store, max-age=0" },
      }))
      await Promise.resolve()
    })
    expect(retireProject).not.toHaveBeenCalled()
    expect(refreshProject).not.toHaveBeenCalled()
  } finally { view.unmount(); fetchMock.mockRestore(); window.history.replaceState(null, "", originalUrl) }
})

it("Project delete keeps an untyped 400/403/409 outcome and its original command recoverable", async () => {
  const { deleteProject } = await import("@/features/app/project-delete")
  const { useAppFrameProject } = await import("@/components/blocks/app-frame/use-app-frame-project")
  const id = "project_12345678-1234-1234-1234-123456789abc"
  const intent = { projectId: id, idempotencyKey: "original-key", body: null as null }
  const malformed = (status: number) => Response.json({ error: { code: "untyped_owner_error", message: "untrusted", retryable: false } }, {
    status, headers: { "cache-control": "private, no-store, max-age=0" },
  })
  const fetchMock = vi.spyOn(globalThis, "fetch")
  fetchMock.mockResolvedValueOnce(malformed(400)).mockResolvedValueOnce(malformed(403)).mockResolvedValueOnce(malformed(409))
  try {
    for (const status of [400, 403, 409]) {
      await expect(deleteProject(intent, new AbortController().signal)).rejects.toMatchObject({ code: "unexpected_status", status })
    }
    const project = { id, name: "Delete me", slug: "delete-me", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
    const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    window.history.replaceState(null, "", `/app/project/${id}`)
    fetchMock.mockResolvedValueOnce(malformed(403)).mockResolvedValueOnce(Response.json({ data: { project_id: id, logical_release_state: "pending", physical_cleanup_state: "pending" } }, {
      status: 202, headers: { "cache-control": "private, no-store, max-age=0" },
    }))
    const retireProject = vi.fn()
    const view = renderHook(() => useAppFrameProject({
      projectRef: id, projectWorkspace: true, preview: false, mounted: true, draft: "draft", updateDraft: vi.fn(), clearDraft: vi.fn(),
      projectDetail: { status: "ready" as const, data: project }, instructionHistory: { status: "blocked" as const }, instructionContext: {},
      refreshProject: vi.fn(), retireProject, renameBoundary: { admitted: true, subject: "reader", generation: 1 }, renameRouteKey: "delete-route",
    }), { wrapper: LocaleProvider })
    try {
      act(() => { view.result.current.projectDelete.onOpen(); view.result.current.projectDelete.onConfirm() })
      await waitFor(() => expect(view.result.current.projectDelete.problem).toBe("unknown"))
      expect(view.result.current.projectDelete.available).toBe(true)
      act(() => view.result.current.projectDelete.onRetry())
      await waitFor(() => expect(retireProject).toHaveBeenCalledWith(id))
      const writes = fetchMock.mock.calls.slice(3).map(([url, init]) => ({ url, key: new Headers(init?.headers).get("idempotency-key"), body: init?.body }))
      expect(writes).toEqual([
        { url: `/api/hub/projects/${id}`, key: expect.any(String), body: undefined },
        { url: `/api/hub/projects/${id}`, key: writes[0]?.key, body: undefined },
      ])
    } finally { view.unmount(); window.history.replaceState(null, "", originalUrl) }
  } finally { fetchMock.mockRestore() }
})

it("stable Project host retires a Skills dialog and unknown command on an actual Task route change", async () => {
  history.replaceState(null, "", `/app/project/${skillProjectId}?conversation=first-task`)
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") throw new TypeError("owner ACK unknown")
    if (url.endsWith("skill-selection")) return skillReply({ data: { project_id: skillProjectId, installation_ids: [] } })
    return skillReply({ data: [projectSkill] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const task = { projectConversationContent: <div>Task timeline</div>, projectContextVisible: true }
  const view = render(skillWorkspace(undefined, false, task))
  openProjectSkills(view.container)
  const dialog = screen.getByRole("dialog", { name: "项目技能" })
  fireEvent.click(await within(dialog).findByRole("switch", { name: "启用 Project Skill" }))
  await within(dialog).findByText("操作结果尚未确认。重试会使用原操作，不会创建新的请求。")
  view.rerender(skillWorkspace(undefined, false, { ...task, projectContextVisible: false }))
  expect(screen.queryByRole("dialog", { name: "项目技能" })).not.toBeInTheDocument()
  view.rerender(skillWorkspace(undefined, false, task))
  openProjectSkills(view.container)
  await screen.findByText("操作结果尚未确认。重试会使用原操作，不会创建新的请求。")
  fireEvent.click(screen.getByRole("button", { name: "重试原操作" }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2))
  const original = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => ({ body: init?.body, key: new Headers(init?.headers).get("Idempotency-Key") }))
  expect(original[1]).toEqual(original[0])
  act(() => { history.pushState(null, "", `/app/project/${skillProjectId}?conversation=second-task`); window.dispatchEvent(new Event("kokoro:surface-navigation")) })
  expect(screen.queryByRole("dialog", { name: "项目技能" })).not.toBeInTheDocument()
  openProjectSkills(view.container)
  await screen.findByRole("switch", { name: "启用 Project Skill" })
  expect(screen.queryByText("操作结果尚未确认。重试会使用原操作，不会创建新的请求。")).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2)
  history.replaceState(null, "", "/app")
})

import { ProjectSkillSourcePicker } from "@/features/app/project-skill-source-picker"

const sourcePickerView = (
  boundary = { admitted: true, subject: "S12-source-reader", generation: 1 },
  mode: "personal" | "official" = "personal",
  busy = false,
) => <LocaleProvider><ProjectSkillSourcePicker boundary={boundary} mode={mode} busy={busy} onBack={vi.fn()} onInstall={vi.fn()} /></LocaleProvider>

it("S12 来源 pending 仅供读屏且不伪装真实空列表", async () => {
  const pending = pendingInstructionResponse()
  vi.stubGlobal("fetch", vi.fn(() => pending.promise))
  render(sourcePickerView())
  const field = screen.getByRole("textbox")
  expect(field).toHaveAttribute("aria-busy", "true")
  expect(screen.getByRole("status")).toHaveClass("sr-only")
  expect(screen.queryByText("暂无已添加的技能")).not.toBeInTheDocument()
  await act(async () => { pending.resolve(skillReply({ data: [] })) })
  expect(field).toHaveAttribute("aria-busy", "false")
  expect(await screen.findByText("暂无已添加的技能")).toBeVisible()
  expect(screen.queryByRole("status")).not.toBeInTheDocument()
})

it("S12 来源失败是搜索字段提示，保query且仅Enter显式重读恢复", async () => {
  let available = false
  const queries: (string | null)[] = []
  const fetchMock = vi.fn(async (url: string) => {
    queries.push(new URL(url, "http://picker.test").searchParams.get("query"))
    if (!available) throw new TypeError("source read unavailable")
    return skillReply({ data: [{ ...projectSkill, display_name: "Recovered source" }] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const view = render(sourcePickerView())
  const field = screen.getByRole("textbox")
  await screen.findByText("我的技能暂时未能读取。按 Enter 重新读取。")
  expect(field).toHaveAccessibleDescription("我的技能暂时未能读取。按 Enter 重新读取。")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(screen.queryByText("暂无已添加的技能")).not.toBeInTheDocument()
  fireEvent.change(field, { target: { value: " needle " } })
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await screen.findByText("我的技能暂时未能读取。按 Enter 重新读取。")
  fireEvent.keyDown(field, { key: "Enter", isComposing: true })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  view.rerender(sourcePickerView(undefined, "personal", true))
  fireEvent.keyDown(field, { key: "Enter" })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  view.rerender(sourcePickerView())
  available = true
  fireEvent.keyDown(field, { key: "Enter" })
  await screen.findByRole("heading", { name: "Recovered source" })
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(queries).toEqual([null, "needle", "needle"])
  expect(field).toHaveValue(" needle ")
  expect(field).not.toHaveAttribute("aria-describedby")
  expect(screen.queryByText("我的技能暂时未能读取。按 Enter 重新读取。")).not.toBeInTheDocument()
})

it("S12 来源搜索替换与关闭abort拒绝迟到结果，不覆盖query", async () => {
  const reads: { signal: AbortSignal; resolve: (response: Response) => void }[] = []
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
    reads.push({ signal: init?.signal as AbortSignal, resolve })
  })))
  const view = render(sourcePickerView())
  const field = screen.getByRole("textbox")
  await waitFor(() => expect(reads).toHaveLength(1))
  fireEvent.change(field, { target: { value: "old" } })
  await waitFor(() => expect(reads).toHaveLength(2))
  fireEvent.change(field, { target: { value: "new" } })
  await waitFor(() => expect(reads).toHaveLength(3))
  expect(reads[0]?.signal.aborted).toBe(true)
  expect(reads[1]?.signal.aborted).toBe(true)
  await act(async () => { reads[2]?.resolve(skillReply({ data: [{ ...projectSkill, display_name: "Current source" }] })) })
  await screen.findByRole("heading", { name: "Current source" })
  await act(async () => { reads[1]?.resolve(skillReply({ data: [{ ...projectSkill, display_name: "Late old source" }] })) })
  expect(screen.queryByText("Late old source")).not.toBeInTheDocument()
  expect(field).toHaveValue("new")
  fireEvent.change(field, { target: { value: "close" } })
  await waitFor(() => expect(reads).toHaveLength(4))
  view.unmount()
  expect(reads[3]?.signal.aborted).toBe(true)
  await act(async () => { reads[3]?.resolve(skillReply({ data: [{ ...projectSkill, display_name: "Late closed source" }] })) })
  expect(screen.queryByText("Late closed source")).not.toBeInTheDocument()
  await act(async () => { reads[0]?.resolve(skillReply({ data: [] })) })
})

it("S12 来源actor与代际核验同步清私有结果且晚B不复活到新A", async () => {
  const reads: { signal: AbortSignal; resolve: (response: Response) => void }[] = []
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
    reads.push({ signal: init?.signal as AbortSignal, resolve })
  })))
  const view = render(sourcePickerView())
  await waitFor(() => expect(reads).toHaveLength(1))
  await act(async () => { reads[0]?.resolve(skillReply({ data: [{ ...projectSkill, display_name: "Private source A" }] })) })
  await screen.findByRole("heading", { name: "Private source A" })
  view.rerender(sourcePickerView({ admitted: false, subject: "S12-source-reader", generation: 2 }))
  expect(screen.queryByText("Private source A")).not.toBeInTheDocument()
  expect(reads).toHaveLength(1)
  view.rerender(sourcePickerView({ admitted: true, subject: "S12-source-B", generation: 3 }))
  await waitFor(() => expect(reads).toHaveLength(2))
  view.rerender(sourcePickerView({ admitted: true, subject: "S12-source-reader", generation: 4 }))
  await waitFor(() => expect(reads).toHaveLength(3))
  expect(reads[1]?.signal.aborted).toBe(true)
  await act(async () => { reads[2]?.resolve(skillReply({ data: [{ ...projectSkill, display_name: "Fresh source A" }] })) })
  await screen.findByRole("heading", { name: "Fresh source A" })
  await act(async () => { reads[1]?.resolve(skillReply({ data: [{ ...projectSkill, display_name: "Private source B" }] })) })
  expect(screen.queryByText("Private source B")).not.toBeInTheDocument()
  expect(screen.queryByText("Private source A")).not.toBeInTheDocument()
})

it("S12 官方失败提示不当空列表，来源切换不带入个人结果", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("ListSkills")) return skillReply({ officialSkills: [], userAddedSkills: [] })
    if (url.endsWith("ListHubSkills")) throw new TypeError("official read unavailable")
    return skillReply({ data: [{ ...projectSkill, display_name: "Personal source only" }] })
  })
  vi.stubGlobal("fetch", fetchMock)
  const boundary = { admitted: true, subject: "S12-source-modes", generation: 1 }
  const view = render(sourcePickerView(boundary))
  await screen.findByRole("heading", { name: "Personal source only" })
  view.rerender(sourcePickerView(boundary, "official"))
  expect(screen.queryByText("Personal source only")).not.toBeInTheDocument()
  await screen.findByText("官方技能暂时未能读取。按 Enter 重新读取。")
  expect(screen.getByRole("textbox")).toHaveAccessibleDescription("官方技能暂时未能读取。按 Enter 重新读取。")
  expect(screen.queryByText("暂无已添加的技能")).not.toBeInTheDocument()
})
