import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import SharedSkillPage from "@/app/skills/shared/[id]/page"
const context = vi.hoisted(() => ({ id: "share-old", subject: "user-1" as string | null, admitted: true, state: "pass", push: vi.fn() }))
vi.mock("next/navigation", () => ({ useParams: () => ({ id: context.id }), useRouter: () => ({ push: context.push }) }))
vi.mock("@/ui/auth/use-session-state", () => ({ useSessionProbe: () => ({ state: context.state, unavailable: false, retry: vi.fn(), projectReadBoundary: { subject: context.subject, admitted: context.admitted } }) }))
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
beforeEach(() => { context.id = "share-old"; context.subject = "user-1"; context.admitted = true; context.state = "pass"; context.push.mockReset(); window.localStorage.clear(); window.localStorage.setItem("kokoro.locale", "zh") })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it("retains a canonical shared return target for an anonymous user without reading owners", () => {
  context.subject = null; context.admitted = false; context.state = "anonymous"
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher)
  render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  expect(screen.getByRole("link", { name: "登录并继续" })).toHaveAttribute("href", "/login?return_to=%2Fskills%2Fshared%2Fshare-old")
  expect(fetcher).not.toHaveBeenCalled()
})
it("renders the exact old summary, hides unsupported download and installs only the revision ACK", async () => {
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
  expect(screen.queryByRole("button", { name: "下载技能" })).toBeNull()
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
it("preserves the original installation key across an unknown result", async () => {
  let writes = 0
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const read = reads(path); if (read) return read
    if (init?.method !== "POST") return json({ data: [] })
    if (++writes === 1) throw new Error("lost ACK")
    return json({ data: { installation, change: "installed", event_id: "event", replayed: true } })
  })
  vi.stubGlobal("fetch", fetcher); render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  const add = await screen.findByRole("button", { name: "添加到我的技能" }); await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add)
  await screen.findByText("添加失败，请稍后重试。")
  fireEvent.click(add); await screen.findByRole("button", { name: "已添加到我的技能" })
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST")
  expect(posts).toHaveLength(2)
  expect(posts[0]?.[1]?.body).toBe(posts[1]?.[1]?.body)
  expect(new Headers(posts[0]?.[1]?.headers).get("idempotency-key")).toBe(new Headers(posts[1]?.[1]?.headers).get("idempotency-key"))
})
it("does not expose a late old-account summary after identity changes", async () => {
  let finish!: (response: Response) => void
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  const mounted = render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  await waitFor(() => expect(finish).toBeTypeOf("function"))
  context.subject = null; context.admitted = false; context.state = "anonymous"; mounted.rerender(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  finish(reads("/api/hub/skill-shares/share-old")!)
  await waitFor(() => expect(screen.getByRole("link", { name: "登录并继续" })).toBeInTheDocument())
  expect(screen.queryByText(skill.display_name)).toBeNull()
})

it("rejects a shared package directory with the same UID but another decimal revision before reading a file", async () => {
  const fetcher = vi.fn(async (path: string) => reads(path) ?? (path.includes("/package") ? json({ data: { source_ref: "skill:revision-old", revision: "2", files: [{ path: "SKILL.md", size_bytes: "12" }], selected_file: path.includes("file_path=") ? { path: "SKILL.md", text: "# Owner text" } : null } }) : json({ data: [] })))
  vi.stubGlobal("fetch", fetcher)
  render(<LocaleProvider><SharedSkillPage /></LocaleProvider>)
  fireEvent.click(await screen.findByRole("button", { name: "查看详情" }))
  await screen.findByRole("button", { name: "重试" })
  expect(screen.queryByRole("button", { name: "SKILL.md" })).toBeNull()
  expect(fetcher.mock.calls.filter(([path]) => path.includes("/package"))).toHaveLength(1)
  expect(fetcher.mock.calls.some(([path]) => path.includes("file_path="))).toBe(false)
})
