"use client";

import { useMemo, useState, type RefObject } from "react";

import type { HubClient } from "@/hub/client";
import type { SkillCard } from "@/hub/schemas";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { createManusSkillHubClient } from "@/ui/skills/manus-skill-client";
import { SkillsContent } from "@/ui/skills/skills-panel";
import type { SkillsScopeFilter } from "@/ui/skills/skills-scope";

type SkillsSettingsSectionProps = {
  readBoundary: ProjectReadBoundary;
  hubClient: HubClient;
  preview: boolean;
  brandName: string;
  onTrySkill?: (skill: SkillCard) => void;
  onCreateWithAi?: (prompt?: string) => void;
  embeddedCatalogOpen: boolean;
  onEmbeddedCatalogOpenChange: (open: boolean) => void;
  catalogTriggerRef: RefObject<HTMLButtonElement | null>;
  initialScope?: SkillsScopeFilter;
};

/** Settings embedding for Skills. Preview-only pin intent belongs to this
 * section, never to the settings dialog shell or live owner projection. */
export function SkillsSettingsSection({
  readBoundary,
  hubClient,
  preview,
  brandName,
  onTrySkill,
  onCreateWithAi,
  embeddedCatalogOpen,
  onEmbeddedCatalogOpenChange,
  catalogTriggerRef,
  initialScope,
}: SkillsSettingsSectionProps) {
  // The legacy Hub pool projection is retired for the live Settings surface.
  // Manus-compatible Skills reads use their typed owner operations; preview
  // continues to use its deterministic local client.
  const skillHubClient = useMemo(
    () => (preview ? hubClient : createManusSkillHubClient(hubClient, readBoundary)),
    [hubClient, preview, readBoundary],
  );
  const [previewPinnedSkills, setPreviewPinnedSkills] = useState<
    readonly string[]
  >([]);
  const togglePreviewPin = (name: string): void => {
    setPreviewPinnedSkills((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  };

  return (
    <SkillsContent
      readBoundary={readBoundary}
      client={skillHubClient}
      preview={preview}
      brandName={brandName}
      pinned={preview ? previewPinnedSkills : []}
      onTogglePin={preview ? togglePreviewPin : () => {}}
      {...(onTrySkill === undefined ? {} : { onTrySkill })}
      {...(onCreateWithAi === undefined ? {} : { onCreateWithAi })}
      embeddedCatalogOpen={embeddedCatalogOpen}
      onEmbeddedCatalogOpenChange={onEmbeddedCatalogOpenChange}
      catalogTriggerRef={catalogTriggerRef}
      {...(initialScope === undefined ? {} : { initialScope })}
      embedded
    />
  );
}
