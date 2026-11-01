import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  ScheduledTaskSurface,
  type ScheduledTaskClient,
  type ScheduledTaskRecord,
} from "@/features/scheduled-tasks"
import { LocaleProvider } from "@/i18n/context"

const activeTask: ScheduledTaskRecord = { triggerKind: "calendar" as const,
  id: "scheduled_a",
  title: "Task A",
  prompt: "Run A",
  frequency: "daily",
  time: "08:00",
  timezone: "UTC",
  enabled: true,
  status: "active",
}

function completeClient(overrides: Partial<ScheduledTaskClient> = {}): ScheduledTaskClient {
  const unavailable = async (): Promise<never> => { throw new Error("operation not configured") }
  return {
    listScheduledTasks: unavailable,
    createScheduledTask: unavailable,
    updateScheduledTask: unavailable,
    retryScheduledTask: unavailable,
    deleteScheduledTask: unavailable,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.removeItem("kokoro.preview.scheduled-tasks")
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("selects preview, live, and controlled sources explicitly without a live-to-preview fallback", async () => {
  window.localStorage.setItem("kokoro.preview.scheduled-tasks", JSON.stringify([{ ...activeTask, title: "Fixture task" }]))
  const listScheduledTasks = vi.fn().mockRejectedValue(new Error("BFF unavailable"))
  const { rerender } = render(
    <LocaleProvider><ScheduledTaskSurface mode="preview" brandName="Kokoro" /></LocaleProvider>,
  )
  expect(await screen.findByText("Fixture task")).toBeInTheDocument()

  rerender(
    <LocaleProvider>
      <ScheduledTaskSurface mode="live" brandName="Kokoro" scheduledTaskClient={completeClient({ listScheduledTasks })} />
    </LocaleProvider>,
  )
  await waitFor(() => expect(screen.getByTestId("scheduled-load-error")).toBeInTheDocument())
  expect(screen.queryByText("Fixture task")).not.toBeInTheDocument()

  rerender(
    <LocaleProvider>
      <ScheduledTaskSurface mode="controlled" brandName="Kokoro" tasks={[{ ...activeTask, title: "Controlled task" }]} />
    </LocaleProvider>,
  )
  expect(await screen.findByText("Controlled task")).toBeInTheDocument()
})

it("rejects illegal controlled-plus-live and preview-plus-live combinations", () => {
  const client = completeClient({ listScheduledTasks: vi.fn().mockResolvedValue([]) })

  expect(() => render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="controlled" brandName="Kokoro" tasks={[activeTask]} scheduledTaskClient={client} />
    </LocaleProvider>,
  )).toThrow(/ScheduledTask mode/u)
  expect(() => render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="preview" brandName="Kokoro" scheduledTaskClient={client} />
    </LocaleProvider>,
  )).toThrow(/ScheduledTask mode/u)
})

it("does not disguise retry as update when controlled mode has no retry command", async () => {
  const onUpdateTask = vi.fn().mockResolvedValue(undefined)
  render(
    <LocaleProvider>
      <ScheduledTaskSurface
        mode="controlled"
        brandName="Kokoro"
        tasks={[{ ...activeTask, status: "failed", enabled: false }]}
        onUpdateTask={onUpdateTask}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 Task A" }))

  expect(await screen.findByRole("menuitem", { name: "重试" })).toHaveAttribute("aria-disabled", "true")
  fireEvent.click(screen.getByRole("menuitem", { name: "重试" }))
  expect(onUpdateTask).not.toHaveBeenCalled()
})

it("uses one global mutation lock so task A cannot be unlocked by a concurrent task B", async () => {
  let resolveUpdate: (() => void) | undefined
  const onUpdateTask = vi.fn(() => new Promise<void>((resolve) => { resolveUpdate = resolve }))
  const taskB = { ...activeTask, id: "scheduled_b", title: "Task B" }
  render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="controlled" brandName="Kokoro" tasks={[activeTask, taskB]} onUpdateTask={onUpdateTask} />
    </LocaleProvider>,
  )

  const [cardA, cardB] = await screen.findAllByRole("listitem")
  if (!cardA || !cardB) throw new Error("expected two scheduled task cards")
  fireEvent.pointerDown(within(cardA).getByRole("button", { name: "排程任务选项 Task A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))

  await waitFor(() => expect(cardA).toHaveAttribute("aria-busy", "true"))
  expect(within(cardB).getByRole("button", { name: "排程任务选项 Task B" })).toBeDisabled()
  fireEvent.pointerDown(within(cardB).getByRole("button", { name: "排程任务选项 Task B" }))
  expect(onUpdateTask).toHaveBeenCalledTimes(1)

  resolveUpdate?.()
  await waitFor(() => expect(cardA).not.toHaveAttribute("aria-busy", "true"))
})

it("keeps a failed delete alert inside the open confirmation dialog", async () => {
  const onDeleteTask = vi.fn().mockRejectedValue(new Error("delete unavailable"))
  render(
    <LocaleProvider>
      <ScheduledTaskSurface mode="controlled" brandName="Kokoro" tasks={[activeTask]} onDeleteTask={onDeleteTask} />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 Task A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
  const dialog = screen.getByRole("alertdialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "删除" }))

  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("操作失败，请重试。"))
  expect(dialog).toBeInTheDocument()
  expect(within(card).queryByRole("alert")).not.toBeInTheDocument()
})


const scopeA = "project_11111111-1111-1111-1111-111111111111"
const scopeB = "project_22222222-2222-2222-2222-222222222222"
function scopedRecords(): ScheduledTaskRecord[] {
  const nextRun = `${new Date().toISOString().slice(0, 7)}-15T08:00:00.000Z`
  return [
    { ...activeTask, id: "scope-a", title: "Scoped A", projectId: scopeA, nextRun },
    { ...activeTask, id: "scope-b", title: "Scoped B", projectId: scopeB, nextRun },
    { ...activeTask, id: "scope-personal", title: "Personal task", nextRun },
  ]
}
function navigateScope(search: string, hash = "") {
  window.history.pushState(null, "", `/app/scheduled?${search}${hash}`)
  fireEvent(window, new Event("kokoro:surface-navigation"))
}

it("project scope isolates list, calendar and edit targets while the unscoped view retains all tasks", async () => {
  navigateScope(`project_id=${scopeA}&tab=list`)
  const onUpdateTask = vi.fn().mockResolvedValue(undefined)
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={scopedRecords()} displayTimezone="UTC" onUpdateTask={onUpdateTask} /></LocaleProvider>)
  expect(screen.getByText("Scoped A")).toBeInTheDocument()
  expect(screen.queryByText("Scoped B")).toBeNull()
  expect(screen.queryByText("Personal task")).toBeNull()
  expect(screen.getAllByRole("listitem")).toHaveLength(1)
  expect(screen.getByRole("link", { name: "返回项目" })).toHaveAttribute("href", `/app/project/${scopeA}`)

  navigateScope(`project_id=${scopeB}&tab=calendar`)
  const calendar = screen.getByTestId("scheduled-calendar-view")
  expect(within(calendar).queryByRole("button", { name: /Scoped A/ })).toBeNull()
  expect(within(calendar).queryByRole("button", { name: /Personal task/ })).toBeNull()
  fireEvent.click(within(calendar).getByRole("button", { name: /Scoped B/ }))
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue("Scoped B")
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "Edited B" } })
  const historyClosed = new Promise<PopStateEvent>((resolve) => window.addEventListener("popstate", resolve, { once: true }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onUpdateTask).toHaveBeenCalledOnce())
  expect(onUpdateTask).toHaveBeenCalledWith("scope-b", expect.objectContaining({ title: "Edited B" }))
  expect(onUpdateTask.mock.calls[0]?.[1]).not.toHaveProperty("projectId")
  expect(onUpdateTask.mock.calls[0]?.[1]).not.toHaveProperty("project_id")
  await historyClosed
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  navigateScope("tab=list")
  expect(screen.getAllByRole("listitem")).toHaveLength(3)
  expect(screen.getByText("Personal task")).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "返回项目" })).toBeNull()
})

it.each(["project_id=", "project_id=%20project-a", "project_id=a&project_id=a", "project_id=%E0%A4%A"])("project scope fails closed for invalid %s without showing or mutating unrelated tasks", (search) => {
  navigateScope(`${search}&tab=list`)
  const onSave = vi.fn()
  const onUpdateTask = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={scopedRecords()} onSave={onSave} onUpdateTask={onUpdateTask} /></LocaleProvider>)
  expect(screen.queryByRole("listitem")).toBeNull()
  expect(screen.getByRole("alert")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /建立您的排程任务/ })).toBeDisabled()
  expect(onSave).not.toHaveBeenCalled()
  expect(onUpdateTask).not.toHaveBeenCalled()
})

it("project scope retains exact noncanonical references without guessing a return route", () => {
  navigateScope("project_id=project%2F%E7%9C%9F%E5%AE%9E&tab=list")
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[...scopedRecords(), { ...activeTask, id: "exact", title: "Exact reference", projectId: "project/真实" }]} /></LocaleProvider>)
  expect(screen.getAllByRole("listitem")).toHaveLength(1)
  expect(screen.getByText("Exact reference")).toBeInTheDocument()
  expect(screen.queryByRole("link", { name: "返回项目" })).toBeNull()
})

it("project scope replaces an old edit draft and delete intent when the same route changes project", async () => {
  navigateScope(`project_id=${scopeA}&tab=list`)
  const onUpdateTask = vi.fn()
  const onDeleteTask = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={scopedRecords()} onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask} /></LocaleProvider>)
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Scoped A")
  navigateScope(`project_id=${scopeB}&tab=list`)
  expect(screen.queryByRole("alertdialog")).toBeNull()
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped B" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "Private B draft" } })
  navigateScope(`project_id=${scopeA}&tab=list`, "#scheduled-tasks/new")
  await waitFor(() => expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue(""))
  expect(screen.queryByText("Scoped B")).toBeNull()
  expect(onUpdateTask).not.toHaveBeenCalled()
  expect(onDeleteTask).not.toHaveBeenCalled()
})

it("project scope retires a late old read instead of exposing it after an in-place project change", async () => {
  const { act } = await import("@testing-library/react")
  let finishOld: ((tasks: readonly ScheduledTaskRecord[]) => void) | undefined
  const listScheduledTasks = vi.fn()
    .mockImplementationOnce(() => new Promise<readonly ScheduledTaskRecord[]>((resolve) => { finishOld = resolve }))
    .mockResolvedValueOnce(scopedRecords())
  navigateScope(`project_id=${scopeA}&tab=list`)
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={completeClient({ listScheduledTasks })} displayTimezone="UTC" /></LocaleProvider>)
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledOnce())
  navigateScope(`project_id=${scopeB}&tab=list`)
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2))
  expect(await screen.findByText("Scoped B")).toBeInTheDocument()
  expect(screen.queryByText("Scoped A")).toBeNull()
  await act(async () => finishOld?.([{ ...activeTask, title: "Late private A", projectId: scopeA }]))
  expect(screen.getByText("Scoped B")).toBeInTheDocument()
  expect(screen.queryByText("Late private A")).toBeNull()
})


it.each(["project", "personal", "invalid"] as const)("project scope does not deliver a late create receipt into a new %s editor", async (target) => {
  const { act } = await import("@testing-library/react")
  let finishCreate: ((task: ScheduledTaskRecord) => void) | undefined
  const listScheduledTasks = vi.fn().mockResolvedValue([])
  const createScheduledTask = vi.fn(() => new Promise<ScheduledTaskRecord>((resolve) => { finishCreate = resolve }))
  navigateScope(`project_id=${scopeA}&tab=list`, "#scheduled-tasks/new")
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={completeClient({ listScheduledTasks, createScheduledTask })} /></LocaleProvider>)
  const original = await screen.findByRole("dialog")
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledOnce())
  fireEvent.change(within(original).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "A pending create" } })
  fireEvent.change(within(original).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "Only A" } })
  fireEvent.click(within(original).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(createScheduledTask).toHaveBeenCalledOnce())
  expect(createScheduledTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: scopeA, title: "A pending create" }))
  const search = target === "project" ? `project_id=${scopeB}&tab=list` : target === "invalid" ? "project_id=&tab=list" : "tab=list"
  navigateScope(search, "#scheduled-tasks/new")
  const current = screen.getByRole("dialog")
  const title = within(current).getByRole("textbox", { name: "未读邮件摘要" })
  await waitFor(() => expect(title).toHaveValue(""))
  if (target === "invalid") {
    expect(within(current).getByRole("button", { name: "保存" })).toBeDisabled()
    expect(within(current).getByRole("alert")).toBeInTheDocument()
  } else {
    fireEvent.change(title, { target: { value: "Current private draft" } })
    await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(2))
  }
  const readCount = listScheduledTasks.mock.calls.length
  await act(async () => finishCreate?.({ ...activeTask, id: "late-create-a", title: "A pending create", projectId: scopeA }))
  expect(screen.getByRole("dialog")).toBe(current)
  expect(title).toHaveValue(target === "invalid" ? "" : "Current private draft")
  expect(window.location.search).toBe(`?${search}`)
  expect(window.location.hash).toBe("#scheduled-tasks/new")
  expect(screen.queryByText("A pending create")).toBeNull()
  expect(createScheduledTask).toHaveBeenCalledOnce()
  expect(listScheduledTasks).toHaveBeenCalledTimes(readCount)
})

it.each(["personal", "invalid"] as const)("project scope retires an existing task edit before returning to %s", async (target) => {
  navigateScope(`project_id=${scopeA}&tab=list`)
  const onUpdateTask = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={scopedRecords()} onUpdateTask={onUpdateTask} /></LocaleProvider>)
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "Private A edit" } })
  fireEvent.change(screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "Private A prompt" } })
  navigateScope(target === "invalid" ? "project_id=&tab=list" : "tab=list", "#scheduled-tasks/new")
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue("")
  expect(within(dialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" })).toHaveValue("")
  if (target === "invalid") {
    expect(within(dialog).getByRole("alert")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled()
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  if (target === "personal") {
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText("Personal task")).toBeInTheDocument()
  } else {
    expect(screen.queryByRole("listitem")).toBeNull()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  }
  expect(onUpdateTask).not.toHaveBeenCalled()
})

it.each([
  ["pause", "project"], ["pause", "invalid"],
  ["retry", "project"], ["retry", "invalid"],
  ["delete", "project"], ["delete", "invalid"],
] as const)("project scope review does not reread after a late %s receipt into %s", async (operation, target) => {
  const { act } = await import("@testing-library/react")
  const records = scopedRecords().map((task) => task.projectId === scopeA && operation === "retry"
    ? { ...task, status: "failed" as const, enabled: false }
    : task)
  const taskA = records.find((task) => task.projectId === scopeA)
  if (!taskA) throw new Error("Project A fixture is missing")
  let finishReceipt: (() => void) | undefined
  const receipt = new Promise<void>((resolve) => { finishReceipt = resolve })
  const listScheduledTasks = vi.fn().mockResolvedValue(records)
  const updateScheduledTask = vi.fn(async () => { await receipt; return { ...taskA, status: "paused" as const, enabled: false } })
  const retryScheduledTask = vi.fn(async () => { await receipt; return { ...taskA, status: "active" as const, enabled: true } })
  const deleteScheduledTask = vi.fn(async () => { await receipt; return { ok: true as const } })
  navigateScope(`project_id=${scopeA}&tab=list`)
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={completeClient({ listScheduledTasks, updateScheduledTask, retryScheduledTask, deleteScheduledTask })} /></LocaleProvider>)
  const card = await screen.findByRole("listitem")
  expect(listScheduledTasks).toHaveBeenCalledOnce()
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: operation === "pause" ? "暂停" : operation === "retry" ? "重试" : "删除" }))
  if (operation === "delete") {
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除" }))
    await waitFor(() => expect(deleteScheduledTask).toHaveBeenCalledExactlyOnceWith("scope-a"))
  } else if (operation === "pause") {
    await waitFor(() => expect(updateScheduledTask).toHaveBeenCalledExactlyOnceWith("scope-a", { enabled: false, status: "paused" }))
  } else {
    await waitFor(() => expect(retryScheduledTask).toHaveBeenCalledExactlyOnceWith("scope-a"))
  }
  navigateScope(target === "project" ? `project_id=${scopeB}&tab=list` : "project_id=&tab=list")
  if (target === "project") {
    expect(await screen.findByText("Scoped B")).toBeInTheDocument()
    expect(listScheduledTasks).toHaveBeenCalledTimes(2)
  } else {
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(listScheduledTasks).toHaveBeenCalledOnce()
  }
  expect(screen.queryByRole("alertdialog")).toBeNull()
  const readsBeforeOldReceipt = listScheduledTasks.mock.calls.length
  await act(async () => { finishReceipt?.(); await receipt })
  expect(listScheduledTasks).toHaveBeenCalledTimes(readsBeforeOldReceipt)
  expect(screen.queryByText("Scoped A")).toBeNull()
  expect(updateScheduledTask).toHaveBeenCalledTimes(operation === "pause" ? 1 : 0)
  expect(retryScheduledTask).toHaveBeenCalledTimes(operation === "retry" ? 1 : 0)
  expect(deleteScheduledTask).toHaveBeenCalledTimes(operation === "delete" ? 1 : 0)
  if (target === "project") expect(screen.getByText("Scoped B")).toBeInTheDocument()
  else expect(screen.getByRole("button", { name: "建立您的排程任务" })).toBeDisabled()
})

it("project scope review keeps a newly created preview task in its project list and calendar and in the all-tasks view", async () => {
  const onSave = vi.fn()
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Preview must not use business HTTP"))
  window.localStorage.setItem("kokoro.preview.scheduled-tasks", JSON.stringify(scopedRecords().filter((task) => task.projectId !== scopeA)))
  navigateScope(`project_id=${scopeA}&tab=list`, "#scheduled-tasks/new")
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" displayTimezone="UTC" onSave={onSave} /></LocaleProvider>)
  const dialog = screen.getByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "Created in project A" } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "Keep the project association" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  const card = await screen.findByRole("listitem")
  expect(card).toHaveTextContent("Created in project A")
  expect(screen.queryByText("Scoped B")).toBeNull()
  expect(screen.queryByText("Personal task")).toBeNull()
  expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: scopeA, title: "Created in project A" }))
  const stored: unknown = JSON.parse(window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "null")
  expect(stored).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Created in project A", projectId: scopeA })]))
  navigateScope(`project_id=${scopeA}&tab=calendar`)
  const calendar = screen.getByTestId("scheduled-calendar-view")
  // A daily preview created on the last day of a month can next run in the following month.
  if (Array.isArray(stored)) {
    const created: unknown = stored.find((task: ScheduledTaskRecord) => task.title === "Created in project A")
    if (typeof created === "object" && created !== null && "nextRun" in created && typeof created.nextRun === "string") {
      const next = new Date(created.nextRun)
      const now = new Date()
      if (next.getUTCMonth() !== now.getUTCMonth() || next.getUTCFullYear() !== now.getUTCFullYear()) {
        fireEvent.click(within(calendar).getByRole("button", { name: "下个月" }))
      }
    }
  }
  expect(within(calendar).getByRole("button", { name: /Created in project A/ })).toBeInTheDocument()
  expect(within(calendar).queryByRole("button", { name: /Scoped B|Personal task/ })).toBeNull()
  navigateScope(`project_id=${scopeB}&tab=list`)
  expect(screen.getAllByRole("listitem")).toHaveLength(1)
  expect(screen.getByText("Scoped B")).toBeInTheDocument()
  expect(screen.queryByText("Created in project A")).toBeNull()
  navigateScope("tab=list")
  expect(screen.getAllByRole("listitem")).toHaveLength(3)
  expect(screen.getByText("Created in project A")).toBeInTheDocument()
  expect(screen.getByText("Personal task")).toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

it("project scope review keeps Strict Mode reads usable while retiring replaced clients and withdrawn generations", async () => {
  const { StrictMode } = await import("react")
  const { act } = await import("@testing-library/react")
  const records = scopedRecords()
  const taskA = records.find((task) => task.projectId === scopeA)
  if (!taskA) throw new Error("Project A fixture is missing")
  let finishOld: (() => void) | undefined
  let finishWithdrawn: (() => void) | undefined
  const oldReceipt = new Promise<void>((resolve) => { finishOld = resolve })
  const withdrawnReceipt = new Promise<void>((resolve) => { finishWithdrawn = resolve })
  const oldList = vi.fn().mockResolvedValue(records)
  const oldUpdate = vi.fn(async () => { await oldReceipt; return taskA })
  const oldClient = completeClient({ listScheduledTasks: oldList, updateScheduledTask: oldUpdate })
  const newList = vi.fn().mockResolvedValue(records)
  const newUpdate = vi.fn()
    .mockImplementationOnce(async () => { await withdrawnReceipt; return taskA })
    .mockResolvedValue(taskA)
  const newClient = completeClient({ listScheduledTasks: newList, updateScheduledTask: newUpdate })
  const view = ({ client, admitted, generation }: Readonly<{ client: ScheduledTaskClient; admitted: boolean; generation: number }>) => (
    <StrictMode><LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={client} projectReadBoundary={{ subject: "scope-owner", admitted, generation }} /></LocaleProvider></StrictMode>
  )
  navigateScope(`project_id=${scopeA}&tab=list`)
  const { rerender } = render(view({ client: oldClient, admitted: true, generation: 1 }))
  expect(await screen.findByText("Scoped A")).toBeInTheDocument()
  expect(oldList).toHaveBeenCalledOnce()
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))
  await waitFor(() => expect(oldUpdate).toHaveBeenCalledOnce())
  rerender(view({ client: newClient, admitted: true, generation: 1 }))
  await waitFor(() => expect(newList).toHaveBeenCalledOnce())
  await act(async () => { finishOld?.(); await oldReceipt })
  expect(oldList).toHaveBeenCalledOnce()
  expect(newList).toHaveBeenCalledOnce()
  await waitFor(() => expect(screen.getByRole("button", { name: "排程任务选项 Scoped A" })).toBeEnabled())
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))
  await waitFor(() => expect(newUpdate).toHaveBeenCalledOnce())
  rerender(view({ client: newClient, admitted: false, generation: 2 }))
  await act(async () => { finishWithdrawn?.(); await withdrawnReceipt })
  expect(newList).toHaveBeenCalledOnce()
  expect(screen.getByRole("button", { name: "建立您的排程任务" })).toBeDisabled()
  rerender(view({ client: newClient, admitted: true, generation: 2 }))
  await waitFor(() => expect(newList).toHaveBeenCalledTimes(2))
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))
  await waitFor(() => expect(newUpdate).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(newList).toHaveBeenCalledTimes(3))
})

it("project scope review preserves preview ownership when editing a project task from the all-tasks view", async () => {
  window.localStorage.setItem("kokoro.preview.scheduled-tasks", JSON.stringify(scopedRecords()))
  navigateScope("tab=list")
  const onUpdateTask = vi.fn()
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Preview must not use business HTTP"))
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" onUpdateTask={onUpdateTask} /></LocaleProvider>)
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 Scoped A" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "Updated A in all tasks" } })
  const historyClosed = new Promise<PopStateEvent>((resolve) => window.addEventListener("popstate", resolve, { once: true }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onUpdateTask).toHaveBeenCalledOnce())
  await historyClosed
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(onUpdateTask.mock.calls[0]?.[1]).not.toHaveProperty("projectId")
  expect(onUpdateTask.mock.calls[0]?.[1]).not.toHaveProperty("project_id")
  navigateScope(`project_id=${scopeA}&tab=list`)
  expect(screen.getAllByRole("listitem")).toHaveLength(1)
  expect(screen.getByText("Updated A in all tasks")).toBeInTheDocument()
  expect(JSON.parse(window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "null")).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "scope-a", projectId: scopeA, title: "Updated A in all tasks" }),
  ]))
  navigateScope(`project_id=${scopeB}&tab=list`)
  expect(screen.getByText("Scoped B")).toBeInTheDocument()
  expect(screen.queryByText("Updated A in all tasks")).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})

it("automation overview distinguishes three types and keeps unsupported actions inert with visible reasons", () => {
  window.localStorage.setItem("kokoro.locale", "en")
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Overview must not use business HTTP"))
  const onSave = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[]} onSave={onSave} /></LocaleProvider>)
  const types = screen.getByRole("list", { name: "Automation types" })
  const cards = within(types).getAllByRole("listitem")
  expect(cards).toHaveLength(3)
  expect(within(types).getByRole("heading", { level: 3, name: "Scheduled tasks" })).toBeInTheDocument()
  expect(within(types).getByText("Choose when and how often Kokoro runs a task.")).toBeVisible()
  expect(within(types).getByRole("button", { name: "Create your scheduled task" })).toBeEnabled()
  expect(within(types).getByRole("heading", { level: 3, name: "Triggers" })).toBeInTheDocument()
  expect(within(types).getByText("Run when a public RSS feed has new entries matching your conditions.")).toBeVisible()
  expect(within(types).getByRole("heading", { level: 3, name: "Advanced automation" })).toBeInTheDocument()
  expect(within(types).getByText("Beta", { exact: true })).toBeVisible()
  expect(within(types).getByText("Describe the conditions and steps for an automation in natural language.")).toBeVisible()
  const unavailableActions: readonly (readonly [name: string, reason: string])[] = [
    ["Describe automation", "Advanced automation is not connected yet. Creating or running it is unavailable."],
  ]
  for (const [name, reason] of unavailableActions) {
    const action = within(types).getByRole("button", { name })
    expect(action).toBeDisabled()
    expect(action).toHaveAccessibleDescription(reason)
    expect(within(types).getByText(reason)).toBeVisible()
    fireEvent.click(action)
  }
  const trigger = within(types).getByRole("button", { name: "Create trigger" })
  expect(trigger).toBeEnabled()
  fireEvent.click(trigger)
  expect(window.location.pathname + window.location.search).toBe("/app?workflow=automation")
  expect(screen.getByRole("heading", { name: "Automation workflow" })).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(window.location.hash).toBe("")
  expect(window.localStorage.getItem("kokoro.preview.scheduled-tasks")).toBeNull()
})

it.each([
  "Set up automated monitoring for any topic, competitor, or keyword.",
  "Get a daily digest of your inbox and calendar before the day begins.",
  "Turn a manual workflow into a scheduled automation pipeline.",
])("automation overview retains the project-scoped suggestion prefill: %s", async (prompt) => {
  window.localStorage.setItem("kokoro.locale", "en")
  navigateScope(`project_id=${scopeA}&tab=list`)
  const onSave = vi.fn()
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Preview must not use business HTTP"))
  render(<LocaleProvider><ScheduledTaskSurface mode="preview" onSave={onSave} /></LocaleProvider>)
  expect(screen.getByRole("heading", { level: 3, name: "Scheduled tasks" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: prompt }))
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByRole("textbox", { name: "Summarize unread email and highlight important messages" })).toHaveValue(prompt)
  expect(within(dialog).getByRole("textbox", { name: "Unread email summary" })).toHaveValue("")
  expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
  expect(window.location.hash).toBe("#scheduled-tasks/new")
  expect(new URLSearchParams(window.location.search).get("project_id")).toBe(scopeA)
  const historyClosed = new Promise<PopStateEvent>((resolve) => window.addEventListener("popstate", resolve, { once: true }))
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
  await historyClosed
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(onSave).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
  expect(window.localStorage.getItem("kokoro.preview.scheduled-tasks")).toBeNull()
})

it("automation overview starts the existing live scheduled creation with the exact project and no unsupported command", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  navigateScope(`project_id=${scopeA}&tab=list`)
  const created = { ...activeTask, id: "overview-created", title: "Overview project task", prompt: "Use the existing scheduled flow", projectId: scopeA }
  const listScheduledTasks = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([created])
  const createScheduledTask = vi.fn().mockResolvedValue(created)
  const updateScheduledTask = vi.fn()
  const retryScheduledTask = vi.fn()
  const deleteScheduledTask = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface
    mode="live"
    scheduledTaskClient={completeClient({ listScheduledTasks, createScheduledTask, updateScheduledTask, retryScheduledTask, deleteScheduledTask })}
    projectReadBoundary={{ subject: "overview-viewer", admitted: true, generation: 1 }}
  /></LocaleProvider>)
  const types = await screen.findByRole("list", { name: "Automation types" })
  fireEvent.click(within(types).getByRole("button", { name: "Create your scheduled task" }))
  const dialog = screen.getByRole("dialog")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Unread email summary" }), { target: { value: created.title } })
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Summarize unread email and highlight important messages" }), { target: { value: created.prompt } })
  const historyClosed = new Promise<PopStateEvent>((resolve) => window.addEventListener("popstate", resolve, { once: true }))
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
  await waitFor(() => expect(createScheduledTask).toHaveBeenCalledOnce())
  expect(createScheduledTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: scopeA, title: created.title, prompt: created.prompt }))
  await historyClosed
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  expect(await screen.findByText(created.title)).toBeInTheDocument()
  expect(listScheduledTasks).toHaveBeenCalledTimes(2)
  expect(updateScheduledTask).not.toHaveBeenCalled()
  expect(retryScheduledTask).not.toHaveBeenCalled()
  expect(deleteScheduledTask).not.toHaveBeenCalled()
})

it("I1 starts the inline home workflow from the overview while retaining the exact project scope", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", `/app/scheduled?project_id=${scopeA}`)
  const listScheduledTasks = vi.fn().mockResolvedValue([])
  const createScheduledTask = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={completeClient({ listScheduledTasks, createScheduledTask })} projectReadBoundary={{ admitted: true, subject: "Alice", generation: 1 }} /></LocaleProvider>)
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(1))
  const start = screen.getByRole("link", { name: "Get started" })
  const destination = new URL(start.getAttribute("href") ?? "", window.location.origin)
  expect(destination.pathname).toBe("/app")
  expect(destination.searchParams.get("workflow")).toBe("automation")
  expect(destination.searchParams.getAll("project_id")).toEqual([scopeA])
  fireEvent.click(start)
  expect(window.location.pathname).toBe("/app")
  expect(screen.getByRole("heading", { name: "Automation workflow", level: 1 })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Choose how to start" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  expect(screen.getByRole("form", { name: "Create scheduled automation" })).toBeInTheDocument()
  expect(screen.getByLabelText("Select time")).toHaveValue("10:00")
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(createScheduledTask).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("link", { name: "Back to automations" }))
  expect(window.location.pathname).toBe("/app/scheduled")
  expect(new URLSearchParams(window.location.search).getAll("project_id")).toEqual([scopeA])
})

it("I1 keeps unsupported start types and settings unavailable without issuing commands", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", "/app?workflow=automation")
  const listScheduledTasks = vi.fn().mockResolvedValue([])
  const createScheduledTask = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={completeClient({ listScheduledTasks, createScheduledTask })} projectReadBoundary={{ admitted: true, subject: "Alice", generation: 1 }} /></LocaleProvider>)
  await waitFor(() => expect(listScheduledTasks).toHaveBeenCalledTimes(1))
  const reads = listScheduledTasks.mock.calls.length
  for (const [name, reason] of [
    ["Advanced automation", "Advanced automation is not connected yet. Creating or running it is unavailable."],
  ] as const) {
    const action = screen.getByRole("button", { name })
    expect(action).toBeDisabled()
    expect(action).toHaveAccessibleDescription(reason)
    expect(screen.getByText(reason)).toBeVisible()
    fireEvent.click(action)
  }
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  fireEvent.click(screen.getByRole("button", { name: "Automation settings" }))
  for (const name of ["Agent", "Connectors", "Independent task", "Cloud computer", "Local folder"]) {
    const action = screen.getByRole("button", { name })
    expect(action).toBeDisabled()
    expect(action).toHaveAccessibleDescription(/not available|not connected/i)
    fireEvent.click(action)
  }
  expect(createScheduledTask).not.toHaveBeenCalled()
  expect(listScheduledTasks).toHaveBeenCalledTimes(reads)
  expect(screen.queryByText("Automation created")).toBeNull()
})

it("I1 retires inline drafts on A to B, invalid scope, and personal navigation without normalizing invalid input", () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", `/app?workflow=automation&project_id=${scopeA}`)
  const onSave = vi.fn()
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[]} onSave={onSave} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Unread email summary" }), { target: { value: "Private A draft" } })
  window.history.pushState(null, "", `/app?workflow=automation&project_id=${scopeB}`)
  fireEvent(window, new Event("kokoro:surface-navigation"))
  expect(screen.queryByDisplayValue("Private A draft")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  expect(screen.getByRole("textbox", { name: "Unread email summary" })).toHaveValue("")
  window.history.pushState(null, "", "/app?workflow=automation&project_id=A&project_id=B")
  fireEvent(window, new PopStateEvent("popstate"))
  expect(screen.getByRole("alert")).toHaveTextContent(/project scope/i)
  expect(screen.queryByRole("form")).toBeNull()
  expect(screen.queryByText("No scheduled tasks")).toBeNull()
  window.history.pushState(null, "", "/app?workflow=automation")
  fireEvent(window, new Event("kokoro:surface-navigation"))
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  expect(screen.getByRole("textbox", { name: "Unread email summary" })).toHaveValue("")
  expect(onSave).not.toHaveBeenCalled()
})

it("I1 retains the three original overview suggestions as project-scoped dialog prefills", () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", `/app/scheduled?project_id=${scopeA}`)
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[]} onSave={vi.fn()} /></LocaleProvider>)
  const suggestion = "Get a daily digest of your inbox and calendar before the day begins."
  fireEvent.click(screen.getByRole("button", { name: suggestion }))
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByRole("textbox", { name: "Summarize unread email and highlight important messages" })).toHaveValue(suggestion)
  expect(within(dialog).getByLabelText("Select time")).toHaveValue("08:00")
  expect(new URLSearchParams(window.location.search).getAll("project_id")).toEqual([scopeA])
  expect(screen.queryByRole("form", { name: "Create scheduled automation" })).toBeNull()
})

it("I6 UI RSS trigger opens the inline feed form without calendar controls or commands", () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", `/app?workflow=automation&project_id=${scopeA}`)
  const onSave = vi.fn()
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected UI-only request"))
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[]} onSave={onSave} /></LocaleProvider>)

  const trigger = screen.getByRole("button", { name: "Triggers" })
  expect(screen.getByRole("button", { name: "Advanced automation" })).toBeDisabled()
  expect(onSave).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
  expect(trigger).toBeEnabled()
  fireEvent.click(trigger)

  const form = screen.getByRole("form")
  expect(within(form).getByRole("textbox", { name: "RSS feed URL" })).toHaveValue("")
  expect(within(form).getByRole("button", { name: "Add OR group" })).toBeEnabled()
  expect(within(form).getByRole("textbox", { name: "Unread email summary" })).toHaveValue("")
  expect(within(form).getByRole("textbox", { name: "Summarize unread email and highlight important messages" })).toHaveValue("")
  expect(within(form).getByRole("button", { name: "Create automation" })).toBeDisabled()
  expect(within(form).queryByRole("combobox", { name: "Schedule" })).toBeNull()
  expect(within(form).queryByLabelText("Select time")).toBeNull()
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(new URLSearchParams(window.location.search).getAll("project_id")).toEqual([scopeA])
  expect(onSave).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})

it("I6 UI RSS conditions edit AND within OR and remove clauses without saving", () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", "/app?workflow=automation")
  const onSave = vi.fn()
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected UI-only request"))
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[]} onSave={onSave} /></LocaleProvider>)

  expect(screen.getByRole("button", { name: "Advanced automation" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Triggers" }))
  const form = screen.getByRole("form")
  const feed = within(form).getByRole("textbox", { name: "RSS feed URL" })
  fireEvent.change(feed, { target: { value: "https://example.com/news.xml" } })
  fireEvent.click(within(form).getByRole("button", { name: "Add OR group" }))
  const firstGroup = within(form).getByRole("group", { name: "Condition group 1" })
  const firstValue = within(firstGroup).getByRole("textbox")
  fireEvent.change(firstValue, { target: { value: "release" } })
  fireEvent.click(within(firstGroup).getByRole("button", { name: "Add condition" }))
  const values = within(firstGroup).getAllByRole("textbox")
  expect(values).toHaveLength(2)
  const secondValue = values[1]
  if (!secondValue) throw new Error("Expected a second AND condition")
  fireEvent.change(secondValue, { target: { value: "stable" } })
  expect(within(firstGroup).getByText("AND", { exact: true })).toBeVisible()

  fireEvent.click(within(form).getByRole("button", { name: "Add OR group" }))
  const secondGroup = within(form).getByRole("group", { name: "Condition group 2" })
  fireEvent.change(within(secondGroup).getByRole("textbox"), { target: { value: "security" } })
  expect(within(form).getByText("OR", { exact: true })).toBeVisible()
  fireEvent.click(within(firstGroup).getByRole("button", { name: "Remove condition 1" }))
  expect(within(firstGroup).getAllByRole("textbox")).toHaveLength(1)
  expect(within(firstGroup).getByRole("textbox")).toHaveValue("stable")
  expect(within(secondGroup).getByRole("textbox")).toHaveValue("security")
  expect(feed).toHaveValue("https://example.com/news.xml")
  expect(onSave).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})

it("I6 UI RSS back retires its draft, restores trigger focus, and isolates project navigation", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", `/app?workflow=automation&project_id=${scopeA}`)
  const onSave = vi.fn()
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected UI-only request"))
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={[]} onSave={onSave} /></LocaleProvider>)

  fireEvent.click(screen.getByRole("button", { name: "Triggers" }))
  const form = screen.getByRole("form")
  fireEvent.change(within(form).getByRole("textbox", { name: "RSS feed URL" }), { target: { value: "https://example.com/private-a.xml" } })
  fireEvent.click(within(form).getByRole("button", { name: "Add OR group" }))
  fireEvent.change(within(within(form).getByRole("group", { name: "Condition group 1" })).getByRole("textbox"), { target: { value: "private A condition" } })
  fireEvent.click(within(form).getByRole("button", { name: "Back to start options" }))
  expect(screen.queryByRole("form")).toBeNull()
  await waitFor(() => expect(screen.getByRole("button", { name: "Triggers" })).toHaveFocus())
  fireEvent.click(screen.getByRole("button", { name: "Triggers" }))
  expect(screen.getByRole("textbox", { name: "RSS feed URL" })).toHaveValue("")
  expect(screen.queryByDisplayValue("private A condition")).toBeNull()

  fireEvent.change(screen.getByRole("textbox", { name: "RSS feed URL" }), { target: { value: "https://example.com/second-a.xml" } })
  window.history.pushState(null, "", `/app?workflow=automation&project_id=${scopeB}`)
  fireEvent(window, new Event("kokoro:surface-navigation"))
  expect(screen.queryByRole("form")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Triggers" }))
  expect(screen.getByRole("textbox", { name: "RSS feed URL" })).toHaveValue("")
  window.history.pushState(null, "", "/app?workflow=automation&project_id=A&project_id=B")
  fireEvent(window, new PopStateEvent("popstate"))
  expect(screen.getByRole("alert")).toHaveTextContent(/project scope/i)
  expect(screen.queryByRole("form")).toBeNull()
  window.history.pushState(null, "", `/app?workflow=automation&project_id=${scopeA}`)
  fireEvent(window, new Event("kokoro:surface-navigation"))
  fireEvent.click(screen.getByRole("button", { name: "Triggers" }))
  expect(screen.getByRole("textbox", { name: "RSS feed URL" })).toHaveValue("")
  expect(screen.queryByDisplayValue("private A condition")).toBeNull()
  expect(onSave).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})

it("I6 renders authoritative RSS poll facts without presenting next-check as a calendar execution", () => {
  window.localStorage.setItem("kokoro.locale", "en")
  const tasks: ScheduledTaskRecord[] = [{ triggerKind: "rss", id: "rss-authoritative", title: "Owner feed", prompt: "Summarize", feedUrl: "https://news.example.com/feed", conditions: [], nextRun: null, schedulingState: "active", feedState: "backoff", lastCheckedAt: "2026-10-23T02:00:00.000Z", nextCheckAt: "2026-10-23T03:00:00.000Z", errorCode: "rss_feed_timeout" }]
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network for controlled data"))
  render(<LocaleProvider><ScheduledTaskSurface mode="controlled" tasks={tasks} /></LocaleProvider>)
  expect(screen.getByText("Feed checks are backing off")).toBeVisible()
  expect(screen.getByText("Last checked", { exact: false })).toBeVisible()
  expect(screen.getByText("Next check (not an execution time)", { exact: false })).toBeVisible()
  expect(screen.queryByText("Daily", { exact: true })).toBeNull()
  fireEvent.click(screen.getByRole("tab", { name: "Calendar" }))
  expect(screen.queryByRole("button", { name: /Owner feed/ })).toBeNull()
  expect(fetcher).not.toHaveBeenCalled()
})
