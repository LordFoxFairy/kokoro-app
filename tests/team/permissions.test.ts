import { describe, expect, it } from "vitest"

import { canInvite, canReadInvitations, canRemoveMember, canReplaceMemberRoles, canManageInvitations } from "@/team/permissions"
import type { TeamRole } from "@/team/client"

const catalog: TeamRole[] = [
  { role_id: null, name: "owner", kind: "builtin", permissions: { member: ["create", "read", "update", "delete"], invitation: ["create", "read", "cancel"] } },
  { role_id: null, name: "admin", kind: "builtin", permissions: { member: ["create", "read", "update", "delete"], invitation: ["create", "read", "cancel"] } },
  { role_id: null, name: "member", kind: "builtin", permissions: { member: ["read"] } },
]

describe("Team controls are hints derived from owner role permissions", () => {
  it("allows invitation and member controls for owner/admin but not plain member", () => {
    for (const actor of [["owner"], ["admin"]]) {
      expect(canInvite(actor, catalog)).toBe(true)
      expect(canManageInvitations(actor, catalog)).toBe(true)
      expect(canReadInvitations(actor, catalog)).toBe(true)
      expect(canRemoveMember(actor, ["member"], catalog)).toBe(true)
    }
    expect(canInvite(["member"], catalog)).toBe(false)
    expect(canReadInvitations(["member"], catalog)).toBe(false)
    expect(canRemoveMember(["member"], ["member"], catalog)).toBe(false)
  })

  it("does not expose owner transfer/removal to admin or unknown roles", () => {
    expect(canRemoveMember(["admin"], ["owner"], catalog)).toBe(false)
    expect(canReplaceMemberRoles(["admin"], ["member"], ["owner"], catalog)).toBe(false)
    expect(canReplaceMemberRoles(["owner"], ["admin"], ["owner"], catalog)).toBe(true)
    expect(canInvite(["unknown"], catalog)).toBe(false)
  })

  it("respects dynamic role permissions without making UI hints authoritative", () => {
    const dynamic: TeamRole = { role_id: "role-1", name: "inviter", kind: "custom", permissions: { invitation: ["create"] } }
    expect(canInvite(["inviter"], [...catalog, dynamic])).toBe(true)
    expect(canManageInvitations(["inviter"], [...catalog, dynamic])).toBe(false)
    expect(canRemoveMember(["inviter"], ["member"], [...catalog, dynamic])).toBe(false)
  })
})
