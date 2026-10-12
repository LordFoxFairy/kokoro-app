"use client";

import { ChevronRight } from "lucide-react";

import { useLocale } from "@/i18n/context";

import type { SettingsIntegrationId, SettingsTab } from "./settings-types";
import styles from "./settings-modal.module.css";

type SettingsPanelHeaderProps = {
  tab: SettingsTab;
  accountLoginMethods: boolean;
  integrationId: SettingsIntegrationId | null;
  onBackFromLoginMethods: () => void;
  onBackFromIntegration: () => void;
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
    case "computer":
      return t("settings.computerTitle");
    case "deployment":
      return t("settings.deploymentTitle");
    case "integration":
      return t("settings.integrationTitle");
    case "chat":
      return t("settings.chatTitle");
    case "credits":
      return t("settings.creditsTitle");
    case "subscription":
      return t("settings.subTitle");
    case "team":
      return t("rail.navTeams");
  }
}

/** Header is separate from panel bodies so every setting section shares the
 * same inspected 24px/30px heading and border rhythm. */
export function SettingsPanelHeader({
  tab,
  accountLoginMethods,
  integrationId,
  onBackFromLoginMethods,
  onBackFromIntegration,
}: SettingsPanelHeaderProps) {
  const { t } = useLocale();
  const hasDescription =
    tab === "shortcuts" ||
    tab === "personalization" ||
    (tab === "integration" && integrationId === null);
  const title = accountLoginMethods
    ? t("settings.loginMethod")
    : integrationId !== null
      ? integrationId === "line"
        ? "LINE"
        : t(`settings.integration.${integrationId}.name`)
      : panelTitle(t, tab);

  return (
    <header
      className={styles.panelHeader}
      data-panel={tab}
      data-with-description={hasDescription || undefined}
    >
      <h1 className={styles.panelTitle}>
        {accountLoginMethods ? (
          <button
            type="button"
            className={styles.panelBack}
            onClick={onBackFromLoginMethods}
            aria-label={t("settings.loginMethod")}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : null}
        {integrationId !== null ? (
          <button
            type="button"
            className={styles.panelBack}
            onClick={onBackFromIntegration}
            aria-label={t("settings.integrationBack")}
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
      {tab === "integration" && integrationId === null ? (
        <p className={styles.panelDescription}>
          {t("settings.integrationDescription")}
        </p>
      ) : null}
    </header>
  );
}
