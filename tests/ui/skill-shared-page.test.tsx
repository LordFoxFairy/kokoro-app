import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import SharedSkillPage from "@/app/skills/shared/[id]/page"
const context = vi.hoisted(() => ({ id: "share-old", subject: "user-1" as string | null, admitted: true, generation: 1, unavailable: false, requestPending: false, retry: vi.fn(), state: "pass", push: vi.fn() }))
vi.mock("next/navigation", () => ({ useParams: () => ({ id: context.id }), useRouter: () => ({ push: context.push }) }))
vi.mock("@/ui/auth/use-session-state", () => ({ useSessionProbe: () => ({ state: context.state, unavailable: context.unavailable, requestPending: context.requestPending, retry: context.retry, projectReadBoundary: { subject: context.subject, admitted: context.admitted, generation: context.generation } }) }))
vi.mock("@/system/use-runtime-manifest", () => ({ useRuntimeManifest: () => ({ manifest: { brand: { name: "Kokoro" } } }) }))
const skill = { skill_id: "revision-old", series_id: "series", revision: "1", display_name: "Actual old revision", description: "Actual description", tags: [], example_prompts: ["Actual example"], category_keys: ["apps"], created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z", owner_type: "official", source_kind: "official" }
const installation = { display_name: skill.display_name, summary: skill.description, source_status: "active", skill_updated_at: skill.updated_at, example_prompts: [], category_keys: [], product: { publication_audience: "catalog", state_version: "5" }, tags: [], installation_id: "installed-old", source_ref: "skill:revision-old", series_id: "series", revision: "1", installed: true, enabled: true, installed_at: skill.created_at, updated_at: skill.updated_at }
const headers = { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "share-request" }
function json(data: unknown) { return new Response(JSON.stringify(data), { headers }) }
function reads(path: string): Response | undefined {
  if (path === "/api/hub/skill-shares/share-old") return json({ data: { share_id: "share-old", source_ref: "skill:revision-old", url: `${window.location.origin}/skills/shared/share-old`, created_at: skill.created_at, expires_at: null, revoked_at: null } })
  if (path === "/api/hub/skill-shares/share-old/skill") return json({ data: { share_id: "share-old", source_ref: "skill:revision-old", skill } })
  return undefined
}
beforeEach(() => { context.id = "share-old"; context.subject = "user-1"; context.admitted = true; context.generation = 1; context.unavailable = false; context.requestPending = false; context.retry.mockReset(); context.state = "pass"; context.push.mockReset(); window.localStorage.clear(); window.localStorage.setItem("kokoro.locale", "zh") })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it("retains a canonical shared return target for an anonymous user without reading owners", () => {
  context.subject = null; context.admitted = false; context.state = "anonymous"
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher)
  render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.getByRole("link", { name: "登录并继续" })).toHaveAttribute("href", "/login?return_to=%2Fskills%2Fshared%2Fshare-old")
  expect(fetcher).not.toHaveBeenCalled()
})
it("renders the exact old summary, offers exact download and installs only the revision ACK", async () => {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => reads(path) ?? (init?.method === "POST" ? json({ data: { installation, change: "installed", event_id: "install-event", replayed: false } }) : json({ data: [] })))
  vi.stubGlobal("fetch", fetcher)
  render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(await screen.findByText(skill.display_name)).toBeInTheDocument()
  const add = screen.getByRole("button", { name: "添加到我的技能" })
  await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add)
  expect(await screen.findByRole("button", { name: "已添加到我的技能" })).toBeDisabled()
  const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST")
  expect(post?.[0]).toBe("/api/hub/self/skill-installations")
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ source_ref: "skill:revision-old" })
  expect(fetcher.mock.calls.some(([path]) => path.includes("GetSkill") || path.includes("Download"))).toBe(false)
  expect(screen.getByRole("button", { name: "下载技能" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "Actual example" })).toBeDisabled()
})
it("keeps another actual pinned revision without upgrading or displaying fake installed", async () => {
  const other = { ...installation, source_ref: "skill:newer-revision", revision: "2", enabled: false }
  const fetcher = vi.fn(async (path: string) => reads(path) ?? json({ data: path.includes("installed-old") ? other : [other] }))
  vi.stubGlobal("fetch", fetcher); render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(await screen.findByText(/其他固定版本/u)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "添加到我的技能" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: "已添加到我的技能" })).toBeNull()
  expect(fetcher.mock.calls).toHaveLength(4)
})
it("preserves the original installation key across rechecks while retiring an unknown old ACK", async () => {
  let writes = 0
  let finishOldAck!: (response: Response) => void
  let oldSignal: AbortSignal | undefined
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const read = reads(path); if (read) return read
    if (init?.method !== "POST") return json({ data: [] })
    if (++writes === 1) throw new Error("lost ACK")
    if (writes === 2) { oldSignal = init.signal ?? undefined; return new Promise<Response>(resolve => { finishOldAck = resolve }) }
    return json({ data: { installation, change: "installed", event_id: "event", replayed: true } })
  })
  vi.stubGlobal("fetch", fetcher)
  const mounted = render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  const add = await screen.findByRole("button", { name: "添加到我的技能" }); await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add)
  await screen.findByText("添加失败，请稍后重试。")
  fireEvent.click(add); await waitFor(() => expect(finishOldAck).toBeTypeOf("function"))
  context.generation = 2
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(oldSignal?.aborted).toBe(true)
  expect(screen.queryByText(skill.display_name)).toBeNull()
  const recover = await screen.findByRole("button", { name: "添加到我的技能" })
  await waitFor(() => expect(recover).toBeEnabled())
  expect(writes).toBe(2)
  await act(async () => { finishOldAck(json({ data: { installation, change: "installed", event_id: "retired-event", replayed: true } })); await Promise.resolve() })
  expect(screen.queryByRole("button", { name: "已添加到我的技能" })).toBeNull()
  expect(recover).toBeEnabled()
  fireEvent.click(recover); await screen.findByRole("button", { name: "已添加到我的技能" })
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST")
  expect(posts).toHaveLength(3)
  for (const post of posts.slice(1)) {
    expect(post[1]?.body).toBe(posts[0]?.[1]?.body)
    expect(new Headers(post[1]?.headers).get("idempotency-key")).toBe(new Headers(posts[0]?.[1]?.headers).get("idempotency-key"))
  }
})

it("retires loaded facts across actor and share changes without A to B to A resurrection or late reads", async () => {
  let finishSummary!: (response: Response) => void
  let hold = false
  const name = skill.display_name
  const fetcher = vi.fn(async (path: string) => {
    const url = new URL(path, window.location.origin)
    if (url.pathname.startsWith("/api/hub/skill-shares/")) {
      const shareId = url.pathname.split("/")[4]!
      if (url.pathname.endsWith("/skill")) {
        if (hold) return new Promise<Response>(resolve => { finishSummary = resolve })
        return json({ data: { share_id: shareId, source_ref: "skill:revision-old", skill: { ...skill, display_name: name } } })
      }
      return json({ data: { share_id: shareId, source_ref: "skill:revision-old", url: `${window.location.origin}/skills/shared/${shareId}`, created_at: skill.created_at, expires_at: null, revoked_at: null } })
    }
    return json({ data: [] })
  })
  const summary = (shareId: string, displayName: string) => json({ data: { share_id: shareId, source_ref: "skill:revision-old", skill: { ...skill, display_name: displayName } } })
  vi.stubGlobal("fetch", fetcher)
  const mounted = render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await screen.findByText(skill.display_name)
  hold = true; context.subject = "user-2"; context.generation = 2
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.queryByText(skill.display_name)).toBeNull()
  await waitFor(() => expect(finishSummary).toBeTypeOf("function"))
  await act(async () => { finishSummary(summary("share-old", "Account B facts")) })
  await screen.findByText("Account B facts")
  const oldFinish = finishSummary
  context.subject = "user-1"; context.generation = 3
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.queryByText(skill.display_name)).toBeNull()
  expect(screen.queryByText("Account B facts")).toBeNull()
  await waitFor(() => expect(finishSummary).not.toBe(oldFinish))
  await act(async () => { finishSummary(summary("share-old", "Fresh account A facts")) })
  await screen.findByText("Fresh account A facts")
  // Returning to A before B resolves must not resurrect A's already loaded facts.
  const beforePendingB = finishSummary
  context.subject = "user-2"; context.generation = 4
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await waitFor(() => expect(finishSummary).not.toBe(beforePendingB))
  const retiredB = finishSummary
  context.subject = "user-1"; context.generation = 5
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.queryByText("Fresh account A facts")).toBeNull()
  await waitFor(() => expect(finishSummary).not.toBe(retiredB))
  await act(async () => { retiredB(summary("share-old", "Retired account B facts")); await Promise.resolve() })
  expect(screen.queryByText("Retired account B facts")).toBeNull()
  await act(async () => { finishSummary(summary("share-old", "Refreshed account A facts")) })
  await screen.findByText("Refreshed account A facts")
  const oldShareFinish = finishSummary
  context.id = "share-next"; context.generation = 6
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.queryByText("Refreshed account A facts")).toBeNull()
  await waitFor(() => expect(finishSummary).not.toBe(oldShareFinish))
  const late = finishSummary
  context.subject = null; context.admitted = false; context.state = "anonymous"; context.generation = 7
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await act(async () => { late(summary("share-next", "Retired private share facts")) })
  expect(screen.getByRole("link", { name: "登录并继续" })).toHaveAttribute("href", "/login?return_to=%2Fskills%2Fshared%2Fshare-next")
  expect(screen.queryByText("Retired private share facts")).toBeNull()
  expect(screen.queryByRole("dialog")).toBeNull()
})

it("rejects a shared package directory with the same UID but another decimal revision before reading a file", async () => {
  const fetcher = vi.fn(async (path: string) => reads(path) ?? (path.includes("/package") ? json({ data: { source_ref: "skill:revision-old", revision: "2", files: [{ path: "SKILL.md", size_bytes: "12" }], selected_file: path.includes("file_path=") ? { path: "SKILL.md", text: "# Owner text" } : null } }) : json({ data: [] })))
  vi.stubGlobal("fetch", fetcher)
  render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "查看详情" }))
  await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "false"))
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.queryByRole("button", { name: "SKILL.md" })).toBeNull()
  expect(fetcher.mock.calls.filter(([path]) => path.includes("/package"))).toHaveLength(1)
  expect(fetcher.mock.calls.some(([path]) => path.includes("file_path="))).toBe(false)
})

it("keeps the exact shared reader through quiet summary rechecks without retaining retired facts", async () => {
  const documents = { "SKILL.md": "# Shared root", "references/notes.md": "# Shared selected notes\n\n" + "Shared paragraph.\n\n".repeat(40) }
  const files = Object.entries(documents).map(([path, text]) => ({ path, size_bytes: String(new TextEncoder().encode(text).byteLength) }))
  let failSummary = false
  const fetcher = vi.fn(async (path: string) => {
    if (path.endsWith("/skill") && failSummary) throw new Error("fresh summary unavailable")
    if (path.includes("/package")) {
      const selected = new URL(path, window.location.origin).searchParams.get("file_path") as keyof typeof documents | null
      return json({ data: { source_ref: "skill:revision-old", revision: "1", files, selected_file: selected === null ? null : { path: selected, text: documents[selected] } } })
    }
    return reads(path) ?? json({ data: [] })
  })
  vi.stubGlobal("fetch", fetcher)
  const mounted = render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await screen.findByText(skill.display_name)
  expect(screen.getByRole("button", { name: "下载技能" })).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  await screen.findByRole("heading", { name: "Shared root", level: 1 })
  fireEvent.click(screen.getByRole("button", { name: "references" }))
  fireEvent.click(screen.getByRole("button", { name: "references/notes.md" }))
  const selected = await screen.findByRole("heading", { name: "Shared selected notes", level: 1 })
  fireEvent.scroll(selected.closest<HTMLElement>("[aria-busy]")!, { target: { scrollTop: 240 } })
  const dialog = screen.getByRole("dialog")
  const count = fetcher.mock.calls.length
  context.admitted = false; context.state = "checking"; context.generation = 2
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByText(skill.display_name)).toBeNull()
  expect(screen.queryByRole("heading", { name: "Shared selected notes" })).toBeNull()
  expect(within(dialog).getByRole("button", { name: "技能详情" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "下载技能" })).toBeNull()
  expect(fetcher.mock.calls).toHaveLength(count)
  failSummary = true; context.admitted = true; context.state = "pass"
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"))
  expect(within(dialog).queryByRole("button", { name: "重试" })).toBeNull()
  expect(within(dialog).queryByRole("alert")).toBeNull()
  expect(screen.getByRole("dialog")).toBe(dialog)
  failSummary = false; context.generation = 3
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  const restored = await within(dialog).findByRole("heading", { name: "Shared selected notes", level: 1 })
  expect(restored.closest<HTMLElement>("[aria-busy]")!.scrollTop).toBe(240)
  expect(screen.getByRole("button", { name: "references" })).toHaveAttribute("aria-expanded", "true")
  const selectedReads = () => fetcher.mock.calls.filter(([path]) => path.includes("file_path=references%2Fnotes.md"))
  expect(selectedReads()).toHaveLength(2)
  // A new generation must also retire facts when admission never renders false.
  context.generation = 4; mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.queryByRole("heading", { name: "Shared selected notes" })).toBeNull()
  await within(dialog).findByRole("heading", { name: "Shared selected notes", level: 1 })
  expect(selectedReads()).toHaveLength(3)
  context.admitted = false; context.state = "unavailable"; context.unavailable = true; context.generation = 5
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.getByRole("dialog")).toBe(dialog)
  expect(screen.queryByRole("heading", { name: "Shared selected notes" })).toBeNull()
  const retrySession = within(dialog).getByRole("button", { name: "重试" })
  expect(retrySession).toBeEnabled()
  fireEvent.click(retrySession)
  expect(context.retry).toHaveBeenCalledTimes(1)
  context.requestPending = true
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(retrySession).toBeDisabled()
  context.requestPending = false; context.unavailable = false; context.admitted = true; context.state = "pass"; context.generation = 6
  mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await within(dialog).findByRole("heading", { name: "Shared selected notes", level: 1 })
  expect(selectedReads()).toHaveLength(4)
  expect(fetcher.mock.calls.some(([path]) => path.includes("GetSkill") || path.includes("DownloadSkill"))).toBe(false)
})

it("shows a failed exact download binding in the current dialog without a current-series fallback", async () => {
  const fetcher = vi.fn(async (path: string) => reads(path) ?? (path.endsWith("/download") ? json({ data: { source_ref: "skill:series", revision: "2", download_info: { download_url: `/skill-downloads/${"a".repeat(43)}`, filename: "wrong.zip", expires_at: "2099-01-01T00:00:00Z" } } }) : json({ data: [] })))
  vi.stubGlobal("fetch", fetcher); render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await screen.findByText(skill.display_name)
  fireEvent.click(screen.getByRole("button", { name: "下载技能" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("下载未完成，请重试。"))
  expect(screen.getByText(skill.display_name)).toBeInTheDocument()
  expect(screen.queryByText("技能详情暂时不可用")).toBeNull()
  expect(fetcher.mock.calls.filter(([path]) => path.endsWith("/download"))).toHaveLength(1)
  expect(fetcher.mock.calls.some(([path]) => path.includes("DownloadSkill") || path.includes("GetSkill"))).toBe(false)
})
