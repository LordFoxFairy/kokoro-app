"use client";

import { useId } from "react";
import { Smartphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function PhoneAssetsSection() {
  const t = useT();
  const unavailableId = useId();
  return (
    <div className={`${styles.servicePage} ${styles.assetPage}`} data-testid="settings-service-phone">
      <section className={styles.serviceEmpty}>
        <div className={styles.assetIconTile} aria-hidden="true"><Smartphone /></div>
        <h2>{t("settings.phoneTitle")}</h2>
        <p>{t("settingsServices.phoneDescription")}</p>
        <Button disabled aria-describedby={unavailableId}>
          <Plus aria-hidden="true" />{t("settingsServices.createPhone")}
        </Button>
        <p id={unavailableId} className={styles.serviceAvailability}>{t("settingsServices.phoneUnavailable")}</p>
      </section>
    </div>
  );
}
