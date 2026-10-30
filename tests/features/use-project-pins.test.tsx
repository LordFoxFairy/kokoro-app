import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useProjectPins } from "@/features/app/use-project-pins"
import { HubClientError } from "@/hub/client"
import type { ProjectPinsClient } from "@/features/app/project-pins"
afterEach(cleanup)
const time="2026-10-27T00:00:00.000Z"
const a={project_id:"a",pinned_at:time}
const boundary={admitted:true,subject:"reader",generation:1}
function fixture(){const list=vi.fn<ProjectPinsClient["list"]>().mockResolvedValue({items:[a],next_cursor:null}),set=vi.fn<ProjectPinsClient["set"]>().mockResolvedValue({...a,is_pinned:true});return {list,set}}
it("retains the global actor collection across route rerenders and retires invisible rows",async()=>{
 const client=fixture(),props={preview:false,boundary,visibleIds:["a","b"],client}
 const view=renderHook(p=>useProjectPins(p),{initialProps:props})
 await waitFor(()=>expect(view.result.current.pinned).toEqual([a]))
 view.rerender({...props,visibleIds:["a","b"]});expect(client.list).toHaveBeenCalledTimes(1)
 view.rerender({...props,visibleIds:["b"]});expect(view.result.current.pinned).toEqual([])
})
it("unknown PUT preserves the prior read and only explicit exact GET reconciles, never a PUT replay",async()=>{
 const client=fixture();client.set.mockRejectedValue(new TypeError("lost ACK"))
 const view=renderHook(()=>useProjectPins({preview:false,boundary,visibleIds:["a"],client}))
 await waitFor(()=>expect(view.result.current.pinned).toEqual([a]))
 await act(()=>view.result.current.set("a",false))
 expect(view.result.current.targets.a?.status).toBe("unknown");expect(view.result.current.pinned).toEqual([a]);expect(client.list).toHaveBeenCalledTimes(1)
 act(()=>view.result.current.ensure("a"));await act(async()=>{await Promise.resolve()});expect(client.list).toHaveBeenCalledTimes(1)
 client.list.mockResolvedValue({items:[],next_cursor:null});await act(()=>view.result.current.check("a"))
 expect(client.list).toHaveBeenLastCalledWith({project_id:"a"},expect.any(AbortSignal));expect(view.result.current.targets.a).toMatchObject({status:"known",value:{is_pinned:false}});expect(client.set).toHaveBeenCalledTimes(1)
})
it("serializes a project while allowing a different project, and stale callbacks cannot revive an old fact",async()=>{
 const client=fixture();client.list.mockResolvedValue({items:[a,{project_id:"b",pinned_at:time}],next_cursor:null})
 let finish!:(v:Awaited<ReturnType<ProjectPinsClient["set"]>>)=>void;client.set.mockImplementation(()=>new Promise(r=>{finish=r}))
 const view=renderHook(()=>useProjectPins({preview:false,boundary,visibleIds:["a","b"],client}));await waitFor(()=>expect(view.result.current.targets.b?.status).toBe("known"))
 const oldSet=view.result.current.set
 act(()=>{void oldSet("a",false);void oldSet("a",true)});expect(client.set).toHaveBeenCalledTimes(1)
 await act(async()=>{finish({project_id:"a",is_pinned:false,pinned_at:null});await Promise.resolve()})
 await act(()=>oldSet("a",true));expect(client.set).toHaveBeenCalledTimes(1)
})
it("retires actor and late ACKs without publishing the former user's pins",async()=>{
 const client=fixture(),props={preview:false,boundary,visibleIds:["a"],client}
 const view=renderHook(p=>useProjectPins(p),{initialProps:props});await waitFor(()=>expect(view.result.current.pinned).toEqual([a]))
 const old=view.result.current.set;let done!:(v:Awaited<ReturnType<ProjectPinsClient["set"]>>)=>void;client.set.mockImplementation(()=>new Promise(r=>{done=r}))
 act(()=>void old("a",false));client.list.mockResolvedValue({items:[],next_cursor:null})
 view.rerender({...props,boundary:{admitted:true,subject:"other",generation:2}})
 expect(view.result.current.pinned).toEqual([])
 await act(async()=>{done({project_id:"a",is_pinned:false,pinned_at:null});await Promise.resolve();await old("a",true)})
 expect(client.set).toHaveBeenCalledTimes(1);expect(view.result.current.pinned).toEqual([])
})
it("a malformed404 is unknown, while a validated invisible target retires UI without unpinning",async()=>{
 const client=fixture(),retire=vi.fn(),view=renderHook(()=>useProjectPins({preview:false,boundary,visibleIds:["a"],client,onUnavailable:retire}))
 await waitFor(()=>expect(view.result.current.pinned).toEqual([a]))
 client.list.mockRejectedValue(new HubClientError("parse","invalid",null,404));await act(()=>view.result.current.check("a"));expect(retire).not.toHaveBeenCalled();expect(view.result.current.pinned).toEqual([a])
 client.list.mockRejectedValue(new HubClientError("http","hidden","project_not_found",404));await act(()=>view.result.current.check("a"));expect(retire).toHaveBeenCalledWith("a");expect(view.result.current.pinned).toEqual([]);expect(client.set).not.toHaveBeenCalled()
})
it("does not infer an unloaded Project is unpinned and protects a newer exact fact from an old page",async()=>{
 const client=fixture();let page!:(v:Awaited<ReturnType<ProjectPinsClient["list"]>>)=>void;client.list.mockImplementation(q=>"project_id" in q?Promise.resolve({items:[],next_cursor:null}):new Promise(r=>{page=r}))
 const view=renderHook(()=>useProjectPins({preview:false,boundary,visibleIds:["a","b"],client}));await waitFor(()=>expect(client.list).toHaveBeenCalledTimes(1))
 await act(()=>view.result.current.check("a"));await act(async()=>{page({items:[a],next_cursor:"more"});await Promise.resolve()})
 expect(view.result.current.targets.a).toMatchObject({status:"known",value:{is_pinned:false}});expect(view.result.current.targets.b).toBeUndefined();expect(view.result.current.nextCursor).toBe("more")
})
it("a same-actor visibility refresh cannot strand a settled write in pending",async()=>{
 const client=fixture(),props={preview:false,boundary,visibleIds:["a"] as readonly string[]|null,client}
 let done!:(v:Awaited<ReturnType<ProjectPinsClient["set"]>>)=>void;client.set.mockImplementation(()=>new Promise(r=>{done=r}))
 const view=renderHook(p=>useProjectPins(p),{initialProps:props});await waitFor(()=>expect(view.result.current.pinned).toEqual([a]))
 act(()=>void view.result.current.set("a",false));view.rerender({...props,visibleIds:null})
 await act(async()=>{done({project_id:"a",is_pinned:false,pinned_at:null});await Promise.resolve()})
 view.rerender(props)
 expect(view.result.current.targets.a).toMatchObject({status:"known",value:{is_pinned:false}})
 expect(view.result.current.pinned).toEqual([]);expect(client.set).toHaveBeenCalledTimes(1)
})
it("canonical Project ids that match Object prototype names still receive exact initial reads",async()=>{
 const client=fixture();client.list.mockResolvedValue({items:[],next_cursor:null})
 const view=renderHook(()=>useProjectPins({preview:false,boundary,visibleIds:["constructor"],client}));await waitFor(()=>expect(view.result.current.loaded).toBe(true))
 act(()=>view.result.current.ensure("constructor"));await waitFor(()=>expect(client.list).toHaveBeenCalledWith({project_id:"constructor"},expect.any(AbortSignal)))
})
it("a failed fresh first page retires its former continuation instead of proving old pins absent",async()=>{
 const client=fixture();client.list.mockResolvedValueOnce({items:[a],next_cursor:"c"}).mockRejectedValueOnce(new Error("refresh failed")).mockResolvedValue({items:[{project_id:"b",pinned_at:time}],next_cursor:null})
 const view=renderHook(()=>useProjectPins({preview:false,boundary,visibleIds:["a","b"],client}));await waitFor(()=>expect(view.result.current.nextCursor).toBe("c"))
 const staleMore=view.result.current.loadMore
 await act(async()=>{view.result.current.refresh();await Promise.resolve()})
 expect(view.result.current.failed).toBe(true);expect(view.result.current.nextCursor).toBeNull()
 await act(async()=>{staleMore();view.result.current.loadMore();await Promise.resolve()})
 expect(client.list).toHaveBeenCalledTimes(2);expect(view.result.current.pinned).toEqual([a])
})
