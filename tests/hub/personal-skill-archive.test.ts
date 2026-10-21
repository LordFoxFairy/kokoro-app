import { File } from "node:buffer"
import { afterEach, expect, it, vi } from "vitest"
import { downloadManagedSkillArchive } from "@/hub/personal-skill-archive"
const handle = "a".repeat(43), target = { skill_id: "old", revision: "1", archive_size: "3" }
const headers = { "cache-control": "no-store", "x-request-id": "archive-request", "content-type": "application/zip", "content-length": "3", "content-disposition": 'attachment; filename="original.zip"' }
const qualification = () => Response.json({data:{source_ref:"skill:old",revision:"1",download_info:{download_url:`/skill-downloads/${handle}`,filename:"original.zip",expires_at:"2999-01-01T00:00:00Z"}}},{headers:{"cache-control":"no-store","x-request-id":"qualified","content-type":"application/json"}})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
it("uses the publisher exact endpoint and preserves non-text archive bytes",async()=>{
 vi.stubGlobal("File",File)
 const fetcher=vi.fn().mockResolvedValueOnce(qualification()).mockResolvedValueOnce(new Response(new Uint8Array([0,255,80]),{headers}));vi.stubGlobal("fetch",fetcher)
 const file=await downloadManagedSkillArchive(target)
 expect(fetcher.mock.calls[0]?.[0]).toBe("/api/hub/self/skills/managed/old/download")
 expect(fetcher.mock.calls[0]?.[1]).toMatchObject({method:"POST",redirect:"error",credentials:"same-origin"})
 expect(fetcher.mock.calls[1]?.[0]).toBe(`/api/skill-downloads/${handle}`)
 expect(file.name).toBe("skill-history.zip");expect(file.size).toBe(3)
 expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0,255,80]))
})
it.each(["short","long","gzip","wrong-size"])("rejects %s archive instead of creating another content snapshot",async variant=>{
 const body=variant==="short"?new Uint8Array([0,255]):variant==="long"?new Uint8Array([0,255,80,1]):new Uint8Array([0,255,80])
 const fetcher=vi.fn().mockResolvedValueOnce(qualification()).mockResolvedValueOnce(new Response(body,{headers:{...headers,...(variant==="gzip"?{"content-encoding":"gzip"}:{}),...(variant==="wrong-size"?{"content-length":"4"}:{})}}));vi.stubGlobal("fetch",fetcher)
 await expect(downloadManagedSkillArchive(target)).rejects.toMatchObject({reason:"parse"})
})
it("bounds an unclosed stream and cancels it on the total deadline",async()=>{
 vi.useFakeTimers();const cancel=vi.fn()
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(qualification()).mockResolvedValueOnce(new Response(new ReadableStream({cancel}),{headers})))
 const result=downloadManagedSkillArchive(target).catch(error=>error)
 await vi.advanceTimersByTimeAsync(10_001)
 expect(await result).toMatchObject({reason:"network"});expect(cancel).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0)
})
it("rejects a qualification for another revision before retrieving any bytes",async()=>{
 const response=qualification(),raw=await response.json();raw.data.revision="2"
 const fetcher=vi.fn().mockResolvedValue(Response.json(raw,{headers:response.headers}));vi.stubGlobal("fetch",fetcher)
 await expect(downloadManagedSkillArchive(target)).rejects.toMatchObject({reason:"parse"});expect(fetcher).toHaveBeenCalledOnce()
})
it("retires a late binary response after caller cancellation and releases its body",async()=>{
 const caller=new AbortController(),cancel=vi.fn();let finish!:(response:Response)=>void
 const fetcher=vi.fn().mockResolvedValueOnce(qualification()).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));vi.stubGlobal("fetch",fetcher)
 const result=downloadManagedSkillArchive(target,caller.signal).catch(error=>error)
 await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));caller.abort()
 expect(await result).toMatchObject({reason:"aborted"})
 finish(new Response(new ReadableStream({cancel}),{headers}));await vi.waitFor(()=>expect(cancel).toHaveBeenCalledOnce())
})
it.each(["33554433","3\n","0"])("rejects invalid archive size %s before qualification",async archive_size=>{
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher)
 await expect(downloadManagedSkillArchive({...target,archive_size})).rejects.toMatchObject({reason:"parse"});expect(fetcher).not.toHaveBeenCalled()
})
