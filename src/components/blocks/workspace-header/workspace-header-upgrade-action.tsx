"use client"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import { Sparkles } from "lucide-react"
import type { SettingsTab } from "@/ui/settings/settings-modal"

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="home-credits"
        data-home-credits="true"
        aria-label={t("settings.creditsTitle")}
        onClick={() => onOpenSettings?.("credits")}
        disabled={!onOpenSettings}
      >
        <Sparkles data-icon="inline-start" aria-hidden="true" />
        <span>{t("settings.creditsMenu")}</span>
      </Button>
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
