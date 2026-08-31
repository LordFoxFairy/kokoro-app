"use client"

import { useState } from "react"
import { Play } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/i18n/context"
import type { MessageKey } from "@/i18n/messages"

import styles from "./notification-panel.module.css"

type NotificationTab = "all" | "updates" | "messages"

const updates = [
  { dateKey: "notifications.fixtureWorkspaceDate", titleKey: "notifications.featureTitle", descriptionKey: "notifications.featureDescription" },
  { dateKey: "notifications.fixtureConnectorDate", titleKey: "notifications.fixtureConnectorTitle", descriptionKey: "notifications.fixtureConnectorDescription" },
] as const

const messages = [
  { dateKey: "notifications.fixtureWelcomeDate", titleKey: "notifications.fixtureWelcomeTitle", descriptionKey: "notifications.fixtureWelcomeDescription" },
] as const

function UpdateCard({ dateKey, titleKey, descriptionKey }: { dateKey: MessageKey; titleKey: MessageKey; descriptionKey: MessageKey }) {
  const t = useT()
  return (
    <article className={styles.card}>
      <p className={styles.date}>{t(dateKey)}</p>
      <div className={styles.cardBody}>
        <h4>{t(titleKey)}</h4>
        <p className={styles.description}>{t(descriptionKey)}</p>
      </div>
    </article>
  )
}

function FeaturedUpdate() {
  const t = useT()
  return (
    <article className={styles.featured}>
      <h4>{t("notifications.featureTitle")}</h4>
      <p className={styles.description}>{t("notifications.featureDescription")}</p>
      <div className={styles.video} aria-label={t("notifications.playPreview")} role="img">
        <span className={styles.videoCopy}>Kokoro<br />Workspace</span>
        <button type="button" className={styles.playButton} aria-label={t("notifications.playPreview")}>
          <Play aria-hidden="true" fill="currentColor" />
        </button>
      </div>
    </article>
  )
}

export function NotificationPanel() {
  const t = useT()
  const [tab, setTab] = useState<NotificationTab>("all")

  return (
    <section className={styles.panel} data-testid="notification-panel">
      <header className={styles.header}>
        <h3>{t("notifications.title")}</h3>
        <Tabs value={tab} onValueChange={(value) => setTab(value as NotificationTab)}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="all" className={styles.tab}>{t("notifications.all")}</TabsTrigger>
            <TabsTrigger value="updates" className={styles.tab}>{t("notifications.updates")}</TabsTrigger>
            <TabsTrigger value="messages" className={styles.tab}>{t("notifications.messages")}</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className={styles.tabContent}>
            <FeaturedUpdate />
            <article className={styles.firstCard}>
              <p className={styles.date}>{t("notifications.fixtureConnectorDate")}</p>
              <div className={styles.cardBody}>
                <h4>{t("notifications.fixtureConnectorTitle")}</h4>
                <p className={styles.description}>{t("notifications.fixtureConnectorDescription")}</p>
                <div className={styles.entryMedia} aria-hidden="true">{t("notifications.fixtureMediaLabel")}</div>
              </div>
            </article>
          </TabsContent>
          <TabsContent value="updates" className={styles.tabContent}>
            {updates.map((item) => <UpdateCard key={item.titleKey} {...item} />)}
          </TabsContent>
          <TabsContent value="messages" className={styles.tabContent}>
            {messages.map((item) => <UpdateCard key={item.titleKey} {...item} />)}
          </TabsContent>
        </Tabs>
      </header>
    </section>
  )
}
