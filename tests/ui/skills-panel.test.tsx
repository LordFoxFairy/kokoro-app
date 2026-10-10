// 技能面板组件测试：池渲染（official/own 徽标）+ 停用成功后离池 + required 撞 409 锁定 +
// 固定回调 + 本地导入 正规 owner 四阶段 + GitHub 单提交导入。hub 客户端为注入 fake（不打网络）。
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { HubClientError, type HubClient } from "@/hub/client"
import type { SkillCard } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { parseGithubRepository } from "@/ui/skills/github-import-dialog"
import { SkillDetailDialog } from "@/ui/skills/skill-detail-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { SkillsContent, SkillsPanel } from "@/ui/skills/skills-panel"

import { webcrypto } from "node:crypto"
const localImportMock = vi.hoisted(() => ({ begin: vi.fn(), putPackage: vi.fn(), complete: vi.fn(), finalize: vi.fn(), get: vi.fn() }))
vi.mock("@/hub/skill-local-import-client", () => ({ createSkillLocalImportClient: () => localImportMock }))
vi.mock("@/ui/auth/use-session-state", () => ({ useSessionProbe: () => ({ state: "pass", projectReadBoundary: { admitted: true, subject: "test-user", generation: 1 } }) }))
const localExpiry = "2999-01-01T00:00:00Z"
const localSkill = { name: "new-skill", summary: "Owner metadata", series_id: "series", skill_id: "revision" }
const localBegin = { intent_id: "intent", skill_id: "series", upload_id: "upload", phase: "upload_pending", expires_at: localExpiry, transfer_reference: { method: "PUT", url: "https://objects.example/put", required_headers: { "content-type": "application/zip" }, expires_at: localExpiry }, replayed: false }
beforeEach(() => {
  window.sessionStorage.clear()
  vi.stubGlobal("crypto", webcrypto)
  for (const mock of Object.values(localImportMock)) mock.mockReset()
  localImportMock.begin.mockResolvedValue(localBegin)
  localImportMock.putPackage.mockResolvedValue({ source_version_id: "real-version" })
  localImportMock.complete.mockResolvedValue({ intent_id: "intent", skill_id: "series", scan_state: "clean" })
  localImportMock.finalize.mockResolvedValue({ skill: localSkill, installation: { installed: true, enabled: true } })
})

const OFFICIAL: SkillCard = { name: "brainstorming", description: "explore", content_hash: "h1", scope: "official" }
const OWN: SkillCard = { name: "my-skill", description: "mine", content_hash: "h2", scope: "team_1" }

function makeClient(overrides: Partial<HubClient> = {}): HubClient {
  return {
    listPersonalSkills: vi.fn().mockResolvedValue({ skills: [], next_cursor: null }),
    getPublishedPersonalSkill: vi.fn(),
    listMcpConnections: vi.fn().mockResolvedValue({ connections: [] }),
    listSkillPool: vi.fn().mockResolvedValue([OFFICIAL, OWN]),
    listSkillCatalog: vi.fn().mockResolvedValue({ skills: [], next_cursor: null }),
    skillQuota: vi.fn().mockResolvedValue({
      namespace: "team_1",
      package_count: 1,
      package_bytes: 2048,
      max_packages: 20,
      max_bytes: 10_000_000,
    }),
    skillRevisions: vi.fn().mockResolvedValue([]),
    setSkillEnabled: vi.fn().mockResolvedValue(undefined),
    listMcpServers: vi.fn().mockResolvedValue([]),
    registerMcpServer: vi.fn(),
    setMcpEnabled: vi.fn().mockResolvedValue(undefined),
    deleteMcpServer: vi.fn().mockResolvedValue(undefined),
    listMcpSecrets: vi.fn().mockResolvedValue([]),
    createMcpSecret: vi.fn(),
    deleteMcpSecret: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderPanel(client: HubClient, onTogglePin = vi.fn(), onClose = vi.fn()) {
  return render(<SkillsPanel preview client={client} onClose={onClose} pinned={[]} onTogglePin={onTogglePin} />, {
    wrapper: LocaleProvider,
  })
}

function renderEmbedded(client: HubClient) {
  return render(<SkillsContent preview client={client} pinned={[]} onTogglePin={vi.fn()} embedded />, {
    wrapper: LocaleProvider,
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("SkillsPanel", () => {
  it("renders the pool with official/own badges and quota", async () => {
    renderPanel(makeClient())
    await screen.findByText("brainstorming")
    expect(screen.getByText("my-skill")).toBeTruthy()
    // "Official"/"Own" 现同时出现在范围筛选按钮与技能徽标上（≥1 即渲染）。
    expect(screen.getAllByText("Official").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Own").length).toBeGreaterThan(0)
    expect(screen.getByTestId("skills-quota").textContent).toContain("1/20")
    // Repeated card actions retain the skill name in their accessible name;
    // keyboard and screen-reader users can distinguish identical controls.
    expect(screen.getByRole("button", { name: "Pin brainstorming" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Versions brainstorming" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Disable brainstorming" })).toBeInTheDocument()
  })

  it("disables a skill and refetches the pool", async () => {
    const client = makeClient()
    renderPanel(client)
    await screen.findByText("brainstorming")
    // 停用两步:点「停用」入确认态,再点「确认停用」才真停用（破坏性动作前置确认）。
    fireEvent.click(screen.getAllByText("Disable")[0]!)
    await waitFor(() => expect(screen.getByText("Confirm disable")).toHaveFocus())
    fireEvent.click(screen.getByText("Confirm disable"))
    await waitFor(() => expect(client.setSkillEnabled).toHaveBeenCalledWith("brainstorming", false, "official"))
    // 停用成功后重取池（初次 + 停用后 = 2 次）。
    await waitFor(() => expect((client.listSkillPool as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2))
    await waitFor(() => expect(screen.getByPlaceholderText("Search skills")).toHaveFocus())
  })

  it("locks every disable action while one skill mutation is pending", async () => {
    let resolve!: () => void
    const client = makeClient({
      setSkillEnabled: vi.fn(() => new Promise<void>((done) => { resolve = done })),
    })
    renderPanel(client)
    await screen.findByText("brainstorming")

    const disableButtons = screen.getAllByText("Disable")
    fireEvent.click(disableButtons[0]!)
    fireEvent.click(screen.getByText("Confirm disable"))
    await waitFor(() => expect(client.setSkillEnabled).toHaveBeenCalledTimes(1))
    expect(screen.getAllByText("Disable").every((button) => (button as HTMLButtonElement).disabled)).toBe(true)

    resolve()
    await waitFor(() => expect(screen.getAllByText("Disable").some((button) => !(button as HTMLButtonElement).disabled)).toBe(true))
  })

  it("locks a required skill when disable hits 409 hub.skill_required", async () => {
    const client = makeClient({
      setSkillEnabled: vi
        .fn()
        .mockRejectedValue(new HubClientError("http", "required", "hub.skill_required", 409)),
    })
    renderPanel(client)
    await screen.findByText("brainstorming")
    fireEvent.click(screen.getAllByText("Disable")[0]!)
    fireEvent.click(screen.getByText("Confirm disable"))
    // 撞 409 后出现必备锁定徽标（多处，取任一）。
    await waitFor(() => expect(screen.getAllByText("Required").length).toBeGreaterThan(0))
  })

  it("pins a skill via the callback", async () => {
    const onTogglePin = vi.fn()
    renderPanel(makeClient(), onTogglePin)
    await screen.findByText("brainstorming")
    fireEvent.click(screen.getAllByText("Pin")[0]!)
    expect(onTogglePin).toHaveBeenCalledWith("brainstorming")
  })

  it("opens a skill detail surface from the skill identity and can try it", async () => {
    const onTogglePin = vi.fn()
    renderPanel(makeClient(), onTogglePin)
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "brainstorming" }))
    const detail = await screen.findByTestId("skill-detail-dialog")
    expect(within(detail).getByRole("heading", { name: "brainstorming" })).toBeInTheDocument()
    expect(within(detail).getAllByText("SKILL.md").length).toBeGreaterThanOrEqual(2)
    expect(within(detail).getByText("YAML")).toBeInTheDocument()
    expect(within(detail).getByRole("button", { name: "Copy YAML" })).toBeInTheDocument()
    expect(within(detail).getByRole("button", { name: "Try it" })).toBeInTheDocument()

    fireEvent.click(within(detail).getByRole("button", { name: "Try it" }))
    await waitFor(() => expect(screen.queryByTestId("skill-detail-dialog")).toBeNull())
    expect(onTogglePin).toHaveBeenCalledWith("brainstorming")
  })

  it("hands the detail Try action to the shell chat handoff", async () => {
    const onTrySkill = vi.fn()
    render(
      <LocaleProvider>
        <SkillsContent preview client={makeClient()} pinned={[]} onTogglePin={vi.fn()} onTrySkill={onTrySkill} />
      </LocaleProvider>,
    )
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "brainstorming" }))
    const detail = await screen.findByTestId("skill-detail-dialog")
    fireEvent.click(within(detail).getByRole("button", { name: "Try it" }))

    expect(onTrySkill).toHaveBeenCalledWith(OFFICIAL)
    expect(screen.queryByTestId("skill-detail-dialog")).toBeNull()
  })

  it("passes each detail prompt card's visible text to the shell chat handoff", async () => {
    const onTrySkill = vi.fn()
    const prompts = [
      "Help me complete a task with this skill.",
      "What kinds of work is this skill good for?",
      "Show me how to use this skill.",
    ]
    render(
      <LocaleProvider>
        <SkillsContent preview client={makeClient()} pinned={[]} onTogglePin={vi.fn()} onTrySkill={onTrySkill} />
      </LocaleProvider>,
    )
    await screen.findByText("brainstorming")

    for (const prompt of prompts) {
      fireEvent.click(screen.getByRole("button", { name: "brainstorming" }))
      const detail = await screen.findByTestId("skill-detail-dialog")
      fireEvent.click(within(detail).getByRole("button", { name: prompt }))
      expect(onTrySkill).toHaveBeenLastCalledWith(OFFICIAL, prompt)
      await waitFor(() => expect(screen.queryByTestId("skill-detail-dialog")).toBeNull())
    }
  })

  it("keeps browse and create entry points available in the empty embedded pool", async () => {
    const client = makeClient({ listSkillPool: vi.fn().mockResolvedValue([]) })
    renderEmbedded(client)

    await screen.findByTestId("skills-empty")
    expect(screen.getByRole("button", { name: "Browse skills" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    expect(await screen.findByRole("menuitem", { name: "Upload a skill" })).toBeInTheDocument()
    // A standalone SkillsContent has no Composer handoff. Do not silently
    // route the unavailable AI action into the unrelated zip upload flow.
    expect(screen.queryByRole("menuitem", { name: "Create a skill with AI" })).toBeNull()
  })

  it("uses the dedicated upload dialog from the standalone skills panel", async () => {
    renderPanel(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload a skill" }))

    const dialog = await screen.findByTestId("skill-upload-dialog")
    expect(within(dialog).getByRole("heading", { name: "Upload skill" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Upload" })).toBeNull()
  })

  it("opens the real GitHub dialog without using optional generic Hub methods", async () => {
    renderEmbedded(makeClient()); await screen.findByText("brainstorming")
    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" })); fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    expect(within(dialog).getByTestId("github-repository-input")).toHaveAttribute("autocomplete", "url")
    expect(within(dialog).getByTestId("github-import-submit")).toBeDisabled()
  })
  it.each(["github.com/acme/repo", "https://example.com/acme/repo", "https://github.com.evil.example/acme/repo", "https://github.com/acme//repo", "https://github.com/acme/repo/tree/main", "https://github.com/acme/repo?tab=readme"])("rejects invalid repository %s", value => { expect(parseGithubRepository(value)).toBeNull() })
  it("canonicalizes the supported clone URL without changing the provider", () => { expect(parseGithubRepository(" https://www.github.com/acme/skills.git/ ")?.canonical).toBe("https://github.com/acme/skills") })

  it("shows embedded skill mutation errors inside the active card", async () => {
    const client = makeClient({ setSkillEnabled: vi.fn().mockRejectedValue(new Error("fixture rejection")) })
    renderEmbedded(client)
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("switch", { name: "Disable brainstorming" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not disable this skill"))
  })

  it("moves focus into the catalog search when Browse opens", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    await waitFor(() => expect(within(catalog).getByRole("searchbox", { name: "Search skills" })).toHaveFocus())
  })

  it.each([
    ["Upload a skill", "skill-upload-dialog"],
    ["Import from GitHub", "github-import-dialog"],
  ])("waits for the catalog to unmount before opening %s", async (menuLabel, childTestId) => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    fireEvent.pointerDown(within(catalog).getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: menuLabel }))

    await waitFor(() => {
      expect(screen.getByTestId(childTestId)).toBeInTheDocument()
      expect(catalog).not.toBeInTheDocument()
    }, { timeout: 3_000 })
  })

  it("makes catalog create actions leave the catalog for the upload surface", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    fireEvent.pointerDown(within(catalog).getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload a skill" }))

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Skills" })).toBeNull(), { timeout: 3_000 })
    const upload = await screen.findByTestId("skill-upload-dialog")
    expect(within(upload).getByRole("heading", { name: "Upload skill" })).toBeInTheDocument()
    expect(within(upload).getByRole("button", { name: "Drag and drop or click to upload" })).toBeInTheDocument()
    expect(within(upload).getByText("File requirements")).toBeInTheDocument()
    // The Settings content remains the background surface; upload is a
    // dedicated portal and must not resurrect the old inline upload tab.
    expect(screen.getByText("brainstorming")).toBeInTheDocument()
  })

  it("keeps catalog Create actions selectable while autofocus settles", async () => {
    const frames: FrameRequestCallback[] = []
    const animationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    let animationFrameMocked = true

    try {
      renderEmbedded(makeClient())
      await screen.findByText("brainstorming")

      fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
      const catalog = await screen.findByRole("dialog", { name: "Skills" })
      fireEvent.pointerDown(within(catalog).getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
      const uploadAction = await screen.findByRole("menuitem", { name: "Upload a skill" })

      act(() => {
        uploadAction.focus()
        for (const callback of frames.splice(0)) callback(performance.now())
      })

      expect(uploadAction).toBeInTheDocument()
      animationFrame.mockRestore()
      animationFrameMocked = false
      fireEvent.click(uploadAction)
      await waitFor(() => {
        expect(screen.getByTestId("skill-upload-dialog")).toBeInTheDocument()
        expect(catalog).not.toBeInTheDocument()
      })
    } finally {
      if (animationFrameMocked) animationFrame.mockRestore()
    }
  })







  it("hydrates cursor-paginated catalog pages into one scroll surface", async () => {
    const listSkillCatalog = vi.fn()
      .mockResolvedValueOnce({
        skills: [{ name: "page-one", description: "first", content_hash: "catalog:one", scope: "official", installed: false, enabled: false }],
        next_cursor: "page-2",
      })
      .mockResolvedValueOnce({
        skills: [{ name: "page-two", description: "second", content_hash: "catalog:two", scope: "official", installed: false, enabled: false }],
        next_cursor: null,
      })
    renderEmbedded(makeClient({ listSkillCatalog }))
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    expect(await within(catalog).findByText("page-two")).toBeInTheDocument()
    expect(listSkillCatalog).toHaveBeenNthCalledWith(1, { scope: "official", query: "", cursor: undefined })
    expect(listSkillCatalog).toHaveBeenNthCalledWith(2, { scope: "official", query: "", cursor: "page-2" })
  })

  it("does not silently truncate a long cursor-paginated catalog", async () => {
    const pages = Array.from({ length: 21 }, (_, index) => ({
      skills: [{ name: `page-${index + 1}`, description: `page ${index + 1}`, content_hash: `catalog:${index + 1}`, scope: "official" as const, installed: false, enabled: false }],
      next_cursor: index === 20 ? null : `page-${index + 2}`,
    }))
    const listSkillCatalog = vi.fn().mockImplementation(({ cursor }: { cursor?: string } = {}) => {
      const pageIndex = cursor ? Number(cursor.replace("page-", "")) - 1 : 0
      return Promise.resolve(pages[pageIndex])
    })

    renderEmbedded(makeClient({ listSkillCatalog }))
    await screen.findByText("brainstorming")
    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))

    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    expect(await within(catalog).findByText("page-21")).toBeInTheDocument()
    expect(listSkillCatalog).toHaveBeenCalledTimes(21)
  })

  it("routes the catalog GitHub entry to the same repository dialog", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    fireEvent.pointerDown(within(catalog).getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))

    expect(await screen.findByTestId("github-import-dialog")).toBeInTheDocument()
    expect(screen.queryByLabelText("Choose a zip file")).toBeNull()
    expect(screen.queryByRole("dialog", { name: "Skills" })).toBeNull()
  })

  it("closes the Create menu before switching away from the catalog", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    fireEvent.pointerDown(within(catalog).getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))

    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Import from GitHub" })).toBeNull()
      expect(screen.queryByRole("dialog", { name: "Skills" })).toBeNull()
    })
    expect(await screen.findByTestId("github-import-dialog")).toBeInTheDocument()
  })

  it("treats namespace-owned skills as personal in the embedded filter", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("my-skill")

    fireEvent.click(screen.getByRole("radio", { name: /^(Personal|个人)$/ }))
    expect(screen.getByText("my-skill")).toBeInTheDocument()
    expect(screen.queryByText("brainstorming")).toBeNull()
  })

  it("closes the standalone panel through Escape and the overlay", async () => {
    const onClose = vi.fn()
    renderPanel(makeClient(), vi.fn(), onClose)
    await screen.findByText("brainstorming")

    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 500 })

    cleanup()
    const secondClose = vi.fn()
    renderPanel(makeClient(), vi.fn(), secondClose)
    await screen.findByText("brainstorming")
    fireEvent.click(screen.getByTestId("skills-close"))
    await waitFor(() => expect(secondClose).toHaveBeenCalledTimes(1), { timeout: 500 })
  })




  it("uses the wire-format third_party scope and renders third-party catalog results", async () => {
    const listSkillCatalog = vi.fn().mockImplementation(({ scope }: { scope?: string }) => Promise.resolve({
      skills: scope === "third_party"
        ? [{ name: "partner-skill", description: "partner description", content_hash: "catalog:partner", scope: "third_party", installed: false, enabled: false }]
        : [],
      next_cursor: null,
    }))
    renderEmbedded(makeClient({ listSkillCatalog }))
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    fireEvent.click(within(catalog).getByRole("button", { name: /Third-party|第三方/ }))

    expect(await within(catalog).findByText("partner-skill")).toBeInTheDocument()
    expect(listSkillCatalog).toHaveBeenLastCalledWith({ scope: "third_party", query: "", cursor: undefined })
  })

  it("resets catalog search, scope, and menu state when reopened", async () => {
    const client = makeClient({
      listSkillCatalog: vi.fn().mockResolvedValue({
        skills: [{ name: "partner-skill", description: "partner description", content_hash: "catalog:partner", scope: "third_party", installed: false, enabled: false }],
        next_cursor: null,
      }),
    })
    renderEmbedded(client)
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    fireEvent.click(within(catalog).getByRole("button", { name: /Third-party|第三方/ }))
    fireEvent.change(within(catalog).getByRole("searchbox", { name: "Search skills" }), { target: { value: "stale query" } })
    fireEvent.click(within(catalog).getByRole("button", { name: "Close skill catalog" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Skills" })).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const reopened = await screen.findByRole("dialog", { name: "Skills" })
    expect(within(reopened).getByRole("searchbox", { name: "Search skills" })).toHaveValue("")
    expect(within(reopened).getByRole("button", { name: "Official" })).toHaveAttribute("data-active", "true")
    expect(within(reopened).queryByText("stale query")).toBeNull()
  })

  it("offers enable instead of add for an installed but disabled catalog skill", async () => {
    const setSkillEnabled = vi.fn().mockResolvedValue(undefined)
    const listSkillCatalog = vi.fn().mockResolvedValue({
      skills: [{ name: "disabled-skill", description: "disabled description", content_hash: "catalog:disabled", scope: "official", installed: true, enabled: false }],
      next_cursor: null,
    })
    renderEmbedded(makeClient({ listSkillCatalog, setSkillEnabled }))
    await screen.findByText("brainstorming")

    fireEvent.click(screen.getByRole("button", { name: "Browse skills" }))
    const catalog = await screen.findByRole("dialog", { name: "Skills" })
    const enable = await within(catalog).findByRole("button", { name: "Enable disabled-skill" })
    expect(enable).toBeEnabled()
    fireEvent.click(enable)

    await waitFor(() => expect(setSkillEnabled).toHaveBeenCalledWith("disabled-skill", true, "official"))
    expect(within(catalog).getByRole("button", { name: "Added disabled-skill" })).toBeDisabled()
  })
})

function renderImportDialog(onPublished = vi.fn()) { return render(<LocaleProvider><SkillUploadDialog open onOpenChange={vi.fn()} onPublished={onPublished} /></LocaleProvider>) }
function pickImportFile(name = "mine.skill") { fireEvent.change(screen.getByTestId("skill-upload-input"), { target: { files: [new File(["zip"], name, { type: "application/octet-stream" })] } }) }
it("imports a .skill through owner metadata and actual version proof, no selectable preview candidates", async () => {
  const completed = vi.fn(); renderImportDialog(completed); pickImportFile()
  expect(await screen.findByText("new-skill")).toBeInTheDocument()
  expect(await screen.findByText("Skill imported and added to My skills.")).toBeInTheDocument()
  expect(localImportMock.begin).toHaveBeenCalledWith(expect.objectContaining({ filename: "mine.skill", size_bytes: 3, content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }), expect.any(String), expect.any(AbortSignal))
  expect(localImportMock.complete).toHaveBeenCalledWith("intent", expect.objectContaining({ source_version_id: "real-version" }), expect.any(String), expect.any(AbortSignal))
  expect(completed).toHaveBeenCalledOnce()
  expect(screen.queryByRole("checkbox")).toBeNull()
})
it.each(["notes.txt", "package.bin", "UPPER.ZIP"])("rejects invalid archive %s without owner IO and leaves file picker available", async (name) => {
  renderImportDialog(); pickImportFile(name)
  expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed")
  expect(localImportMock.begin).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "Drag and drop or click to upload" })).toBeEnabled()
})
it("owner rejection replaces obsolete empty-candidate preview with useful recoverable error", async () => {
  localImportMock.begin.mockRejectedValue(new HubClientError("http", "invalid metadata", "invalid_local_skill_import_request", 400))
  renderImportDialog(); pickImportFile()
  expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed")
  expect(localImportMock.finalize).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Select and upload again" }))
  expect(screen.getByTestId("skill-upload-input")).toBeInTheDocument()
})
it("close aborts Begin and ignores its late response, while reopening preserves original unknown intent", async () => {
  let resolve!: (data: typeof localBegin) => void
  localImportMock.begin.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
  function Harness() { const [open, setOpen] = useState(true); return <LocaleProvider><button onClick={() => setOpen(true)}>Reopen</button><SkillUploadDialog open={open} onOpenChange={setOpen} /></LocaleProvider> }
  render(<Harness />); pickImportFile()
  await waitFor(() => expect(localImportMock.begin).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "Close skill upload" }))
  expect(localImportMock.begin.mock.calls[0]?.[2].aborted).toBe(true)
  resolve(localBegin); await act(async () => { await Promise.resolve() })
  expect(localImportMock.putPackage).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("unconfirmed")
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await screen.findByText("new-skill")
  expect(localImportMock.begin.mock.calls[1]?.slice(0, 2)).toEqual(localImportMock.begin.mock.calls[0]?.slice(0, 2))
})
it("locks file choice and duplicate continuation during pending Finalize", async () => {
  let resolve!: (value: unknown) => void
  localImportMock.finalize.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
  renderImportDialog(); pickImportFile()
  await waitFor(() => expect(localImportMock.finalize).toHaveBeenCalledOnce())
  expect(screen.queryByTestId("skill-upload-input")).toBeNull()
  expect(screen.getByRole("status")).toHaveTextContent("Importing skill")
  resolve({ skill: localSkill, installation: { installed: true, enabled: true } })
  expect(await screen.findByText("Skill imported and added to My skills.")).toBeInTheDocument()
})
it("unknown Complete retry keeps the original proof/body/key and does not create another upload", async () => {
  localImportMock.complete.mockRejectedValueOnce(new HubClientError("network", "unknown", null, null))
  renderImportDialog(); pickImportFile()
  expect(await screen.findByRole("alert")).toHaveTextContent("unconfirmed")
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await screen.findByText("new-skill")
  expect(localImportMock.complete.mock.calls[1]?.slice(0, 3)).toEqual(localImportMock.complete.mock.calls[0]?.slice(0, 3))
  expect(localImportMock.begin).toHaveBeenCalledOnce(); expect(localImportMock.putPackage).toHaveBeenCalledOnce()
})
it("explicit file replacement recovers a rejected Begin and reselects the same file", async () => {
  localImportMock.begin.mockRejectedValueOnce(new HubClientError("http", "invalid", "invalid_local_skill_import_request", 400))
  renderImportDialog(); pickImportFile(); await screen.findByRole("alert")
  fireEvent.click(screen.getByRole("button", { name: "Select and upload again" })); pickImportFile()
  await screen.findByText("new-skill")
  expect(localImportMock.begin).toHaveBeenCalledTimes(2)
  expect(localImportMock.begin.mock.calls[0]?.[1]).not.toBe(localImportMock.begin.mock.calls[1]?.[1])
})

it("does not expose a fake Share action for a preview skill with no owner identity", () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  render(<LocaleProvider><SkillDetailDialog skill={OFFICIAL} open onOpenChange={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  expect(screen.queryByRole("button", { name: "分享技能" })).toBeNull()
  expect(screen.getByRole("button", { name: "试试看" })).toBeInTheDocument()
})

it("personal lifecycle displays real skill update time and examples in the current detail", async () => {
  const skill = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "真实个人技能", summary: "真实摘要", tags: [], status: "active", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: ["真实例子"], category_keys: [], product: { state_version: "4", publication_audience: "owner", source_kind: "personal" } }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { skills: [skill], next_cursor: null }, meta: { request_id: "owner-1" } }, { headers: { "cache-control": "no-store", "x-request-id": "owner-1" } })))
  const client = makeClient({ listPersonalSkills: vi.fn().mockResolvedValue({ skills: [skill], next_cursor: null }), getPublishedPersonalSkill: vi.fn().mockResolvedValue(skill) })
  render(<LocaleProvider><SkillsContent client={client} preview={false} pinned={[]} onTogglePin={() => {}} /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "真实个人技能" }))
  expect(await screen.findByText("真实例子")).toBeInTheDocument()
  expect(document.querySelector('time[datetime="2026-10-10T00:00:00Z"]')).not.toBeNull()
})
