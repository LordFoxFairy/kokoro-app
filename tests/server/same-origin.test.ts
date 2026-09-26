import { describe, expect, it } from "vitest"

import { sameOriginOk } from "@/lib/server/same-origin"

describe("same-origin mutation guard", () => {
  it("uses Host before the URL authority normalized by Next", () => {
    expect(sameOriginOk(new Request("http://localhost/api/team/members", {
      headers: { host: "127.0.0.1:3310", origin: "http://127.0.0.1:3310" },
    }))).toBe(true)
    expect(sameOriginOk(new Request("http://localhost/api/team/members", {
      headers: { host: "127.0.0.1:3310", origin: "http://evil.test" },
    }))).toBe(false)
  })

  it("falls back to the request URL when Host is absent", () => {
    expect(sameOriginOk(new Request("http://localhost/api/team/members", {
      headers: { origin: "http://localhost" },
    }))).toBe(true)
    expect(sameOriginOk(new Request("http://localhost/api/team/members", {
      headers: { origin: "http://evil.test" },
    }))).toBe(false)
  })

  it("rejects malformed Origin and preserves the legacy absent-Origin behavior", () => {
    expect(sameOriginOk(new Request("http://localhost/api/team/members", {
      headers: { origin: "null" },
    }))).toBe(false)
    expect(sameOriginOk(new Request("http://localhost/api/team/members"))).toBe(true)
  })
})
