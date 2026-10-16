import type { SkillCard, SkillCatalogCard } from "@/hub/schemas";

export function toInstalledCatalogCard(skill: SkillCard): SkillCatalogCard {
  if (skill.skill_id === undefined || skill.revision_skill_id === undefined) {
    throw new Error("installed skill is missing its owner binding");
  }
  return {
    skill_id: skill.skill_id,
    ...(skill.installation_id === undefined
      ? {}
      : { installation_id: skill.installation_id }),
    ...(skill.source_ref === undefined ? {} : { source_ref: skill.source_ref }),
    revision_skill_id: skill.revision_skill_id,
    name: skill.name,
    description: skill.description,
    content_hash: skill.content_hash,
    scope: skill.scope,
    installed: true,
    enabled: skill.enabled === true,
    ...(skill.categories === undefined ? {} : { categories: skill.categories }),
    ...(skill.updated_at === undefined ? {} : { updated_at: skill.updated_at }),
  };
}

export function toSkillActionCard(skill: SkillCatalogCard): SkillCard {
  return {
    ...(skill.skill_id === undefined ? {} : { skill_id: skill.skill_id }),
    ...(skill.installation_id === undefined
      ? {}
      : { installation_id: skill.installation_id }),
    ...(skill.source_ref === undefined ? {} : { source_ref: skill.source_ref }),
    ...(skill.revision_skill_id === undefined
      ? {}
      : { revision_skill_id: skill.revision_skill_id }),
    name: skill.name,
    description: skill.description,
    content_hash: skill.content_hash,
    scope: skill.scope,
    enabled: skill.enabled,
    ...(skill.updated_at === undefined ? {} : { updated_at: skill.updated_at }),
  };
}
