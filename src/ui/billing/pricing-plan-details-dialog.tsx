"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatMicros, formatMinor } from "@/billing/format";
import { planIntervalKey } from "@/billing/rules";
import type { PlanCatalogEntry } from "@/billing/pricing";
import { useT } from "@/i18n/context";
import styles from "./pricing-panel.module.css";

export function PricingPlanDetailsDialog({ plan }: { plan: PlanCatalogEntry }) {
  const t = useT();
  const reasonId = useId();
  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="outline" aria-label={t("pricing.viewDetails", { name: plan.name })}>{t("settingsServices.viewDetails")}</Button></DialogTrigger>
    <DialogContent className={styles.detailsDialog} closeLabel={t("shell.closeDialog")}>
      <DialogHeader><DialogTitle>{plan.name}</DialogTitle><DialogDescription>{t("pricing.credits", { credits: formatMicros(plan.credit_micros) })}</DialogDescription></DialogHeader>
      <p className={styles.price}><span className={styles.priceAmount}>{formatMinor(plan.amount_minor)}</span><span className={styles.priceMeta}>{plan.currency} · {t(planIntervalKey(plan.billing_interval))}</span></p>
      <p id={reasonId}>{t("pricing.unavailable")}</p>
      <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose><Button type="button" disabled aria-describedby={reasonId}>{t("pricing.buyUnavailable")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
