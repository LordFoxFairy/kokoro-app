"use client"

import { useState, type ReactNode } from "react"
import Image from "next/image"
import { ArrowUpRight, ChevronRight, Sparkles } from "lucide-react"

import { useT } from "@/i18n/context"
import { mutationHeaders } from "@/lib/client/mutation"
import { Button } from "@/components/ui/button"

import type { SettingsIntegrationId } from "../settings-types"
import styles from "./settings-sections.module.css"

type ZapTemplateId = "calendly" | "googleForms" | "teams" | "outlook" | "salesforce" | "shopify" | "zendesk" | "zoom"

function TelegramLogo() {
  return <span className={styles.telegramLogo} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21.4 3.6 18.2 19c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.8 12.8 1 11.3c-1-.3-1-1 .2-1.5L20 2.6c.9-.3 1.7.2 1.4 1Z" /></svg></span>
}

function LineLogo() {
  return (
    <span className={styles.lineLogo} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#45c654" />
        <path d="M18.3 11.1c0-3-2.8-5.4-6.3-5.4s-6.3 2.4-6.3 5.4c0 2.7 2.3 5 5.4 5.4.2 0 .5.2.5.5l-.1 1.4c0 .2.2.4.4.3 2.6-1.1 4.2-2.4 5.2-3.6.8-1 1.2-2.2 1.2-4Z" fill="#fff" />
        <path d="M8.1 9.3v3.6h2M11 9.3v3.6M12.1 12.9V9.3l2.4 3.6V9.3M17 9.3h-1.7v3.6H17" stroke="#45c654" strokeWidth=".72" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const integrationCatalog: readonly { id: SettingsIntegrationId; image?: string; logo?: () => ReactNode }[] = [
  { id: "zapier", image: "/integrations/zapier.webp" },
  { id: "slack", image: "/integrations/slack.svg" },
  { id: "telegram", logo: TelegramLogo },
  { id: "line", logo: LineLogo },
]

const zapTemplates: readonly { id: ZapTemplateId; templateId: string }[] = [
  { id: "calendly", templateId: "255666880" },
  { id: "googleForms", templateId: "255666874" },
  { id: "teams", templateId: "255666876" },
  { id: "outlook", templateId: "255666782" },
  { id: "salesforce", templateId: "255666873" },
  { id: "shopify", templateId: "255666875" },
  { id: "zendesk", templateId: "255666877" },
  { id: "zoom", templateId: "255666878" },
]

function ZapAppLogo({ id }: { id: ZapTemplateId }) {
  if (id === "outlook") {
    return <Image src="/assets/connectors/outlook.svg" alt="" width={20} height={20} />
  }
  if (id === "calendly") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#0b67e3" /><path d="M13.7 6.4a5 5 0 1 0 .1 7.1" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><path d="M12.6 8a2.8 2.8 0 1 0 0 4" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
  }
  if (id === "googleForms") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2h8l4 4v12H4V2Z" fill="#7248b9" /><path d="M12 2v4h4" fill="#a78bd4" /><circle cx="7" cy="9" r="1" fill="#fff" /><circle cx="7" cy="13" r="1" fill="#fff" /><path d="M9.5 9h4M9.5 13h4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" /></svg>
  }
  if (id === "teams") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="14.5" cy="5.5" r="2.2" fill="#7b83eb" /><rect x="10.5" y="8" width="7.5" height="7.5" rx="2" fill="#7b83eb" /><rect x="2" y="5" width="11" height="11" rx="2" fill="#6264a7" /><path d="M5 8h5M7.5 8v5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
  }
  if (id === "salesforce") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.1 15.7a4 4 0 0 1-2-7.5A4.7 4.7 0 0 1 12.7 5a3.6 3.6 0 0 1 3.2 6.8 3.8 3.8 0 0 1-3.6 3.9H6.1Z" fill="#00a1e0" /></svg>
  }
  if (id === "shopify") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 6 2-1 .7-2.2 2.2-.8 1.5 2.2L16 5.4 15 18 5.2 16.4 4 6Z" fill="#72a845" /><path d="M7 6.5c.5-2.4 1.2-3.5 2.2-3.5 1.1 0 1.8 1.2 2 2.8" fill="none" stroke="#fff" strokeWidth="1.1" /><path d="M11.7 8.5c-.6-.4-1.3-.6-2-.5-1.5.1-2 1.8-.5 2.5 1.7.8 1.2 2.5-.5 2.7-.8.1-1.5-.1-2.1-.5" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" /></svg>
  }
  if (id === "zendesk") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h7L3 10V3Zm7 14H3l7-7v7ZM11 3h6v7l-6-7Zm0 7 6 7h-6v-7Z" fill="#17494d" /></svg>
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="4" width="16" height="12" rx="3" fill="#2d8cff" /><path d="m11.5 8 3-1.5v7l-3-1.5V8ZM5 8h6.5v4H5V8Z" fill="#fff" /></svg>
}

function ZapTemplateApps({ brand, id }: { brand: string; id: ZapTemplateId }) {
  return (
    <span className={styles.zapTemplateApps} aria-label={`${id} + ${brand}`}>
      <span data-app={id}><ZapAppLogo id={id} /></span>
      <span><Sparkles aria-hidden="true" /></span>
    </span>
  )
}

export function IntegrationSettingsCard({
  brandName,
  preview = false,
  selected,
  onSelect,
}: {
  brandName?: string
  preview?: boolean
  selected: SettingsIntegrationId | null
  onSelect: (id: SettingsIntegrationId | null) => void
}) {
  const t = useT()
  const brand = brandName ?? "Kokoro"
  const [connecting, setConnecting] = useState<SettingsIntegrationId | null>(null)
  const [connected, setConnected] = useState<SettingsIntegrationId[]>([])
  const entry = selected ? integrationCatalog.find((item) => item.id === selected) : null
  const connect = async (id: SettingsIntegrationId): Promise<void> => {
    setConnecting(id)
    try {
      if (!preview) {
        const response = await fetch(`/api/hub/integrations/${id}/connect`, { method: "POST", headers: mutationHeaders() })
        if (!response.ok) throw new Error(`integration_connect_failed:${response.status}`)
        const result = await response.json() as { authorization_url?: string }
        if (result.authorization_url) {
          window.location.assign(result.authorization_url)
          return
        }
      }
      setConnected((items) => items.includes(id) ? items : [...items, id])
    } finally {
      setConnecting(null)
    }
  }

  if (selected && entry) {
    const Logo = entry.logo
    return (
      <div className={styles.integrationDetail} data-testid="settings-integration-detail" data-integration={selected}>
        <div className={styles.integrationDetailHero}>
          <span className={styles.integrationDetailLogo}>
            {entry.image ? <Image src={entry.image} alt={t(`settings.integration.${selected}.name`)} width={64} height={64} /> : Logo ? <Logo /> : null}
          </span>
          <div>
            <p>{selected === "line" ? "LINE" : t(`settings.integration.${selected}.title`, { brand })}</p>
            <span>{t(`settings.integration.${selected}.description`, { brand })}</span>
          </div>
          <Button type="button" disabled={connecting === selected || connected.includes(selected)} onClick={selected === "zapier" ? undefined : () => void connect(selected)} asChild={selected === "zapier"}>
            {selected === "zapier" ? (
              <a href="https://zapier.com/apps/manus/integrations" target="_blank" rel="noreferrer">{t("settings.tryNow")}<ArrowUpRight /></a>
            ) : connected.includes(selected) ? (
              t("settings.connected")
            ) : connecting === selected ? (
              t("settings.connecting")
            ) : (
              <>{t("settings.connect")}<ArrowUpRight /></>
            )}
          </Button>
        </div>
        {selected === "zapier" || selected === "slack" ? (
          <section className={styles.integrationOverview}>
            <h3>{t("settings.overview")}</h3>
            <div className={styles.integrationOverviewCard}>
              <p>{t(`settings.integration.${selected}.overview`, { brand })}</p>
              {selected === "slack" ? (
                <div className={styles.slackTips}>
                  <strong>{t("settings.integration.slack.tips")}</strong>
                  <ul>
                    <li><code>mute</code><span>{t("settings.integration.slack.muteHint", { brand })}</span></li>
                    <li><code>unmute</code><span>{t("settings.integration.slack.unmuteHint")}</span></li>
                    <li><code>!skip</code><span>{t("settings.integration.slack.skipHint")}</span></li>
                  </ul>
                </div>
              ) : null}
              {selected === "zapier" ? <a href="https://zapier.com/blog/get-started-with-zapier/" target="_blank" rel="noreferrer">{t("settings.documentation")} <ArrowUpRight /></a> : null}
              {selected === "slack" ? <a href="https://api.slack.com/docs" target="_blank" rel="noreferrer">{t("settings.documentation")} <ArrowUpRight /></a> : null}
            </div>
          </section>
        ) : null}
        {selected === "zapier" ? (
          <section className={styles.zapTemplates}>
            <h3>{t("settings.exploreZapTemplates")}</h3>
            <div>
              {zapTemplates.map(({ id, templateId }) => (
                <article key={id}>
                  <div className={styles.zapTemplateCopy}>
                    <strong>{t(`settings.integration.zapier.template.${id}`, { brand })}</strong>
                    <span>{t(`settings.integration.zapier.template.${id}.pair`, { brand })}</span>
                  </div>
                  <div className={styles.zapTemplateFooter}>
                    <ZapTemplateApps brand={brand} id={id} />
                    <Button asChild variant="outline" size="sm"><a href={`https://zapier.com/webintent/create-zap?template=${templateId}`} target="_blank" rel="noreferrer">{t("settings.tryNow")}</a></Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.integrationGrid} data-testid="settings-integration">
      {integrationCatalog.map((item) => {
        const Logo = item.logo
        return (
          <button key={item.id} type="button" className={styles.integrationCard} onClick={() => onSelect(item.id)}>
            <span className={styles.integrationLogo}>
              {item.image ? <Image src={item.image} alt={t(`settings.integration.${item.id}.name`)} width={40} height={40} /> : Logo ? <Logo /> : null}
            </span>
            <span className={styles.integrationCopy}>
              <strong>{t(`settings.integration.${item.id}.title`, { brand })}</strong>
              <small>{t(`settings.integration.${item.id}.description`, { brand })}</small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
