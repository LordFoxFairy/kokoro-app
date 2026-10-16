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
