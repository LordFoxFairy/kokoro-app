import type { SessionClient } from "@/engine/client"
import type { SettingsTab } from "@/ui/settings/settings-modal"

export type WorkspaceHeaderProps = {
  activeId: string | null
  shareClient: Pick<SessionClient, "createShare" | "revokeShare">
  onOpenSettings?: (tab: SettingsTab) => void
  brandName?: string
  emptyWorkspace?: boolean
  projectWorkspace?: boolean
  showNavigationTrigger?: boolean
}

export type WorkspaceHeaderIdentityProps = Pick<
  WorkspaceHeaderProps,
  "brandName" | "onOpenSettings"
>

export type WorkspaceHeaderActionProps = Pick<
  WorkspaceHeaderProps,
  "activeId" | "emptyWorkspace" | "onOpenSettings" | "projectWorkspace" | "shareClient"
>
