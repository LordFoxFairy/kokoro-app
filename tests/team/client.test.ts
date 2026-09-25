import { afterEach, describe, expect, it, vi } from "vitest"

import { createTeamClient, TeamClientError } from "@/team/client"

const stamp = "2026-09-24T00:00:00Z"
const member = {
  member_id: "member-1", user_id: "user-1", display_name: "One", image_url: null,
  roles: ["owner"], joined_at: stamp,
}
const invitation = {
  invitation_id: "inv-1", email: "new@example.test", roles: ["member"], status: "pending",
  created_at: stamp, expires_at: stamp,
}
const role = { role_id: null, name: "owner", kind: "builtin", permissions: {
  member: ["create", "read", "update", "delete"], invitation: ["create", "read", "cancel"],
} }

afterEach(() => vi.unstubAllGlobals())

describe("pinned Team Product browser client", () => {
  it("uses generated Team GET operations through the same-origin adapter and preserves owner cursor", async () => {
    const fetcher = vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      expect(url.pathname.startsWith("/api/team/")).toBe(true)
      const data = url.pathname.endsWith("/members") ? [member]
        : url.pathname.endsWith("/invitations") ? [invitation] : [role]
      return Response.json({ data, meta: { request_id: "req-bff", next_cursor: "opaque+next" } })
    })
    vi.stubGlobal("fetch", fetcher)
    const client = createTeamClient()
    expect((await client.listMembers({ limit: 25, cursor: "opaque+first" })).items).toEqual([member])
    expect((await client.listInvitations()).items).toEqual([invitation])
    expect((await client.listRoles()).items).toEqual([role])
    expect(new URL((fetcher.mock.calls[0]?.[0] as Request).url).searchParams.get("cursor")).toBe("opaque+first")
    expect((await client.listMembers()).nextCursor).toBe("opaque+next")
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it("uses generated six mutation operations with owner IDs/roles[] and no automatic retry", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = []
    vi.stubGlobal("fetch", vi.fn(async (input: Request) => {
      const request = input.clone()
      const path = new URL(request.url).pathname
      const text = request.body === null ? "" : await request.text()
      calls.push({ method: request.method, path, body: text === "" ? null : JSON.parse(text) as unknown })
      const data = path.endsWith("/resend") || request.method === "POST"
        ? { invitation_id: "inv-1", status: "pending" }
        : path.endsWith("/roles") ? { member_id: "member-1", roles: ["admin"] }
        : path.endsWith("/invitations/inv-1") ? { invitation_id: "inv-1", status: "canceled" }
        : path.endsWith("/me") ? { member_id: "member-1", status: "left" }
        : { member_id: "member-1", status: "removed" }
      return Response.json({ data, meta: { request_id: "req-write" } })
    }))
    const client = createTeamClient()
    await client.createInvitation("new@example.test", ["member"])
    await client.resendInvitation("inv-1")
    await client.cancelInvitation("inv-1")
    await client.replaceMemberRoles("member-1", ["admin"])
    await client.removeMember("member-1")
    await client.leave()
    expect(calls).toEqual([
      { method: "POST", path: "/api/team/invitations", body: { email: "new@example.test", roles: ["member"] } },
      { method: "POST", path: "/api/team/invitations/inv-1/resend", body: null },
      { method: "DELETE", path: "/api/team/invitations/inv-1", body: null },
      { method: "PUT", path: "/api/team/members/member-1/roles", body: { roles: ["admin"] } },
      { method: "DELETE", path: "/api/team/members/member-1", body: null },
      { method: "DELETE", path: "/api/team/members/me", body: null },
    ])
  })

  it("preserves LAST_OWNER status/request ID and never retries a disputed write", async () => {
    const fetcher = vi.fn(async () => Response.json({
      error: { code: "LAST_OWNER", message: "Last owner" }, meta: { request_id: "req-conflict" },
    }, { status: 409 }))
    vi.stubGlobal("fetch", fetcher)
    await expect(createTeamClient().leave()).rejects.toMatchObject({
      code: "LAST_OWNER", status: 409, requestId: "req-conflict",
    } satisfies Partial<TeamClientError>)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("fails closed on malformed owner response rather than accepting legacy team/session shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ userId: "legacy" }], meta: { request_id: "req-bad", next_cursor: null } })))
    await expect(createTeamClient().listMembers()).rejects.toMatchObject({ code: "bff_bad_response" })
  })
})
