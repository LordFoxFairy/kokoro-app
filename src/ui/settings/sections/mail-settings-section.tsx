"use client";

import { useId } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function MailSettingsSection({ brandName }: { brandName: string }) {
  const t = useT();
  const unavailableId = useId();
  const inboxId = useId();
  const docsId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-mail">
      <div className={styles.serviceInformation}>
        <p className={styles.serviceIntro}>{t("settingsServices.mailDescription")}</p>
        <div className={styles.serviceDocumentation}>
          <Button variant="link" disabled aria-describedby={docsId}>{t("settingsServices.docs")}</Button>
          <p id={docsId}>{t("settingsServices.docsUnavailable")}</p>
        </div>
      </div>
      <Tabs defaultValue="settings" className={styles.serviceTabs}>
        <TabsList variant="line" aria-label={t("settings.mailTitle")}>
          <TabsTrigger value="settings">{t("settingsServices.mailSettings")}</TabsTrigger>
          <TabsTrigger value="inbox">{t("settingsServices.mailInbox")}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className={styles.serviceSections}>
          <p id={unavailableId} className={styles.serviceUnavailable}>{t("settingsServices.mailUnavailable")}</p>
          <section className={styles.serviceCard}>
            <div className={styles.serviceCardHeader}>
              <h2>{t("settingsServices.mailbox", { brand: brandName })}</h2>
              <Mail className={styles.serviceIcon} aria-hidden="true" />
            </div>
            <p>{t("settingsServices.mailAddressUnavailable")}</p>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.mailSettings")}</Button>
          </section>
          <section className={styles.serviceCard}>
            <h2>{t("settingsServices.workflows")}</h2>
            <p>{t("settingsServices.workflowsDescription")}</p>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.add")}</Button>
          </section>
          <section className={styles.serviceCard}>
            <h2>{t("settingsServices.triggers")}</h2>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.fromAutomation")}</Button>
          </section>
          <section className={styles.serviceCard}>
            <h2>{t("settingsServices.senders")}</h2>
            <p>{t("settingsServices.sendersDescription")}</p>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.add")}</Button>
          </section>
        </TabsContent>
        <TabsContent value="inbox" className={styles.serviceCard}>
          <div className={styles.serviceCardHeader}>
            <h2>{t("settingsServices.mailInbox")}</h2>
            <Button variant="outline" disabled aria-describedby={inboxId}>{t("settingsServices.refreshInbox")}</Button>
          </div>
          <p id={inboxId}>{t("settingsServices.inboxUnavailable")}</p>
          <table className={styles.serviceTable} aria-describedby={inboxId}>
            <thead><tr>
              <th scope="col">{t("settingsServices.senderColumn")}</th>
              <th scope="col">{t("settingsServices.contentColumn")}</th>
              <th scope="col">{t("settingsServices.dateColumn")}</th>
            </tr></thead>
            <tbody />
          </table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
