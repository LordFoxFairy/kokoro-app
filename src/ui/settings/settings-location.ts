import type { SkillsScopeFilter } from "@/ui/skills/skills-scope"

/** Presentation intent only; Explore is not an installation scope. */
export type SettingsSkillsView = SkillsScopeFilter | "explore"

/** Reads the nested Skills view encoded in a shareable Settings hash. */
export function settingsSkillsViewFromLocation(): SettingsSkillsView | undefined {
  if (typeof window === "undefined") return undefined
  const segments = window.location.hash
    .replace(/^#\/?/, "")
    .split(/[\/?#]/)
    .filter(Boolean)
  const settingsIndex = segments.lastIndexOf("settings")
  if (settingsIndex < 0 || segments[settingsIndex + 1] !== "skills") return undefined
  const view = segments[settingsIndex + 2]
  if (view === undefined) return "all"
  return view === "personal" || view === "official" || view === "thirdParty" || view === "all" || view === "explore"
    ? view
    : undefined
}
