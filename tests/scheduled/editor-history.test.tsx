import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ScheduledTaskEditorDialog, ScheduledTaskSurface } from "@/features/scheduled-tasks"
import { LocaleProvider } from "@/i18n/context"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
  window.localStorage.removeItem("kokoro.preview.scheduled-tasks")
  window.history.replaceState({ shell: "preserved" }, "", "/app/scheduled?tab=calendar")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
