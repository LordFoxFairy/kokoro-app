import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { LocaleProvider } from "@/i18n/context"
import { invalidate } from "@/lib/query"
import { downloadManusSkill } from "@/ui/skills/manus-skill-client"

const catalog = {
  skills: [{
    skillId: "skill-manim", displayName: "Manim 动画师", userDescription: "使用 Manim 生成数学动画。",
    usageCount: "37000", publisherType: "SKILL_HUB_PUBLISHER_TYPE_MANUS_OFFICIAL",
    tags: { values: ["SKILL_HUB_TAG_MEDIA"] }, exampleQuestions: ["创建一个几何证明动画。"],
    createdAt: "2026-05-22T00:00:00.000Z", coverImage: "/api/v1/skills/skill-manim/cover",
  }], nextPageToken: undefined,
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
    if (path === "/api/hub/self/skill-installations" && init?.method === "POST") return response({ data: { installation: { installation_id: "i1", source_ref: "skill:skill-manim", series_id: "skill-manim", revision: "1", installed: true, enabled: true, installed_at: "2026-10-10T00:00:00.000Z", updated_at: "2026-10-10T00:00:00.000Z" }, change: "installed", event_id: "event-1", replayed: false } })
    throw new Error(`unexpected ${path}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  renderLive()
  fireEvent.click(await screen.findByRole("button", { name: "添加 Manim 动画师" }))
  await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === "/api/hub/self/skill-installations")).toBe(true))
  const call = fetchMock.mock.calls.find(([path]) => path === "/api/hub/self/skill-installations")
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ source_ref: "skill:skill-manim" })
})
