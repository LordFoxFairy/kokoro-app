"use client";

import { useId } from "react";
import Image from "next/image";
import { MessageCircle, MessagesSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import styles from "./settings-sections.module.css";

export function IntegrationSettingsSection() {
  const t = useT();
  const unavailableId = useId();
  return (
    <div className={styles.servicePage} data-testid="settings-service-integration">
      <p className={styles.serviceIntro}>{t("settingsServices.integrationDescription")}</p>
      <p id={unavailableId} className={styles.serviceUnavailable}>{t("settingsServices.integrationUnavailable")}</p>
      <ul className={styles.integrationGrid}>
        {[
          { name: "Zapier", description: t("settingsServices.zapierDescription"), image: "/integrations/zapier.webp", icon: null },
          { name: "Apple Messages", description: t("settingsServices.messagesDescription"), image: null, icon: MessagesSquare },
          { name: "Slack", description: t("settingsServices.slackDescription"), image: "/integrations/slack.svg", icon: null },
          { name: "Telegram", description: t("settingsServices.telegramDescription"), image: null, icon: Send },
          { name: "LINE", description: t("settingsServices.lineDescription"), image: null, icon: MessageCircle },
        ].map(({ name, description, image, icon: Icon }) => (
          <li key={name} className={styles.integrationCard}>
            <div className={styles.serviceProvider}>
              <span className={styles.integrationIcon} aria-hidden="true">
                {image ? <Image src={image} alt="" width={24} height={24} /> : Icon ? <Icon /> : null}
              </span>
              <div>
                <h2>{name}</h2>
                <p>{description}</p>
              </div>
            </div>
            <Button variant="outline" disabled aria-describedby={unavailableId}>{t("settingsServices.connect")}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
