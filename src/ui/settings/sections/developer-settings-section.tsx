"use client";

import { useId } from "react";
import { ArrowUpRight, FileText, KeyRound, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/context";
import { ApiKeyCreateDialog, WebhookCreateDialog } from "./developer-credential-dialogs";
import styles from "./settings-sections.module.css";

export function DeveloperSettingsSection() {
  const t = useT();
  const keysId = useId();
  const webhooksId = useId();
  const keysDocsId = useId();
  const webhooksDocsId = useId();
  return (
    <div className={`${styles.servicePage} ${styles.developerPage}`} data-testid="settings-service-developer">
      <Tabs defaultValue="keys" className={styles.serviceTabs}>
        <TabsList variant="line" aria-label={t("settings.developerTitle")}>
          <TabsTrigger value="keys">{t("settingsServices.apiKeys")}</TabsTrigger>
          <TabsTrigger value="webhooks">{t("settingsServices.webhooks")}</TabsTrigger>
        </TabsList>
        <TabsContent value="keys" className={styles.serviceSections}>
          <div className={`${styles.serviceInformation} ${styles.developerInformation}`}>
            <FileText aria-hidden="true" />
            <p>{t("settingsServices.apiKeysDescription")}</p>
            <Button variant="link" disabled aria-describedby={keysDocsId}>{t("settingsServices.docs")}<ArrowUpRight aria-hidden="true" /></Button>
          </div>
          <p id={keysDocsId} className={styles.serviceAvailability}>{t("settingsServices.docsUnavailable")}</p>
          <div className={styles.serviceEmpty}>
            <KeyRound className={styles.serviceEmptyIcon} aria-hidden="true" />
            <h2>{t("settingsServices.apiKeys")}</h2>
            <p>{t("settingsServices.apiKeysPurpose")}</p>
            <p id={keysId}>{t("settingsServices.apiKeysUnavailable")}</p>
            <ApiKeyCreateDialog />
          </div>
        </TabsContent>
        <TabsContent value="webhooks" className={styles.serviceSections}>
          <div className={`${styles.serviceInformation} ${styles.developerInformation}`}>
            <FileText aria-hidden="true" />
            <p>{t("settingsServices.webhooksDescription")}</p>
            <Button variant="link" disabled aria-describedby={webhooksDocsId}>{t("settingsServices.docs")}<ArrowUpRight aria-hidden="true" /></Button>
          </div>
          <p id={webhooksDocsId} className={styles.serviceAvailability}>{t("settingsServices.docsUnavailable")}</p>
          <div className={styles.serviceEmpty}>
            <Webhook className={styles.serviceEmptyIcon} aria-hidden="true" />
            <h2>{t("settingsServices.webhooks")}</h2>
            <p>{t("settingsServices.webhooksPurpose")}</p>
            <p id={webhooksId}>{t("settingsServices.webhooksUnavailable")}</p>
            <WebhookCreateDialog />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
