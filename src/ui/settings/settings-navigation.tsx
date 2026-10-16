"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import { useLocale } from "@/i18n/context";
import type { MessageKey } from "@/i18n/messages";
import { SettingsNavigationBrand } from "./settings-navigation-brand";
import { createSettingsNavigation, settingsGroupLabel } from "./settings-navigation-model";
import { SettingsNavigationRail } from "./settings-navigation-rail";
import type { SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsNavigationProps = {
  brandName: string;
  selectedTab: SettingsTab;
  activeTabRef: RefObject<HTMLButtonElement | null>;
  onSelectTab: (tab: SettingsTab) => void;
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

export function SettingsNavigation({ brandName, selectedTab, activeTabRef, onSelectTab }: SettingsNavigationProps) {
  const { t } = useLocale();
  const unavailableId = useId();
  const [query, setQuery] = useState("");
  const nav = useMemo(() => createSettingsNavigation(t), [t]);
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
  return <nav className={styles.nav} data-searching={searching ? "true" : undefined} aria-label={t("settings.title")}>
    <SettingsNavigationBrand brandName={brandName} scopeLabel={t("rail.userMenuScope")} searchLabel={t("settings.search")} clearLabel={t("settings.searchClear")} value={query} onValueChange={setQuery}>
        {searching ? (
          <div className={styles.searchResults}>
            {searchResults.length === 0 ? <p role="status" className={styles.searchEmpty}>{t("settings.searchEmpty")}</p> : (
              <ul className={styles.searchList}>
                {searchResults.map(({ entry, children }) => (
                  <li key={entry.kind === "tab" ? entry.key : entry.id}>
                    {entry.kind === "tab" ? (
                      <button type="button" className={styles.searchParent} onClick={() => onSelectTab(entry.key)}>{matchedLabel(entry.label, query.trim())}</button>
                    ) : (
                      <div className={styles.searchUnavailable} aria-disabled="true" aria-describedby={unavailableId}>{matchedLabel(entry.label, query.trim())}</div>
                    )}
                    {entry.kind === "tab" && children.length > 0 ? <ul className={styles.searchChildren}>
                      {children.map((child) => <li key={child.key}><button type="button" className={styles.searchChild} onClick={() => onSelectTab(entry.key)}>{matchedLabel(child.label, query.trim())}</button></li>)}
                    </ul> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

    </SettingsNavigationBrand>
    <p id={unavailableId} className={styles.unavailableNavigation}>{t("settings.unavailableNavigation")}</p>
    <SettingsNavigationRail entries={nav} selectedTab={selectedTab} activeTabRef={activeTabRef} onSelectTab={onSelectTab} moreLabel={t("settings.moreSections")} isFiltered={searching} unavailableId={unavailableId} groupLabel={(entry) => settingsGroupLabel(t, entry.group)} />
  </nav>;
}
