import { beforeEach,afterEach,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({currentProductSession:vi.fn(),requestWithDomain:vi.fn(),oidcRpConfig:vi.fn()}));
vi.mock("@/lib/server/product-session",()=>({currentProductSession:mocks.currentProductSession}));
vi.mock("@/lib/server/upstream-http",()=>({requestWithDomain:mocks.requestWithDomain}));
vi.mock("@/lib/server/oidc-provider",()=>({oidcRpConfig:mocks.oidcRpConfig}));
import {GET} from "@/app/api/account/archived-tasks/route";
import {sessionArchive} from "@/lib/server/session-archive";
const claims={id:"opaque",generation:1,subject:"alice",access:"server-only",accessExpiresAt:Date.now()+600000,expiresAt:Date.now()+600000};
const at="2026-10-15T00:00:00.000Z";
const req=(method="GET",id="历史/😀",action="archive",body?:string)=>new Request(`http://web.test/api/session/sessions/${encodeURIComponent(id)}/${action}`,{method,headers:{host:"web.test",...(method==="POST"?{origin:"http://web.test","content-type":"application/json","idempotency-key":"qa-key"}:{})},...(body===undefined?{}:{body})});
const call=(request:Request,id="历史/😀",action="archive")=>sessionArchive(request,Promise.resolve({path:["sessions",id,action]}));
beforeEach(()=>{
 vi.resetAllMocks();for(const [key,value]of Object.entries({KOKORO_BFF_BASE_URL:"http://bff.test",KOKORO_WEB_ORIGIN:"http://web.test",KOKORO_WEB_REDIS_URL:"redis://fixture/0",KOKORO_WEB_AUTH_SECRET:"at-least-thirty-two-characters-secret",KOKORO_DOMAIN:"product.test"}))vi.stubEnv(key,value);
 mocks.currentProductSession.mockResolvedValue(claims);mocks.oidcRpConfig.mockReturnValue({tenantId:"tenant"});
 mocks.requestWithDomain.mockImplementation(async(url,_d,options)=>Response.json(String(url).includes("archived-tasks")?{data:{items:[],next_cursor:null}}:{data:{session_id:"历史/😀",archived_at:String(url).endsWith("restore")?null:at}},{headers:{"cache-control":"no-store","x-request-id":options.headers.get("x-kokoro-request-id")}}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it("returns private list and state after full session recheck with server-only bearer",async()=>{
 const list=await GET(new Request("http://web.test/api/account/archived-tasks?limit=100",{headers:{host:"web.test"}}));expect(list.status).toBe(200);expect(list.headers.get("cache-control")).toContain("no-store");
 expect((await call(req())).status).toBe(200);expect(mocks.currentProductSession).toHaveBeenCalledTimes(4);expect(mocks.requestWithDomain.mock.calls[1]?.[2].headers.get("authorization")).toBe("Bearer server-only");
 expect(mocks.requestWithDomain.mock.calls[1]?.[0]).toBe(`http://bff.test/v1/sessions/${encodeURIComponent("历史/😀")}/archive`);
});
it.each(["archive","restore"])("POST %s requires exact {}, target/action ACK and preserves key",async action=>{const response=await call(req("POST","历史/😀",action,"{}"),"历史/😀",action);expect(response.status).toBe(200);expect(mocks.requestWithDomain.mock.calls[0]?.[2].headers.get("idempotency-key")).toBe("qa-key");expect(await response.json()).toEqual({data:{session_id:"历史/😀",archived_at:action==="restore"?null:at}});});
it.each(["{\"extra\":true}","{\"x\":1,\"x\":1}","\uFEFF{}","[]","{} trailing"])("refuses raw body %s before owner write",async body=>{expect((await call(req("POST","历史/😀","archive",body))).status).toBe(400);expect(mocks.requestWithDomain).not.toHaveBeenCalled();});
it.each(["id","generation","subject","access","accessExpiresAt","expiresAt"])("retires response on final %s change",async key=>{mocks.currentProductSession.mockResolvedValueOnce(claims).mockResolvedValueOnce({...claims,[key]:typeof claims[key as keyof typeof claims]==="number"?2:"changed"});expect((await call(req())).status).toBe(401);});
it("requires Origin+scheme for writes and rejects GET restore",async()=>{
 const r=req("POST","历史/😀","archive","{}");r.headers.delete("origin");expect((await call(r)).status).toBe(403);
 expect((await call(new Request("https://web.test/api/session/sessions/x/archive",{method:"POST",headers:{host:"web.test",origin:"http://web.test"}}),"x")).status).toBe(403);
 expect((await call(req("GET","历史/😀","restore"),"历史/😀","restore")).status).toBe(405);expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
it("rejects wrong target, action, nested unknown and status tuple",async()=>{
 for(const raw of [{data:{session_id:"other",archived_at:at}},{data:{session_id:"历史/😀",archived_at:null}},{data:{session_id:"历史/😀",archived_at:at,token:"no"}}]){
 mocks.requestWithDomain.mockImplementationOnce(async(_u,_d,o)=>Response.json(raw,{headers:{"cache-control":"no-store","x-request-id":o.headers.get("x-kokoro-request-id")}}));expect((await call(req("POST","历史/😀","archive","{}"))).status).toBe(502);}
});
it("includes uncooperative params/body/session in one absolute deadline, no late owner write",async()=>{
 vi.useFakeTimers();let resolve!:(v:{path:string[]})=>void;const pending=new Promise<{path:string[]}>(yes=>{resolve=yes});const op=sessionArchive(req("POST","历史/😀","archive","{}"),pending);await vi.advanceTimersByTimeAsync(10001);expect((await op).status).toBe(503);resolve({path:["sessions","历史/😀","archive"]});await vi.advanceTimersByTimeAsync(0);expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
it("EOF input cancellation releases a hanging owned request stream",async()=>{
 vi.useFakeTimers();const cancel=vi.fn(()=>new Promise<void>(()=>{})),body=new ReadableStream<Uint8Array>({cancel});const request=new Request("http://web.test/api/session/sessions/x/archive",{method:"POST",headers:{host:"web.test",origin:"http://web.test","content-type":"application/json","idempotency-key":"qa"},body,duplex:"half"} as RequestInit);
 const op=call(request,"x");await vi.advanceTimersByTimeAsync(10001);expect((await op).status).toBe(503);expect(cancel).toHaveBeenCalled();expect(body.locked).toBe(false);expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
it("late fetch/body cannot deliver a stale success after abort",async()=>{
 let resolve!:(r:Response)=>void;mocks.requestWithDomain.mockReturnValue(new Promise<Response>(yes=>{resolve=yes}));const controller=new AbortController();const original=req();const op=call(new Request(original,{signal:controller.signal}));await Promise.resolve();await Promise.resolve();controller.abort();expect((await op).status).toBe(503);const cancel=vi.fn();resolve(new Response(new ReadableStream({cancel})));await new Promise(r=>setTimeout(r,0));expect(cancel).toHaveBeenCalled();
});
it.each([
 {"content-encoding":"identity"},
 {"transfer-encoding":"chunked"},
 {"content-encoding":"identity","transfer-encoding":"chunked"},
])("accepts supported input framing %j and consumes exact JSON through EOF",async framing=>{
 const request=req("POST","历史/😀","archive","{}");
 for(const [name,value]of Object.entries(framing))request.headers.set(name,value!);
 expect((await call(request)).status).toBe(200);
 expect(mocks.requestWithDomain).toHaveBeenCalledTimes(1);
 expect(new TextDecoder().decode(mocks.requestWithDomain.mock.calls[0]?.[2].body)).toBe("{}");
});
it.each([
 {"content-encoding":"gzip"},
 {"content-encoding":"identity, identity"},
 {"transfer-encoding":"gzip, chunked"},
 {"transfer-encoding":"chunked","content-length":"2"},
])("rejects unsupported encoding or conflicting framing %j before owner dispatch",async framing=>{
 const request=req("POST","历史/😀","archive","{}");
 for(const [name,value]of Object.entries(framing))request.headers.set(name,value!);
 expect((await call(request)).status).toBe(400);
 expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
it("checks actual chunked input bytes rather than trusting framing headers",async()=>{
 const request=req("POST","历史/😀","archive","{}"+" ".repeat(4095));request.headers.set("transfer-encoding","chunked");
 expect((await call(request)).status).toBe(400);expect(mocks.requestWithDomain).not.toHaveBeenCalled();
});
