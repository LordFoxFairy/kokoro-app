"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { useT } from "@/i18n/context"
import { CalendarDays, ChevronRight, CircleHelp, Sparkles } from "lucide-react"
import type { SettingsTab } from "@/ui/settings/settings-modal"

import styles from "./workspace-header-popovers.module.css"

type WorkspaceHeaderUpgradeActionProps = {
  emptyWorkspace: boolean
  onOpenSettings?: (tab: SettingsTab) => void
}

export function WorkspaceHeaderUpgradeAction({
  emptyWorkspace,
  onOpenSettings,
}: WorkspaceHeaderUpgradeActionProps) {
  const t = useT()

  if (emptyWorkspace) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="home-credits"
            data-home-credits="true"
            aria-label={t("settings.creditsTitle")}
          >
            <Sparkles data-icon="inline-start" aria-hidden="true" />
            <span aria-hidden="true">1,000</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={4} className={styles.creditsPopover}>
          <header className={styles.creditsHeader}>
            <strong>{t("billing.freeTier")}</strong>
            <Button type="button" size="sm" onClick={() => onOpenSettings?.("subscription")}>
              {t("firstSite.upgrade")}
            </Button>
          </header>
          <Separator />
          <div className={styles.creditsBody}>
            <div className={styles.creditRow}>
              <div className={styles.creditLabel}>
                <Sparkles aria-hidden="true" />
                <strong>{t("settings.creditsMenu")}</strong>
                <CircleHelp aria-hidden="true" />
              </div>
              <strong>1,000</strong>
              <span>{t("settings.freeCredits")}</span>
              <span>1,000</span>
            </div>
            <div className={styles.creditRow}>
              <div className={styles.creditLabel}>
                <CalendarDays aria-hidden="true" />
                <strong>{t("billing.dailyRefresh")}</strong>
                <CircleHelp aria-hidden="true" />
              </div>
              <strong>300</strong>
              <span className={styles.creditHint}>{t("billing.dailyRefreshHint", { time: "00:00", credits: 300 })}</span>
            </div>
          </div>
          <button type="button" className={styles.usageLink} onClick={() => onOpenSettings?.("credits")}>
            <span>{t("header.viewUsage")}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="workspace-upgrade"
      data-workspace-upgrade="true"
      aria-label={t("firstSite.upgrade")}
      onClick={() => onOpenSettings?.("subscription")}
      disabled={!onOpenSettings}
    >
      <Sparkles data-icon="inline-start" aria-hidden="true" />
      {t("firstSite.upgrade")}
    </Button>
  )
}
