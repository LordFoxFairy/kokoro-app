import { expect, it } from "vitest"
import { createSessionEngine } from "@/engine/machine"
import { addConversation } from "@/core/conversations"
import { makeEvent, makeSnapshot } from "../core/fixtures"
import { createFakeClient, createMemoryStorage, settle } from "./fakes"
const access={project_id:"project-a",role:"editor" as const,expires_at:null,access_version:"1",capabilities:["read" as const,"edit" as const]}
it("shows a peer busy snapshot but sends no cancel or replacement message",async()=>{
 const client=createFakeClient();client.nextSnapshot=async()=>({...makeSnapshot({sessionId:"s"}),project_access:access,execution_head:{run_id:"peer",state:"active",pending_pauses:[],can_control:false}})
 const storage=createMemoryStorage(addConversation(null,"s",Date.now()))
 const engine=createSessionEngine({client,storage,scope:{kind:"project",projectRef:"project-a"}});await settle()
 expect(engine.getSnapshot().thread.activeRunId).toBe("peer");engine.cancelRun();engine.submit("must not replace peer")
 await settle();expect(client.controlCalls).toEqual([]);expect(client.createCalls).toEqual([]);engine.dispose()
})
it("adopts a safe peer FINAL from the existing terminal snapshot once without another live text stream",async()=>{
 const client=createFakeClient();let terminal=false
 client.nextSnapshot=async()=>terminal?{...makeSnapshot({sessionId:"s",messages:[{message_id:"final",role:"assistant",content:"confirmed FINAL",status:"completed",created_at:"2026-11-13T00:00:00Z",run_id:"peer",can_regenerate:false}]}),project_access:access}:{...makeSnapshot({sessionId:"s"}),project_access:access,execution_head:{run_id:"peer",state:"active",pending_pauses:[],can_control:false}}
 const storage=createMemoryStorage(addConversation(null,"s",Date.now()));const engine=createSessionEngine({client,storage,scope:{kind:"project",projectRef:"project-a"}});await settle();terminal=true
 client.lastStream().emit([makeEvent("run.completed",{status:"completed",token_usage:null},{session_id:"s",run_id:"peer",seq:5})]);await settle();await settle()
 expect(engine.getSnapshot().thread.messages.filter(message=>message.content==="confirmed FINAL")).toHaveLength(1);engine.dispose()
})
