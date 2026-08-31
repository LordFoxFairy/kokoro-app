import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(cleanup)

function renderSkills(onOpenSettings = vi.fn()) {
  render(
    <LocaleProvider>
      <KokoroSkillsSurface
        preview
        brandName="Kokoro"
        onPrompt={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    </LocaleProvider>,
  )
  return onOpenSettings
}

it("renders the standalone Manus-style skill catalog and filters it without replacing the page", async () => {
  renderSkills()

  expect(screen.getByRole("heading", { name: "技能", level: 1 })).toBeInTheDocument()
  expect(await screen.findByTestId("skills-catalog-grid")).toBeInTheDocument()
  expect(screen.getAllByText("YouTube 影片研究").length).toBeGreaterThan(0)
  expect(screen.getByRole("navigation", { name: "技能分类" })).toBeInTheDocument()

  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "财务" } })
  expect(screen.getAllByText("财务分析").length).toBeGreaterThan(0)
  expect(screen.queryByText("AI 影片生成器", { selector: "button" })).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }))
  fireEvent.click(screen.getByRole("button", { name: "媒体" }))
  expect(screen.getAllByText("AI 影片生成器").length).toBeGreaterThan(0)
  expect(screen.queryByText("财务分析", { selector: "button" })).toBeNull()

  // Catalog classification is an explicit backend projection. This title and
  // description do not contain the word "automation", so the filter proves
  // the UI does not infer categories from presentation copy alone.
  fireEvent.click(screen.getByRole("button", { name: "自动化" }))
  expect(screen.getAllByText("Skill Builder").length).toBeGreaterThan(0)
})

it("hands My Skills to the shared settings center instead of opening a second compact dialog", async () => {
  const onOpenSettings = renderSkills()
  await screen.findByTestId("skills-catalog-grid")

  const trigger = screen.getByRole("button", { name: "我的技能" })
  fireEvent.click(trigger)

  expect(onOpenSettings).toHaveBeenCalledWith("skills", trigger)
  expect(screen.queryByTestId("skills-panel")).toBeNull()
})

it("uses a fixed Manus-style create menu and site-owned brand copy", async () => {
  renderSkills()
  await screen.findByTestId("skills-catalog-grid")

  const trigger = screen.getByRole("button", { name: "建立我的专属技能" })
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)

  const menu = await screen.findByRole("menu")
  expect(menu).toHaveTextContent("使用 Kokoro 建立技能")
  expect(menu).toHaveTextContent("上传技能")
  expect(menu).toHaveTextContent("从 GitHub 导入")
  expect(menu.className).toContain("createMenu")
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(3)
})

it("添加技能后保留原按钮状态并播报完成结果", async () => {
  renderSkills()
  await screen.findByTestId("skills-catalog-grid")

  const addButton = screen.getByRole("button", { name: "添加 AI 影片生成器" })
  fireEvent.click(addButton)

  await waitFor(() => expect(addButton).toHaveAttribute("aria-label", "已添加 AI 影片生成器"))
  expect(addButton).toBeDisabled()
  expect(screen.getByTestId("skills-action-status")).toHaveTextContent("已添加 AI 影片生成器")
})

it("imports a canonical GitHub skill, closes only the child dialog, and promotes the saved fixture card", async () => {
  renderSkills()
  await screen.findByTestId("skills-catalog-grid")

  fireEvent.pointerDown(screen.getByRole("button", { name: "建立我的专属技能" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "从 GitHub 导入" }))

  const dialog = await screen.findByTestId("github-import-dialog")
  const input = within(dialog).getByTestId("github-repository-input")
  fireEvent.change(input, { target: { value: "acme/standalone-skill.git/" } })
  fireEvent.click(within(dialog).getByTestId("github-import-submit"))

  await within(dialog).findByTestId("github-import-complete")
  expect(within(dialog).getByText("standalone-skill")).toBeInTheDocument()
  fireEvent.click(within(dialog).getByTestId("github-import-done"))

  await waitFor(() => expect(screen.queryByTestId("github-import-dialog")).toBeNull())
  expect(await screen.findByText(/已导入「standalone-skill」/)).toBeInTheDocument()
  expect(screen.getByText("https://github.com/acme/standalone-skill")).toBeInTheDocument()
  const grid = screen.getByTestId("skills-catalog-grid")
  expect(within(grid).getAllByText("standalone-skill").length).toBeGreaterThan(0)
  expect(grid.firstElementChild).toHaveTextContent("standalone-skill")
  expect(within(grid).getByRole("button", { name: "已添加 standalone-skill" })).toBeDisabled()
})
