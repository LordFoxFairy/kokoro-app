"use client";

import { useId } from "react";
import { ArrowUpRight, CreditCard, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { WalletPaymentDialog } from "./wallet-payment-dialog";
import styles from "./settings-sections.module.css";

export function WalletSettingsSection() {
  const t = useT();
  const paymentsId = useId();
  const invoicesId = useId();
  return (
    <div className={`${styles.servicePage} ${styles.walletPage}`} data-testid="settings-service-wallet">
      <section>
        <div className={styles.walletPayment}>
        <CreditCard className={styles.serviceIcon} aria-hidden="true" />
        <div className={styles.walletPaymentCopy}>
          <h2>{t("settingsServices.paymentMethods")}</h2>
        </div>
        <WalletPaymentDialog />
        </div>
        <p id={paymentsId} className={styles.serviceAvailability}>{t("settingsServices.paymentUnavailable")}</p>
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
