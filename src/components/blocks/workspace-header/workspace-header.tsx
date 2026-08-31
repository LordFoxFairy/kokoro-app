"use client"

import type { WorkspaceHeaderProps } from "./workspace-header.types"
import { WorkspaceHeaderIdentity } from "./workspace-header-identity"
import { WorkspaceHeaderSessionActions } from "./workspace-header-session-actions"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useT } from "@/i18n/context"
import { Menu } from "lucide-react"
import { DEFAULT_BRAND } from "@/config/brand"

export type { WorkspaceHeaderProps } from "./workspace-header.types"

export function WorkspaceNavigationTrigger({ className }: { className?: string } = {}) {
  const t = useT()
  const { isMobile, openMobile, state } = useSidebar()
  const expanded = isMobile ? openMobile : state === "expanded"

  return (
    <SidebarTrigger
      className={className}
      data-web-navigation-trigger="true"
      aria-label={expanded ? t("rail.collapseAria") : t("rail.expandAria")}
      aria-expanded={expanded}
      title={expanded ? t("rail.collapseAria") : t("rail.expandAria")}
    >
      <Menu aria-hidden="true" />
    </SidebarTrigger>
  )
}

export function WorkspaceHeader({
  activeId,
  shareClient,
  onOpenSettings,
  brandName = DEFAULT_BRAND.name,
  emptyWorkspace = false,
  projectWorkspace = false,
  showNavigationTrigger = false,
}: WorkspaceHeaderProps) {
  return (
    <header data-slot="workspace-header" data-empty-workspace={emptyWorkspace ? "true" : undefined} data-project-workspace={projectWorkspace ? "true" : undefined} className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-6 py-2 supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        {showNavigationTrigger ? <WorkspaceNavigationTrigger /> : null}
        <WorkspaceHeaderIdentity
          brandName={brandName}
          onOpenSettings={onOpenSettings}
        />
      </div>
      {/* A share popover belongs to one conversation. Remounting on switch
          prevents a link from session A being displayed or revoked in
          session B while the header shell itself stays mounted. */}
      <div className="flex items-center gap-1">
        <WorkspaceHeaderSessionActions
          activeId={activeId}
          emptyWorkspace={emptyWorkspace}
          onOpenSettings={onOpenSettings}
          projectWorkspace={projectWorkspace}
          shareClient={shareClient}
        />
      </div>
    </header>
  )
}
