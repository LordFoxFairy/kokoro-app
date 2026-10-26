import { useState } from "react"
import { SkillsContent } from "@/ui/skills/skills-panel"
import { GithubImportDialog } from "@/ui/skills/github-import-dialog"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { SkillCatalogDialog } from "@/ui/skills/skills-catalog-dialog"

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
      <KokoroSkillsSurface projectReadBoundary={session} preview brandName="Kokoro" onPrompt={onPrompt} />
    </LocaleProvider>,
  )
  return onPrompt
}

it("loads the Settings catalog cover directly with the session and keeps failed media out of the card", async () => {
  const base = createPreviewHubClient()
  const catalog = await base.listSkillCatalog()
  const first = catalog.skills[0]
  if (!first) throw Error("catalog fixture required")
  const client = { ...base, listSkillCatalog: async () => ({ ...catalog, skills: [{ ...first, cover_image: "/api/hub/skills/settings-artwork/cover" }] }) }
  const view = render(<LocaleProvider><SkillCatalogDialog open inline client={client}
    enabledOverrides={new Map()} installedOverrides={new Map()} busy={null} errorName={null}
    onOpenChange={vi.fn()} onCloseAutoFocus={vi.fn()} onOpenUpload={vi.fn()} onOpenGithub={vi.fn()} onSetEnabled={vi.fn()} onOpenDetail={vi.fn()}
  /></LocaleProvider>)
  const image = await waitFor(() => {
    const node = view.container.querySelector<HTMLImageElement>('img[src$="/api/hub/skills/settings-artwork/cover"]')
    expect(node).not.toBeNull()
    return node!
  })
  expect(image).not.toBeVisible()
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: 120 })
  image.parentElement!.style.position = "relative"
  image.width = 120
  image.height = 120
  fireEvent.load(image)
  await waitFor(() => expect(image).toBeVisible())
  fireEvent.error(image)
  expect(image).not.toBeVisible()
})

it("keeps explicit Settings preview usable without granting a live session or issuing owner requests", async () => {
  const client = createPreviewHubClient()
  const [skill] = await client.listSkillPool()
  if (!skill) throw Error("preview fixture must contain a skill")
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal("fetch", fetch)
  render(<LocaleProvider><SkillsContent readBoundary={{ admitted: false, subject: null, generation: 0 }} client={client} preview pinned={[]} onTogglePin={() => {}} embedded /></LocaleProvider>)
  await screen.findByText(skill.name)
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: skill.name } })
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue(skill.name)
  expect(fetch).not.toHaveBeenCalled()
})

it.each(["local", "github"] as const)("keeps the %s import window across same-actor rechecks without admitting actions or carrying it to another actor", async (source) => {
  const client = createPreviewHubClient()
  const content = (admitted: boolean, subject: string, generation: number) => <LocaleProvider><SkillsContent readBoundary={{ admitted, subject, generation }} client={client} pinned={[]} onTogglePin={() => {}} embedded /></LocaleProvider>
  const view = render(content(true, "upload-window-actor", 1))
  await screen.findByRole("button", { name: "探索技能" })
  fireEvent.keyDown(screen.getByRole("button", { name: "添加" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: source === "local" ? "上传技能" : "从 GitHub 导入技能" }))
  const dialogId = source === "local" ? "skill-upload-dialog" : "github-import-dialog"
  const dialog = await screen.findByTestId(dialogId)
  const action = () => source === "local" ? within(dialog).getByRole("button", { name: "拖放或点击以上传" }) : within(dialog).getByTestId("github-import-submit")
  if (source === "github") fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/skills" } })
  expect(action()).toBeEnabled()

  view.rerender(content(false, "upload-window-actor", 2))
  expect(screen.getByTestId(dialogId)).toBe(dialog)
  expect(action()).toBeDisabled()
  if (source === "local") expect(within(dialog).getByTestId("skill-upload-input")).toBeDisabled()
  else expect(within(dialog).getByTestId("github-repository-input")).toHaveValue("acme/skills")
  view.rerender(content(true, "upload-window-actor", 2))
  expect(screen.getByTestId(dialogId)).toBe(dialog)
  expect(action()).toBeEnabled()

  view.rerender(content(true, "another-upload-actor", 3))
  expect(screen.queryByTestId(dialogId)).toBeNull()
  view.rerender(content(true, "upload-window-actor", 4))
  expect(screen.queryByTestId(dialogId)).toBeNull()
})

it("hands AI skill creation to the shared composer instead of only writing an orphaned pending draft", async () => {
  const onPrompt = renderSurface()
  await screen.findByTestId("skills-catalog-grid")

  const create = screen.getByRole("button", { name: "创建" })
  fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
  fireEvent.click(create)
  fireEvent.click(await screen.findByRole("menuitem", { name: "使用 Kokoro 创建技能" }))

  expect(onPrompt).toHaveBeenCalledWith("帮我使用 /skill-creator 一起创建一个技能。首先问我这个技能应该做什么。")
  expect(screen.queryByRole("menu")).toBeNull()
})

it("starts GitHub with formal Preview rather than the removed URL direct-import shortcut", async () => {
  const client = createPreviewHubClient()
  browserHubClientMock.mockReturnValue(client)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { selection_required: true, repository_url: "https://github.com/acme/skills", commit: "a".repeat(40), paths: ["one", "two"] } }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "github-ui" } }))
  vi.stubGlobal("fetch", fetchMock)
  renderSurface(); await screen.findByTestId("skills-catalog-grid")
  fireEvent.pointerDown(screen.getByRole("button", { name: "创建" })); fireEvent.click(await screen.findByRole("menuitem", { name: "从 GitHub 导入技能" }))
  const dialog = await screen.findByTestId("github-import-dialog")
  fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/skills" } }); fireEvent.click(within(dialog).getByTestId("github-import-submit"))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hub/skills/github/preview", expect.objectContaining({ body: JSON.stringify({ repository_url: "https://github.com/acme/skills" }) })))
  expect(within(dialog).queryByTestId("github-import-complete")).toBeNull()
})

function GithubHarness({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(true)
  return <LocaleProvider><GithubImportDialog readBoundary={session} open={open} onOpenChange={setOpen} onImported={onImported} /></LocaleProvider>
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

it("uses the short Manus creation trigger and exposes the four supported creation choices", async () => {
  renderSurface()
  await screen.findByTestId("skills-catalog-grid")
  const create = screen.getByRole("button", { name: /^创建$/ })
  fireEvent.pointerDown(create, { button: 0, ctrlKey: false })
  fireEvent.click(create)
  const menu = await screen.findByRole("menu")
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(4)
  expect(within(menu).getByRole("menuitem", { name: /^使用 Kokoro 创建技能$/ })).toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: /^记录技能$/ })).toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: /^上传技能$/ })).toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: /^从 GitHub 导入技能$/ })).toBeInTheDocument()
})


it("confirms an update from the first admitted mount and restores keyboard focus when the old update button disappears", async () => {
  const installation = {
    installation_id: "update-installation", series_id: "update-series", source_ref: "skill:update-a", revision: "1", installed: true, enabled: false,
    installed_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", skill_updated_at: "2026-10-15T00:00:00Z", display_name: "Update first mount", summary: "Pinned A", source_status: "active", tags: [], category_keys: [], example_prompts: [], product: { publication_audience: "owner", state_version: "1" }, available_update: { source_ref: "skill:update-b", revision: "2" },
  };
  let upgraded = false;
  const latest = () => upgraded ? { ...installation, source_ref: "skill:update-b", revision: "2", summary: "Pinned B", available_update: undefined } : installation;
  const client = { ...createPreviewHubClient(), listSkillPool: async () => {
    const current = latest();
    return [{ installation_id: current.installation_id, skill_id: current.series_id, source_ref: current.source_ref, installed_source_ref: current.source_ref, revision_skill_id: upgraded ? "update-b" : "update-a", name: current.display_name, description: current.summary, scope: "personal", content_hash: "update-series", enabled: current.enabled, available_update: current.available_update }];
  } };
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") upgraded = true;
    const data = init?.method === "POST" ? { installation: latest(), change: "upgraded", event_id: "update-event", replayed: false } : latest();
    return new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "update-read" } });
  }); vi.stubGlobal("fetch", fetchMock);
  render(<LocaleProvider><SkillsContent readBoundary={session} client={client} pinned={[]} onTogglePin={() => {}} embedded /></LocaleProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "更新至 v2 Update first mount" }));
  const dialog = await screen.findByRole("dialog", { name: "更新技能" });
  await within(dialog).findByText("Update first mount");
  expect(fetchMock).toHaveBeenCalledWith("/api/hub/self/skill-installations/update-installation", expect.objectContaining({ method: "GET" }));
  const confirm = within(dialog).getByRole("button", { name: "确认更新" });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await within(dialog).findByText("更新请求已确认，已读取当前安装状态。");
  fireEvent.click(within(dialog).getByRole("button", { name: /^完成$/ }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "更新技能" })).toBeNull());
  await waitFor(() => expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveFocus());
  expect(screen.queryByRole("button", { name: "更新至 v2 Update first mount" })).toBeNull();
  expect(screen.getByRole("switch", { name: "启用 Update first mount" })).not.toBeChecked();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});


import { invalidate } from "@/lib/query"
import { __resetResourceStore } from "@/lib/query/resource-store"
import { SKILLS_KEY, SKILLS_CATALOG_KEY, skillResourceKey } from "@/ui/skills/skills-resource-cache"

it("keeps an unknown installed pool scaffold distinct from confirmed empty without passive loaders or retry cards", async () => {
  __resetResourceStore()
  const base = createPreviewHubClient()
  let reject!: (error: Error) => void
  const listSkillPool = vi.fn(() => new Promise<Awaited<ReturnType<typeof base.listSkillPool>>>((_, fail) => { reject = fail }))
  const setSkillEnabled = vi.fn(base.setSkillEnabled)
  const client = { ...base, listSkillPool, setSkillEnabled }
  const view = render(<LocaleProvider><SkillsContent client={client} readBoundary={{ admitted: true, subject: "quiet-pool", generation: 1 }} pinned={[]} onTogglePin={vi.fn()} embedded /></LocaleProvider>)
  await waitFor(() => expect(listSkillPool).toHaveBeenCalledOnce())
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toBeVisible()
  expect(screen.getByRole("button", { name: "探索技能" })).toBeVisible()
  expect(view.container.querySelector('[data-slot="skeleton"]')).toBeNull()
  const list = screen.getByTestId("skills-pool-list")
  expect(screen.queryByTestId("skills-empty")).toBeNull()
  await act(async () => { reject(Error("controlled first pool read failure")) })
  expect(screen.getByTestId("skills-pool-list")).toBe(list)
  expect(screen.queryByTestId("skills-empty")).toBeNull()
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  expect(screen.queryByTestId("skills-load-error")).toBeNull()
  expect(listSkillPool).toHaveBeenCalledOnce()
  expect(setSkillEnabled).not.toHaveBeenCalled()
})

it("keeps confirmed installed cards on same-scope refresh failure and retires them with the owner client", async () => {
  __resetResourceStore()
  const base = createPreviewHubClient(), skills = await base.listSkillPool()
  const first = { ...skills[0]!, name: "Retained pool card" }
  let reject!: (error: Error) => void
  const listSkillPool = vi.fn().mockResolvedValueOnce([first]).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  const client = { ...base, listSkillPool }
  const content = (owner = client, subject = "quiet-pool-a", admitted = true) => <LocaleProvider><SkillsContent client={owner} readBoundary={{ admitted, subject, generation: 1 }} pinned={[]} onTogglePin={vi.fn()} embedded /></LocaleProvider>
  const view = render(content())
  const card = await screen.findByText(first.name)
  act(() => invalidate(skillResourceKey(SKILLS_KEY, client)))
  await waitFor(() => expect(reject).toBeTypeOf("function"))
  expect(screen.getByText(first.name)).toBe(card)
  await act(async () => { reject(Error("controlled refresh failure")) })
  expect(screen.getByText(first.name)).toBe(card)
  expect(screen.queryByTestId("skills-refresh-error")).toBeNull()
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  view.rerender(content(client, "quiet-pool-a", false))
  expect(screen.queryByText(first.name)).toBeNull()
  expect(screen.queryByTestId("skills-empty")).toBeNull()
  const nextClient = { ...base, listSkillPool: vi.fn(() => new Promise<Awaited<ReturnType<typeof base.listSkillPool>>>(() => undefined)) }
  view.rerender(content(nextClient, "quiet-pool-b"))
  expect(screen.queryByText(first.name)).toBeNull()
  expect(screen.queryByTestId("skills-empty")).toBeNull()
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toBeVisible()
})

it("keeps the catalog read container unknown on failure, and confirmed cursor cards survive paging errors with ordinary Load more", async () => {
  __resetResourceStore()
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } })
  const base = createPreviewHubClient(), catalog = await base.listSkillCatalog()
  const first = { ...catalog.skills[0]!, name: "Retained cursor card" }
  let rejectInitial!: (error: Error) => void
  const initialClient = { ...base, listSkillCatalog: vi.fn(() => new Promise<typeof catalog>((_, reject) => { rejectInitial = reject })) }
  const content = (client: typeof base) => <LocaleProvider><SkillCatalogDialog open inline client={client} enabledOverrides={new Map()} installedOverrides={new Map()} busy={null} errorName={null} onOpenChange={vi.fn()} onCloseAutoFocus={vi.fn()} onOpenUpload={vi.fn()} onOpenGithub={vi.fn()} onSetEnabled={vi.fn()} onOpenDetail={vi.fn()} /></LocaleProvider>
  const view = render(content(initialClient))
  const list = screen.getByTestId("skills-catalog-scroll")
  expect(view.container.querySelector('[data-slot="skeleton"]')).toBeNull()
  await waitFor(() => expect(rejectInitial).toBeTypeOf("function"))
  await act(async () => { rejectInitial(Error("controlled unknown catalog")) })
  expect(screen.getByTestId("skills-catalog-scroll")).toBe(list)
  expect(screen.queryByTestId("skills-catalog-empty")).toBeNull()
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  const listSkillCatalog = vi.fn().mockResolvedValueOnce({ ...catalog, skills: [first], next_cursor: "next-owned-page" }).mockRejectedValueOnce(Error("controlled next page failure"))
  const confirmed = { ...base, listSkillCatalog }
  view.rerender(content(confirmed))
  const card = await screen.findByRole("button", { name: `查看详情 ${first.name}` })
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  await waitFor(() => expect(listSkillCatalog).toHaveBeenCalledTimes(2))
  expect(screen.getByRole("button", { name: `查看详情 ${first.name}` })).toBe(card)
  expect(screen.getByRole("button", { name: "加载更多" })).toBeEnabled()
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  listSkillCatalog.mockRejectedValueOnce(Error("controlled same-owner refresh"))
  act(() => invalidate(skillResourceKey(SKILLS_CATALOG_KEY, confirmed)))
  await waitFor(() => expect(listSkillCatalog).toHaveBeenCalledTimes(3))
  expect(screen.getByRole("button", { name: `查看详情 ${first.name}` })).toBe(card)
  view.rerender(content({ ...base, listSkillCatalog: vi.fn(() => new Promise<typeof catalog>(() => undefined)) }))
  expect(screen.queryByRole("button", { name: `查看详情 ${first.name}` })).toBeNull()
  expect(screen.queryByTestId("skills-catalog-empty")).toBeNull()
})
