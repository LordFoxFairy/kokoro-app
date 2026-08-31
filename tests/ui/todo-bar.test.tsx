import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { TodoBar } from "@/ui/todo/todo-bar"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

it("计划条用可访问的进度语义呈现完成数量", () => {
  render(
    <LocaleProvider>
      <TodoBar
        todos={[
          { content: "收集资料", status: "completed" },
          { content: "整理结论", status: "in_progress" },
          { content: "输出报告", status: "pending" },
        ]}
      />
    </LocaleProvider>,
  )

  expect(screen.getByRole("progressbar", { name: "任务进度" })).toHaveAttribute("aria-valuenow", "1")
  expect(screen.getByRole("button", { name: /任务进度.*1 \/ 3/ })).toBeInTheDocument()
})

it("任务进度使用 Collapsible 默认收起并保留进度摘要", () => {
  render(
    <LocaleProvider>
      <TodoBar todos={[{ content: "完成一步", status: "completed" }]} />
    </LocaleProvider>,
  )

  const trigger = screen.getByRole("button", { name: /任务进度.*1 \/ 1/ })
  expect(trigger).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute("aria-expanded", "true")
  expect(within(screen.getByRole("list", { name: "任务进度" })).getByText("完成一步")).toBeInTheDocument()
})
