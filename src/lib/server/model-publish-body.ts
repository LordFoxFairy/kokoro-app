/** Next represents even a zero-byte POST as a stream. Prove emptiness, not object nullness. */
export async function emptyModelPublishBody(request:Request):Promise<boolean>{
 if(request.signal.aborted || request.headers.has("content-type") || request.headers.has("transfer-encoding") || ![null,"0"].includes(request.headers.get("content-length")))return false;
 if(request.body===null)return true;
 const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new AbortController(),signal=AbortSignal.any([request.signal,deadline.signal]);
 let abort:()=>void=()=>undefined;
 try{
  const aborted=new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener("abort",abort,{once:true});});
  timer=setTimeout(()=>deadline.abort(new DOMException("Empty body deadline","TimeoutError")),10_000);
  if(signal.aborted)abort();
  while(true){const part=await Promise.race([reader.read(),aborted]);if(part.done)return !signal.aborted;if(part.value.byteLength!==0)return false;}
 }catch{return false;}finally{if(timer)clearTimeout(timer);signal.removeEventListener("abort",abort);void reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
