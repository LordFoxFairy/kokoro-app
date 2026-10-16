"use client";

import { useId } from "react";
import { CreditCard, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function WalletSettingsSection() {
  const t = useT();
  const paymentsId = useId();
  const invoicesId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-wallet">
      <p className={styles.serviceIntro}>{t("settingsServices.walletDescription")}</p>
      <section className={styles.serviceCard}>
        <div className={styles.serviceCardHeader}>
          <h2>{t("settingsServices.paymentMethods")}</h2>
          <CreditCard className={styles.serviceIcon} aria-hidden="true" />
        </div>
        <p id={paymentsId}>{t("settingsServices.paymentUnavailable")}</p>
        <Button variant="outline" disabled aria-describedby={paymentsId}>{t("settingsServices.add")}</Button>
      </section>
      <section className={styles.serviceCard}>
        <div className={styles.serviceCardHeader}>
          <h2>{t("settingsServices.invoices")}</h2>
          <ReceiptText className={styles.serviceIcon} aria-hidden="true" />
        </div>
        <p id={invoicesId}>{t("settingsServices.invoicesUnavailable")}</p>
        <Button variant="outline" disabled aria-describedby={invoicesId}>{t("settingsServices.viewDetails")}</Button>
      </section>
    </div>
  );
}
