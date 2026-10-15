import {act,renderHook,waitFor,cleanup} from "@testing-library/react";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
const api=vi.hoisted(()=>({readArchiveState:vi.fn(),writeArchiveState:vi.fn(),readArchivedTasks:vi.fn(),list:vi.fn()}));
vi.mock("@/ui/settings/archived-tasks-client",()=>api);
vi.mock("@/ui/shell/page-clients",()=>({browserListClient:()=>client}));
import {useConversationList} from "@/ui/shell/use-conversation-list";
import {useSessionArchive} from "@/ui/shell/use-session-archive";
import {createSessionEngine} from "@/engine/machine";
import {createFakeClient,createMemoryStorage} from "../engine/fakes";
import type {ConversationStore} from "@/core/conversations";
const client={listSessions:api.list};
const engine=createSessionEngine({client:createFakeClient(),storage:createMemoryStorage<ConversationStore>(null)});
const thread={...engine.getSnapshot().thread,messages:[{id:"u",role:"user" as const,content:"draft",status:"completed" as const,createdAt:1,runId:"run-1"}]};
const at="2026-10-15T00:00:00.000Z";
const base={engine:null,preview:false,activeId:"active",thread,isStreaming:false,focusComposer:()=>{},readBoundary:{identity:"alice:1",admitted:true}};
beforeEach(()=>{vi.resetAllMocks();api.list.mockResolvedValue({sessions:[],next_cursor:null});api.readArchiveState.mockResolvedValue({session_id:"active",archived_at:at});api.readArchivedTasks.mockResolvedValue({data:{items:[],next_cursor:null}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it("does not recreate an archived active row after reload, while retaining the thread",async()=>{
 const {result}=renderHook(()=>useConversationList(base));await waitFor(()=>expect(api.readArchiveState).toHaveBeenCalledTimes(1));await waitFor(()=>expect(result.current.archiveStatus).toBe("archived"));expect(result.current.conversations).toEqual([]);expect(thread.messages).toHaveLength(1);
 act(()=>result.current.refresh());await waitFor(()=>expect(api.readArchiveState).toHaveBeenCalledTimes(2));expect(result.current.conversations).toEqual([]);
});
it("unknown historical reads never masquerade as unarchived and only explicit retry issues another read",async()=>{
 api.readArchiveState.mockRejectedValue(Error("offline"));const {result,rerender}=renderHook(()=>useConversationList(base));await waitFor(()=>expect(result.current.archiveStateError).toBe(true));expect(result.current.conversations).toEqual([]);rerender();rerender();expect(api.readArchiveState).toHaveBeenCalledTimes(1);
 api.readArchiveState.mockResolvedValue({session_id:"active",archived_at:null});act(()=>result.current.retryArchiveState?.());await waitFor(()=>expect(result.current.conversations.map(x=>x.id)).toEqual(["active"]));
});
it("a locally generated draft stays visible across first404, but historical404 does not",async()=>{
 const pendingClient=createFakeClient();pendingClient.nextCreate=()=>new Promise(()=>{});const local=createSessionEngine({client:pendingClient,storage:createMemoryStorage<ConversationStore>(null),createId:p=>`${p}_local`});local.submit("new draft");api.readArchiveState.mockRejectedValue(Object.assign(Error("missing"),{status:404}));
 const {result,rerender}=renderHook(({id,liveEngine})=>useConversationList({...base,activeId:id,engine:liveEngine}),{initialProps:{id:"conv_local",liveEngine:local}});
 expect(result.current.conversations.map(x=>x.id)).toEqual(["conv_local"]);await waitFor(()=>expect(result.current.archiveStatus).toBe("missing"));expect(result.current.conversations.map(x=>x.id)).toEqual(["conv_local"]);
 rerender({id:"history",liveEngine:local});await waitFor(()=>expect(api.readArchiveState).toHaveBeenCalledTimes(2));expect(result.current.conversations).toEqual([]);local.dispose();
});
it("fresh archive receipt beats an older list and old pending GET; late A→B→A cannot revive",async()=>{
 let resolve!:(v:unknown)=>void;api.readArchiveState.mockReturnValueOnce(new Promise(yes=>{resolve=yes}));
 const {result,rerender}=renderHook(({id,revision,receipt})=>useConversationList({...base,activeId:id,archiveRevision:revision,archiveReceipt:receipt}),{initialProps:{id:"active",revision:0,receipt:null as null|{session_id:string;archived_at:string}}});
 await waitFor(()=>expect(api.readArchiveState).toHaveBeenCalledTimes(1));rerender({id:"B",revision:0,receipt:null});rerender({id:"active",revision:1,receipt:{session_id:"active",archived_at:at}});
 expect(result.current.conversations).toEqual([]);await act(async()=>{resolve({session_id:"active",archived_at:null});});expect(result.current.conversations).toEqual([]);
});
it("all mounted scope lists refresh on archive revision without invoking delete or clearing engine",async()=>{
 const first=renderHook(({revision})=>useConversationList({...base,activeId:null,archiveRevision:revision}),{initialProps:{revision:0}});
 const scope={kind:"project" as const,projectRef:"slug"};
 const second=renderHook(({revision})=>useConversationList({...base,activeId:null,scope,archiveRevision:revision}),{initialProps:{revision:0}});
 await waitFor(()=>expect(api.list).toHaveBeenCalledTimes(2));first.rerender({revision:1});second.rerender({revision:1});await waitFor(()=>expect(api.list).toHaveBeenCalledTimes(4));
});
it("commands synchronously reject double writes; unknown needs full read plus explicit continue",async()=>{
 api.writeArchiveState.mockRejectedValue(Error("unknown"));const boundary={subject:"alice",generation:1,admitted:true};const {result}=renderHook(()=>useSessionArchive({preview:false,boundary,engine:null,scope:"direct"}));
 await act(async()=>{await Promise.all([result.current.archive("active"),result.current.archive("active")]);});expect(api.writeArchiveState).toHaveBeenCalledTimes(1);expect(result.current.blocked).toBe(true);
 await act(async()=>{await result.current.archive("other");});expect(api.writeArchiveState).toHaveBeenCalledTimes(1);
 await act(async()=>{await result.current.reconcile();});expect(result.current.review).toBe(true);expect(result.current.blocked).toBe(true);
 act(()=>result.current.proceed());expect(result.current.blocked).toBe(false);
});
it("generation retirement prevents late command publication and aborts the attempt",async()=>{
 let resolve!:(v:unknown)=>void;api.writeArchiveState.mockReturnValue(new Promise(yes=>{resolve=yes}));const {result,rerender}=renderHook(({generation})=>useSessionArchive({preview:false,boundary:{subject:"alice",admitted:true,generation},engine:null,scope:"direct"}),{initialProps:{generation:1}});
 let operation!:Promise<void>;act(()=>{operation=result.current.archive("active");});await waitFor(()=>expect(api.writeArchiveState).toHaveBeenCalledTimes(1));const signal=api.writeArchiveState.mock.calls[0]?.[0]?.signal as AbortSignal;
 rerender({generation:2});expect(signal.aborted).toBe(true);await act(async()=>{resolve({session_id:"active",archived_at:at});await operation;});expect(result.current.event).toBeNull();expect(result.current.revision).toBe(0);
});
it("preview and missing admission perform no archive API writes",async()=>{const {result}=renderHook(()=>useSessionArchive({preview:true,boundary:{subject:"alice",generation:1,admitted:true},engine:null,scope:"direct"}));await act(async()=>{await result.current.archive("active");});expect(api.writeArchiveState).not.toHaveBeenCalled();});
it("a post-ACK state GET null supersedes the old archive receipt and reveals the active task",async()=>{
 const {result,rerender}=renderHook(({revision,receipt})=>useConversationList({...base,archiveRevision:revision,archiveReceipt:receipt}),{initialProps:{revision:0,receipt:null as null|{session_id:string;archived_at:string}}});
 await waitFor(()=>expect(result.current.archiveStatus).toBe("archived"));
 api.readArchiveState.mockResolvedValue({session_id:"active",archived_at:null});
 rerender({revision:1,receipt:{session_id:"active",archived_at:at}});
 await waitFor(()=>expect(result.current.archiveStatus).toBe("unarchived"));
 expect(result.current.conversations.map(x=>x.id)).toEqual(["active"]);
 rerender({revision:1,receipt:{session_id:"active",archived_at:at}});
 expect(result.current.conversations.map(x=>x.id)).toEqual(["active"]);
});
it("a post-ACK fresh ordinary list can reveal an inactive task restored elsewhere",async()=>{
 const row={session_id:"other",title:"restored",project_ref:null,created_at:at,updated_at:at};
 api.list.mockResolvedValue({sessions:[row],next_cursor:null});
 const {result,rerender}=renderHook(({revision,receipt})=>useConversationList({...base,activeId:null,archiveRevision:revision,archiveReceipt:receipt}),{initialProps:{revision:0,receipt:null as null|{session_id:string;archived_at:string}}});
 await waitFor(()=>expect(result.current.conversations.map(x=>x.id)).toEqual(["other"]));
 let release!:(v:unknown)=>void;api.list.mockReturnValueOnce(new Promise(yes=>{release=yes}));
 rerender({revision:1,receipt:{session_id:"other",archived_at:at}});
 expect(result.current.conversations).toEqual([]);
 await act(async()=>{release({sessions:[row],next_cursor:null});});
 await waitFor(()=>expect(result.current.conversations.map(x=>x.id)).toEqual(["other"]));
});
it("preview keeps its local active row without calling authenticated archive state",async()=>{
 const {result}=renderHook(()=>useConversationList({...base,preview:true}));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(api.readArchiveState).not.toHaveBeenCalled();
 expect(result.current.conversations.map(x=>x.id)).toEqual(["active"]);
});
it("an injected view without trusted read admission cannot read archive state",async()=>{
 const {readBoundary:_,...injected}=base;void _;
 const {result}=renderHook(()=>useConversationList(injected));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(api.readArchiveState).not.toHaveBeenCalled();
 expect(result.current.conversations).toEqual([]);
});
it("a scope mounted after an existing receipt accepts its newly issued ordinary page",async()=>{
 api.list.mockResolvedValue({sessions:[{session_id:"other",title:"restored"}],next_cursor:null});
 const {result}=renderHook(()=>useConversationList({...base,activeId:null,archiveRevision:1,archiveReceipt:{session_id:"other",archived_at:at}}));
 await waitFor(()=>expect(result.current.conversations.map(x=>x.id)).toEqual(["other"]));
});
it.each(["ordinary list","state GET"])("%s proof retires local draft eligibility before later owner404",async proof=>{
 const pendingClient=createFakeClient();pendingClient.nextCreate=()=>new Promise(()=>{});
 const local=createSessionEngine({client:pendingClient,storage:createMemoryStorage<ConversationStore>(null),createId:p=>`${p}_local`});local.submit("draft");
 api.readArchiveState.mockRejectedValue(Object.assign(Error("missing"),{status:404}));
 const {result}=renderHook(()=>useConversationList({...base,activeId:"conv_local",engine:local}));
 await waitFor(()=>expect(result.current.archiveStatus).toBe("missing"));
 expect(result.current.conversations.map(x=>x.id)).toEqual(["conv_local"]);
 if(proof==="ordinary list")api.list.mockResolvedValue({sessions:[{session_id:"conv_local",title:"persisted"}],next_cursor:null});
 else api.readArchiveState.mockResolvedValue({session_id:"conv_local",archived_at:null});
 act(()=>result.current.refresh());
 await waitFor(()=>expect(local.getSnapshot()).not.toHaveProperty("locallyCreatedSessionId"));
 api.list.mockResolvedValue({sessions:[],next_cursor:null});api.readArchiveState.mockRejectedValue(Object.assign(Error("deleted"),{status:404}));
 act(()=>result.current.refresh());await waitFor(()=>expect(result.current.archiveStatus).toBe("missing"));
 expect(result.current.conversations).toEqual([]);expect(local.getSnapshot().thread.messages).toHaveLength(1);local.dispose();
});
it("a bound archive ACK retires local draft eligibility without cancelling its pending Run",async()=>{
 const pendingClient=createFakeClient();pendingClient.nextCreate=()=>new Promise(()=>{});
 const local=createSessionEngine({client:pendingClient,storage:createMemoryStorage<ConversationStore>(null),createId:p=>`${p}_local`});local.submit("draft");
 api.writeArchiveState.mockResolvedValue({session_id:"conv_local",archived_at:at});
 const {result}=renderHook(()=>useSessionArchive({preview:false,boundary:{subject:"alice",generation:1,admitted:true},engine:local,scope:"direct"}));
 await act(async()=>{await result.current.archive("conv_local");});
 expect(local.getSnapshot()).not.toHaveProperty("locallyCreatedSessionId");expect(local.getSnapshot().machine.phase).toBe("submitting");expect(local.getSnapshot().thread.messages).toHaveLength(1);expect(pendingClient.controlCalls).toEqual([]);local.dispose();
});
