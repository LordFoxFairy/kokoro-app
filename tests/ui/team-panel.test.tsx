import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const { endProductSession } = vi.hoisted(() => ({ endProductSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/ui/auth/product-auth-client", () => ({ endProductSession }))

import { LocaleProvider } from "@/i18n/context"
import { TeamClientError, type TeamClient, type TeamInvitation, type TeamMember, type TeamRole } from "@/team/client"
import { TeamPanel } from "@/ui/team/team-panel"

const timestamp = "2026-09-24T00:00:00Z"
const members: TeamMember[] = [
  { member_id: "member-me", user_id: "user-me", display_name: "Me", image_url: null, roles: ["owner"], joined_at: timestamp },
  { member_id: "member-bob", user_id: "user-bob", display_name: "Bob", image_url: null, roles: ["member"], joined_at: timestamp },
]
const invitations: TeamInvitation[] = [
  { invitation_id: "inv-1", email: "invite@example.test", roles: ["member"], status: "pending", created_at: timestamp, expires_at: timestamp },
]
const roles: TeamRole[] = [
  { role_id: null, name: "owner", kind: "builtin", permissions: { member: ["create", "read", "update", "delete"], invitation: ["create", "read", "cancel"] } },
  { role_id: null, name: "admin", kind: "builtin", permissions: { member: ["create", "read", "update", "delete"], invitation: ["create", "read", "cancel"] } },
  { role_id: null, name: "member", kind: "builtin", permissions: { member: ["read"] } },
]

function client(overrides: Partial<TeamClient> = {}): TeamClient {
  return {
    currentUserId: vi.fn().mockResolvedValue("user-me"),
    listMembers: vi.fn().mockResolvedValue({ items: members, nextCursor: null, requestId: "req-members" }),
    listInvitations: vi.fn().mockResolvedValue({ items: invitations, nextCursor: null, requestId: "req-invites" }),
    listRoles: vi.fn().mockResolvedValue({ items: roles, nextCursor: null, requestId: "req-roles" }),
    createInvitation: vi.fn().mockResolvedValue(undefined),
    resendInvitation: vi.fn().mockResolvedValue(undefined),
    cancelInvitation: vi.fn().mockResolvedValue(undefined),
    replaceMemberRoles: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function show(value: TeamClient) {
  return render(<TeamPanel client={value} onClose={vi.fn()} />, { wrapper: LocaleProvider })
}

afterEach(cleanup)

describe("fixed-tenant Team Product UI", () => {
  it("shows current-tenant members/management invitations with roles[] but no namespace switch or inbox", async () => {
    show(client())
    expect(await screen.findByTestId("member-row-member-bob")).toHaveTextContent("Bob")
    expect(screen.getByTestId("invitation-row-inv-1")).toHaveTextContent("invite@example.test")
    expect(screen.getByTestId("member-row-member-me")).toHaveTextContent("owner")
    expect(screen.queryByTestId("team-switcher")).toBeNull()
    expect(screen.queryByTestId("invite-accept")).toBeNull()
    expect(screen.queryByTestId("invite-decline")).toBeNull()
  })

  it("creates, resends and cancels invitations using invitation_id, then refreshes read pages", async () => {
    const api = client()
    show(api)
    await screen.findByTestId("invitation-row-inv-1")
    fireEvent.change(screen.getByTestId("invite-email"), { target: { value: "new@example.test" } })
    fireEvent.click(screen.getByTestId("invite-submit"))
    await waitFor(() => expect(api.createInvitation).toHaveBeenCalledWith("new@example.test", ["member"]))
    fireEvent.click(screen.getByTestId("invitation-resend-inv-1"))
    await waitFor(() => expect(api.resendInvitation).toHaveBeenCalledWith("inv-1"))
    fireEvent.click(screen.getByTestId("invitation-cancel-inv-1"))
    await waitFor(() => expect(api.cancelInvitation).toHaveBeenCalledWith("inv-1"))
    expect((api.listInvitations as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
  })

  it("replaces roles[] and removes by member_id, not IAM user_id", async () => {
    const api = client()
    show(api)
    await screen.findByTestId("member-row-member-bob")
    fireEvent.click(screen.getByTestId("member-role-member-bob-member"))
    fireEvent.click(screen.getByTestId("member-role-member-bob-admin"))
    fireEvent.click(screen.getByTestId("member-role-save-member-bob"))
    await waitFor(() => expect(api.replaceMemberRoles).toHaveBeenCalledWith("member-bob", ["admin"]))
    fireEvent.click(screen.getByTestId("member-remove-member-bob"))
    fireEvent.click(screen.getByTestId("member-remove-confirm-member-bob"))
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith("member-bob"))
  })

  it("supports explicit leave and presents LAST_OWNER without automatic retry", async () => {
    const api = client({ leave: vi.fn().mockRejectedValue(new TeamClientError("Last owner", "LAST_OWNER", 409, "req-conflict")) })
    show(api)
    fireEvent.click(await screen.findByTestId("team-leave"))
    fireEvent.click(screen.getByTestId("team-leave-confirm"))
    expect(await screen.findByTestId("team-notice")).toBeInTheDocument()
    expect(api.leave).toHaveBeenCalledOnce()
  })

  it("pages members by opaque cursor and hides mutation controls for a plain member", async () => {
    const api = client({
      listInvitations: vi.fn().mockRejectedValue(new TeamClientError("Forbidden", "FORBIDDEN", 403, "req-forbidden")),
      listMembers: vi.fn()
        .mockResolvedValueOnce({ items: [{ ...members[0], roles: ["member"] }], nextCursor: "opaque+2", requestId: "r1" })
        .mockResolvedValueOnce({ items: [members[1]], nextCursor: null, requestId: "r2" }),
    })
    show(api)
    await screen.findByTestId("team-members")
    expect(screen.queryByTestId("invite-submit")).toBeNull()
    expect(api.listInvitations).not.toHaveBeenCalled()
    expect(screen.queryByTestId("member-remove-member-me")).toBeNull()
    fireEvent.click(screen.getByTestId("members-more"))
    expect(await screen.findByTestId("member-row-member-bob")).toBeInTheDocument()
    expect(api.listMembers).toHaveBeenCalledWith({ limit: 25, cursor: "opaque+2" })
  })

  it("finds the actor and all roles beyond the first pages before deriving controls", async () => {
    const api = client({
      listMembers: vi.fn()
        .mockResolvedValueOnce({ items: [members[1]], nextCursor: "member-next", requestId: "r1" })
        .mockResolvedValueOnce({ items: [members[0]], nextCursor: null, requestId: "r2" }),
      listRoles: vi.fn()
        .mockResolvedValueOnce({ items: [roles[2]], nextCursor: "role-next", requestId: "r1" })
        .mockResolvedValueOnce({ items: [roles[0], roles[1]], nextCursor: null, requestId: "r2" }),
    })
    show(api)
    expect(await screen.findByTestId("invite-submit")).toBeInTheDocument()
    expect(screen.getByTestId("member-remove-member-bob")).toBeInTheDocument()
    expect(api.listMembers).toHaveBeenCalledWith({ limit: 100, cursor: "member-next" })
    expect(api.listRoles).toHaveBeenCalledWith({ limit: 100, cursor: "role-next" })
  })

  it("does not report a successful write as failed when its readback fails or repeat the write", async () => {
    const api = client({
      listInvitations: vi.fn()
        .mockResolvedValueOnce({ items: invitations, nextCursor: null, requestId: "first" })
        .mockRejectedValueOnce(new TeamClientError("Unavailable", "UNAVAILABLE", 503, "later")),
    })
    show(api)
    await screen.findByTestId("invite-submit")
    fireEvent.change(screen.getByTestId("invite-email"), { target: { value: "new@example.test" } })
    fireEvent.click(screen.getByTestId("invite-submit"))
    expect(await screen.findByTestId("team-notice")).toHaveTextContent(/submitted|已提交/u)
    expect(screen.getByTestId("invite-submit")).toBeDisabled()
    fireEvent.click(screen.getByTestId("invite-submit"))
    expect(api.createInvitation).toHaveBeenCalledOnce()
  })

  it("pages invitations by owner cursor", async () => {
    const nextInvitation = { ...invitations[0]!, invitation_id: "inv-2", email: "second@example.test" }
    const api = client({
      listInvitations: vi.fn()
        .mockResolvedValueOnce({ items: invitations, nextCursor: "invite-next", requestId: "r1" })
        .mockResolvedValueOnce({ items: [nextInvitation], nextCursor: null, requestId: "r2" }),
    })
    show(api)
    fireEvent.click(await screen.findByTestId("invitations-more"))
    expect(await screen.findByTestId("invitation-row-inv-2")).toHaveTextContent("second@example.test")
    expect(api.listInvitations).toHaveBeenCalledWith({ limit: 25, cursor: "invite-next" })
  })

  it("ends the Product Session after a successful leave without refetching forbidden members", async () => {
    const api = client()
    show(api)
    fireEvent.click(await screen.findByTestId("team-leave"))
    fireEvent.click(screen.getByTestId("team-leave-confirm"))
    await waitFor(() => expect(endProductSession).toHaveBeenCalledOnce())
    expect(api.leave).toHaveBeenCalledOnce()
    expect(api.listMembers).toHaveBeenCalledOnce()
  })
})
