"use client";

import { useMemo, useRef, useState, type RefObject } from "react";

import type { HubClient } from "@/hub/client";
import type { SkillCard } from "@/hub/schemas";
import type { TeamClient } from "@/team/client";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
import { SkillsContent } from "@/ui/skills/skills-panel";
import { createManusSkillHubClient } from "@/ui/skills/manus-skill-client";
import {
  McpContent,
  McpCreateDialog,
  type McpCreateMode,
} from "@/ui/mcp/mcp-panel";
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
  DeploymentSettingsCard,
  IntegrationSettingsCard,
  MyComputerCard,
  PersonalizationCard,
  ShortcutsCard,
} from "./sections";
import type { SettingsIntegrationId, SettingsTab } from "./settings-types";

type SettingsPanelContentProps = {
  tab: SettingsTab;
  brandName: string;
  preview: boolean;
  readBoundary?: ProjectReadBoundary;
  hubClient: HubClient;
  teamClient: TeamClient;
  accountLoginMethods: boolean;
  integrationId: SettingsIntegrationId | null;
  previewPinnedSkills: readonly string[];
  domainUpgradeReturnRef: RefObject<HTMLElement | null>;
  onAccountLoginMethodsChange: (open: boolean) => void;
  onOpenSubscription: () => void;
  onIntegrationSelect: (id: SettingsIntegrationId | null) => void;
  onTogglePreviewPinnedSkill: (name: string) => void;
  onOpenPricing: () => void;
  onBuyDomain: () => void;
  onStartDeployment?: (kind: "website" | "app") => void;
  onCreateSkillWithAi?: () => void;
  onTrySkill?: (skill: SkillCard) => void;
};

/** Each branch owns one existing settings capability. This keeps the modal
 * shell free from product-panel wiring and avoids reintroducing a catch-all
 * settings component as sections evolve independently. */
export function SettingsPanelContent({
  tab,
  brandName,
  preview,
  readBoundary,
  hubClient,
  teamClient,
  accountLoginMethods,
  integrationId,
  previewPinnedSkills,
  domainUpgradeReturnRef,
  onAccountLoginMethodsChange,
  onOpenSubscription,
  onIntegrationSelect,
  onTogglePreviewPinnedSkill,
  onOpenPricing,
  onBuyDomain,
  onStartDeployment,
  onCreateSkillWithAi,
  onTrySkill,
}: SettingsPanelContentProps) {
  switch (tab) {
    case "account":
      return (
        <AccountCard
          brandName={brandName}
          preview={preview}
          loginMethodsOpen={accountLoginMethods}
          onLoginMethodsChange={onAccountLoginMethodsChange}
          onOpenSubscription={onOpenSubscription}
        />
      );
    case "appearance":
      return <AppearanceCard preview={preview} />;
    case "personalization":
      return <PersonalizationCard preview={preview} />;
    case "computer":
      return <MyComputerCard brandName={brandName} preview={preview} />;
    case "deployment":
      return (
        <DeploymentSettingsCard
          {...(onStartDeployment === undefined
            ? {}
            : { onStart: onStartDeployment })}
          onBuyDomain={() => {
            domainUpgradeReturnRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            onBuyDomain();
          }}
        />
      );
    case "integration":
      return (
        <IntegrationSettingsCard
          brandName={brandName}
          preview={preview}
          selected={integrationId}
          onSelect={onIntegrationSelect}
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
        <SkillsSettingsContent
          hubClient={hubClient}
          preview={preview}
          brandName={brandName}
          pinned={preview ? previewPinnedSkills : []}
          onTogglePin={preview ? onTogglePreviewPinnedSkill : () => {}}
          {...(onTrySkill === undefined ? {} : { onTrySkill })}
          {...(onCreateSkillWithAi === undefined
            ? {}
            : { onCreateWithAi: onCreateSkillWithAi })}
        />
      );
    case "mcp":
      return (
        <ConnectorsSettingsContent
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

function SkillsSettingsContent({
  hubClient,
  preview,
  brandName,
  pinned,
  onTogglePin,
  onTrySkill,
  onCreateWithAi,
}: {
  hubClient: HubClient;
  preview: boolean;
  brandName: string;
  pinned: readonly string[];
  onTogglePin: (name: string) => void;
  onTrySkill?: (skill: SkillCard) => void;
  onCreateWithAi?: () => void;
}) {
  const client = useMemo(
    () => (preview ? hubClient : createManusSkillHubClient(hubClient)),
    [hubClient, preview],
  );
  return (
    <SkillsContent
      client={client}
      preview={preview}
      brandName={brandName}
      pinned={pinned}
      onTogglePin={onTogglePin}
      {...(onTrySkill === undefined ? {} : { onTrySkill })}
      {...(onCreateWithAi === undefined ? {} : { onCreateWithAi })}
      embedded
    />
  );
}

function ConnectorsSettingsContent({
  client,
  preview,
  brandName,
  readBoundary,
}: {
  client: HubClient;
  preview: boolean;
  brandName: string;
  readBoundary?: ProjectReadBoundary;
}) {
  const [mode, setMode] = useState<McpCreateMode | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openCreate = (
    nextMode: McpCreateMode,
    target?: HTMLElement | null,
  ): void => {
    returnFocusRef.current = target ?? null;
    setMode(nextMode);
  };

  return (
    <>
      <McpContent
        client={client}
        preview={preview}
        embedded
        initialView="connections"
        settingsLayout
        brandName={brandName}
        {...(readBoundary === undefined ? {} : { readBoundary })}
        onCreateMcp={openCreate}
      />
      {mode === null ? null : (
        <McpCreateDialog
          client={client}
          mode={mode}
          open
          onOpenChange={(open) => {
            if (!open) setMode(null);
          }}
          onDone={async () => {
            setMode(null);
          }}
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}
