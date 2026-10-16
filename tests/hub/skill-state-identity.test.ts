import { describe, expect, it } from "vitest"

import type { SkillCatalogCard } from "@/hub/schemas"
import { mergeSkillCatalogPages, skillStateKey } from "@/ui/skills/skills-pool-model"

// This is a projection-identity rule, not a DOM/layout fixture: one owner
// series must never inherit another series' pending/error/enabled override.
const key = (scope: string, name: string, seriesId: string) =>
  skillStateKey(scope, name, seriesId)

describe("Skill projection identity", () => {
  it("keeps two same-name series separate within the same publisher scope", () => {
    expect(key("official", "Report builder", "series-a"))
      .not.toBe(key("official", "Report builder", "series-b"))
  })

  it("keeps a renamed series bound to its existing mutation state", () => {
    expect(key("official", "Old title", "series-a"))
      .toBe(key("official", "New title", "series-a"))
  })

  it("does not confuse an owner identity with a display-only preview entry", () => {
    expect(key("official", "Report builder", "series-a"))
      .not.toBe(skillStateKey("official", "Report builder"))
  })
})

const card = (id: string, name = "Report builder"): SkillCatalogCard => ({
  skill_id: id,
  revision_skill_id: `revision-${id}`,
  scope: "official",
  name,
  content_hash: `digest-${id}`,
  description: "Owner metadata",
  installed: false,
  enabled: false,
})

it("keeps same-name catalog series on separate cursor pages and replaces only repeated identity", () => {
  const first = card("series-a")
  const second = card("series-b")
  const renamed = { ...first, name: "Updated title", installed: true, enabled: true }
  const pages = [
    { skills: [first], next_cursor: "page-2" },
    { skills: [second, renamed], next_cursor: null },
  ]
  expect(mergeSkillCatalogPages(pages)).toEqual({ skills: [renamed, second], next_cursor: null })
  expect(pages[0]!.skills).toEqual([first])
})

it("preserves the final opaque cursor and a real empty catalog", () => {
  expect(mergeSkillCatalogPages([{ skills: [card("a")], next_cursor: "NEXT" }]).next_cursor).toBe("NEXT")
  expect(mergeSkillCatalogPages([])).toEqual({ skills: [], next_cursor: null })
})
