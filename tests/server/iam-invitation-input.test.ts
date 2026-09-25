import { describe, expect, it } from "vitest"

import { parseInvitationContext, parseInvitationTarget, readInvitationForm } from "@/lib/server/iam-invitation-input"

const ID = "01234567-89ab-4cde-8f01-23456789abcd"
const URL = `https://web.example.test/iam/interactions/invitation?id=${ID}`

describe("invitation input boundary", () => {
  it("only admits the canonical invite and owner-ordered verification enum", () => {
    expect(parseInvitationTarget(URL)).toEqual({ id: ID, query: `?id=${ID}`, error: null })
    expect(parseInvitationTarget(`${URL}&error=INVALID_TOKEN`)).toEqual({ id: ID, query: `?id=${ID}`, error: "INVALID_TOKEN" })
    for (const target of [`${URL}&id=${ID}`, `${URL}&error=OTHER`, `${URL.replace("?id=", "?%69d=")}`,
      URL.replace(ID, ID.toUpperCase()), `https://web.example.test/auth/invitation?id=${ID}`]) {
      expect(parseInvitationTarget(target), target).toBeNull()
    }
  })

  it("rejects context with mismatched owner, extra fields or invalid dates", () => {
    const base = { data: { invitation_id: ID, tenant_id: "tenant-one", tenant_name: "Team Alpha", roles: ["member"],
      status: "pending", expires_at: "2026-10-01T12:00:00Z" } }
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    expect(parseInvitationContext(bytes(base), ID, "tenant-one")?.tenant_name).toBe("Team Alpha")
    expect(parseInvitationContext(bytes(base), ID, "foreign-tenant")).toBeNull()
    expect(parseInvitationContext(bytes({ data: { ...base.data, extra: "x" } }), ID, "tenant-one")).toBeNull()
    expect(parseInvitationContext(bytes({ data: { ...base.data, expires_at: "tomorrow" } }), ID, "tenant-one")).toBeNull()
  })

  it("rejects extra or self-asserted callback fields in sign-up", async () => {
    const request = (body: string) => new Request(URL, { method: "POST", headers: {
      "content-type": "application/x-www-form-urlencoded",
    }, body })
    const valid = "decision=sign-up&csrf_token=proof&name=New+Member&email=new%40example.test&password=secret-password"
    expect((await readInvitationForm(request(valid)))?.get("name")).toBe("New Member")
    expect(await readInvitationForm(request(`${valid}&callbackURL=https%3A%2F%2Fevil.example`))).toBeNull()
    expect(await readInvitationForm(request(`${valid}&decision=sign-in`))).toBeNull()
  })
})
