import type { SkillsScopeFilter } from "@/ui/skills/skills-scope"

/** Reads the optional nested Skills view encoded in a shareable Settings hash. */
export function settingsSkillsScopeFromLocation(): SkillsScopeFilter | undefined {
  if (typeof window === "undefined") return undefined
  const segments = window.location.hash
    .replace(/^#\/?/, "")
    .split(/[\/?#]/)
    .filter(Boolean)
  const settingsIndex = segments.lastIndexOf("settings")
  if (settingsIndex < 0 || segments[settingsIndex + 1] !== "skills") return undefined
  const scope = segments[settingsIndex + 2]
  return scope === "personal" || scope === "official" || scope === "thirdParty" || scope === "all"
    ? scope
    : undefined
}
