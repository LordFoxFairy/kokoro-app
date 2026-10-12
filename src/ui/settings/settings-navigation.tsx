"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type RefObject,
} from "react";
import type { LucideProps } from "lucide-react";
import {
  Cable,
  ChevronsUpDown,
  Keyboard,
  Mail,
  MessageSquareText,
  Monitor,
  Puzzle,
  Search,
  Settings2,
  Shapes,
  Smartphone,
  Sparkles,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/i18n/context";

import type { SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsNavigationGroup =
  | "account"
  | "settings"
  | "features"
  | "assets"
  | "integrations"
  | "team";

type SettingsNavigationEntry = {
  kind: "tab";
  key: SettingsTab;
  label: string;
  icon: ComponentType<LucideProps>;
  group?: SettingsNavigationGroup;
};

type SettingsPlaceholderEntry = {
  kind: "placeholder";
  id: "mail" | "computer" | "email" | "phone" | "wallet" | "integration";
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
};

/**
 * Navigation only exposes a selectable tab when its backing capability exists.
 * The muted Manus-shaped rows reserve the information architecture without
 * pretending that Mail, devices, or assets already have an owner API.
 */
export function SettingsNavigation({
  brandName,
  selectedTab,
  activeTabRef,
}: SettingsNavigationProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [scrollbar, setScrollbar] = useState({ height: 0, top: 2 });
  const tabListRef = useRef<HTMLDivElement | null>(null);

  const nav: readonly SettingsNavigationEntryOrPlaceholder[] = [
    { kind: "tab", key: "account", label: t("settings.accountTitle"), icon: UserRound, group: "account" },
    { kind: "tab", key: "credits", label: t("settings.creditsTitle"), icon: Sparkles },
    { kind: "tab", key: "appearance", label: t("settings.generalTitle"), icon: Settings2, group: "settings" },
    { kind: "tab", key: "shortcuts", label: t("settings.shortcutsNavTitle"), icon: Keyboard },
    { kind: "tab", key: "chat", label: t("settings.chatTitle"), icon: MessageSquareText },
    { kind: "tab", key: "personalization", label: t("settings.personalizationTitle"), icon: Shapes, group: "features" },
    { kind: "tab", key: "mcp", label: t("connectorCatalog.title"), icon: Cable },
    { kind: "tab", key: "skills", label: t("rail.navSkills"), icon: Puzzle },
    { kind: "placeholder", id: "mail", label: t("settings.mailTitle"), icon: Mail },
    { kind: "placeholder", id: "computer", label: t("settings.computerTitle"), icon: Monitor },
    { kind: "placeholder", id: "email", label: t("settings.email"), icon: Mail, group: "assets" },
    { kind: "placeholder", id: "phone", label: t("settings.phoneTitle"), icon: Smartphone },
    { kind: "placeholder", id: "wallet", label: t("settings.walletTitle"), icon: WalletCards },
    { kind: "placeholder", id: "integration", label: t("settings.integrationTitle"), icon: Cable, group: "integrations" },
    { kind: "tab", key: "team", label: t("rail.navTeams"), icon: UsersRound, group: "team" },
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const renderedNav = normalizedQuery.length === 0
    ? nav
    : nav.filter((entry) =>
      (entry.kind === "tab" && entry.key === selectedTab) ||
      entry.label.toLocaleLowerCase().includes(normalizedQuery));

  const syncScrollbar = useCallback((list: HTMLDivElement): void => {
    const maxScroll = list.scrollHeight - list.clientHeight;
    if (maxScroll <= 0 || list.clientHeight <= 0) {
      setScrollbar({ height: 0, top: 2 });
      return;
    }
    const height = Math.floor((list.clientHeight - 6) * (list.clientHeight / list.scrollHeight));
    const travel = list.clientHeight - 4 - height;
    setScrollbar({ height, top: 2 + Math.round((list.scrollTop / maxScroll) * travel) });
  }, []);

  const alignSelectedTab = useCallback((): void => {
    const list = tabListRef.current;
    const active = activeTabRef.current;
    if (!list || !active) return;
    if (selectedTab === "appearance") {
      list.scrollTop = 0;
      syncScrollbar(list);
      return;
    }
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    list.scrollTop += activeRect.top + activeRect.height / 2 - (listRect.top + listRect.height / 2);
    syncScrollbar(list);
  }, [activeTabRef, selectedTab, syncScrollbar]);

  useLayoutEffect(() => { alignSelectedTab(); }, [alignSelectedTab]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(alignSelectedTab);
    return () => window.cancelAnimationFrame(frame);
  }, [alignSelectedTab]);
  useEffect(() => {
    if (selectedTab !== "appearance") return;
    const reset = () => {
      const list = tabListRef.current;
      if (!list) return;
      list.scrollTop = 0;
      syncScrollbar(list);
    };
    reset();
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, [selectedTab, syncScrollbar]);

  const groupLabel = (group: SettingsNavigationGroup | undefined): string | null => {
    switch (group) {
      case "account": return t("settings.accountTitle");
      case "settings": return t("settings.groupGeneral");
      case "features": return t("settings.groupFeatures");
      case "assets": return t("settings.assetsTitle");
      case "integrations": return t("settings.groupData");
      case "team": return t("rail.navTeams");
      default: return null;
    }
  };

  return (
    <nav className={styles.nav} aria-label={t("settings.title")}>
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
      <label className={styles.settingsSearch}>
        <Search aria-hidden="true" />
        <Input value={query} aria-label={t("settings.search")} placeholder={t("settings.search")} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className={styles.tabRail}>
        <TabsList ref={tabListRef} className={styles.tabList} variant="line" onScroll={(event) => syncScrollbar(event.currentTarget)}>
          {renderedNav.map((entry) => {
            const label = groupLabel(entry.group);
            const Icon = entry.icon;
            const itemKey = entry.kind === "tab" ? entry.key : entry.id;
            return (
              <Fragment key={itemKey}>
                {label ? <div className={styles.sectionLabel} aria-hidden="true">{label}</div> : null}
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
                  <div className={styles.placeholderTab} data-testid={`settings-placeholder-${entry.id}`} aria-disabled="true">
                    <Icon aria-hidden="true" />
                    <span className={styles.tabLabel}>{entry.label}</span>
                  </div>
                )}
              </Fragment>
            );
          })}
        </TabsList>
        <span className={styles.navScrollbar} data-testid="settings-nav-scrollbar" data-visible={scrollbar.height > 0 || undefined} style={{ height: `${scrollbar.height}px`, transform: `translateY(${scrollbar.top}px)` } as CSSProperties} aria-hidden="true" />
      </div>
    </nav>
  );
}
