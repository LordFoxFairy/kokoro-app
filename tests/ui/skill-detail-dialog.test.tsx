import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useState } from "react"

import { LocaleProvider } from "@/i18n/context"
import { SkillDetailDialog } from "@/ui/skills/skill-detail-dialog"
import type { SkillCard } from "@/hub/schemas"

const skill: SkillCard = {
  name: "YouTube 影片研究",
  description: "利用第一手影片证据强化深度研究。",
  content_hash: "preview-youtube",
  scope: "official",
  updated_at: Date.UTC(2026, 7, 28),
}

beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(cleanup)

function renderDialog() {
  render(
    <LocaleProvider>
      <ControlledSkillDetailDialog />
    </LocaleProvider>,
  )
}

function ControlledSkillDetailDialog() {
  const [open, setOpen] = useState(true)

  return (
    <SkillDetailDialog
      skill={skill}
      open={open}
      brandName="Kokoro"
      onOpenChange={setOpen}
      onTry={vi.fn()}
    />
  )
}

it("keeps the Manus-style action cluster visible and expands in place", async () => {
  renderDialog()

  const dialog = screen.getByTestId("skill-detail-dialog")
  expect(screen.getByRole("button", { name: "分享技能" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "更多技能操作" })).toBeInTheDocument()
  const expand = screen.getByRole("button", { name: "放大技能详情" })

  fireEvent.click(expand)

  expect(screen.getByRole("button", { name: "收起技能详情" })).toBeInTheDocument()
  expect(dialog.className).toContain("dialogExpanded")
  expect(screen.getByText("YouTube 影片研究", { selector: "div" })).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "关闭技能详情" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("exposes the skill download action from the more menu", async () => {
  renderDialog()

  fireEvent.pointerDown(screen.getByRole("button", { name: "更多技能操作" }))

  const menu = await waitFor(() => screen.getByRole("menu"))
  expect(within(menu).getByRole("menuitem", { name: "下载技能文件" })).toBeInTheDocument()

  fireEvent.keyDown(menu, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  fireEvent.click(screen.getByRole("button", { name: "关闭技能详情" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})
