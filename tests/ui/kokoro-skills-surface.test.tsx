import { createHash, webcrypto } from "node:crypto"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("renders live personal ACTIVE Skills from the BFF page and verifies a selected card by ID", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { skills: [{ source_ref: "skill:mine-1", name: "Mine", description: "Private summary", content_hash: "digest", scope: "personal", revision: "3", enabled: true, categories: [] }], next_cursor: null } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req_list" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { skill_id: "mine-1", source_ref: "skill:mine-1", revision: "3", status: "active", name: "Mine", summary: "Private summary", tags: [] } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req_detail" } }))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)

  expect(await screen.findByText("Mine")).toBeInTheDocument()
  expect(screen.getByText(/skill:mine-1.*3/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /Mine/ }))
  expect(await screen.findByText("Private summary")).toBeInTheDocument()
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/hub/self/skills?scope_kind=personal", "/api/hub/self/skills/mine-1"])
})

it("shows only the formal single-ZIP publish entry in live Skills, not preview/confirm or GitHub import", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { skills: [], next_cursor: null } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "req_list" } }))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByTestId("personal-skills-read")
  expect(screen.queryByRole("button", { name: "上传技能" })).toBeNull()
  expect(screen.queryByText("从 GitHub 导入")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "发布个人技能" }))
  const dialog = await screen.findByTestId("personal-skill-publish-dialog")
  expect(within(dialog).getByLabelText(/ZIP 文件/)).toHaveAttribute("accept", ".zip,application/zip")
  expect(within(dialog).getByLabelText("技能名称")).toBeInTheDocument()
  expect(within(dialog).queryByText(/GitHub|候选|\.skill/)).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

function renderSkills(onOpenSettings = vi.fn(), onCreateSkillWithAi = vi.fn(), onTrySkill = vi.fn()) {
  render(
    <LocaleProvider>
      <KokoroSkillsSurface
        preview
        brandName="Kokoro"
        onPrompt={vi.fn()}
        onOpenSettings={onOpenSettings}
        onCreateSkillWithAi={onCreateSkillWithAi}
        onTrySkill={onTrySkill}
      />
    </LocaleProvider>,
  )
  return { onOpenSettings, onCreateSkillWithAi, onTrySkill }
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
  const { onOpenSettings } = renderSkills()
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

it("routes the skill creator and detail Try action into the shell Chat handoff", async () => {
  const onCreateSkillWithAi = vi.fn()
  const onTrySkill = vi.fn()
  const onPrompt = vi.fn()
  render(
    <LocaleProvider>
      <KokoroSkillsSurface
        preview
        brandName="Kokoro"
        onPrompt={onPrompt}
        onCreateSkillWithAi={onCreateSkillWithAi}
        onTrySkill={onTrySkill}
      />
    </LocaleProvider>,
  )
  await screen.findByTestId("skills-catalog-grid")

  fireEvent.pointerDown(screen.getByRole("button", { name: "建立我的专属技能" }))
  fireEvent.click(await screen.findByRole("menuitem", { name: "使用 Kokoro 建立技能" }))
  expect(onCreateSkillWithAi).toHaveBeenCalledTimes(1)
  expect(onPrompt).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: "查看技能详情 AI 影片生成器" }))
  fireEvent.click(await screen.findByRole("button", { name: "试试看" }))
  expect(onTrySkill).toHaveBeenCalledWith(expect.objectContaining({ name: "AI 影片生成器" }), undefined)
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

it("keeps published Skills separate from current personal installations", async () => {
  const fetchMock = vi.fn().mockImplementation(async (path: string) => new Response(JSON.stringify(path.includes("skill-installations") ? { data: [] } : { data: { skills: [], next_cursor: null } }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "installation-read" } }))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "本人安装" }))
  await screen.findByText("暂无符合筛选条件的安装")
  expect(fetchMock.mock.calls.some(([path]) => path === "/api/hub/self/skill-installations?installed=true&limit=50")).toBe(true)
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
})

const installedSkill = { installation_id: "installation-1", source_ref: "skill:mine-1", series_id: "series-1", revision: "3", installed: true, enabled: true, installed_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z" }
const publishedPage = { data: { skills: [{ source_ref: "skill:mine-1", name: "Mine", description: "Summary", content_hash: "digest", scope: "personal", revision: "3", enabled: true, categories: [] }] } }
function installationResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "installation-ui" } })
}

it("retries unknown install with the same frozen key and reads current state after historical receipt", async () => {
  const requests: RequestInit[] = []
  const onPrompt = vi.fn(), onTrySkill = vi.fn()
  const fetchMock = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      requests.push(init)
      if (requests.length === 1) throw new Error("lost ACK")
      return installationResponse({ data: { installation: installedSkill, change: "installed", event_id: "e1", replayed: true } })
    }
    if (path.endsWith("/installation-1")) return installationResponse({ data: { ...installedSkill, installed: false, enabled: false, removed_at: "2026-09-30T11:00:00Z" } })
    return installationResponse(publishedPage)
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={onPrompt} onTrySkill={onTrySkill} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "安装此技能" }))
  await screen.findByText(/结果未知/)
  expect(screen.getByRole("button", { name: "安装此技能" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  const state = await screen.findByTestId("installation-current")
  expect(state).toHaveTextContent("已移除")
  expect(state).toHaveTextContent("已停用")
  expect(requests).toHaveLength(2)
  expect(requests[1]?.body).toBe(requests[0]?.body)
  expect(requests[1]?.headers).toEqual(requests[0]?.headers)
  expect(fetchMock.mock.calls.filter(([path]) => path.endsWith("/installation-1"))).toHaveLength(1)
  expect(onPrompt).not.toHaveBeenCalled()
  expect(onTrySkill).not.toHaveBeenCalled()
})

it("does not resubmit acknowledged installation when current read fails", async () => {
  let reads = 0
  const fetchMock = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "POST") return installationResponse({ data: { installation: installedSkill, change: "installed", event_id: "e1", replayed: false } })
    if (path.endsWith("/installation-1")) {
      if (++reads === 1) throw new Error("read failed")
      return installationResponse({ data: installedSkill })
    }
    return installationResponse(publishedPage)
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "安装此技能" }))
  await screen.findByText("命令已确认，当前状态仍待核对。")
  fireEvent.click(screen.getByRole("button", { name: "核对当前状态" }))
  await screen.findByTestId("installation-current")
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  expect(reads).toBe(2)
})

it("serializes actions, cancels on navigation and ignores a late installation receipt", async () => {
  let finish!: (response: Response) => void
  let mutationSignal: AbortSignal | null = null
  const fetchMock = vi.fn((path: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      mutationSignal = init.signal ?? null
      return new Promise<Response>((resolve) => { finish = resolve })
    }
    return Promise.resolve(installationResponse(path.includes("skill-installations") ? { data: [] } : publishedPage))
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  const install = await screen.findByRole("button", { name: "安装此技能" })
  fireEvent.click(install)
  fireEvent.click(install)
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: "本人安装" }))
  expect(mutationSignal).toHaveProperty("aborted", true)
  await screen.findByText(/结果未知/)
  finish(installationResponse({ data: { installation: installedSkill, change: "installed", event_id: "e", replayed: false } }))
  await screen.findByText("暂无符合筛选条件的安装")
  expect(screen.queryByTestId("installation-current")).toBeNull()
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/installation-1"))).toBe(false)
})

it("keeps false filter presence and resets cursor, ignoring cancelled previous-page results", async () => {
  let late!: (response: Response) => void
  let pageSignal: AbortSignal | null = null
  const fetchMock = vi.fn((path: string, init: RequestInit = {}) => {
    if (!path.includes("skill-installations")) return Promise.resolve(installationResponse(publishedPage))
    const url = new URL(path, "http://localhost")
    if (url.searchParams.has("cursor")) { pageSignal = init.signal ?? null; return new Promise<Response>((resolve) => { late = resolve }) }
    return Promise.resolve(installationResponse(url.searchParams.get("installed") === "false" ? { data: [] } : { data: [installedSkill], meta: { next_cursor: "opaque-page-2" } }))
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "本人安装" }))
  const section = await screen.findByTestId("personal-installations")
  fireEvent.click(await within(section).findByRole("button", { name: "下一页" }))
  await waitFor(() => expect(pageSignal).not.toBeNull())
  fireEvent.keyDown(screen.getByRole("combobox", { name: "安装状态" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("option", { name: "已移除" }))
  await screen.findByText("暂无符合筛选条件的安装")
  expect(pageSignal).toHaveProperty("aborted", true)
  late(installationResponse({ data: [installedSkill] }))
  await waitFor(() => expect(within(section).queryByText(/skill:mine-1/)).toBeNull())
  const last = fetchMock.mock.calls.at(-1)?.[0]
  expect(last).toBe("/api/hub/self/skill-installations?installed=false&limit=50")
})

it("uses installation IDs for disable/remove, with no public source read gate", async () => {
  const removed = { ...installedSkill, installed: false, enabled: false, removed_at: "2026-09-30T11:00:00Z" }
  let current = installedSkill
  const fetchMock = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "PUT") { current = { ...installedSkill, enabled: false }; return installationResponse({ data: { installation: current, change: "disabled", event_id: "e1", replayed: false } }) }
    if (init.method === "DELETE") { current = removed; return installationResponse({ data: { installation: removed, change: "removed", event_id: "e2", replayed: false } }) }
    if (path.endsWith("/installation-1")) return installationResponse({ data: current })
    return installationResponse(path.includes("skill-installations") ? { data: [current] } : publishedPage)
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "本人安装" }))
  fireEvent.click(await screen.findByRole("button", { name: "停用" }))
  await waitFor(() => expect(screen.getByTestId("installation-current")).toHaveTextContent("已停用"))
  fireEvent.click(await screen.findByRole("button", { name: "移除安装" }))
  await waitFor(() => expect(screen.getByTestId("installation-current")).toHaveTextContent("已移除"))
  expect(fetchMock.mock.calls.some(([path, init]) => path === "/api/hub/self/skill-installations/installation-1/enabled" && init?.body === '{"enabled":false}')).toBe(true)
  expect(fetchMock.mock.calls.some(([path, init]) => path === "/api/hub/self/skill-installations/installation-1" && init?.method === "DELETE" && !init.body)).toBe(true)
  expect(fetchMock.mock.calls.some(([path]) => path === "/api/hub/self/skills/mine-1")).toBe(false)
})

it.each([401, 403])("shows denied installation %i without automatic mutation retries", async (status) => {
  const fetchMock = vi.fn(async (_path: string, init: RequestInit = {}) => installationResponse(init.method === "POST" ? { error: { code: status === 401 ? "session_invalid" : "skill_installation_forbidden", message: "SENTINEL", retryable: false } } : publishedPage, init.method === "POST" ? status : 200))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "安装此技能" }))
  await screen.findByText("当前身份无权执行此操作，请检查登录状态。")
  expect(screen.queryByText("SENTINEL")).toBeNull()
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
})

it("does not discard an unknown command identity when a recovery attempt is denied", async () => {
  const mutations: RequestInit[] = []
  const fetchMock = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      mutations.push(init)
      if (mutations.length === 1) throw new Error("lost ACK")
      if (mutations.length === 2) return installationResponse({ error: { code: "session_invalid", message: "expired", retryable: false } }, 401)
      return installationResponse({ data: { installation: installedSkill, change: "installed", event_id: "event", replayed: true } })
    }
    return installationResponse(path.endsWith("/installation-1") ? { data: installedSkill } : publishedPage)
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "安装此技能" }))
  fireEvent.click(await screen.findByRole("button", { name: "重试" }))
  await screen.findByText("当前身份无权执行此操作，请检查登录状态。")
  expect(screen.getByRole("button", { name: "安装此技能" })).toBeDisabled()
  expect(mutations).toHaveLength(2)
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  await screen.findByTestId("installation-current")
  expect(mutations).toHaveLength(3)
  expect(mutations.map((init) => init.headers)).toEqual([mutations[0]?.headers, mutations[0]?.headers, mutations[0]?.headers])
})


it("refreshes the published list after real publish flow without an installation side effect", async () => {
  const sha = createHash("sha256").update("zip").digest("hex")
  vi.stubGlobal("crypto", webcrypto)
  const fetchMock = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "https://objects.example/put") return new Response(null, { status: 200 })
    if (path.endsWith("/drafts")) return installationResponse({ data: { skill_id: "mine-1", series_id: "series-1", revision: 1, status: "draft", replayed: false } }, 201)
    if (path.endsWith("/package-upload") && init.method === "GET") return installationResponse({ data: { skill_id: "mine-1", attempt_epoch: "0", phase: "none" } })
    if (path.endsWith("/package-upload")) return installationResponse({ data: { skill_id: "mine-1", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false } }, 201)
    if (path.endsWith("/complete")) return installationResponse({ data: { skill_id: "mine-1", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, content_sha256: sha, scan_state: "clean" } })
    if (path.endsWith("/validate")) return installationResponse({ data: { skill_id: "mine-1", series_id: "series-1", valid: true, content_digest: sha, manifest_identity: `zip-v1:sha256:${sha}`, replayed: false } })
    if (path.endsWith("/publish")) return installationResponse({ data: { source_ref: "skill:mine-1", revision: "3", status: "active", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false } })
    if (path === "/api/hub/self/skills?scope_kind=personal") return installationResponse(publishedPage)
    throw new Error("Unexpected request")
  })
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  await screen.findByText("Mine")
  fireEvent.click(screen.getByRole("button", { name: "发布个人技能" }))
  const dialog = await screen.findByTestId("personal-skill-publish-dialog")
  const file = new File(["zip"], "mine.zip", { type: "application/zip" })
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("zip").buffer })
  fireEvent.change(within(dialog).getByLabelText(/ZIP 文件/), { target: { files: [file] } })
  fireEvent.change(within(dialog).getByLabelText("技能名称"), { target: { value: "Mine" } })
  fireEvent.submit(dialog.querySelector("form")!)
  await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path === "/api/hub/self/skills?scope_kind=personal")).toHaveLength(2))
  expect(fetchMock.mock.calls.some(([path]) => path.includes("skill-installations"))).toBe(false)
  expect(fetchMock.mock.calls.some(([path]) => path.includes("/session"))).toBe(false)
})

it("rejects a non-advancing installation cursor instead of leaving pagination stuck loading", async () => {
  const fetchMock = vi.fn(async (path: string) => installationResponse(path.includes("skill-installations") ? { data: [], meta: { next_cursor: "same-cursor" } } : publishedPage))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "本人安装" }))
  const section = await screen.findByTestId("personal-installations")
  fireEvent.click(await within(section).findByRole("button", { name: "下一页" }))
  expect(await within(section).findByRole("alert")).toHaveTextContent("请求被拒绝")
})
