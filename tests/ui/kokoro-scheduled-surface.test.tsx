import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroScheduledSurface, type ScheduledTaskClient } from "@/features/app/kokoro-scheduled-surface"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.removeItem("kokoro.preview.scheduled-tasks")
  window.history.replaceState(null, "", "/app/scheduled?tab=calendar")
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderScheduled(onSave = vi.fn()) {
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" preview onSave={onSave} /></LocaleProvider>)
  return onSave
}

it("呈现排程空态、三项建议和建立按钮", () => {
  renderScheduled()

  expect(screen.getByTestId("scheduled-surface")).toBeInTheDocument()
  expect(screen.getByRole("heading", { level: 1, name: "已排程" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Kokoro 能独立执行工作，无需您的干预")
  expect(screen.getByRole("img", { name: "排程日历" })).toBeInTheDocument()
  expect(screen.getAllByRole("button")).toHaveLength(4)
  expect(screen.getByRole("button", { name: /建立您的排程任务/ })).toBeInTheDocument()
})

it("点击建议打开编辑器、写入 hash 并预填提示词", () => {
  renderScheduled()
  const suggestion = screen.getByRole("button", { name: /在一天开始前获取收件箱和日程的每日摘要/ })

  fireEvent.click(suggestion)

  expect(window.location.hash).toBe("#scheduled-tasks/new")
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" })).toHaveValue("在一天开始前获取收件箱和日程的每日摘要。")
  expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled()
})

it("关闭编辑器清理 hash，再次打开时重置表单", () => {
  renderScheduled()
  fireEvent.click(screen.getByRole("button", { name: /为任何主题、竞争对手或关键词设置自动化监控/ }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "监控主题" } })
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }))

  expect(window.location.hash).toBe("")
  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }))
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue("")
  expect(screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" })).toHaveValue("")
})

it("填写标题后保存结构化排程数据", () => {
  const onSave = renderScheduled()
  fireEvent.click(screen.getByRole("button", { name: /将手动流程转为定时自动化管道/ }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "每日流程" } })
  fireEvent.click(screen.getByRole("switch", { name: "自动核准" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  expect(onSave).toHaveBeenCalledWith({
    title: "每日流程",
    prompt: "将手动流程转为定时自动化管道。",
    frequency: "daily",
    time: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    expiresAt: undefined,
    autoApprove: true,
  })
})

it("勾选到期日期后必须先填写日期，短视口也不会把保存区推出 Dialog", () => {
  const onSave = renderScheduled()
  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "每日流程" } })
  fireEvent.change(screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "执行每日流程" } })
  fireEvent.click(screen.getByRole("checkbox", { name: "设定到期日期" }))

  const save = screen.getByRole("button", { name: "保存" })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText("选择到期日期"), { target: { value: "2026-09-30" } })
  expect(save).toBeEnabled()
  fireEvent.click(save)
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: "2026-09-30", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
})

it("预览排程保存后进入列表并持久化本地 fixture", async () => {
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" preview /></LocaleProvider>)

  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "每日流程" } })
  fireEvent.change(screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "执行每日流程" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  await waitFor(() => expect(screen.getByTestId("scheduled-task-list")).toBeInTheDocument())
  expect(screen.getByText("每日流程")).toBeInTheDocument()
  expect(JSON.parse(window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "[]")).toEqual([
    expect.objectContaining({ title: "每日流程", frequency: "daily", time: "08:00", enabled: true }),
  ])
})

it("预览排程通过宿主保存回调成功后仍更新本地列表", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" preview onSave={onSave} /></LocaleProvider>)

  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }))
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "回调每日流程" } })
  fireEvent.change(screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }), { target: { value: "执行回调流程" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  await waitFor(() => expect(screen.getByText("回调每日流程")).toBeInTheDocument())
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(JSON.parse(window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "[]")).toEqual([
    expect.objectContaining({ title: "回调每日流程", prompt: "执行回调流程", enabled: true }),
  ])
})

it("live 模式缺少注入的 client 时显示错误，不把缺失 BFF 误当成空列表", async () => {
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" /></LocaleProvider>)

  await waitFor(() => expect(screen.getByTestId("scheduled-load-error")).toBeInTheDocument())
  expect(screen.queryByTestId("scheduled-task-list")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
})

it("live 模式先呈现 loading，GET 列表失败可用原请求重试并保留注入边界", async () => {
  const task = { id: "scheduled_live_1", title: "Live digest", frequency: "daily" as const, time: "08:00", status: "active" as const }
  const listScheduledTasks = vi.fn()
    .mockRejectedValueOnce(new Error("BFF unavailable"))
    .mockResolvedValueOnce([task])
  const client: ScheduledTaskClient = { listScheduledTasks }
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" client={client} /></LocaleProvider>)

  expect(screen.getByTestId("scheduled-loading")).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId("scheduled-load-error")).toBeInTheDocument())
  fireEvent.click(screen.getByRole("button", { name: "重试" }))

  await waitFor(() => expect(screen.getByText("Live digest")).toBeInTheDocument())
  expect(listScheduledTasks).toHaveBeenCalledTimes(2)
})

it("live client mutation 成功后重新 GET 投影，不靠 optimistic 状态伪造成功", async () => {
  const activeTask = { id: "scheduled_live_1", title: "Live digest", frequency: "daily" as const, time: "08:00", enabled: true }
  const pausedTask = { ...activeTask, enabled: false, status: "paused" as const }
  const listScheduledTasks = vi.fn().mockResolvedValueOnce([activeTask]).mockResolvedValueOnce([pausedTask])
  const updateScheduledTask = vi.fn().mockResolvedValue(undefined)
  const client: ScheduledTaskClient = { listScheduledTasks, updateScheduledTask }
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" client={client} /></LocaleProvider>)

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 Live digest" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))

  await waitFor(() => expect(updateScheduledTask).toHaveBeenCalledWith("scheduled_live_1", { enabled: false, status: "paused" }))
  await waitFor(() => expect(card).toHaveAttribute("data-status", "paused"))
  expect(listScheduledTasks).toHaveBeenCalledTimes(2)
})

it("任务状态指示器向辅助技术暴露本地化状态名称", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_status_1", title: "状态任务", frequency: "daily", time: "08:00", status: "paused" }]}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  expect(within(card).getByRole("img", { name: "已暂停" })).toBeInTheDocument()
})

it("受控任务缺少 mutation handler 时禁用变更入口", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_controlled_1", title: "Controlled", frequency: "daily", time: "08:00", enabled: true }]}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 Controlled" }))
  expect(await screen.findByRole("menuitem", { name: "暂停" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("menuitem", { name: "编辑" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("menuitem", { name: "删除" })).toHaveAttribute("aria-disabled", "true")
})

it("编辑 draft 保留隐式时区，不在编辑器中增加额外的时区控件", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  const onUpdateTask = vi.fn().mockResolvedValue(undefined)
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_controlled_1", title: "Controlled", prompt: "Run it", frequency: "daily", time: "08:00" }]}
        onUpdateTask={onUpdateTask}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 Controlled" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "编辑" }))
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).queryByRole("textbox", { name: "时区" })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))

  await waitFor(() => expect(onUpdateTask).toHaveBeenCalledWith("scheduled_controlled_1", expect.objectContaining({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })))
})

it("列表视图支持暂停、编辑和删除，并把视图写回 URL", async () => {
  window.localStorage.setItem("kokoro.preview.scheduled-tasks", JSON.stringify([{
    id: "scheduled_preview_1",
    title: "每日摘要",
    prompt: "整理今天的重要事项",
    frequency: "daily",
    time: "08:00",
    enabled: true,
  }]))
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" preview /></LocaleProvider>)

  await waitFor(() => expect(screen.getByTestId("scheduled-task-list")).toBeInTheDocument())
  expect(screen.getByRole("tab", { name: "任务" })).toHaveAttribute("aria-selected", "true")
  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 每日摘要" }))
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "暂停" })).toBeInTheDocument())
  fireEvent.click(screen.getByRole("menuitem", { name: "暂停" }))
  expect(screen.getByText(/已暂停/)).toBeInTheDocument()

  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 每日摘要" }))
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "编辑" })).toBeInTheDocument())
  fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }))
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue("每日摘要")
  fireEvent.change(within(dialog).getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "工作日摘要" } })
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }))
  await waitFor(() => expect(screen.getByText("工作日摘要")).toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole("button", { name: "排程任务选项 工作日摘要" })).toHaveFocus())

  fireEvent.pointerDown(screen.getByRole("button", { name: "排程任务选项 工作日摘要" }))
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument())
  fireEvent.click(screen.getByRole("menuitem", { name: "删除" }))
  const confirm = screen.getByRole("alertdialog")
  fireEvent.click(within(confirm).getByRole("button", { name: "删除" }))
  await waitFor(() => expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Kokoro 能独立执行工作，无需您的干预"))
  expect(window.location.search).toBe("?tab=list")
})

it("删除失败时保留确认框，显示错误并允许再次提交", async () => {
  const onDeleteTask = vi.fn().mockRejectedValue(new Error("delete unavailable"))
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_delete_1", title: "待删除任务", frequency: "daily", time: "08:00" }]}
        onDeleteTask={onDeleteTask}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 待删除任务" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }))
  const confirm = screen.getByRole("alertdialog")
  fireEvent.click(within(confirm).getByRole("button", { name: "删除" }))

  await waitFor(() => expect(within(card).getByText("操作失败，请重试。")).toBeInTheDocument())
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除" })).toBeEnabled()
  expect(onDeleteTask).toHaveBeenCalledTimes(1)
})

it("日历月份切换时按实际日期显示任务", () => {
  vi.useFakeTimers({ now: new Date(2026, 8, 15, 12, 0, 0) })
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{
          id: "scheduled_failed_1",
          title: "失败任务",
          prompt: "检查失败任务",
          frequency: "daily",
          time: "08:00",
          nextRun: "2026-09-15T08:00:00",
          status: "failed",
        }]}
      />
    </LocaleProvider>,
  )

  const monthTitle = screen.getByTestId("scheduled-calendar-title")
  expect(monthTitle).toHaveAttribute("data-month", "2026-09")
  expect(screen.getByTestId("scheduled-calendar-day-2026-09-15")).toHaveTextContent("失败任务")

  fireEvent.click(screen.getByRole("button", { name: "下个月" }))
  expect(monthTitle).toHaveAttribute("data-month", "2026-10")
  expect(screen.getByTestId("scheduled-calendar-day-2026-10-15")).toBeInTheDocument()
  expect(screen.getByTestId("scheduled-calendar-day-2026-10-15")).not.toHaveTextContent("失败任务")

  fireEvent.click(screen.getByRole("button", { name: "上个月" }))
  fireEvent.click(screen.getByRole("button", { name: "今天" }))
  expect(monthTitle).toHaveAttribute("data-month", "2026-09")
})

it("失败任务在列表操作中支持 retry，并在本地 fixture 中恢复运行", async () => {
  window.localStorage.setItem("kokoro.preview.scheduled-tasks", JSON.stringify([{
    id: "scheduled_failed_1",
    title: "失败任务",
    prompt: "检查失败任务",
    frequency: "daily",
    time: "08:00",
    enabled: false,
    status: "failed",
  }]))
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(<LocaleProvider><KokoroScheduledSurface brandName="Kokoro" preview /></LocaleProvider>)

  const card = await screen.findByRole("listitem")
  expect(card).toHaveAttribute("data-status", "failed")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 失败任务" }))
  const retry = await screen.findByRole("menuitem", { name: "重试" })
  fireEvent.click(retry)

  await waitFor(() => expect(card).toHaveAttribute("data-status", "active"))
  expect(within(card).getByText(/运行中/)).toBeInTheDocument()
  expect(JSON.parse(window.localStorage.getItem("kokoro.preview.scheduled-tasks") ?? "[]")).toEqual([
    expect.objectContaining({ id: "scheduled_failed_1", status: "active", enabled: true }),
  ])
})

it("失败任务 retry 交给宿主 mutation，外部任务源未更新前不伪造成功", async () => {
  const onRetryTask = vi.fn().mockResolvedValue(undefined)
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_failed_1", title: "失败任务", frequency: "daily", time: "08:00", status: "failed" }]}
        onRetryTask={onRetryTask}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 失败任务" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "重试" }))

  await waitFor(() => expect(onRetryTask).toHaveBeenCalledWith("scheduled_failed_1"))
  expect(card).toHaveAttribute("data-status", "failed")
})

it("列表使用可读的本地化下一次运行时间，而不是把 ISO 字符串直接暴露给用户", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_1", title: "每日摘要", frequency: "daily", time: "08:00", nextRun: "2026-09-15T08:00:00.000Z" }]}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  const time = card.querySelector("time")
  expect(time).toBeInTheDocument()
  expect(time).toHaveAttribute("dateTime", "2026-09-15T08:00:00.000Z")
  expect(time).not.toHaveTextContent("2026-09-15T08:00:00.000Z")
  expect(time).toHaveTextContent(/9月15日/)
})

it("排程 mutation 期间锁住操作入口，失败后保留可恢复的错误提示", async () => {
  let resolveUpdate: () => void = () => {}
  const onUpdateTask = vi.fn(() => new Promise<void>((resolve) => { resolveUpdate = resolve }))
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_1", title: "每日摘要", frequency: "daily", time: "08:00", enabled: true }]}
        onUpdateTask={onUpdateTask}
      />
    </LocaleProvider>,
  )

  const card = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(card).getByRole("button", { name: "排程任务选项 每日摘要" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))
  await waitFor(() => expect(card).toHaveAttribute("aria-busy", "true"))
  expect(within(card).getByRole("status")).toHaveTextContent("正在更新")
  expect(within(card).getByRole("button", { name: "排程任务选项 每日摘要" })).toBeDisabled()

  resolveUpdate()
  await waitFor(() => expect(card).not.toHaveAttribute("aria-busy", "true"))
  expect(card).toHaveAttribute("data-status", "active")

  const onFailedUpdate = vi.fn().mockRejectedValue(new Error("BFF unavailable"))
  cleanup()
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_1", title: "每日摘要", frequency: "daily", time: "08:00", enabled: true }]}
        onUpdateTask={onFailedUpdate}
      />
    </LocaleProvider>,
  )
  const failedCard = await screen.findByRole("listitem")
  fireEvent.pointerDown(within(failedCard).getByRole("button", { name: "排程任务选项 每日摘要" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "暂停" }))
  await waitFor(() => expect(within(failedCard).getByRole("alert")).toHaveTextContent("操作失败"))
  expect(failedCard).not.toHaveAttribute("aria-busy", "true")
  expect(within(failedCard).getByRole("button", { name: "排程任务选项 每日摘要" })).toBeEnabled()
})

it("日历星期标题跟随当前界面语言", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  render(
    <LocaleProvider>
      <KokoroScheduledSurface
        brandName="Kokoro"
        tasks={[{ id: "scheduled_1", title: "Daily digest", frequency: "daily", time: "08:00" }]}
      />
    </LocaleProvider>,
  )

  const weekdays = await screen.findByTestId("scheduled-calendar-weekdays")
  await waitFor(() => expect(within(weekdays).getByText("Sun")).toBeInTheDocument())
})
