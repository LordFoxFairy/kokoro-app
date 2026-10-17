"use client";

import { useId } from "react";
import { ArrowUpRight, CreditCard, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function WalletSettingsSection() {
  const t = useT();
  const paymentsId = useId();
  const invoicesId = useId();
  return (
    <div className={`${styles.servicePage} ${styles.walletPage}`} data-testid="settings-service-wallet">
      <section className={styles.walletPayment}>
        <CreditCard className={styles.serviceIcon} aria-hidden="true" />
        <div className={styles.walletPaymentCopy}>
          <h2>{t("settingsServices.paymentMethods")}</h2>
          <p id={paymentsId}>{t("settingsServices.paymentUnavailable")}</p>
        </div>
        <Button variant="outline" disabled aria-describedby={paymentsId}>
          <Plus aria-hidden="true" />{t("settingsServices.add")}
        </Button>
      </section>
      <section>
        <div className={styles.serviceCardHeader}>
          <h2>{t("settingsServices.invoices")}</h2>
          <Button variant="ghost" disabled aria-describedby={invoicesId}>
            {t("settingsServices.viewDetails")}<ArrowUpRight aria-hidden="true" />
          </Button>
        </div>
        <div className={`${styles.serviceEmpty} ${styles.walletInvoices}`}>
          <ReceiptText className={styles.serviceEmptyIcon} aria-hidden="true" />
          <p id={invoicesId}>{t("settingsServices.invoicesUnavailable")}</p>
        </div>
      </section>
    </div>
  );
}
