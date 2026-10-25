import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import type { ManagedPersonalSkill, PersonalInstallation, SkillCatalogCard } from "@/hub/schemas"
import { LocaleProvider } from "@/i18n/context"
import { createPreviewHubClient } from "@/dev/preview-clients"
import { SkillsContent } from "@/ui/skills/skills-panel"
import { ManusSkillDetailDialog } from "@/ui/skills/manus-skill-detail-dialog"
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state"

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

async function openManagement(operation: "更新技能" | "撤回技能" | "技能版本历史" | "删除") {
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
    if (String(input) === "/api/hub/self/skills/managed/manage-revision/versions") return response({series_id:managed.series_id,publication:{current_version_id:managed.skill_id,state_version:"8",withdrawn_at:null},versions:[],next_cursor:null},true)
    expect(String(input)).toBe("/api/hub/self/skills/managed/manage-revision")
    return response(managed, true)
  })
  vi.stubGlobal("fetch", fetcher)
  render(content())
  await openManagement("更新技能")
  expect(await screen.findByLabelText("技能名称")).toHaveValue("Managed skill")
  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["/api/hub/self/skill-installations/manage-installation", "/api/hub/self/skills/managed/manage-revision", "/api/hub/self/skills/managed/manage-revision/versions"])
  await waitFor(()=>expect(screen.getByTestId("personal-skill-publish-dialog").querySelector("form")).toHaveAttribute("aria-busy","false"))
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

it("keeps a confirmed restore through same-actor re-admission but retires it on an actual Skills actor replacement",async()=>{
 window.localStorage.setItem("kokoro.locale","zh")
 const {File}=await import("node:buffer"),{webcrypto}=await import("node:crypto")
 vi.stubGlobal("File",File);vi.stubGlobal("crypto",webcrypto)
 const {installation,managed,response,content}=managementFixture(),handle="a".repeat(43)
 const old={...managed,skill_id:"old-version",source_ref:"skill:old-version",revision:"1",status:"withdrawn" as const}
 const writes:RequestInit[]=[];let finish!:(value:Response)=>void
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input)
  if(url.endsWith("/skills/old-version/versions")&&init?.method==="POST"){writes.push(init);return new Promise(resolve=>{finish=resolve})}
  if(url.includes("skill-installations"))return response(installation)
  if(url.endsWith("/versions"))return response({series_id:managed.series_id,publication:{current_version_id:managed.skill_id,state_version:"8",withdrawn_at:null},versions:[{skill_id:managed.skill_id,revision:"3",name:managed.name,summary:managed.summary,status:"active",archive_size:"3",file_count:1,created_at:"2026-10-21T01:00:00Z",is_current:true},{skill_id:old.skill_id,revision:"1",name:old.name,summary:old.summary,status:"withdrawn",archive_size:"3",file_count:1,created_at:"2026-10-21T00:00:00Z",is_current:false}],next_cursor:null},true)
  if(url.endsWith("/package"))return response({source_ref:managed.source_ref,revision:"3",files:[],selected_file:null})
  if(url.endsWith("/download"))return response({source_ref:old.source_ref,revision:"1",download_info:{download_url:`/skill-downloads/${handle}`,filename:"original.zip",expires_at:"2999-01-01T00:00:00Z"}})
  if(url.startsWith("/api/skill-downloads/"))return new Response(new Uint8Array([80,0,255]),{headers:{"content-type":"application/zip","content-length":"3","content-disposition":'attachment; filename="original.zip"',"cache-control":"no-store","x-request-id":"original-zip"}})
  return response(url.endsWith("/old-version")?old:managed,true)
 }))
 const view=render(content());await openManagement("技能版本历史")
 fireEvent.click(await screen.findByRole("button",{name:"恢复"}));await screen.findByRole("dialog",{name:"恢复此版本？"})
 fireEvent.click(screen.getByRole("button",{name:"恢复"}));await waitFor(()=>expect(writes).toHaveLength(1))
 view.rerender(content(false,2));expect((writes[0]!.signal as AbortSignal).aborted).toBe(true)
 expect(screen.queryByRole("dialog",{name:"恢复此版本？"})).toBeNull()
 view.rerender(content(true,2));await screen.findByRole("dialog",{name:"恢复此版本？"})
 expect(writes).toHaveLength(1)
 view.rerender(content(true,3,"different-manager"));expect(screen.queryByRole("dialog",{name:"恢复此版本？"})).toBeNull()
 expect(screen.queryByRole("button",{name:"查看技能操作"})).toBeNull()
 finish(Response.json({data:{skill_id:"restored",series_id:managed.series_id,revision:"4",status:"draft",state_version:"1",replayed:false}},{status:201,headers:{"cache-control":"no-store","content-type":"application/json","x-request-id":"late-create"}}))
 await Promise.resolve();await Promise.resolve();expect(writes).toHaveLength(1)
})

it("confirms series deletion, retains its unknown original command across re-admission without GET404 gating, then clears selection on receipt",async()=>{
 window.localStorage.setItem("kokoro.locale","zh")
 const {installation,managed,response,content}=managementFixture()
 const writes:RequestInit[]=[];let managedReads=0,historyReads=0,deleted=false
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="DELETE"){
   writes.push(init);deleted=true
   if(writes.length===1)throw new Error("lost delete ACK")
   return response({series_id:managed.series_id,skill_id:managed.skill_id,state_version:"9",status:"deleted",event_id:`evt:${"a".repeat(64)}`,replayed:true},true)
  }
  if(String(input).includes("skill-installations"))return response(installation)
  if(deleted)throw new Error("Deleted resource reads must not gate receipt replay")
  if(String(input).endsWith("/versions")){historyReads++;return response({series_id:managed.series_id,publication:{current_version_id:"formal-current",state_version:"9007199254740993",withdrawn_at:null},versions:[],next_cursor:null},true)}
  managedReads++;return response(managed,true)
 }))
 const view=render(content());await openManagement("删除")
 await screen.findByText("您稍后可以通过重新上传再次添加此技能。")
 const confirm=screen.getByRole("button",{name:"删除"});await waitFor(()=>expect(confirm).toBeEnabled())
 expect(writes).toHaveLength(0);fireEvent.click(confirm);await screen.findByRole("alert")
 fireEvent.click(screen.getByRole("button",{name:"取消"}))
 view.rerender(content(false,2));view.rerender(content(true,2))
 fireEvent.click(await screen.findByRole("button",{name:"查看技能操作"}))
 fireEvent.click(await screen.findByRole("button",{name:"重试"}))
 await waitFor(()=>expect(screen.queryByRole("dialog",{name:"删除此技能？"})).toBeNull())
 expect(writes).toHaveLength(2);expect(writes[0]?.body).toBe(writes[1]?.body);expect(writes[0]?.headers).toEqual(writes[1]?.headers)
 expect(JSON.parse(String(writes[0]?.body))).toEqual({expected_state_version:"8",expected_publication:{current_version_id:"formal-current",state_version:"9007199254740993"}})
 expect(managedReads).toBe(1);expect(historyReads).toBe(1)
 expect(screen.queryByRole("button",{name:"查看技能操作"})).toBeNull()
})

it("does not render deleted-source private details, history or package actions from a retained installation deep link",async()=>{
 window.localStorage.setItem("kokoro.locale","zh")
 const {installation,response}=managementFixture()
 vi.stubGlobal("fetch",vi.fn(async()=>response({...installation,source_status:"deleted"})))
 render(<LocaleProvider><ManusSkillDetailDialog detailSource="installation" open readBoundary={{admitted:true,subject:"reader",generation:1}}
 skill={{installation_id:installation.installation_id,skill_id:installation.series_id,revision_skill_id:"manage-revision",source_ref:installation.source_ref,installed_source_ref:installation.source_ref,name:"Retained",description:"",content_hash:"series",scope:"personal",installed:true,enabled:false}} onOpenChange={vi.fn()} onAdd={vi.fn()} onTry={()=>false} onManagePersonal={vi.fn()}/></LocaleProvider>)
 await screen.findByText("技能详情暂时不可用")
 expect(screen.queryByText(installation.summary)).toBeNull()
 expect(screen.queryByRole("button",{name:"更多技能操作"})).toBeNull()
 expect(screen.getByRole("button",{name:"查看详情"})).toBeDisabled()
})

function detailRetryFixture(source: "catalog" | "installation") {
  const { installation, response } = managementFixture()
  const skill: SkillCatalogCard = {
    installation_id: installation.installation_id, skill_id: installation.series_id,
    revision_skill_id: "manage-revision", source_ref: installation.source_ref,
    installed_source_ref: installation.source_ref, name: installation.display_name,
    description: "Unconfirmed card summary", content_hash: installation.series_id,
    scope: "personal", installed: true, enabled: false,
  }
  const expectedPath = source === "installation"
    ? "/api/hub/self/skill-installations/manage-installation"
    : "/api/skill.v1.SkillOptionalService/GetSkill"
  const detailResponse = (summary: string) => source === "installation"
    ? response({ ...installation, summary })
    : Response.json({
      skill: { id: skill.skill_id, version: skill.revision_skill_id, displayName: skill.name, description: summary },
      downloadInfo: { downloadUrl: "/api/skill-downloads/detail-retry", filename: "fixture.zip", expiresAt: "2999-01-01T00:00:00Z" },
    })
  const onAdd = vi.fn(), onTry = vi.fn(() => false)
  const content = (boundary: ProjectReadBoundary = { admitted: true, subject: "reader", generation: 1 }, open = true) =>
    <LocaleProvider><ManusSkillDetailDialog detailSource={source} open={open} readBoundary={boundary}
      skill={skill} onOpenChange={vi.fn()} onAdd={onAdd} onTry={onTry} /></LocaleProvider>
  return { expectedPath, detailResponse, content, onAdd, onTry }
}

it.each(["catalog", "installation"] as const)("recovers a failed %s metadata read in the open detail by explicitly retrying the exact locator", async source => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { expectedPath, detailResponse, content, onAdd, onTry } = detailRetryFixture(source)
  let resolveRetry!: (response: Response) => void
  const retryRead = new Promise<Response>(resolve => { resolveRetry = resolve })
  const requests: { path: string; method: string; body: BodyInit | null | undefined }[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ path: String(input), method: init?.method ?? "GET", body: init?.body })
    if (requests.length === 1) throw new Error("temporary read failure")
    return retryRead
  }))
  render(content())
  await screen.findByText("技能详情暂时不可用")
  expect(requests).toHaveLength(1)
  expect(screen.getByRole("button", { name: "查看详情" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  await screen.findByText("正在加载技能详情…")
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull()
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1]).toEqual(requests[0])
  expect(requests[0]?.path).toBe(expectedPath)
  if (source === "catalog") expect(JSON.parse(String(requests[0]?.body))).toEqual({ skillId: "manage-series" })
  await act(async () => { resolveRetry(detailResponse("Recovered exact detail")) })
  expect(await screen.findByText("Recovered exact detail")).toBeVisible()
  expect(screen.queryByText("技能详情暂时不可用")).toBeNull()
  expect(screen.getByRole("button", { name: "查看详情" })).toBeEnabled()
  expect(onAdd).not.toHaveBeenCalled()
  expect(onTry).not.toHaveBeenCalled()
})

it.each([
  ["catalog", "close"], ["installation", "close"],
  ["catalog", "admission"], ["installation", "admission"],
  ["catalog", "actor"], ["installation", "actor"],
] as const)("retires a pending %s metadata retry on %s without restoring its late facts", async (source, retirement) => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { expectedPath, detailResponse, content } = detailRetryFixture(source)
  let resolveRetry!: (response: Response) => void
  const retryRead = new Promise<Response>(resolve => { resolveRetry = resolve })
  const signals: AbortSignal[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(expectedPath)
    signals.push(init?.signal as AbortSignal)
    if (signals.length === 1) throw new Error("temporary read failure")
    if (signals.length === 2) return retryRead
    return detailResponse("Replacement actor detail")
  }))
  const view = render(content())
  await screen.findByText("技能详情暂时不可用")
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  await waitFor(() => expect(signals).toHaveLength(2))
  view.rerender(content({
    admitted: retirement !== "admission", subject: retirement === "actor" ? "replacement-reader" : "reader", generation: retirement === "admission" ? 2 : 1,
  }, retirement !== "close"))
  await waitFor(() => expect(signals[1]?.aborted).toBe(true))
  await act(async () => { resolveRetry(detailResponse("Retired private detail")) })
  expect(screen.queryByText("Retired private detail")).toBeNull()
  if (retirement === "actor") expect(await screen.findByText("Replacement actor detail")).toBeVisible()
  else expect(signals).toHaveLength(2)
})

it.each(["catalog", "installation"] as const)("recovers %s metadata recheck failure while keeping the selected package reader location", async source => {
  window.localStorage.setItem("kokoro.locale", "zh")
  const { expectedPath, detailResponse, content } = detailRetryFixture(source)
  const packagePath = source === "installation"
    ? "/api/hub/skill-installations/manage-installation/package"
    : "/api/hub/skills/manage-revision/package"
  const files = [
    { path: "SKILL.md", size_bytes: "13" },
    { path: "notes.md", size_bytes: "13" },
  ]
  let metadataReads = 0
  const packageReads: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === expectedPath) {
      metadataReads += 1
      if (metadataReads === 2) throw new Error("re-admission metadata unavailable")
      return detailResponse("Current exact detail")
    }
    expect(path.startsWith(packagePath)).toBe(true)
    packageReads.push(path)
    const selectedPath = new URL(path, "http://localhost").searchParams.get("file_path")
    return Response.json({ data: {
      source_ref: "skill:manage-revision", revision: "3", files,
      selected_file: selectedPath === null ? null : { path: selectedPath, text: selectedPath === "notes.md" ? "# Notes exact" : "# Skill exact" },
    } }, { headers: { "cache-control": "no-store", "x-request-id": "reader-retry" } })
  }))
  const view = render(content())
  await screen.findByText("Current exact detail")
  fireEvent.click(screen.getByRole("button", { name: "查看详情" }))
  await screen.findByRole("heading", { name: "Skill exact" })
  fireEvent.click(screen.getByRole("button", { name: "notes.md" }))
  const note = await screen.findByRole("heading", { name: "Notes exact" })
  fireEvent.scroll(note.closest("[aria-busy]")!, { target: { scrollTop: 180 } })
  const previousPackageReads = packageReads.length
  view.rerender(content({ admitted: false, subject: "reader", generation: 2 }))
  expect(screen.queryByRole("heading", { name: "Notes exact" })).toBeNull()
  view.rerender(content({ admitted: true, subject: "reader", generation: 2 }))
  await waitFor(() => expect(metadataReads).toBe(2))
  expect(await screen.findByText("技能详情暂时不可用")).toBeVisible()
  expect(screen.queryByRole("status", { name: "正在读取技能文件…" })).toBeNull()
  expect(packageReads).toHaveLength(previousPackageReads)
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  const restoredNote = await screen.findByRole("heading", { name: "Notes exact" })
  expect(restoredNote.closest("[aria-busy]")).toHaveProperty("scrollTop", 180)
  expect(screen.getByRole("button", { name: "notes.md" })).toHaveAttribute("aria-pressed", "true")
  expect(metadataReads).toBe(3)
  expect(packageReads.slice(previousPackageReads)).toEqual([packagePath, `${packagePath}?file_path=notes.md`])
})
