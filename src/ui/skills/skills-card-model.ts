import type { SkillCard, SkillCatalogCard } from "@/hub/schemas";

/** A catalog's series-level "added" flag must not silently upgrade its pin. */
export function skillTrialSourceRef(skill: SkillCard | SkillCatalogCard): string | null {
  const ref = skill.source_ref;
  return skill.enabled === true && skill.skill_id !== undefined
    && (!("installed" in skill) || skill.installed)
    && typeof ref === "string"
    && /^skill:(?!skill:)[A-Za-z0-9][A-Za-z0-9._:-]{0,190}(?![\s\S])/u.test(ref)
    && ref === skill.installed_source_ref && ref === `skill:${skill.revision_skill_id}`
    ? ref : null;
}

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
    ...(skill.installed_source_ref === undefined ? {} : { installed_source_ref: skill.installed_source_ref }),
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
    ...(skill.installed_source_ref === undefined ? {} : { installed_source_ref: skill.installed_source_ref }),
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
