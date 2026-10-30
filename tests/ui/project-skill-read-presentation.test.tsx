import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { ProjectSkillsSection } from "@/features/app/project-skills-section"

const id = "project_11111111-1111-4111-8111-111111111111"
const project = { id, name: "Project", slug: "project", description: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }
const installation = { installation_id: "project-install-1", source_ref: "skill:revision-1", series_id: "series-1", revision: "1", installed: true, enabled: true,
  installed_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", display_name: "Read Skill", summary: "Exact project installation", source_status: "active",
  skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "5" }, tags: [] }
const reply = (body: unknown) => Response.json(body, { headers: { "cache-control": "no-store", "x-request-id": "skill-read-test" } })
const defaults = () => reply({ data: { project_id: id, installation_ids: [] } })
function mount(admitted = true) {
  return render(<LocaleProvider><ProjectSkillsSection projectDetail={{ status: "ready", data: project }} projectReadBoundary={{ admitted, subject: admitted ? "reader" : null, generation: 1 }} /></LocaleProvider>)
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: /^技能$/ }))
  return screen.getByRole("dialog", { name: "项目技能" })
}
async function close(dialog: HTMLElement) {
  fireEvent.keyDown(dialog, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
}
beforeEach(() => localStorage.setItem("kokoro.locale", "zh"))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

it("ordinary loading is only busy semantics and sr-only status, never a visible card or fake empty", async () => {
  let finish!: (value: Response) => void
  vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("skill-selection") ? defaults() : new Promise<Response>(resolve => { finish = resolve })))
  mount()
  const dialog = open()
  expect(within(dialog).getByRole("status")).toHaveClass("sr-only")
  expect(dialog).toHaveAttribute("aria-busy", "true")
  expect(within(dialog).queryByText("尚无技能")).not.toBeInTheDocument()
  expect(within(dialog).getByRole("button", { name: "新增" })).toBeDisabled()
  await waitFor(() => expect(finish).toBeTypeOf("function"))
  await act(async () => finish(reply({ data: [installation] })))
  expect(await within(dialog).findByRole("switch", { name: "启用 Read Skill" })).toBeEnabled()
  expect(dialog).toHaveAttribute("aria-busy", "false")
})

it("blocked reads are quiet, have no write eligibility, and issue no request", () => {
  const fetcher = vi.fn()
  vi.stubGlobal("fetch", fetcher)
  mount(false)
  const dialog = open()
  expect(within(dialog).getByRole("status")).toHaveClass("sr-only")
  expect(dialog).toHaveAttribute("aria-busy", "true")
  expect(within(dialog).getByRole("button", { name: "新增" })).toBeDisabled()
  expect(within(dialog).queryByText("尚无技能")).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

it("ordinary read failure is not empty or a retry card; close/reopen explicitly starts fresh GET", async () => {
  let fail = true, reads = 0
  const fetcher = vi.fn(async (input: string) => {
    if (input.includes("skill-selection")) return defaults()
    reads++
    if (fail) throw new TypeError("read unavailable")
    return reply({ data: [installation] })
  })
  vi.stubGlobal("fetch", fetcher)
  mount()
  let dialog = open()
  const status = await within(dialog).findByText("技能读取失败，请重试。")
  expect(status).toHaveClass("sr-only")
  expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
  expect(within(dialog).queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(within(dialog).queryByText("尚无技能")).not.toBeInTheDocument()
  expect(reads).toBe(1)
  await close(dialog)
  fail = false
  dialog = open()
  await within(dialog).findByRole("switch", { name: "启用 Read Skill" })
  expect(reads).toBe(2)
})

it("list read failure retains only existing same-scope facts, without visible generic retry or fake empty", async () => {
  let failSearch = false
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("skill-selection")) return defaults()
    if (failSearch) throw new TypeError("search unavailable")
    return reply({ data: [installation] })
  }))
  mount()
  const dialog = open()
  await within(dialog).findByRole("switch", { name: "启用 Read Skill" })
  failSearch = true
  fireEvent.change(within(dialog).getByRole("textbox", { name: "搜索技能" }), { target: { value: "next query" } })
  const status = await within(dialog).findByText("技能读取失败，请重试。")
  expect(status).toHaveClass("sr-only")
  expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument()
  expect(within(dialog).queryByRole("button", { name: "重试" })).not.toBeInTheDocument()
  expect(within(dialog).getByRole("switch", { name: "启用 Read Skill" })).toBeDisabled()
  expect(within(dialog).queryByText("尚无技能")).not.toBeInTheDocument()
})

it.each(["unknown", "ack-read-failed"] as const)("quiet ordinary reads preserve explicit %s mutation recovery", async mode => {
  let item = { ...installation }, readFailure = false
  const writes: Array<{ key: string | null; body: string }> = []
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      writes.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) })
      if (mode === "unknown" && writes.length === 1) throw new TypeError("ACK lost")
      item = { ...item, enabled: false }
      if (mode === "ack-read-failed") readFailure = true
      return reply({ data: { installation: item, change: "disabled", event_id: "event-disabled", replayed: false } })
    }
    if (readFailure) throw new TypeError("read after ACK unavailable")
    return input.includes("skill-selection") ? defaults() : reply({ data: [item] })
  }))
  mount()
  let dialog = open()
  fireEvent.click(await within(dialog).findByRole("switch", { name: "启用 Read Skill" }))
  await within(dialog).findByRole("button", { name: mode === "unknown" ? "重试原操作" : "重新读取" })
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent(mode === "unknown" ? "操作结果尚未确认" : "操作已确认，但读取失败"))
  await close(dialog)
  dialog = open()
  const retry = await within(dialog).findByRole("button", { name: mode === "unknown" ? "重试原操作" : "重新读取" })
  await waitFor(() => expect(retry).toBeEnabled())
  expect(writes).toHaveLength(1)
  readFailure = false
  fireEvent.click(retry)
  await waitFor(() => expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument())
  expect(within(dialog).getByRole("switch", { name: "启用 Read Skill" })).not.toBeChecked()
  expect(writes).toHaveLength(mode === "unknown" ? 2 : 1)
  if (mode === "unknown") expect(writes[1]).toEqual(writes[0])
  expect(writes[0]?.key).toMatch(/^project-skill:/u)
})

it("opens an exact Project installation detail and reader without personal actions or catalog requests", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path.includes("skill-selection")) return defaults()
    if (path.endsWith(`/skill-installations/${installation.installation_id}`)) return reply({ data: installation })
    if (path.endsWith("/package")) return reply({ data: { source_ref: installation.source_ref, revision: installation.revision, files: [], selected_file: null } })
    return reply({ data: [installation] })
  })
  vi.stubGlobal("fetch", fetcher)
  mount(); const list = open()
  const title = await within(list).findByRole("button", { name: installation.display_name })
  fireEvent.click(title)
  const detail = await screen.findByRole("dialog", { name: installation.display_name })
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path) === `/api/hub/projects/${id}/skill-installations/${installation.installation_id}`)).toBe(true))
  expect(within(detail).queryByRole("button", { name: /添加到我的|分享|试用|启用|停用/ })).not.toBeInTheDocument()
  fireEvent.click(within(detail).getByRole("button", { name: "查看详情" }))
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path) === `/api/hub/projects/${id}/skill-installations/${installation.installation_id}/package`)).toBe(true))
  expect(fetcher.mock.calls.every(([path]) => String(path).startsWith(`/api/hub/projects/${id}/`))).toBe(true)
})
