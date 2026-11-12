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

it.each([null, { share_id: "current", created_at: "2026-11-12T00:00:00Z", expires_at: null }])("readShare preserves the canonical metadata %j without a command key or body", async share => {
  const fetch = vi.fn().mockResolvedValue(jsonResponse({ share })); vi.stubGlobal("fetch", fetch)
  const result = await createSessionClient({ baseUrl: "/api/session" }).readShare("session/read", { scope: { kind: "direct" } })
  expect(result).toEqual({ share }); expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0]![0]).toBe("/api/session/sessions/session%2Fread/share?scope=direct")
  const init = fetch.mock.calls[0]![1] as RequestInit
  expect(init.method).toBe("GET"); expect(init.body).toBeUndefined(); expect(init.cache).toBe("no-store")
  expect(new Headers(init.headers).has("idempotency-key")).toBe(false)
})
it.each([{ share: null, extra: true }, { share: { share_id: "locator-only" } }, { share: { share_id: "x", created_at: "2026-11-12T00:00:00Z", expires_at: null, secret: "unexpected" } }])("readShare rejects noncanonical metadata rather than treating it as unpublished: %j", async body => {
  const fetch = vi.fn().mockResolvedValue(jsonResponse(body)); vi.stubGlobal("fetch", fetch)
  await expect(createSessionClient({ baseUrl: "/api/session" }).readShare("session")).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce()
})
