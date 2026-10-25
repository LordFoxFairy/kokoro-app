import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { LocaleProvider } from "@/i18n/context"

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("retries a failed marketplace search from its open pending detail without losing the selected revision", async () => {
  const card = { skillId: "search-recovery-series", displayName: "Search recovery", currentVersion: { versionUid: "search-recovery-revision" } }
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "catalog-recovery" } })
  const reads: { path: string; body: unknown }[] = []
  let searchReads = 0
  let rejectSearch!: (error: Error) => void
  let finishRetry!: (response: Response) => void
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    const body: unknown = JSON.parse(String(init?.body))
    reads.push({ path, body })
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      if ((body as { query?: string }).query) {
        searchReads++
        if (searchReads === 1) return new Promise<Response>((_, reject) => { rejectSearch = reject })
        return new Promise<Response>(resolve => { finishRetry = resolve })
      }
      return response({ skills: [card], tagOptions: {} })
    }
    if (path.endsWith("GetSkill")) return response({
      skill: { id: card.skillId, version: card.currentVersion.versionUid, displayName: card.displayName, description: "Confirmed selected revision" },
      downloadInfo: { downloadUrl: "/api/skill-downloads/fixture", filename: "fixture.zip", expiresAt: "2999-01-01T00:00:00Z" },
    })
    throw Error(`Unexpected request: ${path}`)
  })
  render(<LocaleProvider><KokoroSkillsSurface onPrompt={vi.fn()} preview={false} projectReadBoundary={{ admitted: true, subject: "marketplace-recovery-reader", generation: 1 }} /></LocaleProvider>)
  const trigger = await screen.findByRole("button", { name: card.displayName })
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "Search" } })
  await waitFor(() => expect(rejectSearch).toBeTypeOf("function"))
  fireEvent.click(trigger)
  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(within(dialog).queryByRole("button", { name: "重试" })).toBeNull()
  await act(async () => { rejectSearch(Error("catalog temporarily unavailable")) })
  await within(dialog).findByRole("alert")
  expect(reads.filter(read => read.path.endsWith("GetSkill"))).toHaveLength(0)

  // The background Retry is inert while the detail is modal. Recovery must
  // remain reachable inside the selected detail, not require closing it.
  fireEvent.click(within(dialog).getByRole("button", { name: "重试" }))
  await waitFor(() => expect(finishRetry).toBeTypeOf("function"))
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(within(dialog).queryByRole("button", { name: "添加" })).toBeNull()
  await act(async () => { finishRetry(response({ skills: [card], tagOptions: {} })) })
  expect(await within(dialog).findByText("Confirmed selected revision")).toBeVisible()
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(searchReads).toBe(2)
  expect(reads.filter(read => read.path.endsWith("ListHubSkills")).slice(1).map(read => read.body)).toEqual([
    { pageSize: 9, includeOfficialSkills: true, query: "Search" },
    { pageSize: 9, includeOfficialSkills: true, query: "Search" },
  ])
  expect(reads.filter(read => read.path.endsWith("GetSkill")).map(read => read.body)).toEqual([{ skillId: card.skillId }])
  expect(reads.every(read => /\/(?:ListSkills|ListHubSkills|GetSkill)$/u.test(read.path))).toBe(true)
  fireEvent.keyDown(dialog, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  await waitFor(() => expect(trigger).toHaveFocus())
})

it("offers pending-detail recovery only after admission and retires a late retry on actor change", async () => {
  const card = { skillId: "recheck-series", displayName: "Rechecked skill", currentVersion: { versionUid: "recheck-revision" } }
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "catalog-recheck" } })
  let catalogReads = 0
  let finishRetry!: (response: Response) => void
  const metadataReads: unknown[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      catalogReads++
      if (catalogReads === 2) throw Error("recheck catalog unavailable")
      if (catalogReads === 3) return new Promise<Response>(resolve => { finishRetry = resolve })
      return response({ skills: [card], tagOptions: {} })
    }
    if (path.endsWith("GetSkill")) {
      metadataReads.push(JSON.parse(String(init?.body)))
      return response({
        skill: { id: card.skillId, version: card.currentVersion.versionUid, displayName: card.displayName, description: "Current metadata" },
        downloadInfo: { downloadUrl: "/api/skill-downloads/fixture", filename: "fixture.zip", expiresAt: "2999-01-01T00:00:00Z" },
      })
    }
    throw Error(`Unexpected request: ${path}`)
  })
  const content = (admitted: boolean, generation: number, subject = "original-reader") => <LocaleProvider><KokoroSkillsSurface onPrompt={vi.fn()} preview={false} projectReadBoundary={{ admitted, subject, generation }} /></LocaleProvider>
  const view = render(content(true, 1))
  fireEvent.click(await screen.findByRole("button", { name: card.displayName }))
  await screen.findByText("Current metadata")
  view.rerender(content(false, 2))
  const dialog = screen.getByRole("dialog")
  expect(within(dialog).queryByRole("button", { name: "重试" })).toBeNull()
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(screen.queryByText("Current metadata")).toBeNull()
  expect(catalogReads).toBe(1)

  view.rerender(content(true, 2))
  fireEvent.click(await within(dialog).findByRole("button", { name: "重试" }))
  await waitFor(() => expect(finishRetry).toBeTypeOf("function"))
  view.rerender(content(true, 3, "different-reader"))
  await screen.findByRole("button", { name: card.displayName })
  await act(async () => { finishRetry(response({ skills: [card], tagOptions: {} })) })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.queryByText("Current metadata")).toBeNull()
  expect(metadataReads).toEqual([{ skillId: card.skillId }])
})
