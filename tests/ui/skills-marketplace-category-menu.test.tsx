import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { KokoroSkillsSurface } from "@/features/app/kokoro-skills-surface"
import { LocaleProvider } from "@/i18n/context"

let subject = 0
const originalResizeObserver = window.ResizeObserver
beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem("kokoro.locale", "zh")
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.ResizeObserver = originalResizeObserver
})

function catalogLayout(initialWidth: number) {
  let width = initialWidth
  const observers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>()
  const entry = (target: Element) => ({
    target,
    // jsdom has no font/layout engine. Supply the available canvas and a
    // translated label row's measured width; assertions remain UI/wire based.
    contentRect: { width: target.tagName === "NAV" ? width : 626 },
  }) as ResizeObserverEntry
  window.ResizeObserver = class {
    record: { callback: ResizeObserverCallback; targets: Set<Element> }
    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, targets: new Set() }
      observers.add(this.record)
    }
    observe(target: Element) {
      this.record.targets.add(target)
      this.record.callback([entry(target)], this as unknown as ResizeObserver)
    }
    unobserve(target: Element) { this.record.targets.delete(target) }
    disconnect() { observers.delete(this.record) }
  }
  return async (next: number) => {
    width = next
    await act(async () => {
      for (const observer of observers) observer.callback([...observer.targets].map(entry), {} as ResizeObserver)
    })
  }
}

function renderCatalog() {
  const reads: Record<string, unknown>[] = []
  const response = (body: unknown) => Response.json(body, { headers: { "cache-control": "private, no-store", "x-request-id": "category-read" } })
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input)
    if (path.endsWith("ListSkills")) return response({ userAddedSkills: [], officialSkills: [] })
    if (path.endsWith("ListHubSkills")) {
      reads.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return response({ skills: [], tagOptions: {} })
    }
    throw Error(`Unexpected non-catalog request: ${path}`)
  })
  render(<LocaleProvider><KokoroSkillsSurface preview={false} onPrompt={vi.fn()} projectReadBoundary={{ admitted: true, subject: `category-reader-${++subject}`, generation: 1 }} /></LocaleProvider>)
  return reads
}

it("uses one compact category menu and keeps the search on an explicit owner-backed category change", async () => {
  catalogLayout(342)
  const reads = renderCatalog()
  const nav = screen.getByRole("navigation", { name: "技能分类" })
  const trigger = within(nav).getByRole("button", { name: "全部" })
  expect(within(nav).getAllByRole("button")).toHaveLength(1)
  expect(trigger).toHaveAttribute("aria-haspopup", "menu")
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "query stays" } })
  await waitFor(() => expect(reads.at(-1)?.query).toBe("query stays"))
  fireEvent.keyDown(trigger, { key: "Enter" })
  const menu = await screen.findByRole("menu")
  expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(9)
  expect(within(menu).getByRole("menuitemradio", { name: "全部" })).toHaveAttribute("aria-checked", "true")
  fireEvent.click(within(menu).getByRole("menuitemradio", { name: "编程" }))
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  expect(within(nav).getByRole("button", { name: "编程" })).toHaveFocus()
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("query stays")
  await waitFor(() => expect(reads.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "query stays", tag: "SKILL_HUB_TAG_CODING" }))
})

it("preserves the single category and query across canvas changes without another read, and restores focus on Escape", async () => {
  const resize = catalogLayout(752)
  const reads = renderCatalog()
  const nav = screen.getByRole("navigation", { name: "技能分类" })
  expect(within(nav).getAllByRole("button")).toHaveLength(9)
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "retained" } })
  fireEvent.click(within(nav).getByRole("button", { name: "数据" }))
  await waitFor(() => expect(reads.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "retained", tag: "SKILL_HUB_TAG_DATA" }))
  const readCount = reads.length
  await resize(342)
  const trigger = within(nav).getByRole("button", { name: "数据" })
  expect(within(nav).getAllByRole("button")).toHaveLength(1)
  fireEvent.keyDown(trigger, { key: "Enter" })
  const menu = await screen.findByRole("menu")
  expect(within(menu).getByRole("menuitemradio", { name: "数据" })).toHaveAttribute("aria-checked", "true")
  fireEvent.keyDown(menu, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  await waitFor(() => expect(trigger).toHaveFocus())
  await resize(752)
  expect(within(nav).getAllByRole("button")).toHaveLength(9)
  expect(within(nav).getByRole("button", { name: "数据" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("retained")
  expect(reads).toHaveLength(readCount)
})


it("keeps keyboard category selection and its query when the compact menu returns to a full row", async () => {
  const resize = catalogLayout(342)
  const reads = renderCatalog()
  const nav = screen.getByRole("navigation", { name: "技能分类" })
  const trigger = within(nav).getByRole("button", { name: "全部" })
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索技能" }), { target: { value: "keyboard query" } })
  await waitFor(() => expect(reads.at(-1)?.query).toBe("keyboard query"))
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  const menu = await screen.findByRole("menu")
  const all = within(menu).getByRole("menuitemradio", { name: "全部" })
  await waitFor(() => expect(all).toHaveFocus())
  fireEvent.keyDown(all, { key: "ArrowDown" })
  const coding = within(menu).getByRole("menuitemradio", { name: "编程" })
  await waitFor(() => expect(coding).toHaveFocus())
  fireEvent.keyDown(coding, { key: "Enter" })
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  await waitFor(() => expect(within(nav).getByRole("button", { name: "编程" })).toHaveFocus())
  await waitFor(() => expect(reads.at(-1)).toEqual({ pageSize: 9, includeOfficialSkills: true, query: "keyboard query", tag: "SKILL_HUB_TAG_CODING" }))
  const readCount = reads.length
  await resize(752)
  expect(within(nav).getAllByRole("button")).toHaveLength(9)
  expect(within(nav).getByRole("button", { name: "编程" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByRole("searchbox", { name: "搜索技能" })).toHaveValue("keyboard query")
  expect(reads).toHaveLength(readCount)
})
