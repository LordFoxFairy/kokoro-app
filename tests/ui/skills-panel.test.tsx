// 技能面板组件测试：池渲染（official/own 徽标）+ 停用成功后离池 + required 撞 409 锁定 +
// 固定回调 + 上传 preview→confirm 两段 + GitHub 单提交导入。hub 客户端为注入 fake（不打网络）。
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRef, useState } from "react"

import { createHubClient, HubClientError, type HubClient } from "@/hub/client"
import type { GithubImportResult, SkillCard } from "@/hub/schemas"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { LocaleProvider } from "@/i18n/context"
import { GithubImportDialog, parseGithubRepository } from "@/ui/skills/github-import-dialog"
import { SkillUploadDialog } from "@/ui/skills/skill-upload-dialog"
import { SkillsContent, SkillsPanel } from "@/ui/skills/skills-panel"

const OFFICIAL: SkillCard = { name: "brainstorming", description: "explore", content_hash: "h1", scope: "official" }
const OWN: SkillCard = { name: "my-skill", description: "mine", content_hash: "h2", scope: "team_1" }

function makeClient(overrides: Partial<HubClient> = {}): HubClient {
  return {
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
    previewUpload: vi.fn(),
    confirmUpload: vi.fn(),
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
  return render(<SkillsPanel client={client} onClose={onClose} pinned={[]} onTogglePin={onTogglePin} />, {
    wrapper: LocaleProvider,
  })
}

function renderEmbedded(client: HubClient) {
  return render(<SkillsContent client={client} pinned={[]} onTogglePin={vi.fn()} embedded />, {
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
        <SkillsContent client={makeClient()} pinned={[]} onTogglePin={vi.fn()} onTrySkill={onTrySkill} />
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
        <SkillsContent client={makeClient()} pinned={[]} onTogglePin={vi.fn()} onTrySkill={onTrySkill} />
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

  it("opens a dedicated GitHub repository flow instead of the zip upload flow", async () => {
    const previewGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/skill-repo",
      default_branch: "main",
      skill: { name: "skill-repo", description: "Imported by the preview client" },
    })
    renderEmbedded(makeClient({ previewGithub }))
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))

    const dialog = await screen.findByTestId("github-import-dialog")
    const input = within(dialog).getByTestId("github-repository-input") as HTMLInputElement
    expect(input).toBeInTheDocument()
    await waitFor(() => expect(input).toHaveFocus())
    expect(within(dialog).getByTestId("github-import-submit")).toBeDisabled()
    expect(screen.queryByLabelText("Choose a zip file")).toBeNull()

    fireEvent.change(input, { target: { value: "https://github.com/acme/skill-repo.git" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))
    expect(await within(dialog).findByTestId("github-import-complete")).toBeInTheDocument()
    expect(previewGithub).toHaveBeenCalledWith("https://github.com/acme/skill-repo", expect.any(AbortSignal))
    expect(screen.queryByLabelText("Choose a zip file")).toBeNull()
  })

  it("submits a valid GitHub repository from the keyboard", async () => {
    const importGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/keyboard-skill",
      default_branch: "main",
      skill: { name: "keyboard-skill", description: "Imported by keyboard" },
    })
    render(
      <LocaleProvider>
        <GithubImportDialog client={makeClient({ importGithub })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    const input = within(dialog).getByTestId("github-repository-input")
    fireEvent.change(input, { target: { value: "acme/keyboard-skill" } })
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    await within(dialog).findByTestId("github-import-complete")
    expect(importGithub).toHaveBeenCalledTimes(1)
  })

  it("gives immediate feedback when Enter is pressed with an invalid repository", async () => {
    const importGithub = vi.fn()
    render(
      <LocaleProvider>
        <GithubImportDialog client={makeClient({ importGithub })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    const input = within(dialog).getByTestId("github-repository-input")
    fireEvent.change(input, { target: { value: "github.com/acme/repo" } })
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/valid GitHub|有效的 GitHub/)
    expect(importGithub).not.toHaveBeenCalled()
    expect(input).toHaveValue("github.com/acme/repo")
  })

  it("persists a local GitHub import and refreshes the embedded skill pool", async () => {
    const client = createPreviewHubClient()
    renderEmbedded(client)
    await screen.findByText("YouTube 影片研究")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/github-skill" } })
    fireEvent.click(await within(dialog).findByTestId("github-import-submit"))
    await within(dialog).findByTestId("github-import-complete")

    fireEvent.click(within(dialog).getByTestId("github-import-done"))
    await waitFor(() => expect(screen.getByText("github-skill")).toBeInTheDocument())
    expect((await client.listSkillPool()).some((skill) => skill.name === "github-skill")).toBe(true)
  })

  it("surfaces a persisted GitHub import and promotes the new skill for immediate verification", async () => {
    const client = createPreviewHubClient()
    renderEmbedded(client)
    await screen.findByText("YouTube 影片研究")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/visible-skill" } })
    fireEvent.click(await within(dialog).findByTestId("github-import-submit"))
    await within(dialog).findByTestId("github-import-complete")

    fireEvent.click(within(dialog).getByTestId("github-import-done"))
    const notice = await screen.findByTestId("github-import-notice")
    expect(notice).toHaveTextContent("visible-skill")
    const cards = Array.from(screen.getAllByRole("button", { name: "visible-skill" }))
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toBeVisible()

    fireEvent.click(within(notice).getByRole("button", { name: "Dismiss import notice" }))
    expect(screen.queryByTestId("github-import-notice")).toBeNull()
  })

  it("validates the GitHub host and repository shape before importing", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    const input = within(dialog).getByTestId("github-repository-input")
    fireEvent.change(input, { target: { value: "https://example.com/acme/skill-repo" } })
    fireEvent.blur(input)

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/valid GitHub|有效的 GitHub/)
    expect(within(dialog).getByTestId("github-import-submit")).toBeDisabled()
  })

  it.each([
    "",
    "github.com/acme/skill-repo",
    "https://example.com/acme/skill-repo",
    "https://github.com.evil.example/acme/skill-repo",
    "https://github.com@evil.example/acme/skill-repo",
    "https://github.com:443/acme/skill-repo",
    "https://github.com/acme//skill-repo",
    "https://github.com/acme/skill-repo/tree/main",
    "https://github.com/acme/skill-repo?tab=readme",
    "https://github.com/acme/skill repo",
  ])("rejects an invalid GitHub repository value before any request: %s", (value) => {
    expect(parseGithubRepository(value)).toBeNull()
  })

  it("canonicalizes a supported GitHub URL without carrying host aliases or clone suffixes", () => {
    expect(parseGithubRepository("  https://www.github.com/acme/skill-repo.git/  ")).toEqual({
      canonical: "https://github.com/acme/skill-repo",
      owner: "acme",
      name: "skill-repo",
    })
  })

  it("enforces the repository boundary again in the hub client", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const importGithub = createHubClient().importGithub
    expect(importGithub).toBeDefined()

    await expect(importGithub!("https://example.com/acme/skill-repo")).rejects.toMatchObject({
      reason: "parse",
      code: "github.invalid_repository",
      status: 400,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps a flat typed BFF error available to the UI boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "github.repository_private", message: "private" }), { status: 422 }),
    ))
    const importGithub = createHubClient().importGithub
    expect(importGithub).toBeDefined()

    await expect(importGithub!("acme/private-skill")).rejects.toMatchObject({
      reason: "http",
      code: "github.repository_private",
      status: 422,
    })
  })

  it("preserves an aborted BFF request as a typed cancellation", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError))
    const importGithub = createHubClient().importGithub
    expect(importGithub).toBeDefined()

    await expect(importGithub!("acme/aborted-skill", new AbortController().signal)).rejects.toMatchObject({
      reason: "aborted",
      code: null,
      status: null,
    })
  })

  it("rejects a GitHub success envelope that includes a token instead of returning it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          repository: "https://github.com/acme/token-leak",
          default_branch: "main",
          skill: { name: "token-leak", description: "fixture" },
          token: "TOKEN",
        },
      })),
    ))
    const importGithub = createHubClient().importGithub
    expect(importGithub).toBeDefined()

    await expect(importGithub!("acme/token-leak")).rejects.toMatchObject({ reason: "parse" })
  })

  it("uses an injected importGithub client through the single submit action", async () => {
    const importGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/live-skill",
      default_branch: "main",
      skill: { name: "live-skill", description: "Imported by the BFF" },
    })
    renderEmbedded(makeClient({ importGithub }))
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/live-skill" } })
    fireEvent.click(await within(dialog).findByTestId("github-import-submit"))

    await waitFor(() => expect(importGithub).toHaveBeenCalledWith("https://github.com/acme/live-skill", expect.any(AbortSignal)))
    expect(await within(dialog).findByTestId("github-import-complete")).toBeInTheDocument()
  })

  it("prefers the persisted import capability when both clients are present", async () => {
    const previewGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/preview-was-not-used",
      default_branch: "main",
      skill: { name: "preview-was-not-used", description: "preview" },
    })
    const importGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/persisted-import",
      default_branch: "main",
      skill: { name: "persisted-import", description: "saved" },
    })
    render(
      <LocaleProvider>
        <GithubImportDialog client={makeClient({ previewGithub, importGithub })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/persisted-import" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))

    await within(dialog).findByTestId("github-import-complete")
    expect(importGithub).toHaveBeenCalledTimes(1)
    expect(previewGithub).not.toHaveBeenCalled()
  })

  it("shows an explicit capability state when GitHub import is not wired", async () => {
    const client = makeClient()
    render(
      <LocaleProvider>
        <GithubImportDialog client={client} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/missing-capability" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))

    expect(await within(dialog).findByTestId("github-import-unavailable")).toHaveTextContent("does not support GitHub skill imports")
  })

  it("maps typed GitHub errors to a recoverable message", async () => {
    const importGithub = vi.fn().mockRejectedValue(
      new HubClientError("http", "not found", "github.repository_not_found", 404),
    )
    render(
      <LocaleProvider>
        <GithubImportDialog client={makeClient({ importGithub })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    const input = within(dialog).getByTestId("github-repository-input")
    fireEvent.change(input, { target: { value: "acme/private-or-missing" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))

    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("repository was not found"))
    expect(within(dialog).getByTestId("github-import-submit")).toBeEnabled()
    expect(within(dialog).getByTestId("github-repository-input")).toHaveAttribute("aria-describedby", expect.stringContaining("github-repository-help"))
    expect(within(dialog).getByTestId("github-repository-input")).toHaveAttribute("aria-describedby", expect.stringContaining("github-repository-error"))
  })

  it("maps a GitHub transport outage to the service-unavailable message", async () => {
    const importGithub = vi.fn().mockRejectedValue(
      new HubClientError("network", "connection refused", null, null),
    )
    render(
      <LocaleProvider>
        <GithubImportDialog client={makeClient({ importGithub })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/network-outage" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))

    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("GitHub import service is temporarily unavailable"))
    expect(within(dialog).getByTestId("github-import-submit")).toBeEnabled()
  })

  it("ignores a duplicate GitHub submit before the first request resolves", async () => {
    let resolveImport!: (result: GithubImportResult) => void
    const importGithub = vi.fn<NonNullable<HubClient["importGithub"]>>(() => new Promise((resolve) => { resolveImport = resolve }))
    render(
      <LocaleProvider>
        <GithubImportDialog client={makeClient({ importGithub })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/one-request" } })
    const submit = within(dialog).getByTestId("github-import-submit")
    fireEvent.click(submit)
    expect(submit).toBeDisabled()
    expect(submit).toHaveAttribute("aria-busy", "true")
    expect(within(dialog).getByTestId("github-repository-input")).toHaveValue("acme/one-request")
    expect(within(dialog).getByTestId("github-repository-input")).toBeDisabled()
    fireEvent.click(submit)

    await waitFor(() => expect(importGithub).toHaveBeenCalledTimes(1))
    resolveImport({
      repository: "https://github.com/acme/one-request",
      default_branch: "main",
      skill: { name: "one-request", description: "Imported once" },
    })
    expect(await within(dialog).findByTestId("github-import-complete")).toBeInTheDocument()
  })

  it("labels a preview-only GitHub client without pretending the skill was saved", async () => {
    const previewGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/preview-only",
      default_branch: "main",
      skill: { name: "preview-only", description: "Read-only preview" },
    })
    const onImported = vi.fn()
    render(
      <LocaleProvider>
        <GithubImportDialog
          client={makeClient({ previewGithub })}
          open
          onOpenChange={vi.fn()}
          onImported={onImported}
        />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/preview-only.git" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))

    const result = await within(dialog).findByTestId("github-import-complete")
    expect(result).toHaveTextContent("Skill details were read; this connection cannot save imports.")
    expect(result).not.toHaveTextContent("The skill was imported into this workspace.")
    expect(previewGithub).toHaveBeenCalledWith("https://github.com/acme/preview-only", expect.any(AbortSignal))
    expect(onImported).not.toHaveBeenCalled()
  })

  it("keeps GitHub import errors visible and recoverable", async () => {
    const client = makeClient({ importGithub: vi.fn().mockRejectedValue(new Error("fixture rejection")) })
    renderEmbedded(client)
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/live-skill" } })
    fireEvent.click(await within(dialog).findByTestId("github-import-submit"))

    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Import failed"))
    expect(within(dialog).getByTestId("github-import-submit")).toBeEnabled()
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/live-skill-2" } })
    expect(within(dialog).queryByRole("alert")).toBeNull()
  })

  it("returns to the input state without showing an error for an active cancellation", async () => {
    const client = makeClient({
      importGithub: vi.fn().mockRejectedValue(new HubClientError("aborted", "cancelled", null, null)),
    })
    render(
      <LocaleProvider>
        <GithubImportDialog client={client} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/aborted-skill" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))

    await waitFor(() => expect(within(dialog).getByTestId("github-import-submit")).toBeEnabled())
    expect(within(dialog).queryByRole("alert")).toBeNull()
    expect(within(dialog).getByTestId("github-repository-input")).toBeInTheDocument()
  })

  it("keeps the imported skill result inside the dialog content band", async () => {
    const importGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/skill-repo",
      default_branch: "main",
      skill: { name: "skill-repo", description: "Imported by the BFF" },
    })
    renderEmbedded(makeClient({ importGithub }))
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/skill-repo" } })
    fireEvent.click(await within(dialog).findByTestId("github-import-submit"))

    const result = await within(dialog).findByTestId("github-import-complete")
    expect(result).toHaveTextContent("The skill was imported into this workspace.")
    expect(result).toHaveTextContent("skill-repo")
    expect(result).toHaveTextContent("main")
    expect(result.querySelectorAll("p")).toHaveLength(2)
  })

  it("marks invalid GitHub input without hiding the form error below the field", async () => {
    renderEmbedded(makeClient())
    await screen.findByText("brainstorming")

    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import from GitHub" }))
    const dialog = await screen.findByTestId("github-import-dialog")
    const input = within(dialog).getByTestId("github-repository-input")
    fireEvent.change(input, { target: { value: "https://example.com/acme/skill-repo" } })
    fireEvent.blur(input)

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument()
    expect(within(dialog).getByTestId("github-import-submit")).toBeDisabled()
    expect(dialog.querySelector('[data-invalid="true"]')).toBeInTheDocument()
  })

  it("cancels an in-flight GitHub import when the dialog closes", async () => {
    let resolveImport!: (result: GithubImportResult) => void
    let requestSignal!: AbortSignal
    const onImported = vi.fn()
    const importGithub = vi.fn<NonNullable<HubClient["importGithub"]>>((_repository, signal) => {
      requestSignal = signal!
      return new Promise<GithubImportResult>((resolve) => {
        resolveImport = resolve
      })
    })
    const client = makeClient({
      importGithub,
    })

    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <LocaleProvider>
          <button type="button" onClick={() => setOpen(true)}>Open import</button>
          <GithubImportDialog client={client} open={open} onOpenChange={setOpen} onImported={onImported} />
        </LocaleProvider>
      )
    }

    render(<Harness />)
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/live-skill" } })
    fireEvent.click(await within(dialog).findByTestId("github-import-submit"))
    await waitFor(() => expect(client.importGithub).toHaveBeenCalled())

    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!)
    await waitFor(() => expect(screen.queryByTestId("github-import-dialog")).toBeNull())
    expect(requestSignal.aborted).toBe(true)
    resolveImport({
      repository: "https://github.com/acme/live-skill",
      default_branch: "main",
      skill: { name: "live-skill", description: "Imported by the BFF" },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onImported).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Open import" }))
    expect(await screen.findByTestId("github-repository-input")).toHaveValue("")
  })

  it("cancels a late response when the parent controls the dialog closed", async () => {
    let resolveImport!: (result: GithubImportResult) => void
    const onImported = vi.fn()
    const importGithub = vi.fn<NonNullable<HubClient["importGithub"]>>(() => new Promise((resolve) => {
      resolveImport = resolve
    }))

    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <LocaleProvider>
          <button type="button" onClick={() => setOpen(false)}>Close parent Settings</button>
          <GithubImportDialog client={makeClient({ importGithub })} open={open} onOpenChange={setOpen} onImported={onImported} />
        </LocaleProvider>
      )
    }

    render(<Harness />)
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/late-response" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))
    await waitFor(() => expect(importGithub).toHaveBeenCalledTimes(1))

    // Radix marks the outside tree aria-hidden while the modal is open. The
    // parent control is still the source of truth for the controlled close,
    // so target the mounted button by text rather than its temporarily hidden
    // accessibility tree.
    fireEvent.click(screen.getByText("Close parent Settings"))
    await waitFor(() => expect(screen.queryByTestId("github-import-dialog")).toBeNull())
    resolveImport({
      repository: "https://github.com/acme/late-response",
      default_branch: "main",
      skill: { name: "late-response", description: "Stale result" },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onImported).not.toHaveBeenCalled()
  })

  it("closes Done back to the parent Settings trigger and preserves the surface", async () => {
    const importGithub = vi.fn().mockResolvedValue({
      repository: "https://github.com/acme/focus-return",
      default_branch: "main",
      skill: { name: "focus-return", description: "Focus fixture" },
    })

    function Harness() {
      const [open, setOpen] = useState(false)
      const triggerRef = useRef<HTMLButtonElement>(null)
      return (
        <LocaleProvider>
          <section data-testid="parent-settings">
            <h1>Settings</h1>
            <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open GitHub import</button>
            <GithubImportDialog
              client={makeClient({ importGithub })}
              open={open}
              onOpenChange={setOpen}
              returnFocusRef={triggerRef}
            />
          </section>
        </LocaleProvider>
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole("button", { name: "Open GitHub import" })
    fireEvent.click(trigger)
    const dialog = await screen.findByTestId("github-import-dialog")
    fireEvent.change(within(dialog).getByTestId("github-repository-input"), { target: { value: "acme/focus-return" } })
    fireEvent.click(within(dialog).getByTestId("github-import-submit"))
    await within(dialog).findByTestId("github-import-complete")

    fireEvent.click(within(dialog).getByTestId("github-import-done"))
    await waitFor(() => expect(screen.queryByTestId("github-import-dialog")).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.getByTestId("parent-settings")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument()
  })

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

  it("previews .skill archives in the dedicated upload dialog and publishes selected candidates", async () => {
    const client = makeClient({
      previewUpload: vi.fn().mockResolvedValue({
        namespace: "team_1",
        candidates: [{ name: "new-skill", valid: true, conflicts: { namespace: false, official: false } }],
      }),
      confirmUpload: vi.fn().mockResolvedValue({
        namespace: "team_1",
        results: [{ name: "new-skill", status: "published", error: null }],
      }),
    })
    render(
      <LocaleProvider>
        <SkillUploadDialog client={client} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("skill-upload-dialog")
    const input = within(dialog).getByTestId("skill-upload-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["skill"], "new.skill", { type: "application/octet-stream" })] } })
    expect(await within(dialog).findByText("new-skill")).toBeInTheDocument()
    expect(client.previewUpload).toHaveBeenCalledWith(expect.anything(), expect.any(AbortSignal))

    fireEvent.click(within(dialog).getByRole("button", { name: "Publish selected" }))
    await waitFor(() => expect(client.confirmUpload).toHaveBeenCalledWith(expect.anything(), ["new-skill"], expect.any(AbortSignal)))
    expect(await within(dialog).findByText("Skill published to this workspace")).toBeInTheDocument()
  })

  it("keeps an invalid upload recoverable without calling the hub", async () => {
    const previewUpload = vi.fn()
    render(
      <LocaleProvider>
        <SkillUploadDialog client={makeClient({ previewUpload })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("skill-upload-dialog")
    const input = within(dialog).getByTestId("skill-upload-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } })
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Upload failed")
    expect(previewUpload).not.toHaveBeenCalled()
    expect(within(dialog).getByRole("button", { name: "Drag and drop or click to upload" })).toBeInTheDocument()
  })

  it("rejects an arbitrary binary file even when its MIME type is octet-stream", async () => {
    const previewUpload = vi.fn()
    render(
      <LocaleProvider>
        <SkillUploadDialog client={makeClient({ previewUpload })} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("skill-upload-dialog")
    fireEvent.change(within(dialog).getByTestId("skill-upload-input"), {
      target: { files: [new File(["binary"], "package.bin", { type: "application/octet-stream" })] },
    })

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Upload failed")
    expect(previewUpload).not.toHaveBeenCalled()
  })

  it("shows a useful empty state when the upload preview contains no candidates", async () => {
    const client = makeClient({
      previewUpload: vi.fn().mockResolvedValue({ namespace: "team_1", candidates: [] }),
    })
    render(
      <LocaleProvider>
        <SkillUploadDialog client={client} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("skill-upload-dialog")
    fireEvent.change(within(dialog).getByTestId("skill-upload-input"), {
      target: { files: [new File(["zip"], "empty.zip", { type: "application/zip" })] },
    })

    expect(await within(dialog).findByTestId("skill-upload-empty")).toBeInTheDocument()
    expect(within(dialog).getByText("No matching skills")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Publish selected" })).toBeDisabled()
  })

  it("aborts an in-flight upload preview when the dialog closes", async () => {
    let resolvePreview!: (value: {
      namespace: string
      candidates: []
    }) => void
    let requestSignal!: AbortSignal
    const previewUpload = vi.fn<NonNullable<HubClient["previewUpload"]>>((_file, signal) => {
      requestSignal = signal!
      return new Promise((resolve) => { resolvePreview = resolve })
    })
    const client = makeClient({ previewUpload })

    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <LocaleProvider>
          <SkillUploadDialog client={client} open={open} onOpenChange={setOpen} />
        </LocaleProvider>
      )
    }

    render(<Harness />)
    const dialog = await screen.findByTestId("skill-upload-dialog")
    fireEvent.change(within(dialog).getByTestId("skill-upload-input"), {
      target: { files: [new File(["zip"], "skills.zip", { type: "application/zip" })] },
    })
    await waitFor(() => expect(previewUpload).toHaveBeenCalledTimes(1))

    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!)
    await waitFor(() => expect(screen.queryByTestId("skill-upload-dialog")).toBeNull())
    expect(requestSignal.aborted).toBe(true)

    resolvePreview({ namespace: "team_1", candidates: [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId("skill-upload-dialog")).toBeNull()
  })

  it("ignores a duplicate publish click before the upload request resolves", async () => {
    let resolveConfirm!: (value: { namespace: string; results: { name: string; status: "published"; revision: number | null; content_hash: string | null; error: null }[] }) => void
    const confirmUpload = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveConfirm = resolve }))
    const client = makeClient({
      previewUpload: vi.fn().mockResolvedValue({
        namespace: "team_1",
        candidates: [{ name: "single-submit", valid: true, conflicts: { namespace: false, official: false } }],
      }),
      confirmUpload,
    })
    render(
      <LocaleProvider>
        <SkillUploadDialog client={client} open onOpenChange={vi.fn()} />
      </LocaleProvider>,
    )

    const dialog = await screen.findByTestId("skill-upload-dialog")
    fireEvent.change(within(dialog).getByTestId("skill-upload-input"), { target: { files: [new File(["zip"], "skills.zip", { type: "application/zip" })] } })
    await within(dialog).findByText("single-submit")
    const publish = within(dialog).getByRole("button", { name: "Publish selected" })
    fireEvent.click(publish)
    fireEvent.click(publish)
    await waitFor(() => expect(confirmUpload).toHaveBeenCalledTimes(1))

    resolveConfirm({ namespace: "team_1", results: [{ name: "single-submit", status: "published", revision: 1, content_hash: "h", error: null }] })
    expect(await within(dialog).findByText("Skill published to this workspace")).toBeInTheDocument()
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

  it("runs the upload preview→confirm two-stage flow", async () => {
    const client = makeClient({
      previewUpload: vi.fn().mockResolvedValue({
        namespace: "team_1",
        candidates: [
          {
            name: "fresh",
            valid: true,
            errors: [],
            description: "d",
            content_hash: "h",
            package_size: 10,
            file_count: 1,
            files: [{ path: "SKILL.md", size: 10 }],
            conflicts: { official: false, namespace: false },
          },
          {
            name: "broken",
            valid: false,
            errors: ["missing SKILL.md"],
            description: null,
            content_hash: null,
            package_size: 0,
            file_count: 0,
            files: [],
            conflicts: { official: false, namespace: false },
          },
        ],
      }),
      confirmUpload: vi.fn().mockResolvedValue({
        namespace: "team_1",
        results: [
          { name: "fresh", status: "published", revision: 1, content_hash: "h", error: null },
          { name: "broken", status: "failed", revision: null, content_hash: null, error: "bad package" },
        ],
      }),
    })
    renderPanel(client)
    await screen.findByText("brainstorming")
    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload a skill" }))
    const dialog = await screen.findByTestId("skill-upload-dialog")
    const file = new File(["zip-bytes"], "skills.zip", { type: "application/zip" })
    const input = within(dialog).getByTestId("skill-upload-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByText("fresh")
    expect(within(dialog).getByText("missing SKILL.md")).toBeInTheDocument()
    expect(client.previewUpload).toHaveBeenCalled()
    fireEvent.click(within(dialog).getByText("Publish selected"))
    await waitFor(() => expect(client.confirmUpload).toHaveBeenCalledWith(expect.anything(), ["fresh"], expect.any(AbortSignal)))
    await within(dialog).findByText("Skill published to this workspace")
    expect(within(dialog).getByText(/bad package/)).toBeInTheDocument()
  })

  it("上传预览或发布期间锁定文件选择，避免并发覆盖当前流程", async () => {
    let resolveConfirm!: (value: { results: { name: string; status: string }[] }) => void
    const client = makeClient({
      previewUpload: vi.fn().mockResolvedValue({
        namespace: "team_1",
        candidates: [{ name: "fresh", valid: true, conflicts: { namespace: false, official: false } }],
      }),
      confirmUpload: vi.fn().mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve })),
    })
    renderPanel(client)
    await screen.findByText("brainstorming")
    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload a skill" }))
    const dialog = await screen.findByTestId("skill-upload-dialog")
    const input = within(dialog).getByTestId("skill-upload-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["zip"], "skills.zip", { type: "application/zip" })] } })
    await within(dialog).findByText("fresh")
    fireEvent.click(within(dialog).getByText("Publish selected"))
    await waitFor(() => expect(client.confirmUpload).toHaveBeenCalled())
    expect(within(dialog).queryByTestId("skill-upload-input")).toBeNull()
    expect(within(dialog).getByRole("button", { name: "Publishing…" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Publishing…" })).toHaveAttribute("aria-busy", "true")
    resolveConfirm({ results: [{ name: "fresh", status: "published" }] })
    await within(dialog).findByText("Skill published to this workspace")
  })

  it("预览失败后可以重新选择同一个 zip", async () => {
    const client = makeClient({
      previewUpload: vi.fn()
        .mockRejectedValueOnce(new Error("preview failed"))
        .mockResolvedValueOnce({
          namespace: "team_1",
          candidates: [{ name: "fresh", valid: true, conflicts: { namespace: false, official: false } }],
        }),
    })
    renderPanel(client)
    await screen.findByText("brainstorming")
    fireEvent.pointerDown(screen.getByRole("button", { name: "Create" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Upload a skill" }))
    const dialog = await screen.findByTestId("skill-upload-dialog")
    const input = within(dialog).getByTestId("skill-upload-input") as HTMLInputElement
    const file = new File(["zip"], "skills.zip", { type: "application/zip" })

    fireEvent.change(input, { target: { files: [file] } })
    await within(dialog).findByText("Upload failed — check the zip and try again")
    fireEvent.click(within(dialog).getByRole("button", { name: "Drag and drop or click to upload" }))
    const retryInput = within(dialog).getByTestId("skill-upload-input") as HTMLInputElement
    fireEvent.change(retryInput, { target: { files: [file] } })

    await within(dialog).findByText("fresh")
    expect(client.previewUpload).toHaveBeenCalledTimes(2)
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
