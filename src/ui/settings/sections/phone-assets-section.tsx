"use client";

import { useId } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function PhoneAssetsSection() {
  const t = useT();
  const unavailableId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-phone">
      <p className={styles.serviceIntro}>{t("settingsServices.phoneDescription")}</p>
      <section className={styles.serviceEmpty}>
        <Phone className={styles.serviceEmptyIcon} aria-hidden="true" />
        <h2>{t("settings.phoneTitle")}</h2>
        <p id={unavailableId}>{t("settingsServices.phoneUnavailable")}</p>
        <Button disabled aria-describedby={unavailableId}>{t("settingsServices.createPhone")}</Button>
      </section>
    </div>
  );
}
