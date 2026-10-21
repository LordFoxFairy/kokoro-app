import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import type { ManagedPersonalSkill, PersonalInstallation } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { SkillsContent } from "@/ui/skills/skills-panel"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cases: ReadonlyArray<{
  name: string
  sourceKind: "personal" | "official"
  profile?: PersonalInstallation["publisher_profile"]
  expected: string | null
}> = [
  { name: "personal publisher", sourceKind: "personal", profile: { kind: "user", id: "author", status: "found", display_name: "Actual skill author", image_url: null }, expected: "Actual skill author" },
  { name: "unresolved personal publisher", sourceKind: "personal", profile: { kind: "user", id: "author", status: "missing" }, expected: null },
  { name: "absent personal publisher", sourceKind: "personal", expected: null },
  { name: "confirmed official source", sourceKind: "official", expected: "Kokoro" },
]

it.each(cases)("uses authoritative installation attribution for $name, not an assumed brand", async ({ sourceKind, profile, expected }) => {
  const installation: PersonalInstallation = {
    installation_id: "publisher-installation", series_id: "publisher-series", source_ref: "skill:publisher-revision", revision: "1",
    installed: true, enabled: false, source_status: "active",
    installed_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z", skill_updated_at: "2026-10-21T00:00:00Z",
    display_name: "Selected skill", summary: "Confirmed installation summary", tags: [], example_prompts: [], category_keys: [],
    product: { publication_audience: "owner", state_version: "1", source_kind: sourceKind },
    ...(profile === undefined ? {} : { publisher_profile: profile }),
  }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("/api/hub/self/skill-installations/publisher-installation")
    return Response.json({ data: installation }, { headers: { "cache-control": "no-store", "x-request-id": "publisher-detail-test" } })
  }))
  render(<LocaleProvider><ManusSkillDetailDialog
    detailSource="installation" publisherLabel="Kokoro" open
    readBoundary={{ admitted: true, subject: "current-reader", generation: 1 }}
    skill={{ installation_id: "publisher-installation", skill_id: "publisher-series", revision_skill_id: "publisher-revision", source_ref: "skill:publisher-revision", installed_source_ref: "skill:publisher-revision", name: "Selected skill", description: "Unconfirmed card summary", content_hash: "publisher-series", scope: sourceKind, installed: true, enabled: false }}
    onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={() => false}
  /></LocaleProvider>)

  // A card label alone is not evidence of an installation's publisher.
  expect(screen.queryByText("Kokoro", { exact: true })).not.toBeInTheDocument()
  await screen.findByText("Confirmed installation summary")
  if (expected !== null) expect(screen.getByText(expected, { exact: true })).toBeVisible()
  if (expected !== "Kokoro") expect(screen.queryByText("Kokoro", { exact: true })).not.toBeInTheDocument()
})

it("opens personal revision management from the installed detail without writing or changing the selected pin", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const installation: PersonalInstallation = {
    installation_id: "mine-installation", series_id: "mine-series", source_ref: "skill:mine-revision", revision: "3",
    installed: true, enabled: false, source_status: "active",
    installed_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z", skill_updated_at: "2026-10-21T00:00:00Z",
    display_name: "Mine", summary: "My exact installed revision", tags: [], example_prompts: [], category_keys: [],
    product: { publication_audience: "owner", state_version: "8", source_kind: "personal" },
  }
  const fetcher = vi.fn(async () => Response.json({ data: installation }, { headers: { "cache-control": "no-store", "x-request-id": "managed-entry-test" } }))
  vi.stubGlobal("fetch", fetcher)
  const manage = vi.fn()
  render(<LocaleProvider><ManusSkillDetailDialog
    detailSource="installation" open readBoundary={{ admitted: true, subject: "reader", generation: 1 }}
    skill={{ installation_id: "mine-installation", skill_id: "mine-series", revision_skill_id: "mine-revision", source_ref: "skill:mine-revision", installed_source_ref: "skill:mine-revision", name: "Mine", description: "", content_hash: "mine-series", scope: "personal", installed: true, enabled: false }}
    onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={() => false} onManagePersonal={manage}
  /></LocaleProvider>)
  await screen.findByText("My exact installed revision")
  fireEvent.keyDown(screen.getByRole("button", { name: "更多技能操作" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "更新技能" }))
  expect(manage).toHaveBeenCalledExactlyOnceWith("update", installation)
  expect(fetcher).toHaveBeenCalledTimes(1)
})


function managementFixture() {
  const installation: PersonalInstallation = {
    installation_id: "manage-installation", series_id: "manage-series", source_ref: "skill:manage-revision", revision: "3",
    installed: true, enabled: false, source_status: "active",
    installed_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z", skill_updated_at: "2026-10-21T00:00:00Z",
    display_name: "Managed skill", summary: "Exact personal revision", tags: [], example_prompts: [], category_keys: [],
    product: { publication_audience: "owner", state_version: "8", source_kind: "personal" },
  }
  const managed: ManagedPersonalSkill = { skill_id: "manage-revision", source_ref: installation.source_ref, series_id: installation.series_id,
    revision: installation.revision, name: installation.display_name, summary: installation.summary, status: "active", tags: [],
    example_prompts: [], category_keys: [], skill_updated_at: installation.skill_updated_at, product: installation.product }
  const client = { ...createPreviewHubClient(), listSkillPool: async () => [{
    installation_id: installation.installation_id, skill_id: installation.series_id, revision_skill_id: managed.skill_id,
    source_ref: managed.source_ref, installed_source_ref: managed.source_ref, name: managed.name, description: managed.summary,
    scope: "personal", content_hash: managed.series_id, enabled: false,
  }] }
  const response = (data: unknown, managedRead = false) => Response.json({ data, ...(managedRead ? { meta: { request_id: "manage-ui" } } : {}) }, { headers: { "cache-control": "no-store", "x-request-id": "manage-ui" } })
  const content = (admitted = true, generation = 1, subject = "manager") => <LocaleProvider><SkillsContent readBoundary={{ admitted, generation, subject }} client={client} pinned={[]} onTogglePin={vi.fn()} embedded /></LocaleProvider>
  return { installation, managed, response, content }
}

async function openManagement(operation: "更新技能" | "撤回技能" | "技能版本历史") {
  fireEvent.click(await screen.findByRole("button", { name: "Managed skill" }))
  const more = await screen.findByRole("button", { name: "更多技能操作" })
  fireEvent.keyDown(more, { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: operation }))
}

it("connects the live Skills surface to an exact self-managed revision before opening an editable form", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { installation, managed, response, content } = managementFixture()
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/hub/self/skill-installations/manage-installation") return response(installation)
    expect(String(input)).toBe("/api/hub/self/skills/managed/manage-revision")
    return response(managed, true)
  })
  vi.stubGlobal("fetch", fetcher)
  render(content())
  await openManagement("更新技能")
  expect(await screen.findByLabelText("技能名称")).toHaveValue("Managed skill")
  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["/api/hub/self/skill-installations/manage-installation", "/api/hub/self/skills/managed/manage-revision"])
  fireEvent.keyDown(screen.getByTestId("personal-skill-publish-dialog"), { key: "Escape" })
  await waitFor(() => expect(screen.queryByTestId("personal-skill-publish-dialog")).toBeNull())
  await openManagement("撤回技能")
  expect(await screen.findByLabelText("撤回原因")).toHaveValue("")
})

it.each(["forbidden", "different-revision"] as const)("does not treat a personal source label as publisher authority: %s", async (failure) => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { installation, managed, response, content } = managementFixture()
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("skill-installations")) return response(installation)
    if (failure === "different-revision") return response({ ...managed, skill_id: "other", source_ref: "skill:other" }, true)
    return Response.json({ error: { code: "skill_forbidden", message: "Denied" }, meta: { request_id: "manage-ui" } }, { status: 403, headers: { "cache-control": "no-store", "x-request-id": "manage-ui" } })
  })
  vi.stubGlobal("fetch", fetcher)
  render(content())
  await openManagement("更新技能")
  await screen.findByRole("alert")
  expect(screen.queryByLabelText("技能名称")).toBeNull()
  expect(screen.queryByTestId("personal-skill-publish-dialog")).toBeNull()
})

it("retains an unknown withdrawal across close and re-admission, retries the original command only explicitly, and clears it on actor switch", async () => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { installation, managed, response, content } = managementFixture()
  const writes: RequestInit[] = []
  let reads = 0
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { writes.push(init); throw new Error("lost ACK") }
    if (String(input).includes("skill-installations")) return response(installation)
    reads += 1
    return response({ ...managed, product: { ...managed.product, state_version: reads === 1 ? "8" : "9" } }, true)
  })
  vi.stubGlobal("fetch", fetcher)
  const view = render(content())
  await openManagement("撤回技能")
  fireEvent.change(await screen.findByLabelText("撤回原因"), { target: { value: "Only this revision" } })
  fireEvent.click(screen.getByRole("button", { name: "确认撤回" }))
  await screen.findByRole("alert")
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  expect(await screen.findByRole("button", { name: "查看技能操作" })).toBeVisible()
  view.rerender(content(false, 2))
  expect(screen.queryByRole("button", { name: "查看技能操作" })).toBeNull()
  expect(screen.queryByText("Only this revision")).toBeNull()
  view.rerender(content(true, 2))
  fireEvent.click(await screen.findByRole("button", { name: "查看技能操作" }))
  await waitFor(() => expect(reads).toBe(2))
  const retry = await screen.findByRole("button", { name: "重试" })
  expect(writes).toHaveLength(1)
  fireEvent.click(retry)
  await waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]?.body).toBe(writes[0]?.body)
  expect(writes[1]?.headers).toEqual(writes[0]?.headers)
  expect(JSON.parse(String(writes[1]?.body))).toEqual({ reason: "Only this revision", expected_state_version: "8" })
  view.rerender(content(true, 3, "different-manager"))
  expect(screen.queryByRole("dialog", { name: "撤回技能" })).toBeNull()
  expect(screen.queryByRole("button", { name: "查看技能操作" })).toBeNull()
})

it.each(["confirmed", "unknown"] as const)("releases only a confirmed operation after the same actor's managed recheck fails: %s", async (outcome) => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { installation, managed, response, content } = managementFixture()
  let rejected = false
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      if (outcome === "unknown") throw new Error("lost ACK")
      return response({ source_ref: managed.source_ref, status: "withdrawn", event_id: `evt:${"a".repeat(64)}`, state_version: "9", replayed: false }, true)
    }
    if (String(input).includes("skill-installations")) return response(installation)
    if (!rejected) return response(managed, true)
    return Response.json({ error: { code: "skill_forbidden", message: "Denied" }, meta: { request_id: "recheck" } }, { status: 403, headers: { "cache-control": "no-store", "x-request-id": "recheck" } })
  }))
  const view = render(content())
  await openManagement("撤回技能")
  fireEvent.change(await screen.findByLabelText("撤回原因"), { target: { value: "Only this revision" } })
  fireEvent.click(screen.getByRole("button", { name: "确认撤回" }))
  if (outcome === "confirmed") await screen.findByText("已确认撤回")
  else await screen.findByRole("alert")
  rejected = true
  view.rerender(content(false, 2))
  view.rerender(content(true, 2))
  await screen.findByRole("alert")
  fireEvent.click(screen.getByRole("button", { name: "取消" }))
  if (outcome === "unknown") expect(await screen.findByRole("button", { name: "查看技能操作" })).toBeVisible()
  else await waitFor(() => expect(screen.queryByRole("button", { name: "查看技能操作" })).toBeNull())
})


it("opens exact personal history from the installed surface without entering a write form", async()=>{
 window.localStorage.setItem("kokoro.locale","zh")
 const {installation,managed,response,content}=managementFixture()
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input)
  if(url.includes("skill-installations"))return response(installation)
  if(url.endsWith("/versions"))return response({series_id:managed.series_id,publication:{current_version_id:managed.skill_id,state_version:"8",withdrawn_at:null},versions:[{skill_id:managed.skill_id,revision:"3",name:managed.name,summary:"",status:"active",archive_size:"375",file_count:1,created_at:"2026-10-21T00:00:00Z",is_current:true}],next_cursor:null},true)
  if(url.endsWith("/package"))return response({source_ref:managed.source_ref,revision:"3",files:[],selected_file:null})
  return response(managed,true)
 }))
 render(content());await openManagement("技能版本历史")
 expect(await screen.findByText("当前版本")).toBeInTheDocument()
 expect(screen.getByRole("dialog",{name:"技能版本历史"})).toBeInTheDocument()
 expect(screen.queryByLabelText("技能名称")).toBeNull()
})
