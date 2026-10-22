import {createRequire} from "node:module"
import {expect,it,vi} from "vitest"
const originalTestFetch=globalThis.fetch
const {withNextVersionCheckDeadline}=createRequire(import.meta.url)("./fixtures/next-version-check.cjs") as {
 withNextVersionCheckDeadline:(nativeFetch:typeof fetch,timeout?:(milliseconds:number)=>AbortSignal)=>typeof fetch
}
const versionUrl="https://registry.npmjs.org/-/package/next/dist-tags"
it("does not replace the parent test process fetch when the child preloader module is imported",()=>{
 expect(globalThis.fetch).toBe(originalTestFetch)
})
it("adds a one-second deadline only to the exact Next version URL, preserving native result and original options",()=>{
 const result=Promise.resolve(new Response("native")),native=vi.fn<typeof fetch>().mockReturnValue(result)
 const deadline=new AbortController(),timeout=vi.fn().mockReturnValue(deadline.signal)
 const bounded=withNextVersionCheckDeadline(native,timeout),headers={accept:"application/json"},init={headers,cache:"no-store" as const}
 expect(bounded(versionUrl,init)).toBe(result)
 expect(timeout).toHaveBeenCalledExactlyOnceWith(1000)
 const options=native.mock.calls[0]?.[1]
 expect(options).toMatchObject(init);expect(options?.headers).toBe(headers)
 expect(options?.signal).toBe(deadline.signal)
})
it.each(["https://iam.fixture/v1/skill.list","https://registry.npmjs.org/-/package/next/dist-tags?probe=1","https://registry.npmjs.org/-/package/next/dist-tags/","https://foreign.invalid/-/package/next/dist-tags"])("forwards other URL arguments and signal unchanged: %s",url=>{
 const result=Promise.resolve(new Response("native")),native=vi.fn<typeof fetch>().mockReturnValue(result),timeout=vi.fn()
 const bounded=withNextVersionCheckDeadline(native,timeout),init={signal:new AbortController().signal,headers:{authorization:"Bearer fixture-native"}}
 expect(bounded(url,init)).toBe(result)
 expect(native).toHaveBeenCalledExactlyOnceWith(url,init)
 expect(native.mock.calls[0]?.[1]).toBe(init);expect(timeout).not.toHaveBeenCalled()
})
it("preserves omitted options and the native fetch receiver for unrelated requests",()=>{
 const receiver={marker:true},result=Promise.resolve(new Response("native"))
 const native=vi.fn(function(this:unknown){expect(this).toBe(receiver);return result})
 const bounded=withNextVersionCheckDeadline(native as typeof fetch)
 expect(Reflect.apply(bounded,receiver,["https://bff.fixture/v1/skill.list"])).toBe(result)
 expect(native.mock.calls[0]).toEqual(["https://bff.fixture/v1/skill.list"])
})
it.each(["init","request"])("keeps the original %s abort effective while adding the version deadline",kind=>{
 const original=new AbortController(),deadline=new AbortController()
 const native=vi.fn<typeof fetch>().mockResolvedValue(new Response("native"))
 const bounded=withNextVersionCheckDeadline(native,()=>deadline.signal)
 if(kind==="request")void bounded(new Request(versionUrl,{signal:original.signal}))
 else void bounded(versionUrl,{signal:original.signal})
 const signal=native.mock.calls[0]?.[1]?.signal
 expect(signal).toBeDefined();expect(signal?.aborted).toBe(false)
 original.abort();expect(signal?.aborted).toBe(true)
})
it("retains the native Request input and a timeout failure instead of fabricating a version response",async()=>{
 const deadline=new AbortController(),input=new Request(versionUrl)
 const native=vi.fn<typeof fetch>().mockImplementation((_input,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener("abort",()=>reject(init.signal?.reason),{once:true})))
 const bounded=withNextVersionCheckDeadline(native,()=>deadline.signal)
 const result=bounded(input),failure=new DOMException("Version check timed out","TimeoutError")
 deadline.abort(failure);await expect(result).rejects.toBe(failure)
 expect(native.mock.calls[0]?.[0]).toBe(input)
})

it("copies the preloader into only the child sandbox and retains heap flags plus the JSON diagnostic probe",async()=>{
 const {mkdtemp,readFile,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path")
 const {nextFixtureEnvironment}=await import("./fixtures/next-fixture-environment")
 const root=await mkdtemp(join(tmpdir(),"kokoro-next-version-env-"))
 const original: NodeJS.ProcessEnv={NODE_ENV:"test",NODE_OPTIONS:"--max-old-space-size=4096 --require=/fixture/json-parse-diagnostic.cjs",PRESERVED:"same"}
 const parentOptions=process.env.NODE_OPTIONS,parentMarker=process.env.KOKORO_TEST_NEXT_VERSION_CHECK_DEADLINE
 try{
  const child=await nextFixtureEnvironment(root,original)
  expect(child.NODE_OPTIONS).toContain("--max-old-space-size=4096")
  expect(child.PRESERVED).toBe("same");expect(child.KOKORO_TEST_NEXT_VERSION_CHECK_DEADLINE).toBe("1")
  expect(await readFile(join(root,"next-version-check.cjs"),"utf8")).toBe(await readFile(join(process.cwd(),"tests/system/fixtures/next-version-check.cjs"),"utf8"))
  expect(original).not.toHaveProperty("KOKORO_TEST_NEXT_VERSION_CHECK_DEADLINE")
  expect(process.env.NODE_OPTIONS).toBe(parentOptions);expect(process.env.KOKORO_TEST_NEXT_VERSION_CHECK_DEADLINE).toBe(parentMarker)
  expect(globalThis.fetch).toBe(originalTestFetch)
 }finally{await rm(root,{recursive:true,force:true})}
})

it("loads every quoted and relative preloader in the actual child after Next native option propagation",async()=>{
 const {mkdtemp,writeFile,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path")
 const {execFile}=await import("node:child_process"),{promisify}=await import("node:util")
 const {nextFixtureEnvironment}=await import("./fixtures/next-fixture-environment")
 const root=await mkdtemp(join(tmpdir(),"kokoro next preload "))
 try{
  const first=join(root,"first diagnostic.cjs")
  await writeFile(first,'globalThis.fixturePreloads = ["first"]\n')
  await writeFile(join(root,"second.cjs"),'globalThis.fixturePreloads.push("second"); globalThis.fixtureNativeFetch = globalThis.fetch\n')
  const env=await nextFixtureEnvironment(root,{...process.env,NODE_OPTIONS:`--max-old-space-size=1536 --trace-warnings --require=${JSON.stringify(first)} --require ./second.cjs`,PRESERVED:"same"})
  const utils=createRequire(import.meta.url).resolve("next/dist/server/lib/utils")
  const probe=`process.stdout.write(JSON.stringify({preloads:globalThis.fixturePreloads ?? null,versionWrapped:globalThis.fetch !== globalThis.fixtureNativeFetch,preserved:process.env.PRESERVED,flags:require(${JSON.stringify(utils)}).getParsedNodeOptions()}))`
  // This is the same parse -> format -> fork boundary used by next dev. The
  // grandchild has fresh globals, so success proves actual loading, not strings.
  const launcher=`const utils=require(${JSON.stringify(utils)}); const flags=utils.formatNodeOptions(utils.getParsedNodeOptions()); const child=require("node:child_process").spawnSync(process.execPath,[...flags.execArgv,"-e",${JSON.stringify(probe)}],{cwd:process.cwd(),env:{...process.env,NODE_OPTIONS:flags.nodeOptions},encoding:"utf8"}); if(child.status !== 0) throw new Error(child.stderr); process.stdout.write(child.stdout)`
  const launcherPath=join(root,"launcher.cjs")
  await writeFile(launcherPath,launcher)
  const {stdout}=await promisify(execFile)(process.execPath,[launcherPath],{cwd:root,env})
  expect(JSON.parse(stdout)).toMatchObject({preloads:["first","second"],versionWrapped:true,preserved:"same",flags:{"max-old-space-size":"1536","trace-warnings":true}})
 }finally{await rm(root,{recursive:true,force:true})}
})

it("keeps EOF observations content-free and strips webpack loader query paths",async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,readdir,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path")
 const {execFile}=await import("node:child_process"),{promisify}=await import("node:util")
 const root=await mkdtemp(join(tmpdir(),"kokoro-eof-observation-"))
 try{
  await mkdir(join(root,".next/dev"),{recursive:true})
  const manifest=join(root,".next/dev/build-manifest.json")
  await writeFile(manifest,"")
  const preloader=join(process.cwd(),"tests/system/fixtures/next-json-eof-diagnostic.cjs")
  const script=`Error.prepareStackTrace=()=>"SyntaxError\\n at /fixture/node_modules/next/dist/build/webpack/loaders/next-app-loader/index.js?appDir=PRIVATE_PATH&token=PRIVATE_TOKEN:23:4"; try { JSON.parse(require("node:fs").readFileSync(${JSON.stringify(manifest)},"utf8")) } catch(error) { if (!(error instanceof SyntaxError)) process.exitCode=1 }`
  await promisify(execFile)(process.execPath,[`--require=${preloader}`,"-e",script],{cwd:root,env:{...process.env,KOKORO_TEST_JSON_EOF_TRACE_DIR:root}})
  const logs=await Promise.all((await readdir(root)).filter(name=>name.endsWith(".jsonl")).map(name=>readFile(join(root,name),"utf8")))
  const records=logs.join("").trim().split("\n").map(line=>JSON.parse(line))
  expect(records).toContainEqual(expect.objectContaining({kind:"json_eof",byte_count:0,manifest_reads:[expect.objectContaining({file:".next/dev/build-manifest.json",byte_count:0})],frames:[{owner:"next",file:"build/webpack/loaders/next-app-loader/index.js",line:23}]}))
  expect(logs.join("")).not.toContain("PRIVATE_PATH")
  expect(logs.join("")).not.toContain("PRIVATE_TOKEN")
 }finally{await rm(root,{recursive:true,force:true})}
})

it("bounds ten thousand empty reads and EOF observations without changing native results",async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,readdir,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path")
 const {execFile}=await import("node:child_process"),{promisify}=await import("node:util")
 const root=await mkdtemp(join(tmpdir(),"kokoro-eof-budget-"))
 try{
  await mkdir(join(root,".next/dev"),{recursive:true})
  const manifest=join(root,".next/dev/build-manifest.json")
  await writeFile(manifest,"")
  const preloader=join(process.cwd(),"tests/system/fixtures/next-json-eof-diagnostic.cjs")
  const script=`let caught=0; for(let index=0;index<10000;index++){ const value=require("node:fs").readFileSync(${JSON.stringify(manifest)},"utf8"); if(value !== "") throw new Error("read changed"); try {JSON.parse(value)} catch(error){if(!(error instanceof SyntaxError))throw error;caught++}} process.stdout.write(String(caught))`
  const {stdout}=await promisify(execFile)(process.execPath,[`--require=${preloader}`,"-e",script],{cwd:root,env:{...process.env,KOKORO_TEST_JSON_EOF_TRACE_DIR:root}})
  expect(stdout).toBe("10000")
  const logs=await Promise.all((await readdir(root)).filter(name=>name.endsWith(".jsonl")).map(name=>readFile(join(root,name),"utf8")))
  const lines=logs.join("").trim().split("\n"),records=lines.map(line=>JSON.parse(line))
  expect(Buffer.byteLength(logs.join(""))).toBeLessThanOrEqual(256*1024)
  expect(lines.every(line=>Buffer.byteLength(line)+1<=8*1024)).toBe(true)
  expect(records.length).toBeLessThanOrEqual(514)
  expect(records[0]).toMatchObject({kind:"installed"})
  expect(records.at(-1)).toMatchObject({kind:"exit",failures:10000,eof_failures:10000,manifest_reads:10000})
 }finally{await rm(root,{recursive:true,force:true})}
})
