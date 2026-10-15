import { describe,it,expect,vi,afterEach } from "vitest";
import { parseArchivedTasksJson } from "@/lib/archived-tasks-json";
import { archiveIdAvailable, validateArchiveState,validateArchivedTasks,archivedTasksCursor } from "@/lib/archived-tasks.schema";
import {readArchivedTasks,readArchiveState,writeArchiveState} from "@/ui/settings/archived-tasks-client";
const at="2026-10-15T00:00:00.000Z";
const item={session_id:"历史/😀",title:" \u0000 legacy ",archived_at:at,project_ref:null};
const cursor=(patch={})=>`arc1_${Buffer.from(JSON.stringify({kind:"archived_tasks",tenantId:"tenant",subjectId:"alice",limit:100,archivedAt:at,sessionId:item.session_id,...patch})).toString("base64url")}`;
const response=(raw:unknown,status=200)=>Response.json(raw,{status,headers:{"cache-control":"no-store","x-request-id":"req"}});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("archive raw owner boundary",()=>{
 it("keeps historical title/ID bytes and validates action and exact target",()=>{
  expect(validateArchivedTasks({raw:{data:{items:[item],next_cursor:cursor()}},subject:"alice",limit:100}).data.items[0]).toEqual(item);
  expect(validateArchiveState({raw:{data:{session_id:item.session_id,archived_at:at}},id:item.session_id,action:"archive"}).archived_at).toBe(at);
  expect(()=>validateArchiveState({raw:{data:{session_id:"other",archived_at:at}},id:item.session_id})).toThrow();
  expect(()=>validateArchiveState({raw:{data:{session_id:item.session_id,archived_at:null}},id:item.session_id,action:"archive"})).toThrow();
  expect(()=>validateArchiveState({raw:{data:{session_id:item.session_id,archived_at:at}},id:item.session_id,action:"restore"})).toThrow();
 });
 it.each(['{"data":{},"da\\u0074a":{}}','{"data":{"session_id":"x","session_id":"y"}}','{} trailing','\uFEFF{}'])("rejects raw duplicate/trailing/BOM %s",text=>{expect(()=>parseArchivedTasksJson(text)).toThrow();});
 it("rejects nested unknowns before generated stripping and impossible timestamps",()=>{
  for(const raw of [{data:{items:[{...item,token:"secret"}],next_cursor:null}},{data:{items:[{...item,archived_at:"2026-02-30T00:00:00.000Z"}],next_cursor:null}},{data:{items:[item,item],next_cursor:null}},{data:{items:[],next_cursor:cursor()}}])expect(()=>validateArchivedTasks({raw:raw,subject:"alice",limit:100})).toThrow();
  expect(()=>validateArchiveState({raw:{data:{session_id:"x",archived_at:null,token:"no"}},id:"x"})).toThrow();
 });
 it("requires cursor identity, limit, anchor and C byte order",()=>{
  expect(()=>archivedTasksCursor({value:cursor({subjectId:"bob"}),subject:"alice",limit:100,tenant:"tenant"})).toThrow();
  expect(()=>archivedTasksCursor({value:cursor(),subject:"alice",limit:20,tenant:"tenant"})).toThrow();
  expect(()=>archivedTasksCursor({value:cursor(),subject:"alice",limit:100,tenant:"other"})).toThrow();
  expect(()=>validateArchivedTasks({raw:{data:{items:[item],next_cursor:cursor({sessionId:"wrong"})}},subject:"alice",limit:100})).toThrow();
  const a={...item,session_id:"z"},b={...item,session_id:"ä"};
  expect(validateArchivedTasks({raw:{data:{items:[a,b],next_cursor:null}},subject:"alice",limit:100}).data.items).toHaveLength(2);
  expect(()=>validateArchivedTasks({raw:{data:{items:[b,a],next_cursor:null}},subject:"alice",limit:100})).toThrow();
 });
});
describe("archive browser transport",()=>{
 it("uses normal generated four-operation boundary, same-origin no-store and redirect:error",async()=>{
  const fetch=vi.fn<typeof globalThis.fetch>().mockImplementation(async(input,init)=>response(String(input).includes("archived-tasks")?{data:{items:[item],next_cursor:null}}:{data:{session_id:item.session_id,archived_at:init?.method==="POST"&&String(input).endsWith("restore")?null:at}}));vi.stubGlobal("fetch",fetch);
  expect((await readArchivedTasks({subject:"alice"})).data.items).toEqual([item]);
  await readArchiveState({id:item.session_id});await writeArchiveState({id:item.session_id,action:"archive"});await writeArchiveState({id:item.session_id,action:"restore"});
  expect(fetch).toHaveBeenCalledTimes(4);
  for(const [,options] of fetch.mock.calls)expect(options).toMatchObject({cache:"no-store",credentials:"same-origin",redirect:"error",signal:expect.any(AbortSignal)});
  expect(fetch.mock.calls[2]?.[0]).toBe(`/api/session/sessions/${encodeURIComponent(item.session_id)}/archive`);
  expect(fetch.mock.calls[2]?.[1]?.body).toBe("{}");
  expect(fetch.mock.calls[2]?.[1]?.headers).toMatchObject({"idempotency-key":expect.any(String)});
 });
 it.each([".","..","\ud800"])("refuses unaddressable ID before any fetch %s",async id=>{const fetch=vi.fn();vi.stubGlobal("fetch",fetch);expect(archiveIdAvailable(id)).toBe(false);await expect(readArchiveState({id})).rejects.toBeDefined();expect(fetch).not.toHaveBeenCalled();});
 it("retains formal404 as unknown/missing evidence rather than unarchived",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({error:{code:"session_not_found",message:"safe",retryable:false}},404)));await expect(readArchiveState({id:"history"})).rejects.toMatchObject({status:404});});
 it("rejects successful wrong-action ACK without retry",async()=>{const fetch=vi.fn().mockResolvedValue(response({data:{session_id:"x",archived_at:null}}));vi.stubGlobal("fetch",fetch);await expect(writeArchiveState({id:"x",action:"archive"})).rejects.toBeDefined();expect(fetch).toHaveBeenCalledTimes(1);});
 it("has an absolute fetch deadline and cancels a late response body",async()=>{
  vi.useFakeTimers();let resolve!:(r:Response)=>void;const fetch=vi.fn(()=>new Promise<Response>(yes=>{resolve=yes;}));vi.stubGlobal("fetch",fetch);
  const operation=readArchiveState({id:"x"});const rejected=expect(operation).rejects.toBeDefined();await vi.advanceTimersByTimeAsync(10001);await rejected;
  const cancel=vi.fn();resolve(new Response(new ReadableStream({cancel})));await vi.advanceTimersByTimeAsync(0);expect(cancel).toHaveBeenCalled();
 });
 it("cancels noncooperative body and releases the owned lock on caller abort",async()=>{
  const cancel=vi.fn(()=>new Promise<void>(()=>{}));const stream=new ReadableStream<Uint8Array>({cancel});vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(stream,{headers:{"content-type":"application/json","cache-control":"no-store","x-request-id":"req"}})));
  const controller=new AbortController();const operation=readArchiveState({id:"x",signal:controller.signal});const rejected=expect(operation).rejects.toBeDefined();await Promise.resolve();await Promise.resolve();controller.abort();await rejected;expect(cancel).toHaveBeenCalled();expect(stream.locked).toBe(false);
 });
});
