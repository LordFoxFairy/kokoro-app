import { describe, expect, it } from "vitest"

import { parseProductReturnTarget } from "@/lib/product-return-target"

const project = "project_00000000-0000-4000-8000-000000000301"
const conversation = "conv_00000000-0000-4000-8000-000000000302"

describe("bounded canonical product navigation intent", () => {
  it.each(["/app", "/app/agents", "/app/plugins", "/app/scheduled", "/app/library", "/app/skills", `/app/project/${project}`])("accepts the finite product path %s", (target) => {
    expect(parseProductReturnTarget(target)).toBe(target)
  })
  it.each(["/app", `/app/project/${project}`])("keeps canonical conversation query on %s", (pathname) => {
    expect(parseProductReturnTarget(`${pathname}?conversation=${conversation}`)).toBe(`${pathname}?conversation=${conversation}`)
  })
  it("sorts finite queries and omits existing default display values", () => {
    expect(parseProductReturnTarget(`/app/scheduled?tab=list&project_id=${project}`)).toBe(`/app/scheduled?project_id=${project}&tab=list`)
    expect(parseProductReturnTarget("/app/scheduled?tab=calendar")).toBe("/app/scheduled")
    expect(parseProductReturnTarget("/app/library?view=list&type=images&tab=artifacts&q=hello%20world&favorites=1")).toBe("/app/library?favorites=1&q=hello+world&tab=artifacts&type=images&view=list")
    expect(parseProductReturnTarget("/app/library?view=grid&type=all")).toBe("/app/library")
    expect(parseProductReturnTarget("/app/library?tab=files")).toBe("/app/library?tab=files")
  })
  it.each(["all", "documents", "slides", "spreadsheets", "images", "video", "audio", "other"])("uses the actual Library type enum %s", (type) => {
    expect(parseProductReturnTarget(`/app/library?type=${type}`)).toBe(type === "all" ? "/app/library" : `/app/library?type=${type}`)
  })
  it.each([
    "", "https://evil.test/app", "//evil.test/app", "/app/", "/app//skills", "/app/../api", "/app/%2e%2e/skills", "/%61pp", "/api/auth/session", "/login", "/app/settings", "/app?settings=general", "/app#private", "/app\\skills", "/app\n", "/app/skills?conversation=x",
    `/app/project/${project.toUpperCase()}`, "/app/project/arbitrary", "/app/project/project_not-a-uuid",
    `/app?conversation=${conversation}&conversation=${conversation}`, `/app?conversation=${conversation}&%63onversation=${conversation}`, "/app?conversation=", "/app?conversation=arbitrary", "/app?return_to=%2Fapp", "/app?",
    "/app/scheduled?tab=other", "/app/scheduled?project_id=arbitrary", "/app/library?tab=uploaded", "/app/library?type=websites", "/app/library?type=media", "/app/library?type=exe", "/app/library?view=other", "/app/library?favorites=0", "/app/library?q=", "/app/library?q=%", "/app/library?q=%C0%AF", "/app/library?q=%00", "/app/library?q=%5C", "/app/library?q=test&&view=list", "/app/library?q=test&view", "/app/library?q=" + "a".repeat(513), "/app/library?q=" + "a".repeat(2048),
  ])("rejects malformed/out-of-domain intent %s", (target) => { expect(parseProductReturnTarget(target)).toBeNull() })
  it("canonicalizes Unicode/search punctuation once and never promotes it to a path", () => {
    expect(parseProductReturnTarget("/app/library?q=%E6%B5%8B%E8%AF%95%20%2F%23%3F")).toBe("/app/library?q=%E6%B5%8B%E8%AF%95+%2F%23%3F")
    expect(parseProductReturnTarget(`/app/project/%70${project.slice(1)}`)).toBeNull()
  })
})

it("retains only canonical Skill Share return targets", () => {
  expect(parseProductReturnTarget("/skills/shared/share-1")).toBe("/skills/shared/share-1")
  expect(parseProductReturnTarget("/skills/shared/skill%3Arevision")).toBe("/skills/shared/skill%3Arevision")
  for (const path of ["/skills/shared/", "/skills/shared/%73hare", "/skills/shared/a/b", "/skills/shared/a?x=1", "/skills/shared/a#x", "/skills/shared/%252F", "/skills/shared/%00"]) expect(parseProductReturnTarget(path)).toBeNull()
})

it("retains only recognized same-app settings fragments, not arbitrary redirect fragments", () => {
  expect(parseProductReturnTarget("/app#/account/settings/mcp")).toBe("/app#/account/settings/mcp")
  for (const scope of ["all", "personal", "official", "thirdParty", "explore"]) {
    const target = `/app#/account/settings/skills/${scope}`
    expect(parseProductReturnTarget(target)).toBe(target)
  }
  expect(parseProductReturnTarget("/app/library?type=images#/account/settings/skills/personal")).toBe("/app/library?type=images#/account/settings/skills/personal")
  for (const target of ["/app#//evil.test", "/app#/account/settings/mcp/../../other", "/app#/account/settings/%6dcp", "/app#/account/settings/mcp#other", "/skills/shared/share-1#/account/settings/mcp"]) expect(parseProductReturnTarget(target)).toBeNull()
})
