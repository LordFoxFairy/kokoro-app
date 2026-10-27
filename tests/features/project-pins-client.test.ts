import {afterEach,expect,it,vi} from "vitest"
import {createProjectPinsClient} from "@/features/app/project-pins"
const item={project_id:"p",pinned_at:"2026-10-27T00:00:00.000Z"}
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"private, no-store","x-request-id":"request"}})
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
it("uses only exact same-origin GET/PUT with no key or identity and binds ACK state",async()=>{
 const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(response({data:{items:[item],next_cursor:null}})).mockResolvedValueOnce(response({data:{...item,is_pinned:true}}))
 const client=createProjectPinsClient()
 expect(await client.list({project_id:"p"})).toEqual({items:[item],next_cursor:null});expect(await client.set("p",true)).toEqual({...item,is_pinned:true})
 expect(fetch.mock.calls[0]?.[0]).toBe("/api/hub/self/project-pins?project_id=p")
 expect(fetch.mock.calls[1]?.[0]).toBe("/api/hub/projects/p/pin")
 const init=fetch.mock.calls[1]?.[1];expect(init?.body).toBe('{"is_pinned":true}');expect(new Headers(init?.headers).has("idempotency-key")).toBe(false)
 expect(init?.credentials).toBe("same-origin");expect(init?.redirect).toBe("error")
})
it.each([
 {data:{project_id:"wrong",is_pinned:true,pinned_at:item.pinned_at}},
 {data:{...item,is_pinned:false}},
 {data:{project_id:"p",is_pinned:true,pinned_at:null}},
 {data:{...item,is_pinned:true,extra:"SECRET_CANARY"}},
])("rejects a malformed/mismatched pin ACK without exposing its payload or replaying",async value=>{
 const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(response(value))
 let error:unknown;try{await createProjectPinsClient().set("p",true)}catch(value){error=value}
 expect(error).toBeInstanceOf(Error);expect(String(error)).not.toContain("SECRET_CANARY");expect(fetch).toHaveBeenCalledTimes(1)
})
it("does not accept an exact read for another target or an incomplete exact page",async()=>{
 const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(response({data:{items:[item],next_cursor:null}})).mockResolvedValueOnce(response({data:{items:[],next_cursor:"more"}}))
 const client=createProjectPinsClient();await expect(client.list({project_id:"q"})).rejects.toThrow();await expect(client.list({project_id:"p"})).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(2)
})
it("recognizes only a complete canonical404 bound to its request header",async()=>{
 vi.spyOn(globalThis,"fetch").mockResolvedValue(response({error:{code:"project_not_found",message:"hidden"},meta:{request_id:"request"}},404))
 await expect(createProjectPinsClient().list({project_id:"p"})).rejects.toMatchObject({reason:"http",status:404,code:"project_not_found"})
})
it("the total deadline includes a stalled body and never retries a write",async()=>{
 vi.useFakeTimers();const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"data":'))}}),{headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"request"}}))
 const operation=createProjectPinsClient().set("p",true);const rejected=expect(operation).rejects.toThrow();await vi.advanceTimersByTimeAsync(10001);await rejected;expect(fetch).toHaveBeenCalledTimes(1)
})
it("caller cancellation before dispatch is zero fetch",async()=>{
 const fetch=vi.spyOn(globalThis,"fetch"),abort=new AbortController();abort.abort();await expect(createProjectPinsClient().list({},abort.signal)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled()
})
