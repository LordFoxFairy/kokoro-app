// SessionClient 分享端点：路径拼接、契约 Zod。
import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionClient } from "@/engine/client"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-request-id": "fixture-share" } })
}

describe("createShare / revokeShare（SHARE-1）：POST|DELETE /sessions/{id}/share", () => {
  it("createShare：POST 命中 share 路径，返回 share_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ share_id: "shr_abc" }))
    vi.stubGlobal("fetch", fetchMock)
    const receipt = await createSessionClient({ baseUrl: "/api/session" }).createShare("ses_1")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions/ses_1/share")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" })
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("idempotency-key")).toMatch(/^session-mutation:/)
    expect(receipt.share_id).toBe("shr_abc")
  })

  it("revokeShare：DELETE 命中 share 路径，返回成功 receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ share_id: "shr_abc" }))
    vi.stubGlobal("fetch", fetchMock)
    const receipt = await createSessionClient({ baseUrl: "/api/session" }).revokeShare("ses_1")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions/ses_1/share")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" })
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("idempotency-key")).toMatch(/^session-mutation:/)
    expect(receipt).toEqual({ share_id: "shr_abc" })
  })

  it("revokeShare rejects the legacy ok:true acknowledgement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })))
    await expect(createSessionClient({ baseUrl: "/api/session" }).revokeShare("ses_1")).rejects.toThrow()
  })

  it("createShare 契约拒绝空 share_id（fail-loud）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ share_id: "" })))
    await expect(createSessionClient({ baseUrl: "/api/session" }).createShare("ses_1")).rejects.toThrow()
  })
})

it('createShare uses redirect:error and a finite whole-operation deadline for a hung fetch',async()=>{
 vi.useFakeTimers();let captured:RequestInit|undefined
 vi.stubGlobal('fetch',vi.fn((_input:RequestInfo|URL,init?:RequestInit)=>{captured=init;return new Promise(()=>{})}))
 const pending=createSessionClient({baseUrl:'/api/session'}).createShare('opaque:old');const rejected=expect(pending).rejects.toThrow()
 await vi.advanceTimersByTimeAsync(10001);await rejected;expect(captured?.redirect).toBe('error');expect(captured?.signal?.aborted).toBe(true);vi.useRealTimers()
})
it('createShare raw duplicate-key acknowledgement is not success',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"share_id":"a","share_id":"b"}',{headers:{'content-type':'application/json','cache-control':'no-store','x-request-id':'fixture'}})))
 await expect(createSessionClient({baseUrl:'/api/session'}).createShare('ses_1')).rejects.toThrow()
})
it('an already retired createShare dispatches zero requests',async()=>{
 const signal=new AbortController();signal.abort();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 await expect(createSessionClient({baseUrl:'/api/session'}).createShare('ses_1',signal.signal)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled()
})


it("reads exact scoped metadata with GET, no command headers, and validates nullable share", async () => {
  const fetcher = vi.fn().mockResolvedValue(jsonResponse({ share: null }))
  vi.stubGlobal("fetch", fetcher)
  const controller = new AbortController()
  expect(await createSessionClient({ baseUrl: "/api/session" }).readShare("opaque/old", { scope: { kind: "project", projectRef: "project/one" }, signal: controller.signal })).toEqual({ share: null })
  expect(fetcher.mock.calls[0]![0]).toBe("/api/session/sessions/opaque%2Fold/share?project_ref=project%2Fone")
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" })
  expect(new Headers(fetcher.mock.calls[0]![1].headers).has("idempotency-key")).toBe(false)
})
it("retains a typed metadata 401/404 instead of returning private", async () => {
  for (const status of [401, 404]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { code: status === 401 ? "session_invalid" : "session_not_found", message: "Unavailable" }, meta: { request_id: "fixture-share" } }, status)))
    await expect(createSessionClient({ baseUrl: "/api/session" }).readShare("ses_1", { scope: { kind: "direct" }, signal: new AbortController().signal })).rejects.toMatchObject({ status, reason: "http" })
  }
})
it("metadata GET covers a hung body in its deadline and cancels the reader", async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "fixture-share" } })))
  const pending = createSessionClient({ baseUrl: "/api/session" }).readShare("ses_1", { scope: { kind: "direct" }, signal: new AbortController().signal })
  const rejected = expect(pending).rejects.toThrow()
  await vi.advanceTimersByTimeAsync(10_001)
  await rejected
  expect(cancel).toHaveBeenCalledTimes(1)
})
it("a cancelled metadata read cancels a late response without publishing it", async () => {
  let resolveFetch!: (response: Response) => void
  const cancel = vi.fn(), controller = new AbortController()
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve })))
  const pending = createSessionClient({ baseUrl: "/api/session" }).readShare("ses_1", { scope: { kind: "direct" }, signal: controller.signal })
  const rejected = expect(pending).rejects.toThrow()
  controller.abort(); await rejected
  resolveFetch(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": "fixture-share" } }))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(cancel).toHaveBeenCalledTimes(1)
})
