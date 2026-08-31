"use client"

import { useEffect, useState } from "react"
import { CircleHelp, File, Shield, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import type { DataManagementClient, DataManagementSummary } from "@/data-management/client"
import { useT } from "@/i18n/context"

import styles from "./data-management-panel.module.css"

export type DataManagementView = "summary" | "authorized-apps" | "cloud-browser"

export function dataManagementViewFromHash(): DataManagementView {
  if (typeof window === "undefined") return "summary"
  if (window.location.hash.endsWith("/authorized-apps")) return "authorized-apps"
  if (window.location.hash.endsWith("/cloud-browser")) return "cloud-browser"
  return "summary"
}

export function syncDataManagementViewHash(view: DataManagementView): void {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  const suffix = view === "summary" ? "" : `/${view}`
  url.hash = `#/account/settings/library${suffix}`
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

type EmptySectionProps = {
  title: string
  empty: string
}

function EmptySection({ title, empty }: EmptySectionProps) {
  return (
    <section className={styles.emptySection}>
      <h2>{title}</h2>
      <p>{empty}</p>
    </section>
  )
}

type ManageRowProps = {
  title: string
  description: string
  onManage: () => void
}

function ManageRow({ title, description, onManage }: ManageRowProps) {
  const t = useT()
  return (
    <section className={styles.manageRow}>
      <div className={styles.manageCopy}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onManage}>{t("dataManagement.manage")}</Button>
    </section>
  )
}

function LoadingState() {
  return (
    <div className={styles.loading} role="status" aria-label="loading">
      {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className={styles.loadingRow} />)}
    </div>
  )
}

type CenteredEmptyProps = {
  icon: LucideIcon
  title: string
  description: string
}

function CenteredEmpty({ icon: Icon, title, description }: CenteredEmptyProps) {
  return (
    <div className={styles.centeredEmpty}>
      <Icon aria-hidden="true" />
      <div className={styles.centeredEmptyCopy}>
        {title ? <strong>{title}</strong> : null}
        <p>{description}</p>
      </div>
    </div>
  )
}

type DataManagementContentProps = {
  client: DataManagementClient
  view?: DataManagementView
  onViewChange?: (view: DataManagementView) => void
}

export function DataManagementContent({ client, view: controlledView, onViewChange }: DataManagementContentProps) {
  const t = useT()
  const [internalView, setInternalView] = useState<DataManagementView>(dataManagementViewFromHash)
  const view = controlledView ?? internalView
  const [summary, setSummary] = useState<DataManagementSummary | null>(null)
  const [error, setError] = useState(false)
  const [savingPersistence, setSavingPersistence] = useState(false)

  const retry = async () => {
    setError(false)
    try {
      setSummary(await client.summary())
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    let live = true
    void client.summary().then(
      (next) => { if (live) setSummary(next) },
      () => { if (live) setError(true) },
    )
    return () => { live = false }
  }, [client])
  useEffect(() => {
    const onPopState = () => {
      const next = dataManagementViewFromHash()
      setInternalView(next)
      onViewChange?.(next)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [onViewChange])

  const selectView = (next: DataManagementView) => {
    setInternalView(next)
    onViewChange?.(next)
    syncDataManagementViewHash(next)
  }

  const updatePersistence = async (enabled: boolean) => {
    if (!summary || savingPersistence) return
    const previous = summary.cloudBrowser.persistSignIn
    setSummary({ ...summary, cloudBrowser: { ...summary.cloudBrowser, persistSignIn: enabled } })
    setSavingPersistence(true)
    try {
      const result = await client.setCloudBrowserPersistence(enabled)
      setSummary((current) => current
        ? { ...current, cloudBrowser: { ...current.cloudBrowser, persistSignIn: result.persistSignIn } }
        : current)
    } catch {
      setSummary((current) => current
        ? { ...current, cloudBrowser: { ...current.cloudBrowser, persistSignIn: previous } }
        : current)
    } finally {
      setSavingPersistence(false)
    }
  }

  if (error) {
    return (
      <div className={styles.errorState} role="alert">
        <p>{t("dataManagement.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void retry()}>{t("dataManagement.retry")}</Button>
      </div>
    )
  }
  if (!summary) return <LoadingState />

  if (view === "authorized-apps") {
    return (
      <div className={styles.detailView} data-testid="authorized-apps-view">
        {summary.authorizedApps.length === 0 ? (
          <CenteredEmpty
            icon={Shield}
            title={t("dataManagement.noAuthorizedApps")}
            description={t("dataManagement.noAuthorizedAppsDescription")}
          />
        ) : (
          <div className={styles.itemList}>
            {summary.authorizedApps.map((app) => (
              <div className={styles.itemRow} key={app.id}>
                <div><strong>{app.name}</strong>{app.description ? <p>{app.description}</p> : null}</div>
                <Button variant="outline" size="sm" onClick={() => void client.revokeAuthorizedApp(app.id)}>{t("dataManagement.revoke")}</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (view === "cloud-browser") {
    return (
      <div className={styles.detailView} data-testid="cloud-browser-view">
        <section className={styles.persistenceRow}>
          <div>
            <strong>{t("dataManagement.persistSignIn")}</strong>
            <a href="/help/cloud-browser" target="_blank" rel="noreferrer">{t("dataManagement.learnMore")}</a>
          </div>
          <Switch
            checked={summary.cloudBrowser.persistSignIn}
            disabled={savingPersistence}
            aria-label={t("dataManagement.persistSignIn")}
            onCheckedChange={(checked) => void updatePersistence(checked)}
          />
        </section>
        <section className={styles.cookieSection}>
          <div className={styles.cookieHeading}>
            <h2>{t("dataManagement.cookiesTitle")}</h2>
            <CircleHelp aria-hidden="true" />
          </div>
          {summary.cloudBrowser.sites.length === 0 ? (
            <CenteredEmpty
              icon={File}
              title=""
              description={t("dataManagement.cookiesEmpty")}
            />
          ) : (
            <div className={styles.itemList}>
              {summary.cloudBrowser.sites.map((site) => (
                <div className={styles.itemRow} key={site.id}>
                  <strong>{site.domain}</strong>
                  <Button variant="outline" size="sm" onClick={() => void client.removeCloudBrowserSite(site.id)}>{t("dataManagement.remove")}</Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className={styles.summary} data-testid="data-management-summary">
      <EmptySection title={t("dataManagement.sharedTasks")} empty={t("dataManagement.noSharedTasks")} />
      <EmptySection title={t("dataManagement.sharedFiles")} empty={t("dataManagement.noSharedFiles")} />
      <EmptySection title={t("dataManagement.archivedTasks")} empty={t("dataManagement.noArchivedTasks")} />
      <ManageRow title={t("dataManagement.authorizedApps")} description={t("dataManagement.authorizedAppsDescription")} onManage={() => selectView("authorized-apps")} />
      <ManageRow title={t("dataManagement.cloudBrowser")} description={t("dataManagement.cloudBrowserDescription")} onManage={() => selectView("cloud-browser")} />
    </div>
  )
}
