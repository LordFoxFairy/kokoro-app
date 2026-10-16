"use client";

import { useId } from "react";
import { KeyRound, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function DeveloperSettingsSection() {
  const t = useT();
  const keysId = useId();
  const webhooksId = useId();
  const keysDocsId = useId();
  const webhooksDocsId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-developer">
      <Tabs defaultValue="keys" className={styles.serviceTabs}>
        <TabsList variant="line" aria-label={t("settings.developerTitle")}>
          <TabsTrigger value="keys">{t("settingsServices.apiKeys")}</TabsTrigger>
          <TabsTrigger value="webhooks">{t("settingsServices.webhooks")}</TabsTrigger>
        </TabsList>
        <TabsContent value="keys" className={styles.serviceSections}>
          <div className={styles.serviceInformation}>
            <p>{t("settingsServices.apiKeysDescription")}</p>
            <div className={styles.serviceDocumentation}>
              <Button variant="link" disabled aria-describedby={keysDocsId}>{t("settingsServices.docs")}</Button>
              <p id={keysDocsId}>{t("settingsServices.docsUnavailable")}</p>
            </div>
          </div>
          <div className={styles.serviceEmpty}>
            <KeyRound className={styles.serviceEmptyIcon} aria-hidden="true" />
            <h2>{t("settingsServices.apiKeys")}</h2>
            <p id={keysId}>{t("settingsServices.apiKeysUnavailable")}</p>
            <Button disabled aria-describedby={keysId}>{t("settingsServices.createApiKey")}</Button>
          </div>
        </TabsContent>
        <TabsContent value="webhooks" className={styles.serviceSections}>
          <div className={styles.serviceInformation}>
            <p>{t("settingsServices.webhooksDescription")}</p>
            <div className={styles.serviceDocumentation}>
              <Button variant="link" disabled aria-describedby={webhooksDocsId}>{t("settingsServices.docs")}</Button>
              <p id={webhooksDocsId}>{t("settingsServices.docsUnavailable")}</p>
            </div>
          </div>
          <div className={styles.serviceEmpty}>
            <Webhook className={styles.serviceEmptyIcon} aria-hidden="true" />
            <h2>{t("settingsServices.webhooks")}</h2>
            <p id={webhooksId}>{t("settingsServices.webhooksUnavailable")}</p>
            <Button disabled aria-describedby={webhooksId}>{t("settingsServices.createWebhook")}</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
