"use client";

import { useId } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/context";
import { MailboxSettingsDialog, MailSenderEditor, MailWorkflowDialog } from "./mail-configuration-dialogs";
import styles from "./settings-sections.module.css";

export function MailSettingsSection({ brandName }: { brandName: string }) {
  const t = useT();
  const unavailableId = useId();
  const inboxId = useId();
  const docsId = useId();
  return (
    <div className={`${styles.servicePage} ${styles.mailPage}`} data-testid="settings-service-mail">
      <div className={styles.serviceInformation}>
        <p className={styles.serviceIntro}>{t("settingsServices.mailDescription")}</p>
        <Button variant="link" disabled aria-describedby={docsId}>{t("settingsServices.docs")}<ArrowUpRight aria-hidden="true" /></Button>
      </div>
      <p id={docsId} className={styles.serviceAvailability}>{t("settingsServices.docsUnavailable")}</p>
      <Tabs defaultValue="settings" className={styles.serviceTabs}>
        <TabsList variant="line" aria-label={t("settings.mailTitle")}>
          <TabsTrigger value="settings">{t("settingsServices.mailSettings")}</TabsTrigger>
          <TabsTrigger value="inbox">{t("settingsServices.mailInbox")}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className={styles.serviceSections}>
          <p id={unavailableId} className={styles.serviceUnavailable}>{t("settingsServices.mailUnavailable")}</p>
          <section className={styles.mailSettingRow}>
            <div>
              <h2>{t("settingsServices.mailbox", { brand: brandName })}</h2>
              <p>{t("settingsServices.mailAddressUnavailable")}</p>
            </div>
            <MailboxSettingsDialog />
          </section>
          <section className={styles.mailSettingRow}>
            <div>
              <h2>{t("settingsServices.workflows")}</h2>
              <p>{t("settingsServices.workflowsDescription")}</p>
            </div>
            <MailWorkflowDialog />
          </section>
          <section className={styles.mailSettingRow}>
            <div>
              <h2>{t("settingsServices.triggers")}</h2>
              <p>{t("settingsServices.triggersDescription")}</p>
            </div>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.fromAutomation")}</Button>
          </section>
          <section className={styles.mailSettingRow}>
            <div>
              <h2>{t("settingsServices.senders")}</h2>
              <p>{t("settingsServices.sendersDescription")}</p>
            </div>
            <MailSenderEditor />
          </section>
        </TabsContent>
        <TabsContent value="inbox" className={styles.mailInbox}>
          <table className={styles.serviceTable} aria-describedby={inboxId}>
            <thead><tr>
              <th scope="col">{t("settingsServices.senderColumn")}</th>
              <th scope="col">{t("settingsServices.contentColumn")}</th>
              <th scope="col" aria-label={t("settingsServices.dateColumn")}><div className={styles.mailInboxDate}><span>{t("settingsServices.dateColumn")}</span><Button variant="outline" size="icon" disabled aria-label={t("settingsServices.refreshInbox")} aria-describedby={inboxId}><RefreshCw aria-hidden="true" /></Button></div></th>
            </tr></thead>
            <tbody />
          </table>
          <p id={inboxId} className={styles.serviceAvailability}>{t("settingsServices.inboxUnavailable")}</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
