"use client";

import { useId } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function EmailAssetsSection() {
  const t = useT();
  const unavailableId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-email">
      <p className={styles.serviceIntro}>{t("settingsServices.emailDescription")}</p>
      <section className={styles.serviceEmpty}>
        <Mail className={styles.serviceEmptyIcon} aria-hidden="true" />
        <h2>{t("settings.email")}</h2>
        <p id={unavailableId}>{t("settingsServices.emailUnavailable")}</p>
        <Button disabled aria-describedby={unavailableId}>{t("settingsServices.create")}</Button>
      </section>
    </div>
  );
}
