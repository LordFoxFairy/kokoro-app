"use client";

import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import type { LucideProps } from "lucide-react";
import {
  ArrowUpRight,
  Building2,
  Cable,
  ChevronsUpDown,
  CircleHelp,
  Code2,
  DatabaseBackup,
  Keyboard,
  Mail,
  Monitor,
  Puzzle,
  Search,
  Settings2,
  Shapes,
  Smartphone,
  Sparkles,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/i18n/context";
import type { MessageKey } from "@/i18n/messages";

import type { SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsNavigationGroup =
  | "account"
  | "settings"
  | "features"
  | "assets"
  | "data"
  | "support";

type SettingsNavigationEntry = {
  kind: "tab";
  key: SettingsTab;
  label: string;
  icon: ComponentType<LucideProps>;
  group?: SettingsNavigationGroup;
};

type SettingsPlaceholderEntry = {
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
  label: string;
  icon: ComponentType<LucideProps>;
  group?: SettingsNavigationGroup;
};

type SettingsNavigationEntryOrPlaceholder =
  | SettingsNavigationEntry
  | SettingsPlaceholderEntry;

type SettingsNavigationProps = {
  brandName: string;
  selectedTab: SettingsTab;
  activeTabRef: RefObject<HTMLButtonElement | null>;
  onSelectSetting: (tab: SettingsTab) => void;
};

// Only labels already visible on navigable product pages belong here. Values,
// hidden dialogs and the separate Skills/connector catalogs are not indexed.
const settingLabels: Partial<Record<SettingsTab, readonly MessageKey[]>> = {
  account: ["settings.fullName", "settings.email", "settings.userId", "settings.loginMethod", "settings.devices.title", "settings.deleteAccount"],
  appearance: ["settings.appearanceSection", "settings.notificationsGroup", "settings.language", "settings.theme", "settings.taskDelivery", "settings.browserNotifications", "settings.soundNotifications", "settings.productUpdates", "settings.brandAds"],
  shortcuts: ["settings.shortcutNewTask", "settings.shortcutSearch", "settings.shortcutSidebar", "settings.shortcutCopyTaskLink", "settings.shortcutVoice"],
  personalization: ["settings.personalProfile", "settings.nickname", "settings.occupation", "settings.aboutYou", "settings.customInstructions", "settings.knowledge", "settings.importFromAi", "settings.importMemory", "settings.importMemoryAction"],
  credits: ["billing.ledgerTitle"],
  team: ["team.membersTitle", "team.invitesTitle"],
  "data-management": ["data.sharedTasks", "data.sharedFiles", "data.archivedTasks", "data.authorizedApps", "data.cloudBrowser", "data.domains"],
  help: ["help.accountTitle", "help.shareTitle", "help.limitsTitle"],
};

// Case folding can expand a code point. Only use folded offsets when they
// still address the original text; React escapes every rendered fragment.
function matchedLabel(label: string, query: string) {
  const folded = label.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const index = folded.indexOf(needle);
  if (index < 0 || folded.length !== label.length || needle.length !== query.length) return label;
  return <>{label.slice(0, index)}<mark>{label.slice(index, index + query.length)}</mark>{label.slice(index + query.length)}</>;
}

/**
 * Navigation only exposes a selectable tab when its backing capability exists.
 * Muted rows keep the same information architecture as the reference surface
 * without presenting an unfinished owner API as an interactive setting.
 */
export function SettingsNavigation({
  brandName,
  selectedTab,
  activeTabRef,
  onSelectSetting,
}: SettingsNavigationProps) {
  const { t } = useLocale();
  const unavailableId = useId();
  const [query, setQuery] = useState("");
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const nav: readonly SettingsNavigationEntryOrPlaceholder[] = [
    { kind: "tab", key: "account", label: t("settings.accountTitle"), icon: UserRound, group: "account" },
    { kind: "tab", key: "credits", label: t("settings.creditsTitle"), icon: Sparkles },
    { kind: "tab", key: "appearance", label: t("settings.generalTitle"), icon: Settings2, group: "settings" },
    { kind: "tab", key: "shortcuts", label: t("settings.shortcutsNavTitle"), icon: Keyboard },
    { kind: "tab", key: "personalization", label: t("settings.personalizationTitle"), icon: Shapes, group: "features" },
    { kind: "tab", key: "mcp", label: t("connectorCatalog.title"), icon: Cable },
    { kind: "tab", key: "skills", label: t("rail.navSkills"), icon: Puzzle },
    { kind: "tab", key: "subscription", label: t("settings.subTitle"), icon: WalletCards },
    { kind: "placeholder", id: "mail", label: t("settings.mailTitle"), icon: Mail },
    { kind: "placeholder", id: "computer", label: t("settings.computerTitle"), icon: Monitor },
    { kind: "placeholder", id: "email", label: t("settings.email"), icon: Mail, group: "assets" },
    { kind: "placeholder", id: "phone", label: t("settings.phoneTitle"), icon: Smartphone },
    { kind: "placeholder", id: "wallet", label: t("settings.walletTitle"), icon: WalletCards },
    { kind: "tab", key: "data-management", label: t("settings.dataManagementTitle"), icon: DatabaseBackup, group: "data" },
    { kind: "placeholder", id: "integration", label: t("settings.integrationTitle"), icon: Cable },
    { kind: "placeholder", id: "developer", label: t("settings.developerTitle"), icon: Code2 },
    { kind: "tab", key: "team", label: t("rail.navTeams"), icon: Building2, group: "support" },
    { kind: "tab", key: "help", label: t("settings.helpTitle"), icon: CircleHelp },
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searching = normalizedQuery.length > 0;
  const searchResults = searching ? nav.flatMap((entry) => {
    const children = entry.kind === "tab"
      ? (settingLabels[entry.key] ?? []).map((key) => ({ key, label: t(key) }))
        .filter((child) => child.label.toLocaleLowerCase().includes(normalizedQuery))
      : [];
    return entry.label.toLocaleLowerCase().includes(normalizedQuery) || children.length > 0
      ? [{ entry, children }] : [];
  }) : [];

  // Preserve the reference panel's initial top-of-rail position. Only move
  // enough to reveal a selected row that is actually outside the viewport;
  // centering every selection clipped the account rows on initial open.
  useLayoutEffect(() => {
    const list = tabListRef.current;
    const active = activeTabRef.current;
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const edge = 4;
    if (activeRect.top < listRect.top + edge) {
      list.scrollTop += activeRect.top - listRect.top - edge;
    } else if (activeRect.bottom > listRect.bottom - edge) {
      list.scrollTop += activeRect.bottom - listRect.bottom + edge;
    }
  }, [activeTabRef, selectedTab]);

  const groupLabel = (group: SettingsNavigationGroup | undefined): string | null => {
    switch (group) {
      case "account": return t("settings.accountTitle");
      case "settings": return t("settings.groupGeneral");
      case "features": return t("settings.groupFeatures");
      case "assets": return t("settings.assetsTitle");
      case "data": return t("settings.groupData");
      default: return null;
    }
  };

  return (
    <nav className={styles.nav} data-searching={searching ? "true" : undefined} aria-label={t("settings.title")}>
      <div className={styles.brand}>
        <div className={styles.brandIdentity}>
          <Avatar className={styles.brandAvatar}>
            <AvatarFallback>{brandName.trim().charAt(0).toUpperCase() || "K"}</AvatarFallback>
          </Avatar>
          <div className={styles.brandCopy}>
            <p className={styles.brandName}>{brandName}</p>
            <span className={styles.brandMeta}>{t("rail.userMenuScope")}</span>
          </div>
          <ChevronsUpDown className={styles.brandSwitcher} aria-hidden="true" />
        </div>
      </div>
      <div className={styles.searchToolbar}>
        <div className={styles.settingsSearch}>
          <Search aria-hidden="true" />
          <Input ref={searchRef} value={query} aria-label={t("settings.search")} placeholder={t("settings.search")} onChange={(event) => setQuery(event.target.value)} />
          {query.length > 0 ? <button type="button" className={styles.searchClear} aria-label={t("settings.searchClear")} onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X aria-hidden="true" /></button> : null}
        </div>
        {searching ? (
          <div className={styles.searchResults}>
            {searchResults.length === 0 ? <p role="status" className={styles.searchEmpty}>{t("settings.searchEmpty")}</p> : (
              <ul className={styles.searchList}>
                {searchResults.map(({ entry, children }) => (
                  <li key={entry.kind === "tab" ? entry.key : entry.id}>
                    {entry.kind === "tab" ? (
                      <button type="button" className={styles.searchParent} onClick={() => onSelectSetting(entry.key)}>{matchedLabel(entry.label, query.trim())}</button>
                    ) : (
                      <div className={styles.searchUnavailable} aria-disabled="true" aria-describedby={unavailableId}>{matchedLabel(entry.label, query.trim())}</div>
                    )}
                    {entry.kind === "tab" && children.length > 0 ? <ul className={styles.searchChildren}>
                      {children.map((child) => <li key={child.key}><button type="button" className={styles.searchChild} onClick={() => onSelectSetting(entry.key)}>{matchedLabel(child.label, query.trim())}</button></li>)}
                    </ul> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      <p id={unavailableId} className={styles.unavailableNavigation}>{t("settings.unavailableNavigation")}</p>
      <div className={styles.tabRail}>
        <TabsList ref={tabListRef} className={styles.tabList} variant="line">
          {nav.map((entry) => {
            const label = groupLabel(entry.group);
            const Icon = entry.icon;
            const itemKey = entry.kind === "tab" ? entry.key : entry.id;
            return (
              <Fragment key={itemKey}>
                {entry.group === "support" && normalizedQuery.length === 0 ? (
                  <div className={styles.supportDivider} aria-hidden="true" />
                ) : label ? <div className={styles.sectionLabel} aria-hidden="true">{label}</div> : null}
                {entry.kind === "tab" ? (
                  <TabsTrigger
                    value={entry.key}
                    className={styles.tab}
                    ref={entry.key === selectedTab ? activeTabRef : undefined}
                    id={`settings-tab-${entry.key}`}
                    data-testid={`settings-tab-${entry.key}`}
                    data-settings-chat={entry.key === "chat" ? "true" : undefined}
                    data-settings-team={entry.key === "team" ? "true" : undefined}
                  >
                    <Icon aria-hidden="true" />
                    <span className={styles.tabLabel}>{entry.label}</span>
                  </TabsTrigger>
                ) : (
                  <div className={styles.placeholderTab} data-testid={`settings-placeholder-${entry.id}`} aria-disabled="true" aria-describedby={unavailableId}>
                    <Icon aria-hidden="true" />
                    <span className={styles.tabLabel}>{entry.label}</span>
                    {entry.id === "help" ? <ArrowUpRight className={styles.helpExternal} aria-hidden="true" /> : null}
                  </div>
                )}
              </Fragment>
            );
          })}
        </TabsList>
      </div>
    </nav>
  );
}
