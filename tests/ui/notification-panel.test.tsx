import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { ThemeProvider } from "@/ui/theme/theme-context"
import { WorkspaceRail } from "@/components/blocks/workspace-rail/workspace-rail"

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(cleanup)

function renderNotificationRail() {
  render(
    <ThemeProvider>
      <LocaleProvider>
        <WorkspaceRail
          collapsed={false}
          onToggleCollapse={() => {}}
          onNewChat={() => {}}
          chatHref="/app"
          conversations={[]}
          activeId={null}
          awaitingIds={new Set()}
          onSelectConversation={() => {}}
          onDeleteConversation={() => {}}
          onRenameConversation={() => {}}
          onOpenSettings={() => {}}
          listLoading={false}
          listError={false}
          hasMore={false}
          onLoadMore={() => {}}
        />
      </LocaleProvider>
    </ThemeProvider>,
  )
}

it("铃铛打开独立通知面板，不打开外观设置", async () => {
  renderNotificationRail()

  expect(screen.queryByTestId("notification-panel")).toBeNull()
  const trigger = screen.getByRole("button", { name: "打开通知" })
  trigger.focus()
  fireEvent.click(trigger)

  expect(await screen.findByTestId("notification-panel")).toBeInTheDocument()
  expect(screen.getByRole("dialog", { name: "通知" })).toBeInTheDocument()
  expect(screen.getByRole("tab", { name: "全部" })).toHaveAttribute("data-state", "active")
  expect(screen.queryByTestId("settings-modal")).toBeNull()
})

it("通知中心的三个标签切换内容并保留单一滚动区域", async () => {
  renderNotificationRail()
  fireEvent.click(screen.getByRole("button", { name: "打开通知" }))
  await screen.findByTestId("notification-panel")

  const updatesTab = screen.getByRole("tab", { name: "更新日志" })
  fireEvent.mouseDown(updatesTab)
  fireEvent.click(updatesTab)
  expect(screen.getByText("连接器中心已升级")).toBeInTheDocument()
  expect(screen.queryByText("欢迎来到 Kokoro")).toBeNull()

  const messagesTab = screen.getByRole("tab", { name: "消息" })
  fireEvent.mouseDown(messagesTab)
  fireEvent.click(messagesTab)
  expect(screen.getByRole("tab", { name: "消息" })).toHaveAttribute("data-state", "active")
  await waitFor(() => expect(screen.getByText("欢迎来到 Kokoro")).toBeInTheDocument())
  expect(document.querySelectorAll('[data-slot="tabs-content"]').length).toBeGreaterThan(0)
})

it("全部通知不重复首条更新，且活动内容区拥有受约束的滚动槽", async () => {
  renderNotificationRail()
  fireEvent.click(screen.getByRole("button", { name: "打开通知" }))
  await screen.findByTestId("notification-panel")

  expect(screen.getAllByText("Kokoro 工作区焕新")).toHaveLength(1)
  expect(screen.getAllByText("连接器中心已升级")).toHaveLength(1)
  expect(document.querySelector<HTMLElement>('[data-slot="tabs-content"]')?.className).toContain("tabContent")
})

it("Escape 关闭通知中心并把焦点还给铃铛", async () => {
  renderNotificationRail()
  const trigger = screen.getByRole("button", { name: "打开通知" })
  fireEvent.click(trigger)
  await screen.findByTestId("notification-panel")
  fireEvent.keyDown(document, { key: "Escape" })
  await waitFor(() => expect(screen.queryByTestId("notification-panel")).toBeNull())
  expect(trigger).toHaveFocus()
})
