import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { LocaleProvider } from "@/i18n/context"
import { invalidate } from "@/lib/query"
import { createHubClient } from "@/hub/client"
import { createManusSkillHubClient, getManusSkillDetail, downloadManusSkill, getManusSkillPackage } from "@/ui/skills/manus-skill-client"

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

it("uses the compact Manus-style filter trigger rather than an always-visible category strip", async () => {
  const fetchMock = vi.fn(async (path: string) => response(path.endsWith("ListHubSkills") ? catalog : { userAddedSkills: [], officialSkills: [] }))
  vi.stubGlobal("fetch", fetchMock)
  renderLive()
  await screen.findByTestId("skills-catalog-grid")
  expect(screen.queryByRole("navigation", { name: "技能分类" })).toBeNull()
  const filter = screen.getByRole("button", { name: "技能分类" })
  fireEvent.pointerDown(filter)
  fireEvent.click(filter)
  expect(await screen.findByText("媒体", { selector: "[role=menuitem]" })).toBeInTheDocument()
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
const localizedSkill = { skill_id: "skill-manim", name: "Manim", description: "Server description", content_hash: "owner-checksum", scope: "official", enabled: false, installed: false, usage_count: "37000" }

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
  const filter = screen.getByRole("button", { name: "技能分类" })
  fireEvent.pointerDown(filter)
  fireEvent.click(filter)
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
  { locale, scope, tag: "CODING", category: locale === "zh" ? "程式设计" : "Coding" },
  { locale, scope, tag: "DATA", category: locale === "zh" ? "资料" : "Data" },
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
it("catalog art stays empty without an owner cover fact instead of synthesizing a series request", async () => {
  const { coverImage: _cover, ...noCover } = ownerHub.skills[0]!
  void _cover
  stubOwnerReads({ ...ownerHub, nextPageToken: undefined, skills: [noCover] })
  renderLive()
  const title = await screen.findByRole("button", { name: "Current" })
  const card = title.closest('[data-slot="card"]') as HTMLElement
  expect(card.querySelector("img")).toBeNull()
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
