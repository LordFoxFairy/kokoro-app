import type { SkillCard, SkillCatalog, SkillQuota } from "@/hub/schemas";

export type SkillsPool = { skills: SkillCard[]; quota: SkillQuota | null };

/** Missing provenance is neither personal nor third party. */
export function skillSourceScope(scope: string): "personal" | "official" | "thirdParty" | "unknown" {
  if (scope === "official" || scope === "personal") return scope;
  if (scope === "third_party") return "thirdParty";
  return "unknown";
}

/** Owner series identity outlives titles and is shared by pool/catalog actions.
 * Display-only preview entries have no owner binding and stay in their own key space. */
export function skillStateKey(scope: string, name: string, skillId?: string): string {
  return skillId === undefined
    ? JSON.stringify(["preview", scope, name])
    : JSON.stringify(["skill", skillId]);
}

/** Cursor pages may repeat an owner series after a refresh; only that same
 * series is replaced, never a distinct Skill with an equal display name. */
export function mergeSkillCatalogPages(pages: readonly SkillCatalog[]): SkillCatalog {
  const skillsByKey = new Map<string, SkillCatalog["skills"][number]>();
  for (const page of pages) {
    for (const skill of page.skills) {
      skillsByKey.set(skillStateKey(skill.scope, skill.name, skill.skill_id), skill);
    }
  }
  return {
    skills: [...skillsByKey.values()],
    next_cursor: pages.at(-1)?.next_cursor ?? null,
  };
}
