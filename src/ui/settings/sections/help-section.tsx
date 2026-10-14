"use client";
import { useLocale } from "@/i18n/context";
import type { SettingsTab } from "../settings-types";
import styles from "../settings-modal.module.css";
export function HelpSection({
  onSelectSetting,
}: {
  onSelectSetting: (tab: SettingsTab) => void;
}) {
  const { t } = useLocale();
  return (
    <div className={styles.dataManagement} data-testid="settings-help">
      <section>
        <h2>{t("help.accountTitle")}</h2>
        <p>{t("help.account")}</p>
        <button type="button" onClick={() => onSelectSetting("account")}>
          {t("settings.accountTitle")}
        </button>
      </section>
      <section>
        <h2>{t("help.shareTitle")}</h2>
        <p>{t("help.share")}</p>
        <button
          type="button"
          onClick={() => onSelectSetting("data-management")}
        >
          {t("settings.dataManagementTitle")}
        </button>
      </section>
      <section>
        <h2>{t("help.limitsTitle")}</h2>
        <p>{t("help.limits")}</p>
      </section>
    </div>
  );
}
