import { expect, it, vi } from "vitest"
import { HubClientError } from "@/hub/client"
import { createPersonalSkillGithubImportFlow } from "@/ui/skills/personal-skill-github-import-flow"
const url = "https://github.com/acme/skills", commit = "a".repeat(40), digest = "b".repeat(64)
const draft = { skill_id:"revision", source_ref:"skill:revision", status:"draft", state_version:"4", valid:true, content_digest:digest, manifest_identity:`skill-md-v1:sha256:${digest}` }
const record = { skill_id:"revision", source_ref:"skill:revision", series_id:"series", revision:"1", status:"draft" as const, name:"Actual", summary:"Owner", tags:[], example_prompts:[], category_keys:[], skill_updated_at:"2026-10-10T00:00:00Z", product:{state_version:"4",publication_audience:"owner" as const,source_kind:"personal" as const} }
const published = { source_ref:"skill:revision",status:"active" as const,revision:"1",state_version:"5",event_id:"e90c2e48-7c3e-4d61-a00a-d25b9807ce59",replayed:false }
const receipt = { installation: { installation_id:"installation",source_ref:"skill:revision",series_id:"series",revision:"1",installed:true,enabled:true,installed_at:"2026-10-10T00:00:00Z",updated_at:"2026-10-10T00:00:00Z",display_name:"Actual",summary:"Owner",source_status:"active" as const,skill_updated_at:"2026-10-10T00:00:00Z",example_prompts:[],category_keys:[],tags:[],product:record.product },change:"installed" as const,event_id:"event",replayed:false }
function setup() {
 const deps = { subject:"A",key:vi.fn().mockReturnValueOnce("import-key").mockReturnValueOnce("publish-key").mockReturnValueOnce("install-key"),github:{preview:vi.fn().mockResolvedValue({selection_required:true,repository_url:url,commit,paths:["one","two"]}),import:vi.fn().mockResolvedValue(draft)},publish:{getManaged:vi.fn().mockResolvedValue(record),publishDraft:vi.fn().mockResolvedValue(published)},installation:{install:vi.fn().mockResolvedValue(receipt)} }
 const flow=createPersonalSkillGithubImportFlow(deps);flow.setAdmitted(true);return {flow,deps}
}
it("selects a real path using the original Preview commit without another floating read", async()=>{
 const {flow,deps}=setup();await flow.preview(url);expect(flow.getSnapshot().kind).toBe("select");flow.select("invented");expect(flow.getSnapshot().kind).toBe("select");flow.select("two");await flow.confirm()
 expect(deps.github.preview).toHaveBeenCalledTimes(1);expect(deps.github.import).toHaveBeenCalledWith({owner:"acme",repository:"skills",commit,path:"two"},"import-key",expect.any(AbortSignal))
 expect(deps.publish.publishDraft).toHaveBeenCalledWith("revision",{audience:"owner",expected_state_version:"4"},"publish-key",expect.any(AbortSignal));expect(deps.installation.install).toHaveBeenCalledWith("skill:revision","install-key",expect.any(AbortSignal));expect(flow.getSnapshot().kind).toBe("completed")
})
it.each(["import","publish","install"] as const)("keeps original body/key for an unknown %s ACK",async stage=>{
 const {flow,deps}=setup();const fn=stage==="import"?deps.github.import:stage==="publish"?deps.publish.publishDraft:deps.installation.install
 fn.mockRejectedValueOnce(new HubClientError("network","unknown",null,null));await flow.preview(url);flow.select("one");await flow.confirm();expect(flow.getSnapshot()).toMatchObject({kind:"unknown",stage});expect(flow.getSnapshot().result).toBeUndefined();await flow.retry();expect(flow.getSnapshot().kind).toBe("completed");expect(fn.mock.calls[0]?.slice(0,-1)).toEqual(fn.mock.calls[1]?.slice(0,-1));expect(deps.github.preview).toHaveBeenCalledTimes(1)
})
it("does not treat the 201 draft as installed while Publish is unresolved",async()=>{
 const {flow,deps}=setup();let resolve!: (value:typeof published)=>void;deps.publish.publishDraft.mockImplementationOnce(()=>new Promise(accept=>{resolve=accept}));await flow.preview(url);flow.select("one");const work=flow.confirm();await vi.waitFor(()=>expect(deps.publish.publishDraft).toHaveBeenCalled());expect(flow.getSnapshot().kind).toBe("running");expect(deps.installation.install).not.toHaveBeenCalled();resolve(published);await work
})
it("cancels on loss of admitted identity and ignores late installation ACK",async()=>{
 const {flow,deps}=setup();let resolve!: (value:typeof receipt)=>void;deps.installation.install.mockImplementationOnce(()=>new Promise(accept=>{resolve=accept}));await flow.preview(url);flow.select("one");const work=flow.confirm();await vi.waitFor(()=>expect(deps.installation.install).toHaveBeenCalled());flow.setAdmitted(false);resolve(receipt);await work;expect(flow.getSnapshot().kind).toBe("unknown");expect(flow.getSnapshot().result).toBeUndefined();await flow.retry();expect(deps.installation.install).toHaveBeenCalledTimes(1)
})
it("retiring or refreshing does not recreate a lost command or claim installed",async()=>{
 const {flow,deps}=setup();await flow.preview(url);flow.select("one");flow.retire();expect(flow.getSnapshot().kind).toBe("idle");await flow.retry();expect(deps.github.import).not.toHaveBeenCalled();const next=createPersonalSkillGithubImportFlow({...deps,subject:"B"});expect(next.getSnapshot().kind).toBe("idle")
})
it("rejects a wrong real installation identity without a success state",async()=>{
 const {flow,deps}=setup();deps.installation.install.mockResolvedValueOnce({...receipt,installation:{...receipt.installation,source_ref:"skill:other"}});await flow.preview(url);flow.select("one");await flow.confirm();expect(flow.getSnapshot()).toMatchObject({kind:"unknown",stage:"install"});expect(flow.getSnapshot().result).toBeUndefined()
})
it("preserves the Import CAS across an authoritative metadata read",async()=>{
 const {flow,deps}=setup();deps.publish.getManaged.mockResolvedValueOnce({...record,product:{...record.product,state_version:"999"}});await flow.preview(url);flow.select("one");await flow.confirm();expect(deps.publish.publishDraft.mock.calls[0]?.[1]).toEqual({audience:"owner",expected_state_version:"4"})
})

it("only clears a completed intent and permits a second import with fresh command keys",async()=>{
 const {flow,deps}=setup();await flow.preview(url);flow.select("one");deps.github.import.mockRejectedValueOnce(new HubClientError("network","lost",null,null));await flow.confirm();flow.finishCompleted();expect(flow.getSnapshot().kind).toBe("unknown");await flow.retry();expect(flow.getSnapshot().kind).toBe("completed");flow.finishCompleted();expect(flow.getSnapshot().kind).toBe("idle");deps.key.mockReturnValue("fresh-key");await flow.preview(url);flow.select("two");await flow.confirm();expect(flow.getSnapshot().kind).toBe("completed");expect(deps.github.import.mock.calls.at(-1)?.[1]).toBe("fresh-key");expect(deps.github.import.mock.calls.at(-1)?.[0].path).toBe("two")
})
