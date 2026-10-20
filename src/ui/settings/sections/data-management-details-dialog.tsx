"use client";

import { useId } from "react";
import { CircleHelp, Globe, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export type DataManagementDetailKind = "apps" | "browser" | "domains";

export function DataManagementDetails({ kind }: { kind: DataManagementDetailKind }) {
  const t = useT();
  const reasonId = useId();
  const preferenceId = useId();
  const docsId = useId();
  if (kind === "browser") return <div className={styles.dataBrowserDetails}>
    <div className={styles.dataBrowserPreference}>
      <div><h2>{t("settingsServices.keepSignedIn")}</h2><p id={preferenceId}>{t("settingsServices.preferenceUnknown")}</p></div>
      <Button type="button" variant="outline" disabled aria-label={t("settingsServices.browserPreferenceUnreadable")} aria-describedby={`${reasonId} ${preferenceId}`}><CircleHelp aria-hidden="true" />{t("settingsServices.browserPreferenceUnreadable")}</Button>
      <p id={reasonId}>{t("settingsServices.managementUnavailable")}</p>
      <Button type="button" variant="link" disabled aria-describedby={docsId}>{t("settingsServices.docs")}</Button>
      <p id={docsId}>{t("settingsServices.docsUnavailable")}</p>
    </div>
    <section><h2>{t("settingsServices.cookiesAndData")}</h2><p>{t("settingsServices.cookiesUnavailable")}</p></section>
  </div>;
  const Icon = kind === "apps" ? ShieldCheck : Globe;
  return <div className={styles.dataCenteredDetails}>
    <Icon aria-hidden="true" />
    <p>{t(kind === "apps" ? "data.authorizedAppsDescription" : "data.domainsDescription")}</p>
    <p id={reasonId}>{t("settingsServices.managementUnavailable")}</p>
    {kind === "domains" ? <Button type="button" disabled aria-describedby={reasonId}>{t("settingsServices.buyDomain")}</Button> : null}
  </div>;
}

export function DataManagementDetailsDialog() {
  const t = useT();
  const reasonId = useId();
  const title = t("data.sharedFiles");
  const description = t("settingsServices.sharedFilesDescription");
  return (
    <Dialog>
      <DialogTrigger asChild><Button type="button" variant="outline" aria-label={t("settingsServices.manageData", { name: title })}>{t("data.manage")}</Button></DialogTrigger>
      <DialogContent className={styles.serviceDialog} closeLabel={t("shell.closeDialog")}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <p id={reasonId} className={styles.serviceAvailability}>{t("settingsServices.managementUnavailable")}</p>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">{t("firstSite.cancel")}</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
