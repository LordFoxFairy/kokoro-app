import { useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/i18n/context"
import { HubClientError } from "@/hub/client"
import { createSkillPublishClient } from "@/hub/skill-publish-client"
import { downloadManagedSkillArchive } from "@/hub/personal-skill-archive"
import { PersonalSkillRestoreDialog } from "@/ui/skills/personal-skill-restore-dialog"
import type { ManagedPersonalSkill } from "@/hub/schemas"
vi.mock("@/hub/personal-skill-archive",()=>({downloadManagedSkillArchive:vi.fn()}))
const sha="a".repeat(64)
const version={skill_id:"old",revision:"1",name:"Original",summary:"saved",status:"withdrawn" as const,is_current:false,archive_size:"3",file_count:1,created_at:"2026-10-21T00:00:00Z"}
const base:ManagedPersonalSkill={skill_id:"old",revision:"1",name:"Original",summary:"saved",status:"withdrawn",source_ref:"skill:old",series_id:"series",tags:["saved"],example_prompts:["old example"],category_keys:[],skill_updated_at:"2026-10-21T00:00:00Z",product:{source_kind:"personal",publication_audience:"owner",state_version:"2"}}
function fixture(){
 return {...createSkillPublishClient(),
  getManaged:vi.fn().mockResolvedValue(base),
  createVersion:vi.fn().mockResolvedValue({skill_id:"restored",series_id:"series",revision:"3",status:"draft",state_version:"1",replayed:false}),
  getUpload:vi.fn().mockResolvedValue({skill_id:"restored",attempt_epoch:"0",phase:"none",state_version:"1"}),
  beginUpload:vi.fn().mockResolvedValue({skill_id:"restored",attempt_id:"attempt",attempt_epoch:"1",upload_id:"upload",transfer_reference:{url:"https://objects.example/put",method:"PUT",required_headers:{"content-type":"application/zip"},expires_at:"2999-01-01T00:00:00Z"},replayed:false,state_version:"2"}),
  putPackage:vi.fn().mockResolvedValue({source_version_id:"object-version"}),
  completeUpload:vi.fn().mockResolvedValue({skill_id:"restored",attempt_id:"attempt",attempt_epoch:"1",upload_id:"upload",phase:"uploaded",state_version:"3",content_sha256:sha,scan_state:"clean",replayed:false}),
  validateDraft:vi.fn().mockResolvedValue({skill_id:"restored",series_id:"series",valid:true,state_version:"4",content_digest:sha,manifest_identity:`skill-md-v1:sha256:${sha}`,replayed:false}),
  publishDraft:vi.fn().mockResolvedValue({source_ref:"skill:restored",revision:"3",status:"active",state_version:"5",event_id:"550e8400-e29b-41d4-a716-446655440000",replayed:false}),
  getPublished:vi.fn().mockRejectedValue(new HubClientError("http","Not found","skill_not_found",404)),
 }
}
beforeEach(()=>{window.localStorage.setItem("kokoro.locale","zh");vi.mocked(downloadManagedSkillArchive).mockResolvedValue(new File(["zip"],"skill-history.zip",{type:"application/zip"}))})
afterEach(()=>{cleanup();vi.resetAllMocks()})
it("waits for explicit confirmation, freezes the original snapshot and resumes one unknown publish across close/reopen",async()=>{
 const client=fixture(),done=vi.fn(),closed=vi.fn(),publication={current_version_id:"new-current",state_version:"9007199254740993"}
 client.publishDraft.mockRejectedValueOnce(new HubClientError("http","Unavailable","skill_dependency_unavailable",503))
 function Harness(){const [open,setOpen]=useState(true);return <LocaleProvider><button onClick={()=>setOpen(true)}>重新打开</button><PersonalSkillRestoreDialog version={version} seriesId="series" publication={publication} client={client} open={open} admitted onClose={retain=>{closed(retain);setOpen(false)}} onStarted={vi.fn()} onRestored={done} onStartOver={vi.fn()} returnFocusRef={{current:null}} hash={async()=>sha}/></LocaleProvider>}
 render(<Harness/>);expect(client.getManaged).not.toHaveBeenCalled();expect(downloadManagedSkillArchive).not.toHaveBeenCalled();expect(client.createVersion).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole("button",{name:"恢复"}));fireEvent.click(screen.getByRole("button",{name:"重试同一次尝试"}))
 await screen.findByRole("alert");expect(client.publishDraft).toHaveBeenCalledOnce();expect(done).not.toHaveBeenCalled()
 const original=client.publishDraft.mock.calls[0]!
 publication.current_version_id="later-current";publication.state_version="9007199254740994"
 fireEvent.click(within(screen.getByTestId("personal-skill-restore-dialog")).getAllByRole("button",{name:"关闭"}).at(-1)!)
 expect(closed).toHaveBeenCalledWith(true);fireEvent.click(screen.getByRole("button",{name:"重新打开"}))
 fireEvent.click(screen.getByRole("button",{name:"重试同一次尝试"}));await waitFor(()=>expect(done).toHaveBeenCalledOnce())
 expect(client.publishDraft.mock.calls[1]?.slice(0,3)).toEqual(original.slice(0,3))
 expect(original[1]).toMatchObject({audience:"owner",expected_publication:{current_version_id:"new-current",state_version:"9007199254740993"}})
 expect(client.getManaged).toHaveBeenCalledOnce();expect(downloadManagedSkillArchive).toHaveBeenCalledOnce();expect(client.createVersion).toHaveBeenCalledOnce();expect(client.putPackage).toHaveBeenCalledOnce()
 expect(client.createVersion.mock.calls[0]?.[0]).toBe("old")
 expect(client.createVersion.mock.calls[0]?.[1]).toMatchObject({display_name:"Original",summary:"saved",tags:["saved"],example_prompts:["old example"]})
})
it("cancels preparation on lost admission and lets the same intent be retried after re-admission",async()=>{
 const client=fixture(),done=vi.fn();let release!:(value:ManagedPersonalSkill)=>void
 client.getManaged.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const props={version,seriesId:"series",publication:{current_version_id:"current",state_version:"7"},client,open:true,onClose:vi.fn(),onStarted:vi.fn(),onRestored:done,onStartOver:vi.fn(),returnFocusRef:{current:null},hash:async()=>sha}
 const show=(admitted:boolean)=><LocaleProvider><PersonalSkillRestoreDialog {...props} admitted={admitted}/></LocaleProvider>
 const rendered=render(show(true));fireEvent.click(screen.getByRole("button",{name:"恢复"}));await waitFor(()=>expect(client.getManaged).toHaveBeenCalledOnce())
 const signal=client.getManaged.mock.calls[0]?.[1] as AbortSignal
 rendered.rerender(show(false));expect(signal.aborted).toBe(true);release(base)
 await waitFor(()=>expect(downloadManagedSkillArchive).not.toHaveBeenCalled());await Promise.resolve()
 rendered.rerender(show(true));await waitFor(()=>expect(screen.getByRole("button",{name:"重试同一次尝试"})).not.toBeDisabled())
 fireEvent.click(screen.getByRole("button",{name:"重试同一次尝试"}));await waitFor(()=>expect(done).toHaveBeenCalledOnce())
})
it("does not publish a quarantined historical revision or silently rebase a rejected publication",async()=>{
 const client=fixture(),restart=vi.fn()
 client.getManaged.mockResolvedValue({...base,status:"quarantined"})
 render(<LocaleProvider><PersonalSkillRestoreDialog version={version} seriesId="series" publication={{current_version_id:"current",state_version:"7"}} client={client} open admitted onClose={vi.fn()} onStarted={vi.fn()} onRestored={vi.fn()} onStartOver={restart} returnFocusRef={{current:null}}/></LocaleProvider>)
 fireEvent.click(screen.getByRole("button",{name:"恢复"}));await screen.findByRole("alert")
 expect(downloadManagedSkillArchive).not.toHaveBeenCalled();expect(client.createVersion).not.toHaveBeenCalled()
 expect(screen.queryByRole("button",{name:"重试同一次尝试"})).toBeNull();fireEvent.click(screen.getByRole("button",{name:"重新开始新尝试"}));expect(restart).toHaveBeenCalledOnce()
})
it("closing read-only preparation does not manufacture a pending command",async()=>{
 const client=fixture(),closed=vi.fn(),started=vi.fn();let release!:(value:ManagedPersonalSkill)=>void
 client.getManaged.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 render(<LocaleProvider><PersonalSkillRestoreDialog version={version} seriesId="series" publication={{current_version_id:"current",state_version:"7"}} client={client} open admitted onClose={closed} onStarted={started} onRestored={vi.fn()} onStartOver={vi.fn()} returnFocusRef={{current:null}}/></LocaleProvider>)
 fireEvent.click(screen.getByRole("button",{name:"恢复"}));await waitFor(()=>expect(client.getManaged).toHaveBeenCalledOnce())
 fireEvent.click(within(screen.getByTestId("personal-skill-restore-dialog")).getAllByRole("button",{name:"关闭"}).at(-1)!)
 expect(closed).toHaveBeenCalledWith(false);expect(started).not.toHaveBeenCalled()
 release(base);await Promise.resolve();expect(downloadManagedSkillArchive).not.toHaveBeenCalled();expect(client.createVersion).not.toHaveBeenCalled()
})
