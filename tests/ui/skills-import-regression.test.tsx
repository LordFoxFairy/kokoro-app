import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"

const { browserHubClientMock } = vi.hoisted(() => ({ browserHubClientMock: vi.fn() }))

vi.mock("@/ui/shell/page-clients", () => ({ browserHubClient: browserHubClientMock }))

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/skills")
  browserHubClientMock.mockImplementation(() => createPreviewHubClient())
})

afterEach(cleanup)

function renderSurface(onPrompt = vi.fn()) {
  render(
    <LocaleProvider>
      <KokoroSkillsSurface preview brandName="Kokoro" onPrompt={onPrompt} />
    </LocaleProvider>,
  )
  return onPrompt
}

it("hands AI skill creation to the shared composer instead of only writing an orphaned pending draft", async () => {
  const onPrompt = renderSurface()
  await screen.findByTestId("skills-catalog-grid")

  const create = screen.getByRole("button", { name: "建立我的专属技能" })
  fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
  fireEvent.click(create)
  fireEvent.click(await screen.findByRole("menuitem", { name: "使用 Kokoro 建立技能" }))

  expect(onPrompt).toHaveBeenCalledWith("帮我使用 /skill-creator 一起创建一个技能。首先问我这个技能应该做什么。")
  expect(screen.queryByRole("menu")).toBeNull()
})

it("keeps an imported GitHub result truthful and lets the user recover from a failed request", async () => {
  const client = createPreviewHubClient()
  const persistedImport = client.importGithub!
  const importGithub = vi.fn()
    .mockRejectedValueOnce(new Error("fixture import failure"))
    .mockImplementationOnce(persistedImport)
  client.importGithub = importGithub
  browserHubClientMock.mockReturnValue(client)
  renderSurface()
  await screen.findByTestId("skills-catalog-grid")

  const create = screen.getByRole("button", { name: "建立我的专属技能" })
  fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
  fireEvent.click(create)
  fireEvent.click(await screen.findByRole("menuitem", { name: "从 GitHub 导入" }))
  const dialog = await screen.findByTestId("github-import-dialog")
  const input = within(dialog).getByTestId("github-repository-input")
  fireEvent.change(input, { target: { value: "acme/recoverable-skill" } })
  fireEvent.click(within(dialog).getByTestId("github-import-submit"))

  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("导入失败"))
  expect(within(dialog).getByTestId("github-import-submit")).toBeEnabled()
  expect(screen.queryByText("已导入「recoverable-skill」")).toBeNull()

  fireEvent.click(within(dialog).getByTestId("github-import-submit"))
  await within(dialog).findByTestId("github-import-complete")
  expect(await within(dialog).findByText("技能已导入到当前工作区。")).toBeInTheDocument()
  expect(importGithub).toHaveBeenCalledTimes(2)
})
