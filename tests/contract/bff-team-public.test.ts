import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"
import YAML from "yaml"

const BFF_OWNER_COMMIT = "293dfe7638e5dea0df2bee6dfdd8483b53fc9df6"
const BFF_PUBLIC_OPENAPI_SHA256 = "acd92ed2fa3e84032e824e1462d67a007c4a94a7e79b7bda8fd5a66f9d51cd3b"
const BFF_PUBLIC_OPENAPI_VERSION = "3.0.0"
const SNAPSHOT = resolve(process.cwd(), "src/generated/bff-public-openapi.yaml")

describe("pinned BFF Team public contract", () => {
  it("pins the exact owner public OpenAPI blob, not a Web-edited Team contract", async () => {
    const bytes = await readFile(SNAPSHOT)
    const spec = YAML.parse(bytes.toString("utf8")) as { info?: { version?: string } }
    expect(BFF_OWNER_COMMIT).toBe("293dfe7638e5dea0df2bee6dfdd8483b53fc9df6")
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BFF_PUBLIC_OPENAPI_SHA256)
    expect(spec.info?.version).toBe(BFF_PUBLIC_OPENAPI_VERSION)
  })

  it.each([
    ["/v1/team/members", "get", "listTeamMembers"],
    ["/v1/team/invitations", "get", "listTeamInvitations"],
    ["/v1/team/roles", "get", "listTeamRoles"],
    ["/v1/team/invitations", "post", "createTeamInvitation"],
    ["/v1/team/invitations/{invitation_id}/resend", "post", "resendTeamInvitation"],
    ["/v1/team/invitations/{invitation_id}", "delete", "cancelTeamInvitation"],
    ["/v1/team/members/{member_id}/roles", "put", "replaceTeamMemberRoles"],
    ["/v1/team/members/{member_id}", "delete", "removeTeamMember"],
    ["/v1/team/members/me", "delete", "leaveTeam"],
  ])("has %s %s %s in the pinned artifact", async (path, method, operationId) => {
    const spec = YAML.parse(await readFile(SNAPSHOT, "utf8")) as { paths: Record<string, Record<string, { operationId?: string }>> }
    expect(spec.paths[path]?.[method]?.operationId).toBe(operationId)
  })

  it("requires member_id/roles[], invitation_id/email/roles[] and opaque cursor on Team pages", async () => {
    const yaml = await readFile(SNAPSHOT, "utf8")
    expect(yaml).toContain("required: [member_id, user_id, display_name, image_url, roles, joined_at]")
    expect(yaml).toContain("required: [invitation_id, email, roles, status, created_at, expires_at]")
    expect(yaml).toContain("required: [request_id, next_cursor]")
    expect(yaml).toContain("description: Opaque IAM cursor bound to the admitted tenant and query.")
  })

  it("has generated Team operation and response types from the pinned owner artifact", async () => {
    const types = await readFile(resolve(process.cwd(), "src/generated/bff-team/types.gen.ts"), "utf8")
    const sdk = await readFile(resolve(process.cwd(), "src/generated/bff-team/sdk.gen.ts"), "utf8")
    for (const name of ["TeamMember", "TeamInvitation", "TeamRole", "TeamMembersResponse", "TeamInvitationsResponse", "TeamRolesResponse"]) {
      expect(types).toContain(`export type ${name} =`)
    }
    for (const name of ["listTeamMembers", "listTeamInvitations", "listTeamRoles", "createTeamInvitation", "replaceTeamMemberRoles", "leaveTeam"]) {
      expect(sdk).toContain(`export const ${name} =`)
    }
  })
})
