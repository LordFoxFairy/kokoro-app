"use client";

import { useId } from "react";
import Image from "next/image";
import { CalendarDays, ClipboardList, Headphones, Mail, MessageCircle, MessagesSquare, Send, ShoppingBag, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export type IntegrationProvider = "Zapier" | "Apple Messages" | "Slack" | "Telegram" | "LINE";

export function IntegrationProviderIcon({ provider }: { provider: IntegrationProvider }) {
  const image = provider === "Zapier" ? "/integrations/zapier.webp" : provider === "Slack" ? "/integrations/slack.svg" : null;
  const Icon = provider === "Apple Messages" ? MessagesSquare : provider === "Telegram" ? Send : MessageCircle;
  return <span className={styles.integrationIcon} aria-hidden="true">{image ? <Image src={image} alt="" width={24} height={24} /> : <Icon />}</span>;
}

export function IntegrationDetails({ provider, description }: { provider: IntegrationProvider; description: string }) {
  const t = useT();
  const reasonId = useId();
  const examplesId = useId();
  const examples = [
    { name: "Calendly", icon: CalendarDays, key: "settingsServices.integrationExampleCalendar" },
    { name: "Google Forms", icon: ClipboardList, key: "settingsServices.integrationExampleForms" },
    { name: "Microsoft Teams", icon: MessagesSquare, key: "settingsServices.integrationExampleTeams" },
    { name: "Outlook", icon: Mail, key: "settingsServices.integrationExampleOutlook" },
    { name: "Salesforce", icon: Users, key: "settingsServices.integrationExampleSalesforce" },
    { name: "Shopify", icon: ShoppingBag, key: "settingsServices.integrationExampleShopify" },
    { name: "Zendesk", icon: Headphones, key: "settingsServices.integrationExampleZendesk" },
    { name: "Zoom", icon: Video, key: "settingsServices.integrationExampleZoom" },
  ] as const;
  return <div className={styles.integrationDetails}>
    <div className={styles.integrationConnect}>
      <IntegrationProviderIcon provider={provider} />
      <div><h2>{provider}</h2><p>{description}</p></div>
      <Button type="button" variant="outline" disabled aria-describedby={reasonId}>{t(provider === "Zapier" ? "settings.tryNow" : "settingsServices.connect")}</Button>
    </div>
    <p id={reasonId} className={styles.serviceUnavailable}>{t("settingsServices.integrationUnavailable")}</p>
    {provider === "Slack" || provider === "Zapier" ? <section className={styles.integrationOverview}>
      <h2>{t("settings.overview")}</h2>
      <p>{t(provider === "Slack" ? "settingsServices.slackOverview" : "settingsServices.zapierOverview")}</p>
    </section> : null}
    {provider === "Zapier" ? <section className={styles.integrationExamples} aria-label={t("settingsServices.integrationExamples")}>
      <h2>{t("settingsServices.integrationExamples")}</h2>
      <p id={examplesId} className={styles.serviceUnavailable}>{t("settingsServices.integrationExamplesUnavailable")}</p>
      <ul className={styles.integrationGrid}>{examples.map(({ name, icon: Icon, key }) => <li key={name} className={styles.integrationExample}>
        <Icon aria-hidden="true" />
        <h3>{name}</h3>
        <p>{t(key)}</p>
        <Button type="button" variant="outline" disabled aria-describedby={examplesId}>{t("settings.tryNow")}</Button>
      </li>)}</ul>
    </section> : null}
  </div>;
}
