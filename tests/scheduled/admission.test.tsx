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
const task = { triggerKind: "calendar" as const,
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

it("I1 restores an unknown inline submission across leaving and remounting with its original key and body", async () => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", "/app?workflow=automation&project_id=project-original")
  const fetcher = vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === "POST"
      ? new Response("lost ACK", { status: 502 })
      : Response.json({ tasks: [] }),
  )
  const client = createScheduledTaskClient(fetcher)
  const view = () => <LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={client} projectReadBoundary={boundary("Alice", 1)} /></LocaleProvider>
  const first = render(view())
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Unread email summary" }), { target: { value: "Original inline task" } })
  fireEvent.change(screen.getByRole("textbox", { name: "Summarize unread email and highlight important messages" }), { target: { value: "Original frozen prompt" } })
  fireEvent.click(screen.getByRole("button", { name: "Create automation" }))
  fireEvent.click(screen.getByRole("button", { name: "Create automation" }))
  await screen.findByRole("button", { name: "Retry original request" })
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  fireEvent.click(screen.getByRole("link", { name: "Back to automations" }))
  first.unmount()
  window.history.replaceState(null, "", "/app?workflow=automation&project_id=project-original")
  render(view())
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  const title = screen.getByRole("textbox", { name: "Unread email summary" })
  expect(title).toHaveValue("Original inline task")
  expect(title).toBeDisabled()
  expect(screen.getByRole("textbox", { name: "Summarize unread email and highlight important messages" })).toHaveValue("Original frozen prompt")
  expect(screen.getByLabelText("Select time")).toHaveValue("10:00")
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: "Retry original request" }))
  await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2))
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST")
  expect(posts[1]?.[1]).toEqual(posts[0]?.[1])
  expect(JSON.parse(String(posts[0]?.[1]?.body))).toMatchObject({ project_id: "project-original", title: "Original inline task", prompt: "Original frozen prompt", time: "10:00" })
})

it.each(["subject", "generation", "project", "invalid", "personal"] as const)("I1 retires a late inline create on %s change before it can reload or navigate the new view", async (change) => {
  window.localStorage.setItem("kokoro.locale", "en")
  window.history.replaceState(null, "", "/app?workflow=automation&project_id=project-A")
  let resolveCreate: (value: Awaited<ReturnType<ScheduledTaskClient["createScheduledTask"]>>) => void = () => undefined
  const receipt = new Promise<Awaited<ReturnType<ScheduledTaskClient["createScheduledTask"]>>>((resolve) => { resolveCreate = resolve })
  const list = vi.fn().mockResolvedValue([])
  const create = vi.fn().mockReturnValue(receipt)
  const client: ScheduledTaskClient = { listScheduledTasks: list, createScheduledTask: create, updateScheduledTask: unavailable, retryScheduledTask: unavailable, deleteScheduledTask: unavailable }
  const view = (value: ProjectReadBoundary) => <LocaleProvider><ScheduledTaskSurface mode="live" scheduledTaskClient={client} projectReadBoundary={value} /></LocaleProvider>
  const rendered = render(view(boundary("Alice", 1)))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole("button", { name: "Scheduled tasks" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Unread email summary" }), { target: { value: "Old A create" } })
  fireEvent.change(screen.getByRole("textbox", { name: "Summarize unread email and highlight important messages" }), { target: { value: "Old A prompt" } })
  fireEvent.click(screen.getByRole("button", { name: "Create automation" }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  if (change === "subject") rendered.rerender(view(boundary("Bob", 2)))
  else if (change === "generation") {
    rendered.rerender(view(boundary("Alice", 2, false)))
    rendered.rerender(view(boundary("Alice", 2)))
  } else {
    const query = change === "project" ? "&project_id=project-B" : change === "invalid" ? "&project_id=A&project_id=B" : ""
    window.history.pushState(null, "", `/app?workflow=automation${query}`)
    fireEvent(window, new Event("kokoro:surface-navigation"))
  }
  await act(async () => {})
  const readsAfterRetirement = list.mock.calls.length
  const newAddress = window.location.href
  const newFocus = document.activeElement
  await act(async () => { resolveCreate({ ...task, id: "old-created", projectId: "project-A", title: "Old A create" }); await receipt })
  expect(list).toHaveBeenCalledTimes(readsAfterRetirement)
  expect(create).toHaveBeenCalledTimes(1)
  expect(window.location.href).toBe(newAddress)
  expect(document.activeElement).toBe(newFocus)
  expect(screen.queryByText("Old A create")).toBeNull()
  expect(screen.queryByDisplayValue("Old A prompt")).toBeNull()
})
