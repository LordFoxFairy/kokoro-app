import { readFileSync } from "node:fs"
import { StrictMode } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { PersonalSkillsRead } from "@/ui/skills/personal-skills-read"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { LocaleProvider } from "@/i18n/context"
import { invalidate } from "@/lib/query"
import { createHubClient, type HubClient } from "@/hub/client"
import { createManusSkillHubClient, getManusSkillDetail, downloadManusSkill, getManusSkillPackage, SKILL_CATALOG_RESOURCE_KEY } from "@/ui/skills/manus-skill-client"

const sessionBoundary = vi.hoisted(() => ({ admitted: true, subject: "test-user", generation: 1 }))
vi.mock("@/ui/auth/use-session-state", () => ({ useSessionProbe: () => ({ state: "pass", projectReadBoundary: sessionBoundary }) }))

const catalog = {
  skills: [{
    skillId: "skill-manim", displayName: "Manim 动画师", userDescription: "使用 Manim 生成数学动画。",
    usageCount: "37000", publisherType: "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL",
    tags: { values: ["SKILL_HUB_TAG_MEDIA"] }, exampleQuestions: ["创建一个几何证明动画。"],
    currentVersion: { versionUid: "skill-manim" }, createdAt: "2026-05-22T00:00:00.000Z", coverImage: "/api/v1/skills/skill-manim/cover",
  }], tagOptions: { values: [] }, nextPageToken: undefined,
}

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } })
}

function renderLive(onTrySkill = vi.fn()) {
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} onTrySkill={onTrySkill} /></LocaleProvider>)
  return onTrySkill
}

beforeEach(() => {
  sessionBoundary.admitted = true
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
  invalidate("hub/skills/standalone-catalog")
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it("uses the distinct Manus DownloadSkill service operation", async () => {
  const fetchMock = vi.fn(async () => response({
    skill: { id: "skill-manim", displayName: "Manim 动画师" },
    downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" },
  }))
  vi.stubGlobal("fetch", fetchMock)
  await expect(downloadManusSkill("skill-manim")).resolves.toMatchObject({ downloadInfo: { filename: "manim.skill" } })
  expect(fetchMock).toHaveBeenCalledWith("/api/skill.v1.SkillService/DownloadSkill", expect.objectContaining({ method: "POST", body: JSON.stringify({ skillId: "skill-manim" }) }))
})

it("uses the exact Manus-style list operations, not the retired flattened catalog endpoint", async () => {
  const fetchMock = vi.fn(async (path: string, _init?: RequestInit) => {
    void _init
    if (path.endsWith("/ListHubSkills")) return response(catalog)
    if (path.endsWith("/ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()

  expect(await screen.findByRole("button", { name: "Manim 动画师" })).toBeInTheDocument()
  expect(screen.getByText("已使用 37k 次")).toBeInTheDocument()
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/api/skill.v1.SkillOptionalService/ListHubSkills",
    "/api/skill.v1.SkillOptionalService/ListSkills",
  ])
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ pageSize: 30, includeOfficialSkills: true })
})

it("loads one Manus catalog page at a time instead of eagerly walking every cursor", async () => {
  const secondPage = {
    ...catalog,
    skills: [{
      skillId: "skill-search", displayName: "互联网技能搜索器", userDescription: "从已验证的仓库中搜索技能。",
      publisherType: "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL",
      tags: { values: ["SKILL_HUB_TAG_AUTOMATION"] }, currentVersion: { versionUid: "skill-search" },
    }],
    nextPageToken: undefined,
  }
  const firstPage = { ...catalog, nextPageToken: "page-2" }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/ListHubSkills")) {
      return JSON.parse(String(init?.body)).pageToken === "page-2" ? response(secondPage) : response(firstPage)
    }
    if (path.endsWith("/ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()

  expect(await screen.findByRole("button", { name: "Manim 动画师" })).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("ListHubSkills"))).toHaveLength(1)
  expect(screen.queryByRole("button", { name: "互联网技能搜索器" })).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "加载更多" }))
  expect(await screen.findByRole("button", { name: "互联网技能搜索器" })).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("ListHubSkills"))).toHaveLength(2)
  expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("ListSkills"))).toHaveLength(2)
})

it("keeps the confirmed Manus catalog across a route remount without duplicate list reads", async () => {
  const fetchMock = vi.fn(async (path: string) => response(path.endsWith("ListHubSkills") ? catalog : { userAddedSkills: [], officialSkills: [] }))
  vi.stubGlobal("fetch", fetchMock)
  renderLive()
  await screen.findByRole("button", { name: "Manim 动画师" })
  cleanup()

  renderLive()
  expect(await screen.findByRole("button", { name: "Manim 动画师" })).toBeInTheDocument()
  expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("ListHubSkills"))).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("ListSkills"))).toHaveLength(1)
})

it("uses the Manus desktop category filter instead of a category rail", async () => {
  const fetchMock = vi.fn(async (path: string) => response(path.endsWith("ListHubSkills") ? catalog : { userAddedSkills: [], officialSkills: [] }))
  vi.stubGlobal("fetch", fetchMock)
  renderLive()
  await screen.findByTestId("skills-catalog-grid")

  expect(screen.queryByRole("navigation", { name: "技能分类" })).toBeNull()
  const filter = screen.getByRole("button", { name: "技能分类：全部" })
  fireEvent.pointerDown(filter, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole("menuitem", { name: "媒体" }))
  expect(screen.getByRole("button", { name: "技能分类：媒体" })).toBeInTheDocument()
})

it("opens the Manus detail from the whole catalog card body, not only its illustration or title", async () => {
  const fetchMock = vi.fn(async (path: string) => {
    if (path.endsWith("/ListHubSkills")) return response(catalog)
    if (path.endsWith("/ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("/GetSkill")) return response({
      skill: { id: "skill-manim", displayName: "Manim 动画师", userDescription: "使用 Manim 生成数学动画。", exampleQuestions: ["创建一个几何证明动画。"], tags: { values: ["SKILL_HUB_TAG_MEDIA"] }, added: false },
      downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" },
    })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()

  fireEvent.click(await screen.findByText("使用 Manim 生成数学动画。"))
  expect(await screen.findByTestId("manus-skill-detail-dialog")).toBeInTheDocument()
})

it("opens a stable server-backed detail dialog with real detail fields and examples", async () => {
  const fetchMock = vi.fn(async (path: string) => {
    if (path.endsWith("/ListHubSkills")) return response(catalog)
    if (path.endsWith("/ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("/GetSkill")) return response({
      skill: { id: "skill-manim", displayName: "Manim 动画师", userDescription: "使用 Manim 生成数学动画。", exampleQuestions: ["创建一个几何证明动画。"], tags: { values: ["SKILL_HUB_TAG_MEDIA"] }, updatedAt: "2026-05-22T00:00:00.000Z", added: false },
      downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" },
    })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "查看技能详情 Manim 动画师" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  expect(await screen.findByText("创建一个几何证明动画。")).toBeInTheDocument()
  expect(dialog).toHaveTextContent("已使用 37,000 次")
  expect(dialog).not.toHaveTextContent("技术详情")
  expect(fetchMock.mock.calls.some(([path]) => path.endsWith("/GetSkill"))).toBe(true)
})

it("reopens a confirmed skill detail without a second request or loading flash", async () => {
  const fetchMock = vi.fn(async (path: string) => {
    if (path.endsWith("/ListHubSkills")) return response(catalog)
    if (path.endsWith("/ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("/GetSkill")) return response({
      skill: { id: "skill-manim", displayName: "Manim 动画师", userDescription: "使用 Manim 生成数学动画。", exampleQuestions: ["创建一个几何证明动画。"], added: false },
      downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" },
    })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()

  fireEvent.click(await screen.findByRole("button", { name: "查看技能详情 Manim 动画师" }))
  await screen.findByText("创建一个几何证明动画。")
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  fireEvent.click(await screen.findByRole("button", { name: "查看技能详情 Manim 动画师" }))

  expect(await screen.findByText("创建一个几何证明动画。")).toBeInTheDocument()
  expect(screen.queryByText("正在加载技能详情…")).toBeNull()
  expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("/GetSkill"))).toHaveLength(1)
})

it("does not retain a previous skill action while the next detail is loading", async () => {
  const catalogWithTwoSkills = {
    tagOptions: { values: [] },
    skills: [catalog.skills[0], {
      skillId: "skill-search", displayName: "互联网技能搜索器", userDescription: "从已验证的仓库中搜索技能。",
      tags: { values: ["SKILL_HUB_TAG_AUTOMATION"] },
    }],
  }
  let resolveSecond: ((value: Response) => void) | undefined
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path.endsWith("ListHubSkills")) return Promise.resolve(response(catalogWithTwoSkills))
    if (path.endsWith("ListSkills")) return Promise.resolve(response({ userAddedSkills: [], officialSkills: [] }))
    if (path.endsWith("GetSkill")) {
      const skillId = JSON.parse(String(init?.body)).skillId
      if (skillId === "skill-manim") return Promise.resolve(response({
        skill: { id: "skill-manim", displayName: "Manim 动画师" },
        downloadInfo: { downloadUrl: "/api/skill-downloads/one", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" },
      }))
      return new Promise<Response>((resolve) => { resolveSecond = resolve })
    }
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()

  fireEvent.click(await screen.findByRole("button", { name: "查看技能详情 Manim 动画师" }))
  expect(await screen.findByRole("button", { name: "下载技能" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Close" }))
  fireEvent.click(await screen.findByRole("button", { name: "查看技能详情 互联网技能搜索器" }))
  expect(screen.queryByRole("button", { name: "下载技能" })).toBeNull()
  resolveSecond?.(response({
    skill: { id: "skill-search", displayName: "互联网技能搜索器" },
    downloadInfo: { downloadUrl: "/api/skill-downloads/two", filename: "search.skill", expiresAt: "2026-10-10T00:00:00.000Z" },
  }))
  expect(await screen.findByRole("button", { name: "下载技能" })).toBeInTheDocument()
})

it("adds the server-selected skill through the typed installation boundary", async () => {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/ListHubSkills")) return response(catalog)
    if (path.endsWith("/ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path === "/api/hub/self/skill-installations" && init?.method === "POST") return response({ data: { installation: { display_name: "Mine", summary: "Summary", source_status: "active", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "5" }, tags: [], installation_id: "i1", source_ref: "skill:skill-manim", series_id: "skill-manim", revision: "1", installed: true, enabled: true, installed_at: "2026-10-10T00:00:00.000Z", updated_at: "2026-10-10T00:00:00.000Z" }, change: "installed", event_id: "event-1", replayed: false } })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "添加 Manim 动画师" }))
  await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === "/api/hub/self/skill-installations")).toBe(true))
  const call = fetchMock.mock.calls.find(([path]) => path === "/api/hub/self/skill-installations")
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ source_ref: "skill:skill-manim" })
})

const dialogLocales = [
  { locale: "zh", share: "分享技能", download: "下载技能", add: "添加到我的技能", added: "已添加到我的技能", loading: "正在加载技能详情…", failed: "技能详情暂时不可用", updated: "更新于 2026年5月22日", used: "已使用 37,000 次" },
  { locale: "en", share: "Share skill", download: "Download skill", add: "Add to my skills", added: "Added to my skills", loading: "Loading skill details…", failed: "Skill details are temporarily unavailable", updated: "Updated May 22, 2026", used: "Used 37,000 times" },
] as const
const localizedSkill = { skill_id: "skill-manim", revision_skill_id: "revision-manim", name: "Manim", description: "Server description", content_hash: "owner-checksum", scope: "official", enabled: false, installed: false, usage_count: "37000" }

it.each(dialogLocales)("localizes $locale dialog loading, metadata, aria and actions without changing callbacks", async (labels) => {
  window.localStorage.setItem("kokoro.locale", labels.locale)
  let finish: ((value: Response) => void) | undefined
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve })))
  const onAdd = vi.fn()
  const onTry = vi.fn()
  render(<LocaleProvider><ManusSkillDetailDialog skill={localizedSkill} publisherLabel="Kokoro" open onOpenChange={vi.fn()} onAdd={onAdd} onTry={onTry} /></LocaleProvider>)
  expect(await screen.findByText(labels.loading)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: labels.share })).toBeInTheDocument()
  finish!(response({ skill: { id: "skill-manim", displayName: "Manim", updatedAt: "2026-05-22T00:00:00.000Z", exampleQuestions: ["Real example"], added: false }, downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" } }))
  expect(await screen.findByRole("button", { name: labels.download })).toBeEnabled()
  const dialog = screen.getByTestId("manus-skill-detail-dialog")
  expect(dialog).toHaveTextContent(labels.updated)
  expect(dialog).toHaveTextContent(labels.used)
  expect(dialog).toHaveTextContent("Kokoro")
  expect(dialog).not.toHaveTextContent("Manus")
  fireEvent.click(screen.getByRole("button", { name: labels.add }))
  expect(onAdd).toHaveBeenCalledWith(localizedSkill)
  fireEvent.click(screen.getByRole("button", { name: "Real example" }))
  expect(onTry).toHaveBeenCalledWith("Real example")
})

it.each(dialogLocales)("localizes $locale installed action and preserves disabled state", async (labels) => {
  window.localStorage.setItem("kokoro.locale", labels.locale)
  vi.stubGlobal("fetch", vi.fn(async () => response({ skill: { id: "skill-manim", displayName: "Manim", added: true }, downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" } })))
  render(<LocaleProvider><ManusSkillDetailDialog skill={localizedSkill} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  expect(await screen.findByRole("button", { name: labels.added })).toBeDisabled()
})

it.each(dialogLocales)("localizes $locale actual detail read failure", async (labels) => {
  window.localStorage.setItem("kokoro.locale", labels.locale)
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("owner unavailable")))
  render(<LocaleProvider><ManusSkillDetailDialog skill={localizedSkill} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  expect(await screen.findByText(labels.failed)).toBeInTheDocument()
})

it("shares one owner detail read across StrictMode's effect replay", async () => {
  const fetchMock = vi.fn(async () => response({ skill: { id: "skill-manim", displayName: "Manim" }, downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "manim.skill", expiresAt: "2026-10-10T00:00:00.000Z" } }))
  vi.stubGlobal("fetch", fetchMock)
  render(<StrictMode><LocaleProvider><ManusSkillDetailDialog skill={localizedSkill} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider></StrictMode>)
  await screen.findByRole("button", { name: "下载技能" })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

// The actual 939bf0e read projection, including optional owner metadata.
const ownerRevision = "revision-current"
const ownerHub = {
  skills: [{ skillId: "series-current", originalName: "original", displayName: "Current", userDescription: "Summary", icon: { type: "image", value: "icon" }, publishStatus: "SKILL_HUB_PUBLISH_STATUS_PUBLISHED", currentVersion: { versionUid: ownerRevision, checksum: "a".repeat(64), archiveSize: "123", fileCount: 1, status: "SKILL_HUB_VERSION_STATUS_AVAILABLE", current: true, createdAt: "2026-10-10T00:00:00Z", sourceRevision: "source", sourceRevisionAt: "date", licenseSpdxId: "MIT", licenseUrl: "license" }, sortOrder: "1", createdAt: "2026-10-10T00:00:00Z", publisherType: "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL", verified: true, usageCount: "3", exampleQuestions: ["Real example"], tags: { values: ["SKILL_HUB_TAG_APPS"] }, type: "skill", coverImage: `/api/v1/skills/${ownerRevision}/cover`, source: { type: "git", url: "source", owner: "owner", repository: "repository", ref: "main", path: "SKILL.md", stars: "1", forks: "2", latestCommitSha: "commit", latestCommitAt: "date", licenseSpdxId: "MIT", licenseUrl: "url", licenseStatus: "available", licenseCategory: "permissive", pathCommitAt: "date" }, syncStatus: "current", cmsUpdatedAt: "date" }],
  tagOptions: { values: [{ tag: "SKILL_HUB_TAG_APPS", displayName: "应用" }] }, nextPageToken: "cursor",
}
const ownerDetailFields = { id: "series-current", name: "Original", description: "Summary", version: ownerRevision, updatedAt: "2026-10-10T00:00:00Z", ownerType: "official", type: "skill", displayName: "Current", sortOrder: "1", createdAt: "2026-10-10T00:00:00Z", visibility: "catalog", userDescription: "Summary", coverImage: `/api/v1/skills/${ownerRevision}/cover`, addTime: "date", added: true, defaultEnable: false, defaultAdd: false, exampleQuestions: ["Real example"], sessionTypes: ["chat"], tags: { values: ["SKILL_HUB_TAG_APPS"] }, skillIcon: { type: "image", value: "icon" } }
const ownerLists = { userAddedSkills: [{ ...ownerDetailFields, enabled: false, icon: "icon", skillConfig: { teamSkillForceAdd: false } }], officialSkills: [{ ...ownerDetailFields, deviceCapable: true }] }
const ownerDetail = { skill: ownerDetailFields, downloadInfo: { downloadUrl: "/api/skill-downloads/owner-handle", filename: "current.zip", expiresAt: "2999-01-01T00:00:00Z" } }
function stubOwnerReads(hub: unknown = ownerHub, list: unknown = ownerLists, detail: unknown = ownerDetail) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => response(String(input).endsWith("ListHubSkills") ? hub : String(input).endsWith("ListSkills") ? list : detail)))
}
it("consumes complete current Hub/List fields, APPS and independent installed/enabled facts", async () => {
  stubOwnerReads()
  const result = await createManusSkillHubClient(createHubClient()).listSkillCatalog()
  expect(result.skills[0]).toMatchObject({ skill_id: "series-current", categories: ["apps"], installed: true, enabled: false, cover_image: `/api/hub/skills/${ownerRevision}/cover` })
  expect(result.next_cursor).toBe("cursor")
})
it("renders the owner APPS category in the existing filter and uses revision cover", async () => {
  stubOwnerReads()
  renderLive()
  await screen.findByRole("button", { name: "Current" })
  const filter = screen.getByRole("button", { name: "技能分类：全部" })
  fireEvent.pointerDown(filter, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole("menuitem", { name: "应用" }))
  fireEvent.click(screen.getByRole("button", { name: "查看技能详情 Current" }))
  await screen.findByRole("button", { name: "下载技能" })
  const cover = screen.getByTestId("manus-skill-detail-dialog").querySelector("img")
  expect(cover?.getAttribute("src")).toBe(`/api/hub/skills/${ownerRevision}/cover`)
})
it("GetSkill and DownloadSkill consume the complete owner skill and bind requested series", async () => {
  stubOwnerReads()
  await expect(getManusSkillDetail("series-current")).resolves.toMatchObject({ skill: { id: "series-current", version: ownerRevision, coverImage: `/api/hub/skills/${ownerRevision}/cover` } })
  await expect(downloadManusSkill("series-current")).resolves.toMatchObject({ skill: { id: "series-current" } })
  for (const read of [getManusSkillDetail, downloadManusSkill]) {
    stubOwnerReads(ownerHub, ownerLists, { ...ownerDetail, skill: { ...ownerDetailFields, id: "another-series" } })
    await expect(read("series-current")).rejects.toThrow()
  }
})
it("rejects unknown and wrongly typed fields in every current owner nesting", async () => {
  const invalidHub = [
    { ...ownerHub, extra: true },
    { ...ownerHub, tagOptions: { ...ownerHub.tagOptions, extra: true } },
    { ...ownerHub, tagOptions: { values: [{ tag: "SKILL_HUB_TAG_APPS", displayName: 1 }] } },
    ...["icon", "source", "currentVersion", "tags"].map((key) => ({ ...ownerHub, skills: [{ ...ownerHub.skills[0], [key]: { extra: true } }] })),
    { ...ownerHub, skills: [{ ...ownerHub.skills[0], publishStatus: true }] },
    { ...ownerHub, skills: [{ ...ownerHub.skills[0], currentVersion: { ...ownerHub.skills[0]!.currentVersion, fileCount: "1" } }] },
  ]
  for (const hub of invalidHub) { stubOwnerReads(hub); await expect(createManusSkillHubClient(createHubClient()).listSkillCatalog()).rejects.toThrow() }
  for (const key of ["userAddedSkills", "officialSkills"] as const) {
    for (const entry of [{ ...ownerLists[key][0], extra: true }, { ...ownerLists[key][0], tags: { values: [1] } }, { ...ownerLists[key][0], skillConfig: { teamSkillForceAdd: "false" } }]) {
      stubOwnerReads(ownerHub, { ...ownerLists, [key]: [entry] }); await expect(createManusSkillHubClient(createHubClient()).listSkillCatalog()).rejects.toThrow()
    }
  }
  for (const read of [getManusSkillDetail, downloadManusSkill]) {
    for (const detail of [{ ...ownerDetail, extra: true }, { ...ownerDetail, skill: { ...ownerDetailFields, extra: true } }, { ...ownerDetail, skill: { ...ownerDetailFields, defaultEnable: "false" } }, { ...ownerDetail, downloadInfo: { ...ownerDetail.downloadInfo, extra: true } }]) {
      stubOwnerReads(ownerHub, ownerLists, detail); await expect(read("series-current")).rejects.toThrow()
    }
  }
})
it("rejects foreign, query, encoded and wrong revision cover references rather than inventing a series fallback", async () => {
  for (const coverImage of ["https://foreign.test/cover", `/api/v1/skills/${ownerRevision}/cover?q=1`, `/api/v1/skills/${ownerRevision}/cover#f`, "/api/v1/skills/another-revision/cover", "/api/v1/skills/%72evision-current/cover"]) {
    stubOwnerReads({ ...ownerHub, skills: [{ ...ownerHub.skills[0], coverImage }] })
    await expect(createManusSkillHubClient(createHubClient()).listSkillCatalog()).rejects.toThrow()
    stubOwnerReads(ownerHub, ownerLists, { ...ownerDetail, skill: { ...ownerDetailFields, coverImage } })
    await expect(getManusSkillDetail("series-current")).rejects.toThrow()
  }
})
it("does not synthesize a cover when the owner has no cover fact", async () => {
  const { coverImage: _cover, ...skill } = ownerDetailFields
  void _cover
  stubOwnerReads(ownerHub, ownerLists, { ...ownerDetail, skill })
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current" }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "下载技能" })
  expect(screen.getByTestId("manus-skill-detail-dialog").querySelector("img")).toBeNull()
})

it("accepts exact current RPC read error pairs and rejects malformed or mismatched errors", async () => {
  const reads = [() => createManusSkillHubClient(createHubClient()).listSkillCatalog(), () => getManusSkillDetail("series-current"), () => downloadManusSkill("series-current")]
  for (const read of reads) {
    for (const [status, code] of [[400, "InvalidArgument"], [401, "session_invalid"], [403, "PermissionDenied"], [503, "Unavailable"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "Current error" } }), { status })))
      await expect(read()).rejects.toThrow(code)
    }
    for (const [status, body] of [
      [502, { error: { code: "session_invalid", message: "Wrong status" } }],
      [403, { error: { code: "Unavailable", message: "Wrong status" } }],
      [503, { error: { code: "Unavailable", message: "Extra", extra: true } }],
      [503, { error: { code: "Unavailable", message: 1 } }],
      [503, { error: { code: "invented", message: "Unknown" } }],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))
      await expect(read()).rejects.toThrow("skill_response_invalid")
    }
  }
})

const boundedReads = [
  { operation: "ListHubSkills", read: (signal: AbortSignal) => createManusSkillHubClient(createHubClient()).listSkillCatalog({ signal }) },
  { operation: "ListSkills", read: (signal: AbortSignal) => createManusSkillHubClient(createHubClient()).listSkillCatalog({ signal }) },
  { operation: "GetSkill", read: (signal: AbortSignal) => getManusSkillDetail("series-current", signal) },
  { operation: "DownloadSkill", read: (signal: AbortSignal) => downloadManusSkill("series-current", signal) },
]
it.each(boundedReads)("bounds $operation body deadline even when the stream never closes", async ({ operation, read }) => {
  vi.useFakeTimers()
  let source!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith(operation)
    ? new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller; controller.enqueue(new TextEncoder().encode('{"')); }, cancel }), { headers: { "content-type": "application/json" } })
    : response(String(input).endsWith("ListHubSkills") ? ownerHub : ownerLists))
  vi.stubGlobal("fetch", fetchMock)
  let outcome = "pending"
  const pending = read(new AbortController().signal).then(() => { outcome = "resolved" }, (error: Error) => { outcome = error.message })
  try {
    await vi.advanceTimersByTimeAsync(10_001)
    expect(outcome).toBe("skill_read_timeout")
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    if (outcome === "pending") source.close()
    await pending
    vi.useRealTimers()
  }
})
it.each(boundedReads)("rejects actual cumulative $operation bytes without trusting declared length", async ({ operation, read }) => {
  const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith(operation)
    ? new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(600_000).fill(32)); controller.enqueue(new Uint8Array(600_000).fill(32)); controller.close() }, cancel }), { headers: { "content-type": "application/json", "content-length": "2" } })
    : response(String(input).endsWith("ListHubSkills") ? ownerHub : ownerLists)))
  await expect(read(new AbortController().signal)).rejects.toThrow("skill_response_invalid")
})
it.each(boundedReads)("cancels $operation body and propagates caller cancellation", async ({ operation, read }) => {
  let source!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const caller = new AbortController()
  let suppliedSignal: AbortSignal | undefined
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith(operation)) return response(String(input).endsWith("ListHubSkills") ? ownerHub : ownerLists)
    suppliedSignal = init?.signal ?? undefined
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { source = controller }, cancel }), { headers: { "content-type": "application/json" } })
  }))
  let outcome = "pending"
  const pending = read(caller.signal).then(() => { outcome = "resolved" }, (error: Error) => { outcome = error.message })
  await new Promise((resolve) => setTimeout(resolve, 0))
  caller.abort()
  await new Promise((resolve) => setTimeout(resolve, 0))
  try {
    expect(suppliedSignal?.aborted).toBe(true)
    expect(outcome).toBe("skill_read_aborted")
    expect(cancel).toHaveBeenCalledTimes(1)
  } finally { if (outcome === "pending") source.close(); await pending }
})

it.each(["close", "replace"])("aborts detail and download streams on dialog %s", async (action) => {
  const signals: AbortSignal[] = []
  const cancelDetail = vi.fn()
  const cancelDownload = vi.fn()
  let blockDetail = true
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const id = JSON.parse(String(init?.body)).skillId as string
    if (id === "another-series") return response({ ...ownerDetail, skill: { ...ownerDetailFields, id } })
    signals.push(init?.signal as AbortSignal)
    if (blockDetail || String(_input).endsWith("DownloadSkill")) return new Response(new ReadableStream<Uint8Array>({ cancel: blockDetail ? cancelDetail : cancelDownload }), { headers: { "content-type": "application/json" } })
    return response(ownerDetail)
  }))
  const view = (open: boolean, id = "series-current") => <LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: id }} open={open} onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>
  const rendered = render(view(true))
  await waitFor(() => expect(signals).toHaveLength(1))
  rendered.rerender(action === "close" ? view(false) : view(true, "another-series"))
  await waitFor(() => expect(cancelDetail).toHaveBeenCalledTimes(1))
  expect(signals[0]?.aborted).toBe(true)
  blockDetail = false
  rendered.rerender(view(true))
  await screen.findByRole("button", { name: "下载技能" })
  fireEvent.click(screen.getByRole("button", { name: "下载技能" }))
  await waitFor(() => expect(signals).toHaveLength(3))
  rendered.rerender(action === "close" ? view(false) : view(true, "another-series"))
  await waitFor(() => expect(cancelDownload).toHaveBeenCalledTimes(1))
  expect(signals[2]?.aborted).toBe(true)
})
it("uses one finite budget for fetch headers plus body, and clears successful reader timers", async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
    setTimeout(() => resolve(new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "content-type": "application/json" } })), 5_000)
  })))
  let outcome = "pending"
  const pending = getManusSkillDetail("series-current").catch((error: Error) => { outcome = error.message })
  try {
    await vi.advanceTimersByTimeAsync(9_999)
    expect(outcome).toBe("pending")
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(outcome).toBe("skill_read_timeout")
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    stubOwnerReads()
    await getManusSkillDetail("series-current")
    await downloadManusSkill("series-current")
    await createManusSkillHubClient(createHubClient()).listSkillCatalog()
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

const presentationCases = (["zh", "en"] as const).flatMap((locale) => (["official", "third_party"] as const).flatMap((scope) => [
  { locale, scope, tag: "CODING", category: locale === "zh" ? "编程" : "Coding" },
  { locale, scope, tag: "DATA", category: locale === "zh" ? "数据" : "Data" },
  { locale, scope, tag: "AUTOMATION", category: locale === "zh" ? "自动化" : "Automation" },
  { locale, scope, tag: "BUSINESS", category: locale === "zh" ? "商业" : "Business" },
  { locale, scope, tag: "DESIGN", category: locale === "zh" ? "设计" : "Design" },
  { locale, scope, tag: "CONTENT", category: locale === "zh" ? "内容" : "Content" },
  { locale, scope, tag: "MEDIA", category: locale === "zh" ? "媒体" : "Media" },
  { locale, scope, tag: "APPS", category: locale === "zh" ? "应用" : "Apps" },
]))
it.each(presentationCases)("shares $locale $scope publisher and $tag label between catalog card and detail", async ({ locale, scope, tag, category }) => {
  window.localStorage.setItem("kokoro.locale", locale)
  const publisher = scope === "official" ? "Kokoro Test" : locale === "zh" ? "社区" : "Community"
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const operation = String(input)
    if (operation.endsWith("ListHubSkills")) return response({ ...ownerHub, nextPageToken: undefined, skills: [{ ...ownerHub.skills[0], displayName: "Real catalog title", publisherType: scope === "official" ? "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL" : "SKILL_HUB_PUBLISHER_TYPE_COMMUNITY", tags: { values: [`SKILL_HUB_TAG_${tag}`] }, exampleQuestions: [] }] })
    if (operation.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (operation.endsWith("GetSkill")) return response({ ...ownerDetail, skill: { ...ownerDetailFields, displayName: "Real catalog title", tags: { values: [`SKILL_HUB_TAG_${tag}`] }, exampleQuestions: [] } })
    throw new Error(`unexpected request ${operation}`)
  }))
  render(<LocaleProvider><KokoroSkillsSurface preview={false} brandName="Kokoro Test" onPrompt={vi.fn()} /></LocaleProvider>)
  const title = await screen.findByRole("button", { name: "Real catalog title" })
  const card = title.closest('[data-slot="card"]') as HTMLElement
  expect(within(card).getByText(publisher)).toBeInTheDocument()
  expect(within(card).getByText(category)).toBeInTheDocument()
  fireEvent.click(title)
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  await within(dialog).findByRole("button", { name: locale === "zh" ? "下载技能" : "Download skill" })
  expect(within(dialog).getByText(category)).toBeInTheDocument()
  expect(dialog).toHaveTextContent(publisher)
  expect(dialog).not.toHaveTextContent("Manus")
  expect(within(dialog).queryByText(tag)).toBeNull()
  expect(within(dialog).queryByText(`SKILL_HUB_TAG_${tag}`)).toBeNull()
})

it("catalog art consumes the owner revision-bound cover_image instead of a series alias", async () => {
  stubOwnerReads({ ...ownerHub, nextPageToken: undefined })
  renderLive()
  const title = await screen.findByRole("button", { name: "Current" })
  const card = title.closest('[data-slot="card"]') as HTMLElement
  expect(card.querySelector("img")?.getAttribute("src")).toBe(`/api/hub/skills/${ownerRevision}/cover`)
  expect(card.querySelector("img")?.getAttribute("src")).not.toContain("/self/skills/series-current/")
})
it("renders a neutral branded fallback without requesting a synthetic cover", async () => {
  const { coverImage: _cover, ...noCover } = ownerHub.skills[0]!
  void _cover
  stubOwnerReads({ ...ownerHub, nextPageToken: undefined, skills: [noCover] })
  renderLive()
  const title = await screen.findByRole("button", { name: "Current" })
  const card = title.closest('[data-slot="card"]') as HTMLElement
  expect(card.querySelector("img")).toBeNull()
  expect(card.querySelector('[class*="coverUnavailable"] svg')).toBeInTheDocument()
})

const packageFiles = [{ path: "SKILL.md", size_bytes: "12" }, { path: "notes.txt", size_bytes: "6" }]
const packageDirectory = { data: { source_ref: `skill:${ownerRevision}`, revision: "4", files: packageFiles, selected_file: null } }
function packageJson(body: unknown) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "package-ui" } }) }
it("opens visible ViewDetails and reads real SKILL.md then the selected UTF8 text without navigating", async () => {
  const requests: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input); requests.push(url)
    if (url.includes("/package")) {
      const path = new URL(url, "http://localhost").searchParams.get("file_path")
      return packageJson(path === null ? packageDirectory : { data: { ...packageDirectory.data, selected_file: { path, text: path === "SKILL.md" ? "# Owner text" : "实际" } } })
    }
    return response(ownerDetail)
  }))
  const skill = { ...localizedSkill, skill_id: "series-current", revision_skill_id: ownerRevision }
  render(<LocaleProvider><ManusSkillDetailDialog skill={skill} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "下载技能" })
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  expect(await screen.findByRole("heading", { name: "Owner text" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "notes.txt" }))
  expect(await screen.findByText("实际")).toBeInTheDocument()
  expect(requests).toContain(`/api/hub/skills/${ownerRevision}/package`)
  expect(requests).toContain(`/api/hub/skills/${ownerRevision}/package?file_path=SKILL.md`)
  expect(requests).toContain(`/api/hub/skills/${ownerRevision}/package?file_path=notes.txt`)
  expect(screen.getByTestId("manus-skill-detail-dialog")).toBeInTheDocument()
})

it("does not execute HTML or request Markdown images and external links in real package text", async () => {
  const text = '# Readable\n<script>alert("bad")</script>\n![external](https://outside.test/image.png)\n[link](https://outside.test/resource)'
  const data = { ...packageDirectory.data, files: [{ path: "SKILL.md", size_bytes: String(new TextEncoder().encode(text).byteLength) }] }
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/package") ? packageJson({ data: { ...data, selected_file: String(input).includes("file_path") ? { path: "SKILL.md", text } : null } }) : response(ownerDetail))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current", revision_skill_id: ownerRevision }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "下载技能" })
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  await screen.findByRole("heading", { name: "Readable" })
  const reader = screen.getByRole("region", { name: "技能内容" })
  expect(reader.querySelector("script,img,a")).toBeNull()
  expect(fetchMock.mock.calls.every(([input]) => !String(input).startsWith("https://outside.test"))).toBe(true)
})
it("blocks package inspection when current GetSkill revision differs from the catalog", async () => {
  const fetchMock = vi.fn(async () => response({ ...ownerDetail, skill: { ...ownerDetailFields, version: "new-revision", coverImage: "/api/v1/skills/new-revision/cover" } }))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current", revision_skill_id: ownerRevision }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  await screen.findByText("技能版本已更新，请刷新目录后重试")
  expect(screen.getByRole("button", { name: "查看详情" })).toBeDisabled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it.each(["close", "replace", "file"])("cancels package body on %s and never renders the prior file", async action => {
  const cancel = vi.fn()
  let signal: AbortSignal | undefined
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes("/package")) return response(ownerDetail)
    if (!url.includes("file_path")) return packageJson(packageDirectory)
    if (url.includes("notes.txt")) return packageJson({ data: { ...packageDirectory.data, selected_file: { path: "notes.txt", text: "实际" } } })
    signal = init?.signal ?? undefined
    return new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "package-ui" } })
  }))
  const view = (open: boolean, revision = ownerRevision) => <LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current", revision_skill_id: revision }} open={open} onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>
  const rendered = render(view(true))
  await screen.findByRole("button", { name: "下载技能" })
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  await waitFor(() => expect(signal).toBeDefined())
  if (action === "file") fireEvent.click(screen.getByRole("button", { name: "notes.txt" }))
  else rendered.rerender(action === "close" ? view(false) : view(true, "other-revision"))
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
  expect(signal?.aborted).toBe(true)
  if (action === "file") expect(await screen.findByText("实际")).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Owner text" })).toBeNull()
})
it("bounds package client slow and excessive streams and rejects caller cancellation", async () => {
  vi.useFakeTimers()
  try {
    const cancel = vi.fn()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "content-type": "application/json" } })))
    const slow = getManusSkillPackage(ownerRevision).catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await slow).toBe("skill_read_timeout")
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(1048577)) } }), { headers: { "content-type": "application/json" } })))
    await expect(getManusSkillPackage(ownerRevision)).rejects.toThrow("skill_response_invalid")
    const caller = new AbortController(); caller.abort()
    await expect(getManusSkillPackage(ownerRevision, undefined, caller.signal)).rejects.toThrow("skill_read_aborted")
    expect(vi.getTimerCount()).toBe(0)
  } finally { vi.useRealTimers() }
})

it("switches the same dialog to an independent real folder tree reader and back to its overview", async () => {
  const files = [{ path: "SKILL.md", size_bytes: "12" }, { path: "docs/nested/notes.txt", size_bytes: "6" }]
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (!url.includes("/package")) return response(ownerDetail)
    const path = new URL(url, "http://localhost").searchParams.get("file_path")
    return packageJson({ data: { ...packageDirectory.data, files, selected_file: path === null ? null : { path, text: path === "SKILL.md" ? "# Owner text" : "实际" } } })
  }))
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current", revision_skill_id: ownerRevision }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  await screen.findByRole("button", { name: "下载技能" })
  const dialog = screen.getByTestId("manus-skill-detail-dialog")
  expect(within(dialog).getByText("Summary")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  await screen.findByRole("heading", { name: "Owner text" })
  expect(screen.getByTestId("manus-skill-detail-dialog")).toBe(dialog)
  expect(dialog.querySelector('[role="tree"],[role="treeitem"],[role="group"]')).toBeNull()
  expect(within(dialog).queryByText("Summary")).toBeNull()
  expect(within(dialog).queryByText("Real example")).toBeNull()
  expect(dialog.querySelector("img")).toBeNull()
  const tree = screen.getByRole("navigation", { name: "技能文件" })
  const folder = within(tree).getByRole("button", { name: "docs" })
  expect(folder).toHaveAttribute("aria-expanded", "true")
  // JSDOM does not synthesize a native button's default keyboard click.
  // Dispatch the browser-equivalent zero-detail activation explicitly;
  // real Enter/Space default activation remains a Root browser check.
  const keyboardActivate = (button: HTMLElement, key: "Enter" | " ") => {
    expect(button.tagName).toBe("BUTTON")
    expect(button).toHaveAttribute("type", "button")
    button.focus()
    expect(button).toHaveFocus()
    fireEvent.keyDown(button, { key })
    fireEvent.keyUp(button, { key })
    fireEvent.click(button, { detail: 0 })
  }
  keyboardActivate(folder, "Enter")
  expect(folder).toHaveAttribute("aria-expanded", "false")
  expect(within(tree).queryByRole("button", { name: "docs/nested/notes.txt" })).toBeNull()
  keyboardActivate(folder, " ")
  expect(within(tree).getByRole("button", { name: "nested" })).toBeInTheDocument()
  keyboardActivate(within(tree).getByRole("button", { name: "docs/nested/notes.txt" }), "Enter")
  expect(await screen.findByText("实际")).toBeInTheDocument()
  keyboardActivate(within(tree).getByRole("button", { name: "SKILL.md" }), " ")
  expect(await screen.findByRole("heading", { name: "Owner text" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "返回简介" }))
  expect(screen.getByTestId("manus-skill-detail-dialog")).toBe(dialog)
  expect(within(dialog).getByText("Summary")).toBeInTheDocument()
  expect(screen.queryByRole("tree")).toBeNull()
})

const actionInstallation = { display_name: "Current", summary: "Summary", source_status: "active", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "catalog", state_version: "5" }, tags: [], installation_id: "installation-current", source_ref: `skill:${ownerRevision}`, series_id: "series-current", revision: "4", installed: true, enabled: true, installed_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z" }
const installationJson = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "installation-action" } })
function actionReads(input: string, installed = false, enabled = false): Response | undefined {
  if (input.endsWith("ListHubSkills")) return response({ ...ownerHub, nextPageToken: undefined })
  if (input.endsWith("ListSkills")) return response(installed ? { userAddedSkills: [{ ...ownerDetailFields, enabled }], officialSkills: [] } : { userAddedSkills: [], officialSkills: [] })
  if (input.endsWith("GetSkill")) return response({ ...ownerDetail, skill: { ...ownerDetailFields, added: installed } })
  return undefined
}
it("installs the exact catalog revision and synchronizes the same dialog only after its bound ACK", async () => {
  const calls: RequestInit[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const read = actionReads(String(input), calls.length > 0, calls.length > 0); if (read) return read
    calls.push(init!)
    return installationJson({ data: { installation: actionInstallation, change: "installed", event_id: "event-action", replayed: false } })
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  fireEvent.click(await within(dialog).findByRole("button", { name: "添加到我的技能" }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(JSON.parse(String(calls[0]?.body))).toEqual({ source_ref: `skill:${ownerRevision}` })
  expect(await within(dialog).findByRole("button", { name: "已添加到我的技能" })).toBeDisabled()
})
it("shows failed install in its current dialog and retains the original body and key for unknown outcome retry", async () => {
  const calls: RequestInit[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const read = actionReads(String(input), calls.length > 1, calls.length > 1); if (read) return read
    calls.push(init!)
    if (calls.length === 1) throw new Error("connection ended before ACK")
    return installationJson({ data: { installation: actionInstallation, change: "installed", event_id: "event-action", replayed: true } })
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  const add = await within(dialog).findByRole("button", { name: "添加到我的技能" })
  fireEvent.click(add)
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("添加")
  fireEvent.click(add)
  await waitFor(() => expect(calls).toHaveLength(2))
  expect(calls[1]?.body).toBe(calls[0]?.body)
  expect(new Headers(calls[1]?.headers).get("idempotency-key")).toBe(new Headers(calls[0]?.headers).get("idempotency-key"))
  expect(await within(dialog).findByRole("button", { name: "已添加到我的技能" })).toBeDisabled()
})
it("enables the unique existing installation without reinstalling or changing its old revision pin", async () => {
  const commands: { url: string; init: RequestInit }[] = []
  const old = { ...actionInstallation, source_ref: "skill:revision-old", revision: "1", enabled: false }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const read = actionReads(url, true, commands.length > 0); if (read) return read
    if (init?.method === "GET") return installationJson({ data: [old] })
    commands.push({ url, init: init! })
    return installationJson({ data: { installation: { ...old, enabled: true }, change: "enabled", event_id: "event-enabled", replayed: false } })
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  const add = await within(dialog).findByRole("button", { name: "添加到我的技能" })
  expect(add).not.toBeDisabled()
  fireEvent.click(add)
  await waitFor(() => expect(commands).toHaveLength(1))
  expect(commands[0]?.url).toBe("/api/hub/self/skill-installations/installation-current/enabled")
  expect(commands[0]?.init.method).toBe("PUT")
  expect(JSON.parse(String(commands[0]?.init.body))).toEqual({ enabled: true })
  expect(await within(dialog).findByRole("button", { name: "已添加到我的技能" })).toBeDisabled()
})

it("fails closed before installation I/O when the catalog has no exact revision", async () => {
  const commands: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("ListHubSkills")) return response({ ...ownerHub, nextPageToken: undefined, skills: [{ ...ownerHub.skills[0], currentVersion: undefined, coverImage: undefined }] })
    const read = actionReads(url); if (read) return read
    commands.push(url); throw new Error("unexpected mutation")
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  fireEvent.click(await within(dialog).findByRole("button", { name: "添加到我的技能" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("添加失败")
  expect(commands).toEqual([])
})
it.each([{ series_id: "different-series" }, { source_ref: "skill:different-revision" }, { enabled: false }])("rejects installation ACK resource/state mismatch %j without claiming success", async fields => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => actionReads(String(input)) ?? installationJson({ data: { installation: { ...actionInstallation, ...fields }, change: "installed", event_id: "event-action", replayed: false } })))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  fireEvent.click(await within(dialog).findByRole("button", { name: "添加到我的技能" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("添加失败")
  expect(within(dialog).queryByRole("button", { name: "已添加到我的技能" })).toBeNull()
})
it.each([0, 2])("rejects %i matching live installations instead of falling back to reinstall", async count => {
  const mutations: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const read = actionReads(url, true); if (read) return read
    if (init?.method === "GET") return installationJson({ data: Array.from({ length: count }, (_, index) => ({ ...actionInstallation, installation_id: `installation-${index}`, enabled: false })) })
    mutations.push(url); throw new Error("unexpected mutation")
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  fireEvent.click(await within(dialog).findByRole("button", { name: "添加到我的技能" }))
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("添加失败")
  expect(mutations).toEqual([])
})
it("locks duplicate actions synchronously and does not apply an old ACK to another selected resource", async () => {
  let resolve!: (value: Response) => void
  const commands: RequestInit[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("ListHubSkills")) return response({ ...ownerHub, nextPageToken: undefined, skills: [ownerHub.skills[0], { ...ownerHub.skills[0], skillId: "another-series", displayName: "Another", currentVersion: { versionUid: "another-revision" }, coverImage: undefined }] })
    if (url.endsWith("GetSkill") && JSON.parse(String(init?.body)).skillId === "another-series") return response({ ...ownerDetail, skill: { ...ownerDetailFields, id: "another-series", displayName: "Another", version: "another-revision", added: false, coverImage: undefined } })
    const read = actionReads(url); if (read) return read
    commands.push(init!)
    return new Promise<Response>(accept => { resolve = accept })
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  let dialog = await screen.findByTestId("manus-skill-detail-dialog")
  const add = await within(dialog).findByRole("button", { name: "添加到我的技能" })
  fireEvent.click(add); fireEvent.click(add)
  await waitFor(() => expect(commands).toHaveLength(1))
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  fireEvent.click(screen.getByRole("button", { name: "Another" }))
  dialog = await screen.findByTestId("manus-skill-detail-dialog")
  resolve(installationJson({ data: { installation: actionInstallation, change: "installed", event_id: "event-action", replayed: false } }))
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "添加到我的技能" })).not.toBeDisabled())
  expect(within(dialog).queryByRole("button", { name: "已添加到我的技能" })).toBeNull()
  expect(within(dialog).queryByRole("alert")).toBeNull()
})

it("refreshes the authoritative catalog after settings disables an ACK-installed skill and makes re-enable available", async () => {
  let installed = false
  let enabled = false
  let catalogReads = 0
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("ListHubSkills")) { catalogReads += 1; return response({ ...ownerHub, nextPageToken: undefined }) }
    if (url.endsWith("ListSkills")) return response({ userAddedSkills: installed ? [{ ...ownerDetailFields, enabled }] : [], officialSkills: [] })
    if (url.endsWith("GetSkill")) return response({ ...ownerDetail, skill: { ...ownerDetailFields, added: installed } })
    if (url.includes("/self/skills/managed")) return installationJson({ data: { skills: [], next_cursor: null }, meta: { request_id: "installation-action" } })
    if (url.startsWith("/api/hub/self/skill-installations")) {
      if (init?.method === "POST") { installed = true; enabled = true; return installationJson({ data: { installation: actionInstallation, change: "installed", event_id: "install-event", replayed: false } }) }
      if (init?.method === "PUT") { enabled = JSON.parse(String(init.body)).enabled; return installationJson({ data: { installation: { ...actionInstallation, enabled }, change: enabled ? "enabled" : "disabled", event_id: "state-event", replayed: false } }) }
      return installationJson({ data: url.includes("installation-current") ? { ...actionInstallation, enabled } : [{ ...actionInstallation, enabled }] })
    }
    throw new Error(`unexpected ${url}`)
  }))
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} /><PersonalSkillsRead client={createHubClient()} embedded /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "添加 Current" }))
  await screen.findByRole("button", { name: "已添加 Current" })
  await waitFor(() => expect(catalogReads).toBe(2))
  const settings = screen.getByTestId("personal-skills-read")
  fireEvent.click(within(settings).getByRole("button", { name: "本人安装" }))
  fireEvent.click(await within(settings).findByRole("button", { name: "停用" }))
  await within(settings).findByTestId("installation-current")
  await waitFor(() => expect(catalogReads).toBe(3))
  expect(await screen.findByRole("button", { name: "添加 Current" })).not.toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Current" }))
  const dialog = screen.getByTestId("manus-skill-detail-dialog")
  expect(await within(dialog).findByRole("button", { name: "添加到我的技能" })).not.toBeDisabled()
})
it("keeps the catalog and confirmed ACK state visible when its invalidated authority read fails", async () => {
  let acknowledged = false
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("ListHubSkills") && acknowledged) throw new Error("catalog temporarily unavailable")
    const read = actionReads(url); if (read) return read
    acknowledged = true
    return installationJson({ data: { installation: actionInstallation, change: "installed", event_id: "event-action", replayed: false } })
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "添加 Current" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("技能池加载失败")
  expect(screen.getByRole("button", { name: "Current" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "已添加 Current" })).toBeDisabled()
  expect(screen.queryByTestId("skills-loading")).toBeNull()
})

it.each([true, false])("executes current installation facts after a fresh read while the same modal stays open (initial installed=%s)", async initiallyInstalled => {
  let installed = initiallyInstalled
  let enabled = initiallyInstalled
  let refreshed = false
  let reads = 0
  const commands: { url: string; init: RequestInit }[] = []
  const oldPin = { ...actionInstallation, source_ref: "skill:revision-old", revision: "1", enabled: false }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("ListHubSkills")) {
      reads += 1
      return response({ ...ownerHub, nextPageToken: undefined, skills: [{ ...ownerHub.skills[0], ...(refreshed ? { currentVersion: { versionUid: "new-catalog-revision" }, coverImage: "/api/v1/skills/new-catalog-revision/cover" } : {}) }] })
    }
    const read = actionReads(url, installed, enabled); if (read) return read
    if (init?.method === "GET") return installationJson({ data: [{ ...oldPin, enabled }] })
    commands.push({ url, init: init! }); enabled = true
    return installationJson({ data: { installation: { ...oldPin, enabled: true }, change: "enabled", event_id: "enable-existing", replayed: false } })
  }))
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "Current" }))
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  await within(dialog).findByRole("button", { name: "下载技能" })
  installed = true; enabled = false; refreshed = true
  invalidate(SKILL_CATALOG_RESOURCE_KEY)
  await waitFor(() => expect(reads).toBe(2))
  await waitFor(() => expect(document.querySelector('button[aria-label="添加 Current"]')).toHaveAttribute("data-installed", "true"))
  const add = await within(dialog).findByRole("button", { name: "添加到我的技能" })
  expect(add).not.toBeDisabled()
  fireEvent.click(add)
  await waitFor(() => expect(commands).toHaveLength(1))
  expect(commands[0]?.url).toBe("/api/hub/self/skill-installations/installation-current/enabled")
  expect(commands[0]?.init.method).toBe("PUT")
  expect(JSON.parse(String(commands[0]?.init.body))).toEqual({ enabled: true })
  expect(screen.getByTestId("manus-skill-detail-dialog")).toBe(dialog)
  expect(await within(dialog).findByRole("button", { name: "已添加到我的技能" })).toBeDisabled()
})

it("ordinary personal new skill opens the same archive dropzone without publish metadata fields", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ skills: [], next_cursor: null }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "owner" } })))
  render(<LocaleProvider><PersonalSkillsRead client={createHubClient()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "上传技能" }))
  expect(await screen.findByTestId("skill-upload-dialog")).toBeInTheDocument()
  expect(screen.queryByLabelText("技能名称")).toBeNull()
})


it.each([false, true])("keeps summary actions ordered and metadata separators between actual fields (cover=%s)", async hasCover => {
  const { coverImage: _cover, ...withoutCover } = ownerDetailFields
  void _cover
  stubOwnerReads(ownerHub, ownerLists, { ...ownerDetail, skill: hasCover ? ownerDetailFields : withoutCover })
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current", revision_skill_id: ownerRevision, usage_count: undefined }} publisherLabel="Kokoro" open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  const dialog = await screen.findByTestId("manus-skill-detail-dialog")
  await within(dialog).findByRole("button", { name: "下载技能" })
  const add = within(dialog).getByRole("button", { name: "已添加到我的技能" })
  const view = within(dialog).getByRole("button", { name: "查看详情" })
  expect(add.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(view.querySelector("svg")).not.toBeNull()
  const metadata = dialog.querySelector('[data-slot="dialog-description"]')!
  expect(metadata.textContent?.trim()).not.toMatch(/\|$/u)
  expect(metadata.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
  expect(dialog.querySelector('[data-slot="dialog-header"]')).toHaveAttribute("data-has-cover", String(hasCover))
})

it("uses the wide Manus-style summary layout with cover-only width reservation", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/skills/manus-skill-detail-dialog.module.css`, "utf8")
  expect(css).toMatch(/\.dialog\[data-slot="dialog-content"\]\s*\{[^}]*display:flex;/u)
  expect(css).toMatch(/\.hero\s*\{[^}]*flex-direction:row;[^}]*align-items:center;/u)
  expect(css).toMatch(/\.hero\[data-has-cover="true"\]\s*\{[^}]*min-height:19rem;/u)
  expect(css).toMatch(/\.copy h2\s*\{[^}]*font-size:clamp\(1\.8rem, 3vw, 2\.6rem\);/u)
  expect(css).toMatch(/\.copy\s*\{[^}]*max-width:100%;/u)
  expect(css).toMatch(/\.hero\[data-has-cover="true"\] \.copy\s*\{[^}]*max-width:calc\(100% - 15rem\);/u)
  expect(css).toMatch(/@media\(max-width:42rem\)[\s\S]*\.hero\[data-has-cover="true"\] \.copy\{max-width:100%\}/u)
})


it("keeps decorative covers non-interactive and out of narrow summary copy", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/skills/manus-skill-detail-dialog.module.css`, "utf8")
  expect(css).toMatch(/\.cover\s*\{[^}]*pointer-events:none;/u)
  expect(css).toMatch(/@media\(max-width:42rem\)[^\n]*\.cover\{display:none\}/u)
})


it("groups two actual category badges in a wrapping row without an empty category placeholder", async () => {
  stubOwnerReads()
  const props = { skill: { ...localizedSkill, skill_id: "series-current" }, open: true, onOpenChange: vi.fn(), onAdd: vi.fn(), onTry: vi.fn() }
  const view = render(<LocaleProvider><ManusSkillDetailDialog {...props} categoryLabels={["媒体", "应用"]} /></LocaleProvider>)
  await screen.findByRole("button", { name: "下载技能" })
  const media = screen.getByText("媒体")
  expect(media.parentElement).toBe(screen.getByText("应用").parentElement)
  expect(media.parentElement?.className).toContain("categories")
  view.rerender(<LocaleProvider><ManusSkillDetailDialog {...props} categoryLabels={[]} /></LocaleProvider>)
  expect(screen.getByTestId("manus-skill-detail-dialog").querySelector('[class*="categories"]')).toBeNull()
  const css = readFileSync(`${process.cwd()}/src/ui/skills/manus-skill-detail-dialog.module.css`, "utf8")
  expect(css).toMatch(/\.categories\s*\{[^}]*display:flex;[^}]*flex-wrap:wrap;/u)
})


it("matches the wide Manus detail frame at desktop while retaining a compact mobile layout", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/skills/manus-skill-detail-dialog.module.css`, "utf8")
  expect(css).toMatch(/\.dialog\[data-slot="dialog-content"\]\s*\{[^}]*width:min\(90rem,calc\(100vw - 2rem\)\);[^}]*max-width:calc\(100vw - 2rem\);[^}]*height:min\(68rem,calc\(100dvh - 2rem\)\);/u)
  expect(css).toMatch(/\.dialog\[data-slot="dialog-content"\]\s*\{[^}]*border-radius:1rem;[^}]*color-mix\(in srgb,var\(--background\) 97%,var\(--foreground\) 3%\)/u)
  expect(css).toMatch(/\.hero\s*\{[^}]*min-height:19rem;[^}]*padding:3rem 3rem 2rem;/u)
  expect(css).toMatch(/\.body\s*\{[^}]*flex:1 1 auto;[^}]*overflow:auto;[^}]*padding:2\.5rem 3rem 3rem;/u)
  expect(css).toMatch(/\.actions button\s*\{[^}]*min-height:2\.8rem;[^}]*font-weight:650;/u)
})

it("uses the reference share arrow rather than the connected-node share icon", async () => {
  stubOwnerReads()
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current" }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  expect(screen.getByRole("button", { name: "分享技能" }).querySelector("svg")).toHaveClass("lucide-share")
})


it("makes short-viewport summaries scroll as a whole without changing independent reader scrolling", () => {
  const css = readFileSync(`${process.cwd()}/src/ui/skills/manus-skill-detail-dialog.module.css`, "utf8")
  expect(css).toMatch(/@media\(max-height:42rem\)\s*\{\s*\.dialog:not\(\.readerDialog\)\[data-slot="dialog-content"\]\s*\{\s*overflow:auto;\s*\}/u)
  expect(css).toMatch(/\.dialog:not\(\.readerDialog\) \.body\s*\{\s*flex:0 0 auto;\s*overflow:visible;\s*\}/u)
  expect(css).toMatch(/\.readerDialog \.fileList,\.readerDialog \.fileContent\s*\{[^}]*overflow:auto;/u)
})

it.each([false, true])("only refreshes authoritative catalog after real GitHub Publish and Install without synthesizing a card (unknown ACK %s)", async unknown => {
  let installed = false, previewCalls = 0
  const selector = { owner:"acme",repository:"skills",commit:"a".repeat(40),path:"tools/check" }
  const meta = { display_name:"GitHub actual",summary:"Owner text",tags:[] }
  const product = { state_version:"4",publication_audience:"owner",source_kind:"personal" }
  const managed = { skill_id:ownerRevision,source_ref:`skill:${ownerRevision}`,series_id:"series-current",revision:"4",status:"draft",name:meta.display_name,summary:meta.summary,tags:[],example_prompts:[],category_keys:[],skill_updated_at:"2026-10-10T00:00:00Z",product }
  const ownerResponse=(data:unknown,status=200)=>new Response(JSON.stringify({data}),{status,headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"github-ui"}})
  const commands: Array<{url:string;init:RequestInit}>=[]
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input)
    if(url.endsWith("ListHubSkills"))return response({...ownerHub,nextPageToken:undefined})
    if(url.endsWith("ListSkills"))return response({userAddedSkills:installed?[{...ownerLists.userAddedSkills[0],enabled:true}]:[],officialSkills:[]})
    if(url.endsWith("/github/preview")){previewCalls++;return ownerResponse({selection_required:true,repository_url:"https://github.com/acme/skills",commit:selector.commit,paths:[selector.path,"other"]})}
    if(url.includes("/self/skills/managed/"))return new Response(JSON.stringify({data:managed,meta:{request_id:"github-ui"}}),{status:200,headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"github-ui"}})
    commands.push({url,init:init!})
    if(url.endsWith("/github/import"))return ownerResponse({skill_id:ownerRevision,source_ref:`skill:${ownerRevision}`,status:"draft",state_version:"4",valid:true,content_digest:"b".repeat(64),manifest_identity:`skill-md-v1:sha256:${"b".repeat(64)}`},201)
    if(url.endsWith("/publish"))return ownerResponse({source_ref:`skill:${ownerRevision}`,revision:"4",status:"active",state_version:"5",event_id:"e90c2e48-7c3e-4d61-a00a-d25b9807ce59",replayed:false})
    if(unknown && commands.filter(command=>command.url.endsWith("/self/skill-installations")).length===1)throw new TypeError("ACK lost")
    installed=true;return ownerResponse({installation:{...actionInstallation,product},change:"installed",event_id:"github-install",replayed:false})
  }))
  renderLive();await screen.findByRole("button",{name:"Current"})
  fireEvent.pointerDown(screen.getByRole("button",{name:"创建"}));fireEvent.click(await screen.findByRole("menuitem",{name:"从 GitHub 导入"}))
  const dialog=await screen.findByTestId("github-import-dialog")
  fireEvent.change(within(dialog).getByTestId("github-repository-input"),{target:{value:"acme/skills"}})
  fireEvent.keyDown(within(dialog).getByTestId("github-repository-input"),{key:"Enter"})
  fireEvent.click(await within(dialog).findByRole("button",{name:selector.path}))
  expect(within(dialog).queryByTestId("github-import-complete")).toBeNull()
  expect(within(dialog).getByTestId("github-selected-path")).toHaveTextContent(selector.path)
  fireEvent.click(within(dialog).getByRole("button",{name:"添加到我的技能（仅自己可见）"}))
  if(unknown){
    await within(dialog).findByText(/结果尚未确认/u)
    expect(within(dialog).queryByTestId("github-import-complete")).toBeNull()
    fireEvent.click(within(dialog).getByRole("button",{name:"重试"}))
  }
  await within(dialog).findByTestId("github-import-complete")
  if(unknown){expect(commands[2]?.init.body).toBe(commands[3]?.init.body);expect(new Headers(commands[2]?.init.headers).get("idempotency-key")).toBe(new Headers(commands[3]?.init.headers).get("idempotency-key"))}
  expect(previewCalls).toBe(1);expect(commands.slice(0,3).map(value=>value.url)).toEqual(["/api/hub/skills/github/import",`/api/hub/self/skills/${ownerRevision}/publish`,"/api/hub/self/skill-installations"])
  expect(JSON.parse(String(commands[0]?.init.body))).toEqual(selector)
  expect(JSON.parse(String(commands[1]?.init.body))).toEqual({audience:"owner",expected_state_version:"4"})
  expect(JSON.parse(String(commands[2]?.init.body))).toEqual({source_ref:`skill:${ownerRevision}`})
  fireEvent.click(within(dialog).getByTestId("github-import-done"))
  expect(screen.queryByRole("button",{name:meta.display_name})).toBeNull()
  expect(await screen.findByRole("button",{name:"Current"})).toBeInTheDocument()
  fireEvent.pointerDown(screen.getByRole("button",{name:"创建"}));fireEvent.click(await screen.findByRole("menuitem",{name:"从 GitHub 导入"}))
  const reopened=await screen.findByTestId("github-import-dialog")
  expect(within(reopened).queryByTestId("github-import-complete")).toBeNull()
  expect(within(reopened).getByTestId("github-repository-input")).not.toBeDisabled()
  expect(within(reopened).getByTestId("github-import-submit")).toBeInTheDocument()
})

it("creates a real revision Skill Share before copying only its service URL", async () => {
  const writeText = vi.fn(async () => undefined)
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
  const url = `${window.location.origin}/skills/shared/actual-share`
  const fetchMock = vi.fn(async (path: string) => path === "/api/hub/skill-shares"
    ? new Response(JSON.stringify({ data: { share_id: "actual-share", source_ref: "skill:revision-old", url, created_at: "2026-10-10T00:00:00.000Z", expires_at: null, revoked_at: null } }), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "share-create" } })
    : response({ skill: { id: "series", version: "revision-old", name: "Actual skill" }, downloadInfo: { downloadUrl: "/api/skill-downloads/token", filename: "skill.zip", expiresAt: "2026-10-10T00:00:00.000Z" } }))
  vi.stubGlobal("fetch", fetchMock)
  render(<LocaleProvider><ManusSkillDetailDialog skill={{ skill_id: "series", revision_skill_id: "revision-old", name: "Actual skill", description: "Real", content_hash: "legacy-display", scope: "official", installed: false, enabled: false }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  const share = await screen.findByRole("button", { name: "分享技能" })
  await waitFor(() => expect(share).not.toBeDisabled())
  fireEvent.click(share)
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(url))
  expect(fetchMock.mock.calls.filter(([path]) => path === "/api/hub/skill-shares")).toHaveLength(1)
})

it.each(["clipboard", "unknown"])("keeps the Share intent after %s without automatically creating again", async mode => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValue(undefined)
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
  let creates = 0
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path !== "/api/hub/skill-shares") throw new Error("shared mode must not GetSkill")
    creates++
    if (mode === "unknown" && creates === 1) throw new Error("lost response")
    return new Response(JSON.stringify({ data: { share_id: "share-old", source_ref: "skill:revision-old", url: `${window.location.origin}/skills/shared/share-old`, created_at: "2026-10-10T00:00:00Z", expires_at: null, revoked_at: null } }), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "share-create" } })
  }))
  const summary = { share_id: "incoming", source_ref: "skill:revision-old", skill: { skill_id: "revision-old", series_id: "series", revision: "1", display_name: "Old", description: "Real", tags: [], category_keys: [], example_prompts: [], created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", owner_type: "official" as const, source_kind: "official" as const } }
  render(<LocaleProvider><ManusSkillDetailDialog skill={null} sharedSummary={summary} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  const share = screen.getByRole("button", { name: "分享技能" }); fireEvent.click(share)
  if (mode === "clipboard") {
    await screen.findByText(/链接已创建，复制失败/u); fireEvent.click(share)
    await screen.findByText("技能链接已复制")
    expect(creates).toBe(1); expect(writeText).toHaveBeenCalledTimes(2)
  } else {
    await screen.findByText(/分享创建结果暂未确认/u)
    expect(share).toBeDisabled(); expect(creates).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: "创建新的分享" }))
    await screen.findByText(/链接已创建，复制失败/u)
    expect(creates).toBe(2)
  }
})

it("reuses the real package tree for a shared old revision without current metadata", async () => {
  const summary = { share_id: "incoming", source_ref: `skill:${ownerRevision}`, skill: { skill_id: ownerRevision, series_id: "series", revision: "4", display_name: "Exact old", description: "Owner summary", tags: [], category_keys: [], example_prompts: [], created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", owner_type: "official" as const, source_kind: "official" as const } }
  const fetcher = vi.fn(async (path: string) => {
    if (!path.startsWith(`/api/hub/skills/${ownerRevision}/package`)) throw new Error("no series/current read")
    return packageJson({ data: { ...packageDirectory.data, selected_file: path.includes("file_path") ? { path: "SKILL.md", text: "# Owner text" } : null } })
  })
  vi.stubGlobal("fetch", fetcher)
  render(<LocaleProvider><ManusSkillDetailDialog skill={null} sharedSummary={summary} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>)
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  expect(await screen.findByText("Owner text")).toBeInTheDocument()
  expect(screen.getByRole("navigation", { name: "技能文件" })).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it("retires a pending shared download on lost admission and permits a new attempt after readmission", async () => {
  const summary = { share_id: "incoming", source_ref: "skill:revision-old", skill: { skill_id: "revision-old", series_id: "series", revision: "1", display_name: "Old", description: "Real", tags: [], category_keys: [], example_prompts: [], created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", owner_type: "official" as const, source_kind: "official" as const } }
  const pending: Array<{ signal: AbortSignal; finish: (response: Response) => void }> = []
  const fetcher = vi.fn((_path: string, init: RequestInit) => new Promise<Response>(finish => { pending.push({ signal: init.signal!, finish }) }))
  vi.stubGlobal("fetch", fetcher)
  const view = () => <LocaleProvider><ManusSkillDetailDialog skill={null} sharedSummary={summary} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>
  const rendered = render(view())
  fireEvent.click(screen.getByRole("button", { name: "下载技能" }))
  expect(screen.getByRole("button", { name: "下载技能" })).toBeDisabled()
  sessionBoundary.admitted = false; rendered.rerender(view())
  expect(pending[0]?.signal.aborted).toBe(true)
  sessionBoundary.admitted = true; rendered.rerender(view())
  await waitFor(() => expect(screen.getByRole("button", { name: "下载技能" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "下载技能" }))
  expect(fetcher).toHaveBeenCalledTimes(2)
  const late = () => new Response(JSON.stringify({ data: { source_ref: summary.source_ref, revision: "1", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "old.zip", expires_at: "2099-01-01T00:00:00Z" } } }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "late-download" } })
  pending[0]!.finish(late()); await Promise.resolve(); await Promise.resolve()
  expect(screen.getByRole("button", { name: "下载技能" })).toBeDisabled()
  expect(screen.queryByText("技能详情暂时不可用")).toBeNull()
  rendered.unmount(); expect(pending[1]?.signal.aborted).toBe(true); pending[1]!.finish(late())
})
it("preserves the catalog download lifecycle when only shared admission changes", async () => {
  let signal!: AbortSignal, rejectDownload!: (error: Error) => void
  vi.stubGlobal("fetch", vi.fn((path: string, init: RequestInit) => path.endsWith("DownloadSkill") ? new Promise<Response>((_resolve, reject) => { signal = init.signal!; rejectDownload = reject }) : Promise.resolve(response(ownerDetail))))
  const view = () => <LocaleProvider><ManusSkillDetailDialog skill={{ ...localizedSkill, skill_id: "series-current", revision_skill_id: ownerRevision }} open onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={vi.fn()} /></LocaleProvider>
  const rendered = render(view())
  const button = await screen.findByRole("button", { name: "下载技能" }); fireEvent.click(button)
  await waitFor(() => expect(signal).toBeDefined())
  sessionBoundary.admitted = false; rendered.rerender(view())
  expect(signal.aborted).toBe(false)
  sessionBoundary.admitted = true; rendered.rerender(view())
  rejectDownload(new Error("Owner download failed"))
  await waitFor(() => expect(screen.getByRole("button", { name: "下载技能" })).toBeEnabled())
})


it("matches the measured summary typography and example dimensions while keeping the independent reader width", () => {
  const css = readFileSync("src/ui/skills/manus-skill-detail-dialog.module.css", "utf8")
  expect(css).toMatch(/@media\(max-width:42rem\)\s*\{\s*\.dialog\[data-slot="dialog-content"\]\s*\{[^}]*width:min\(90rem,calc\(100vw - 2rem\)\);/u)
  expect(css).toMatch(/\.readerDialog\[data-slot="dialog-content"\]\s*\{[^}]*max-width:960px;/u)
  expect(css).toMatch(/\.description\s*\{[^}]*font-size:1\.15rem;[^}]*line-height:1\.75rem;/u)
  expect(css).toMatch(/\.description\s*\{[^}]*margin:0 0 2\.25rem;/u)
  expect(css).toMatch(/\.examples button\s*\{[^}]*min-height:4\.75rem;[^}]*padding:1rem;[^}]*border-radius:12px;/u)
  expect(css).toMatch(/\.actions button\s*\{[^}]*height:2\.8rem;[^}]*padding:0 \.95rem;[^}]*line-height:1\.2rem;/u)
})

it("keeps real example text and its icon at the wide detail scale", () => {
  const css = readFileSync("src/ui/skills/manus-skill-detail-dialog.module.css", "utf8")
  expect(css).toMatch(/\.examples button span\s*\{[^}]*font-size:\.95rem;[^}]*line-height:1\.4rem;/u)
  expect(css).toMatch(/\.examples svg\s*\{[^}]*width:1rem;[^}]*height:1rem;[^}]*flex:0 0 1rem;/u)
})


it("keeps the reference category vocabulary inside the Manus filter menu", async () => {
  stubOwnerReads()
  renderLive()
  const filter = await screen.findByRole("button", { name: "技能分类：全部" })
  fireEvent.pointerDown(filter, { button: 0, ctrlKey: false })
  const menu = await screen.findByRole("menu")
  for (const name of ["全部", "编程", "数据", "自动化", "商业", "设计", "媒体", "内容", "应用"]) {
    expect(within(menu).getByRole("menuitem", { name: new RegExp(`^${name}$`) })).toBeInTheDocument()
  }
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(9)
})

it("uses the Manus-style identity, summary and real-example composition for a personal skill detail", async () => {
  const managed = {
    skill_id: "mine", source_ref: "skill:mine", series_id: "mine-series", revision: "1",
    name: "本地清单", summary: "仅根据当前输入整理待办事项。", tags: ["personal"], status: "active" as const,
    skill_updated_at: "2026-10-11T00:00:00.000Z", example_prompts: ["帮我整理今天的待办事项。"], category_keys: ["automation"],
    product: { source_kind: "personal" as const, publication_audience: "owner" as const, state_version: "1" },
  }
  const client = {
    listPersonalSkills: vi.fn().mockResolvedValue({ skills: [managed], next_cursor: null }),
    getPublishedPersonalSkill: vi.fn().mockResolvedValue(managed),
  } as unknown as HubClient
  render(<LocaleProvider><PersonalSkillsRead client={client} /></LocaleProvider>)

  fireEvent.click(await screen.findByRole("button", { name: "本地清单" }))
  const dialog = await screen.findByTestId("personal-skill-detail")
  expect(dialog).toHaveAttribute("data-detail-layout", "manus")
  expect(dialog).toHaveTextContent("自有")
  expect(dialog).toHaveTextContent("仅根据当前输入整理待办事项。")
  expect(within(dialog).getByRole("button", { name: "帮我整理今天的待办事项。" })).toBeInTheDocument()
  expect(dialog).not.toHaveTextContent("技术详情")
  expect(dialog).not.toHaveTextContent("SKILL.md")
})

it("opens the owner-approved package tree from a personal skill detail without replacing its summary", async () => {
  const managed = {
    skill_id: "mine", source_ref: "skill:mine", series_id: "mine-series", revision: "1",
    name: "本地清单", summary: "仅根据当前输入整理待办事项。", tags: ["personal"], status: "active" as const,
    skill_updated_at: "2026-10-11T00:00:00.000Z", example_prompts: ["帮我整理今天的待办事项。"], category_keys: ["automation"],
    product: { source_kind: "personal" as const, publication_audience: "owner" as const, state_version: "1" },
  }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify({ data: {
    source_ref: "skill:mine", revision: "1", files: [{ path: "SKILL.md", size_bytes: "16" }, { path: "assets/readme.txt", size_bytes: "7" }],
    selected_file: String(input).includes("file_path=SKILL.md") ? { path: "SKILL.md", text: "# 清单\n\n正文" } : null,
  } }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "package-read" } })))
  const client = {
    listPersonalSkills: vi.fn().mockResolvedValue({ skills: [managed], next_cursor: null }),
    getPublishedPersonalSkill: vi.fn().mockResolvedValue(managed),
  } as unknown as HubClient
  render(<LocaleProvider><PersonalSkillsRead client={client} /></LocaleProvider>)

  fireEvent.click(await screen.findByRole("button", { name: "本地清单" }))
  const dialog = await screen.findByTestId("personal-skill-detail")
  fireEvent.click(within(dialog).getByRole("button", { name: "查看详情" }))

  expect(await within(dialog).findByRole("button", { name: "SKILL.md" })).toBeInTheDocument()
  expect(within(dialog).getByRole("button", { name: "assets" })).toBeInTheDocument()
  expect(await within(dialog).findByRole("heading", { name: "清单" })).toBeInTheDocument()
  expect(globalThis.fetch).toHaveBeenCalledWith("/api/hub/skills/mine/package", expect.objectContaining({ method: "GET" }))
  expect(within(dialog).getByText("本地清单")).toBeInTheDocument()
})

it("uses the same wide Manus geometry for personal details", () => {
  const css = readFileSync("src/ui/skills/personal-skills-read.module.css", "utf8")
  expect(css).toMatch(/\.detailDialog\[data-slot="dialog-content"\]\s*\{[^}]*width: min\(90rem, calc\(100vw - 2rem\)\);[^}]*max-width: calc\(100vw - 2rem\);[^}]*height: min\(68rem, calc\(100dvh - 2rem\)\);/u)
  expect(css).toMatch(/\.detailHero\s*\{[^}]*min-height: 19rem;[^}]*padding: 3rem 3rem 2rem;/u)
  expect(css).toMatch(/\.detailExamples button\s*\{[^}]*min-height: 4\.75rem;[^}]*padding: 1rem;/u)
})

it("uses Manus's responsive three-to-two-to-one catalog geometry without inventing cover data", () => {
  const css = readFileSync("src/features/app/kokoro-skills-surface.module.css", "utf8")
  expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));")
  expect(css).not.toContain("grid-template-columns: repeat(3, minmax(0, 1fr));")
  expect(css).toMatch(/\.headerTools\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/u)
  expect(css).toMatch(/\.header\s*\{[\s\S]*?align-items: start;/u)
  expect(css).toMatch(/@media \(max-width: 48rem\) \{[\s\S]*?\.header\s*\{[\s\S]*?grid-template-columns: 1fr;/u)
  expect(css).toContain("aspect-ratio: 2 / 1;")
  expect(css).toMatch(/@media \(max-width: 42rem\) \{[\s\S]*?\.grid\s*\{[\s\S]*?grid-template-columns: 1fr;/u)
  expect(css).toMatch(/\.categoryFilter\s*\{[^}]*display: block;/u)
  expect(css).not.toMatch(/\.categoryRail/u)
  expect(css).not.toMatch(/@media \(max-width: 42rem\) \{[\s\S]*?\.mySkillsButton\s*\{\s*display:\s*none;/u)
  expect(readFileSync("src/features/app/kokoro-skills-surface.tsx", "utf8")).toContain("skill.cover_image ? <Image")
})

it("uses Manus's stacked desktop controls and proportional illustrated cards", () => {
  const css = readFileSync("src/features/app/kokoro-skills-surface.module.css", "utf8")
  expect(css).toMatch(/\.headerTools\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*align-items: stretch;/u)
  expect(css).toMatch(/\.searchField\s*\{[^}]*width: 100%;[^}]*flex: 0 1 auto;/u)
  expect(css).toMatch(/\.cardArt\s*\{[^}]*aspect-ratio: 2 \/ 1;/u)
  expect(css).toMatch(/\.artSkeleton\s*\{[^}]*aspect-ratio: 2 \/ 1;/u)
  expect(css).toMatch(/\.card\s*\{[^}]*background: rgb\(255 255 254\);/u)
})
