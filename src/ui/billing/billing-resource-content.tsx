"use client";

import { useId } from "react";
import { Monitor, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/context";
import { PhoneAssignmentDialog } from "@/ui/settings/sections/phone-assignment-dialog";
import styles from "./billing-panel.module.css";

export function BillingWebsiteUsage() {
  const t = useT();
  const reasonId = useId();
  return (
    <div className={styles.resourceContent}>
      <div className={styles.resourceToolbar}>
        <Button type="button" variant="outline" disabled aria-describedby={reasonId}>{t("billing.autoTopUp")}</Button>
        <p id={reasonId} className={styles.resourceUnavailable}>{t("billing.resourceFeatureUnavailable")}</p>
      </div>
      <div className={styles.resourceUsageCards}>
        {(["billing.cloudServices", "billing.artificialIntelligence", "billing.integrations"] as const).map((title) => (
          <section key={title} className={styles.resourceUsageBlock}><h2>{t(title)}</h2><p aria-describedby={reasonId}>—</p></section>
        ))}
      </div>
      <div className={styles.resourceDates}>
        <label><span>{t("billing.startDate")}</span><Input type="date" disabled aria-describedby={reasonId} /></label>
        <label><span>{t("billing.endDate")}</span><Input type="date" disabled aria-describedby={reasonId} /></label>
      </div>
    </div>
  );
}

export function BillingComputerUsage() {
  const t = useT();
  const reasonId = useId();
  return (
    <section className={`${styles.resourceContent} ${styles.resourceGuidance}`}>
      <span className={styles.resourceIcon}><Monitor aria-hidden="true" /></span>
      <h2>{t("billing.cloudComputer")}</h2>
      <p>{t("billing.cloudComputerDescription")}</p>
      <p id={reasonId} className={styles.resourceUnavailable}>{t("billing.resourceFeatureUnavailable")}</p>
      <Button type="button" disabled aria-describedby={reasonId}>{t("billing.createCloudComputer")}</Button>
    </section>
  );
}

export function BillingPhoneUsage() {
  const t = useT();
  return (
    <section className={`${styles.resourceContent} ${styles.resourceGuidance}`}>
      <span className={styles.resourceIcon}><Phone aria-hidden="true" /></span>
      <h2>{t("billing.phoneScope")}</h2>
      <p>{t("settingsServices.phoneDescription")}</p>
      <p className={styles.resourceUnavailable}>{t("settingsServices.phoneUnavailable")}</p>
      <PhoneAssignmentDialog />
    </section>
  );
}
