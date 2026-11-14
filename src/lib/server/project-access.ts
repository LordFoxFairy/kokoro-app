import { productBffConfig, nativeSessionBffHeaders } from "./product-bff"
import { requestWithDomain, readBoundedRequestBody } from "./upstream-http"
import { sameOriginOk } from "./same-origin"
/** Four exact operations; identity and all access decisions remain at BFF. */
export async function proxyProjectAccess(request:Request,path:readonly string[]):Promise<Response>{
 const requestId=crypto.randomUUID(), headers={"cache-control":"private, no-store","x-request-id":requestId}
 const fail=(status:number,code:string)=>Response.json({error:{code,message:code},meta:{request_id:requestId}},{status,headers})
 if(path[0]!=="projects"||!path[1]||!['access','grants'].includes(path[2]??'')||path.length<3||path.length>4||path[2]==="access"&&path.length!==3)return fail(404,"bff_route_not_found")
 const write=path.length===4&&path[2]==="grants"&&["PUT","DELETE"].includes(request.method)
 if(!write&&!(request.method==="GET"&&path.length===3))return fail(405,"method_not_allowed")
 if(write&&!sameOriginOk(request))return fail(403,"session_forbidden")
 const config=productBffConfig();if(!config)return fail(503,"project_access_unavailable")
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10000)])
 try{
  const auth=nativeSessionBffHeaders(request,config,requestId);if(auth.state!=="valid")return fail(401,"session_authentication_required");const outgoing=auth.headers;outgoing.set("accept","application/json")
  for(const name of ["idempotency-key","if-match","content-type"]){const value=request.headers.get(name);if(value!==null)outgoing.set(name,value)}
  const body=write&&request.method==="PUT"?await readBoundedRequestBody(request,65536,signal):undefined
  if(body===undefined&&request.body!==null)await readBoundedRequestBody(request,0,signal)
  const upstream=await requestWithDomain(`${config.bffBaseUrl.replace(/\/$/u,"")}/v1/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`,config.domain,{method:request.method,headers:outgoing,signal,timeoutMs:10000,maxResponseBytes:1048576,...(body===undefined?{}:{body})})
  signal.throwIfAborted();const data=await upstream.arrayBuffer();signal.throwIfAborted()
  if(!/\bno-store\b/iu.test(upstream.headers.get("cache-control")??"")||!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(upstream.headers.get("content-type")??"")||!upstream.headers.get("x-request-id"))return fail(502,"project_access_response_invalid")
  return new Response(data,{status:upstream.status,headers:{...headers,"content-type":"application/json","x-request-id":upstream.headers.get("x-request-id")!}})
 }catch{return fail(503,"project_access_unavailable")}
}
