import type { SkillCard, SkillQuota } from "@/hub/schemas";

export type SkillsPool = { skills: SkillCard[]; quota: SkillQuota | null };

export function skillStateKey(scope: string, name: string): string {
  return `${scope}/${name}`;
}
