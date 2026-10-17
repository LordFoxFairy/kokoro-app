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
  readBoundary?: ProjectReadBoundary;
  hubClient: HubClient;
  teamClient: TeamClient;
  accountLoginMethods: boolean;
  onAccountLoginMethodsChange: (open: boolean) => void;
  onOpenSubscription: () => void;
  onOpenPricing: () => void;
  onCreateSkillWithAi?: (prompt?: string) => void;
  onTrySkill?: (skill: SkillCard, prompt?: string) => boolean;
  skillsCatalogOpen: boolean;
  onSkillsCatalogOpenChange: (open: boolean) => void;
  skillsCatalogTriggerRef: RefObject<HTMLButtonElement | null>;
  skillsScope: SkillsScopeFilter;
  onSkillsScopeChange: (scope: SkillsScopeFilter) => void;
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
  hubClient,
  teamClient,
  accountLoginMethods,
  onAccountLoginMethodsChange,
  onOpenSubscription,
  onOpenPricing,
  onCreateSkillWithAi,
  onTrySkill,
  skillsCatalogOpen,
  onSkillsCatalogOpenChange,
  skillsCatalogTriggerRef,
  skillsScope,
  onSkillsScopeChange,
}: SettingsPanelContentProps) {
  switch (tab) {
    case "account":
      return (
        <AccountCard
          brandName={brandName}
          preview={preview}
          subject={
            readBoundary?.admitted === true ? readBoundary.subject : null
          }
          loginMethodsOpen={accountLoginMethods}
          onLoginMethodsChange={onAccountLoginMethodsChange}
          onOpenSubscription={onOpenSubscription}
        />
      );
    case "appearance":
      return <AppearanceCard />;
    case "personalization":
      return (
        <PersonalizationCard
          preview={preview}
          subject={
            readBoundary?.admitted === true ? readBoundary.subject : null
          }
        />
      );
    case "chat":
      return <ChatPrefsCard preview={preview} />;
    case "shortcuts":
      return <ShortcutsCard />;
    case "credits":
      return (
        <BillingContent
          client={browserBillingClient({ preview })}
          onOpenPricing={onOpenPricing}
          embedded
        />
      );
    case "subscription":
      return (
        <PricingContent client={browserPricingClient({ preview })} embedded />
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
          selectedScope={skillsScope}
          onScopeChange={onSkillsScopeChange}
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
      return <TeamContent client={teamClient} embedded />;
  }
}
