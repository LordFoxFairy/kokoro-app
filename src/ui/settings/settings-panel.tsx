"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import type { HubClient } from "@/hub/client";
import type { SkillCard } from "@/hub/schemas";
import type { TeamClient } from "@/team/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { SkillsScopeFilter } from "@/ui/skills/skills-scope";

import styles from "./settings-modal.module.css";
import { SettingsPanelContent } from "./settings-panel-content";
import { SettingsPanelHeader } from "./settings-panel-header";
import { SETTINGS_TABS, type SettingsTab } from "./settings-types";

type SettingsPanelProps = {
  activeTab: SettingsTab;
  skillsScope: SkillsScopeFilter;
  onSkillsScopeChange: (scope: SkillsScopeFilter) => void;
  skillsCatalogOpen: boolean;
  onSkillsCatalogOpenChange: (open: boolean) => void;
  brandName: string;
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  hubClient: HubClient;
  teamClient: TeamClient;
  onSelectTab: (tab: SettingsTab) => void;
  onCreateSkillWithAi?: (prompt?: string) => void;
  onTrySkill?: (skill: SkillCard, prompt?: string) => boolean;
};

/**
 * Owns the tab-panel viewport and the small amount of state shared by an
 * account sub-page and its heading. The dialog shell only coordinates opening,
 * focus recovery and top-level tab selection; product sections stay below this
 * boundary.
 */
export function SettingsPanel({
  activeTab,
  skillsScope,
  onSkillsScopeChange,
  skillsCatalogOpen,
  onSkillsCatalogOpenChange,
  brandName,
  preview,
  readBoundary,
  hubClient,
  teamClient,
  onSelectTab,
  onCreateSkillWithAi,
  onTrySkill,
}: SettingsPanelProps) {
  const [accountLoginMethods, setAccountLoginMethods] = useState(false);
  const skillsCatalogTriggerRef = useRef<HTMLButtonElement | null>(null);


  return (
    <>
      {SETTINGS_TABS.map((panelTab) => (
        <TabsContent
          key={panelTab}
          value={panelTab}
          className={styles.content}
          data-testid={`settings-panel-${panelTab}`}
        >
          {panelTab === activeTab ? (
            <ScrollArea
              className={cn(
                styles.contentBody,
                panelTab === "shortcuts" && styles.shortcutsBody,
              )}
              tabIndex={0}
            >
              <div className={styles.contentColumn} data-panel={panelTab}>
                <SettingsPanelHeader
                  tab={panelTab}
                  accountLoginMethods={accountLoginMethods}
                  onBackFromLoginMethods={() => setAccountLoginMethods(false)}
                  skillsCatalogOpen={panelTab === "skills" && skillsCatalogOpen}
                  onBackFromSkillsCatalog={() => {
                    onSkillsCatalogOpenChange(false);
                    window.requestAnimationFrame(() =>
                      skillsCatalogTriggerRef.current?.focus({ preventScroll: true }),
                    );
                  }}
                />
                <SettingsPanelContent
                  tab={panelTab}
                  brandName={brandName}
                  preview={preview}
                  {...(readBoundary === undefined ? {} : { readBoundary })}
                  hubClient={hubClient}
                  teamClient={teamClient}
                  accountLoginMethods={accountLoginMethods}
                  onAccountLoginMethodsChange={setAccountLoginMethods}
                  onOpenSubscription={() => onSelectTab("subscription")}
                  onOpenPricing={() => onSelectTab("subscription")}
                  skillsCatalogOpen={skillsCatalogOpen}
                  onSkillsCatalogOpenChange={onSkillsCatalogOpenChange}
                  skillsCatalogTriggerRef={skillsCatalogTriggerRef}
                  skillsScope={skillsScope}
                  onSkillsScopeChange={onSkillsScopeChange}
                  {...(onCreateSkillWithAi === undefined
                    ? {}
                    : { onCreateSkillWithAi })}
                  {...(onTrySkill === undefined ? {} : { onTrySkill })}
                />
              </div>
            </ScrollArea>
          ) : null}
        </TabsContent>
      ))}
    </>
  );
}
