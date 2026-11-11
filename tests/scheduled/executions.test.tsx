import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { scheduledTaskExecutionListResponseSchema } from "@/contract/scheduled"
import { listProjects } from "@/features/app/project-list"
import { createScheduledTaskClient, ScheduledTaskSurface, type ScheduledExecution, type ScheduledExecutionPage, type ScheduledTaskClient } from "@/features/scheduled-tasks"
import { LocaleProvider } from "@/i18n/context"

vi.mock("@/features/app/project-list", () => ({ listProjects: vi.fn() }))

const wire = {
  execution_id: "execution_1", task_id: "scheduled_1", task_title: "Digest", occurrence_at: "2026-11-09T08:00:00.000Z",
  state: "completed", conversation_id: "conv_00000000-0000-4000-8000-000000000301", project_id: null,
  run_id: "run_1", assistant_message_id: "message_1", completed_at: "2026-11-09T08:00:05.000Z",
} as const
const execution: ScheduledExecution = {
  id: wire.execution_id, taskId: wire.task_id, taskTitle: wire.task_title, occurrenceAt: wire.occurrence_at,
  state: wire.state, conversationId: wire.conversation_id, projectId: wire.project_id, runId: wire.run_id,
  assistantMessageId: wire.assistant_message_id, completedAt: wire.completed_at,
}
const page = (executions: ScheduledExecution[] = [], nextCursor: string | null = null): ScheduledExecutionPage => ({ executions, nextCursor })
function client(overrides: Partial<ScheduledTaskClient> = {}): ScheduledTaskClient {
  const unavailable = async (): Promise<never> => { throw Error("not configured") }
  return { listScheduledTasks: vi.fn().mockResolvedValue([]), listScheduledExecutions: vi.fn().mockResolvedValue(page()),
    createScheduledTask: unavailable, updateScheduledTask: unavailable, retryScheduledTask: unavailable,
    deleteScheduledTask: unavailable, ...overrides }
}
function show(transport: ScheduledTaskClient) {
  return render(<LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={transport} /></LocaleProvider>)
}
beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it("decodes the bounded execution wire and carries exact filters, opaque cursor and cancellation only on reads", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ executions: [wire], next_cursor: "opaque+/=?" })))
  const transport = createScheduledTaskClient(fetcher)
  const signal = new AbortController().signal
  expect(await transport.listScheduledExecutions({ projectId: "project /真实", taskId: "scheduled/1", cursor: "opaque+/=?", limit: 50, signal }))
    .toEqual(page([execution], "opaque+/=?"))
  const url = new URL(fetcher.mock.calls[0]![0], "https://local.test")
  expect(url.pathname).toBe("/api/scheduled-tasks/executions")
  expect(Object.fromEntries(url.searchParams)).toEqual({ project_id: "project /真实", task_id: "scheduled/1", cursor: "opaque+/=?", limit: "50" })
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: "no-store", signal })
  await expect(transport.listScheduledExecutions({ limit: 51 })).rejects.toMatchObject({ reason: "parse" })
  await expect(transport.listScheduledTasks({ projectId: " spaced " })).rejects.toMatchObject({ reason: "parse" })
  expect(fetcher).toHaveBeenCalledTimes(1)
  for (const bad of [{ ...wire, state: "submitted" }, { ...wire, assistant_message_id: null }, { ...wire, token: "extra" }]) {
    expect(scheduledTaskExecutionListResponseSchema.safeParse({ executions: [bad], next_cursor: null }).success).toBe(false)
  }
})

it("keeps Updates available when task reads fail, pages real records and preserves confirmed rows after refresh failure", async () => {
  let resolve!: (value: ScheduledExecutionPage) => void
  const listScheduledExecutions = vi.fn().mockImplementationOnce(() => new Promise<ScheduledExecutionPage>(done => { resolve = done }))
    .mockResolvedValueOnce(page([{ ...execution, id: "second", taskTitle: "Project digest", projectId: "project /真实" }]))
    .mockRejectedValueOnce(Error("read unavailable"))
  show(client({ listScheduledTasks: vi.fn().mockRejectedValue(Error("scheduler unavailable")), listScheduledExecutions }))
  await screen.findByTestId("scheduled-load-error")
  fireEvent.keyDown(screen.getByRole("tab", { name: "执行记录" }), { key: "Enter" })
  expect(await screen.findByText("正在读取执行记录…")).toBeInTheDocument()
  await act(async () => resolve(page([{ ...execution, id: "queued", taskTitle: "Pending digest", state: "queued", conversationId: null, assistantMessageId: null, completedAt: null }, execution], "next-page")))
  expect(screen.getByRole("link", { name: "查看结果" })).toHaveAttribute("href", `/app?conversation=${wire.conversation_id}`)
  expect(screen.getByText("结果暂不可访问")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await screen.findByText("Project digest")
  expect(listScheduledExecutions.mock.calls[1]![0]).toMatchObject({ cursor: "next-page" })
  expect(screen.getAllByRole("link", { name: "查看结果" })[1]).toHaveAttribute("href", `/app/project/project%20%2F%E7%9C%9F%E5%AE%9E?conversation=${wire.conversation_id}`)
  expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "刷新执行记录" }))
  expect(await screen.findByText("执行记录读取失败，请刷新重试。")).toBeInTheDocument()
  expect(screen.getByText("Project digest")).toBeInTheDocument()
})

it("filters through the existing Project directory without changing create context or accepting a late page from the old filter", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=updates&project_id=create-context&filter_project_id=project-a")
  vi.mocked(listProjects).mockResolvedValue([{
    id: "project-b", name: "Project B", slug: "b", description: "", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  }])
  let resolve!: (value: ScheduledExecutionPage) => void
  const listScheduledExecutions = vi.fn().mockImplementationOnce(() => new Promise<ScheduledExecutionPage>(done => { resolve = done }))
    .mockResolvedValueOnce(page([{ ...execution, taskTitle: "New project result" }]))
  const listScheduledTasks = vi.fn().mockResolvedValue([])
  show(client({ listScheduledExecutions, listScheduledTasks }))
  await waitFor(() => expect(listScheduledExecutions).toHaveBeenCalledTimes(1))
  const filter = screen.getByRole("combobox", { name: "筛选项目" })
  fireEvent.focus(filter)
  await screen.findByRole("option", { name: "Project B" })
  fireEvent.change(filter, { target: { value: "project-b" } })
  await screen.findByText("New project result")
  expect(listScheduledExecutions.mock.calls[1]![0]).toMatchObject({ projectId: "project-b" })
  expect(listScheduledTasks).toHaveBeenLastCalledWith({ projectId: "project-b" })
  expect(new URLSearchParams(window.location.search).get("project_id")).toBe("create-context")
  expect(new URLSearchParams(window.location.search).get("filter_project_id")).toBe("project-b")
  await act(async () => resolve(page([{ ...execution, taskTitle: "Retired project result" }])))
  expect(screen.queryByText("Retired project result")).not.toBeInTheDocument()
  expect(screen.getByText("New project result")).toBeInTheDocument()
})

it("distinguishes an empty execution list from a failure and rejects an ambiguous project filter before reads", async () => {
  window.history.replaceState(null, "", "/app/scheduled?tab=updates")
  const transport = client()
  const { unmount } = show(transport)
  expect(await screen.findByText("还没有执行记录。")).toBeInTheDocument()
  unmount()
  window.history.replaceState(null, "", "/app/scheduled?tab=updates&filter_project_id=a&filter_project_id=b")
  const invalid = client()
  show(invalid)
  expect(screen.getByRole("alert")).toHaveTextContent("项目筛选无效，请重新选择。")
  await act(async () => {})
  expect(invalid.listScheduledTasks).not.toHaveBeenCalled()
  expect(invalid.listScheduledExecutions).not.toHaveBeenCalled()
})
