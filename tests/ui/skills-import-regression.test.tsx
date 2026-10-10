import { useState } from "react"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"

const { session } = vi.hoisted(() => ({ session: { admitted: true, subject: "test-user", generation: 1 } }))
vi.mock("@/ui/auth/use-session-state", () => ({ useSessionProbe: () => ({ state: "pass", projectReadBoundary: session }) }))

const { browserHubClientMock } = vi.hoisted(() => ({ browserHubClientMock: vi.fn() }))

vi.mock("@/ui/shell/page-clients", () => ({ browserHubClient: browserHubClientMock }))

beforeEach(() => {
  Object.assign(session, { admitted:true,subject:"test-user",generation:1 })
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
  window.history.replaceState(null, "", "/app/skills")
  browserHubClientMock.mockImplementation(() => createPreviewHubClient())
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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

  const create = screen.getByRole("button", { name: "创建" })
  fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
  fireEvent.click(create)
  fireEvent.click(await screen.findByRole("menuitem", { name: "使用 Kokoro 建立技能" }))

  expect(onPrompt).toHaveBeenCalledWith("帮我使用 /skill-creator 一起创建一个技能。首先问我这个技能应该做什么。")
  expect(screen.queryByRole("menu")).toBeNull()
})

it("starts GitHub with formal Preview rather than the removed URL direct-import shortcut", async () => {
  const client = createPreviewHubClient()
  browserHubClientMock.mockReturnValue(client)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { selection_required: true, repository_url: "https://github.com/acme/skills", commit: "a".repeat(40), paths: ["one", "two"] } }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "github-ui" } }))
  vi.stubGlobal("fetch", fetchMock)
  renderSurface(); await screen.findByTestId("skills-catalog-grid")
  fireEvent.pointerDown(screen.getByRole("button", { name: "创建" })); fireEvent.click(await screen.findByRole("menuitem", { name: "从 GitHub 导入" }))
  const dialog = await screen.findByTestId("github-import-dialog")
  fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/skills" } }); fireEvent.click(within(dialog).getByTestId("github-import-submit"))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hub/skills/github/preview", expect.objectContaining({ body: JSON.stringify({ repository_url: "https://github.com/acme/skills" }) })))
  expect(within(dialog).queryByTestId("github-import-complete")).toBeNull()
})

function GithubHarness({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(true)
  return <LocaleProvider><GithubImportDialog open={open} onOpenChange={setOpen} onImported={onImported} /></LocaleProvider>
}
it.each(["close", "subject"] as const)("blocks duplicate Preview and cancels a pending read on %s without late success", async kind => {
  let resolve!: (response: Response) => void
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => { void input; void init; return new Promise<Response>(accept => { resolve = accept }) })
  vi.stubGlobal("fetch", fetchMock)
  const completed = vi.fn(), view = render(<GithubHarness onImported={completed} />)
  const input = await screen.findByTestId("github-repository-input")
  fireEvent.change(input, { target:{ value:"acme/skills" } })
  fireEvent.keyDown(input, { key:"Enter" }); fireEvent.keyDown(input, { key:"Enter" })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const signal = fetchMock.mock.calls[0]?.[1]?.signal
  if(kind === "close") fireEvent.click(screen.getByRole("button", { name:"关闭 GitHub 导入" }))
  else { session.subject = "another-user"; session.generation++; view.rerender(<GithubHarness onImported={completed} />) }
  await waitFor(() => expect(signal?.aborted).toBe(true))
  resolve(new Response(JSON.stringify({ data:{ selection_required:true,repository_url:"https://github.com/acme/skills",commit:"a".repeat(40),paths:["one","two"] } }), { headers:{ "content-type":"application/json" } }))
  await waitFor(() => expect(completed).not.toHaveBeenCalled())
  expect(screen.queryByRole("button", { name:"one" })).toBeNull()
  expect(screen.queryByTestId("github-import-complete")).toBeNull()
})

it("uses the short Manus creation trigger and preserves all three existing creation choices", async () => {
  renderSurface()
  await screen.findByTestId("skills-catalog-grid")
  const create = screen.getByRole("button", { name: /^创建$/ })
  fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
  fireEvent.click(create)
  const menu = await screen.findByRole("menu")
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(3)
  expect(within(menu).getByRole("menuitem", { name: /^上传技能$/ })).toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: /^从 GitHub 导入$/ })).toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: /^使用 Kokoro 建立技能$/ })).toBeInTheDocument()
})
