import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { afterEach,beforeEach,expect,it,vi } from "vitest"
const {currentProductSession}=vi.hoisted(()=>({currentProductSession:vi.fn()}))
vi.mock("@/lib/server/product-session",()=>({currentProductSession}))
import {GET,PUT} from "@/app/api/hub/[...path]/route"
let server:Server,calls:IncomingMessage[],bodies:string[],peer:(req:IncomingMessage,res:ServerResponse)=>void
const item={project_id:"project",pinned_at:"2026-10-27T00:00:00.000Z"}
const state={...item,is_pinned:true}
const reply=(req:IncomingMessage,res:ServerResponse,raw=JSON.stringify(req.method==="PUT"?{data:state}:{data:{items:[item],next_cursor:null}}),status=200)=>{const bytes=Buffer.from(raw);res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-request-id":String(req.headers["x-kokoro-request-id"]),"content-length":bytes.length});res.end(bytes)}
const ctx=(path:string[])=>({params:Promise.resolve({path})})
const put=(body='{"is_pinned":true}',headers:Record<string,string>={},signal?:AbortSignal)=>new Request("http://web.test/api/hub/projects/project/pin",{method:"PUT",headers:{origin:"http://web.test","content-type":"application/json",...headers},body,...(signal?{signal}:{})})
beforeEach(async () => {
  calls = [];
  bodies = [];
  peer = reply;
  currentProductSession
    .mockReset()
    .mockResolvedValue({
      access: "admitted-access",
      accessExpiresAt: Date.now() + 60000,
    });
  server = createServer((req, res) => {
    calls.push(req);
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (v) => {
      raw += v;
    });
    req.on("end", () => {
      bodies.push(raw);
      peer(req, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("not bound");
  for (const [k, v] of Object.entries({
    KOKORO_WEB_AUTH_SECRET: "a".repeat(32),
    KOKORO_WEB_REDIS_URL: "redis://unused.invalid/9",
    KOKORO_WEB_ORIGIN: "http://web.test",
    KOKORO_DOMAIN: "configured.product.test",
    KOKORO_BFF_BASE_URL: `http://127.0.0.1:${addr.port}`,
    KOKORO_INTERNAL_SECRET_WEB_BFF: "synthetic-secret",
  }))
    vi.stubEnv(k, v);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

it("rejects strip-self aliases before they can enter the generic proxy",async()=>{
 for(const path of [["self","projects","project","pin"],["self","self","project-pins"]]){
 const response=await (path.at(-1)==="pin"?PUT:GET)(new Request("http://web.test/api/hub/"+path.join("/"),path.at(-1)==="pin"?{method:"PUT",headers:{origin:"http://web.test","content-type":"application/json"},body:'{"is_pinned":true}'}:{}),ctx(path))
 expect(response.status).toBeGreaterThanOrEqual(400)
 }
 expect(calls).toHaveLength(0)
})
it("accepts the formal strict owner404 envelope instead of guessing unpinned",async()=>{
 peer=(req,res)=>reply(req,res,JSON.stringify({error:{code:"project_not_found",message:"hidden"},meta:{request_id:String(req.headers["x-kokoro-request-id"])}}),404)
 const result=await GET(new Request("http://web.test/api/hub/self/project-pins?project_id=project"),ctx(["self","project-pins"]))
 expect(result.status).toBe(404);expect((await result.json()).error.code).toBe("project_not_found")
})
it("sends only the original PUT bytes and trusted Session authority; list/exact GET remain canonical",async()=>{
 const raw=' {"is_pinned": true}\n',result=await PUT(put(raw,{authorization:"Bearer forged","x-kokoro-subject":"forged",forwarded:"host=forged.invalid"}),ctx(["projects","project","pin"]))
 expect(result.status).toBe(200);expect(bodies).toEqual([raw]);expect(calls[0]?.url).toBe("/v1/projects/project/pin");expect(calls[0]?.headers.authorization).toBe("Bearer admitted-access");expect(calls[0]?.headers["x-kokoro-subject"]).toBeUndefined();expect(calls[0]?.headers.forwarded).toBe("host=configured.product.test");expect(calls[0]?.headers["content-length"]).toBe(String(Buffer.byteLength(raw)));expect(calls[0]?.headers["transfer-encoding"]).toBeUndefined();expect(calls[0]?.headers["idempotency-key"]).toBeUndefined()
 const get=await GET(new Request("http://web.test/api/hub/self/project-pins?limit=50"),ctx(["self","project-pins"]));expect(get.status).toBe(200);expect(calls[1]?.url).toBe("/v1/self/project-pins?limit=50")
})
it("rejects mixed/duplicate query, command headers, extra JSON and CSRF with zero upstream",async()=>{
 for(const query of ["project_id=project&limit=50","project_id=project&project_id=other","limit=01","limit=101","cursor=","actor=forged","__proto__=forged"]){const result=await GET(new Request("http://web.test/api/hub/self/project-pins?"+query),ctx(["self","project-pins"]));expect(result.status).toBe(400)}
 for(const request of [put('{"is_pinned":true,"actor":"forged"}'),put('{"is_pinned":true,"is_pinned":false}'),put(undefined,{"idempotency-key":"no"}),put(undefined,{"if-match":"no"}),put(undefined,{origin:"http://foreign.invalid"}),put(' '.repeat(1025))])expect((await PUT(request,ctx(["projects","project","pin"]))).status).toBeGreaterThanOrEqual(400)
 expect(calls).toHaveLength(0)
})
it("does not turn legacy/malformed owner errors or a wrong ACK into pin state",async()=>{
 peer=(req,res)=>reply(req,res,JSON.stringify({error:{code:"project_not_found",message:"hidden",retryable:false}}),404)
 expect((await GET(new Request("http://web.test/api/hub/self/project-pins?project_id=project"),ctx(["self","project-pins"]))).status).toBe(502)
 peer=(req,res)=>reply(req,res,JSON.stringify({data:{...state,project_id:"other"}}))
 expect((await PUT(put(),ctx(["projects","project","pin"]))).status).toBe(502)
})
it("pre-aborted requests never dispatch and denied local Session uses the canonical error envelope",async()=>{
 const abort=new AbortController();abort.abort();expect((await PUT(put(undefined,{},abort.signal),ctx(["projects","project","pin"]))).status).toBe(503);expect(calls).toHaveLength(0)
 currentProductSession.mockResolvedValue(null);const result=await GET(new Request("http://web.test/api/hub/self/project-pins"),ctx(["self","project-pins"]));expect(result.status).toBe(401);expect(await result.json()).toEqual({error:{code:"session_authentication_required",message:"session_authentication_required"},meta:{request_id:result.headers.get("x-request-id")}})
})
