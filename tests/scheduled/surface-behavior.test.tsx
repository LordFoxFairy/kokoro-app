import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  ScheduledTaskSurface,
  type ScheduledTaskClient,
  type ScheduledTaskRecord,
} from "@/features/scheduled-tasks"
import { LocaleProvider } from "@/i18n/context"

const activeTask: ScheduledTaskRecord = {
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
