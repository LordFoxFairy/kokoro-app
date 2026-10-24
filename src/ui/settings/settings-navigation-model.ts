import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Building2,
  Cable,
  CircleHelp,
  Code2,
  DatabaseBackup,
  Keyboard,
  Mail,
  Monitor,
  Puzzle,
  Settings2,
  Shapes,
  Smartphone,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";

import type { useLocale } from "@/i18n/context";

import type { SettingsTab } from "./settings-types";

export type SettingsNavigationGroup =
  | "account"
  | "settings"
  | "features"
  | "assets"
  | "data"
  | "support";

type SettingsNavigationBase = {
  label: string;
  icon: ComponentType<LucideProps>;
  group?: SettingsNavigationGroup;
};

export type SettingsNavigationTab = SettingsNavigationBase & {
  kind: "tab";
  key: SettingsTab;
};

export type SettingsNavigationPlaceholder = SettingsNavigationBase & {
  kind: "placeholder";
  id:
    | "computer"
    | "data-management"
    | "help";
};

export type SettingsNavigationEntry =
  | SettingsNavigationTab
  | SettingsNavigationPlaceholder;

type Translate = ReturnType<typeof useLocale>["t"];

export function createSettingsNavigation(
  t: Translate,
): readonly SettingsNavigationEntry[] {
  return [
    {
      kind: "tab",
      key: "account",
      label: t("settings.accountTitle"),
      icon: UserRound,
      group: "account",
    },
    {
      kind: "tab",
      key: "credits",
      label: t("settings.creditsTitle"),
      icon: Sparkles,
    },
    {
      kind: "tab",
      key: "appearance",
      label: t("settings.generalTitle"),
      icon: Settings2,
      group: "settings",
    },
    {
      kind: "tab",
      key: "shortcuts",
      label: t("settings.shortcutsNavTitle"),
      icon: Keyboard,
    },
    {
      kind: "tab",
      key: "personalization",
      label: t("settings.personalizationTitle"),
      icon: Shapes,
      group: "features",
    },
    {
      kind: "tab",
      key: "mcp",
      label: t("connectorCatalog.title"),
      icon: Cable,
    },
    { kind: "tab", key: "skills", label: t("rail.navSkills"), icon: Puzzle },
    { kind: "tab", key: "subscription", label: t("settings.subTitle"), icon: WalletCards },
    {
      kind: "tab",
      key: "mail",
      label: t("settings.mailTitle"),
      icon: Mail,
    },
    {
      kind: "placeholder",
      id: "computer",
      label: t("settings.computerTitle"),
      icon: Monitor,
    },
    {
      kind: "tab",
      key: "email",
      label: t("settings.email"),
      icon: Mail,
      group: "assets",
    },
    {
      kind: "tab",
      key: "phone",
      label: t("settings.phoneTitle"),
      icon: Smartphone,
    },
    {
      kind: "tab",
      key: "wallet",
      label: t("settings.walletTitle"),
      icon: WalletCards,
    },
    {
      kind: "tab",
      key: "data-management",
      label: t("settings.dataManagementTitle"),
      icon: DatabaseBackup,
      group: "data",
    },
    {
      kind: "tab",
      key: "integration",
      label: t("settings.integrationTitle"),
      icon: Cable,
    },
    {
      kind: "tab",
      key: "developer",
      label: t("settings.developerTitle"),
      icon: Code2,
    },
    {
      kind: "tab",
      key: "team",
      label: t("rail.navTeams"),
      icon: Building2,
      group: "support",
    },
    {
      kind: "tab",
      key: "help",
      label: t("settings.helpTitle"),
      icon: CircleHelp,
    },
  ];
}

export function settingsGroupLabel(
  t: Translate,
  group: SettingsNavigationGroup | undefined,
): string | null {
  switch (group) {
    case "account":
      return t("settings.accountTitle");
    case "settings":
      return t("settings.groupGeneral");
    case "features":
      return t("settings.groupFeatures");
    case "assets":
      return t("settings.assetsTitle");
    case "data":
      return t("settings.groupData");
    default:
      return null;
  }
}
