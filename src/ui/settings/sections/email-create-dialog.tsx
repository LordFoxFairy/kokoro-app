"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

function EmailDraft() {
  const t = useT();
  const reasonId = useId();
  const domainId = useId();
  const [prefix, setPrefix] = useState("");
  return (
    <form className={styles.serviceDraft} onSubmit={(event) => event.preventDefault()}>
      <label><span>{t("settingsServices.emailPrefix")}</span><span className={styles.mailAddressDraft}><Input aria-label={t("settingsServices.emailPrefix")} value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder={t("settingsServices.emailPrefixPlaceholder")} aria-describedby={domainId} autoComplete="off" /><span>{t("settingsServices.mailDomainPending")}</span></span></label>
      <p id={domainId}>{t("settingsServices.domainUnavailable")}</p>
      <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.emailUnavailable")}</p>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
        <Button type="submit" disabled aria-describedby={reasonId}>{t("firstSite.save")}</Button>
      </DialogFooter>
    </form>
  );
}

export function EmailCreateDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" />{t("settingsServices.create")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.emailCreateDialog}`} closeLabel={t("shell.closeDialog")}>
        <DialogHeader><DialogTitle>{t("settingsServices.createEmailTitle")}</DialogTitle><DialogDescription>{t("settingsServices.emailDescription")} {t("settingsServices.draftOnly")}</DialogDescription></DialogHeader>
        {open ? <EmailDraft /> : null}
      </DialogContent>
    </Dialog>
  );
}
