"use client";

import { useId } from "react";
import { Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function IntegrationSettingsSection() {
  const t = useT();
  const unavailableId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-integration">
      <p className={styles.serviceIntro}>{t("settingsServices.integrationDescription")}</p>
      <p id={unavailableId} className={styles.serviceUnavailable}>{t("settingsServices.integrationUnavailable")}</p>
      <ul className={styles.serviceList}>
        {["Zapier", "Apple Messages", "Slack", "Telegram", "LINE"].map((provider) => (
          <li key={provider} className={styles.serviceListItem}>
            <div className={styles.serviceProvider}>
              <Cable className={styles.serviceIcon} aria-hidden="true" />
              <h2>{provider}</h2>
            </div>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.connect")}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
