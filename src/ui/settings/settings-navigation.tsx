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
  CreditCard,
  Keyboard,
  MessageSquareText,
  Puzzle,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/i18n/context";

import type { SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsNavKey = SettingsTab;

type SettingsNavigationGroup = "account" | "settings" | "features";

type SettingsNavigationEntry = {
  key: SettingsNavKey;
  label: string;
  icon: ComponentType<LucideProps>;
  group?: SettingsNavigationGroup;
};

type SettingsNavigationProps = {
  brandName: string;
  selectedTab: SettingsTab;
  activeTabRef: RefObject<HTMLButtonElement | null>;
};

/**
 * The settings rail has its own state and focus behavior so the modal stays a
 * composition root. Its dimensions follow the inspected Manus desktop shell:
 * compact identity/search area, 32px rows and stable grouped navigation.
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

  // Every row here opens an owner-backed panel. Keep the same grouped rail
  // rhythm as Manus, while exposing Kokoro capabilities that were already
  // implemented but hidden from the settings entry point.
  const nav: readonly SettingsNavigationEntry[] = [
    {
      key: "account",
      label: t("settings.accountTitle"),
      icon: UserRound,
      group: "account",
    },
    { key: "credits", label: t("settings.creditsTitle"), icon: Sparkles },
    {
      key: "subscription",
      label: t("settings.subTitle"),
      icon: CreditCard,
    },
    { key: "team", label: t("rail.navTeams"), icon: UsersRound },
    {
      key: "appearance",
      label: t("settings.generalTitle"),
      icon: Settings2,
      group: "settings",
    },
    {
      key: "shortcuts",
      label: t("settings.shortcutsNavTitle"),
      icon: Keyboard,
    },
    {
      key: "chat",
      label: t("settings.chatTitle"),
      icon: MessageSquareText,
    },
    {
      key: "personalization",
      label: t("settings.personalizationTitle"),
      icon: Shapes,
      group: "features",
    },
    { key: "mcp", label: t("connectorCatalog.title"), icon: Cable },
    { key: "skills", label: t("rail.navSkills"), icon: Puzzle },
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const renderedNav =
    normalizedQuery.length === 0
      ? nav
      : nav.filter(
          (entry) =>
            entry.key === selectedTab ||
            entry.label.toLocaleLowerCase().includes(normalizedQuery),
        );

  const syncScrollbar = useCallback((list: HTMLDivElement): void => {
    const maxScroll = list.scrollHeight - list.clientHeight;
    if (maxScroll <= 0 || list.clientHeight <= 0) {
      setScrollbar({ height: 0, top: 2 });
      return;
    }
    const height = Math.floor(
      (list.clientHeight - 6) * (list.clientHeight / list.scrollHeight),
    );
    const travel = list.clientHeight - 4 - height;
    setScrollbar({
      height,
      top: 2 + Math.round((list.scrollTop / maxScroll) * travel),
    });
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
    list.scrollTop +=
      activeRect.top +
      activeRect.height / 2 -
      (listRect.top + listRect.height / 2);
    syncScrollbar(list);
  }, [activeTabRef, selectedTab, syncScrollbar]);

  useLayoutEffect(() => {
    alignSelectedTab();
  }, [alignSelectedTab]);

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

  return (
    <nav className={styles.nav} aria-label={t("settings.title")}>
      <div className={styles.brand}>
        <div className={styles.brandIdentity}>
          <Avatar className={styles.brandAvatar}>
            <AvatarFallback>
              {brandName.trim().charAt(0).toUpperCase() || "K"}
            </AvatarFallback>
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
        <Input
          value={query}
          aria-label={t("settings.search")}
          placeholder={t("settings.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className={styles.tabRail}>
        <TabsList
          ref={tabListRef}
          className={styles.tabList}
          variant="line"
          onScroll={(event) => syncScrollbar(event.currentTarget)}
        >
          {renderedNav.map((entry) => {
            const { key, label, icon: Icon } = entry;
            const groupLabel =
              entry.group === "account"
                ? t("settings.accountTitle")
                : entry.group === "settings"
                  ? t("settings.groupGeneral")
                  : entry.group === "features"
                    ? t("settings.groupFeatures")
                    : null;
            return (
              <Fragment key={key}>
                {groupLabel ? (
                  <div className={styles.sectionLabel} aria-hidden="true">
                    {groupLabel}
                  </div>
                ) : null}
                <TabsTrigger
                  value={key}
                  className={styles.tab}
                  ref={key === selectedTab ? activeTabRef : undefined}
                  id={`settings-tab-${key}`}
                  data-testid={`settings-tab-${key}`}
                  data-settings-chat={key === "chat" ? "true" : undefined}
                  data-settings-team={key === "team" ? "true" : undefined}
                  data-settings-subscription={
                    key === "subscription" ? "true" : undefined
                  }
                >
                  <Icon aria-hidden="true" />
                  <span className={styles.tabLabel}>{label}</span>
                </TabsTrigger>
              </Fragment>
            );
          })}
        </TabsList>
        <span
          className={styles.navScrollbar}
          data-testid="settings-nav-scrollbar"
          data-visible={scrollbar.height > 0 || undefined}
          style={
            {
              height: `${scrollbar.height}px`,
              transform: `translateY(${scrollbar.top}px)`,
            } as CSSProperties
          }
          aria-hidden="true"
        />
      </div>
    </nav>
  );
}
