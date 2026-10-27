import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/i18n/context"
import { PersonalSkillsRead } from "@/ui/skills/personal-skills-read"
import { HubClientError, type HubClient } from "@/hub/client"
import { createSkillPublishClient, type SkillPublishClient } from "@/hub/skill-publish-client"
import { PersonalSkillPublishDialog } from "@/ui/skills/personal-skill-publish-dialog"

vi.mock("@/ui/auth/use-session-state", () => ({
  // Ordinary upload consumes an already verified session boundary. Session refresh
  // transport is covered by its own suite, not this business fetch dispatcher.
  useSessionProbe: () => ({ state: "pass", projectReadBoundary: { admitted: true, subject: "fixture-user", generation: 1 } }),
}))

const publicationPage = {series_id:"series",publication:{current_version_id:"old",state_version:"1",withdrawn_at:null},versions:[],next_cursor:null}

beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem("kokoro.locale", "zh") })
afterEach(cleanup)

it("keeps one pending scan attempt and its original ZIP across close/reopen, then resumes without a second Draft", async () => {
  const sha = "a".repeat(64)
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", state_version: "1", replayed: false }),
    getUpload: vi.fn().mockResolvedValueOnce({ skill_id: "mine", attempt_epoch: "0", phase: "none", state_version: "1" }).mockResolvedValue({ skill_id: "mine", attempt_epoch: "1", phase: "uploaded", state_version: "3", source_version_id: "object-version-1", attempt_id: "attempt", upload_id: "upload" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false, state_version: "2" }),
    putPackage: vi.fn().mockResolvedValue({ source_version_id: "object-version-1" }),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, state_version: "3", content_sha256: sha, scan_state: "pending" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, state_version: "4", content_digest: sha, manifest_identity: `skill-md-v1:sha256:${sha}`, replayed: false }),
    publishDraft: vi.fn().mockResolvedValue({ source_ref: "skill:mine", revision: "1", status: "active", state_version: "5", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: false }),
    getPublished: vi.fn(),
  }
  const onPublished = vi.fn()
  const onManagePublished = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(true)
    return <LocaleProvider><button type="button" onClick={() => setOpen(true)}>重新打开</button><PersonalSkillPublishDialog open={open} onOpenChange={setOpen} client={client as unknown as SkillPublishClient} onPublished={onPublished} onManagePublished={onManagePublished} hash={async () => sha} /></LocaleProvider>
  }
  render(<Harness />)
  const dialog = await screen.findByTestId("personal-skill-publish-dialog")
  fireEvent.change(within(dialog).getByLabelText(/ZIP 文件/), { target: { files: [new File(["zip"], "mine.zip", { type: "application/zip" })] } })
  fireEvent.change(within(dialog).getByLabelText("技能名称"), { target: { value: "Mine" } })
  fireEvent.change(within(dialog).getByLabelText("可见范围"), { target: { value: "owner" } })
  fireEvent.submit(dialog.querySelector("form")!)
  expect(await within(dialog).findByText(/上传正在扫描中/)).toBeInTheDocument()
  expect(onPublished).not.toHaveBeenCalled()
  expect(within(dialog).queryByRole("button", { name: "更多技能操作" })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getAllByRole("button", { name: "关闭" }).at(-1)!)
  fireEvent.click(screen.getByRole("button", { name: "重新打开" }))
  const reopened = await screen.findByTestId("personal-skill-publish-dialog")
  expect(within(reopened).getByText("mine.zip")).toBeInTheDocument()
  fireEvent.submit(reopened.querySelector("form")!)
  await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1))
  // Only the confirmed new publication, not its original installation, is a management target.
  fireEvent.keyDown(within(reopened).getByRole("button", { name: "更多技能操作" }), { key: "ArrowDown" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "撤回技能" }))
  expect(onManagePublished).toHaveBeenCalledExactlyOnceWith("withdraw", { source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.beginUpload).toHaveBeenCalledTimes(1)
  expect(client.completeUpload).toHaveBeenCalledTimes(1)
  expect(client.publishDraft).toHaveBeenCalledTimes(1)
})

it.each([
  [" a.zip", "", /ZIP 文件名不符合要求/],
  ["mine.zip", "S".repeat(65535), /请求总量超过 65,536 字节/],
] as const)("shows an editable local preflight error for %s without creating a Draft", (filename, summary, message) => {
  const createDraft = vi.fn()
  render(<LocaleProvider><PersonalSkillPublishDialog open onOpenChange={vi.fn()} client={{ createDraft } as unknown as SkillPublishClient} onPublished={vi.fn()} /></LocaleProvider>)
  const dialog = screen.getByTestId("personal-skill-publish-dialog")
  fireEvent.change(within(dialog).getByLabelText(/ZIP 文件/), { target: { files: [new File(["zip"], filename, { type: "application/zip" })] } })
  fireEvent.change(within(dialog).getByLabelText("技能名称"), { target: { value: "Mine" } })
  fireEvent.change(within(dialog).getByLabelText("简介"), { target: { value: summary } })
  fireEvent.change(within(dialog).getByLabelText("可见范围"), { target: { value: "owner" } })
  fireEvent.submit(dialog.querySelector("form")!)
  expect(within(dialog).getByRole("alert")).toHaveTextContent(message)
  expect(within(dialog).getByLabelText(/ZIP 文件/)).not.toBeDisabled()
  expect(createDraft).not.toHaveBeenCalled()
})

it("requires explicit visibility for a refreshed validated draft and never fabricates a validation receipt", async () => {
  const base = { skill_id: "mine", source_ref: "skill:mine", series_id: "series", revision: "1", name: "Mine", summary: "", tags: [], status: "draft" as const, skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner" as const, state_version: "4" } }
  const client = { listHistory: vi.fn().mockResolvedValue({...publicationPage,publication:null}), getManaged: vi.fn().mockResolvedValue(base), getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", state_version: "4", attempt_epoch: "1", attempt_id: "attempt", upload_id: "upload", phase: "validated", source_version_id: "object-version-1" }), validateDraft: vi.fn(), createDraft: vi.fn(), putPackage: vi.fn(), publishDraft: vi.fn().mockResolvedValue({ source_ref: "skill:mine", revision: "1", status: "active", state_version: "5", replayed: false, event_id: "550e8400-e29b-41d4-a716-446655440000" }) }
  const onPublished = vi.fn()
  render(<LocaleProvider><PersonalSkillPublishDialog base={base} open onOpenChange={vi.fn()} client={client as unknown as SkillPublishClient} onPublished={onPublished} /></LocaleProvider>)
  const dialog = screen.getByTestId("personal-skill-publish-dialog")
  expect(within(dialog).getByLabelText("可见范围")).toHaveValue("")
  expect(within(dialog).getByRole("option", { name: "技能目录" })).toHaveValue("catalog")
  fireEvent.submit(dialog.querySelector("form")!)
  expect(client.getManaged).not.toHaveBeenCalled()
  fireEvent.change(within(dialog).getByLabelText("可见范围"), { target: { value: "tenant" } })
  await waitFor(()=>expect(within(dialog).getByRole("button", {name:"上传并发布"})).not.toBeDisabled())
  fireEvent.submit(dialog.querySelector("form")!)
  await waitFor(() => expect(onPublished).toHaveBeenCalledOnce())
  expect(client.publishDraft).toHaveBeenCalledWith("mine", { expected_state_version: "4", audience: "tenant", expected_publication: null }, expect.any(String), expect.any(AbortSignal))
  expect(client.validateDraft).not.toHaveBeenCalled(); expect(client.createDraft).not.toHaveBeenCalled(); expect(client.putPackage).not.toHaveBeenCalled()
  expect(within(dialog).getByLabelText("可见范围")).toBeDisabled()
})


it("does not reuse a draft-bound pagination cursor for the published managed view", async () => {
  const listPersonalSkills = vi.fn().mockResolvedValue({ skills: [], next_cursor: null })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { skills: [], next_cursor: "draft-cursor" }, meta: { request_id: "draft-read" } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "draft-read" } })).mockResolvedValueOnce(new Response(JSON.stringify({ data: { skills: [], next_cursor: null }, meta: { request_id: "draft-read" } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "draft-read" } })))
  render(<LocaleProvider><PersonalSkillsRead client={{ listPersonalSkills } as unknown as HubClient} /></LocaleProvider>)
  await waitFor(() => expect(listPersonalSkills).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole("button", { name: "草稿" }))
  const drafts = await screen.findByTestId("personal-skill-drafts")
  await waitFor(() => expect(within(drafts).getByRole("button", { name: "下一页" })).not.toBeDisabled())
  fireEvent.click(within(drafts).getByRole("button", { name: "下一页" }))
  await waitFor(() => expect(within(drafts).getByRole("button", { name: "下一页" })).toBeDisabled())
  fireEvent.click(screen.getByRole("button", { name: "本人已发布" }))
  await waitFor(() => expect(listPersonalSkills).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal)))
  vi.unstubAllGlobals()
})

it("owned active update requires a new package, permits clearing real examples, and offers owner visibility only",async()=>{
 const base={skill_id:"old",source_ref:"skill:old",series_id:"series",revision:"1",name:"Original",summary:"Summary",tags:[],status:"active" as const,skill_updated_at:"2026-10-10T00:00:00Z",example_prompts:["真实旧例子"],category_keys:[],product:{source_kind:"personal" as const,publication_audience:"owner" as const,state_version:"99"}}
 const createVersion=vi.fn().mockRejectedValueOnce(new Error("unknown receipt")).mockRejectedValue(new HubClientError("http", "Retry rejected", "skill_precondition_failed", 412))
 const client={listHistory:vi.fn().mockResolvedValue(publicationPage),createVersion} as unknown as SkillPublishClient
 render(<LocaleProvider><PersonalSkillPublishDialog base={base} open admitted client={client} onOpenChange={vi.fn()} onPublished={vi.fn()} hash={async()=>"a".repeat(64)}/></LocaleProvider>)
 const dialog=screen.getByTestId("personal-skill-publish-dialog")
 expect(within(dialog).getByLabelText("可见范围")).toHaveValue("owner")
 expect(within(dialog).queryByRole("option",{name:"技能目录"})).not.toBeInTheDocument()
 expect(within(dialog).getByLabelText("示例问题（每行一项）")).toHaveValue("真实旧例子")
 fireEvent.submit(dialog.querySelector("form")!)
 expect(createVersion).not.toHaveBeenCalled()
 fireEvent.change(within(dialog).getByLabelText(/重新选择并上传/),{target:{files:[new File(["new zip"],"update.zip",{type:"application/zip"})]}})
 fireEvent.change(within(dialog).getByLabelText("示例问题（每行一项）"),{target:{value:""}})
 await waitFor(()=>expect(within(dialog).getByRole("button",{name:"更新技能"})).not.toBeDisabled())
 fireEvent.submit(dialog.querySelector("form")!)
 await within(dialog).findByRole("alert")
 expect(createVersion).toHaveBeenCalledWith("old",{display_name:"Original",summary:"Summary",tags:[],example_prompts:[],category_keys:[]},expect.any(String),expect.any(AbortSignal))
 fireEvent.submit(dialog.querySelector("form")!)
 await waitFor(()=>expect(createVersion).toHaveBeenCalledTimes(2))
 await within(dialog).findByRole("alert")
 expect(within(dialog).queryByRole("button", {name:"重新开始新尝试"})).toBeNull()
 fireEvent.submit(dialog.querySelector("form")!)
 await waitFor(()=>expect(createVersion).toHaveBeenCalledTimes(3))
 expect(createVersion.mock.calls[0]?.slice(0,3)).toEqual(createVersion.mock.calls[1]?.slice(0,3))
 expect(createVersion.mock.calls[0]?.slice(0,3)).toEqual(createVersion.mock.calls[2]?.slice(0,3))
})

it("can restart after a definitive creation conflict without a previous unknown creation", async () => {
 const base={skill_id:"old",source_ref:"skill:old",series_id:"series",revision:"1",name:"Original",summary:"",tags:[],status:"active" as const,skill_updated_at:"2026-10-10T00:00:00Z",example_prompts:[],category_keys:[],product:{source_kind:"personal" as const,publication_audience:"owner" as const,state_version:"9"}}
 const createVersion=vi.fn().mockRejectedValue(new HubClientError("http", "Conflict", "skill_precondition_failed", 412))
 render(<LocaleProvider><PersonalSkillPublishDialog base={base} open admitted client={{listHistory:vi.fn().mockResolvedValue(publicationPage),createVersion} as unknown as SkillPublishClient} onOpenChange={vi.fn()} onPublished={vi.fn()} hash={async()=>"a".repeat(64)}/></LocaleProvider>)
 const dialog=screen.getByTestId("personal-skill-publish-dialog")
 fireEvent.change(within(dialog).getByLabelText(/重新选择并上传/),{target:{files:[new File(["zip"],"update.zip",{type:"application/zip"})]}})
 await waitFor(()=>expect(within(dialog).getByRole("button", {name:"更新技能"})).not.toBeDisabled())
 fireEvent.submit(dialog.querySelector("form")!)
 fireEvent.click(await within(dialog).findByRole("button", {name:"重新开始新尝试"}))
 expect(within(dialog).getByLabelText(/重新选择并上传/)).not.toBeDisabled()
})


it("waits for the confirmed series publication before an update can create a new version", async () => {
 const base={skill_id:"old",source_ref:"skill:old",series_id:"series",revision:"1",name:"Original",summary:"",tags:[],status:"active" as const,skill_updated_at:"2026-10-10T00:00:00Z",example_prompts:[],category_keys:[],product:{source_kind:"personal" as const,publication_audience:"owner" as const,state_version:"9"}}
 let resolve!: (value: unknown) => void
 const listHistory=vi.fn(()=>new Promise(done=>{resolve=done}))
 const createVersion=vi.fn().mockRejectedValue(new HubClientError("http","Conflict","skill_precondition_failed",412))
 render(<LocaleProvider><PersonalSkillPublishDialog base={base} open client={{listHistory,createVersion} as unknown as SkillPublishClient} onOpenChange={vi.fn()} onPublished={vi.fn()} hash={async()=>"a".repeat(64)}/></LocaleProvider>)
 const dialog=screen.getByTestId("personal-skill-publish-dialog")
 fireEvent.change(within(dialog).getByLabelText(/重新选择并上传/),{target:{files:[new File(["zip"],"update.zip",{type:"application/zip"})]}})
 fireEvent.submit(dialog.querySelector("form")!)
 await new Promise(done=>setTimeout(done,0))
 expect(createVersion).not.toHaveBeenCalled()
 expect(listHistory).toHaveBeenCalledExactlyOnceWith("old",undefined,expect.any(AbortSignal))
 expect(dialog.querySelector("form")).toHaveAttribute("aria-busy","true")
 resolve({series_id:"series",publication:{current_version_id:"different-current",state_version:"9007199254740993",withdrawn_at:"2026-10-21T00:00:00Z"},versions:[],next_cursor:null})
 await waitFor(()=>expect(within(dialog).getByRole("button",{name:"更新技能"})).not.toBeDisabled())
 expect(dialog.querySelector("form")).toHaveAttribute("aria-busy","false")
 fireEvent.submit(dialog.querySelector("form")!)
 await waitFor(()=>expect(createVersion).toHaveBeenCalledTimes(1))
 expect(listHistory).toHaveBeenCalledTimes(1)
})


it("does not interpret an unavailable history read as first publication; an explicit retry rechecks the series",async()=>{
 const base={skill_id:"mine",source_ref:"skill:mine",series_id:"series",revision:"1",name:"Mine",summary:"",tags:[],status:"draft" as const,skill_updated_at:"2026-10-10T00:00:00Z",example_prompts:[],category_keys:[],product:{publication_audience:"owner" as const,state_version:"4"}}
 const listHistory=vi.fn().mockRejectedValueOnce(new HubClientError("http","missing","skill_not_found",404)).mockResolvedValue({...publicationPage,series_id:"wrong-series"})
 const publishDraft=vi.fn(),getManaged=vi.fn()
 render(<LocaleProvider><PersonalSkillPublishDialog base={base} open client={{listHistory,publishDraft,getManaged} as unknown as SkillPublishClient} onOpenChange={vi.fn()} onPublished={vi.fn()}/></LocaleProvider>)
 const dialog=screen.getByTestId("personal-skill-publish-dialog")
 fireEvent.change(within(dialog).getByLabelText("可见范围"),{target:{value:"owner"}})
 await within(dialog).findByRole("alert")
 expect(within(dialog).getByRole("button",{name:"上传并发布"})).toBeDisabled()
 fireEvent.submit(dialog.querySelector("form")!)
 expect(getManaged).not.toHaveBeenCalled();expect(publishDraft).not.toHaveBeenCalled()
 fireEvent.click(within(dialog).getByRole("button",{name:"重试同一次尝试"}))
 await waitFor(()=>expect(listHistory).toHaveBeenCalledTimes(2))
 expect(await within(dialog).findByRole("alert")).toBeInTheDocument()
 expect(within(dialog).getByRole("button",{name:"上传并发布"})).toBeDisabled()
 expect(getManaged).not.toHaveBeenCalled();expect(publishDraft).not.toHaveBeenCalled()
})

it("does not announce an in-flight publication read when current admission denies it",()=>{
 const base={skill_id:"old",source_ref:"skill:old",series_id:"series",revision:"1",name:"Original",summary:"",tags:[],status:"active" as const,skill_updated_at:"2026-10-10T00:00:00Z",example_prompts:[],category_keys:[],product:{source_kind:"personal" as const,publication_audience:"owner" as const,state_version:"9"}}
 const listHistory=vi.fn(),createVersion=vi.fn()
 render(<LocaleProvider><PersonalSkillPublishDialog base={base} open admitted={false} client={{listHistory,createVersion} as unknown as SkillPublishClient} onOpenChange={vi.fn()} onPublished={vi.fn()}/></LocaleProvider>)
 expect(screen.getByTestId("personal-skill-publish-dialog").querySelector("form")).toHaveAttribute("aria-busy","false")
 expect(listHistory).not.toHaveBeenCalled();expect(createVersion).not.toHaveBeenCalled()
})


it.each([
  { locale: "zh", description: "选择单个 ZIP 包。" },
  { locale: "en", description: "Choose one ZIP package." },
  { locale: "ja", description: "Choose one ZIP package." },
])("$locale publish guidance exposes only the file instruction, not internal receipt/state or an early success promise", ({ locale, description }) => {
  window.localStorage.setItem("kokoro.locale", locale)
  const client = createSkillPublishClient(), createDraft = vi.spyOn(client, "createDraft"), publish = vi.spyOn(client, "publishDraft"), onPublished = vi.fn()
  render(<LocaleProvider><PersonalSkillPublishDialog open client={client} onOpenChange={vi.fn()} onPublished={onPublished} /></LocaleProvider>)
  const dialog = screen.getByTestId("personal-skill-publish-dialog")
  expect(dialog).not.toHaveAccessibleDescription(/ACTIVE|回执|receipt/iu)
  expect(dialog).toHaveAccessibleDescription(description)
  expect(createDraft).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled(); expect(onPublished).not.toHaveBeenCalled()
})
