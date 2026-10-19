import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ScheduledTaskClientError, ScheduledTaskEditorDialog, ScheduledTaskSurface } from "@/features/scheduled-tasks"
import { LocaleProvider } from "@/i18n/context"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.removeItem("kokoro.preview.scheduled-tasks")
  window.history.replaceState({ shell: "preserved" }, "", "/app/scheduled?tab=calendar")
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
})

it("freezes an uncertain submitted draft and explicitly retries the same values", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"))
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(
      new ScheduledTaskClientError("http", "unreachable", 502),
    )
    .mockResolvedValueOnce(undefined)
  render(
    <LocaleProvider>
      <ScheduledTaskEditorDialog
        open
        onOpenChange={vi.fn()}
        brandName="Kokoro"
        initialTask={{
          title: "Frozen",
          prompt: "Exact prompt",
          frequency: "weekly",
          weekdays: [1],
          time: "08:00",
          timezone: "UTC",
        }}
        onSave={onSave}
      />
    </LocaleProvider>,
  )
  fireEvent.keyDown(screen.getByRole("button", { name: "星期" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "周二" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  const retry = await screen.findByRole("button", { name: "重试原请求" })
  expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toBeDisabled()
  expect(onSave.mock.calls[0]?.[0]).toHaveProperty("weekdays", [1, 2])
  vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"))
  fireEvent.click(retry)
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  expect(onSave.mock.calls[1]).toEqual(onSave.mock.calls[0])
})

it("converts an expiry date in the task IANA timezone to a UTC end-of-day instant", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <LocaleProvider>
      <ScheduledTaskEditorDialog
        open
        onOpenChange={vi.fn()}
        brandName="Kokoro"
        initialTask={{
          title: "DST task",
          prompt: "Run it",
          frequency: "daily",
          time: "08:00",
          timezone: "America/New_York",
        }}
        onSave={onSave}
      />
    </LocaleProvider>,
  )

  fireEvent.click(screen.getByRole("checkbox", { name: "设定到期日期" }))
  fireEvent.change(screen.getByLabelText("选择到期日期"), { target: { value: "2026-03-08" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    timezone: "America/New_York",
    expiresAt: "2026-03-09T03:59:59.999Z",
  })))
})

it("projects an owner expiry instant into the task timezone and clears it with explicit null", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <LocaleProvider>
      <ScheduledTaskEditorDialog
        open
        onOpenChange={vi.fn()}
        brandName="Kokoro"
        initialTask={{
          title: "Expiry task",
          prompt: "Run it",
          frequency: "daily",
          time: "08:00",
          timezone: "America/New_York",
          expiresAt: "2026-10-01T03:59:59.999Z",
        }}
        onSave={onSave}
      />
    </LocaleProvider>,
  )

  expect(screen.getByLabelText("选择到期日期")).toHaveValue("2026-09-30")
  fireEvent.click(screen.getByRole("checkbox", { name: "设定到期日期" }))
  fireEvent.click(screen.getByRole("button", { name: "保存" }))

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null })))
})

it("opens with pushState, preserves host state, and closes through browser back", async () => {
  const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined)
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" preview /></LocaleProvider>)

  fireEvent.click(screen.getByRole("button", { name: /建立您的排程任务/ }))

  expect(window.location.hash).toBe("#scheduled-tasks/new")
  expect(window.history.state).toMatchObject({ shell: "preserved", scheduledTaskEditor: true })
  fireEvent.click(screen.getByRole("button", { name: "关闭对话框" }))

  expect(window.location.hash).toBe("")
  expect(back).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
})

it("replaces a direct editor deep link without navigating back", () => {
  window.history.replaceState({ shell: "deep-link" }, "", "/app/scheduled?tab=calendar#scheduled-tasks/new")
  const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined)
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" preview /></LocaleProvider>)

  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "关闭对话框" }))

  expect(window.location.hash).toBe("")
  expect(window.history.state).toEqual({ shell: "deep-link" })
  expect(back).not.toHaveBeenCalled()
})

it("preserves an exact project creation query while closing only the deep-link editor hash", () => {
  window.history.replaceState(
    { shell: "project-deep-link" },
    "",
    "/app/scheduled?tab=calendar&project_id=project%2F%E7%9C%9F%E5%AE%9E#scheduled-tasks/new",
  )
  const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined)
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" preview /></LocaleProvider>)

  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "关闭对话框" }))

  expect(window.location.pathname).toBe("/app/scheduled")
  expect(window.location.search).toBe("?tab=calendar&project_id=project%2F%E7%9C%9F%E5%AE%9E")
  expect(window.location.hash).toBe("")
  expect(back).not.toHaveBeenCalled()
})

it("treats project context changes as new editor instances instead of retaining the old draft", async () => {
  window.history.replaceState(null, "", "/app/scheduled?project_id=project-a#scheduled-tasks/new")
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" preview /></LocaleProvider>)
  fireEvent.change(screen.getByRole("textbox", { name: "未读邮件摘要" }), { target: { value: "A draft" } })

  window.history.pushState(null, "", "/app/scheduled?project_id=project-b#scheduled-tasks/new")
  window.dispatchEvent(new Event("kokoro:surface-navigation"))

  await waitFor(() => expect(screen.getByRole("textbox", { name: "未读邮件摘要" })).toHaveValue(""))
})

it("fails closed when the project query cannot be decoded exactly", () => {
  window.history.replaceState(null, "", "/app/scheduled?project_id=%E0%A4%A#scheduled-tasks/new")
  render(<LocaleProvider><ScheduledTaskSurface brandName="Kokoro" preview /></LocaleProvider>)

  const dialog = screen.getByRole("dialog")
  expect(within(dialog).getByRole("alert")).toBeInTheDocument()
  expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled()
})

it("makes the task timezone explicit, validates it and submits a changed zone", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialTask={{ title: "Zone task", prompt: "Run", frequency: "daily", time: "08:00", timezone: "UTC" }} onSave={onSave} /></LocaleProvider>)
  const zone = screen.getByRole("combobox", { name: "时区" })
  expect(zone).toHaveValue("UTC")
  fireEvent.change(zone, { target: { value: "Not/A_Zone" } })
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  expect(zone).toHaveAttribute("aria-invalid", "true")
  fireEvent.change(zone, { target: { value: "Asia/Shanghai" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timezone: "Asia/Shanghai", time: "08:00" })))
})


it("fills the saved weekly weekday in its timezone and does not replace it for prompt-only edits", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const task = { title: "Weekly", prompt: "Run", frequency: "weekly" as const, time: "09:00", timezone: "America/Los_Angeles", weekdays: [0], nextRun: "2026-10-23T16:00:00.000Z" }
  render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialTask={task} onSave={onSave} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "星期" })).toHaveTextContent("周日")
  fireEvent.change(screen.getByLabelText("汇总未读邮件并突出显示重要邮件"), { target: { value: "Changed prompt" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0]?.[0]).toHaveProperty("weekdays", [0])
})

it("submits the selected weekday in the edited timezone rather than the old UTC weekday", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialTask={{ title: "Weekly", prompt: "Run", frequency: "weekly", time: "09:00", timezone: "America/Los_Angeles", weekdays: [0] }} onSave={onSave} /></LocaleProvider>)
  fireEvent.keyDown(screen.getByRole("button", { name: "星期" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "周二" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  fireEvent.change(screen.getByLabelText("时区"), { target: { value: "Asia/Tokyo" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  const saved = onSave.mock.calls[0]?.[0]
  expect(saved.weekdays).toEqual([0, 2])
  expect(saved.timezone).toBe("Asia/Tokyo")
})

it("requires an explicit weekday instead of guessing when a controlled weekly record has no anchor", async () => {
  render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialTask={{ title: "Weekly", prompt: "Run", frequency: "weekly", time: "09:00", timezone: "UTC" }} onSave={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "星期" })).toHaveTextContent("选择星期")
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
})

it("replays a frozen weekly create with the exact selected weekdays", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const original = { title: "Unknown create", prompt: "Run", frequency: "weekly" as const, time: "09:00", timezone: "UTC", weekdays: [1, 4], autoApprove: false }
  render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialDraft={original} onSave={onSave} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "重试原请求" }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0]?.[0]).toEqual({ ...original, expiresAt: undefined })
})


it("edits monthly selections and an expired once date without retaining another rule's selectors", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const view = render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialTask={{ title: "Monthly", prompt: "Run", frequency: "monthly", time: "09:00", timezone: "UTC", monthDays: [1] }} onSave={onSave} /></LocaleProvider>)
  fireEvent.keyDown(screen.getByRole("button", { name: "月内日期" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "31 号" }))
  expect(screen.getByRole("menuitemcheckbox", { name: "1 号" })).toHaveAttribute("aria-checked", "true")
  expect(screen.getByRole("menuitemcheckbox", { name: "31 号" })).toHaveAttribute("aria-checked", "true")
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({ frequency: "monthly", monthDays: [1, 31] })
  view.unmount()
  render(<LocaleProvider><ScheduledTaskEditorDialog open onOpenChange={vi.fn()} brandName="Kokoro" initialTask={{ title: "Once", prompt: "Run", frequency: "once", time: "09:00", timezone: "UTC", localDate: "2020-01-01" }} onSave={onSave} /></LocaleProvider>)
  expect(screen.getByLabelText("日期")).toHaveValue("2020-01-01")
  fireEvent.change(screen.getByLabelText("汇总未读邮件并突出显示重要邮件"), { target: { value: "Edited after consumption" } })
  fireEvent.click(screen.getByRole("button", { name: "保存" }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  const saved = onSave.mock.calls[1]?.[0]
  expect(saved).toMatchObject({ frequency: "once", localDate: "2020-01-01", prompt: "Edited after consumption" })
  expect(saved).not.toHaveProperty("monthDays")
  expect(saved).not.toHaveProperty("weekdays")
})
