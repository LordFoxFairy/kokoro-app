"use client";

import { useId } from "react";
import { Bot, Info, Mic, PhoneCall, Plus, Scale, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function PhoneAssignmentDialog() {
  const t = useT();
  const reasonId = useId();
  return (
    <Dialog>
      <DialogTrigger asChild><Button type="button"><Plus aria-hidden="true" />{t("settingsServices.createPhone")}</Button></DialogTrigger>
      <DialogContent className={`${styles.serviceDialog} ${styles.serviceHeroDialog}`} closeLabel={t("shell.closeDialog")}>
        <div className={styles.serviceHeroIcons} aria-hidden="true"><span><Bot /></span><i /><span><Smartphone /></span></div>
        <DialogHeader>
          <DialogTitle>{t("settingsServices.phoneSetupTitle")}</DialogTitle>
          <DialogDescription>{t("settingsServices.phoneDescription")}</DialogDescription>
        </DialogHeader>
        <section className={styles.serviceHeroNotice} aria-labelledby={`${reasonId}-notice`}>
        <h3 id={`${reasonId}-notice`} className={styles.serviceHeroCaption}><Info aria-hidden="true" />{t("settingsServices.beforeYouStart")}</h3>
        <ul className={styles.serviceHeroGuidance}>
          <li><PhoneCall aria-hidden="true" /><div><h3>{t("settingsServices.phonePurposeTitle")}</h3><p>{t("settingsServices.phonePurpose")}</p></div></li>
          <li><Scale aria-hidden="true" /><div><h3>{t("settingsServices.phoneResponsibilityTitle")}</h3><p>{t("settingsServices.phoneResponsibility")}</p></div></li>
          <li><Mic aria-hidden="true" /><div><h3>{t("settingsServices.phoneRecordingTitle")}</h3><p>{t("settingsServices.phoneRecording")}</p></div></li>
        </ul>
        </section>
        <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.phoneUnavailable")}</p>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
          <Button type="button" disabled aria-describedby={reasonId}>{t("settingsServices.continue")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
