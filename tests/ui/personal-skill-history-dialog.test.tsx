import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react"
import {afterEach,expect,it,vi} from "vitest"
import {LocaleProvider} from "@/i18n/context"
import {PersonalSkillHistoryDialog} from "@/ui/skills/personal-skill-history-dialog"
import {inspectManagedSkillPackage} from "@/hub/skill-installation-content"
import type {SkillPublishClient} from "@/hub/skill-publish-client"
import type {CatalogPackageData,ManagedPersonalSkill} from "@/hub/schemas"
import type {PersonalSkillHistoryPage,PersonalSkillHistoryVersion} from "@/hub/personal-skill-history.schema"
vi.mock("@/hub/skill-installation-content",()=>({inspectManagedSkillPackage:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const base:ManagedPersonalSkill={skill_id:"anchor",source_ref:"skill:anchor",series_id:"series",revision:"2",name:"Mine",summary:"",tags:[],example_prompts:[],category_keys:[],skill_updated_at:"2026-10-21T00:00:00Z",status:"withdrawn",product:{source_kind:"personal",publication_audience:"owner",state_version:"7"}}
const row=(skill_id:string,revision:string,is_current=false):PersonalSkillHistoryVersion=>({skill_id,revision,is_current,name:`Version ${revision}`,summary:"",status:"disabled",archive_size:"375",file_count:1,created_at:"2026-10-21T00:00:00Z"})
const page=(versions:PersonalSkillHistoryVersion[],next_cursor:string|null=null):PersonalSkillHistoryPage=>({series_id:"series",publication:{current_version_id:"old",state_version:"7",withdrawn_at:null},versions,next_cursor})
function show(client:Pick<SkillPublishClient,"listHistory">){
 window.localStorage.setItem("kokoro.locale","zh")
 return render(<LocaleProvider><PersonalSkillHistoryDialog base={base} client={client} open onOpenChange={vi.fn()} returnFocusRef={{current:null}}/></LocaleProvider>)
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
