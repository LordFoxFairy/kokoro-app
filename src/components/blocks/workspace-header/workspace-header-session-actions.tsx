"use client"

import type { WorkspaceHeaderActionProps } from "./workspace-header.types"

import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"
import { BarChart3, FileText, MoreHorizontal } from "lucide-react"

import { ShareButton } from "@/ui/share/share-button"
import { WorkspaceHeaderProjectMenu } from "./workspace-header-project-menu"
import { WorkspaceHeaderProjectShare } from "./workspace-header-project-share"
import { WorkspaceHeaderUpgradeAction } from "./workspace-header-upgrade-action"

export function WorkspaceHeaderSessionActions({
  activeId,
  emptyWorkspace = false,
  onOpenSettings,
  projectWorkspace = false,
  shareClient,
}: WorkspaceHeaderActionProps) {
  const t = useT()

  if (projectWorkspace) {
    return (
      <>
        {!emptyWorkspace ? (
          <WorkspaceHeaderUpgradeAction emptyWorkspace={false} onOpenSettings={onOpenSettings} />
        ) : null}
        <WorkspaceHeaderProjectShare />
        {!emptyWorkspace ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 min-h-8"
              aria-label={t("settings.creditsTitle")}
              onClick={() => onOpenSettings?.("credits")}
            >
              <BarChart3 aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 min-h-8"
              aria-label={t("settings.capLibrary")}
              onClick={() => onOpenSettings?.("library")}
            >
              <FileText aria-hidden="true" />
            </Button>
          </>
        ) : null}
        <WorkspaceHeaderProjectMenu onOpenSettings={onOpenSettings} />
      </>
    )
  }

  if (emptyWorkspace) {
    return <WorkspaceHeaderUpgradeAction emptyWorkspace onOpenSettings={onOpenSettings} />
  }

  return (
    <>
      <WorkspaceHeaderUpgradeAction emptyWorkspace={false} onOpenSettings={onOpenSettings} />
      {activeId !== null ? <ShareButton key={activeId} client={shareClient} sessionId={activeId} /> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 min-h-8"
        aria-label={t("settings.creditsTitle")}
        onClick={() => onOpenSettings?.("credits")}
      >
        <BarChart3 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 min-h-8"
        aria-label={t("settings.capLibrary")}
        onClick={() => onOpenSettings?.("library")}
      >
        <FileText aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 min-h-8"
        aria-label={t("settings.capSkills")}
        onClick={() => onOpenSettings?.("skills")}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>
    </>
  )
}
