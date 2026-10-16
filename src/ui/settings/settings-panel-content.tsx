"use client";

import type { RefObject } from "react";

import type { HubClient } from "@/hub/client";
import type { SkillCard } from "@/hub/schemas";
import type { TeamClient } from "@/team/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import type { SkillsScopeFilter } from "@/ui/skills/skills-scope";
import { BillingContent } from "@/ui/billing/billing-panel";
import { PricingContent } from "@/ui/billing/pricing-panel";
import { TeamContent } from "@/ui/team/team-panel";
import {
  browserBillingClient,
  browserPricingClient,
} from "@/ui/shell/page-clients";

import {
  DataManagementSection,
  HelpSection,
  AccountCard,
  AppearanceCard,
  ChatPrefsCard,
  ConnectorsSettingsSection,
  PersonalizationCard,
  ShortcutsCard,
  SkillsSettingsSection,
} from "./sections";
import type { SettingsTab } from "./settings-types";

type SettingsPanelContentProps = {
  tab: SettingsTab;
  brandName: string;
  preview: boolean;
  onArchiveChanged?: (state: import("@/lib/archived-tasks.schema").ArchiveState) => void;
  readBoundary?: ProjectReadBoundary;
  hubClient: HubClient;
  teamClient: TeamClient;
  accountLoginMethods: boolean;
  onAccountLoginMethodsChange: (open: boolean) => void;
  onOpenSubscription: () => void;
  onOpenPricing: () => void;
  onSelectSetting: (tab: SettingsTab) => void;
  onCreateSkillWithAi?: (prompt?: string) => void;
  onTrySkill?: (skill: SkillCard) => void;
  skillsCatalogOpen: boolean;
  onSkillsCatalogOpenChange: (open: boolean) => void;
  skillsCatalogTriggerRef: RefObject<HTMLButtonElement | null>;
  initialSkillsScope?: SkillsScopeFilter;
};

/**
 * Strict capability dispatcher. Each branch delegates to a section component
 * that owns its own local intent and nested dialogs; this module intentionally
 * contains no product state, loading state or modal lifecycle.
 */
export function SettingsPanelContent({
  tab,
  brandName,
  preview,
  readBoundary,
  onArchiveChanged,
  hubClient,
  teamClient,
  accountLoginMethods,
  onAccountLoginMethodsChange,
  onOpenSubscription,
  onOpenPricing,
  onSelectSetting,
  onCreateSkillWithAi,
  onTrySkill,
  skillsCatalogOpen,
  onSkillsCatalogOpenChange,
  skillsCatalogTriggerRef,
  initialSkillsScope,
}: SettingsPanelContentProps) {
  switch (tab) {
    case "data-management":
      return <DataManagementSection {...(onArchiveChanged===undefined?{}:{onArchiveChanged})} preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} />;
    case "help":
      return <HelpSection onSelectSetting={onSelectSetting} />;
    case "account":
      return (
        <AccountCard
          brandName={brandName}
          preview={preview}
          {...(readBoundary === undefined ? {} : { readBoundary })}
          loginMethodsOpen={accountLoginMethods}
          onLoginMethodsChange={onAccountLoginMethodsChange}
          onOpenSubscription={onOpenSubscription}
        />
      );
    case "appearance":
      return <AppearanceCard preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} />;
    case "personalization":
      return <PersonalizationCard preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} />;
    case "chat":
      return <ChatPrefsCard preview={preview} />;
    case "shortcuts":
      return <ShortcutsCard />;
    case "credits":
      return (
        <BillingContent
          preview={preview}
          {...(readBoundary === undefined ? {} : { readBoundary })}
          client={browserBillingClient({ preview })}
          onOpenPricing={onOpenPricing}
          embedded
        />
      );
    case "subscription":
      return (
        <PricingContent preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} client={browserPricingClient({ preview })} embedded />
      );
    case "skills":
      return (
        <SkillsSettingsSection
          readBoundary={
            readBoundary ?? { admitted: false, subject: null, generation: 0 }
          }
          hubClient={hubClient}
          preview={preview}
          brandName={brandName}
          {...(onTrySkill === undefined ? {} : { onTrySkill })}
          {...(onCreateSkillWithAi === undefined
            ? {}
            : { onCreateWithAi: onCreateSkillWithAi })}
          embeddedCatalogOpen={skillsCatalogOpen}
          onEmbeddedCatalogOpenChange={onSkillsCatalogOpenChange}
          catalogTriggerRef={skillsCatalogTriggerRef}
          {...(initialSkillsScope === undefined ? {} : { initialScope: initialSkillsScope })}
        />
      );
    case "mcp":
      return (
        <ConnectorsSettingsSection
          client={hubClient}
          preview={preview}
          brandName={brandName}
          {...(readBoundary === undefined ? {} : { readBoundary })}
        />
      );
    case "team":
      return <TeamContent client={teamClient} preview={preview} {...(readBoundary === undefined ? {} : { readBoundary })} embedded />;
  }
}
