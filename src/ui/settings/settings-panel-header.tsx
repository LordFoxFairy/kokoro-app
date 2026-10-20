"use client";

import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { useLocale } from "@/i18n/context";

import type { AccountDetail, SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsPanelHeaderProps = {
  tab: SettingsTab;
  accountDetail: AccountDetail;
  onBackFromAccountDetail: () => void;
  skillsCatalogOpen?: boolean;
  onBackFromSkillsCatalog?: () => void;
};

function panelTitle(
  t: ReturnType<typeof useLocale>["t"],
  tab: SettingsTab,
): string {
  switch (tab) {
    case "mcp":
      return t("mcp.title");
    case "appearance":
      return t("settings.generalTitle");
    case "shortcuts":
      return t("settings.shortcutsTitle");
    case "skills":
      return t("skills.addedTitle");
    case "account":
      return t("settings.accountTitle");
    case "personalization":
      return t("settings.personalizationTitle");
    case "chat":
      return t("settings.chatTitle");
    case "credits":
      return t("settings.creditsTitle");
    case "subscription":
      return t("settings.subTitle");
    case "data-management":
      return t("settings.dataManagementTitle");
    case "help":
      return t("settings.helpTitle");
    case "team":
      return t("rail.navTeams");
    case "mail":
      return t("settings.mailTitle");
    case "email":
      return t("settings.email");
    case "phone":
      return t("settings.phoneTitle");
    case "wallet":
      return t("settings.walletTitle");
    case "integration":
      return t("settings.integrationTitle");
    case "developer":
      return t("settings.developerTitle");
  }
}

/** Shared heading for each navigable settings page. */
export function SettingsPanelHeader({
  tab,
  accountDetail,
  onBackFromAccountDetail,
  skillsCatalogOpen = false,
  onBackFromSkillsCatalog,
}: SettingsPanelHeaderProps) {
  const { t } = useLocale();
  const accountHeading = useRef<HTMLHeadingElement>(null);
  const showingAccountDetail = tab === "account" && accountDetail !== null;
  useLayoutEffect(() => {
    if (showingAccountDetail) accountHeading.current?.focus();
  }, [showingAccountDetail, accountDetail]);
  if (tab === "data-management" || tab === "integration") return null;
  const hasDescription = tab === "shortcuts" || tab === "personalization";
  const showingSkillsCatalog = tab === "skills" && skillsCatalogOpen;
  const title = showingAccountDetail
    ? t(accountDetail === "devices" ? "settings.devices.title" : "settings.loginMethod")
    : showingSkillsCatalog
      ? t("skills.browse")
      : panelTitle(t, tab);

  return (
    <header
      className={styles.panelHeader}
      data-panel={tab}
      data-with-description={hasDescription || undefined}
      data-skills-catalog-open={showingSkillsCatalog || undefined}
    >
      <h1 ref={accountHeading} tabIndex={showingAccountDetail ? -1 : undefined} className={styles.panelTitle} aria-label={title}>
        {showingAccountDetail || showingSkillsCatalog ? (
          <button
            type="button"
            className={styles.panelBack}
            onClick={showingAccountDetail ? onBackFromAccountDetail : onBackFromSkillsCatalog}
            aria-label={showingAccountDetail ? t("settingsServices.backToAccount") : t("skills.addedTitle")}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
        <span>{title}</span>
      </h1>
      {tab === "shortcuts" ? (
        <p className={styles.panelDescription}>
          {t("settings.shortcutsDescription")}
        </p>
      ) : null}
      {tab === "personalization" ? (
        <p className={styles.panelDescription}>
          {t("settings.personalizationDescription")}
        </p>
      ) : null}
    </header>
  );
}
