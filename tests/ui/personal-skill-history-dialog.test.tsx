import {useState} from "react"
import {File as NodeFile} from "node:buffer"
import {HubClientError} from "@/hub/client"
import {downloadManagedSkillArchive} from "@/hub/personal-skill-archive"
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react"
import {afterEach,expect,it,vi} from "vitest"
import {LocaleProvider} from "@/i18n/context"
import {PersonalSkillHistoryDialog} from "@/ui/skills/personal-skill-history-dialog"
import {inspectManagedSkillPackage} from "@/hub/skill-installation-content"
import {createSkillPublishClient, type SkillPublishClient} from "@/hub/skill-publish-client"
import type {CatalogPackageData,ManagedPersonalSkill} from "@/hub/schemas"
import type {PersonalSkillHistoryPage,PersonalSkillHistoryVersion} from "@/hub/personal-skill-history.schema"
vi.mock("@/hub/personal-skill-archive",()=>({downloadManagedSkillArchive:vi.fn()}))
vi.mock("@/hub/skill-installation-content",()=>({inspectManagedSkillPackage:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const base:ManagedPersonalSkill={skill_id:"anchor",source_ref:"skill:anchor",series_id:"series",revision:"2",name:"Mine",summary:"",tags:[],example_prompts:[],category_keys:[],skill_updated_at:"2026-10-21T00:00:00Z",status:"withdrawn",product:{source_kind:"personal",publication_audience:"owner",state_version:"7"}}
const row=(skill_id:string,revision:string,is_current=false):PersonalSkillHistoryVersion=>({skill_id,revision,is_current,name:`Version ${revision}`,summary:"",status:"disabled",archive_size:"375",file_count:1,created_at:"2026-10-21T00:00:00Z"})
const page=(versions:PersonalSkillHistoryVersion[],next_cursor:string|null=null):PersonalSkillHistoryPage=>({series_id:"series",publication:{current_version_id:"old",state_version:"7",withdrawn_at:null},versions,next_cursor})
function show(client:Pick<SkillPublishClient,"listHistory">){
 window.localStorage.setItem("kokoro.locale","zh")
 return render(<LocaleProvider><PersonalSkillHistoryDialog base={base} client={{...createSkillPublishClient(),...client}} open onOpenChange={vi.fn()} returnFocusRef={{current:null}}/></LocaleProvider>)
}
it("selects formal current, ignores late old document and preserves page on continuation failure",async()=>{
 const client={listHistory:vi.fn<SkillPublishClient["listHistory"]>().mockResolvedValueOnce(page([row("new","2"),row("old","1",true)],"next")).mockRejectedValueOnce(new Error("cursor changed"))}
 let late:((value:CatalogPackageData)=>void)|undefined
 vi.mocked(inspectManagedSkillPackage).mockImplementation(async(target,file)=>{
  if(!file)return {source_ref:`skill:${target.skill_id}`,revision:target.revision,files:[{path:"SKILL.md",size_bytes:"3"}],selected_file:null}
  if(target.skill_id==="old")return new Promise(resolve=>{late=resolve})
  return {source_ref:`skill:${target.skill_id}`,revision:target.revision,files:[{path:"SKILL.md",size_bytes:"3"}],selected_file:{path:"SKILL.md",text:"new"}}
 })
 show(client)
 await screen.findByText("当前版本")
 await waitFor(()=>expect(late).toBeTypeOf("function"))
 const oldSignal=vi.mocked(inspectManagedSkillPackage).mock.calls.find(call=>call[0].skill_id==="old"&&call[1]==="SKILL.md")![2]!
 fireEvent.click(screen.getByRole("button",{name:/版本 2/u}))
 await screen.findByText("new")
 expect(oldSignal.aborted).toBe(true)
 late!({source_ref:"skill:old",revision:"1",files:[],selected_file:{path:"SKILL.md",text:"STALE PRIVATE"}})
 await Promise.resolve();expect(screen.queryByText("STALE PRIVATE")).toBeNull()
 fireEvent.click(screen.getByRole("button",{name:"查看更多"}))
 await screen.findByRole("alert")
 expect(screen.getByText("new")).toBeInTheDocument()
 expect(screen.getByRole("button",{name:/版本 1/u})).toBeInTheDocument()
 expect(client.listHistory.mock.calls[1]?.[1]).toBe("next")
})
it("does not mix a changed publication snapshot into retained history",async()=>{
 const next=page([row("older","1")]);next.publication!.state_version="8"
 const client={listHistory:vi.fn<SkillPublishClient["listHistory"]>().mockResolvedValueOnce(page([row("new","2")],"next")).mockResolvedValueOnce(next)}
 vi.mocked(inspectManagedSkillPackage).mockResolvedValue({source_ref:"skill:new",revision:"2",files:[],selected_file:null})
 show(client);await screen.findByRole("button",{name:/版本 2/u})
 fireEvent.click(screen.getByRole("button",{name:"查看更多"}));await screen.findByRole("alert")
 expect(screen.queryByRole("button",{name:/版本 1/u})).toBeNull()
})
it("keeps the displayed document when its already selected file is chosen again",async()=>{
 const files=[{path:"SKILL.md",size_bytes:"4"},{path:"extra.md",size_bytes:"4"}]
 const client={listHistory:vi.fn<SkillPublishClient["listHistory"]>().mockResolvedValue(page([row("old","1",true)]))}
 vi.mocked(inspectManagedSkillPackage).mockImplementation(async(_target,file)=>({source_ref:"skill:old",revision:"1",files,selected_file:file?{path:file,text:"BODY"}:null}))
 show(client);await screen.findByText("BODY")
 fireEvent.click(screen.getByRole("button",{name:"文件"}))
 fireEvent.click(screen.getByRole("button",{name:"SKILL.md"}))
 expect(screen.getByText("BODY")).toBeInTheDocument()
})

it.each([
 {status:"active" as const,withdrawn:false,labels:[]},
 {status:"disabled" as const,withdrawn:false,labels:["已停用"]},
 {status:"withdrawn" as const,withdrawn:true,labels:["已撤回"]},
 {status:"quarantined" as const,withdrawn:true,labels:["已隔离","已撤回"]},
])("keeps the current pointer distinct from availability ($status, withdrawn=$withdrawn)",async({status,withdrawn,labels})=>{
 const current={...row("old","2",true),status}, previous={...row("older","1"),status:"active" as const}
 const history=page([current,previous])
 history.publication!.withdrawn_at=withdrawn?"2026-10-21T01:00:00Z":null
 const client={listHistory:vi.fn<SkillPublishClient["listHistory"]>().mockResolvedValue(history)}
 vi.mocked(inspectManagedSkillPackage).mockResolvedValue({source_ref:"skill:old",revision:"2",files:[],selected_file:null})
 show(client)
 const selected=await screen.findByRole("button",{name:/版本 2/u})
 expect(selected).toHaveTextContent("当前版本")
 for(const label of labels)expect(selected).toHaveTextContent(label)
 for(const label of ["已撤回","已停用","已隔离"])expect(screen.getByRole("button",{name:/版本 1/u})).not.toHaveTextContent(label)
 expect(selected.textContent?.match(/已撤回/gu)??[]).toHaveLength(withdrawn?1:0)
 expect(selected).toHaveAttribute("aria-pressed","true")
})

it("offers recovery on a historical row, never on the active current version or a quarantined version",async()=>{
 const versions=[{...row("current","3",true),status:"active" as const},{...row("quarantine","2"),status:"quarantined" as const},{...row("old","1"),status:"withdrawn" as const}]
 const history=page(versions);history.publication!.current_version_id="current"
 vi.mocked(inspectManagedSkillPackage).mockResolvedValue({source_ref:"skill:current",revision:"3",files:[],selected_file:null})
 show({listHistory:vi.fn().mockResolvedValue(history)})
 await screen.findByRole("button",{name:/版本 1/u})
 expect(screen.getAllByRole("button",{name:"恢复"})).toHaveLength(1)
 fireEvent.click(screen.getByRole("button",{name:"恢复"}))
 expect(await screen.findByRole("dialog",{name:"恢复此版本？"})).toBeInTheDocument()
 fireEvent.click(screen.getByRole("button",{name:"取消"}))
 expect(screen.queryByRole("dialog",{name:"恢复此版本？"})).toBeNull()
 expect(screen.getByRole("button",{name:/版本 1/u})).toBeInTheDocument()
})

it("retains the same uncertain restore command when the history container closes and reopens",async()=>{
 window.localStorage.setItem("kokoro.locale","zh")
 const historical=row("old","1")
 const client={...createSkillPublishClient(),listHistory:vi.fn().mockResolvedValue(page([historical])),getManaged:vi.fn().mockResolvedValue({...base,skill_id:"old",source_ref:"skill:old",revision:"1",name:historical.name}),createVersion:vi.fn().mockRejectedValue(new HubClientError("network","Unknown create receipt",null,null))}
 vi.mocked(inspectManagedSkillPackage).mockResolvedValue({source_ref:"skill:old",revision:"1",files:[],selected_file:null})
 vi.mocked(downloadManagedSkillArchive).mockResolvedValue(new NodeFile(["zip"],"skill-history.zip",{type:"application/zip"}) as unknown as File)
 function Harness(){const [open,setOpen]=useState(true);return <LocaleProvider><button onClick={()=>setOpen(true)}>重新打开历史</button><PersonalSkillHistoryDialog base={base} client={client} open={open} onOpenChange={setOpen} returnFocusRef={{current:null}}/></LocaleProvider>}
 render(<Harness/>);fireEvent.click(await screen.findByRole("button",{name:"恢复"}));fireEvent.click(screen.getByRole("button",{name:"恢复"}))
 await screen.findByRole("alert");expect(client.createVersion).toHaveBeenCalledOnce()
 const original=client.createVersion.mock.calls[0]!.slice(0,3)
 fireEvent.click(screen.getAllByRole("button",{name:"关闭"}).at(-1)!);fireEvent.click(screen.getByRole("button",{name:"重新打开历史"}))
 fireEvent.click(await screen.findByRole("button",{name:"重试同一次尝试"}));await waitFor(()=>expect(client.createVersion).toHaveBeenCalledTimes(2))
 expect(client.createVersion.mock.calls[1]!.slice(0,3)).toEqual(original)
 expect(client.getManaged).toHaveBeenCalledOnce();expect(downloadManagedSkillArchive).toHaveBeenCalledOnce()
})
