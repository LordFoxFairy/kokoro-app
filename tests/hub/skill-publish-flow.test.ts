import { expect, it, vi } from "vitest"

import { createPersonalSkillVersionSession, runPersonalSkillPublishSession, publishPersonalSkill } from "@/ui/skills/personal-skill-publish-flow"
import type { SkillPublishClient } from "@/hub/skill-publish-client"
import { HubClientError } from "@/hub/client"

it("requires an ACTIVE receipt after the single-ZIP owner command chain", async () => {
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", state_version: "1", replayed: false }),
    getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "0", phase: "none", state_version: "1" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/upload", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false, state_version: "2" }),
    putPackage: vi.fn().mockResolvedValue({ source_version_id: "object-version-1" }),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, state_version: "3", content_sha256: "a".repeat(64), scan_state: "clean" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, state_version: "4", content_digest: "a".repeat(64), manifest_identity: `skill-md-v1:sha256:${"a".repeat(64)}`, replayed: false }),
    publishDraft: vi.fn().mockRejectedValueOnce(new HubClientError("network", "lost ACK", null, null)).mockResolvedValueOnce({ source_ref: "skill:mine", revision: "1", status: "active", state_version: "5", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: true }),
    getPublished: vi.fn(),
  }
  const file = new File(["zip"], "mine.zip", { type: "application/zip" })
  const signal = new AbortController().signal
  const result = await publishPersonalSkill(client as unknown as SkillPublishClient, { file, display_name: "Mine", summary: "Summary", tags: [], audience: "owner" as const }, {
    signal, hash: async () => "a".repeat(64),
  })
  expect(result).toEqual({ source_ref: "skill:mine", revision: "1" })
  expect(client.createDraft).toHaveBeenCalledTimes(1)
  expect(client.getUpload).toHaveBeenCalledWith("mine", expect.any(AbortSignal))
  expect(client.beginUpload).toHaveBeenCalledWith("mine", expect.objectContaining({ expected_state_version: "1" }), expect.any(String), signal)
  expect(client.completeUpload).toHaveBeenCalledWith("mine", expect.objectContaining({ expected_state_version: "2", source_version_id: "object-version-1" }), expect.any(String), signal)
  expect(client.validateDraft).toHaveBeenCalledWith("mine", { attempt_id: "attempt", expected_state_version: "3" }, expect.any(String), signal)
  expect(client.publishDraft).toHaveBeenCalledWith("mine", { audience: "owner", expected_state_version: "4", expected_publication: null }, expect.any(String), signal)
  expect(client.putPackage).toHaveBeenCalledTimes(1)
  expect(client.publishDraft).toHaveBeenCalledTimes(2)
  expect(client.publishDraft.mock.calls[0]).toEqual(client.publishDraft.mock.calls[1])
})

it("does not publish when the authoritative upload state already has an old attempt", async () => {
  const client = { createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", state_version: "1", replayed: false }), getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "1", phase: "uploaded", state_version: "3", source_version_id: "object-version-1", attempt_id: "old", upload_id: "old-upload" }), beginUpload: vi.fn() }
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, { file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [], audience: "owner" as const }, { hash: async () => "a".repeat(64) })).rejects.toMatchObject({ reason: "parse" })
  expect(client.beginUpload).not.toHaveBeenCalled()
})

it("never treats a lost Publish ACK or validation as success without ACTIVE by-ID recovery", async () => {
  const client = {
    createDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: 1, status: "draft", state_version: "1", replayed: false }),
    getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "0", phase: "none", state_version: "1" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/put", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false, state_version: "2" }),
    putPackage: vi.fn().mockResolvedValue({ source_version_id: "object-version-1" }),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, state_version: "3", content_sha256: "a".repeat(64), scan_state: "clean" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, state_version: "4", content_digest: "a".repeat(64), manifest_identity: `skill-md-v1:sha256:${"a".repeat(64)}`, replayed: false }),
    publishDraft: vi.fn().mockRejectedValue(new Error("lost ACK")),
    getPublished: vi.fn().mockRejectedValue(new HubClientError("http", "not found", "skill_not_found", 404)),
  }
  const input = { file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [], audience: "owner" as const }
  const options = { hash: async () => "a".repeat(64) }
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, input, options)).rejects.toMatchObject({ name: "SkillPublishUncertain", skillId: "mine" })
  expect(client.getPublished).toHaveBeenCalledWith("mine", undefined)
  client.getPublished.mockResolvedValueOnce({ skill_id: "mine", source_ref: "skill:mine", revision: "1", status: "active", name: "Mine", summary: "", tags: [], series_id: "series", skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: [], category_keys: [], product: { publication_audience: "owner", state_version: "5" } })
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, input, options)).resolves.toEqual({ source_ref: "skill:mine", revision: "1" })
})

it("does not start a draft after cancellation or reuse any persisted upload reference", async () => {
  const client = { createDraft: vi.fn() }
  const controller = new AbortController()
  controller.abort()
  await expect(publishPersonalSkill(client as unknown as SkillPublishClient, { file: new File(["zip"], "mine.zip"), display_name: "Mine", summary: "", tags: [], audience: "owner" as const }, { signal: controller.signal, hash: async () => "a".repeat(64) })).rejects.toMatchObject({ reason: "aborted" })
  expect(client.createDraft).not.toHaveBeenCalled()
})

const lifecyclePublication = { current_version_id: "old", state_version: "1" }
const lifecycleBase = { skill_id: "old", source_ref: "skill:old", series_id: "series", revision: "1", name: "Original", summary: "Original summary", tags: [], status: "active" as const, skill_updated_at: "2026-10-10T00:00:00Z", example_prompts: ["真实旧例子"], category_keys: [], product: { source_kind: "personal" as const, publication_audience: "owner" as const, state_version: "99" } }
it("updates as a new revision with explicit examples and entirely new ZIP proof/CAS, not inherited package or auto-install", async () => {
  const client = {
    createDraft: vi.fn(),
    createVersion: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", revision: "2", status: "draft", state_version: "1", replayed: false }),
    getUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_epoch: "0", phase: "none", state_version: "1" }),
    beginUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", transfer_reference: { url: "https://objects.example/upload", method: "PUT", required_headers: { "content-type": "application/zip" }, expires_at: "2999-01-01T00:00:00Z" }, replayed: false, state_version: "2" }),
    putPackage: vi.fn().mockResolvedValue({ source_version_id: "object-version-1" }),
    completeUpload: vi.fn().mockResolvedValue({ skill_id: "mine", attempt_id: "attempt", attempt_epoch: "1", upload_id: "upload", phase: "uploaded", replayed: false, state_version: "3", content_sha256: "a".repeat(64), scan_state: "clean" }),
    validateDraft: vi.fn().mockResolvedValue({ skill_id: "mine", series_id: "series", valid: true, state_version: "4", content_digest: "a".repeat(64), manifest_identity: `skill-md-v1:sha256:${"a".repeat(64)}`, replayed: false }),
    publishDraft: vi.fn().mockResolvedValue({ source_ref: "skill:mine", revision: "2", status: "active", state_version: "5", event_id: "550e8400-e29b-41d4-a716-446655440000", replayed: true }),
    getPublished: vi.fn(),
  }
  const confirmed = { current_version_id: "different-current", state_version: "9007199254740993" }
  const session=createPersonalSkillVersionSession(lifecycleBase,{file:new File(["new zip"],"update.zip"),display_name:"Updated",summary:"New summary",tags:[],example_prompts:[],audience:"owner"}, confirmed)
  confirmed.current_version_id = "later-current"; confirmed.state_version = "9007199254740994"
  const receipt=await runPersonalSkillPublishSession(client as unknown as SkillPublishClient,session,{hash:async()=>"a".repeat(64)})
  expect(receipt).toEqual({source_ref:"skill:mine",revision:"2"})
  expect(client.createDraft).not.toHaveBeenCalled()
  expect(client.createVersion).toHaveBeenCalledWith("old",{display_name:"Updated",summary:"New summary",tags:[],example_prompts:[],category_keys:[]},session.keys.draft,undefined)
  expect(client.beginUpload).toHaveBeenCalledWith("mine",expect.objectContaining({expected_state_version:"1"}),session.keys.begin,undefined)
  expect(client.completeUpload).toHaveBeenCalledWith("mine",expect.objectContaining({source_version_id:"object-version-1",expected_state_version:"2"}),session.keys.complete,undefined)
  expect(client.publishDraft).toHaveBeenCalledWith("mine",{audience:"owner",expected_state_version:"4",expected_publication:{current_version_id:"different-current",state_version:"9007199254740993"}},session.keys.publish,undefined)
})
it("unknown new-version acknowledgement retries the exact original body/key and rejects an unrelated series before Begin", async()=>{
 const session=createPersonalSkillVersionSession(lifecycleBase,{file:new File(["zip"],"update.zip"),display_name:"Updated",summary:"",tags:[],audience:"owner"},lifecyclePublication)
 const client={createVersion:vi.fn().mockRejectedValueOnce(new Error("lost ACK")).mockResolvedValueOnce({skill_id:"new",series_id:"unrelated",revision:"2",status:"draft",replayed:true,state_version:"1"}),beginUpload:vi.fn()}
 await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient,session,{hash:async()=>"a".repeat(64)})).rejects.toThrow("lost ACK")
 await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient,session)).rejects.toMatchObject({reason:"parse"})
 expect(client.createVersion.mock.calls[0]).toEqual(client.createVersion.mock.calls[1])
 expect(client.beginUpload).not.toHaveBeenCalled()
 expect(session.draft).toBeUndefined()
})
it("ordinary personal update rejects official/withdrawn facts and any new catalog publication",()=>{
 const input={file:new File(["zip"],"update.zip"),display_name:"Update",summary:"",tags:[],audience:"owner" as const}
 expect(()=>createPersonalSkillVersionSession({...lifecycleBase,status:"withdrawn"},input,lifecyclePublication)).toThrow()
 expect(()=>createPersonalSkillVersionSession({...lifecycleBase,product:{...lifecycleBase.product,source_kind:"official"}},input,lifecyclePublication)).toThrow()
 expect(createPersonalSkillVersionSession(lifecycleBase,input,lifecyclePublication).draftBody).toMatchObject({example_prompts:["真实旧例子"],category_keys:[]})
 expect(()=>createPersonalSkillVersionSession(lifecycleBase,{...input,audience:"catalog"},lifecyclePublication)).toThrow()
})
it("unknown new-version network result never automatically creates again",async()=>{
 const session=createPersonalSkillVersionSession(lifecycleBase,{file:new File(["zip"],"update.zip"),display_name:"Updated",summary:"",tags:[],audience:"owner"},lifecyclePublication)
 const client={createVersion:vi.fn().mockRejectedValue(new HubClientError("network","unknown",null,null))}
 await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient,session,{hash:async()=>"a".repeat(64)})).rejects.toMatchObject({reason:"network"})
 expect(client.createVersion).toHaveBeenCalledTimes(1)
 await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient,session)).rejects.toMatchObject({reason:"network"})
 expect(client.createVersion).toHaveBeenCalledTimes(2)
 expect(client.createVersion.mock.calls[0]).toEqual(client.createVersion.mock.calls[1])
})

it("retains an unconfirmed creation when cancelled between the ACK and the next stage", async () => {
 const session=createPersonalSkillVersionSession(lifecycleBase,{file:new File(["zip"],"update.zip"),display_name:"Updated",summary:"",tags:[],audience:"owner"},lifecyclePublication)
 const controller=new AbortController()
 const client={
  createVersion:vi.fn(async()=>{
   queueMicrotask(()=>queueMicrotask(()=>controller.abort()))
   return {skill_id:"new",series_id:"series",revision:"2",status:"draft",replayed:false,state_version:"1"}
  }),
  getUpload:vi.fn(),
 }
 await expect(runPersonalSkillPublishSession(client as unknown as SkillPublishClient,session,{signal:controller.signal,hash:async()=>"a".repeat(64)})).rejects.toMatchObject({reason:"aborted"})
 expect(client.getUpload).not.toHaveBeenCalled()
 expect(session.draft).toBeUndefined()
 expect(session.draftUncertain).toBe(true)
})
