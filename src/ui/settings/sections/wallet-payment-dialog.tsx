"use client";

import { useId } from "react";
import { Bot, CreditCard, HandCoins, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function WalletPaymentDialog() {
  const t = useT();
  const reasonId = useId();
  return (
    <Dialog>
      <DialogTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" />{t("settingsServices.add")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.serviceHeroDialog}`} closeLabel={t("shell.closeDialog")}>
        <div className={styles.serviceHeroIcons} aria-hidden="true"><span><Bot /></span><i /><span><CreditCard /></span></div>
        <DialogHeader><DialogTitle>{t("settingsServices.addPaymentTitle")}</DialogTitle><DialogDescription>{t("settingsServices.paymentIntroduction")}</DialogDescription></DialogHeader>
        <ul className={styles.serviceHeroGuidance}>
          <li><ShieldCheck aria-hidden="true" /><div><h3>{t("settingsServices.paymentConfirmTitle")}</h3><p>{t("settingsServices.paymentConfirmation")}</p></div></li>
          <li><LockKeyhole aria-hidden="true" /><div><h3>{t("settingsServices.paymentCredentialsTitle")}</h3><p>{t("settingsServices.paymentProvider")}</p></div></li>
          <li><HandCoins aria-hidden="true" /><div><h3>{t("settingsServices.paymentOrdersTitle")}</h3><p>{t("settingsServices.paymentMerchant")}</p></div></li>
        </ul>
        <DialogFooter className={styles.walletPaymentFooter}>
          <Button type="button" disabled aria-describedby={reasonId}>{t("settingsServices.continue")}</Button>
          <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.paymentUnavailable")}</p>
          <DialogClose asChild><Button type="button" variant="ghost">{t("firstSite.cancel")}</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
