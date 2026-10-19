import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import {
  createScheduledTaskClient,
  ScheduledTaskSurface,
  type ScheduledTaskClient,
} from "@/features/scheduled-tasks"
import { LocaleProvider } from "@/i18n/context"
import { useScheduledTaskClient } from "@/ui/auth/use-scheduled-task-client"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const boundary = (
  subject: string | null,
  generation: number,
  admitted = true,
): ProjectReadBoundary => ({ subject, generation, admitted })
const task = {
  id: "task-a",
  title: "Only Alice",
  prompt: "Run",
  frequency: "daily" as const,
  time: "08:00",
  timezone: "UTC",
  enabled: false,
  status: "paused" as const,
}
const unavailable = async (): Promise<never> => {
  throw new Error("not configured")
}

it("retires per-actor command clients, including A to B to A, while retaining the same actor across recheck", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ tasks: [] }), { status: 200 }),
    )
  vi.stubGlobal("fetch", fetcher)
  const { result, rerender } = renderHook(
    ({ value }) => useScheduledTaskClient(value),
    { initialProps: { value: boundary("Alice", 1) } },
  )
  const old = result.current
  rerender({ value: boundary("Alice", 2, false) })
  expect(result.current).toBe(old)
  await expect(old.listScheduledTasks()).rejects.toMatchObject({
    reason: "network",
  })
  expect(fetcher).not.toHaveBeenCalled()
  rerender({ value: boundary("Bob", 3) })
  expect(result.current).not.toBe(old)
  rerender({ value: boundary("Alice", 4) })
  expect(result.current).not.toBe(old)
  await expect(old.listScheduledTasks()).rejects.toMatchObject({
    reason: "network",
  })
  await result.current.listScheduledTasks()
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it("keeps the same actor's list stable while admission is frozen, then revalidates on resume", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  const list = vi.fn().mockResolvedValue([task])
  const client: ScheduledTaskClient = {
    listScheduledTasks: list,
    createScheduledTask: unavailable,
    updateScheduledTask: unavailable,
    retryScheduledTask: unavailable,
    deleteScheduledTask: unavailable,
  }
  const view = (value: ProjectReadBoundary) => (
    <LocaleProvider>
      <ScheduledTaskSurface
        mode="live"
        scheduledTaskClient={client}
        projectReadBoundary={value}
      />
    </LocaleProvider>
  )
  const { rerender } = render(view(boundary("Alice", 1)))
  expect(await screen.findByText("Only Alice")).toBeInTheDocument()
  rerender(view(boundary("Alice", 2, false)))
  expect(screen.getByText("Only Alice")).toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "建立您的排程任务" }),
  ).toBeDisabled()
  await act(async () => {})
  expect(list).toHaveBeenCalledTimes(1)
  rerender(view(boundary("Alice", 2)))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  list.mockResolvedValueOnce([])
  rerender(view(boundary("Bob", 3)))
  expect(screen.queryByText("Only Alice")).not.toBeInTheDocument()
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
})

it("restores the original unknown create after closing its dialog and remounting the page", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method)
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 })
      return new Response("lost ACK", { status: 502 })
    })
  const client = createScheduledTaskClient(fetcher)
  const view = () => (
    <LocaleProvider>
      <ScheduledTaskSurface
        mode="live"
        scheduledTaskClient={client}
        projectReadBoundary={boundary("Alice", 1)}
      />
    </LocaleProvider>
  )
  const first = render(view())
  fireEvent.click(
    await screen.findByRole("button", { name: "建立您的排程任务" }),
  )
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), {
    target: { value: "Original task" },
  })
  fireEvent.change(
    screen.getByRole("textbox", { name: "汇总未读邮件并突出显示重要邮件" }),
    { target: { value: "Original prompt" } },
  )
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await screen.findByRole("button", { name: "重试原请求" })
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  first.unmount()
  window.history.replaceState(null, "", "/app/scheduled?tab=list")
  render(view())
  fireEvent.click(
    await screen.findByRole("button", { name: "建立您的排程任务" }),
  )
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue(
    "Original task",
  )
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2),
  )
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST")
  expect(posts[1]?.[1]).toEqual(posts[0]?.[1])
})
