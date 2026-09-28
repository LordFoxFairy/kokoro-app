// SessionClient 分享端点：路径拼接、契约 Zod。
import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionClient } from "@/engine/client"

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    const receipt = await createSessionClient({ baseUrl: "/api/session" }).revokeShare("ses_1")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/session/sessions/ses_1/share")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" })
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("idempotency-key")).toMatch(/^session-mutation:/)
    expect(receipt.ok).toBe(true)
  })

  it("createShare 契约拒绝空 share_id（fail-loud）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ share_id: "" })))
    await expect(createSessionClient({ baseUrl: "/api/session" }).createShare("ses_1")).rejects.toThrow()
  })
})
