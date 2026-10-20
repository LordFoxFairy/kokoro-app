"use client";

import { useId } from "react";
import { Mail } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmailCreateDialog } from "./email-create-dialog";
import styles from "./settings-sections.module.css";

export function EmailAssetsSection() {
  const t = useT();
  const unavailableId = useId();
  return (
    <div className={`${styles.servicePage} ${styles.assetPage}`} data-testid="settings-service-email">
      <section className={styles.serviceEmpty}>
        <Mail className={styles.serviceEmptyIcon} aria-hidden="true" />
        <h2>{t("settings.email")}</h2>
        <p>{t("settingsServices.emailDescription")}</p>
        <EmailCreateDialog />
        <p id={unavailableId} className={styles.serviceAvailability}>{t("settingsServices.emailUnavailable")}</p>
      </section>
    </div>
  );
}
