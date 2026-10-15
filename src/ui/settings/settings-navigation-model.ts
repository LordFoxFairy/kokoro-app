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
    | "mail"
    | "computer"
    | "email"
    | "phone"
    | "wallet"
    | "data-management"
    | "integration"
    | "developer"
    | "help";
};

export type SettingsNavigationEntry =
  | SettingsNavigationTab
  | SettingsNavigationPlaceholder;

type Translate = ReturnType<typeof useLocale>["t"];

/** The compact rail contains only the six labels which fit the 380px Manus
 * sheet without clipping. Skills remains reachable from the same More menu as
 * the secondary destinations; it must not leave a dangling “技” before that
 * affordance when the sheet narrows. */
export const COMPACT_PRIMARY_TABS = new Set<SettingsTab>([
  "account",
  "credits",
  "appearance",
  "shortcuts",
  "personalization",
  "mcp",
]);

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
    {
      kind: "placeholder",
      id: "mail",
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
      kind: "placeholder",
      id: "email",
      label: t("settings.email"),
      icon: Mail,
      group: "assets",
    },
    {
      kind: "placeholder",
      id: "phone",
      label: t("settings.phoneTitle"),
      icon: Smartphone,
    },
    {
      kind: "placeholder",
      id: "wallet",
      label: t("settings.walletTitle"),
      icon: WalletCards,
    },
    {
      kind: "placeholder",
      id: "data-management",
      label: t("settings.dataManagementTitle"),
      icon: DatabaseBackup,
      group: "data",
    },
    {
      kind: "placeholder",
      id: "integration",
      label: t("settings.integrationTitle"),
      icon: Cable,
    },
    {
      kind: "placeholder",
      id: "developer",
      label: t("settings.developerTitle"),
      icon: Code2,
    },
    {
      kind: "tab",
      key: "team",
      label: t("settings.createTeam"),
      icon: Building2,
      group: "support",
    },
    {
      kind: "placeholder",
      id: "help",
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
