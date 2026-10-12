"use client"

import { Globe, Plus } from "lucide-react"

import { useT } from "@/i18n/context"
import { Button } from "@/components/ui/button"

import styles from "./settings-sections.module.css"

function DeploymentWebsiteIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M12.208 2.625c0-.598-.365-.833-.541-.833H2.333c-.176 0-.541.235-.541.833v8.75c0 .598.365.833.541.833h9.334c.176 0 .541-.235.541-.833v-8.75Zm1.25 8.75c0 1.013-.679 2.083-1.791 2.083H2.333c-1.112 0-1.791-1.07-1.791-2.083v-8.75C.542 1.612 1.221.542 2.333.542h9.334c1.112 0 1.791 1.07 1.791 2.083v8.75Z" />
      <path d="M12.444 3.306a.583.583 0 1 1 0 1.166H1.556a.583.583 0 1 1 0-1.166h10.888ZM5.032 6.588a.583.583 0 0 1 .825.824l-.754.755.754.754a.583.583 0 0 1-.825.825L3.865 8.579a.583.583 0 0 1 0-.825l1.167-1.166ZM8.968 6.588a.583.583 0 0 0-.825.824l.754.755-.754.754a.583.583 0 0 0 .825.825l1.167-1.167a.583.583 0 0 0 0-.825L8.968 6.588Z" />
    </svg>
  )
}

function DeploymentAppIcon() {
  return (
    <svg viewBox="0 0 21.068 29.068" fill="currentColor" aria-hidden="true">
      <path d="M10.547 21.333a1.2 1.2 0 1 1-.013 2.401 1.2 1.2 0 0 1 .013-2.401ZM17.201 0a3.867 3.867 0 0 1 3.867 3.867v21.334a3.867 3.867 0 0 1-3.867 3.867H3.867A3.867 3.867 0 0 1 0 25.201V3.867A3.867 3.867 0 0 1 3.867 0h13.334ZM3.867 2.401c-.81 0-1.466.656-1.466 1.466v21.334c0 .81.656 1.466 1.466 1.466h13.334c.81 0 1.466-.656 1.466-1.466V3.867c0-.81-.656-1.466-1.466-1.466H3.867Z" />
    </svg>
  )
}

export function DeploymentSettingsCard({
  onStart,
  onBuyDomain,
}: {
  onStart?: (kind: "website" | "app") => void
  onBuyDomain?: () => void
}) {
  const t = useT()
  const sections = [
    { key: "website", title: t("settings.deploymentWebsites"), empty: t("settings.deploymentNoWebsites"), action: t("settings.createNow"), icon: DeploymentWebsiteIcon },
    { key: "app", title: t("settings.deploymentApps"), empty: t("settings.deploymentNoApps"), action: t("settings.createNow"), icon: DeploymentAppIcon },
    { key: "domain", title: t("settings.deploymentDomains"), empty: t("settings.deploymentNoDomains"), action: t("settings.buyNow"), icon: Globe },
  ] as const

  return (
    <div className={styles.deploymentSettings} data-testid="settings-deployment">
      {sections.map(({ key, title, empty, action, icon: Icon }) => (
        <section key={key} className={styles.deploymentSection} data-deployment-kind={key}>
          <h2>{title}</h2>
          <div className={styles.deploymentEmpty}>
            <Icon aria-hidden="true" />
            <span>{empty}</span>
            <Button type="button" variant="ghost" onClick={() => key === "domain" ? onBuyDomain?.() : onStart?.(key)}>
              <Plus aria-hidden="true" />
              {action}
            </Button>
          </div>
        </section>
      ))}
    </div>
  )
}
