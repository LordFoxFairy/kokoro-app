"use client";

import { useEffect, useRef, useState } from "react";

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
  initialSkillsScope?: SkillsScopeFilter;
  brandName: string;
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  onArchiveChanged?: (state: import("@/lib/archived-tasks.schema").ArchiveState) => void;
  hubClient: HubClient;
  teamClient: TeamClient;
  onSelectTab: (tab: SettingsTab) => void;
  onCreateSkillWithAi?: (prompt?: string) => void;
  onTrySkill?: (skill: SkillCard) => void;
};

/**
 * Owns the tab-panel viewport and the small amount of state shared by an
 * account sub-page and its heading. The dialog shell only coordinates opening,
 * focus recovery and top-level tab selection; product sections stay below this
 * boundary.
 */
export function SettingsPanel({
  activeTab,
  initialSkillsScope,
  brandName,
  preview,
  readBoundary,
  onArchiveChanged,
  hubClient,
  teamClient,
  onSelectTab,
  onCreateSkillWithAi,
  onTrySkill,
}: SettingsPanelProps) {
  const [accountLoginMethods, setAccountLoginMethods] = useState(false);
  const [skillsCatalogOpen, setSkillsCatalogOpen] = useState(false);
  const skillsCatalogTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Explore is a nested Skills view, not a second top-level Settings route.
  // Leaving Skills must therefore restore the installed-skills panel before a
  // later return; otherwise the hidden nested state could suppress the title
  // and make another Settings tab appear to inherit the Explore layout.
  useEffect(() => {
    if (activeTab === "skills") return;
    // Defer the visual reset until after the active panel change has committed.
    // This avoids an extra synchronous render while preserving a clean Skills
    // entry on the next tab visit.
    const resetCatalog = window.requestAnimationFrame(() => setSkillsCatalogOpen(false));
    return () => window.cancelAnimationFrame(resetCatalog);
  }, [activeTab]);

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
                panelTab === "mcp" && styles.mcpBody,
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
                    setSkillsCatalogOpen(false);
                    window.requestAnimationFrame(() =>
                      skillsCatalogTriggerRef.current?.focus({ preventScroll: true }),
                    );
                  }}
                />
                <SettingsPanelContent
                  tab={panelTab}
                  onSelectSetting={onSelectTab}
                  {...(onArchiveChanged === undefined ? {} : { onArchiveChanged })}
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
                  onSkillsCatalogOpenChange={setSkillsCatalogOpen}
                  skillsCatalogTriggerRef={skillsCatalogTriggerRef}
                  {...(initialSkillsScope === undefined ? {} : { initialSkillsScope })}
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
