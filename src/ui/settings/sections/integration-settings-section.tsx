"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { IntegrationDetails, IntegrationProviderIcon, type IntegrationProvider } from "./integration-details-dialog";
import styles from "./settings-sections.module.css";

export function IntegrationSettingsSection() {
  const t = useT();
  const unavailableId = useId();
  const [detail, setDetail] = useState<IntegrationProvider | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useRef<Partial<Record<IntegrationProvider, HTMLButtonElement | null>>>({});
  const previous = useRef<IntegrationProvider | null>(null);
  useLayoutEffect(() => {
    if (detail) {
      previous.current = detail;
      heading.current?.focus();
    } else if (previous.current) {
      cards.current[previous.current]?.focus();
      previous.current = null;
    }
  }, [detail]);
  const providers = [
    { name: "Zapier", description: t("settingsServices.zapierDescription") },
    { name: "Apple Messages", description: t("settingsServices.messagesDescription") },
    { name: "Slack", description: t("settingsServices.slackDescription") },
    { name: "Telegram", description: t("settingsServices.telegramDescription") },
    { name: "LINE", description: t("settingsServices.lineDescription") },
  ] as const;
  const selected = providers.find(({ name }) => name === detail);
  return (
    <div className={`${styles.servicePage} ${styles.integrationPage}`} data-testid="settings-service-integration" role={detail ? "region" : undefined} aria-label={detail ?? undefined}>
      <header className={`${styles.serviceSubpageHeader} ${detail ? "" : styles.integrationOverviewHeader}`}>
        {detail ? <Button type="button" variant="ghost" size="icon" aria-label={t("settingsServices.integrationBack")} onClick={() => setDetail(null)}><ArrowLeft aria-hidden="true" /></Button> : null}
        <h1 ref={heading} tabIndex={detail ? -1 : undefined}>{detail ?? t("settings.integrationTitle")}</h1>
        {!detail ? <p className={styles.serviceIntro}>{t("settingsServices.integrationDescription")}</p> : null}
      </header>
      {selected ? <IntegrationDetails provider={selected.name} description={selected.description} /> : <>
      <p id={unavailableId} className={styles.serviceUnavailable}>{t("settingsServices.integrationUnavailable")}</p>
      <ul className={styles.integrationGrid}>
        {providers.map(({ name, description }) => (
          <li key={name}>
            <Button ref={(element) => { cards.current[name] = element; }} type="button" variant="outline" className={styles.integrationCard} aria-label={t("settingsServices.providerDetails", { provider: name })} onClick={() => setDetail(name)}>
              <IntegrationProviderIcon provider={name} />
              <span className={styles.integrationCardCopy}><strong>{name}</strong><span>{description}</span></span>
              <ChevronRight aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      </>}
    </div>
  );
}
