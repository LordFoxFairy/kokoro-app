import {act,renderHook,cleanup,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,it,vi,expect} from "vitest";
const api=vi.hoisted(()=>({readArchivedTasks:vi.fn(),readArchiveState:vi.fn(),writeArchiveState:vi.fn()}));vi.mock("@/ui/settings/archived-tasks-client",()=>api);
import {useArchivedTasks} from "@/ui/settings/use-archived-tasks";
const item={session_id:"history",title:"保留原值 ",archived_at:"2026-10-15T00:00:00.000Z",project_ref:"slug"};
const boundary={subject:"alice",admitted:true,generation:1};
beforeEach(()=>{vi.resetAllMocks();api.readArchivedTasks.mockResolvedValue({data:{items:[item],next_cursor:null}});api.readArchiveState.mockResolvedValue({session_id:"history",archived_at:null});api.writeArchiveState.mockResolvedValue({session_id:"history",archived_at:null});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it("restore ACK refreshes other scopes but still verifies current state after complete reread",async()=>{
 const changed=vi.fn();const {result}=renderHook(()=>useArchivedTasks({preview:false,boundary,onChanged:changed}));await waitFor(()=>expect(result.current.items).toHaveLength(1));api.readArchivedTasks.mockResolvedValue({data:{items:[],next_cursor:null}});
 await act(async()=>{await Promise.all([result.current.restore("history"),result.current.restore("history")]);});expect(api.writeArchiveState).toHaveBeenCalledTimes(1);expect(api.readArchiveState).toHaveBeenCalledWith({id:"history",signal:expect.any(AbortSignal)});expect(changed).toHaveBeenCalledWith({session_id:"history",archived_at:null});expect(result.current.blocked).toBe(false);
});
it("unknown restore cannot be cleared by list absence or state404; successful full reread+null still needs Continue",async()=>{
 api.writeArchiveState.mockRejectedValue(Error("offline"));const {result}=renderHook(()=>useArchivedTasks({preview:false,boundary}));await waitFor(()=>expect(result.current.items).toHaveLength(1));await act(async()=>{await result.current.restore("history");});expect(result.current.blocked).toBe(true);
 api.readArchivedTasks.mockResolvedValue({data:{items:[],next_cursor:null}});api.readArchiveState.mockRejectedValue(Object.assign(Error(),{status:404}));await act(async()=>{await result.current.reload();});expect(result.current.review).toBe(false);act(()=>result.current.proceed());expect(result.current.blocked).toBe(true);
 api.readArchiveState.mockResolvedValue({session_id:"history",archived_at:null});await act(async()=>{await result.current.reload();});expect(result.current.review).toBe(true);await act(async()=>{await result.current.restore("history");});expect(api.writeArchiveState).toHaveBeenCalledTimes(1);act(()=>result.current.proceed());expect(result.current.blocked).toBe(false);
});
it("failed authority reread retires previous review and loop/duplicate pages cannot unlock",async()=>{
 api.writeArchiveState.mockRejectedValue(Error());const {result}=renderHook(()=>useArchivedTasks({preview:false,boundary}));await waitFor(()=>expect(result.current.items).toHaveLength(1));await act(async()=>{await result.current.restore("history");});api.readArchivedTasks.mockResolvedValue({data:{items:[],next_cursor:null}});await act(async()=>{await result.current.reload();});expect(result.current.review).toBe(true);
 api.readArchivedTasks.mockResolvedValue({data:{items:[item],next_cursor:"loop"}});await act(async()=>{await result.current.reload();});expect(result.current.review).toBe(false);expect(result.current.blocked).toBe(true);act(()=>result.current.proceed());expect(result.current.blocked).toBe(true);
});
it("noncooperative write has one10s budget and stays fenced when late response arrives",async()=>{
 vi.useFakeTimers();let resolve!:(v:unknown)=>void;api.writeArchiveState.mockReturnValue(new Promise(yes=>{resolve=yes}));const {result}=renderHook(()=>useArchivedTasks({preview:false,boundary}));await act(async()=>{await vi.advanceTimersByTimeAsync(0);});expect(result.current.items).toHaveLength(1);let operation!:Promise<void>;act(()=>{operation=result.current.restore("history");});await act(async()=>{await vi.advanceTimersByTimeAsync(10001);await operation;});expect(result.current.busy).toBe(false);expect(result.current.blocked).toBe(true);await act(async()=>{resolve({session_id:"history",archived_at:null});await Promise.resolve();});expect(result.current.blocked).toBe(true);
});
it("same-subject generation and close retire pending reads without exposing old rows",async()=>{
 let resolve!:(v:unknown)=>void;api.readArchivedTasks.mockReturnValue(new Promise(yes=>{resolve=yes}));const {result,rerender,unmount}=renderHook(({generation})=>useArchivedTasks({preview:false,boundary:{...boundary,generation}}),{initialProps:{generation:1}});await act(async()=>{});const signal=api.readArchivedTasks.mock.calls[0]?.[0]?.signal as AbortSignal;
 rerender({generation:2});expect(result.current.items).toEqual([]);expect(signal.aborted).toBe(true);unmount();await act(async()=>{resolve({data:{items:[item],next_cursor:null}});});
});
