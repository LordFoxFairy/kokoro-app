"use client";

import { useMemo, useState, type RefObject } from "react";

import { useLocale } from "@/i18n/context";

import { SettingsNavigationBrand } from "./settings-navigation-brand";
import {
  createSettingsNavigation,
  settingsGroupLabel,
} from "./settings-navigation-model";
import { SettingsNavigationRail } from "./settings-navigation-rail";
import type { SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsNavigationProps = {
  brandName: string;
  selectedTab: SettingsTab;
  activeTabRef: RefObject<HTMLButtonElement | null>;
  onSelectTab: (tab: SettingsTab) => void;
};

/**
 * Settings navigation is a composition root only: identity/search, the shared
 * navigation model, and rail rendering each have an independent component.
 * This prevents a compact-layout adjustment from changing desktop navigation
 * data or panel state.
 */
export function SettingsNavigation({
  brandName,
  selectedTab,
  activeTabRef,
  onSelectTab,
}: SettingsNavigationProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const navigation = useMemo(() => createSettingsNavigation(t), [t]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const renderedNavigation =
    normalizedQuery.length === 0
      ? navigation
      : navigation.filter(
          (entry) =>
            (entry.kind === "tab" && entry.key === selectedTab) ||
            entry.label.toLocaleLowerCase().includes(normalizedQuery),
        );

  return (
    <nav className={styles.nav} aria-label={t("settings.title")}>
      <SettingsNavigationBrand
        brandName={brandName}
        scopeLabel={t("rail.userMenuScope")}
        searchLabel={t("settings.search")}
        value={query}
        onValueChange={setQuery}
      />
      <SettingsNavigationRail
        entries={renderedNavigation}
        selectedTab={selectedTab}
        activeTabRef={activeTabRef}
        onSelectTab={onSelectTab}
        moreLabel={t("settings.moreSections")}
        isFiltered={normalizedQuery.length > 0}
        groupLabel={(entry) => settingsGroupLabel(t, entry.group)}
      />
    </nav>
  );
}
